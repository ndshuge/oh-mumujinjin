"use strict";
// PUCT search with a rules-only rollout/value prior. Future trained policy/value
// network can replace evaluate/prior without changing the action encoder.
const policy=require("./policy.cjs");
function search(engine,root,side,opt={}){
 const simulations=Math.max(1,Math.min(512,opt.simulations||24));
 const c=opt.c||1.35;
 const goal=engine.terrain.CAMPS;
 const distance=(s,p)=>engine.computerDistance(s.players[p],goal[1-p],s.walls,s.dirs[p]);
 const terminal=s=>{
  if(goal[0].some(q=>q.x===s.players[1].x&&q.y===s.players[1].y))return 1;
  if(goal[1].some(q=>q.x===s.players[0].x&&q.y===s.players[0].y))return 0;
  return null;
 };
 const evalState=(s,toMove)=>{
  const winner=terminal(s);if(winner!==null)return winner===toMove?1:-1;
  const own=distance(s,toMove),opp=distance(s,1-toMove);
  if(!Number.isFinite(own))return -1;
  if(!Number.isFinite(opp))return 1;
  return Math.tanh((opp-own)*.12);
 };
 function makeNode(s,p){
  const {list,ids}=policy.actions(engine,s,p);
  const ranked=list.map((action,i)=>{
   const next=engine.hellApply(s,p,action),d=distance(next,p),before=distance(s,p);
   return {action,id:ids[i],next,score:(before-d)*1.5 + evalState(next,p),visits:0,total:0,child:null};
  });
  const max=Math.max(0,...ranked.map(q=>q.score));
  const weights=ranked.map(q=>Math.exp(Math.max(-20,q.score-max)));
  const sum=weights.reduce((a,b)=>a+b,0)||1;
  ranked.forEach((e,i)=>e.prior=weights[i]/sum);
  return {state:s,player:p,edges:ranked,visits:0};
 }
 const top=makeNode(root,side);
 for(let run=0;run<simulations;run++){
  let node=top;const trail=[],visited=new Set();
  let value;
  while(true){
   const winner=terminal(node.state);
   if(winner!==null){value=(trail.length?-1:1)*(winner===node.player?1:-1);break;}
   if(node.edges.length===0){value=trail.length?1:-1;break;}
   const key=JSON.stringify([node.player,node.state.players,node.state.dirs,node.state.walls,node.state.left]);
   if(visited.has(key)){value=0;break;}
   visited.add(key);
   const edge=node.edges.reduce((best,e)=>{
    const q=e.visits?e.total/e.visits:0;
    const u=c*e.prior*Math.sqrt(node.visits+1)/(1+e.visits);
    return !best||q+u>best.score?{edge:e,score:q+u}:best;
   },null).edge;
   trail.push({node,edge});
   if(!edge.child){edge.child=makeNode(edge.next,1-node.player);value=-evalState(edge.next,edge.child.player);break;}
   node=edge.child;
  }
  for(let i=trail.length-1;i>=0;i--){const {node,edge}=trail[i];edge.visits++;edge.total+=value;node.visits++;value=-value;}
 }
 const ranked=top.edges.sort((a,b)=>b.visits-a.visits||b.total-a.total);
 const chosen=ranked[0];
 return {action:chosen?.action||null,simulations,policySize:policy.S,visits:ranked.map(e=>({id:e.id,n:e.visits,q:e.visits?e.total/e.visits:0})),rootValue:top.visits?ranked.reduce((z,e)=>z+e.total,0)/top.visits:0};
}
module.exports={search};
