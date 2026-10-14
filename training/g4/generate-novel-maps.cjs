"use strict";
// After a model is frozen, make NEW deterministic board-layout exams. None of
// the S0 training or heldOut layouts may appear in this bank. No moves stored.
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const {engine}=require("../train.cjs");
const [seedS="20261114",countS="12",mode="pilot",frozenGenome=""]=process.argv.slice(2),
 seed=Number(seedS),amount=Number(countS);
if(!Number.isInteger(seed)||!Number.isInteger(amount)||amount<1||amount>5000||
 !["pilot","sealed"].includes(mode))throw Error("Usage: generate-novel-maps.cjs SEED COUNT pilot|sealed [SHA256 frozen genome]");
if(mode==="sealed"&&!/^[a-f0-9]{64}$/.test(frozenGenome))throw Error("Sealed test requires a frozen candidate SHA256");
const old=fs.readFileSync(path.join(__dirname,"..","output","s0-records-120-10000.jsonl"),"utf8");
const sig=pts=>pts.map(p=>p.x+","+p.y).sort().join("|");
const excludedFingerprints=new Set();
for(const l of old.split("\n"))if(l){const r=JSON.parse(l);excludedFingerprints.add(sig(r.map.rocks));}
const banned=new Set();
for(const camp of engine.terrain.CAMPS)for(const cell of camp)banned.add(cell.x+","+cell.y);
for(const block of [...engine.terrain.ICE,...engine.terrain.BOOST])banned.add(block.x+","+block.y);
for(const portal of engine.terrain.PORTALS)for(const end of [portal.a,portal.b])banned.add(end.x+","+end.y);
const pool=[];
for(let y=0;y<13;y++)for(let x=0;x<9;x++)if(!banned.has(x+","+y))pool.push({x,y});
let rnd=seed>>>0;const random=()=>((rnd=(Math.imul(rnd,1664525)+1013904223)>>>0)/4294967296);
function mapFor(id,tier){
 const n=tier==="sparse"?2+Math.floor(random()*4):tier==="medium"?6+Math.floor(random()*6):12+Math.floor(random()*6);
 const shuffled=pool.slice();
 for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
 return engine.cleanMap({version:1,name:"unseen-"+seed+"-"+id,rocks:shuffled.slice(0,n)});
}
const items=[],seen=new Set(),start=Date.now();
for(let attempt=0;items.length<amount&&attempt<amount*250;attempt++){
 const tier=["sparse","medium","dense"][items.length%3],
 map=mapFor(items.length,tier);
 if(!map)continue;
 const signature=sig(map.rocks);
 if(seen.has(signature)||excludedFingerprints.has(signature))continue;
 engine.setRocks(map.rocks);
 const starts=engine.terrain.CAMPS.map(c=>c[1]);
 if(starts.some((p,i)=>!Number.isFinite(engine.computerDistance(p,engine.terrain.CAMPS[1-i],[],null))))continue;
 items.push({version:1,name:map.name,tier,rocks:map.rocks,hash:crypto.createHash("sha256").update(signature).digest("hex")});
 seen.add(signature);
}
if(items.length!==amount)throw Error("Unable to find "+amount+" new playable layouts");
const dest=path.join(__dirname,"..","output","lab","g4"),
 key="novel-"+mode+"-"+seed+"-"+amount,filename=path.join(dest,key+".jsonl"),report=path.join(dest,key+".manifest.json");
if(fs.existsSync(filename)||fs.existsSync(report))throw Error("Map bank already exists, refuse overwrite");
const text=items.map(m=>JSON.stringify(m)).join("\n")+"\n";
fs.writeFileSync(filename,text);
const manifest={schema:"mumu-newmaps-v1",mode,seed,requested:amount,maps:items.length,
 oldUniqueLayouts:excludedFingerprints.size,overlapOld:0,duplicates:0,
 strata:items.reduce((o,m)=>(o[m.tier]++,o),{sparse:0,medium:0,dense:0}),
 layoutDigest:crypto.createHash("sha256").update(text).digest("hex"),
 candidateFingerprint:mode==="sealed"?frozenGenome:null,
 noAIActionData:true,elapsedMs:Date.now()-start};
fs.writeFileSync(report,JSON.stringify(manifest,null,2));
console.log("NOVEL_MAPS_CREATED",JSON.stringify({mode,seed,maps:items.length,tiers:manifest.strata,
 priorOverlap:0,digest:manifest.layoutDigest.slice(0,16),manifest:report}));
