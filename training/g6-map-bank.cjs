"use strict";
// Map-bank loading plus the leakage preflight shared by every self-play driver.
// Training layouts must never coincide with an evaluation bank: if a training
// layout also appears in a sealed exam, that exam stops measuring generalisation.
const crypto=require("crypto"),fs=require("fs"),path=require("path");
const signature=rocks=>rocks.map(p=>p.x+","+p.y).sort().join("|");

function load(file){
 if(!fs.existsSync(file))throw Error("Map bank missing: "+file);
 if(file.endsWith(".jsonl"))return fs.readFileSync(file,"utf8").split("\n").filter(Boolean).map(JSON.parse);
 const json=JSON.parse(fs.readFileSync(file,"utf8"));
 const list=json.maps||json.items||json;
 if(!Array.isArray(list))throw Error("Unrecognised map bank shape: "+file);
 return list;
}

function fingerprintsOf(file){
 if(!fs.existsSync(file))return null;
 if(file.endsWith(".jsonl"))return new Set(fs.readFileSync(file,"utf8").split("\n").filter(Boolean)
  .map(l=>{const r=JSON.parse(l);return signature(r.rocks||(r.map&&r.map.rocks)||[]);}));
 const json=JSON.parse(fs.readFileSync(file,"utf8"));
 const list=json.maps||json.items||[];
 return new Set(list.map(m=>signature(m.rocks||[])));
}

const EVALUATION_BANKS=[
 "output/s0-records-120-10000.jsonl",
 "output/lab/g4/novel-sealed-20261030-500.jsonl",
 "output/lab/g4/fresh-map-bank-20261015-120.json",
];

function audit(bank,root,bankFile){
 const audit=[];
 for(const rel of EVALUATION_BANKS){
  const file=path.join(root,rel);
  if(path.resolve(file)===path.resolve(bankFile))continue;
  const set=fingerprintsOf(file);
  if(!set)continue;
  const overlap=bank.filter(m=>set.has(signature(m.rocks||[]))).length;
  audit.push({file:rel,layouts:set.size,overlap});
  if(overlap>0)throw Error("Training bank overlaps evaluation layouts: "+rel+" ("+overlap+")");
 }
 return audit;
}

function digest(file){return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");}

module.exports={load,audit,digest,signature};
