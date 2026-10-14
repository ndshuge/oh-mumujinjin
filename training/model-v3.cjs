"use strict";
// Minimal inference/training engine: 2-layer multi-head neural network.
// Input encodes CURRENT board and wall structure; no map IDs or memorized openings.
const fs=require("fs"),policy=require("./policy.cjs");
const D=907,H=48,P=policy.SIZE;
function feature(state,map,side){
 const x=new Float32Array(D),where=p=>p.y*9+p.x;
 for(const rock of map.rocks)x[where(rock)]=1;
 x[117+where(state.players[side])]=1;
 x[234+where(state.players[1-side])]=1;
 for(const w of state.walls){
  if(w.x>=0&&w.x<8&&w.y>=0&&w.y<12)x[351+(w.o==="v"?96:0)+w.y*8+w.x]=1;
 }
 x[543]=state.left[side]/5;x[544]=state.left[1-side]/5;x[545]=side===0?1:-1;
 const goal=side===0?{x:1,y:0}:{x:7,y:12};
 const other=side===0?{x:7,y:12}:{x:1,y:0};
 const man=(p,q)=>(Math.abs(p.x-q.x)+Math.abs(p.y-q.y))/20;
 x[546]=man(state.players[side],goal);
 x[547]=man(state.players[1-side],other);
 // Stage C v2: directional momentum on ice is decisive for legal move choice.
 // Encode both directional states separately instead of hiding them from the model.
 const dirs=[[0,-1],[1,0],[0,1],[-1,0]];
 for(const [turn,p] of [side,1-side].entries()){
   const d=state.dirs[p];if(!d)continue;
   const index=dirs.findIndex(([dx,dy])=>dx===d.x&&dy===d.y);
   if(index>=0)x[548+turn*4+index]=1;
 }
 // Fixed special tiles in the current rules. Pass terrain from engine at training
 // and inference, never from an opponent-controlled map ID.
 if(map.terrain){
   for(const gate of map.terrain.PORTALS||[])for(const p of [gate.a,gate.b])x[556+where(p)]=1;
   for(const p of map.terrain.ICE||[])x[673+where(p)]=1;
   for(const p of map.terrain.BOOST||[])x[790+where(p)]=1;
 }
 return x;
}
function create(seed=42){
 let rng=seed>>>0;const rand=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);
 const w1=new Float32Array(D*H),wp=new Float32Array(H*P),wv=new Float32Array(H);
 for(let i=0;i<w1.length;i++)w1[i]=(rand()-.5)*2/Math.sqrt(D);
 for(let i=0;i<wp.length;i++)wp[i]=(rand()-.5)*2/Math.sqrt(H);
 for(let i=0;i<wv.length;i++)wv[i]=(rand()-.5)/Math.sqrt(H);
 return{w1,b1:new Float32Array(H),wp,bp:new Float32Array(P),wv,bv:0};
}
function forward(m,x){
 const hidden=new Float32Array(H);
 for(let h=0;h<H;h++){let s=m.b1[h],offset=h*D;for(let i=0;i<D;i++)s+=m.w1[offset+i]*x[i];hidden[h]=Math.tanh(s);}
 const logits=new Float32Array(P);
 for(let j=0;j<P;j++){let s=m.bp[j],offset=j*H;for(let h=0;h<H;h++)s+=m.wp[offset+h]*hidden[h];logits[j]=s;}
 let raw=m.bv;for(let h=0;h<H;h++)raw+=m.wv[h]*hidden[h];
 return{hidden,logits,value:Math.tanh(raw)};
}
function probabilities(logits){
 let max=-Infinity;for(const a of logits)if(a>max)max=a;
 const p=new Float32Array(logits.length);let sum=0;
 for(let j=0;j<logits.length;j++){sum+=p[j]=Math.exp(Math.max(-40,logits[j]-max));}
 for(let j=0;j<p.length;j++)p[j]/=sum;
 return p;
}
function trainOne(m,x,target,goal,lr=.01,valueWeight=.55){
 const {hidden,logits,value}=forward(m,x),probs=probabilities(logits);
 const delta=new Float32Array(H),gV=valueWeight*(value-goal)*(1-value*value);
 for(let j=0;j<P;j++){
  const d=probs[j]-(j===target?1:0),offset=j*H;
  for(let h=0;h<H;h++)delta[h]+=m.wp[offset+h]*d;
 }
 for(let h=0;h<H;h++)delta[h]+=m.wv[h]*gV;
 for(let j=0;j<P;j++){
  const d=probs[j]-(j===target?1:0),offset=j*H;
  for(let h=0;h<H;h++)m.wp[offset+h]-=lr*d*hidden[h];
  m.bp[j]-=lr*d;
 }
 for(let h=0;h<H;h++)m.wv[h]-=lr*gV*hidden[h];
 m.bv-=lr*gV;
 for(let h=0;h<H;h++){
  const d=Math.max(-2,Math.min(2,delta[h]*(1-hidden[h]*hidden[h]))),offset=h*D;
  for(let i=0;i<D;i++)m.w1[offset+i]-=lr*d*x[i];
  m.b1[h]-=lr*d;
 }
 return{loss:-Math.log(Math.max(1e-9,probs[target])),mse:(value-goal)*(value-goal)};
}
function predict(model,state,map,side){
 const f=feature(state,map,side),out=forward(model,f);
 return{policy:probabilities(out.logits),value:out.value};
}
function serialize(m){return{format:"mumu-policy-value-v3",input:D,hidden:H,actions:P,policyVersion:policy.VERSION,w1:[...m.w1],b1:[...m.b1],wp:[...m.wp],bp:[...m.bp],wv:[...m.wv],bv:m.bv};}
function restore(doc){if(doc.policyVersion!==policy.VERSION||doc.input!==D||doc.actions!==P||doc.hidden!==H)throw Error("Model dimensions/version mismatch");return{w1:Float32Array.from(doc.w1),b1:Float32Array.from(doc.b1),wp:Float32Array.from(doc.wp),bp:Float32Array.from(doc.bp),wv:Float32Array.from(doc.wv),bv:doc.bv};}
function load(path){return restore(JSON.parse(fs.readFileSync(path,"utf8")));}
module.exports={D,H,P,feature,create,forward,probabilities,trainOne,predict,serialize,restore,load};
