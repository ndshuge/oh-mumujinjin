"use strict";
const fs=require("fs"),path=require("path"),{spawn}=require("child_process");
const offset=Math.max(0,Number(process.argv[2]||1660)),pairs=Math.max(4,Number(process.argv[3]||100)),shards=Math.max(1,Number(process.argv[4]||10)),budget=Math.max(100,Number(process.argv[5]||220)),depth=Math.max(1,Number(process.argv[6]||2)),batch=pairs/shards;
if(!Number.isInteger(batch))throw Error("Pairs must divide evenly into shards");
const outDir=path.join(__dirname,"output"),running=new Map(),done=[];
let started=Date.now(),failed=false,seq=0;
function save(status){const report={status,completedGames:done.reduce((n,v)=>n+v.games,0),targetGames:2*pairs,
 wins:done.reduce((n,v)=>n+v.challenger.wins,0),losses:done.reduce((n,v)=>n+v.challenger.losses,0),
 draws:done.reduce((n,v)=>n+v.challenger.draws,0),shardsCompleted:done.length,shardsTotal:shards,
 elapsedMs:Date.now()-started};
 fs.writeFileSync(path.join(outDir,"v3-progress-"+offset+"-d"+depth+".json"),JSON.stringify(report,null,2));return report;}
function finish(){
 const records=done.flatMap(x=>x.records),maps=new Set(records.map(x=>x.map));
 if(records.length!==pairs*2||maps.size!==pairs)throw Error("Broken paired count");
 const scores=[];
 for(const map of maps){
  const games=records.filter(g=>g.map===map);
  if(games.length!==2||games[0].seat===games[1].seat)throw Error("Unpaired map "+map);
  scores.push(games.reduce((sum,g)=>sum+(g.winner==="challenger"?1:g.winner===null?.5:0),0)/2);
 }
 let seed=96243;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const boot=[];
 for(let j=0;j<5000;j++){let z=0;for(let i=0;i<pairs;i++)z+=scores[Math.floor(rand()*pairs)];boot.push(z/pairs);}
 boot.sort((a,b)=>a-b);
 const summary={
  maps:pairs,games:pairs*2,challengerDepth:depth,baseline:"strong-search-v1.1",challenger:"strong-search-v3",
  budgetMs:budget,offset,wins:done.reduce((n,x)=>n+x.challenger.wins,0),
  losses:done.reduce((n,x)=>n+x.challenger.losses,0),
  draws:done.reduce((n,x)=>n+x.challenger.draws,0),
  pairedBootstrap95:[boot[125],boot[4875]],
  illegal:done.reduce((n,x)=>n+x.illegal,0),
  terminal:done.reduce((acc,x)=>{for(const[k,v]of Object.entries(x.terminal))acc[k]=(acc[k]||0)+v;return acc;},{}),
  latencyShards:done.map(x=>x.latency),
  elapsedMs:Date.now()-started,
  gate:"NOT_PROMOTED_BEFORE_1000_AND_MOBILE",
  records
 };
 fs.writeFileSync(path.join(outDir,"v3-arena-report-"+offset+"-d"+depth+".json"),JSON.stringify(summary,null,2));
 console.log("FINAL_AB",JSON.stringify({...summary,records:undefined}));
 save("complete");
}
function launch(){
 while(!failed&&running.size<10&&seq<shards){
  const id=seq++,start=offset+id*batch;
  const p=spawn(process.execPath,[path.join(__dirname,"arena-v3.cjs"),String(start),String(batch),String(budget),String(depth)],
   {cwd:path.resolve(__dirname,".."),stdio:["ignore","pipe","pipe"],windowsHide:true});
  running.set(id,p);let out="",err="";
  p.stdout.on("data",c=>{out+=c.toString();if(out.length>15000)out=out.slice(-15000);});
  p.stderr.on("data",c=>{err+=c.toString();if(err.length>5000)err=err.slice(-5000);});
  p.on("close",code=>{
   running.delete(id);
   if(code!==0){failed=true;console.error("SHARD_ERROR",id,code,err,out);save("failed");for(const proc of running.values())proc.kill();process.exitCode=1;return;}
   try{
    const report=JSON.parse(fs.readFileSync(path.join(outDir,"v3-shard-"+start+"-d"+depth+".json"),"utf8"));
    if(report.games!==batch*2||report.maps!==batch)throw Error("Wrong shard games");
    done.push(report);console.log("CHECKPOINT",JSON.stringify(save("running")));
   }catch(e){failed=true;console.error(e);process.exitCode=1;return;}
   launch();
   if(seq===shards&&running.size===0)finish();
  });
  p.on("error",e=>{failed=true;console.error(e);process.exitCode=1;});
 }
}
fs.mkdirSync(outDir,{recursive:true});save("running");
console.log("START_AB",JSON.stringify({maps:pairs,games:pairs*2,workers:shards,budgetMs:budget}));
launch();
