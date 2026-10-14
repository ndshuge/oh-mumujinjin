"use strict";
// Read-only status aggregation except a human-readable report file.
// No move notation or raw states included.
const fs=require("fs"),path=require("path");
const root=path.resolve(__dirname,".."),g4=path.join(root,"output","lab","g4"),g3=path.join(root,"output","lab","g3");
const read=filename=>fs.existsSync(filename)?JSON.parse(fs.readFileSync(filename,"utf8")):null;
const roster=read(path.join(__dirname,"population-g0-64.json"));
const records={
 generation:read(path.join(g4,"g4-run-0-6r-b260-s20261014.progress.json")),
 previous:read(path.join(g3,"champions-population-strange-1100-4-b250.json")),
 hall:read(path.join(__dirname,"hall-of-fame.json")),
 selfplay:read(path.join(root,"output","lab","batch-train-3000-9000-w5-b90-s20261018.progress.json"))
};
let md="# 木木金金棋 · G4 AI 进化实时战报\n\n";
md+="本报告仅整理 **AI 对局结果、种群、晋级和实时进度**，不保存每步走棋。\n\n";
const p=records.generation;
const actuallyCompletedRounds=p?Array.from({length:p.targetRounds},(_,i)=>i).filter(i=>{
 const receipt=read(path.join(g4,"gen"+p.generation+"-round"+i+"-b"+p.budgetPerMoveMs+"-s20261014.report.json"));
 return receipt?.complete===true&&receipt.matches===64&&receipt.illegal===0;
}).length:0;
md+="## 64 AI 进化联赛\n\n";
if(p)md+="状态：**"+p.state+"**；已完成 **"+p.completedGames+" / "+p.plannedGames+"** 局；"+
 "当前完整比赛日 **"+actuallyCompletedRounds+" / "+p.targetRounds+"**；"+
 "计算上限 **"+p.budgetPerMoveMs+" ms/步**；每人计划 **"+p.perAgentPlannedGames+" 局**。\n\n";
else md+="尚未获得 G4 状态。\n\n";
if(roster)md+="初代各家族：搜索 "+roster.families.search+"、PUCT "+roster.families["rule-puct"]+
 "、神经网络 "+roster.families.neural+"、混合 "+roster.families.hybrid+"。\n\n";
md+="## 已完成的 G3 vs V1.1 守擂赛\n\n";
if(records.previous){
 md+="冻结参考：**V1.1**；共 "+records.previous.totalGames+" 局；每名 AI 对战 8 局，"+
  "每局换手；仅作为小样本开发赛。\n\n";
 md+="| AI | 胜 | 负 | 和 | 得分率 |\n|---|---:|---:|---:|---:|\n";
 for(const item of records.previous.results)md+="| "+item.id+" | "+item.wins+" | "+item.losses+" | "+item.draws+
  " | "+(100*item.scoreRate).toFixed(1)+"% |\n";
}else md+="记录不存在。\n\n";
md+="\n## G4 100局/AI 冻结冠军守擂复测\n\n"+
 "以下四个选手都采用 50 张相同地图 × 双方换手，共 100 局/AI；每步请求预算 **350ms**。"+
 "地图已在之前的测试池中出现过，故仍非正式完全盲测。\n\n"+
 "| AI | 状态 | 胜-负-和 | 得分率 | 95% 成对区间 |\n|---|---|---|---:|---|\n";
const group=["odd-hawks","odd-tunnel","odd-tortoise","odd-dreamer"],summary=[];
for(const id of group){
 const r=read(path.join(root,"output","lab","challenge-"+id+"-1310-50-b350.json"));
 if(r){
  md+="| "+id+" | 已完成 | "+r.wins+"-"+r.losses+"-"+r.draws+" | "+
   (100*r.scoreRate).toFixed(1)+"% | "+
   r.pairedBootstrap95.map(x=>(100*x).toFixed(1)+"%").join("–")+" |\n";
  summary.push({id,status:"complete",wins:r.wins,losses:r.losses,draws:r.draws,rate:r.scoreRate,ci:r.pairedBootstrap95});
 }else{
  md+="| "+id+" | 运行中 / 未完成 | — | — | — |\n";
  summary.push({id,status:"pending"});
 }
}
md+="\n## 名人堂安全边界\n\n";
const hof=records.hall;
if(hof)md+="冻结基线 "+hof.incumbentId+"；已封存 "+hof.entries.length+" 个候选基因和对应测试数据。"+
 " **候选冠军不会自动替换线上地狱 AI**。\n";
if(records.selfplay)md+="\n## 自对弈数据采集\n\n训练棋谱采集 "+
 records.selfplay.completedGames+" / "+records.selfplay.targetGames+" 局；非法行动 "+records.selfplay.invalidActions+
 "。自对弈数据和 G4 生存赛的排名分开统计。\n";
md+="\n## 严格晋级门槛\n\n候选必须在全新独立地图上至少 500 对换手局（1000局），"+
 "配对 Bootstrap 95% 下界超过50%、0非法落子、手机浏览器 Web Worker 性能通过，才允许进一步讨论上线。\n";
fs.mkdirSync(g4,{recursive:true});
const file=path.join(g4,"LIVE_RESULTS.md");
fs.writeFileSync(file,md);
console.log("G4_STATUS",JSON.stringify({g4:p?{state:p.state,played:p.completedGames,target:p.plannedGames,
  rounds:actuallyCompletedRounds}:null,champions:summary,selfplay:records.selfplay?.completedGames||0,
 report:file}));
