"use strict";
// G6.1 v2 PUCT self-play generator. Replaces g6-selfplay-puct-runner.cjs, which
// produced 647 samples that were unusable as AlphaZero training data.
//
// Five defects fixed here (all verified against the rejected v1 output):
//   1. policy was never written. v1 read `result.policyVector`, but
//      puct.search() returns `result.policy`. Result: 0 of 647 lines had a
//      policy field, so the PUCT visit distribution never reached disk.
//   2. self-play ran on an empty board. v1 built every map with rocks:[] and
//      never called engine.setRocks(), so all 647 samples had no walls.
//   3. value backfill used a global samples.slice(-120), spilling a game's
//      terminal result into the previous game's tail. Now per-game buffered.
//   4. output was write-once (`throw` when the file existed), so a crashed run
//      could not be resumed. Now append-only with a progress file.
//   5. no repetition / no-movement termination, unlike the real rules. Now the
//      same four endings as the game: goal / noMovement / repetition / cap.
//
// Champion and every frozen artifact stay untouched; output lands in a new
// versioned file so the rejected v1 evidence is preserved.
const crypto=require("crypto"),fs=require("fs"),path=require("path");
const {engine}=require("./train.cjs"),puct=require("./puct.cjs"),policy=require("./policy.cjs");
// Value-preserving memo cache for computerDistance. Verified by
// training/g4/g5-determinism-gate.cjs to leave every decision digest unchanged.
const distanceCache=process.env.NO_DISTANCE_CACHE?null:require("./fast-distance.cjs").install(engine);
const root=__dirname,outDir=path.join(root,"output/lab/g6");
fs.mkdirSync(outDir,{recursive:true});

const bankFile=process.argv[2]||path.join(root,"output/lab/g4/novel-pilot-20261014-60.jsonl");
const targetGames=Math.max(1,Math.min(20000,Number(process.argv[3]||30)));
const simulations=Math.max(2,Math.min(512,Number(process.argv[4]||64)));
const seed=Number(process.argv[5]||20261014);
if(!Number.isInteger(seed))throw Error("Invalid seed");
const plyCap=Math.max(20,Math.min(240,Number(process.argv[6]||120)));

const sig=rocks=>rocks.map(p=>p.x+","+p.y).sort().join("|");

// ---- map bank loading (jsonl or json) ----
function loadBank(file){
 if(!fs.existsSync(file))throw Error("Map bank missing: "+file);
 if(file.endsWith(".jsonl"))return fs.readFileSync(file,"utf8").split("\n").filter(Boolean).map(JSON.parse);
 const json=JSON.parse(fs.readFileSync(file,"utf8"));
 const list=json.maps||json.items||json;
 if(!Array.isArray(list))throw Error("Unrecognised map bank shape: "+file);
 return list;
}
const bank=loadBank(bankFile);
if(!bank.length)throw Error("Empty map bank");
for(const m of bank)if(!m.rocks||!Array.isArray(m.rocks))throw Error("Map without rocks: "+m.name);

// ---- preflight: training layouts must not touch any evaluation bank ----
function fingerprintsOf(file,extract){
 if(!fs.existsSync(file))return null;
 if(file.endsWith(".jsonl"))return new Set(fs.readFileSync(file,"utf8").split("\n").filter(Boolean).map(l=>sig(extract(JSON.parse(l)))));
 const json=JSON.parse(fs.readFileSync(file,"utf8"));
 const list=json.maps||json.items||[];
 return new Set(list.map(m=>sig(extract(m))));
}
const excludedFiles=[
 [path.join(root,"output/s0-records-120-10000.jsonl"),r=>r.map.rocks],
 [path.join(root,"output/lab/g4/novel-sealed-20261030-500.jsonl"),m=>m.rocks],
 [path.join(root,"output/lab/g4/fresh-map-bank-20261015-120.json"),m=>m.rocks],
];
const audit=[];
for(const [file,extract] of excludedFiles){
 const set=fingerprintsOf(file,extract);
 if(!set)continue;
 const overlap=bank.filter(m=>set.has(sig(m.rocks))).length;
 audit.push({file:path.relative(root,file),layouts:set.size,overlap});
 if(overlap>0)throw Error("Training bank overlaps evaluation layouts: "+file+" ("+overlap+")");
}
const bankDigest=crypto.createHash("sha256").update(fs.readFileSync(bankFile)).digest("hex");

const stem="selfplay-puct-g6-v2"+(process.env.G6_SELFPLAY_TAG?"-"+process.env.G6_SELFPLAY_TAG.replace(/[^a-z0-9_-]/gi,""):"");
const sampleFile=path.join(outDir,stem+".jsonl");
const progressFile=path.join(outDir,stem+".progress.json");
const reportFile=path.join(outDir,stem+".report.json");

// ---- resumable state ----
let startGame=0,carried={games:0,moves:0,samples:0,degeneratePolicies:0,policyLenViolations:0,illegal:0,endings:{goal:0,noMovement:0,repetition:0,cap:0},winnerSide:[0,0,0]};
if(fs.existsSync(progressFile)){
 const p=JSON.parse(fs.readFileSync(progressFile,"utf8"));
 if(p.seed!==seed||p.simulations!==simulations||p.bankDigest!==bankDigest||p.plyCap!==plyCap)
  throw Error("Progress file belongs to a different configuration; move it aside instead of mixing runs");
 startGame=p.games||0;carried={...carried,...p};
 console.log("G6V2_RESUME from game",startGame);
}

const randFor=gameIndex=>{
 let s=(seed+Math.imul(gameIndex,2654435761))>>>0;
 return()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);
};
const same=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;

let games=carried.games||0,moves=carried.moves||0,samples=carried.samples||0;
let degenerate=carried.degeneratePolicies||0,lenViolations=carried.policyLenViolations||0,illegal=carried.illegal||0;
const endings={...carried.endings},winnerSide=[...(carried.winnerSide||[0,0,0])];
const t0=Date.now();

for(let gameIndex=startGame;gameIndex<targetGames;gameIndex++){
 const rand=randFor(gameIndex);
 const map=bank[Math.floor(rand()*bank.length)];
 engine.setRocks(map.rocks);
 const opening=rand()<0.5?0:1;
 let s={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]};
 let winner=null,ending="cap";
 const gameSamples=[],seen=new Map();
 for(let ply=0;ply<plyCap;ply++){
  const who=(ply+opening)%2;
  if(!engine.movementOptions(s.players[who],s.dirs[who],s.walls).length){winner=1-who;ending="noMovement";break;}
  const result=puct.search(engine,s,who,{simulations,timeMs:200,deterministic:true});
  if(!result.action)throw Error("Null action at game "+gameIndex+" ply "+ply);
  const vec=result.policy;
  if(!Array.isArray(vec)||vec.length!==policy.SIZE){lenViolations++;throw Error("Policy length violation at game "+gameIndex+" ply "+ply);}
  const total=vec.reduce((a,b)=>a+b,0);
  if(!(total>0))degenerate++;
  else gameSamples.push({
   gameIndex,ply,side:who,opening,mapName:map.name,mapHash:map.hash||null,mapTier:map.tier||map.density||null,
   state:JSON.parse(JSON.stringify(s)),
   policy:vec.map(v=>Math.round(v*1e5)/1e5),
   policyVersion:policy.VERSION,policyMass:Math.round(total*1e5)/1e5,
   visits:result.simulations,nodes:result.nodes,
   value:null,source:"g6-puct-selfplay-v2",
  });
  const next=engine.hellApply(s,who,result.action);
  s=next;moves++;
  if(engine.terrain.CAMPS[1-who].some(g=>same(g,s.players[who]))){winner=who;ending="goal";break;}
  const key=JSON.stringify([1-who,s.players,s.dirs,s.left,s.walls.map(w=>w.o+":"+w.x+":"+w.y).sort()]);
  const n=(seen.get(key)||0)+1;seen.set(key,n);
  if(n===3){ending="repetition";break;}
 }
 const value=winner===null?0:(winner===0?1:-1);
 for(const sample of gameSamples)sample.value=sample.side===winner?1:winner===null?0:-1;
 if(gameSamples.length)fs.appendFileSync(sampleFile,gameSamples.map(JSON.stringify).join("\n")+"\n");
 games++;samples+=gameSamples.length;endings[ending]++;winnerSide[winner===null?2:winner]++;
 const progress={schema:"g6-selfplay-puct-v2-progress",bank:path.relative(root,bankFile),bankDigest,seed,simulations,plyCap,
  targetGames,games,moves,samples,degeneratePolicies:degenerate,policyLenViolations:lenViolations,illegal,
  endings,winnerSide,elapsedMs:Date.now()-t0,state:gameIndex+1>=targetGames?"complete":"running"};
 fs.writeFileSync(progressFile,JSON.stringify(progress,null,2));
 if(games%5===0||games<=2||gameIndex+1>=targetGames)
  console.log("G6V2",games+"/"+targetGames,"samples",samples,"endings",JSON.stringify(endings),"moves",moves);
}

const report={schema:"g6-selfplay-puct-v2",bank:path.relative(root,bankFile),bankDigest,bankLayouts:bank.length,
 preflightAudit:audit,seed,simulations,plyCap,targetGames,games,moves,samples,
 degeneratePolicies:degenerate,policyLenViolations:lenViolations,illegal,endings,winnerSide,
 sampleFile:path.relative(root,sampleFile),sampleSha256:crypto.createHash("sha256").update(fs.readFileSync(sampleFile)).digest("hex"),
 deterministic:true,distanceCache:distanceCache?{enabled:true,...distanceCache.stats}:{enabled:false},createdAt:new Date().toISOString(),elapsedMs:Date.now()-t0};
fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
console.log(JSON.stringify({report:reportFile,games,samples,degenerate,illegal,endings}));
