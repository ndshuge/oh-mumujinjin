"use strict";
// Runs one contiguous block of game indices and writes it to its own file.
// Because a game depends only on its index, the concatenation of shards taken
// in ascending order is byte-identical to a serial run.
//
// Usage: g6-selfplay-shard.cjs BANK START END SIMS SEED PLYCAP OUT.jsonl
const crypto=require("crypto"),fs=require("fs"),path=require("path");
const {engine}=require("./train.cjs"),puct=require("./puct.cjs"),policy=require("./policy.cjs");
const core=require("./g6-selfplay-core.cjs"),banks=require("./g6-map-bank.cjs");
// Value-preserving memo cache; see docs/SEARCH_SPEEDUP_20261014.md.
const distanceCache=process.env.NO_DISTANCE_CACHE?null:require("./fast-distance.cjs").install(engine);

const bankFile=path.resolve(process.argv[2]||"");
const startGame=Number(process.argv[3]);
const endGame=Number(process.argv[4]);
const simulations=Number(process.argv[5]);
const seed=Number(process.argv[6]);
const plyCap=Number(process.argv[7]);
const outFile=path.resolve(process.argv[8]||"");
if(!bankFile||!outFile||!Number.isInteger(startGame)||!Number.isInteger(endGame)||
   !(endGame>startGame)||!Number.isInteger(seed))throw Error("Usage: g6-selfplay-shard.cjs BANK START END SIMS SEED PLYCAP OUT");

const bank=banks.load(bankFile);
const bankDigest=banks.digest(bankFile);
banks.audit(bank,__dirname,bankFile);
const reportFile=outFile.replace(/\.jsonl$/,"")+".report.json";

function loadShard(){
 if(!fs.existsSync(outFile)||!fs.existsSync(reportFile))return null;
 const r=JSON.parse(fs.readFileSync(reportFile,"utf8"));
 if(r.startGame!==startGame||r.endGame!==endGame||r.simulations!==simulations||
    r.seed!==seed||r.plyCap!==plyCap||r.bankDigest!==bankDigest)return null;
 const actual=crypto.createHash("sha256").update(fs.readFileSync(outFile)).digest("hex");
 if(actual!==r.sampleSha256)return null;
 return r;
}
const existing=loadShard();
if(existing){
 console.log("SHARD_SKIP_COMPLETE",JSON.stringify({startGame,endGame,games:existing.games}));
 process.exit(0);
}

const t0=Date.now();
let games=0,moves=0,samples=0,degenerate=0;
const endings={goal:0,noMovement:0,repetition:0,cap:0},winnerSide=[0,0,0];
const chunks=[];
for(let gameIndex=startGame;gameIndex<endGame;gameIndex++){
 const g=core.playGame(engine,puct,policy,bank,gameIndex,{seed,simulations,plyCap});
 if(g.samples.length)chunks.push(g.samples.map(JSON.stringify).join("\n"));
 games++;moves+=g.plies;samples+=g.samples.length;degenerate+=g.degenerate;
 endings[g.ending]++;winnerSide[g.winner===null?2:g.winner]++;
}
const text=chunks.length?chunks.join("\n")+"\n":"";
fs.writeFileSync(outFile,text);
const report={schema:"g6-selfplay-puct-v2-shard",startGame,endGame,games,moves,samples,
 degeneratePolicies:degenerate,illegal:0,endings,winnerSide,simulations,seed,plyCap,bankDigest,
 sampleSha256:crypto.createHash("sha256").update(text).digest("hex"),deterministic:true,
 distanceCache:distanceCache?{enabled:true,...distanceCache.stats}:{enabled:false},
 elapsedMs:Date.now()-t0};
fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
console.log("SHARD_DONE",JSON.stringify({startGame,endGame,games,samples,ms:report.elapsedMs}));
