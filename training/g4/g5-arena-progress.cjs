"use strict";
const fs=require("fs"),path=require("path"),dir=path.resolve(__dirname,"../output/lab/g5"),file=path.join(dir,"challenger-development-arena.jsonl");
const rows=fs.existsSync(file)?fs.readFileSync(file,"utf8").trim().split("\n").filter(Boolean).map(JSON.parse):[];
const result={schema:"g5-challenger-arena-progress-v1",totalScheduled:64,completed:rows.length,complete:rows.length===64,groups:[]};
for(const candidate of ["g5-search-v3","g5-hybrid-v3"])for(const opponent of ["g4-h13","odd-hawks"]){const g=rows.filter(x=>x.candidate===candidate&&x.opponent===opponent),wins=g.filter(x=>x.winner===candidate).length,losses=g.filter(x=>x.winner===opponent).length,draws=g.length-wins-losses;result.groups.push({candidate,opponent,played:g.length,scheduled:16,wins,losses,draws,score:g.length?(wins+.5*draws)/g.length:null});}
const out=path.join(dir,"challenger-development-progress.json");fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(rows.length>64)process.exitCode=1;
