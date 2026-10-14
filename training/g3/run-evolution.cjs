"use strict";
// G3 evolutionary run controller. A single local process runs matchdays,
// verifies generation receipts, and breeds 16 survivors + 16 offspring.
// Not a task service, no remote calls, no individual move storage.
const fs=require("fs"),path=require("path"),{spawn}=require("child_process");
const pop0=process.argv[2]||"population-g0.json",
 generations=Number(process.argv[3]??2),
 rounds=Number(process.argv[4]??3),
 budget=Number(process.argv[5]??180),
 workers=Number(process.argv[6]??3),
 seed=Number(process.argv[7]??20261014),
 baseOffset=Number(process.argv[8]??520);
if(!/^[a-zA-Z0-9_-]+\.json$/.test(pop0)||!Number.isInteger(generations)||generations<1||generations>10||
 !Number.isInteger(rounds)||rounds<1||rounds>15||!Number.isInteger(workers)||workers<1||workers>3||
 !Number.isInteger(budget)||budget<50||budget>6000||!Number.isInteger(seed)||!Number.isInteger(baseOffset)||baseOffset<0)
 throw Error("Usage: node training/g3/run-evolution.cjs population-g0.json generations rounds budgetMs workers seed mapOffset");
const root=__dirname,data=path.join(root,"..","output","lab","g3");
fs.mkdirSync(data,{recursive:true});
const ident="evolution-"+path.basename(pop0,".json")+"-"+generations+"gen-"+rounds+"rounds-b"+budget+"-s"+seed;
const progressPath=path.join(data,ident+".progress.json"),finalPath=path.join(data,ident+".final.json");
if(fs.existsSync(finalPath))throw Error("Experiment already finished; refuse to overwrite");
const begin=Date.now(),progress={id:ident,status:"running",startedAt:new Date().toISOString(),
 targetGenerations:generations,completedGenerations:0,currentGeneration:null,
 generationRounds:rounds,matchesPerGeneration:32*rounds,totalExpectedMatches:generations*32*rounds,
 totalMatchesCompleted:0,budgetMs:budget,seed,baseOffset,activeProcesses:0,
 selectedPopulations:[],latestWinners:[],lastError:null,elapsedMs:0};
const children=new Set();
const write=()=>{progress.elapsedMs=Date.now()-begin;fs.writeFileSync(progressPath,JSON.stringify(progress,null,2));};
const runCommand=(args,withProgress=false)=>new Promise((resolve,reject)=>{
 const p=spawn(process.execPath,args,{cwd:path.resolve(root,"..",".."),windowsHide:true,stdio:["ignore","pipe","pipe"]});
 children.add(p);progress.activeProcesses=children.size;write();
 let err="",out="";
 p.stdout.on("data",bytes=>{
  const value=bytes.toString();out+=value;if(out.length>12000)out=out.slice(-12000);
  for(const line of value.split(/\r?\n/)){
   if(withProgress&&line.startsWith("G3_CHECKPOINT ")){
    try{
     const x=JSON.parse(line.slice("G3_CHECKPOINT ".length));
     progress.roundProgress[x.round]=Math.max(progress.roundProgress[x.round]||0,x.completed);
     progress.totalMatchesCompleted=progress.completedGenerations*rounds*32+
      Object.values(progress.roundProgress).reduce((a,b)=>a+b,0);
     write();
    }catch{}
   }
  }
 });
 p.stderr.on("data",bytes=>{err+=bytes.toString();if(err.length>3000)err=err.slice(-3000);});
 p.on("close",code=>{
  children.delete(p);progress.activeProcesses=children.size;write();
  if(code!==0)reject(Error("Child "+args[0]+" exit="+code+" "+err+" "+out.slice(-1600)));
  else resolve(out);
 });
 p.on("error",reject);
});
async function runGeneration(popName){
 const pop=JSON.parse(fs.readFileSync(path.join(root,popName),"utf8"));
 progress.currentGeneration=pop.generation;progress.roundProgress={};write();
 let next=0,done=0,failed=null;
 const nextRound=async()=>{
  while(next<rounds&&!failed){
   const n=next++;
   const name="gen"+pop.generation+"-round"+n+"-b"+budget+"-s"+seed+".report.json";
   if(fs.existsSync(path.join(data,name))){
    progress.roundProgress[n]=32;done++;write();continue;
   }
   try{
    await runCommand([path.join(root,"matchday.cjs"),popName,String(n),String(budget),String(baseOffset+pop.generation*400),
      String(seed)],true);
    progress.roundProgress[n]=32;done++;
    console.log("G3_ROUND_ACCEPTED",JSON.stringify({generation:pop.generation,round:n,complete:done+"/"+rounds}));
    write();
   }catch(e){failed=e;for(const p of children)p.kill();break;}
  }
 };
 await Promise.all(Array.from({length:Math.min(workers,rounds)},nextRound));
 if(failed)throw failed;
 if(done!==rounds)throw Error("Incomplete generation rounds");
 const output=await runCommand([path.join(root,"select-and-breed.cjs"),popName,String(rounds),String(budget),String(seed)]);
 progress.completedGenerations++;progress.totalMatchesCompleted=progress.completedGenerations*rounds*32;
 progress.selectedPopulations.push({generation:pop.generation,source:popName,
   nextPopulation:"population-g"+(pop.generation+1)+".json"});
 const summaryName="evolution-g"+pop.generation+"-r"+rounds+"-b"+budget+"-s"+seed+".json",
  s=JSON.parse(fs.readFileSync(path.join(data,summaryName),"utf8"));
 progress.latestWinners=s.ranking.slice(0,5).map(x=>({id:x.id,wins:x.wins,losses:x.losses,draws:x.draws,winRate:x.winRate}));
 write();console.log("G3_GENERATION_FINISHED",output.trim().split("\n").at(-1));
 return "population-g"+(pop.generation+1)+".json";
}
(async()=>{
 try{
  write();
  let p=pop0;
  console.log("G3_EVOLUTION_START",JSON.stringify({ident,generations,rounds,
    gamesPerGeneration:rounds*32,budgetMs:budget,workers}));
  for(let g=0;g<generations;g++)p=await runGeneration(p);
  progress.status="complete";progress.currentGeneration=null;write();
  fs.writeFileSync(finalPath,JSON.stringify({...progress,finishedAt:new Date().toISOString()},null,2));
  console.log("G3_EVOLUTION_COMPLETE",JSON.stringify({generations,completedGames:progress.totalMatchesCompleted,
   latestTop:progress.latestWinners,nextPopulation:p,finalPath}));
 }catch(e){
  progress.status="failed";progress.lastError=String(e);write();
  console.error("G3_EVOLUTION_FAILED",String(e));process.exitCode=1;
 }
})();
