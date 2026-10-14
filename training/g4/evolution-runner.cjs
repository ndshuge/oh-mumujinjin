"use strict";
// G5 orchestration: existing 64-agent engine, immutable results, resumable generations.
// Usage: node training/g4/evolution-runner.cjs [generations=5] [rounds=3] [budget=120] [workers=2]
const fs=require("fs"),path=require("path"),{spawn}=require("child_process");
const here=__dirname,league=path.join(here,"../league"),lab=path.join(here,"../output/lab/g4");
const count=Number(process.argv[2]??5),rounds=Number(process.argv[3]??3),budget=Number(process.argv[4]??120),workers=Number(process.argv[5]??2);
if(!Number.isInteger(count)||count<1||count>20||!Number.isInteger(rounds)||rounds<3||rounds>21||!Number.isInteger(budget)||budget<50||budget>6000||!Number.isInteger(workers)||workers<1||workers>3)throw Error("Usage: evolution-runner.cjs generations rounds budget workers");
fs.mkdirSync(lab,{recursive:true});const statusPath=path.join(lab,"evolution-runner-status.json"),seed=20261014,baseOffset=760;
const roster=g=>"population-g"+g+"-64.json",file=g=>path.join(here,roster(g));
const receipt=g=>path.join(lab,"g4-run-"+g+"-"+rounds+"r-b"+budget+"-s"+seed+".final.json");
let start=0;while(fs.existsSync(file(start+1))&&start<20)start++;if(!fs.existsSync(file(start)))throw Error("Missing initial population");
let current=start,done=0,child=null,failed=null;
const write=()=>fs.writeFileSync(statusPath,JSON.stringify({schema:"g5-evolution-runner-v1",state:failed?"FAILED":done===count?"COMPLETE":"RUNNING",currentGeneration:current,completedGenerations:done,targetGenerations:count,rounds,budget,workers,champion:"g4-h13",championAutoPromotion:false,childPid:child?.pid||null,error:failed,updatedAt:new Date().toISOString()},null,2));
function execute(g){return new Promise((resolve,reject)=>{const args=[path.join(here,"run64.cjs"),roster(g),String(rounds),String(budget),String(workers),String(seed),String(baseOffset+g*60)];const p=spawn(process.execPath,args,{cwd:path.resolve(here,"../.."),windowsHide:true,stdio:["ignore","pipe","pipe"]});child=p;write();let tail="";for(const stream of [p.stdout,p.stderr])stream.on("data",b=>{tail=(tail+b.toString()).slice(-5000);});p.on("error",reject);p.on("close",code=>{child=null;if(code===0&&fs.existsSync(receipt(g))&&fs.existsSync(file(g+1)))resolve();else reject(Error("Generation "+g+" failed code "+code+": "+tail));});});}
(async()=>{try{write();while(done<count){const g=current;if(fs.existsSync(receipt(g))&&fs.existsSync(file(g+1))){console.log("GENERATION_REUSE",g);}else if(fs.existsSync(file(g+1))&&!fs.existsSync(receipt(g))){throw Error("Existing offspring without accepted receipt at "+g+"; manual audit needed");}else await execute(g);done++;current++;write();console.log("GENERATION_ACCEPTED",JSON.stringify({generation:g,completed:done,of:count,nextRoster:roster(current)}));}console.log("EVOLUTION_COMPLETE",statusPath);}catch(e){failed=String(e);write();console.error("EVOLUTION_FAILED",failed);process.exitCode=1;}})();
