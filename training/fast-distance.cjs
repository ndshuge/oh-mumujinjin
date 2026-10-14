"use strict";
// Training-side memo cache for engine.computerDistance.
//
// Why this is safe: computerDistance(start,goal,walls,lock) is a pure function
// of its arguments plus the static rock layout. Memoising it cannot change any
// return value, so search decisions, policy distributions and every recorded
// digest stay bit-identical. game.js is NOT modified; the wrapping happens at
// the training boundary only.
//
// The cache key must include the rock generation, otherwise values leak across
// engine.setRocks() calls. Keys are cleared on setRocks and, if the cache grows
// past `limit`, on size overflow. Both evictions only cost speed, never
// correctness.
const CAMPS_SLOT=new WeakMap();

function install(engine,options={}){
 const limit=Math.max(1000,options.limit||400000);
 const original=engine.computerDistance;
 const cache=new Map();
 const stats={calls:0,hits:0,misses:0,clears:0,size:0,generation:0};
 let generation=0;

 // Identify the two camp goal arrays by reference; anything else falls back to
 // a structural key so behaviour stays correct for unexpected callers.
 function goalId(goal){
  if(goal===engine.terrain.CAMPS[0])return "0";
  if(goal===engine.terrain.CAMPS[1])return "1";
  return "?"+goal.map(p=>p.x+","+p.y).join(";");
 }
 function wallsKey(walls){
  if(!walls||!walls.length)return "";
  let out="";
  for(const w of walls)out+=w.o+w.x+","+w.y+";";
  return out;
 }
 function fast(start,goal,walls,lock){
  stats.calls++;
  const key=start.x+","+start.y+"|"+(lock?lock.x+","+lock.y:"-")+"|"+goalId(goal)+"|"+wallsKey(walls);
  const hit=cache.get(key);
  if(hit!==undefined){stats.hits++;return hit;}
  const value=original.call(engine,start,goal,walls,lock);
  if(cache.size>=limit){cache.clear();stats.clears++;}
  cache.set(key,value);
  stats.misses++;
  stats.size=cache.size;
  return value;
 }
 Object.defineProperty(fast,"name",{value:"computerDistance"});
 engine.computerDistance=fast;

 const originalSetRocks=engine.setRocks;
 engine.setRocks=function(...args){
  generation++;stats.generation=generation;
  cache.clear();stats.clears++;stats.size=0;
  return originalSetRocks.apply(engine,args);
 };
 return {stats,clear(){cache.clear();stats.clears++;stats.size=0;}};
}

module.exports={install};
