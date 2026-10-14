"use strict";
// Audited V1.1 match summary from 50 paired layouts per candidate.
// Reads results only, never touches existing weights or game.js.
const fs=require("fs"),path=require("path");
const base=path.join(__dirname,"..","output","lab"),g4=path.join(base,"g4");
fs.mkdirSync(g4,{recursive:true});
const agents=["odd-hawks","odd-tunnel","odd-tortoise","odd-dreamer"],
 offset=1310,mapPairs=50,budgetMs=350;
const results=[],missing=[];
for(const id of agents){
 const f=path.join(base,"challenge-"+id+"-"+offset+"-"+mapPairs+"-b"+budgetMs+".json");
 if(!fs.existsSync(f)){missing.push(id);continue;}
 const r=JSON.parse(fs.readFileSync(f,"utf8"));
 if(r.candidate!==id||r.baseChampion!=="frozen-v11"||r.mapCount!==mapPairs||r.games!==100||r.illegal!==0||
  !Array.isArray(r.matches)||r.matches.length!==100||r.matches.some(m=>m.ending!=="goal"&&m.ending!=="noMovement"&&m.ending!=="cap"&&m.ending!=="repetition"))
  throw Error("Invalid challenge receipt "+id);
 const group=new Map();
 for(const m of r.matches){
  const rounds=group.get(m.map)||[];
  rounds.push(m);group.set(m.map,rounds);
 }
 if(group.size!==mapPairs||[...group.values()].some(arr=>arr.length!==2||arr[0].seat===arr[1].seat))
  throw Error("Missing mirrored pair "+id);
 results.push({
  id,baseline:"strong-search-v1.1.js",games:r.games,pairedMaps:mapPairs,
  wins:r.wins,losses:r.losses,draws:r.draws,
  winRate:r.scoreRate,pairedBootstrap95:r.pairedBootstrap95,
  p95MoveMs:r.p95MoveMs,illegal:r.illegal,
  goalTerminals:r.matches.filter(x=>x.ending==="goal").length,
  drawTerminals:r.matches.filter(x=>["cap","repetition"].includes(x.ending)).length
 });
}
results.sort((a,b)=>b.winRate-a.winRate||a.id.localeCompare(b.id));
const report={status:missing.length?"partial":"complete",gamesPerCandidate:100,mapsPerCandidate:50,
 candidatesTotal:agents.length,candidatesReported:results.length,
 matchesTotal:results.reduce((a,b)=>a+b.games,0),matchTimeBudgetMs:budgetMs,
 missing,results,formalChampionPromoted:false,
 caution:"S0 heldOut maps have been used by earlier experiments and candidate selection; not a newly sealed blind test. Multiple candidates tested; do not infer absolute chess strength from small intervals."};
const file=path.join(g4,"V11_CHALLENGE_100_RESULTS.json");
fs.writeFileSync(file,JSON.stringify(report,null,2));
let md="# G4 · AI 挑战 V1.1 · 每名 100 局\n\n";
md+="**"+results.length+"/"+agents.length+" 位完成**；每位 50 张地图换手 100 局，同步预算 "+budgetMs+"ms/步。"+
"对照是冻结的 V1.1，当前测试集不是新建的封闭盲测。\n\n";
md+="| AI | 胜-负-和 | 得分率 | 成对地图 Bootstrap 95% | 非法行动 |\n|---|---|---:|---|---:|\n";
for(const r of results)md+="| "+r.id+" | "+r.wins+"-"+r.losses+"-"+r.draws+" | "+
 (r.winRate*100).toFixed(1)+"% | "+r.pairedBootstrap95.map(x=>(x*100).toFixed(1)+"%").join("–")+" | 0 |\n";
if(missing.length)md+="\n尚未完成："+missing.join("、")+"。本次报告不会假定未完成选手的成绩。\n";
md+="\n注意：候选此前是从小样本联赛中筛选出来，含多重比较偏差；即使某人的置信区间下界 >50%，也不能自动替换线上 AI。"+
"必须先冻结候选配置，再用完全新生成、未参与调参的地图进行至少 1000 局双向对战，并做手机端 Web Worker 验收。\n";
fs.writeFileSync(path.join(g4,"V11_CHALLENGE_100_RESULTS.md"),md);
console.log("G4_CHALLENGE_SUMMARY",JSON.stringify({status:report.status,candidates:results.length,
 games:report.matchesTotal,missing,rank:results.map(({id,wins,losses,draws,winRate,pairedBootstrap95})=>({id,wins,losses,draws,winRate,pairedBootstrap95})),report:file}));
