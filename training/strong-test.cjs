"use strict";
const assert=require("assert"),{engine,mapGen}=require("./train.cjs"),strong=require("../strong-search.js");
let legal=0,maxMs=0,timeouts=0,farWalls=0;
for(let id=0;id<10;id++){
 const map=mapGen(id);engine.setRocks(map.rocks);
 let s={players:engine.terrain.CAMPS.map(p=>({...p[1]})),dirs:[null,null],walls:[],left:[5,5]};
 for(let p=0;p<2;p++){
  const got=strong.choose(engine,s,p,{depth:2,timeMs:400});
  assert(got.action,"missing action");
  if(got.action.wall)assert(engine.hellWallAllowed(s,got.action.wall,p));
  else{
   const move=got.action.move;
   assert(engine.movementOptions(s.players[p],s.dirs[p],s.walls).some(m=>m.p.x===move.p.x&&m.p.y===move.p.y&&m.d.x===move.d.x&&m.d.y===move.d.y&&m.steps===move.steps));
  }
  if(got.emergency)timeouts++;
  if(got.action.wall){
   farWalls++;
  }
  maxMs=Math.max(maxMs,got.timeMs);legal++;
  console.log("strong case",id,p,"ms",got.timeMs,"depth",got.depth,"visited",got.visited,"action",got.action.wall?"wall":"move");
 }
}
// Every player must choose a terminal win over a plausible distracting wall.
engine.setRocks([]);
for(let p=0;p<2;p++){
 const s={players:[{x:1,y:1},{x:7,y:11}],dirs:[null,null],walls:[],left:[5,5]};
 const move=strong.choose(engine,s,p,{depth:2,timeMs:500});
 const next=engine.hellApply(s,p,move.action);
 assert(engine.terrain.CAMPS[1-p].some(q=>q.x===next.players[p].x&&q.y===next.players[p].y),"missed immediate win for "+p);
}
console.log("STRONG SEARCH PASS",JSON.stringify({legal,maxMs,timeouts,farWalls}));
