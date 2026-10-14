"use strict";
// Deterministic diagnostic replay. Same maps, seats and players as
// g5-replay.cjs, but every search component runs on an opt-in fixed node
// budget instead of a wall clock, so the move list is reproducible on any
// machine. Writes a new file per (map, seat, tag); never overwrites the
// legacy wall-clock replays.
const crypto=require("crypto"),fs=require("fs"),path=require("path");
const {engine}=require("../train.cjs"),{check,move}=require("../league/agent.cjs");
// Memoising computerDistance is value-preserving, so the decision digest below
// must be identical with and without it. Set NO_DISTANCE_CACHE=1 to check.
const distanceCache=process.env.NO_DISTANCE_CACHE?null:require("../fast-distance.cjs").install(engine);
const root=path.resolve(__dirname,"../..");
const top=JSON.parse(fs.readFileSync(path.join(root,"training/league/population-g4-top5-v11.json"),"utf8")).agents;
const odd=JSON.parse(fs.readFileSync(path.join(root,"training/league/population-strange.json"),"utf8")).agents.find(x=>x.id==="odd-hawks");
const candidate=top.find(x=>x.id==="g4-h13");
if(!candidate||!odd)throw Error("Missing players");
check(candidate);check(odd);

const mapId=Number(process.argv[2]??8),seat=Number(process.argv[3]??0),tag=process.argv[4]||"";
if(![3,4,8].includes(mapId)||![0,1].includes(seat))throw Error("Only diagnostic maps 3/4/8 and seats 0/1");
if(tag&&!/^[a-z0-9_-]{1,32}$/.test(tag))throw Error("Invalid replay tag");
const maxNodes=Number(process.argv[5]||0);
if(!(maxNodes>=0))throw Error("Invalid maxNodes");

// Deterministic evaluation options handed to every agent decision.
const searchOptions={deterministic:true};
if(maxNodes>0)searchOptions.maxNodes=maxNodes;

const raw=fs.readFileSync(path.join(root,"training/output/s0-records-120-10000.jsonl"),"utf8").split("\n"),maps=[],keys=new Set();
for(const line of raw){
 if(!line)continue;const r=JSON.parse(line);if(r.split!=="heldOut")continue;
 const k=r.map.rocks.map(p=>p.x+","+p.y).sort().join("|");if(keys.has(k))continue;keys.add(k);maps.push(r.map);
}
const map=maps[940+mapId];if(!map)throw Error("Map missing");
engine.setRocks(map.rocks);

const players=seat?[odd,candidate]:[candidate,odd],same=(a,b)=>a&&b&&a.x===b.x&&a.y===b.y;
let s={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]},winner=null,ending="cap";
const steps=[],seen=new Map();
for(let ply=0;ply<120;ply++){
 const who=ply%2;
 if(!engine.movementOptions(s.players[who],s.dirs[who],s.walls).length){winner=players[1-who].id;ending="noMovement";break;}
 const result=move(engine,s,who,map,players[who],260,searchOptions),action=result.action;
 if(!action)throw Error("Null action "+ply);
 s=engine.hellApply(s,who,action);
 // Only the decision is recorded for hashing; timing fields are machine noise.
 steps.push({ply,player:players[who].id,who,action,visited:result.visited??null,depth:result.depth??null});
 if(engine.terrain.CAMPS[1-who].some(g=>same(g,s.players[who]))){winner=players[who].id;ending="goal";break;}
 const key=JSON.stringify([1-who,s.players,s.dirs,s.left,s.walls.map(w=>w.o+":"+w.x+":"+w.y).sort()]);
 const n=(seen.get(key)||0)+1;seen.set(key,n);
 if(n===3){ending="repetition";break;}
}
const digest=crypto.createHash("sha256").update(JSON.stringify({winner,ending,steps})).digest("hex");
const out=path.join(root,"training/output/lab/g5",`replay-det-map${mapId}-seat${seat}${tag?"-"+tag:""}.json`);
fs.writeFileSync(out,JSON.stringify({schema:"g5-deterministic-replay-v1",developmentOnly:true,mapId,seat,tag,players:players.map(p=>p.id),rocks:map.rocks,deterministic:{enabled:true,maxNodes:maxNodes||null},distanceCache:distanceCache?{enabled:true,...distanceCache.stats}:{enabled:false},winner,ending,plies:steps.length,decisionDigest:digest,steps},null,2));
console.log(JSON.stringify({out,winner,ending,plies:steps.length,decisionDigest:digest}));
