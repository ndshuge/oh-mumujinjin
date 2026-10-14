"use strict";
// One uniform host interface for search-only and learned PUCT players.
const path=require("path");
const strong={
 "v1.1":require("../../strong-search-v1.1.js"),
 "v2":require("../../strong-search-v2.js"),
 "v3":require("../../strong-search-v3.js")
};
const puct=require("../puct.cjs"),models={
 "v2":{net:require("../model-v2.cjs"),path:path.join(__dirname,"..","models","policy-value-v2.json")},
 "v3":{net:require("../model-v3.cjs"),path:path.join(__dirname,"..","models","policy-value-v3-balanced.json")},
 "n24":{net:require("../model-n24.cjs"),path:path.join(__dirname,"..","models","policy-value-n24.json")},
 "n64":{net:require("../model-n64.cjs"),path:path.join(__dirname,"..","models","policy-value-n64.json")}
};
const cache=new Map();
function check(p){
 if(!p||typeof p.id!=="string"||!/^[a-z0-9_-]{3,48}$/.test(p.id))throw Error("Invalid competitor ID");
 if(!["search","puct","hybrid"].includes(p.family))throw Error("Invalid family "+p.id);
 if(p.family==="hybrid"){
   if(!strong[p.engine]||![1,2,3].includes(p.depth)||!Number.isFinite(p.searchShare)||p.searchShare<0.25||p.searchShare>0.75)throw Error("Invalid hybrid search recipe");
   check({...p,id:p.id+"-puct",family:"puct"});
   return p;
 }
 if(p.family==="search"){
  if(!strong[p.engine]||![1,2,3,4].includes(p.depth))throw Error("Invalid search genome "+p.id);
 }else{
  if(!Number.isInteger(p.sims)||p.sims<2||p.sims>32||!Number.isFinite(p.c)||p.c<0.3||p.c>3)throw Error("PUCT compute bound "+p.id);
  for(const name of ["priorMix","valueMix"])if(!Number.isFinite(p[name])||p[name]<0||p[name]>0.7)throw Error("Invalid "+name+" "+p.id);
  if(!Array.isArray(p.models)||p.models.length>2)throw Error("At most two models per agent");
  if(p.models.some(m=>!models[m.name]||!Number.isFinite(m.weight)||m.weight<=0||m.weight>1))throw Error("Invalid model genome");
  if(!p.models.length&&(p.priorMix||p.valueMix))throw Error("No model for nonzero neural mix");
  if(p.models.length&&Math.abs(p.models.reduce((sum,m)=>sum+m.weight,0)-1)>1e-6)throw Error("Model weights must sum to one");
 }
 return p;
}
function prepared(p){
 check(p);
 if(!["puct","hybrid"].includes(p.family)||!p.models.length)return [];
 return p.models.map(item=>{
  if(!cache.has(item.name))cache.set(item.name,models[item.name].net.load(models[item.name].path));
  return {...item,net:models[item.name].net,instance:cache.get(item.name)};
 });
}
function move(engine,state,who,map,genome,globalBudgetMs){
 const p=check(genome),t0=Date.now(),timeMs=Math.max(50,Math.min(6000,globalBudgetMs||120));
 if(p.family==="search"){
  const result=strong[p.engine].choose(engine,state,who,{depth:p.depth,timeMs});
  return {...result,modelFamily:"search",timeMs:Date.now()-t0};
 }
 if(p.family==="hybrid"){
  const split=Math.round(timeMs*p.searchShare),searchBudget=Math.max(50,split),puctBudget=Math.max(50,timeMs-split);
  const s=move(engine,state,who,map,{id:p.id+"-search",family:"search",engine:p.engine,depth:p.depth},searchBudget);
  const n=move(engine,state,who,map,{...p,id:p.id+"-neural",family:"puct"},puctBudget);
  const hasGoal=(next)=>engine.terrain.CAMPS[1-who].some(g=>g.x===next.players[who].x&&g.y===next.players[who].y);
  const rank=(action)=>{
   if(!action)return -Infinity;
   const next=engine.hellApply(state,who,action);
   if(hasGoal(next))return 100000;
   const sign=who===1?1:-1;
   let val=sign*engine.hellEvaluate(next);
   // Penalize moves allowing an opponent's immediately winning reply.
   for(const m of engine.movementOptions(next.players[1-who],next.dirs[1-who],next.walls)){
    const goal=engine.terrain.CAMPS[who];
    const canWin=p=>goal.some(g=>g.x===p.x&&g.y===p.y);
    if(canWin(m.p)){val-=10000;break;}
    const gate=engine.portal(m.p);
    if(gate&&canWin(gate.a.x===m.p.x&&gate.a.y===m.p.y?gate.b:gate.a)){val-=10000;break;}
   }
   return val;
  };
  const action=rank(s.action)>=rank(n.action)?s.action:n.action;
  return {action,modelFamily:"hybrid",timeMs:Date.now()-t0,componentTimeMs:[s.timeMs,n.timeMs]};
 }
 const nets=prepared(p);
 const settings={simulations:p.sims,c:p.c,timeMs};
 const input={...map,terrain:engine.terrain};
 if(nets.length&&p.priorMix){
  settings.priorWeight=p.priorMix;
  settings.prior=(s,player)=>{
   const out=new Float64Array(232);
   for(const n of nets){
    const prediction=n.net.predict(n.instance,s,input,player);
    for(let i=0;i<232;i++)out[i]+=n.weight*prediction.policy[i];
   }
   return out;
  };
 }
 if(nets.length&&p.valueMix){
  settings.valueWeight=p.valueMix;
  settings.value=(s,player)=>nets.reduce((sum,n)=>sum+n.weight*n.net.predict(n.instance,s,input,player).value,0);
 }
 const result=puct.search(engine,state,who,settings);
 return {...result,modelFamily:"puct",timeMs:Date.now()-t0};
}
module.exports={check,move};
