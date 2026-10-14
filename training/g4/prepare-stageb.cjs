"use strict";
// Stage B is a developmental comparison, not a deployment gate.
// Reuse the existing frozen-V1.1 champion-series and its rules referee.
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const here=__dirname,base=path.resolve(here,"..");
const advicePath=path.join(base,"output","lab","g4","STAGED_SELECTION_ADVICE_G0.json");
const populationPath=path.join(here,"population-g0-64.json");
const dest=path.join(base,"league","population-g4-stageb.json");
const receipt=path.join(base,"output","lab","g4","STAGEB_G0_LOCK.json");
const advice=JSON.parse(fs.readFileSync(advicePath,"utf8"));
const origin=JSON.parse(fs.readFileSync(populationPath,"utf8"));
if(advice.basedOn?.complete!==true||advice.basedOn.matches!==384||
 advice.basedOn.illegal!==0||advice.shortlistIsValid!==true||
 advice.shortlist.length!==16||origin.generation!==0)throw Error("Stage A not accepted");
const choose=new Set(advice.shortlist.map(x=>x.id));
if(choose.size!==16)throw Error("Duplicate stage B candidate");
const agents=origin.agents.filter(x=>choose.has(x.id));
const byFamily={search:0,"rule-puct":0,neural:0,hybrid:0};
for(const x of advice.shortlist){if(!(x.family in byFamily))throw Error("Unknown family");
 byFamily[x.family]++;}
if(Object.values(byFamily).some(x=>x!==4)||agents.length!==16)
 throw Error("Stage B must retain four per family");
const source=fs.readFileSync(path.join(base,"output","s0-records-120-10000.jsonl"),"utf8");
const unique=new Set(),maps=[];
for(const line of source.split("\n")){
 if(!line)continue;
 const item=JSON.parse(line);if(item.split!=="heldOut")continue;
 const key=item.map.rocks.map(p=>p.x+","+p.y).sort().join("|");
 if(unique.has(key))continue;unique.add(key);maps.push(item.map);
}
const offset=702,pairs=12,budgetMs=260,window=maps.slice(offset,offset+pairs);
if(window.length!==12)throw Error("Stage B map bank incomplete");
const density={sparse:0,medium:0,dense:0};
for(const m of window){const n=m.rocks.length; density[n<=5?"sparse":n<=11?"medium":"dense"]++;}
if(Object.values(density).some(x=>x!==4))throw Error("Stage B map tiers unbalanced");
const digest=b=>crypto.createHash("sha256").update(b).digest("hex");
const roster={schema:"g4-stageb-roster-v1",generation:0,origin:"population-g0-64.json",
 experimentOnly:true,agents:agents.map(x=>structuredClone(x))};
const lock={stage:"S5.2",status:"development_only",rules:"game.js",source:"S0 heldOut reused for development",
 winner:"frozen-v11",candidates:agents.map(x=>x.id),candidateCount:16,
 density,offset,mapPairs:pairs,budgetMs,plannedGames:16*pairs*2,
 sourceSha256:digest(fs.readFileSync(populationPath)),
 advisorySha256:digest(fs.readFileSync(advicePath)),
 mapDigestSha256:digest(JSON.stringify(window)),rosterSha256:digest(JSON.stringify(roster)),
 command:"node training/g3/champion-series.cjs population-g4-stageb.json 12 260 702 1",
 noPromotion:true};
if(fs.existsSync(dest)||fs.existsSync(receipt))throw Error("Stage B already prepared; never overwrite");
fs.writeFileSync(dest,JSON.stringify(roster,null,2)+"\n",{flag:"wx"});
fs.writeFileSync(receipt,JSON.stringify(lock,null,2)+"\n",{flag:"wx"});
console.log("G4_STAGEB_LOCK",JSON.stringify({candidates:16,matches:384,density,lock:receipt}));
