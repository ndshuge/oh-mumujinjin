"use strict";
const fs=require("fs"),path=require("path"),root=path.resolve(__dirname,"../..");
const original=fs.readFileSync(path.join(root,"training/output/lab/g4/TOP5_VS_ODD_HAWKS_20261014.jsonl"),"utf8").trim().split("\n").map(JSON.parse);
const checks=[];
for(const map of [3,4,8])for(const seat of [0,1]){
 const file=path.join(root,"training/output/lab/g5",`replay-h13-odd-map${map}-seat${seat}.json`);
 const r=JSON.parse(fs.readFileSync(file,"utf8"));
 const old=original.find(x=>x.id==="g4-h13"&&x.map===map&&x.seat===seat);
 const consistent=!!old&&r.winner===old.winner&&r.ending===old.ending&&r.steps.length===r.plies&&r.steps.every((s,i)=>s.ply===i);
 checks.push({map,seat,expectedWinner:old?.winner,replayedWinner:r.winner,plies:r.plies,consistent});
}
const pass=checks.every(x=>x.consistent),out=path.join(root,"training/output/lab/g5/replay-acceptance.json");
fs.writeFileSync(out,JSON.stringify({schema:"g5-replay-acceptance-v1",pass,checks},null,2));
console.log(JSON.stringify({pass,checks}));if(!pass)process.exitCode=1;
