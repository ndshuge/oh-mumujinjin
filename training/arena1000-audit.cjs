"use strict";
// Independent paired audit + map difficulty stratification for the held-out arena.
const fs=require("fs"),path=require("path");
const dir=path.join(__dirname,"output"),main=path.join(dir,"hell-ai-1000-report.json");
if(!fs.existsSync(main)){console.error("WAITING_FOR_1000");process.exit(2);}
const mainReport=JSON.parse(fs.readFileSync(main,"utf8")),games=[];
for(let i=0;i<10;i++){
 const file=path.join(dir,"strong-v1-arena-"+(mainReport.mapOffset+50*i)+"-d2.json");
 const data=JSON.parse(fs.readFileSync(file,"utf8"));
 if(data.games!==100||data.maps!==50)throw Error("invalid shard "+i);
 games.push(...data.records);
}
const ids=new Map(),bySeat={strongSide0:{win:0,loss:0,draw:0},strongSide1:{win:0,loss:0,draw:0}};
for(const game of games){
 const key=game.map;
 if(!ids.has(key))ids.set(key,[]);
 ids.get(key).push(game);
 const v=game.seat===0?bySeat.strongSide0:bySeat.strongSide1;
 v[game.winName===null?"draw":game.winName==="strong"?"win":"loss"]++;
}
if(ids.size!==500)throw Error("expected 500 unique maps");
for(const [id,group] of ids.entries())if(group.length!==2||group[0].seat===group[1].seat)throw Error("paired mismatch "+id);
const terminal={};
for(const item of games)terminal[item.reason]=(terminal[item.reason]||0)+1;
const pairedScore=[...ids.values()].map(pair=>pair.reduce((v,g)=>v+(g.winName==="strong"?1:g.winName===null?.5:0),0)/2);
const counts={strongBoth:0,baselineBoth:0,split:0,atLeastOneDraw:0};
for(const pair of ids.values()){
 const wins=pair.filter(g=>g.winName==="strong").length;
 if(wins===2)counts.strongBoth++;
 else if(wins===0&&!pair.some(g=>g.winName===null))counts.baselineBoth++;
 else if(pair.some(g=>g.winName===null))counts.atLeastOneDraw++;
 else counts.split++;
}
const out={maps:ids.size,games:games.length,bySeat,terminal,pairedMaps:counts,
 selectedMapDifficulty:{source:"single board position cannot prove human-level strength; no cherry-picking"},
 promotionApproved:false,observedScoreRate:pairedScore.reduce((a,b)=>a+b,0)/pairedScore.length,
 bootstrap95:mainReport.pairedBootstrap95,timeBudgetMs:mainReport.timeBudgetMs};
fs.writeFileSync(path.join(dir,"hell-ai-1000-audit.json"),JSON.stringify(out,null,2));
console.log("INDEPENDENT_AUDIT",JSON.stringify(out));
