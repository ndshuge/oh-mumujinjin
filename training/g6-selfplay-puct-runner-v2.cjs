"use strict";
// G6.1 v2 PUCT self-play generator (serial driver).
// Replaces g6-selfplay-puct-runner.cjs, which produced 647 unusable samples.
//
// Five defects fixed (all verified against the rejected v1 output):
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
// The per-game work lives in g6-selfplay-core.cjs so the same code can also be
// sharded across processes; see g6-selfplay-parallel.cjs.
const crypto=require("crypto"),fs=require("fs"),path=require("path");
const {engine}=require("./train.cjs"),puct=require("./puct.cjs"),policy=require("./policy.cjs");
const core=require("./g6-selfplay-core.cjs");
const banks=require("./g6-map-bank.cjs");
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

const bank=banks.load(bankFile);
const bankDigest=crypto.createHash("sha256").update(fs.readFileSync(bankFile)).digest("hex");
const preflightAudit=banks.audit(bank,root,bankFile);

const stem="selfplay-puct-g6-v2"+(process.env.G6_SELFPLAY_TAG?"-"+process.env.G6_SELFPLAY_TAG.replace(/[^a-z0-9_-]/gi,""):"");
const sampleFile=path.join(outDir,stem+".jsonl");
const progressFile=path.join(outDir,stem+".progress.json");
const reportFile=path.join(outDir,stem+".report.json");

let startGame=0;
const carried={games:0,moves:0,samples:0,degeneratePolicies:0,illegal:0,endings:{goal:0,noMovement:0,repetition:0,cap:0},winnerSide:[0,0,0]};
const config={schema:"g6-selfplay-puct-v2-progress",bank:path.relative(root,bankFile),bankDigest,seed,simulations,plyCap};
if(fs.existsSync(progressFile)){
 const p=JSON.parse(fs.readFileSync(progressFile,"utf8"));
 for(const k of ["seed","simulations","bankDigest","plyCap"])if(p[k]!==config[k])throw Error("Progress file belongs to a different configuration; move it aside instead of mixing runs");
 startGame=p.games||0;Object.assign(carried,p);
 console.log("G6V2_RESUME from game",startGame);
}

let games=carried.games||0,moves=carried.moves||0,samples=carried.samples||0;
let degenerate=carried.degeneratePolicies||0;
const endings={...carried.endings},winnerSide=[...(carried.winnerSide||[0,0,0])];
const t0=Date.now();

for(let gameIndex=startGame;gameIndex<targetGames;gameIndex++){
 const g=core.playGame(engine,puct,policy,bank,gameIndex,{seed,simulations,plyCap});
 if(g.samples.length)fs.appendFileSync(sampleFile,g.samples.map(JSON.stringify).join("\n")+"\n");
 games++;moves+=g.plies;samples+=g.samples.length;degenerate+=g.degenerate;
 endings[g.ending]++;winnerSide[g.winner===null?2:g.winner]++;
 fs.writeFileSync(progressFile,JSON.stringify({...config,deterministic:true,distanceCache:distanceCache?{enabled:true,...distanceCache.stats}:{enabled:false},
  targetGames,games,moves,samples,degeneratePolicies:degenerate,illegal:0,
  endings,winnerSide,elapsedMs:Date.now()-t0,state:gameIndex+1>=targetGames?"complete":"running"},null,2));
 if(games%5===0||games<=2||gameIndex+1>=targetGames)
  console.log("G6V2",games+"/"+targetGames,"samples",samples,"endings",JSON.stringify(endings),"moves",moves);
}

const report={schema:"g6-selfplay-puct-v2",bank:path.relative(root,bankFile),bankDigest,bankLayouts:bank.length,
 preflightAudit,seed,simulations,plyCap,targetGames,games,moves,samples,
 degeneratePolicies:degenerate,illegal:0,endings,winnerSide,
 sampleFile:path.relative(root,sampleFile),sampleSha256:crypto.createHash("sha256").update(fs.readFileSync(sampleFile)).digest("hex"),
 deterministic:true,distanceCache:distanceCache?{enabled:true,...distanceCache.stats}:{enabled:false},
 createdAt:new Date().toISOString(),elapsedMs:Date.now()-t0};
fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
console.log(JSON.stringify({report:reportFile,games,samples,degenerate,endings}));
