"use strict";
// Experimental phase-shift mutations: preserve strong G4 moves early,
// alter decisions only in pre-identified losing side/phase. Not deployed.
const agent=require("./league/agent.cjs"),policy=require("./policy.cjs");
const pop=require("./league/population-g4-top5-v11.json").agents,base=pop.find(x=>x.id==="g4-h13");
const eq=(a,b)=>a&&b&&a.x===b.x&&a.y===b.y;
function delta(e,s,side,a){
 const before=[0,1].map(p=>e.computerDistance(s.players[p],e.terrain.CAMPS[1-p],s.walls,s.dirs[p]));
 const n=e.hellApply(s,side,a);
 const after=[0,1].map(p=>e.computerDistance(n.players[p],e.terrain.CAMPS[1-p],n.walls,n.dirs[p]));
 const diff=(before[side]-after[side]),op=(after[1-side]-before[1-side]);
 const threatened=e.movementOptions(n.players[1-side],n.dirs[1-side],n.walls).some(m=>{
  const targets=e.terrain.CAMPS[side],portal=e.portal(m.p);
  return targets.some(g=>eq(g,m.p)||portal&&eq(g,eq(m.p,portal.a)?portal.b:portal.a));
 });
 return {score:7*diff+2.1*op-.4*(a.wall?1:0)-20000*Number(threatened),diff,op};
}
const variants=["phase-defense","phase-siege","phase-gamble","phase-countertempo"];
function move(e,s,side,map,variant,{nodes=100}={}){
 if(!variants.includes(variant))throw Error("Unknown mutation");
 const old=agent.move(e,s,side,map,base,160,{deterministic:true,maxNodes:nodes}).action;
 const own=e.computerDistance(s.players[side],e.terrain.CAMPS[1-side],s.walls,s.dirs[side]);
 const opp=e.computerDistance(s.players[1-side],e.terrain.CAMPS[side],s.walls,s.dirs[1-side]);
 const danger=opp<=own+2,late=own<9||opp<9;
 const shouldMutate=variant==="phase-defense"||variant==="phase-countertempo"?danger:variant==="phase-siege"?s.left[side]>=2&&s.left[1-side]>=1:late;
 if(!shouldMutate)return {action:old,g5:"old"};
 const legal=e.hellCandidates(s,side),baseId=policy.encode(old);
 const scored=legal.map(a=>({a,id:policy.encode(a),...delta(e,s,side,a)}));
 for(const x of scored){
  if(variant==="phase-countertempo"&&own-opp>=3)x.score=3.5*x.diff+5.5*x.op-.2*Number(!!x.a.wall)-20000*Number(x.score < -10000);
  if(x.id===baseId)x.score+=variant==="phase-gamble"?-.8:2;
  if(variant==="phase-siege"&&x.a.wall)x.score+=5*x.op+2;
  if((variant==="phase-defense"||variant==="phase-countertempo")&&x.a.wall&&opp<=4)x.score+=3*x.op;
 }
 scored.sort((a,b)=>b.score-a.score||a.id-b.id);
 const chosen=scored[0];
 if(!Number.isFinite(chosen.score))return {action:old,g5:"fallback"};
 return {action:chosen.a,g5:"phase",changed:chosen.id!==baseId};
}
module.exports={variants,move};
