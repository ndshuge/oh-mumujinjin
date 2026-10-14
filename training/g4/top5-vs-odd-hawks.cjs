"use strict";
const fs=require("fs"),path=require("path"),{engine}=require("../train.cjs"),{check,move}=require("../league/agent.cjs");
const top=JSON.parse(fs.readFileSync(path.join(__dirname,"../league/population-g4-top5-v11.json"),"utf8")).agents;
const odd=JSON.parse(fs.readFileSync(path.join(__dirname,"../league/population-strange.json"),"utf8")).agents.find(x=>x.id==="odd-hawks");
if(top.length!==5||!odd)throw Error("Missing five or odd-hawks");
[...top,odd].forEach(check);
const file=path.join(__dirname,"../output/lab/g4/TOP5_VS_ODD_HAWKS_20261014.jsonl"),report=file.replace(".jsonl",".json");
if(fs.existsSync(report))throw Error("Completed report already exists");
const raw=fs.readFileSync(path.join(__dirname,"../output/s0-records-120-10000.jsonl"),"utf8").split("\n");
const maps=[],keys=new Set();for(const l of raw){if(!l)continue;const r=JSON.parse(l);if(r.split!=="heldOut")continue;const k=r.map.rocks.map(p=>p.x+","+p.y).sort().join("|");if(keys.has(k))continue;keys.add(k);maps.push(r.map);}
const chosen=maps.slice(940,950);if(chosen.length!==10)throw Error("Missing maps");
const same=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
function valid(s,p,a){if(!a)return false;if(a.wall)return engine.hellWallAllowed(s,a.wall,p);return engine.movementOptions(s.players[p],s.dirs[p],s.walls).some(m=>{if(!a.move||!same(m.p,a.move.p)||!same(m.d,a.move.d)||m.steps!==a.move.steps||!same(m.firstDir,a.move.firstDir))return false;const portal=engine.portal(m.p),target=a.warp&&portal?(same(portal.a,m.p)?portal.b:portal.a):m.p,lock=a.warp?null:m.nextLock;return (!a.warp||!!portal)&&same(target,a.p)&&((lock===null&&a.lock==null)||same(lock,a.lock));});}
const schedule=top.flatMap(a=>chosen.flatMap((map,i)=>[0,1].map(seat=>({a,map,i,seat}))));
let done=[];if(fs.existsSync(file)){done=fs.readFileSync(file,"utf8").split("\n").filter(Boolean).map(JSON.parse);for(let i=0;i<done.length;i++){const e=schedule[i];if(!e||done[i].id!==e.a.id||done[i].map!==e.i||done[i].seat!==e.seat)throw Error("Unsafe resume");}}
for(let j=done.length;j<schedule.length;j++){const {a,map,i,seat}=schedule[j];engine.setRocks(map.rocks);const players=seat?[odd,a]:[a,odd];let s={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]},winner=null,ending="cap";const seen=new Map();
for(let ply=0;ply<120;ply++){const who=ply%2;if(!engine.movementOptions(s.players[who],s.dirs[who],s.walls).length){winner=players[1-who].id;ending="noMovement";break;}const r=move(engine,s,who,map,players[who],260);if(!valid(s,who,r.action))throw Error("Illegal "+players[who].id+" game "+j);s=engine.hellApply(s,who,r.action);if(engine.terrain.CAMPS[1-who].some(g=>same(g,s.players[who]))){winner=players[who].id;ending="goal";break;}const key=JSON.stringify([1-who,s.players,s.dirs,s.left,s.walls.map(w=>w.o+":"+w.x+":"+w.y).sort()]);const n=(seen.get(key)||0)+1;seen.set(key,n);if(n===3){ending="repetition";break;}}
const rec={id:a.id,map:i,seat,winner,ending};fs.appendFileSync(file,JSON.stringify(rec)+"\n");done.push(rec);if(done.length%10===0)console.log("TOP5_ODD_PROGRESS",done.length,"/",schedule.length);}
const results=top.map(a=>{const r=done.filter(x=>x.id===a.id);return {id:a.id,games:r.length,wins:r.filter(x=>x.winner===a.id).length,losses:r.filter(x=>x.winner===odd.id).length,draws:r.filter(x=>!x.winner).length};});
fs.writeFileSync(report,JSON.stringify({status:"complete",opponent:"odd-hawks",games:done.length,budgetMs:260,developmentOnly:true,results},null,2));console.log("TOP5_ODD_DONE",JSON.stringify(results));
