"use strict";
// Resume-safe sharded D0 laboratory runner. No task queue, no remote API.
// Usage: node training/lab-batch.cjs train 3000 100 8 90 20261014
const fs=require("fs"),path=require("path"),{spawn}=require("child_process"),crypto=require("crypto");
const root=path.join(__dirname,"output","lab");
const [split,startString,gamesString,workersString,budgetString,seedString]=process.argv.slice(2);
const start=Number(startString??2300),games=Number(gamesString??20),workers=Number(workersString??4),
 budget=Number(budgetString??90),seed=Number(seedString??20261014);
if(!["train","heldOut"].includes(split)||![start,games,workers,budget,seed].every(Number.isInteger)||
 start<0||games<1||games>10000||workers<1||workers>12||budget<50||budget>3000)
 throw Error("Usage: lab-batch.cjs train|heldOut start(>=0) games(1..10000) workers(1..12) budgetMs(50..3000) seed");
fs.mkdirSync(root,{recursive:true});
const id="batch-"+split+"-"+start+"-"+games+"-w"+workers+"-b"+budget+"-s"+seed;
const reportFile=path.join(root,id+".report.json"),progressFile=path.join(root,id+".progress.json");
if(fs.existsSync(reportFile))throw Error("Completed run already exists: "+reportFile);
const CHUNK=20,parts=[];
for(let j=0;j<games;j+=CHUNK)
 parts.push({start:start+j,count:Math.min(CHUNK,games-j),seed:seed+j});
let launched=0,complete=0,failed=false;
const running=new Map(),results=[],begin=Date.now();
function progress(status){
 const summary={
  id,status,completedGames:results.reduce((a,r)=>a+r.completed,0),targetGames:games,
  activeShards:running.size,completeShards:complete,totalShards:parts.length,
  legalActions:results.reduce((a,r)=>a+r.actions,0),
  invalidActions:results.reduce((a,r)=>a+r.invalid,0),
  samples:results.reduce((a,r)=>a+r.generatedExamples,0),
  elapsedMs:Date.now()-begin};
 fs.writeFileSync(progressFile,JSON.stringify(summary,null,2));return summary;
}
function completeAll(){
 const maps=new Set(),records=[],outputs=[];
 for(const r of results){
  const f=path.join(root,r.files[0]);
  outputs.push(...r.files);
  for(const line of fs.readFileSync(f,"utf8").trim().split("\n")){
   if(!line)continue;
   const item=JSON.parse(line);
   maps.add(item.map.rocks.map(p=>p.x+","+p.y).sort().join("|"));
   records.push(item);
  }
 }
 if(records.length!==games||results.length!==parts.length)throw Error("Missing records");
 const hashes=new Set(records.map(r=>r.sha256));if(hashes.size!==games)throw Error("Duplicate whole-game transcripts");
 const ending={goal:0,noMovement:0,repetition:0,cap:0},winners=[0,0];let draws=0;
 for(const game of records){
  ending[game.ending]=(ending[game.ending]||0)+1;
  if(game.winner===null)draws++;else winners[game.winner]++;
 }
 const summary={id,split,engine:"strong-search-v1.1",count:games,uniqueMapLayouts:maps.size,
  repeatedMapGames:games-maps.size,sourceMapBank:"s0-records train/heldOut canonical map-hash split",
  budgetMs:budget,seed,searchMeanBudgetLabel:"timeMs max; actual time measured per shard",
  actions:results.reduce((a,r)=>a+r.actions,0),illegal:results.reduce((a,r)=>a+r.invalid,0),
  samples:results.reduce((a,r)=>a+r.generatedExamples,0),
  walls:results.reduce((a,r)=>a+r.wallMoves,0),warps:results.reduce((a,r)=>a+r.warps,0),
  endings:ending,winner:winners,draws,elapsedMs:Date.now()-begin,
  shards:parts.length,artifacts:outputs};
 fs.writeFileSync(reportFile,JSON.stringify(summary,null,2));
 console.log("BATCH_DONE",JSON.stringify({...summary,artifacts:undefined}));
 progress("complete");
}
function launch(){
 while(!failed&&running.size<workers&&launched<parts.length){
  const p=parts[launched++],idpart=split+"-"+p.start+"-"+p.count+"-b"+budget+"-s"+p.seed;
  const report=path.join(root,idpart+".report.json");
  if(fs.existsSync(report)){failed=true;throw Error("Existing shard output, stop rather than silently overwrite "+idpart);}
  const args=[path.join(__dirname,"lab-selfplay.cjs"),split,String(p.start),String(p.count),String(budget),String(p.seed)];
  const child=spawn(process.execPath,args,{cwd:path.resolve(__dirname,".."),windowsHide:true,stdio:["ignore","pipe","pipe"]});
  running.set(idpart,child);
  let stdout="",stderr="";
  child.stdout.on("data",x=>{stdout+=x.toString();if(stdout.length>2000)stdout=stdout.slice(-2000);});
  child.stderr.on("data",x=>{stderr+=x.toString();if(stderr.length>2000)stderr=stderr.slice(-2000);});
  child.on("close",code=>{
   running.delete(idpart);
   if(code!==0||!fs.existsSync(report)){
    failed=true;console.error("LAB_BATCH_SHARD_FAILED",idpart,code,stderr,stdout);
    for(const proc of running.values())proc.kill();
    progress("failed");process.exitCode=1;return;
   }
   try{
    const r=JSON.parse(fs.readFileSync(report,"utf8"));
    if(r.completed!==p.count||r.invalid!==0)throw Error("Incomplete/invalid shard");
    results.push(r);complete++;
    console.log("BATCH_CHECKPOINT",JSON.stringify(progress("running")));
    launch();
    if(!running.size&&launched===parts.length)completeAll();
   }catch(e){failed=true;console.error("LAB_BATCH_INVALID",String(e));process.exitCode=1;}
  });
  child.on("error",e=>{failed=true;console.error("LAB_BATCH_SPAWN",e);process.exitCode=1;});
 }
}
progress("running");console.log("BATCH_START",JSON.stringify({id,games,workers,shards:parts.length,budget,split}));
launch();
