"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert");
const {engine}=require("./train.cjs");
const challenger=require("../strong-search-v2.js");
const incumbent=require("../strong-search-v1.1.js");
const mapStart=Math.max(0,Number(process.argv[2]||1660));
const count=Math.max(1,Math.min(100,Number(process.argv[3]||10)));
const budget=Math.max(60,Math.min(2000,Number(process.argv[4]||220))),challengerDepth=Math.max(1,Math.min(4,Number(process.argv[5]||2)));
const limit=120,filepath=path.join(__dirname,"output","s0-records-120-10000.jsonl");
const signatures=new Set(),maps=[],lines=fs.readFileSync(filepath,"utf8").split("\n");
let seen=0;
for(const line of lines){
 if(!line)continue;
 const row=JSON.parse(line);
 if(row.split!=="heldOut")continue;
 const sig=row.map.rocks.map(x=>x.x+":"+x.y).sort().join("|");
 if(signatures.has(sig))continue;
 signatures.add(sig);
 if(seen++>=mapStart){maps.push(row.map);if(maps.length===count)break;}
}
assert.equal(maps.length,count,"not enough held out maps "+mapStart+"+"+count);
const result={mapStart,maps:count,games:0,budget,challengerDepth,plyCap:limit,
 challenger:{wins:0,losses:0,draws:0},incumbent:{wins:0,losses:0,draws:0},
 terminal:{goal:0,repetition:0,cap:0,noMovement:0},illegal:0,plies:0,ms:[],records:[]};
const before=Date.now();
for(let i=0;i<maps.length;i++){
 const map=maps[i];
 engine.setRocks(map.rocks);
 for(let seat=0;seat<2;seat++){
  let s={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]};
  const agents=seat===0?["challenger","incumbent"]:["incumbent","challenger"];
  let winner=null,ending="cap",n=0;
  const states=new Map();
  for(let ply=0;ply<limit;ply++){
   const who=ply%2;
   const moves=engine.movementOptions(s.players[who],s.dirs[who],s.walls);
   if(!moves.length){winner=1-who;ending="noMovement";break;}
   const start=Date.now();
   const choice=(agents[who]==="challenger"?challenger:incumbent)
     .choose(engine,s,who,{depth:agents[who]==="challenger"?challengerDepth:2,timeMs:budget});
   const elapsed=Date.now()-start;
   if(agents[who]==="challenger")result.ms.push(elapsed);
   const a=choice.action;
   if(!a){winner=1-who;ending="noMovement";break;}
   let valid=!!a.wall?engine.hellWallAllowed(s,a.wall,who):
    moves.some(m=>a.move&&m.p.x===a.move.p.x&&m.p.y===a.move.p.y&&m.d.x===a.move.d.x&&m.d.y===a.move.d.y&&m.steps===a.move.steps);
   if(!valid){result.illegal++;throw Error("Illegal action game "+(2*i+seat)+" at "+ply);}
   s=engine.hellApply(s,who,a);result.plies++;n++;
   if(engine.terrain.CAMPS[1-who].some(p=>p.x===s.players[who].x&&p.y===s.players[who].y)){
    winner=who;ending="goal";break;
   }
   // Rule: if opponent cannot move, they lose immediately, even if walls remain.
   if(!engine.movementOptions(s.players[1-who],s.dirs[1-who],s.walls).length){
    winner=who;ending="noMovement";break;
   }
   const key=JSON.stringify([1-who,s.players,s.dirs,s.left,s.walls.map(w=>w.o+w.x+":"+w.y).sort()]);
   const k=(states.get(key)||0)+1;states.set(key,k);
   if(k===3){ending="repetition";break;}
  }
  const winnerName=winner===null?null:agents[winner];
  for(const a of ["challenger","incumbent"])
   result[a][winnerName===null?"draws":winnerName===a?"wins":"losses"]++;
  result.terminal[ending]++;result.games++;
  result.records.push({map:map.name,seat,ending,winner:winnerName,plies:n});
 }
 if((i+1)%5===0)console.log("SHARD_PROGRESS",mapStart,i+1,"/",count,"score",result.challenger,"ms",Date.now()-before);
}
result.ms.sort((a,b)=>a-b);
const percent=p=>result.ms[Math.floor((result.ms.length-1)*p)]||0;
result.latency={p50:percent(.5),p95:percent(.95),max:result.ms.at(-1)};
delete result.ms;
result.elapsedMs=Date.now()-before;
const outfile=path.join(__dirname,"output","ab-shard-"+mapStart+"-d"+challengerDepth+".json");
fs.writeFileSync(outfile,JSON.stringify(result,null,2));
console.log("SHARD_DONE",JSON.stringify({mapStart,games:result.games,challenger:result.challenger,latency:result.latency,illegal:result.illegal,elapsedMs:result.elapsedMs}));
