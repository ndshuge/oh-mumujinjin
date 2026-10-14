"use strict";
// Automatically produce the final benchmark summary only after both 120-game
// reports have finished; never changes the model or releases it publicly.
const fs=require("fs"),path=require("path"),{spawnSync}=require("child_process");
const dir=path.join(__dirname,"..","output","lab","g4");
const required=["odd-hawks","odd-dreamer"].map(id=>path.join(dir,"fresh-challenge-"+id+"-1-60-b600.json"));
let cycles=0;
function check(){
 const ready=required.filter(f=>fs.existsSync(f));
 if(++cycles%10===1)console.log("FRESH_WAIT",JSON.stringify({finished:ready.length,expected:required.length}));
 if(ready.length!==required.length)return;
 const r=spawnSync(process.execPath,[path.join(__dirname,"fresh-results.cjs")],
  {cwd:path.resolve(__dirname,"..",".."),windowsHide:true,encoding:"utf8",timeout:30000});
 if(r.status!==0)throw Error("Benchmark aggregation failed "+r.stderr+" "+r.stdout);
 fs.writeFileSync(path.join(dir,"FRESH_CHALLENGE_COMPLETE.lock.json"),
  JSON.stringify({status:"finished",models:2,games:240,promotionApproved:false,
   timestamp:new Date().toISOString()},null,2));
 console.log("FRESH_BENCHMARK_FINAL",r.stdout.trim());
 clearInterval(timer);
}
const timer=setInterval(()=>{try{check();}catch(e){console.error("FRESH_FINALIZE_ERROR",String(e));
 clearInterval(timer);process.exitCode=1;}},20000);
check();
