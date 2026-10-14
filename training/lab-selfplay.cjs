"use strict";
// D0 experiment lab: bounded, replayable V1.1-vs-V1.1 self-play.
// Reuses game.js via training/train.cjs; does not modify browser gameplay.
// No APIs, secrets, cloud workers or model inference are required.
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const {engine}=require("./train.cjs");
const search=require("../strong-search-v1.1.js");
const policy=require("./policy.cjs");
const argv=process.argv.slice(2);
const split=argv[0]==="heldOut"?"heldOut":argv[0]==="train"?"train":null;
if(!split)throw Error("Usage: node training/lab-selfplay.cjs train|heldOut start count searchBudgetMs seed");
const startIndex=Number(argv[1]??0),count=Number(argv[2]??4),
 budget=Number(argv[3]??100),seed=Number(argv[4]??20261014);
if(!Number.isInteger(startIndex)||startIndex<0||!Number.isInteger(count)||count<1||count>200||!Number.isInteger(budget)||budget<50||budget>3000||!Number.isInteger(seed))throw Error("Invalid bounded lab arguments");
const root=path.join(__dirname,"output","lab"),source=path.join(__dirname,"output","s0-records-120-10000.jsonl");
fs.mkdirSync(root,{recursive:true});
const id=split+"-"+startIndex+"-"+count+"-b"+budget+"-s"+seed;
const filename=path.join(root,id);
if(fs.existsSync(filename+".jsonl")||fs.existsSync(filename+".report.json"))throw Error("Output exists; refuse overwrite "+id);
const all=fs.readFileSync(source,"utf8").split("\n");
const signatures=new Set(),bank=[];
for(const line of all){
 if(!line)continue;
 const item=JSON.parse(line);
 if(item.split!==split)continue;
 const signature=item.map.rocks.map(p=>p.x+","+p.y).sort().join("|");
 if(signatures.has(signature))continue;
 signatures.add(signature);
 bank.push({...item.map,signature});
}
if(!bank.length)throw Error("No eligible maps in "+split);
const maps=Array.from({length:count},(_,i)=>bank[(startIndex+i)%bank.length]);
// Cycling enables >bank.length games while preserving disjoint train/held-out
// layout partitions. Repeat maps do not count as independent test layouts.
const has=(points,p)=>points.some(g=>g.x===p.x&&g.y===p.y);
const serialize=(s)=>({players:s.players.map(p=>({...p})),dirs:s.dirs.map(d=>d?{...d}:null),walls:s.walls.map(w=>({...w})),left:s.left.slice()});
function validAction(s,who,a){
 if(!a)return false;
 if(a.wall)return engine.hellWallAllowed(s,a.wall,who);
 const legal=engine.movementOptions(s.players[who],s.dirs[who],s.walls);
 return legal.some(m=>a.move&&m.p.x===a.move.p.x&&m.p.y===a.move.p.y&&m.steps===a.move.steps&&m.d.x===a.move.d.x&&m.d.y===a.move.d.y&&Boolean(engine.portal(m.p))>=Boolean(a.warp));
}
const summary={id,engine:"strong-search-v1.1",source:"actual self-play; game.js rules",split,
 startIndex,count,budget,seed,completed:0,actions:0,invalid:0,endings:{goal:0,noMovement:0,repetition:0,cap:0},
 winner:[0,0],draws:0,generatedExamples:0,wallMoves:0,warps:0,
 mapLayouts:new Set(),categories:{sparse:0,medium:0,dense:0},elapsedMs:0,localSearchMs:[]};
const output=fs.createWriteStream(filename+".jsonl",{flags:"wx",encoding:"utf8"});
const obs=fs.createWriteStream(filename+".samples.jsonl",{flags:"wx",encoding:"utf8"});
let rnd=seed>>>0;const rand=()=>((rnd=(Math.imul(rnd,1664525)+1013904223)>>>0)/4294967296);
const begin=Date.now();
for(let k=0;k<maps.length;k++){
 const map=maps[k];engine.setRocks(map.rocks);
 // Camps are fixed in this version. Vary both starting options inside each camp.
 const starts=engine.terrain.CAMPS.map((camp,i)=>({...camp[(k+i+Math.floor(rand()*camp.length))%camp.length]}));
 let s={players:starts,dirs:[null,null],walls:[],left:[5,5]},winner=null,reason="cap";
 const seen=new Map(),moves=[],observations=[];
 summary.mapLayouts.add(map.signature);
 summary.categories[map.rocks.length<=5?"sparse":map.rocks.length<=11?"medium":"dense"]++;
 for(let ply=0;ply<120;ply++){
  const side=ply%2;
  const legalMoves=engine.movementOptions(s.players[side],s.dirs[side],s.walls);
  if(legalMoves.length===0){winner=1-side;reason="noMovement";break;}
  const before=serialize(s),t0=Date.now();
  const chosen=search.choose(engine,s,side,{depth:2,timeMs:budget});
  summary.localSearchMs.push(Date.now()-t0);
  const a=chosen.action;
  if(!validAction(s,side,a)){summary.invalid++;throw Error("Illegal action "+map.name+" ply "+ply);}
  // No copy of a transition engine; use actual game.js result.
  s=engine.hellApply(s,side,a);
  summary.actions++;
  if(a.wall)summary.wallMoves++;if(a.warp)summary.warps++;
  const actionId=policy.encode(a);
  moves.push({side,action:a,policy:actionId});
  if(ply%4===0||a.wall)observations.push({state:before,side,policy:actionId,ply});
  if(has(engine.terrain.CAMPS[1-side],s.players[side])){winner=side;reason="goal";break;}
  if(engine.movementOptions(s.players[1-side],s.dirs[1-side],s.walls).length===0){winner=side;reason="noMovement";break;}
  const signature=JSON.stringify([1-side,s.players,s.dirs,s.left,s.walls.map(w=>w.o+":"+w.x+":"+w.y).sort()]);
  const seenCount=(seen.get(signature)||0)+1;seen.set(signature,seenCount);
  if(seenCount>=3){reason="repetition";break;}
 }
 const record={version:"D0-1",map:{version:map.version,name:map.name,rocks:map.rocks},split,
 starts,winner,ending:reason,moves,ruleVersion:"game-js-20261014"};
 const sha=crypto.createHash("sha256").update(JSON.stringify(record)).digest("hex");
 output.write(JSON.stringify({...record,sha256:sha})+"\n");
 const terrain={PORTALS:engine.terrain.PORTALS,ICE:engine.terrain.ICE,BOOST:engine.terrain.BOOST};
 for(const r of observations){
  obs.write(JSON.stringify({...r,map:{version:map.version,name:map.name,rocks:map.rocks,terrain},split,
   value:winner===null?0:winner===r.side?1:-1,policyVersion:policy.VERSION,source:"lab-selfplay-v1.1-completed"})+"\n");
 }
 summary.completed++;summary.endings[reason]++;
 if(winner===null)summary.draws++;else summary.winner[winner]++;
 summary.generatedExamples+=observations.length;
 if((k+1)%5===0||k===maps.length-1)console.log("LAB_PROGRESS",JSON.stringify({id,completed:summary.completed,actions:summary.actions,examples:summary.generatedExamples,endings:summary.endings,elapsedMs:Date.now()-begin}));
}
output.end();obs.end();
summary.localSearchMs.sort((a,b)=>a-b);
const latency={p50:summary.localSearchMs[Math.floor(summary.localSearchMs.length*.5)]??null,p95:summary.localSearchMs[Math.floor(summary.localSearchMs.length*.95)]??null,max:summary.localSearchMs.at(-1)??null};
const report={...summary,mapLayouts:summary.mapLayouts.size,localSearchMs:undefined,latency,elapsedMs:Date.now()-begin,
 files:[path.basename(filename+".jsonl"),path.basename(filename+".samples.jsonl")]};
fs.writeFileSync(filename+".report.json",JSON.stringify(report,null,2));
console.log("LAB_DONE",JSON.stringify(report));
if(summary.invalid)process.exitCode=1;
