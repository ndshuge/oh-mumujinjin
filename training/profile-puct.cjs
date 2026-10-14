"use strict";
// Instrumented profile of the PUCT node-expansion hotspot. Wraps the engine
// functions that puct.cjs calls and reports call counts plus exclusive time.
// Read-only: no artefact is written, no search code is modified.
const {engine}=require("./train.cjs"),puct=require("./puct.cjs"),policy=require("./policy.cjs");
const fs=require("fs"),path=require("path");
const bank=fs.readFileSync(path.join(__dirname,"output/lab/g4/novel-pilot-20261014-60.jsonl"),"utf8")
 .split("\n").filter(Boolean).map(JSON.parse);

const stats=new Map();
function wrap(obj,name){
 const orig=obj[name];
 stats.set(name,{calls:0,ms:0});
 obj[name]=function(...args){
  const s=stats.get(name),t=process.hrtime.bigint();
  try{return orig.apply(obj,args);}
  finally{s.calls++;s.ms+=(Number(process.hrtime.bigint()-t)/1e6);}
 };
 return orig;
}
wrap(engine,"hellCandidates");
wrap(engine,"movementOptions");
wrap(engine,"hellApply");
wrap(engine,"hellWallAllowed");
wrap(engine,"computerDistance");
wrap(engine,"hellEvaluate");
wrap(policy,"actions");

const simulations=Number(process.argv[2]||64),positions=Number(process.argv[3]||8);
const total={ms:0,sims:0};
let samplePositions=0;
for(let g=0;g<positions;g++){
 const map=bank[g%bank.length];engine.setRocks(map.rocks);
 let s={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]};
 for(let ply=0;ply<12;ply++){
  const who=ply%2;
  if(!engine.movementOptions(s.players[who],s.dirs[who],s.walls).length)break;
  const t=process.hrtime.bigint();
  const r=puct.search(engine,s,who,{simulations,timeMs:200,deterministic:true});
  total.ms+=Number(process.hrtime.bigint()-t)/1e6;total.sims+=r.simulations;samplePositions++;
  if(!r.action)break;
  s=engine.hellApply(s,who,r.action);
 }
}
const rows=[...stats.entries()].map(([name,v])=>({name,calls:v.calls,ms:+v.ms.toFixed(1),usPerCall:+(v.ms*1000/Math.max(1,v.calls)).toFixed(1)})).sort((a,b)=>b.ms-a.ms);
const wallMs=rows.filter(r=>r.name!=="actions").reduce((a,r)=>a+r.ms,0);
console.log(JSON.stringify({
 positions:samplePositions,simulations,totalSearchMs:+total.ms.toFixed(1),
 msPerPosition:+(total.ms/samplePositions).toFixed(1),
 msPerSim:+(total.ms/Math.max(1,total.sims)).toFixed(2),
 instrumentedMs:+wallMs.toFixed(1),
 instrumentedShareOfSearch:+(wallMs/total.ms*100).toFixed(0)+"%",
 breakdown:rows,
},null,2));
