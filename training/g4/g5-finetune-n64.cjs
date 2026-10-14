"use strict";
// G5 genuinely updated N64: train split only, independent source snapshot, no frozen model overwrite.
// Usage: node training/g4/g5-finetune-n64.cjs [epochs=3]
const fs=require("fs"),path=require("path"),crypto=require("crypto"),net=require("../model-n64.cjs");
const root=path.resolve(__dirname,"../.."),lab=path.join(root,"training/output/lab/g5"),src=path.join(root,"training/output/c-selfplay-combined.jsonl"),base=path.join(root,"training/models/policy-value-n64.json");
const epochs=Number(process.argv[2]??3);if(!Number.isInteger(epochs)||epochs<1||epochs>12)throw Error("epochs 1..12");
const out=path.join(lab,"policy-value-g5-finetune-v1.json"),report=path.join(lab,"g5-finetune-v1-report.json");if(fs.existsSync(out)||fs.existsSync(report))throw Error("Refusing overwrite");
const train=[],valid=[],trainMaps=new Set(),validMaps=new Set();let rng=2026101401;const random=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);
for(const line of fs.readFileSync(src,"utf8").split("\n")){if(!line)continue;const r=JSON.parse(line),key=r.map.rocks.map(p=>p.x+":"+p.y).sort().join("|"),ex={x:net.feature(r.state,r.map,r.side),policy:r.policy,value:r.value,source:r.source};if(r.split==="train"){train.push(ex);trainMaps.add(key);}else if(r.split==="heldOut"){valid.push(ex);validMaps.add(key);}else throw Error("Unknown split");}
if([...trainMaps].some(x=>validMaps.has(x)))throw Error("Train/validation map leakage");
const original=net.load(base),m=net.load(base);
function evaluate(model,samples){let ce=0,mse=0,accuracy=0;for(const x of samples){const f=net.forward(model,x.x),p=net.probabilities(f.logits);ce-=Math.log(Math.max(1e-12,p[x.policy]));mse+=(f.value-x.value)**2;let max=0;for(let j=1;j<p.length;j++)if(p[j]>p[max])max=j;accuracy+=Number(max===x.policy);}return{n:samples.length,ce:ce/samples.length,mse:mse/samples.length,accuracy:accuracy/samples.length};}
const before=evaluate(original,valid),history=[];let best=Infinity,bestModel=null,bestEpoch=0;
for(let epoch=0;epoch<epochs;epoch++){const order=Array.from({length:train.length},(_,i)=>i);for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}const lr=.0025*Math.pow(.8,epoch);for(const idx of order){const x=train[idx];net.trainOne(m,x.x,x.policy,x.value,lr,.22);}const metrics=evaluate(m,valid),score=metrics.ce+.2*metrics.mse;history.push({epoch:epoch+1,score,...metrics});if(score<best){best=score;bestEpoch=epoch+1;bestModel=net.serialize(m);}console.log("FINETUNE_EPOCH",JSON.stringify({epoch:epoch+1,score,accuracy:metrics.accuracy}));}
const after=evaluate(net.restore(bestModel),valid),changed=bestModel.w1.some((v,i)=>v!==original.w1[i])||bestModel.wp.some((v,i)=>v!==original.wp[i]);
if(!changed)throw Error("Model weights did not change");
const meta={schema:"g5-n64-finetune-v1",frozenChampion:"g4-h13",baseModel:"policy-value-n64.json",baseSHA256:crypto.createHash("sha256").update(fs.readFileSync(base)).digest("hex"),dataSHA256:crypto.createHash("sha256").update(fs.readFileSync(src)).digest("hex"),trainSamples:train.length,validationSamples:valid.length,trainMaps:trainMaps.size,validationMaps:validMaps.size,leakage:0,epochs,bestEpoch,before,after,weightsChanged:changed,developmentOnly:true,promotionApproved:false};
fs.writeFileSync(out,JSON.stringify({...bestModel,meta}));fs.writeFileSync(report,JSON.stringify(meta,null,2));console.log("FINETUNE_COMPLETE",JSON.stringify({out,report,before,after,changed}));
