"use strict";
// Development-only champion series, games contain only outcomes, not moves.
// Every candidate plays the SAME maps against V1.1 with sides swapped.
// Parallel workers report durable results; 0 never counts as unavailable data.
const fs=require("fs"),path=require("path"),{spawn}=require("child_process");
const rosterName=process.argv[2]||"population-strange.json",
 pairs=Number(process.argv[3]??4),budget=Number(process.argv[4]??250),
 offset=Number(process.argv[5]??1100),workers=Number(process.argv[6]??3);
if(!/^[a-z0-9_-]+\.json$/.test(rosterName)||!Number.isInteger(pairs)||pairs<1||pairs>200||
 !Number.isInteger(budget)||budget<50||budget>6000||!Number.isInteger(offset)||offset<0||
 !Number.isInteger(workers)||workers<1||workers>5)throw Error("Usage: champion-series.cjs roster.json pairedMaps budgetMs offset workers");
const roster=JSON.parse(fs.readFileSync(path.join(__dirname,"..","league",rosterName),"utf8"));
const agents=roster.agents,dir=path.join(__dirname,"..","output","lab","g3"),
 id="champions-"+rosterName.replace(/\.json$/,"")+"-"+offset+"-"+pairs+"-b"+budget,
 progressFile=path.join(dir,id+".progress.json"),resultFile=path.join(dir,id+".json"),
 markdownFile=path.join(dir,id+".md");
if(fs.existsSync(resultFile))throw Error("Series result exists, refuse overwrite");
const done=[],running=new Map();let index=0,failed=null;
const beginning=Date.now();
const write=(status)=>{
 const result={id,status,candidates:agents.length,finished:done.length,active:running.size,
 totalGamesPlanned:agents.length*pairs*2,completedGames:done.length*pairs*2,
 budgetMs:budget,mapPairs:pairs,elapsedMs:Date.now()-beginning,
 leaderboard:done.slice().sort((a,b)=>b.scoreRate-a.scoreRate).map(x=>({id:x.candidate,wins:x.wins,losses:x.losses,draws:x.draws,scoreRate:x.scoreRate})),
 error:failed?String(failed):null};
 fs.writeFileSync(progressFile,JSON.stringify(result,null,2));
 return result;
};
function resultPath(a){return path.join(__dirname,"..","output","lab","challenge-"+a.id+"-"+offset+"-"+pairs+"-b"+budget+".json");}
function saveFinal(){
 if(done.length!==agents.length||done.some(x=>x.games!==pairs*2||x.illegal!==0))throw Error("Incomplete champion tournament");
 const ranked=done.slice().sort((a,b)=>b.scoreRate-a.scoreRate||a.candidate.localeCompare(b.candidate));
 const result={title:"G3 vs frozen V1.1 (development)",runId:id,gameBudgetMs:budget,
 totalGames:agents.length*pairs*2,mapPairs:pairs,mapsUsed:"existing S0 heldOut - not sealed new blind test",
 invalidActions:0,frozenChampion:"strong-search-v1.1, depth 2",
 provenBetter:false,reason:"Short development series with map reuse; larger paired blind tests required",
 results:ranked.map((a,i)=>({rank:i+1,id:a.candidate,
  family:agents.find(x=>x.id===a.candidate)?.family,wins:a.wins,losses:a.losses,draws:a.draws,
  scoreRate:a.scoreRate,pairedBootstrap95:a.pairedBootstrap95,
  p95MoveMs:a.p95MoveMs,illegal:a.illegal}))};
 fs.writeFileSync(resultFile,JSON.stringify(result,null,2));
 let md="# 木木金金棋 G3 守擂赛 · 对战 V1.1\n\n"+
  "双方同地图换手，每一步相同 **"+budget+" 毫秒计算预算**；共 **"+result.totalGames+" 场**。"+
  "这是开发测试，地图此前已用于其他实验，**不等于独立盲测**，不会晋级线上 AI。\n\n"+
  "| 排名 | AI | 类型 | 胜-负-和 | 对 V1.1 得分率 | 配对 95% 区间 |\n|---:|---|---|---|---:|---|\n";
 for(const r of result.results)md+="| "+r.rank+" | "+r.id+" | "+r.family+" | "+
  r.wins+"-"+r.losses+"-"+r.draws+" | "+(r.scoreRate*100).toFixed(1)+"% | "+
  r.pairedBootstrap95.map(x=>(x*100).toFixed(1)+"%").join("–")+" |\n";
 md+="\n每个 AI 仅参与 "+(pairs*2)+" 局，样本很小，成绩波动大；不得把它当作 Elo 棋力评分。全部动作合法。"+
 "\n只存各局结果、总得分和时间统计，不保存落子历史。\n";
 fs.writeFileSync(markdownFile,md);
 console.log("G3_V11_SERIES_DONE",JSON.stringify({games:result.totalGames,candidates:agents.length,
   top:result.results.slice(0,6),report:resultFile,markdown:markdownFile}));
 write("complete");
}
function launch(){
 while(!failed&&running.size<workers&&index<agents.length){
  const a=agents[index++],id=a.id;
  const existing=resultPath(a);
  if(fs.existsSync(existing)){
   try{
    const saved=JSON.parse(fs.readFileSync(existing,"utf8"));
    if(saved.roster!==rosterName||saved.mapCount!==pairs||saved.games!==pairs*2||saved.illegal)throw Error("Bad previous record "+id);
    done.push(saved);write("running");continue;
   }catch(e){failed=e;write("failed");break;}
  }
  const args=[path.join(__dirname,"..","league","challenge.cjs"),rosterName,id,String(offset),String(pairs),String(budget)];
  const child=spawn(process.execPath,args,{cwd:path.join(__dirname,"..",".."),windowsHide:true,stdio:["ignore","pipe","pipe"]});
  running.set(id,child);write("running");
  let stdout="",stderr="";
  child.stdout.on("data",b=>{stdout+=b.toString();if(stdout.length>2500)stdout=stdout.slice(-2500);});
  child.stderr.on("data",b=>{stderr+=b.toString();if(stderr.length>2500)stderr=stderr.slice(-2500);});
  child.on("close",code=>{
   running.delete(id);
   if(code!==0||!fs.existsSync(existing)){
    failed=Error(id+" failed exit "+code+" "+stderr+" "+stdout);
    for(const p of running.values())p.kill();
    write("failed");console.error("G3_V11_FAILED",String(failed));process.exitCode=1;return;
   }
   try{
    const o=JSON.parse(fs.readFileSync(existing,"utf8"));
    if(o.games!==pairs*2||o.illegal)throw Error("Incorrect result count "+id);
    done.push(o);console.log("G3_V11_CHALLENGER_DONE",JSON.stringify({id,w:o.wins,l:o.losses,d:o.draws,score:o.scoreRate,
      completed:done.length,total:agents.length}));
    write("running");launch();
    if(!failed&&index===agents.length&&!running.size)saveFinal();
   }catch(e){failed=e;write("failed");console.error(e);process.exitCode=1;}
  });
  child.on("error",e=>{failed=e;write("failed");process.exitCode=1;});
 }
 if(!failed&&index===agents.length&&!running.size&&done.length===agents.length&&!fs.existsSync(resultFile))saveFinal();
}
fs.mkdirSync(dir,{recursive:true});
console.log("G3_V11_SERIES_START",JSON.stringify({rosterName,candidates:agents.length,pairs,budget,offset,workers}));
write("running");launch();
