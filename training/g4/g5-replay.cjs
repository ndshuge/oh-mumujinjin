"use strict";
const fs=require("fs"),path=require("path"),{engine}=require("../train.cjs"),{check,move}=require("../league/agent.cjs");
const root=path.resolve(__dirname,"../.."),top=JSON.parse(fs.readFileSync(path.join(root,"training/league/population-g4-top5-v11.json"),"utf8")).agents;
const odd=JSON.parse(fs.readFileSync(path.join(root,"training/league/population-strange.json"),"utf8")).agents.find(x=>x.id==="odd-hawks");
const candidate=top.find(x=>x.id==="g4-h13");if(!candidate||!odd)throw Error("Missing players");check(candidate);check(odd);
const raw=fs.readFileSync(path.join(root,"training/output/s0-records-120-10000.jsonl"),"utf8").split("\n"),maps=[],keys=new Set();
for(const line of raw){if(!line)continue;const r=JSON.parse(line);if(r.split!=="heldOut")continue;const k=r.map.rocks.map(p=>p.x+","+p.y).sort().join("|");if(keys.has(k))continue;keys.add(k);maps.push(r.map);}
const mapId=Number(process.argv[2]??8),seat=Number(process.argv[3]??0);if(![3,4,8].includes(mapId)||![0,1].includes(seat))throw Error("Only diagnostic maps 3/4/8 and seats 0/1");
const map=maps[940+mapId];if(!map)throw Error("Map missing");engine.setRocks(map.rocks);
const players=seat?[odd,candidate]:[candidate,odd],same=(a,b)=>a&&b&&a.x===b.x&&a.y===b.y;
let s={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]},winner=null,ending="cap";const steps=[],seen=new Map();
for(let ply=0;ply<120;ply++){
 const who=ply%2;if(!engine.movementOptions(s.players[who],s.dirs[who],s.walls).length){winner=players[1-who].id;ending="noMovement";break;}
 const before=JSON.parse(JSON.stringify(s)),result=move(engine,s,who,map,players[who],260),action=result.action;if(!action)throw Error("Null action "+ply);
 s=engine.hellApply(s,who,action);const after=JSON.parse(JSON.stringify(s));
 steps.push({ply,player:players[who].id,who,elapsedMs:result.timeMs,action,before,after});
 if(engine.terrain.CAMPS[1-who].some(g=>same(g,s.players[who]))){winner=players[who].id;ending="goal";break;}
 const key=JSON.stringify([1-who,s.players,s.dirs,s.left,s.walls.map(w=>w.o+":"+w.x+":"+w.y).sort()]);const n=(seen.get(key)||0)+1;seen.set(key,n);if(n===3){ending="repetition";break;}
}
const tag=process.env.G5_REPLAY_TAG||"";if(tag&&!/^[a-z0-9_-]{1,32}$/.test(tag))throw Error("Invalid replay tag");
const out=path.join(root,"training/output/lab/g5/replay-h13-odd-map"+mapId+"-seat"+seat+(tag?"-"+tag:"")+".json");
fs.writeFileSync(out,JSON.stringify({schema:"g5-diagnostic-replay-v1",developmentOnly:true,mapId,seat,players:players.map(p=>p.id),rocks:map.rocks,winner,ending,plies:steps.length,steps},null,2));
console.log(JSON.stringify({out,winner,ending,plies:steps.length}));
