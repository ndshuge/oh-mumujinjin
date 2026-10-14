"use strict";
// Genuine strong-search vs strong-search self-play. Every value label comes
// from the actual completed game's winner (or draw), not the older greedy game.
const fs=require("fs"),path=require("path");
const {engine}=require("./train.cjs"),teacher=require("../strong-search-v1.1.js"),policy=require("./policy.cjs");
const split=process.argv[2]==="heldOut"?"heldOut":"train";
const offset=Math.max(0,Number(process.argv[3]||0));
const count=Math.max(1,Math.min(40,Number(process.argv[4]||10)));
const budget=Math.max(60,Math.min(1200,Number(process.argv[5]||160)));
const rows=fs.readFileSync(path.join(__dirname,"output","s0-records-120-10000.jsonl"),"utf8").split("\n");
let unique=0;const maps=[],seen=new Set();
for(const line of rows){
 if(!line)continue;const r=JSON.parse(line);
 if(r.split!==split)continue;
 const sig=r.map.rocks.map(p=>p.x+":"+p.y).sort().join("|");
 if(seen.has(sig))continue;seen.add(sig);
 if(unique++>=offset)maps.push(r.map);
 if(maps.length===count)break;
}
if(maps.length!==count)throw Error("Not enough maps");
const samples=[],summary={split,offset,count,budget,completed:0,goal:0,draw:0,noMovement:0,illegal:0,
 moves:0,samples:0,win:[0,0],startedAt:new Date().toISOString()},begin=Date.now();
function isGoal(s,p){return engine.terrain.CAMPS[1-p].some(g=>g.x===s.players[p].x&&g.y===s.players[p].y);}
for(const [i,map] of maps.entries()){
 engine.setRocks(map.rocks);
 let state={players:engine.terrain.CAMPS.map(g=>({...g[1]})),dirs:[null,null],walls:[],left:[5,5]};
 const before=[],history=new Map();
 let winner=null,ending="draw";
 for(let ply=0;ply<110;ply++){
  const side=ply%2,legalMoves=engine.movementOptions(state.players[side],state.dirs[side],state.walls);
  if(legalMoves.length===0){winner=1-side;ending="noMovement";break;}
  const result=teacher.choose(engine,state,side,{depth:2,timeMs:budget});
  const action=result.action;
  if(!action){winner=1-side;ending="noMovement";break;}
  const valid=action.wall?engine.hellWallAllowed(state,action.wall,side):
    legalMoves.some(m=>action.move&&m.p.x===action.move.p.x&&m.p.y===action.move.p.y&&m.steps===action.move.steps&&m.d.x===action.move.d.x&&m.d.y===action.move.d.y);
  if(!valid){summary.illegal++;throw Error("Illegal teacher move game "+i+" ply "+ply);}
  if(ply%4===0||action.wall){
   before.push({state:{players:state.players.map(p=>({...p})),dirs:state.dirs.slice(),left:state.left.slice(),walls:state.walls.map(w=>({...w}))},side,policy:policy.encode(action)});
  }
  state=engine.hellApply(state,side,action);summary.moves++;
  if(isGoal(state,side)){winner=side;ending="goal";break;}
  if(engine.movementOptions(state.players[1-side],state.dirs[1-side],state.walls).length===0){winner=side;ending="noMovement";break;}
  const key=JSON.stringify([1-side,state.players,state.dirs,state.left,state.walls.map(w=>w.o+w.x+":"+w.y).sort()]);
  const repetitions=(history.get(key)||0)+1;history.set(key,repetitions);
  if(repetitions>=3){ending="draw";break;}
 }
 summary[ending]++;summary.completed++;if(winner!==null)summary.win[winner]++;
 const terrain=engine.terrain;
 for(const obs of before){
  samples.push(JSON.stringify({...obs,value:winner===null?0:winner===obs.side?1:-1,
   map:{...map,terrain:{PORTALS:terrain.PORTALS,ICE:terrain.ICE,BOOST:terrain.BOOST}},
   split,policyVersion:policy.VERSION,source:"v1.1-selfplay-final-result"}));
 }
 summary.samples+=before.length;
 if((i+1)%5===0)console.log("SELFPLAY_PROGRESS",split,offset,i+1,"/",count,"samples",summary.samples,"ms",Date.now()-begin);
}
const output=path.join(__dirname,"output","selfplay-"+split+"-"+offset+".jsonl");
fs.writeFileSync(output,samples.join("\n")+"\n");
summary.elapsedMs=Date.now()-begin;summary.output=path.basename(output);
fs.writeFileSync(path.join(__dirname,"output","selfplay-"+split+"-"+offset+".report.json"),JSON.stringify(summary,null,2));
console.log("SELFPLAY_DONE",JSON.stringify(summary));
