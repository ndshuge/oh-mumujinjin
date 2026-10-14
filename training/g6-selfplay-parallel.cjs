"use strict";
// Parallel G6 self-play driver. Splits the remaining game indices into
// contiguous shards and runs them in separate processes, then concatenates the
// shards in ascending index order.
//
// Why this is safe: a game depends only on its index (see g6-selfplay-core.cjs),
// so the merged file is byte-identical to the serial driver's output. Verified
// in docs/SEARCH_SPEEDUP_20261014.md / docs/G6_PARALLEL_SELFPLAY_20261014.md.
//
// Usage: g6-selfplay-parallel.cjs BANK TARGET SIMS SEED PLYCAP WORKERS [TAG]
const crypto=require("crypto"),fs=require("fs"),os=require("os"),path=require("path"),{spawn}=require("child_process");
const banks=require("./g6-map-bank.cjs");

const root=__dirname,outDir=path.join(root,"output/lab/g6");fs.mkdirSync(outDir,{recursive:true});
const bankFile=path.resolve(process.argv[2]||path.join(root,"output/lab/g4/novel-pilot-20261014-60.jsonl"));
const targetGames=Math.max(1,Math.min(20000,Number(process.argv[3]||30)));
const simulations=Math.max(2,Math.min(512,Number(process.argv[4]||64)));
const seed=Number(process.argv[5]||20261014);
const plyCap=Math.max(20,Math.min(240,Number(process.argv[6]||120)));
const cpuCount=Number(process.env.NUMBER_OF_PROCESSORS||os.cpus().length||4);
const workers=Math.max(1,Math.min(cpuCount,Number(process.argv[7]||Math.max(1,cpuCount-2))));
const tag=process.argv[8]||process.env.G6_SELFPLAY_TAG||"";
if(!Number.isInteger(seed))throw Error("Invalid seed");
if(tag&&!/^[a-z0-9_-]{1,32}$/i.test(tag))throw Error("Invalid tag");

const bank=banks.load(bankFile);
const bankDigest=banks.digest(bankFile);
const preflightAudit=banks.audit(bank,root,bankFile);

const stem="selfplay-puct-g6-v2"+(tag?"-"+tag:"");
const sampleFile=path.join(outDir,stem+".jsonl");
const progressFile=path.join(outDir,stem+".progress.json");
const reportFile=path.join(outDir,stem+".report.json");
const config={bank:path.relative(root,bankFile),bankDigest,seed,simulations,plyCap};

function sha256(file){return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");}

// ---- how many games are already merged, and can we trust that claim? ----
function completedGames(){
 if(!fs.existsSync(sampleFile))return {games:0,verified:"empty"};
 if(fs.existsSync(progressFile)){
  const p=JSON.parse(fs.readFileSync(progressFile,"utf8"));
  const sameConfig=["seed","simulations","bankDigest","plyCap"].every(k=>p[k]===config[k]);
  if(sameConfig&&p.sampleSha256&&p.sampleSha256===sha256(sampleFile))return {games:p.games||0,verified:"progress+sha256"};
 }
 // Fall back to a full scan: require game indices to be contiguous from zero.
 const seen=new Set();
 for(const line of fs.readFileSync(sampleFile,"utf8").split("\n"))if(line)seen.add(JSON.parse(line).gameIndex);
 let n=0;while(seen.has(n))n++;
 return {games:n,verified:"full-scan",parsedGames:seen.size};
}

const done=completedGames();
const startFrom=done.games;
if(startFrom>=targetGames){
 const out={state:"already-complete",games:startFrom,targetGames,verifiedBy:done.verified,sampleFile:path.relative(root,sampleFile)};
 fs.writeFileSync(reportFile,JSON.stringify({...out,schema:"g6-selfplay-parallel-v1"},null,2));
 console.log("G6PAR_ALREADY_COMPLETE",JSON.stringify(out));
 process.exit(0);
}

const remaining=targetGames-startFrom;
const shardSize=Math.max(1,Math.ceil(remaining/(workers*4)));
const shards=[];
for(let s=startFrom;s<targetGames;s+=shardSize)shards.push({start:s,end:Math.min(targetGames,s+shardSize)});
for(const sh of shards)sh.sampleFile=path.join(outDir,`shard-${stem}-${sh.start}-${sh.end}.jsonl`);
console.log("G6PAR_PLAN",JSON.stringify({targetGames,startFrom,remaining,workers,shardSize,shards:shards.length,
 resumedVerifiedBy:done.verified,bankLayouts:bank.length,preflightAudit}));

// ---- run shards with bounded concurrency ----
const t0=Date.now();
const results=new Map();
let failed=null;
function runShard(sh){
 return new Promise(resolve=>{
  const args=[path.join(__dirname,"g6-selfplay-shard.cjs"),bankFile,String(sh.start),String(sh.end),
   String(simulations),String(seed),String(plyCap),sh.sampleFile];
  const child=spawn(process.execPath,args,{cwd:path.dirname(root),windowsHide:true,stdio:["ignore","pipe","pipe"]});
  let tail="";
  child.stdout.on("data",d=>{const s=String(d).trim();if(s){tail=s.split("\n").pop();console.log("  [shard "+sh.start+"-"+sh.end+"]",s);}});
  child.stderr.on("data",d=>{const s=String(d).trim();if(s)console.error("  [shard "+sh.start+"-"+sh.end+"] ERR",s.slice(-500));});
  child.on("error",e=>{failed=failed||{shard:sh.start+"-"+sh.end,error:String(e)};resolve();});
  child.on("close",code=>{
   if(code!==0&&failed===null)failed={shard:sh.start+"-"+sh.end,code,tail};
   else results.set(sh.start,sh);
   resolve();
  });
 });
}

(async()=>{
 let cursor=0;
 const inFlight=[];
 async function worker(){
  while(true){
   if(failed)return;
   const i=cursor++;
   if(i>=shards.length)return;
   await runShard(shards[i]);
  }
 }
 await Promise.all(Array.from({length:Math.min(workers,shards.length)},worker));
 if(failed){
  const out={state:"failed",...failed,completedShards:[...results.keys()].sort((a,b)=>a-b),
   note:"Finished shards are kept on disk; re-run to resume."};
  fs.writeFileSync(reportFile,JSON.stringify({...out,schema:"g6-selfplay-parallel-v1"},null,2));
  console.error("G6PAR_FAILED",JSON.stringify(out));
  process.exitCode=1;return;
 }

 // ---- merge in ascending index order; order is what makes this byte-identical ----
 const ordered=shards.slice().sort((a,b)=>a.start-b.start);
 for(const sh of ordered){
  if(sh.start<startFrom)continue;
  const r=JSON.parse(fs.readFileSync(sh.sampleFile.replace(/\.jsonl$/,"")+".report.json","utf8"));
  const actual=sha256(sh.sampleFile);
  if(actual!==r.sampleSha256)throw Error("Shard digest mismatch: "+sh.start+"-"+sh.end);
  if(r.games!==sh.end-sh.start)throw Error("Shard game count mismatch: "+sh.start+"-"+sh.end);
  fs.appendFileSync(sampleFile,fs.readFileSync(sh.sampleFile));
 }
 const finalText=fs.readFileSync(sampleFile,"utf8");
 const lines=finalText.split("\n").filter(Boolean);
 const seen=new Set();for(const l of lines)seen.add(JSON.parse(l).gameIndex);
 let contiguous=0;while(seen.has(contiguous))contiguous++;
 if(contiguous!==targetGames)throw Error("Merged file is not contiguous up to target: "+contiguous+"/"+targetGames);

 const agg={games:contiguous,samples:lines.length,moves:0,degeneratePolicies:0,illegal:0,
  endings:{goal:0,noMovement:0,repetition:0,cap:0},winnerSide:[0,0,0]};
 for(const sh of ordered){
  const r=JSON.parse(fs.readFileSync(sh.sampleFile.replace(/\.jsonl$/,"")+".report.json","utf8"));
  agg.moves+=r.moves;agg.degeneratePolicies+=r.degeneratePolicies;
  for(const k of Object.keys(agg.endings))agg.endings[k]+=r.endings[k];
  for(let i=0;i<3;i++)agg.winnerSide[i]+=r.winnerSide[i];
 }
 const elapsedMs=Date.now()-t0;
 const sampleSha256=sha256(sampleFile);
 const progress={schema:"g6-selfplay-puct-v2-progress",...config,deterministic:true,targetGames,
  games:agg.games,moves:agg.moves,samples:agg.samples,degeneratePolicies:agg.degeneratePolicies,
  illegal:0,endings:agg.endings,winnerSide:agg.winnerSide,sampleSha256,elapsedMs,state:"complete",parallel:{workers,shardSize,shards:shards.length}};
 fs.writeFileSync(progressFile,JSON.stringify(progress,null,2));
 fs.writeFileSync(reportFile,JSON.stringify({schema:"g6-selfplay-parallel-v1",...config,targetGames,workers,shardSize,
  shards:shards.length,preflightAudit,bankLayouts:bank.length,resumedFrom:startFrom,resumedVerifiedBy:done.verified,
  ...agg,sampleFile:path.relative(root,sampleFile),sampleSha256,deterministic:true,elapsedMs,
  serialEquivalent:true,createdAt:new Date().toISOString()},null,2));
 console.log("G6PAR_DONE",JSON.stringify({games:agg.games,samples:agg.samples,degenerate:agg.degeneratePolicies,
  endings:agg.endings,winnerSide:agg.winnerSide,seconds:(elapsedMs/1000).toFixed(1)}));
})().catch(e=>{console.error("G6PAR_FATAL",e);process.exitCode=1;});
