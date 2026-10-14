"use strict";
const fs=require("fs"),path=require("path");
const root=path.resolve(__dirname,"../..");
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const v=read("training/output/lab/g3/champions-population-g4-top5-v11-910-10-b260.progress.json").leaderboard;
const odd=read("training/output/lab/g4/TOP5_VS_ODD_HAWKS_20261014.json").results;
const hell=read("training/output/lab/g4/TOP5_VS_ORIGINAL_HELL_20261014.json").results;
const ids=["g4-h05","g4-h09","g4-p10","g4-h13","g4-h01"];
const rows=ids.map(id=>{
 const scores=[["v11",v],["odd-hawks",odd],["original-hell",hell]].map(([name,rs])=>{const r=rs.find(x=>x.id===id);if(!r)throw Error("Missing "+name+" "+id);const games=r.games??r.wins+r.losses+r.draws;if(games!==20)throw Error("Incomplete "+name+" "+id);return {opponent:name,games,wins:r.wins,losses:r.losses,draws:r.draws,scoreRate:(r.wins+.5*r.draws)/games};});
 return {id,scores,worstScoreRate:Math.min(...scores.map(x=>x.scoreRate)),meanScoreRate:scores.reduce((a,b)=>a+b.scoreRate,0)/scores.length};
}).sort((a,b)=>b.worstScoreRate-a.worstScoreRate||b.meanScoreRate-a.meanScoreRate);
const report={schema:"g5-three-opponent-development-baseline-v1",status:"complete",developmentOnly:true,notHumanEvidence:true,totalGames:300,distinctMapBanks:true,rankingRule:"maximize minimum opponent score; development-only",rows};
const dir=path.join(root,"training/output/lab/g5");fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,"three-opponent-baseline.json"),JSON.stringify(report,null,2));
console.log(JSON.stringify({totalGames:report.totalGames,rows:rows.map(x=>({id:x.id,worst:x.worstScoreRate,mean:x.meanScoreRate}))}));
