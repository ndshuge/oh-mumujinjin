"use strict";
const fs=require("fs"),path=require("path"),{engine}=require("../train.cjs"),{check,move}=require("../league/agent.cjs");
const root=path.resolve(__dirname,"../.."),lab=path.join(root,"training/output/lab/g5"),base=JSON.parse(fs.readFileSync(path.join(root,"training/league/population-g4-top5-v11.json"),"utf8")).agents.find(x=>x.id==="g4-h13");
const odd=JSON.parse(fs.readFileSync(path.join(root,"training/league/population-strange.json"),"utf8")).agents.find(x=>x.id==="odd-hawks");
const challengers=[{...base,id:"g5-search-v3",family:"search",engine:"v3",depth:3},{...base,id:"g5-hybrid-v3",engine:"v3",depth:3,searchShare:.5}];for(const p of [base,odd,...challengers])check(p);
const rows=fs.readFileSync(path.join(root,"training/output/s0-records-120-10000.jsonl"),"utf8").trim().split("\n").map(JSON.parse),seen=new Set(),maps=[];
for(const r of rows){if(r.split!=="train")continue;const sig=r.map.rocks.map(p=>p.x+":"+p.y).sort().join("|");if(seen.has(sig))continue;seen.add(sig);maps.push(r.map);}
if(maps.length<8)throw Error("Need 8 training split development maps");
const chosen=maps.slice(0,8),games=challengers.flatMap(a=>[base,odd].flatMap(b=>chosen.flatMap((map,i)=>[0,1].map(seat=>({a,b,map,i,seat})))));
const out=path.join(lab,"challenger-development-arena.jsonl");if(fs.existsSync(out))throw Error("Arena output exists; do not overwrite");
const same=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
for(let j=0;j<games.length;j++){
 const {a,b,map,i,seat}=games[j];engine.setRocks(map.rocks);const players=seat?[b,a]:[a,b];let s={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]},winner=null,ending="cap";const seenStates=new Map();
 for(let ply=0;ply<120;ply++){const who=ply%2;if(!engine.movementOptions(s.players[who],s.dirs[who],s.walls).length){winner=players[1-who].id;ending="noMovement";break;}const r=move(engine,s,who,map,players[who],260);if(!r.action)throw Error("Null action "+j+"/"+ply);s=engine.hellApply(s,who,r.action);if(engine.terrain.CAMPS[1-who].some(g=>same(g,s.players[who]))){winner=players[who].id;ending="goal";break;}const key=JSON.stringify([1-who,s.players,s.dirs,s.left,s.walls.map(w=>w.o+":"+w.x+":"+w.y).sort()]);const n=(seenStates.get(key)||0)+1;seenStates.set(key,n);if(n===3){ending="repetition";break;}}
 fs.appendFileSync(out,JSON.stringify({candidate:a.id,opponent:b.id,map:i,seat,winner,ending})+"\n");console.log("ARENA_GAME",j+1,"/",games.length,a.id,b.id,winner||"draw");
}
console.log("ARENA_DONE",out);
