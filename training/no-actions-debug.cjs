"use strict";
const fs=require("fs"),path=require("path");
const {engine}=require("./train.cjs");
const {baseline}=require("./strong-arena.cjs"),strong=require("../strong-search.js");
const targets=[["map-3656",0],["map-4136",1],["map-5479",0],["map-5577",0],["map-8177",1]];
const dataset=fs.readFileSync(path.join(__dirname,"output","s0-records-120-10000.jsonl"),"utf8").split("\n");
const maps=new Map();const needed=new Set(targets.map(p=>p[0]));
for(const line of dataset){
 if(!line)continue;
 const map=JSON.parse(line).map;
 if(needed.has(map.name)){maps.set(map.name,map);if(maps.size===needed.size)break;}
}
if(maps.size!==needed.size)throw Error("missing maps");
const report=[];
for(const [mapName,seat] of targets){
 const map=maps.get(mapName);engine.setRocks(map.rocks);
 let state={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]};
 const kinds=seat===0?["strong","baseline"]:["baseline","strong"],trail=[],visited=new Map();
 let ending="cap",win=null;
 for(let ply=0;ply<100;ply++){
  const who=ply%2;
  const act=kinds[who]==="strong"?strong.choose(engine,state,who,{depth:2,timeMs:220}).action:baseline(state,who);
  if(!act){
   const anyCandidate=engine.hellCandidates(state,who),walk=engine.movementOptions(state.players[who],state.dirs[who],state.walls);
   let possibleWalls=0;const examples=[];
   for(let y=0;y<12;y++)for(let x=0;x<8;x++)for(const o of ["h","v"]){
    const w={x,y,o};
    if(engine.hellWallAllowed(state,w,who)){possibleWalls++;if(examples.length<5)examples.push(w);}
   }
   const theirDistance=engine.computerDistance(state.players[who],engine.terrain.CAMPS[1-who],state.walls,state.dirs[who]);
   ending="no-actions";win=1-who;
   report.push({mapName,seat,ply,actor:kinds[who],state,walks:walk.length,nearCandidates:anyCandidate.length,possibleWalls,examples,theirDistance,trail:trail.slice(-8)});
   break;
  }
  trail.push({ply,actor:kinds[who],action:act.wall?{wall:act.wall}:{p:act.p,warp:!!act.warp}});
  state=engine.hellApply(state,who,act);
  if(engine.terrain.CAMPS[1-who].some(g=>g.x===state.players[who].x&&g.y===state.players[who].y)){ending="goal";win=who;break;}
  const key=JSON.stringify([1-who,state.players,state.dirs,state.walls,state.left]);visited.set(key,(visited.get(key)||0)+1);
  if(visited.get(key)>=3){ending="repetition";break;}
 }
 if(ending!=="no-actions")report.push({mapName,seat,ending,win,trailLength:trail.length});
 console.log("DIAG",JSON.stringify(report.at(-1)).slice(0,8000));
}
fs.writeFileSync(path.join(__dirname,"output","no-actions-diagnosis.json"),JSON.stringify(report,null,2));
