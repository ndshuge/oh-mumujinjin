"use strict";
// New-map paired validation; no source moves, only results and CI.
const fs=require("fs"),path=require("path");
const dir=path.join(__dirname,"..","output","lab","g4"),
 agents=["odd-hawks","odd-dreamer"],start=1,mapPairs=60,budget=600;
const bankName="fresh-map-bank-20261015-120.json",
 bank=JSON.parse(fs.readFileSync(path.join(dir,bankName),"utf8")),
 lock=JSON.parse(fs.readFileSync(path.join(dir,bankName.replace(/\.json$/,".lock.json")),"utf8"));
const results=[],missing=[];
for(const id of agents){
 const p=path.join(dir,"fresh-challenge-"+id+"-"+start+"-"+mapPairs+"-b"+budget+".json");
 if(!fs.existsSync(p)){missing.push(id);continue;}
 const r=JSON.parse(fs.readFileSync(p,"utf8"));
 if(r.candidate!==id||r.baseChampion!=="frozen-v11"||r.mapCount!==mapPairs||
  r.games!==mapPairs*2||r.illegal!==0||r.mapBankSHA256!==lock.sha256||
  r.mapBank!==bankName||!Array.isArray(r.matches)||r.matches.length!==mapPairs*2)
  throw Error("Invalid fresh-challenge "+id);
 const maps=bank.maps.slice(start,start+mapPairs);
 if(r.matches.some((m,i)=>m.map!==maps[Math.floor(i/2)].name||m.seat!==i%2))
  throw Error("Map or seat mismatch "+id);
 if(Object.entries(r.byDensity).some(([name,x])=>x.games!==40||x.wins+x.losses+x.draws!==40))
  throw Error("Unbalanced map stratum "+id);
 results.push({id,wins:r.wins,losses:r.losses,draws:r.draws,winRate:r.scoreRate,
  CI95:r.pairedBootstrap95,p95Ms:r.p95MoveMs,byDensity:r.byDensity,
  games:r.games,illegal:r.illegal});
}
results.sort((a,b)=>b.winRate-a.winRate||a.id.localeCompare(b.id));
const summary={status:missing.length?"running":"complete",cases:agents.length,
 finished:results.length,pairsPerAI:mapPairs,games:results.reduce((n,r)=>n+r.games,0),
 mapSHA256:lock.sha256,mapOverlapWithS0:0,softBudgetMs:budget,results,missing,
 promotionApproved:false,
 caution:"Fresh map screening on 60 pairs still falls short of pre-registered 500-pair promotion gate and mobile browser acceptance"};
fs.writeFileSync(path.join(dir,"FRESH_CHALLENGE_RESULTS.json"),JSON.stringify(summary,null,2));
let markdown="# 木木金金棋：全新地图挑战 V1.1\n\n"+
 "两位候选配置已冻结，采用事先锁定、与历史 S0 布局零重叠的地图；每位 60 张图换手 120 局，策略计算预算 600ms/步。\n"+
 "这是首次未用于之前训练与小样本选育的新地图筛查，**仍不足正式 1000 局晋级门槛**。\n\n"+
 "| AI | 胜-负-和 | 得分率 | 成对地图 95% 区间 | 实际耗时 P95 |\n|---|---|---:|---|---:|\n";
for(const r of results)
 markdown+="| "+r.id+" | "+r.wins+"-"+r.losses+"-"+r.draws+" | "+(r.winRate*100).toFixed(1)+"% | "+
 r.CI95.map(x=>(100*x).toFixed(1)+"%").join("–")+" | "+r.p95Ms+"ms |\n";
if(missing.length)markdown+="\n尚未完成："+missing.join("、")+"。当前数据不代替未完成结果。\n";
markdown+="\n不同障碍密度每组各 20 张地图，轮流换手。所有对局结果由本机 game.js 规则引擎裁判，网络权重与搜索器仍未获得线上自动晋级权限。\n";
fs.writeFileSync(path.join(dir,"FRESH_CHALLENGE_RESULTS.md"),markdown);
console.log("G4_FRESH_RESULTS",JSON.stringify({status:summary.status,games:summary.games,
 missing,results:results.map(x=>({id:x.id,w:x.wins,l:x.losses,d:x.draws,CI95:x.CI95})),bankSha:lock.sha256.slice(0,16)}));
