"use strict";
// A/B benchmark for the computerDistance memo cache.
// Runs the identical deterministic search workload twice -- once uncached, once
// with training/fast-distance.cjs installed -- and demands byte-identical move
// sequences. The speed-up only counts if the decisions are unchanged.
const {engine}=require("./train.cjs"),puct=require("./puct.cjs"),fast=require("./fast-distance.cjs");
const fs=require("fs"),path=require("path");
const bank=fs.readFileSync(path.join(__dirname,"output/lab/g4/novel-pilot-20261014-60.jsonl"),"utf8")
 .split("\n").filter(Boolean).map(JSON.parse);
const simulations=Number(process.argv[2]||64),games=Number(process.argv[3]||4),plies=Number(process.argv[4]||12);

function workload(){
 const moves=[],sims=[];
 for(let g=0;g<games;g++){
  const map=bank[g%bank.length];engine.setRocks(map.rocks);
  let s={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]};
  for(let ply=0;ply<plies;ply++){
   const who=ply%2;
   if(!engine.movementOptions(s.players[who],s.dirs[who],s.walls).length)break;
   const r=puct.search(engine,s,who,{simulations,timeMs:200,deterministic:true});
   if(!r.action)break;
   moves.push(JSON.stringify(r.action)+"#"+(r.action.wall?5:s.left[who]));
   sims.push(r.simulations);
   s=engine.hellApply(s,who,r.action);
   if(engine.terrain.CAMPS[1-who].some(p=>p.x===s.players[who].x&&p.y===s.players[who].y))break;
  }
 }
 return {moves,sims};
}

const t0=process.hrtime.bigint();
const baseline=workload();
const baseMs=Number(process.hrtime.bigint()-t0)/1e6;

const handle=fast.install(engine);
const t1=process.hrtime.bigint();
const cached=workload();
const cachedMs=Number(process.hrtime.bigint()-t1)/1e6;

const identical=JSON.stringify(baseline.moves)===JSON.stringify(cached.moves)&&JSON.stringify(baseline.sims)===JSON.stringify(cached.sims);
const s=handle.stats;
console.log(JSON.stringify({
 simulations,games,plies,decisions:baseline.moves.length,
 identicalDecisions:identical,
 baselineMs:+baseMs.toFixed(1),cachedMs:+cachedMs.toFixed(1),
 speedup:+(baseMs/cachedMs).toFixed(2),
 distanceCalls:s.calls,cacheHits:s.hits,cacheMisses:s.misses,
 hitRate:+(s.hits/Math.max(1,s.calls)*100).toFixed(1)+"%",
 peaksCacheSize:s.size,clears:s.clears,
 msPerDecisionBaseline:+(baseMs/baseline.moves.length).toFixed(1),
 msPerDecisionCached:+(cachedMs/cached.moves.length).toFixed(1),
},null,2));
if(!identical){console.error("MISMATCH: cached run changed decisions");process.exitCode=1;}
