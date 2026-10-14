"use strict";
// Create a fresh, reproducible map-only benchmark bank, explicitly excluding
// every layout from the original S0 records. No match tuning uses these maps.
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const {engine}=require("../train.cjs");
const seed=Number(process.argv[2]??20261015),count=Number(process.argv[3]??120);
if(!Number.isInteger(seed)||!Number.isInteger(count)||count<30||count>1000)throw Error("Usage: fresh-map-bank.cjs seed count(30..1000)");
const outputDir=path.join(__dirname,"..","output","lab","g4");
fs.mkdirSync(outputDir,{recursive:true});
const file=path.join(outputDir,"fresh-map-bank-"+seed+"-"+count+".json"),
 hashFile=file.replace(/\.json$/,".lock.json");
if(fs.existsSync(file)||fs.existsSync(hashFile))throw Error("Fresh benchmark already exists; refuse overwrite");
const canonical=m=>m.rocks.map(p=>p.x+","+p.y).sort().join("|");
const previous=new Set(),source=fs.readFileSync(path.join(__dirname,"..","output","s0-records-120-10000.jsonl"),"utf8");
for(const line of source.split("\n")){
 if(!line)continue;
 previous.add(canonical(JSON.parse(line).map));
}
const exclude=new Set();
for(const camps of engine.terrain.CAMPS)for(const p of camps)exclude.add(p.x+","+p.y);
for(const p of [...engine.terrain.ICE,...engine.terrain.BOOST])exclude.add(p.x+","+p.y);
for(const g of engine.terrain.PORTALS)for(const p of [g.a,g.b])exclude.add(p.x+","+p.y);
const free=[];for(let y=0;y<13;y++)for(let x=0;x<9;x++)if(!exclude.has(x+","+y))free.push({x,y});
let state=seed>>>0;const rand=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
const pick=n=>Math.floor(rand()*n),categories=["sparse","medium","dense"],bank=[],used=new Set(),tries=[];
for(let i=0;i<count;i++){
 const category=categories[i%3];
 let found=null,attempts=0;
 while(attempts++<2000){
  const n=category==="sparse"?1+pick(5):category==="medium"?6+pick(6):12+pick(6);
  const arr=free.slice();
  for(let j=arr.length-1;j>0;j--){const k=pick(j+1);[arr[j],arr[k]]=[arr[k],arr[j]];}
  const m=engine.cleanMap({version:1,name:"g4-fresh-"+String(seed)+"-"+String(i+1).padStart(4,"0"),rocks:arr.slice(0,n)});
  if(!m)continue;
  const sig=canonical(m);
  if(previous.has(sig)||used.has(sig))continue;
  used.add(sig);found={...m,density:category,layoutFingerprint:crypto.createHash("sha256").update(sig).digest("hex")};break;
 }
 if(!found)throw Error("No new legal map for "+category+" after "+attempts+" trials");
 bank.push(found);tries.push(attempts);
}
const payload={schema:"g4-map-benchmark-1",createdAt:new Date().toISOString(),seed,
 split:"fresh-evaluation-only",rules:"game.js cleanMap",excludeHistorical:previous.size,
 count:bank.length,categories:Object.fromEntries(categories.map(k=>[k,bank.filter(m=>m.density===k).length])),
 historicalOverlap:0,uniqueLayouts:used.size,maps:bank};
const encoded=JSON.stringify(payload,null,2);
const hash=crypto.createHash("sha256").update(encoded,"utf8").digest("hex");
const lock={schema:"g4-fresh-map-lock-v1",file:path.basename(file),sha256:hash,bytes:Buffer.byteLength(encoded),
 mapCount:count,seed,categories:payload.categories,historicalOverlap:0,
 status:"frozen-before-candidate-run",promoted:false};
fs.writeFileSync(file,encoded);fs.writeFileSync(hashFile,JSON.stringify(lock,null,2));
console.log("G4_FRESH_MAP_BANK",JSON.stringify({file,sha256:hash.slice(0,20),count,
 densities:payload.categories,historicalExcluded:previous.size,overlap:0,
 trialsMax:Math.max(...tries)}));
