"use strict";
// G4: 64-player population, four protected evolutionary niches. No tensor
// crossover and no online deployment; genetic variation changes only real
// search/PUCT settings supported by the current host engine.
const fs=require("fs"),path=require("path");
const {check}=require("../league/agent.cjs");
const out=path.join(__dirname,"population-g0-64.json");
if(fs.existsSync(out))throw Error("Existing 64-player population; refuse overwrite");
const P=[],put=(id,description,genome)=>{
 const a={id,description,...genome};check(a);P.push(a);
};
let num=0;
for(const engine of ["v1.1","v2","v3"])for(let depth=1;depth<=4;depth++){
 put("g4-s"+String(++num).padStart(2,"0"),"搜索 "+engine+" / "+depth+" 层",{
 family:"search",engine,depth});
}
for(const [engine,depth] of [["v1.1",2],["v2",2],["v3",3],["v1.1",3]]){
 put("g4-s"+String(++num).padStart(2,"0"),"保种搜索 "+engine+" / "+depth+" 层",{
 family:"search",engine,depth});
}
num=0;
for(const sims of [4,8,12,16])for(const c of [.35,.8,1.5,2.9]){
 put("g4-p"+String(++num).padStart(2,"0"),"纯 PUCT "+sims+" 模拟 / 探索 "+c,{
 family:"puct",sims,c,priorMix:0,valueMix:0,models:[]});
}
num=0;
for(const model of ["n24","v2","v3","n64"]){
 for(const [priorMix,valueMix,sims,c] of [[.13,0,8,1.3],[.3,.08,12,1.5],
 [.6,.3,16,.8],[.55,.06,10,2.4]]){
  put("g4-n"+String(++num).padStart(2,"0"),"神经元 "+model+" 权重 "+priorMix,{
   family:"puct",sims,c,priorMix,valueMix,models:[{name:model,weight:1}]});
 }
}
num=0;
for(const engine of ["v1.1","v2","v3","v1.1"]){
 for(const [searchShare,model,sims,c,priorMix] of [[.25,"n64",12,1.25,.5],
 [.45,"v3",10,1.6,.3],[.6,"v2",8,1.1,.22],[.75,"n24",16,2.1,.58]]){
  put("g4-h"+String(++num).padStart(2,"0"),"杂交 "+engine+" 搜索 "+searchShare+" + "+model,{
  family:"hybrid",engine,depth:2,searchShare,sims,c,priorMix,valueMix:.06,
  models:[{name:model,weight:1}]});
 }
}
if(P.length!==64||new Set(P.map(x=>x.id)).size!==64)throw Error("Population composition invalid");
const families={search:0,"rule-puct":0,neural:0,hybrid:0};
for(const a of P)families[a.family==="search"?"search":a.family==="hybrid"?"hybrid":a.models?.length?"neural":"rule-puct"]++;
if(Object.values(families).some(v=>v!==16))throw Error("64 population balance violated");
fs.writeFileSync(out,JSON.stringify({schema:"mumu-g4-population-v1",generation:0,created:"2026-10-14",
 parentExperiment:"G3 g2 + strange-mutation champion study",rules:"game.js",
 policy:"32 retained + 32 children, per-family diversity floors; no raw neural weight splice",
 defaultBudgetMs:260,agentCount:P.length,families,experimentOnly:true,agents:P},null,2));
console.log("G4_POPULATION_64",JSON.stringify({path:out,count:P.length,families}));
