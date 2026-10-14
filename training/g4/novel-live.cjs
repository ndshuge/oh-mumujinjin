"use strict";
// Human-readable scoreboard for a frozen-candidate exam on new, sealed layouts.
// Reads per-game OUTCOMES only, no move traces.
const fs=require("fs"),path=require("path");
const [id="odd-hawks",mapId="novel-sealed-20261030-500",budgetStr="350"]=process.argv.slice(2),
 budget=Number(budgetStr);
if(!/^[a-z0-9_-]{3,48}$/.test(id)||!/^novel-(pilot|sealed)-\d+-\d+$/.test(mapId)||
 !Number.isInteger(budget))throw Error("Invalid sealed board selection");
const root=path.resolve(__dirname,"..","output","lab","g4"),
 file=path.join(root,"exam-"+id+"-"+mapId+"-b"+budget+".results.jsonl"),
 bank=path.join(root,mapId+".jsonl"),data=fs.readFileSync(bank,"utf8").trim().split("\n").map(JSON.parse);
const items=fs.existsSync(file)?fs.readFileSync(file,"utf8").trim().split("\n").filter(Boolean).map(JSON.parse):[];
const counts={total:items.length,goal:0,noMovement:0,repetition:0,cap:0,wins:0,losses:0,draws:0,
 tier:{sparse:{w:0,l:0,d:0},medium:{w:0,l:0,d:0},dense:{w:0,l:0,d:0}}};
for(const [index,item] of items.entries()){
 const map=data[Math.floor(index/2)];
 if(!map||item.index!==Math.floor(index/2)||item.seat!==index%2||
  item.candidate!==id||item.illegal!==0||item.mapHash!==map.hash)
  throw Error("Unexpected or illegal exam outcome at index "+index);
 const tier=counts.tier[map.tier];
 if(!tier)throw Error("Unexpected tier");
 if(item.winner===id){counts.wins++;tier.w++;}
 else if(item.winner==="frozen-v11"){counts.losses++;tier.l++;}
 else if(item.winner===null){counts.draws++;tier.d++;}
 else throw Error("Unknown match winner");
 if(!(item.ending in counts))throw Error("Unknown ending");
 counts[item.ending]++;
}
const completePairs=Math.floor(items.length/2),pairScores=[];
for(let i=0;i<completePairs;i++){
 const a=items[i*2],b=items[i*2+1];
 if(a.index!==b.index||a.seat!==0||b.seat!==1)throw Error("Missing seat swap on map "+i);
 pairScores.push((Number(a.winner===id)+Number(b.winner===id)+.5*Number(a.winner===null)+.5*Number(b.winner===null))/2);
}
let randomSeed=14052;const random=()=>((randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0)/4294967296);
const bootstrap=[];
if(completePairs>=3){
 for(let k=0;k<3000;k++){
  let sum=0;for(let j=0;j<completePairs;j++)sum+=pairScores[Math.floor(random()*completePairs)];
  bootstrap.push(sum/completePairs);
 }
 bootstrap.sort((a,b)=>a-b);
}
const range=bootstrap.length?[bootstrap[75],bootstrap[2925]]:null,
 scoreRate=items.length?(counts.wins+counts.draws*.5)/items.length:null;
const result={candidate:id,exam:mapId,completedGames:items.length,plannedGames:data.length*2,
 completedPairedMaps:completePairs,winRate:scoreRate,pairedBootstrap95Provisional:range,counts};
const jsonPath=path.join(root,"LIVE_NEW_MAPS.json"),mdPath=path.join(root,"LIVE_NEW_MAPS.md");
fs.writeFileSync(jsonPath,JSON.stringify(result,null,2));
const pct=x=>x===null?"待定":(100*x).toFixed(1)+"%";
let md="# 地狱 AI · 全新地图守擂实时结果\n\n"+
 "候选 **"+id+"** vs 冻结 V1.1；每步请求 "+budget+"ms，候选参数已锁定，地图不在旧 S0 的8947种布局里。\n\n"+
 "**已完成："+items.length+" / "+(data.length*2)+" 局**；有完整换手数据的地图 "+completePairs+" / "+data.length+
 "；胜："+counts.wins+"、负："+counts.losses+"、和："+counts.draws+"；得分率 **"+pct(scoreRate)+"**。\n\n"+
 (range?"当前配对 Bootstrap 95%区间："+pct(range[0])+"–"+pct(range[1])+
 "（**中途临时估计，继续比赛会改变**）。\n\n":"完整换手地图不足，暂不估计区间。\n\n")+
 "| 地图类型 | 胜 | 负 | 和 |\n|---|---:|---:|---:|\n";
for(const type of ["sparse","medium","dense"]){const x=counts.tier[type];md+="| "+type+" | "+x.w+" | "+x.l+" | "+x.d+" |\n";}
md+="\n终局类型：到达目标 "+counts.goal+"、受困 "+counts.noMovement+"、循环 "+counts.repetition+
 "、回合上限 "+counts.cap+"。\n\n"+
 "未满1000局不得宣称新的地狱冠军；即使通过统计晋级，也要测试真机 Web Worker。\n";
fs.writeFileSync(mdPath,md);
console.log("NOVEL_LIVE_SCORE",JSON.stringify({played:items.length,total:data.length*2,wins:counts.wins,
 losses:counts.losses,draws:counts.draws,rate:scoreRate,pairedMaps:completePairs,
 provisionalCI:range,markdown:mdPath}));
