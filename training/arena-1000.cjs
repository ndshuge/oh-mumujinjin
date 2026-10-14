"use strict";
// Sharded paired evaluation on 500 disjoint held-out maps (1000 total games).
// Never automatically promote the experimental engine.
const fs=require("fs"),path=require("path"),{spawn}=require("child_process");
const DIR=path.join(__dirname,"output"),PAIRS=500,SHARDS=10,PER=PAIRS/SHARDS;
const DEPTH=Number(process.argv[2]||2),TIME_MS=Number(process.argv[3]||220),OFFSET=1100;
const results=new Array(SHARDS),active=new Map();
const started=Date.now(),MAX_WORKERS=Math.min(SHARDS,Number(process.argv[4]||10));
if(![1,2,3,4].includes(DEPTH)||TIME_MS<50||TIME_MS>1500||MAX_WORKERS<1)throw Error("invalid benchmark params");
function quickReport(){
 const completed=results.filter(Boolean),wins=completed.reduce((x,r)=>x+r.outcomes.strong.wins,0),
 games=completed.reduce((x,r)=>x+r.games,0);
 const out={status:games===1000?"complete":"running",games,expectedGames:1000,shardsDone:completed.length,shardsTotal:SHARDS,
 wins,losses:completed.reduce((x,r)=>x+r.outcomes.strong.losses,0),draws:completed.reduce((x,r)=>x+r.outcomes.strong.draws,0),
 illegal:completed.reduce((x,r)=>x+r.outcomes.illegal,0),elapsedMs:Date.now()-started,depth:DEPTH,perMoveBudgetMs:TIME_MS};
 fs.writeFileSync(path.join(DIR,"hell-ai-1000-progress.json"),JSON.stringify(out,null,2));return out;
}
function summarize(){
 const records=results.flatMap(r=>r.records);
 if(records.length!==1000)throw Error("not exactly 1000 games");
 const maps=new Set(records.map(r=>r.map));if(maps.size!==500)throw Error("map duplicate/overlap "+maps.size);
 for(const map of maps){const turns=records.filter(r=>r.map===map);if(turns.length!==2||turns[0].seat===turns[1].seat)throw Error("invalid pair "+map);}
 const elapsed=Date.now()-started,win=results.reduce((x,r)=>x+r.outcomes.strong.wins,0),
 loss=results.reduce((x,r)=>x+r.outcomes.strong.losses,0),draw=results.reduce((x,r)=>x+r.outcomes.strong.draws,0),
 illegal=results.reduce((x,r)=>x+r.outcomes.illegal,0),
 terminal={goal:results.reduce((x,r)=>x+r.outcomes.goal,0),repetition:results.reduce((x,r)=>x+r.outcomes.repetitions,0),
 cap:results.reduce((x,r)=>x+r.outcomes.cap,0),noActions:results.reduce((x,r)=>x+(r.outcomes["no-actions"]||0),0)};
 let timings=results.flatMap(r=>r.outcomes.strongMs).sort((a,b)=>a-b),pth=p=>timings[Math.floor((timings.length-1)*p)];
 let pairs=[];
 for(let i=0;i<records.length;i+=2){const g=records.slice(i,i+2);pairs.push(g.reduce((s,r)=>s+(r.winName==="strong"?1:r.winName===null?.5:0),0)/2);}
 const point=pairs.reduce((s,v)=>s+v,0)/pairs.length,bootstrap=[];
 let seed=370527;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let j=0;j<5000;j++){let sum=0;for(let i=0;i<500;i++)sum+=pairs[Math.floor(rand()*500)];bootstrap.push(sum/500);}
 bootstrap.sort((a,b)=>a-b);
 const lower=bootstrap[125],upper=bootstrap[4875];
 const payload={
 benchmark:"1000 paired games: 500 held-out maps, two swapped sides each",version:"strong-search-v1.1",mapOffset:OFFSET,
 maps:maps.size,games:1000,depth:DEPTH,timeBudgetMs:TIME_MS,
 outcomes:{wins:win,losses:loss,draws:draw,scoreRate:point},terminal,illegalMoves:illegal,elapsedMs:elapsed,
 latencyMs:{p50:pth(.5),p95:pth(.95),max:timings.at(-1)},pairedBootstrap95:[lower,upper],
 approval:"NOT_APPROVED",
 threshold:{paired95LowerAboveHalf:lower>.5,allActionsLegal:illegal===0,played1000:records.length===1000,
 NOTE:"Statistical threshold alone is insufficient; must pass browser/web worker mobile regression before deployment."},
 shards:results.map((r,i)=>({i,pairs:r.maps,games:r.games,wins:r.outcomes.strong.wins,losses:r.outcomes.strong.losses,draws:r.outcomes.strong.draws}))
 };
 fs.writeFileSync(path.join(DIR,"hell-ai-1000-report.json"),JSON.stringify(payload,null,2));
 console.log("FINAL_1000",JSON.stringify(payload));
}
let next=0,failed=false;
function launch(){
 while(!failed&&next<SHARDS&&active.size<MAX_WORKERS){
  const id=next++,offset=OFFSET+id*PER;
  const child=spawn(process.execPath,[path.join(__dirname,"strong-arena.cjs"),String(PER),String(offset),String(DEPTH),String(TIME_MS)],
   {cwd:path.resolve(__dirname,".."),windowsHide:true,stdio:["ignore","pipe","pipe"]});
  active.set(id,child);
  let stderr="",stdout="";
  child.stdout.on("data",data=>{stdout+=data.toString();if(stdout.length>120000)stdout=stdout.slice(-120000);});
  child.stderr.on("data",data=>{stderr+=data.toString();if(stderr.length>4000)stderr=stderr.slice(-4000);});
  child.on("close",code=>{
    active.delete(id);
    if(code!==0){failed=true;console.error("FAIL_SHARD",id,"exit",code,stderr,stdout.slice(-2000));}
    else{
      try{
        const name="strong-v1-arena-"+offset+"-d"+DEPTH+".json";
        const report=JSON.parse(fs.readFileSync(path.join(DIR,name),"utf8"));
        if(report.games!==2*PER||report.maps!==PER||report.mapsOffset!==offset)throw Error("incorrect shard "+name);
        results[id]=report;
        const state=quickReport();
        console.log("CHECKPOINT",JSON.stringify({id,offset,completed:state.games,wins:state.wins,
         losses:state.losses,draws:state.draws,elapsedMs:state.elapsedMs}));
      }catch(e){failed=true;console.error("INVALID_SHARD",id,e);}
    }
    if(failed){for(const proc of active.values())proc.kill();process.exitCode=1;return;}
    launch();
    if(!active.size&&next===SHARDS){try{summarize();}catch(e){console.error("REPORT_FAILED",e);process.exitCode=1;}}
  });
  child.on("error",e=>{failed=true;console.error("SPAWN_FAIL",id,e);});
 }
}
fs.mkdirSync(DIR,{recursive:true});
quickReport();
console.log("START_1000",JSON.stringify({pairs:PAIRS,shards:SHARDS,workers:MAX_WORKERS,offset:OFFSET,depth:DEPTH,timeBudgetMs:TIME_MS}));
launch();
