"use strict";
const fs=require("fs"),path=require("path");
const root=path.resolve(__dirname,"../..");
const opponents=[["odd-hawks","TOP5_VS_ODD_HAWKS_20261014"],["original-hell","TOP5_VS_ORIGINAL_HELL_20261014"]];
const summary={schema:"g5-failure-diagnostics-v1",developmentOnly:true,results:[]};
for(const [name,stem] of opponents){
 const rows=fs.readFileSync(path.join(root,"training/output/lab/g4",stem+".jsonl"),"utf8").split("\n").filter(Boolean).map(JSON.parse);
 for(const id of [...new Set(rows.map(r=>r.id))]){
  const games=rows.filter(r=>r.id===id),bySeat=[0,1].map(seat=>{const subset=games.filter(r=>r.seat===seat);return {seat,games:subset.length,wins:subset.filter(r=>r.winner===id).length,losses:subset.filter(r=>r.winner&&r.winner!==id).length,draws:subset.filter(r=>!r.winner).length};});
  const endings={};for(const r of games)endings[r.ending]=(endings[r.ending]||0)+1;
  const lostMaps=games.filter(r=>r.winner&&r.winner!==id).map(r=>({map:r.map,seat:r.seat,ending:r.ending}));
  summary.results.push({opponent:name,id,games:games.length,bySeat,endings,lostMaps});
 }
}
const out=path.join(root,"training/output/lab/g5/failure-diagnostics.json");
fs.writeFileSync(out,JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary.results.filter(r=>r.id==="g4-h13").map(r=>({opponent:r.opponent,bySeat:r.bySeat,endings:r.endings,lostMaps:r.lostMaps}))));
