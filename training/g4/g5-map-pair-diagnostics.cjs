"use strict";
const fs=require("fs");
const path=require("path");
const root=path.resolve(__dirname,"../..");
const file=path.join(root,"training/output/lab/g4/TOP5_VS_ODD_HAWKS_20261014.jsonl");
const rows=fs.readFileSync(file,"utf8").trim().split("\n").map(JSON.parse);
const ids=[...new Set(rows.map(x=>x.id))];
const result={schema:"g5-odd-hawks-map-pair-diagnostic-v1",games:rows.length,byCandidate:[],byMap:[]};
for(const id of ids){
 const r=rows.filter(x=>x.id===id),byMap=[];
 for(let i=0;i<10;i++){const p=r.filter(x=>x.map===i);byMap.push({map:i,wins:p.filter(x=>x.winner===id).length,losses:p.filter(x=>x.winner==="odd-hawks").length,draws:p.filter(x=>!x.winner).length,paired:p.length===2});}
 result.byCandidate.push({id,byMap,sweptByHawks:byMap.filter(x=>x.losses===2).map(x=>x.map),sweptHawks:byMap.filter(x=>x.wins===2).map(x=>x.map)});
}
for(let i=0;i<10;i++){const r=rows.filter(x=>x.map===i);result.byMap.push({map:i,games:r.length,hawksWins:r.filter(x=>x.winner==="odd-hawks").length,hawksSweeps:result.byCandidate.filter(x=>x.byMap[i].losses===2).map(x=>x.id)});}
const out=path.join(root,"training/output/lab/g5/odd-hawks-map-pair-diagnostics.json");fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({byMap:result.byMap,byCandidate:result.byCandidate.map(x=>({id:x.id,sweptByHawks:x.sweptByHawks,sweptHawks:x.sweptHawks}))}));
