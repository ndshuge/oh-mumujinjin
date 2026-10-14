"use strict";
const fs=require("fs"),path=require("path"),dir=path.resolve(__dirname,"../output/lab/g4");
const run=JSON.parse(fs.readFileSync(path.join(dir,"evolution-runner-status.json"),"utf8")),g=run.currentGeneration;
const rows=[];for(let i=0;i<run.rounds;i++){const prefix="gen"+g+"-round"+i+"-b"+run.budget+"-s20261014",f=path.join(dir,prefix+".results.jsonl"),r=path.join(dir,prefix+".report.json");const n=fs.existsSync(f)?fs.readFileSync(f,"utf8").split("\n").filter(Boolean).length:0;const receipt=fs.existsSync(r)?JSON.parse(fs.readFileSync(r,"utf8")):null;rows.push({round:i,games:n,accepted:!!(receipt?.complete&&receipt?.matches===64&&receipt?.illegal===0&&n===64)});}
const out={generation:g,config:{rounds:run.rounds,budget:run.budget,seed:20261014},rows,accepted:rows.filter(x=>x.accepted).length,finished:rows.every(x=>x.accepted)};console.log(JSON.stringify(out));if(rows.some(x=>x.games>64))process.exitCode=1;
