"use strict";
// G6 self-play core. One game, fully deterministic and independent of any other
// game, so games can be sharded across processes without changing a byte.
//
// Determinism contract:
//  - the per-game RNG is derived from (seed, gameIndex) only;
//  - every search call runs on a fixed simulation budget;
//  - nothing reads shared mutable state except engine ROCKS, which the caller
//    sets from the same map every time.
// A game's output therefore depends on its index alone -- never on execution
// order, wall-clock speed or which worker happened to run it.

function makeRand(seed,gameIndex){
 let s=(seed+Math.imul(gameIndex,2654435761))>>>0;
 return()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);
}

function playGame(engine,puct,policy,bank,gameIndex,opts){
 const {seed,simulations,plyCap}=opts;
 const rand=makeRand(seed,gameIndex);
 const map=bank[Math.floor(rand()*bank.length)];
 engine.setRocks(map.rocks);
 const opening=rand()<0.5?0:1;
 const same=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
 let s={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]};
 let winner=null,ending="cap",plies=0,degenerate=0;
 const samples=[],seen=new Map();
 for(let ply=0;ply<plyCap;ply++){
  const who=(ply+opening)%2;
  if(!engine.movementOptions(s.players[who],s.dirs[who],s.walls).length){winner=1-who;ending="noMovement";break;}
  const result=puct.search(engine,s,who,{simulations,timeMs:200,deterministic:true});
  if(!result.action)throw Error("Null action at game "+gameIndex+" ply "+ply);
  const vec=result.policy;
  if(!Array.isArray(vec)||vec.length!==policy.SIZE)throw Error("Policy length violation at game "+gameIndex+" ply "+ply);
  const total=vec.reduce((a,b)=>a+b,0);
  if(!(total>0))degenerate++;
  else samples.push({
   gameIndex,ply,side:who,opening,mapName:map.name,mapHash:map.hash||null,mapTier:map.tier||map.density||null,
   state:JSON.parse(JSON.stringify(s)),
   policy:vec.map(v=>Math.round(v*1e5)/1e5),
   policyVersion:policy.VERSION,policyMass:Math.round(total*1e5)/1e5,
   visits:result.simulations,nodes:result.nodes,
   value:null,source:"g6-puct-selfplay-v2",
  });
  s=engine.hellApply(s,who,result.action);
  plies++;
  if(engine.terrain.CAMPS[1-who].some(g=>same(g,s.players[who]))){winner=who;ending="goal";break;}
  const key=JSON.stringify([1-who,s.players,s.dirs,s.left,s.walls.map(w=>w.o+":"+w.x+":"+w.y).sort()]);
  const n=(seen.get(key)||0)+1;seen.set(key,n);
  if(n===3){ending="repetition";break;}
 }
 for(const sample of samples)sample.value=sample.side===winner?1:winner===null?0:-1;
 return {gameIndex,mapName:map.name,winner,ending,plies,degenerate,samples};
}

module.exports={playGame,makeRand};
