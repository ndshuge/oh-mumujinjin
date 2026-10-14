"use strict";
// Persistently finish the four 100-game scorecards once all actual matches end.
// This process only generates the result summary; it never promotes a model.
const fs=require("fs"),path=require("path"),{spawnSync}=require("child_process");
const dir=path.join(__dirname,"..","output","lab"),ids=["odd-hawks","odd-tunnel","odd-tortoise","odd-dreamer"],
 required=ids.map(id=>path.join(dir,"challenge-"+id+"-1310-50-b350.json")),
 marker=path.join(dir,"g4","CHALLENGE_RESULTS_FINALIZED.json");
let cycles=0;
function check(){
 const ready=required.filter(f=>fs.existsSync(f));
 if(++cycles%6===1)console.log("G4_WAIT_CHECK",JSON.stringify({ready:ready.length,total:required.length,
  missing:required.filter(f=>!fs.existsSync(f)).map(x=>path.basename(x))}));
 if(ready.length!==required.length)return;
 for(const f of required){
  const r=JSON.parse(fs.readFileSync(f,"utf8"));
  if(r.games!==100||r.mapCount!==50||r.illegal!==0||!Array.isArray(r.pairedBootstrap95))
   throw Error("Invalid match result "+f);
 }
 const r=spawnSync(process.execPath,[path.join(__dirname,"challenge-results.cjs")],
  {cwd:path.resolve(__dirname,"..",".."),encoding:"utf8",timeout:30000,windowsHide:true});
 if(r.status!==0)throw Error("Summary failed "+r.stderr+" "+r.stdout);
 const result={state:"complete",candidates:4,games:400,
  sourceFiles:required.map(f=>path.basename(f)),
  generatedAt:new Date().toISOString(),promotionApproved:false};
 fs.writeFileSync(marker,JSON.stringify(result,null,2));
 console.log("G4_100_RESULT_FILES_READY",r.stdout.trim());
 clearInterval(timer);process.exitCode=0;
}
const timer=setInterval(()=>{try{check();}catch(e){console.error("G4_FINALIZE_ERROR",String(e));
 clearInterval(timer);process.exitCode=1;}},20000);
check();
