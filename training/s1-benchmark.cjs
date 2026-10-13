"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert");
const {engine,mapGen}=require("./train.cjs"),policy=require("./policy.cjs"),puct=require("./puct.cjs");
const count=Math.max(10,Math.min(1500,Number(process.argv[2]||1000)));
const sim=Math.max(1,Math.min(80,Number(process.argv[3]||6)));
let tested=0,illegal=0,timeout=0,cacheHits=0,duplicates=0,visits=0;
const times=[],games=new Set();const begin=Date.now();
function same(a,b){return a.x===b.x&&a.y===b.y;}
for(let m=0;tested<count;m++){
 const map=mapGen(m);engine.setRocks(map.rocks);
 const s={players:engine.terrain.CAMPS.map(a=>({...a[1]})),dirs:[null,null],walls:[],left:[5,5]};
 for(let step=0;step<5&&tested<count;step++){
  const player=step%2;
  const before=Date.now(),result=puct.search(engine,s,player,{simulations:sim,timeMs:250});
  const ms=Date.now()-before;times.push(ms);
  const valid=policy.actions(engine,s,player),legalIDs=new Set(valid.ids);
  if(!result.action||!legalIDs.has(policy.encode(result.action)))illegal++;
  if(new Set(result.visits.map(x=>x.id)).size!==result.visits.length)duplicates++;
  if(result.simulations>sim||result.visits.reduce((a,b)=>a+b.n,0)!==result.simulations)throw Error("visit count mismatch");
  for(let i=0;i<result.policy.length;i++){
   if(!legalIDs.has(i)&&result.policy[i]!==0)throw Error("illegal policy probability");
  }
  if(ms>1000)timeout++;
  cacheHits+=result.cacheHits;visits+=result.simulations;tested++;games.add(map.name);
  // Advance with a deterministic legal step for diverse midgame states.
  let move=valid.list.filter(a=>!a.wall);
  if(!move.length)break;
  const action=move[(m+step)%move.length];
  const next=engine.hellApply(s,player,action);
  s.players=next.players;s.dirs=next.dirs;s.walls=next.walls;s.left=next.left;
 }
 if(m>count*3)throw Error("Insufficient legal positions");
}
times.sort((a,b)=>a-b);
const metric=p=>times[Math.min(times.length-1,Math.floor(p*(times.length-1)))];
const report={positions:tested,maps:games.size,simulationsPerSearch:sim,actualSimulations:visits,illegal,aliases:duplicates,over1000ms:timeout,p50Ms:metric(.5),p95Ms:metric(.95),maxMs:times.at(-1),cacheHits,elapsedMs:Date.now()-begin,policySize:policy.SIZE};
const outfile=path.join(__dirname,"output","s1-report.json");fs.writeFileSync(outfile,JSON.stringify(report,null,2));
console.log("S1 BENCH",JSON.stringify(report));
assert.strictEqual(illegal,0);assert.strictEqual(duplicates,0);assert.strictEqual(tested,count);
