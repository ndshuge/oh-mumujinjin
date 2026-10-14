"use strict";
const fs=require("fs"),path=require("path");
const [rosterName="population-g0-64.json",roundArg="6",budgetArg="260",seedArg="20261014"]=process.argv.slice(2);
const rounds=Number(roundArg),budget=Number(budgetArg),seed=Number(seedArg);
if(!/^population-g\d+-64\.json$/.test(rosterName)||![rounds,budget,seed].every(Number.isInteger)||rounds<1)throw Error("Invalid live-board args");
const here=__dirname,roster=JSON.parse(fs.readFileSync(path.join(here,rosterName),"utf8")),g=roster.generation,
 dir=path.join(here,"..","output","lab","g4"),classify=a=>a.family==="search"?"search":a.family==="hybrid"?"hybrid":a.models?.length?"neural":"rule-puct";
const board=new Map(roster.agents.map(a=>[a.id,{id:a.id,type:classify(a),w:0,l:0,d:0,games:0,score:0}]));
const densities={sparse:0,medium:0,dense:0};let games=0,illegal=0;
for(let i=0;i<rounds;i++){
 const p=path.join(dir,"gen"+g+"-round"+i+"-b"+budget+"-s"+seed+".results.jsonl");
 if(!fs.existsSync(p))continue;
 for(const line of fs.readFileSync(p,"utf8").trim().split("\n")){
  if(!line)continue;
  const r=JSON.parse(line);
  if(r.round!==i||!board.has(r.player0)||!board.has(r.player1)||!["sparse","medium","dense"].includes(r.density))throw Error("Bad result "+p);
  densities[r.density]++;games++;illegal+=r.illegal;
  for(const id of [r.player0,r.player1]){
   const b=board.get(id);b.games++;
   if(r.winner===null){b.d++;b.score+=.5;}
   else if(r.winner===id){b.w++;b.score++;}else b.l++;
  }
 }
}
const ranked=[...board.values()].map(r=>({...r,rate:r.games?r.score/r.games:0}))
 .sort((a,b)=>b.score-a.score||b.rate-a.rate||a.id.localeCompare(b.id));
let md="# G4 · 64 AI 进化联赛实时成绩\n\n"+
 "目前完成 **"+games+" / "+(rounds*64)+"** 局，零非法动作要求（当前报告："+illegal+"）。"+
 "对局只保存胜负、对阵和地图分类，**没有逐步棋谱**。\n\n"+
 "地图：稀疏 "+densities.sparse+" / 中密 "+densities.medium+" / 密集 "+densities.dense+" 场。"+
 "该榜单为进行中状态，各 AI 已赛局数可能不同，不能据此认定冠军。\n\n"+
 "| 暂列 | AI | 类型 | 胜-负-和 | 已赛 | 得分率 |\n|---:|---|---|---|---:|---:|\n";
for(const [i,b] of ranked.entries())md+="| "+(i+1)+" | "+b.id+" | "+b.type+" | "+b.w+"-"+b.l+"-"+b.d+
 " | "+b.games+" | "+(b.rate*100).toFixed(1)+"% |\n";
const file=path.join(dir,"LIVE_64_RESULTS.md"),jsonFile=path.join(dir,"LIVE_64_RESULTS.json");
fs.writeFileSync(file,md);
fs.writeFileSync(jsonFile,JSON.stringify({generation:g,games,planned:rounds*64,illegal,densities,
 top:ranked.slice(0,12),familyStats:Object.fromEntries(["search","rule-puct","neural","hybrid"].map(k=>{
  const r=ranked.filter(x=>x.type===k);return[k,{players:r.length,wins:r.reduce((a,b)=>a+b.w,0),
  games:r.reduce((a,b)=>a+b.games,0),meanRate:r.reduce((a,b)=>a+b.rate,0)/r.length}];
 }))},null,2));
console.log("G4_64_LIVE",JSON.stringify({games,target:rounds*64,illegal,densities,top:ranked.slice(0,8),markdown:file}));
