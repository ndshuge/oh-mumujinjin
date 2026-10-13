"use strict";
// PUCT V2: corrected negamax backup, transposition cache, repetition draw,
// legal-masked policy labels and wall-clock search budget.
const policy=require("./policy.cjs");
function search(engine,root,side,opt={}){
 const maxSim=Math.max(1,Math.min(2048,opt.simulations||32));
 const deadline=Date.now()+Math.max(1,opt.timeMs||60000);
 const c=opt.c||1.35,table=new Map(),goal=engine.terrain.CAMPS;
 let created=0,cacheHits=0;
 function winner(s){
  for(let who=0;who<2;who++)
   if(goal[1-who].some(p=>p.x===s.players[who].x&&p.y===s.players[who].y))return who;
  return null;
 }
 function heuristic(s,p){
  const w=winner(s);if(w!==null)return w===p?1:-1;
  const a=engine.computerDistance(s.players[p],goal[1-p],s.walls,s.dirs[p]);
  const b=engine.computerDistance(s.players[1-p],goal[p],s.walls,s.dirs[1-p]);
  if(!Number.isFinite(a))return -1;if(!Number.isFinite(b))return 1;
  return Math.tanh((b-a)*0.14+0.015*(s.left[p]-s.left[1-p]));
 }
 const evaluate=(s,p)=>{
  const w=winner(s);if(w!==null)return w===p?1:-1;
  const h=heuristic(s,p);
  if(opt.value){const v=opt.value(s,p),w=Math.max(0,Math.min(1,opt.valueWeight??1));if(Number.isFinite(v))return Math.max(-1,Math.min(1,(1-w)*h+w*v));}
  return h;
 };
 function key(s,p){
  const walls=s.walls.map(w=>w.o+":"+w.x+":"+w.y).sort();
  return JSON.stringify([p,s.players,s.dirs,s.left,walls]);
 }
 function nodeFor(s,p){
  const id=key(s,p),old=table.get(id);
  if(old){cacheHits++;return old;}
  let result=policy.actions(engine,s,p);
  const edges=result.list.map((action,i)=>{
    const next=engine.hellApply(s,p,action);
    let improvement=heuristic(next,p)-heuristic(s,p);
    return{action,id:result.ids[i],next,weight:Math.exp(Math.max(-12,Math.min(12,2.8*improvement))),n:0,total:0,child:null};
  });
  // Injecting a trained policy is optional; its output must obey the legal mask.
  if(opt.prior){
    const extra=opt.prior(s,p,edges.map(e=>e.id));
    if(extra&&extra.length===policy.SIZE){
      const mix=Math.max(0,Math.min(1,opt.priorWeight??1));
      const initial=edges.reduce((sum,e)=>sum+e.weight,0)||1;
      const modelSum=edges.reduce((sum,e)=>sum+Math.max(0,Number(extra[e.id])||0),0)||1;
      edges.forEach(e=>{const learned=Math.max(0,Number(extra[e.id])||0)/modelSum;e.weight=(1-mix)*e.weight/initial+mix*learned+1e-8;});
    }
  }
  const sum=edges.reduce((a,e)=>a+e.weight,0)||1;
  edges.forEach(e=>e.prior=e.weight/sum);
  const node={s,p,key:id,n:0,edges};table.set(id,node);created++;return node;
 }
 const rootNode=nodeFor(root,side);
 let completed=0;
 for(let iter=0;iter<maxSim;iter++){
  if(iter>0 && Date.now()>=deadline)break;
  let node=rootNode,leafValue=0,leafPlayer=side;
  const path=[],seen=new Set();
  for(let depth=0;depth<150;depth++){
   if(seen.has(node.key)){leafValue=0;leafPlayer=node.p;break;}
   seen.add(node.key);
   const win=winner(node.s);
   if(win!==null){leafValue=win===node.p?1:-1;leafPlayer=node.p;break;}
   if(node.edges.length===0){leafValue=-1;leafPlayer=node.p;break;}
   let selected=null,best=-Infinity;
   for(const edge of node.edges){
    const q=edge.n?edge.total/edge.n:0;
    const u=c*edge.prior*Math.sqrt(node.n+1)/(1+edge.n);
    if(q+u>best){best=q+u;selected=edge;}
   }
   path.push({node,edge:selected});
   if(!selected.child){
    selected.child=nodeFor(selected.next,1-node.p);
    leafPlayer=selected.child.p;
    leafValue=evaluate(selected.next,leafPlayer);
    break;
   }
   node=selected.child;
   if(depth===149){leafValue=0;leafPlayer=node.p;}
  }
  let v=leafValue;
  // Terminal/leaf value uses the child player's perspective; each edge is
  // scored from its parent's perspective, requiring a sign flip per ply.
  for(let i=path.length-1;i>=0;i--){
   v=-v;const {node,edge}=path[i];
   edge.n++;edge.total+=v;node.n++;
  }
  // If no edge was traversed, record an evaluated root visit only.
  if(!path.length)rootNode.n++;
  completed++;
 }
 const ranked=rootNode.edges.slice().sort((a,b)=>b.n-a.n||b.total-a.total);
 const visits=ranked.map(e=>({id:e.id,n:e.n,q:e.n?e.total/e.n:0}));
 const policyVector=Array(policy.SIZE).fill(0);
 const denom=ranked.reduce((n,e)=>n+e.n,0)||1;
 for(const e of ranked)policyVector[e.id]=e.n/denom;
 return{
  action:ranked[0]?.action||null,simulations:completed,policySize:policy.SIZE,
  visits,policy:policyVector,rootValue:rootNode.n?ranked.reduce((n,e)=>n+e.total,0)/rootNode.n:0,
  nodes:created,cacheHits,legalIndices:ranked.map(e=>e.id)
 };
}
module.exports={search};
