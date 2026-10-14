"use strict";
// Execute G4 64-agent result-only league, honoring a separately running round.
// A completed round is immutable; incomplete matches resume by index. All
// external results are supervised through real persistent Node processes.
const fs=require("fs"),path=require("path"),{spawn}=require("child_process");
const rosterName=process.argv[2]||"population-g0-64.json",
 rounds=Number(process.argv[3]??6),budget=Number(process.argv[4]??260),
 workers=Number(process.argv[5]??1),seed=Number(process.argv[6]??20261014),
 baseOffset=Number(process.argv[7]??760);
if(!/^[a-z0-9_-]+\.json$/.test(rosterName)||!Number.isInteger(rounds)||rounds<3||rounds>21||
 !Number.isInteger(budget)||budget<50||budget>6000||!Number.isInteger(workers)||workers<1||workers>3||
 !Number.isInteger(seed)||!Number.isInteger(baseOffset)||baseOffset<0)throw Error("Invalid run64 args");
const root=__dirname,lab=path.join(root,"..","output","lab","g4"),
 roster=JSON.parse(fs.readFileSync(path.join(root,rosterName),"utf8"));
if(roster.agents.length!==64)throw Error("Not G4-64 population");
fs.mkdirSync(lab,{recursive:true});
const id="g4-run-"+roster.generation+"-"+rounds+"r-b"+budget+"-s"+seed,
 progressFile=path.join(lab,id+".progress.json"),doneFile=path.join(lab,id+".final.json"),
 start=Date.now();
if(fs.existsSync(doneFile))throw Error("Already finished: "+doneFile);
let inFlight=0,nextRound=0,error=null,complete=new Set();
const reportFor=i=>path.join(lab,"gen"+roster.generation+"-round"+i+"-b"+budget+"-s"+seed+".report.json"),
 resultsFor=i=>path.join(lab,"gen"+roster.generation+"-round"+i+"-b"+budget+"-s"+seed+".results.jsonl");
function refresh(){
 let played=0;
 for(let i=0;i<rounds;i++){
  const f=resultsFor(i);
  if(fs.existsSync(f))played+=fs.readFileSync(f,"utf8").split("\n").filter(Boolean).length;
 }
 const report={id,state:error?"failed":complete.size===rounds?"complete":"running",
  generation:roster.generation,roster:rosterName,completedRounds:complete.size,targetRounds:rounds,
  completedGames:played,plannedGames:rounds*64,agents:64,perAgentPlannedGames:rounds*2,
  budgetPerMoveMs:budget,liveWorkers:inFlight,elapsedMs:Date.now()-start,
  resultOnly:true,notes:"No individual chess move transcript stored",
  error:error?String(error):null};
 fs.writeFileSync(progressFile,JSON.stringify(report,null,2));
 return report;
}
function accepted(i){
 const path=reportFor(i);
 if(!fs.existsSync(path))return false;
 const result=JSON.parse(fs.readFileSync(path,"utf8"));
 if(result.matches!==64||result.illegal!==0||!result.complete)throw Error("Invalid round "+i);
 if(fs.readFileSync(resultsFor(i),"utf8").trim().split("\n").length!==64)throw Error("Missing outcome lines "+i);
 complete.add(i);return true;
}
for(let i=0;i<rounds;i++)accepted(i);
const log=(event,info)=>console.log(event,JSON.stringify(info));
let interval=setInterval(()=>{if(!error)refresh();},15000);
function done(){
 if(complete.size!==rounds)throw Error("Not all rounds completed");
 const args=[path.join(root,"select64.cjs"),rosterName,String(rounds),String(budget),String(seed)];
 const p=spawn(process.execPath,args,{cwd:path.resolve(root,"..",".."),windowsHide:true,
  stdio:["ignore","pipe","pipe"]});
 let output="",err="";
 p.stdout.on("data",c=>output+=c.toString());p.stderr.on("data",c=>err+=c.toString());
 p.on("close",code=>{
  clearInterval(interval);
  if(code!==0){error=Error("Select64 failed "+code+": "+err+" "+output);refresh();log("G4_ERROR",{error:String(error)});process.exitCode=1;return;}
  const final={...refresh(),status:"complete",selection:output.trim().split("\n").at(-1),
   endedAt:new Date().toISOString()};
  fs.writeFileSync(doneFile,JSON.stringify(final,null,2));
  log("G4_GENERATION_COMPLETE",{generations:1,games:rounds*64,selection:final.selection,
   finalFile:doneFile});
 });
}
function pump(){
 if(error)return;
 while(inFlight<workers&&nextRound<rounds){
  const round=nextRound++;
  if(accepted(round))continue;
  const p=spawn(process.execPath,[path.join(root,"matchday64.cjs"),rosterName,
     String(round),String(budget),String(baseOffset),String(seed)],
    {cwd:path.resolve(root,"..",".."),windowsHide:true,stdio:["ignore","pipe","pipe"]});
  inFlight++;refresh();let tail="",err="";
  p.stdout.on("data",b=>{tail+=b.toString();if(tail.length>3000)tail=tail.slice(-3000);});
  p.stderr.on("data",b=>{err+=b.toString();if(err.length>3000)err=err.slice(-3000);});
  p.on("close",code=>{
   inFlight--;
   if(code!==0){error=Error("Round "+round+" failed "+code+" "+err+" "+tail);
    refresh();log("G4_ERROR",{error:String(error)});clearInterval(interval);process.exitCode=1;return;}
   try{accepted(round);}catch(e){error=e;refresh();clearInterval(interval);process.exitCode=1;return;}
   log("G4_ROUND_DONE",{round,completeRounds:complete.size,totalRounds:rounds});
   refresh();pump();
  });
  p.on("error",e=>{error=e;refresh();clearInterval(interval);process.exitCode=1;});
 }
 if(nextRound===rounds&&inFlight===0){
  if(complete.size!==rounds)throw Error("Incomplete rounds despite zero active workers");
  done();
 }
}
log("G4_LEAGUE_START",{roster:rosterName,rounds,plannedGames:rounds*64,workers,
 budgetPerMoveMs:budget,alreadyAccepted:complete.size});
refresh();pump();
