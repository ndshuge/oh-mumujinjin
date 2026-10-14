"use strict";
// Stage C experimental continuation. Train strategy on frozen search teacher;
// deweight weak-game value labels, use stronger self-play terminal value labels.
// Early stopping uses validation layouts only, NOT the separate arena gate.
const fs=require("fs"),path=require("path"),net=require("./model-n24.cjs");
const root=path.join(__dirname,"output"),file=path.join(root,"c-selfplay-combined.jsonl");
const train=[],valid=[],ids={train:new Set(),heldOut:new Set()};
let rng=20261014;const rand=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);
for(const line of fs.readFileSync(file,"utf8").split("\n")){
 if(!line)continue;const r=JSON.parse(line);
 const sig=r.map.rocks.map(p=>p.x+":"+p.y).sort().join("|"),which=r.split;
 ids[which].add(sig);
 const sample={x:net.feature(r.state,r.map,r.side),policy:r.policy,value:r.value,
  type:r.source==="v1.1-selfplay-final-result"?"selfplay":"search"};
 (which==="train"?train:valid).push(sample);
}
const leaks=[...ids.train].filter(x=>ids.heldOut.has(x));
if(leaks.length)throw Error("Validation map leak "+leaks.length);
let m=net.create(20261017),best=Infinity,bestEpoch=0,bestJSON=null;
const epochs=[];
function assess(){
 const groups={search:{n:0,CE:0,accuracy:0,valueMSE:0},selfplay:{n:0,CE:0,accuracy:0,valueMSE:0}};
 for(const ex of valid){
  const g=groups[ex.type],o=net.forward(m,ex.x),p=net.probabilities(o.logits);
  let top=-1,prob=-Infinity;
  for(let j=0;j<p.length;j++)if(p[j]>prob){prob=p[j];top=j;}
  g.n++;if(top===ex.policy)g.accuracy++;
  g.CE-=Math.log(Math.max(1e-9,p[ex.policy]));
  g.valueMSE+=(o.value-ex.value)**2;
 }
 for(const g of Object.values(groups))for(const k of ["CE","accuracy","valueMSE"])g[k]/=g.n;
 return groups;
}
for(let ep=0;ep<10;ep++){
 const lr=.009*Math.pow(.79,ep),order=Array.from({length:train.length},(_,i)=>i);
 for(let i=order.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
 for(const idx of order){
  const ex=train[idx],valueWeight=ex.type==="selfplay"?.15:.02;
  net.trainOne(m,ex.x,ex.policy,ex.value,lr,valueWeight);
 }
 const metrics=assess();
 const score=.5*(metrics.search.CE+metrics.selfplay.CE)+.1*(metrics.search.valueMSE+metrics.selfplay.valueMSE);
 epochs.push({epoch:ep+1,score,metrics});
 if(score<best){best=score;bestEpoch=ep+1;bestJSON=net.serialize(m);}
 console.log("C_N24_EPOCH",JSON.stringify({epoch:ep+1,score,metrics}));
}
const meta={stage:"C",variant:"width-sweep-n24",trainingSamples:train.length,
 heldoutSamples:valid.length,trainMaps:ids.train.size,validationMaps:ids.heldOut.size,
 leakage:leaks.length,bestEpoch,bestScore:best,epochs,
 note:"Value labels for earlier heuristic-game search samples weighted 0.02; V1.1 self-play terminal labels weighted 0.15. Experimental and not a chess strength guarantee."};
const out=path.join(__dirname,"models","policy-value-n24.json");
fs.writeFileSync(out,JSON.stringify({...bestJSON,meta}));
fs.writeFileSync(path.join(root,"c-n24-report.json"),JSON.stringify(meta,null,2));
console.log("C_N24_TRAIN_RESULT",JSON.stringify({model:out,train:train.length,valid:valid.length,bestEpoch,bestScore:best,validation:epochs[bestEpoch-1].metrics}));
