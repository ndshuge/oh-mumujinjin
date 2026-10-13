"use strict";
const fs=require("fs"),path=require("path"),readline=require("readline");
const net=require("./model.cjs"),policy=require("./policy.cjs");
const root=path.join(__dirname,"output");
const dataset=path.join(root,process.argv[2]||"dataset-120-10000.jsonl");
const trainLimit=Math.max(1000,Math.min(25000,Number(process.argv[3]||12000)));
const valLimit=Math.max(300,Math.min(5000,Number(process.argv[4]||2000)));
const seed=20261014;let rng=seed>>>0;
const rand=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);
function addSample(pool,row,max,count){if(pool.length<max)pool.push(row);else{const i=Math.floor(rand()*count);if(i<max)pool[i]=row;}}
function bestIndex(arr){let idx=0,best=-Infinity;for(let i=0;i<arr.length;i++)if(arr[i]>best){idx=i;best=arr[i];}return idx;}
async function main(){
 const train=[],validation=[],trainMaps=new Set(),holdoutMaps=new Set(),counts=new Uint32Array(net.P);
 let nTrain=0,nValid=0;
 const stream=fs.createReadStream(dataset,{encoding:"utf8"});
 for await(const line of readline.createInterface({input:stream,crlfDelay:Infinity})){
  if(!line)continue;const item=JSON.parse(line);
  if(item.policyVersion!==policy.VERSION)throw Error("Dataset policy version mismatch");
  const id=item.map.rocks.map(p=>p.x+":"+p.y).sort().join("|");
  if(item.split==="train"){trainMaps.add(id);counts[item.policy]++;addSample(train,item,trainLimit,++nTrain);}
  else{holdoutMaps.add(id);addSample(validation,item,valLimit,++nValid);}
 }
 const overlap=[...holdoutMaps].filter(x=>trainMaps.has(x));
 if(overlap.length)throw Error("TRAIN/VALIDATION MAP LEAKAGE "+overlap.length);
 console.log("DATA",JSON.stringify({source:dataset,trainRows:nTrain,heldoutRows:nValid,trainMaps:trainMaps.size,heldoutMaps:holdoutMaps.size,overlap:overlap.length,reservoir:[train.length,validation.length]}));
 const baseline=new Float32Array(net.P);let total=0;
 for(let i=0;i<net.P;i++)total+=counts[i];
 for(let i=0;i<net.P;i++)baseline[i]=(counts[i]+1)/(total+net.P);
 const majority=bestIndex(counts),meanValue=train.reduce((s,a)=>s+a.value,0)/train.length;
 const examples=train.map(a=>({x:net.feature(a.state,a.map,a.side),policy:a.policy,value:a.value}));
 const test=validation.map(a=>({x:net.feature(a.state,a.map,a.side),policy:a.policy,value:a.value}));
 const model=net.create(seed);
 function measure(list){
  let good=0,baselineGood=0,loss=0,baseLoss=0,mse=0,baseMSE=0;
  for(const ex of list){
   const out=net.forward(model,ex.x),p=net.probabilities(out.logits);
   if(bestIndex(p)===ex.policy)good++;
   if(majority===ex.policy)baselineGood++;
   loss-=Math.log(Math.max(1e-9,p[ex.policy]));
   baseLoss-=Math.log(Math.max(1e-9,baseline[ex.policy]));
   mse+=(out.value-ex.value)**2;
   baseMSE+=(meanValue-ex.value)**2;
  }
  const n=list.length;
  return{n,accuracy:good/n,baselineAccuracy:baselineGood/n,crossEntropy:loss/n,baselineCrossEntropy:baseLoss/n,valueMSE:mse/n,baselineValueMSE:baseMSE/n};
 }
 const epochs=[];
 const started=Date.now();
 for(let e=0;e<4;e++){
  const lr=0.018*Math.pow(.65,e),indices=Array.from({length:examples.length},(_,i)=>i);
  for(let i=indices.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[indices[i],indices[j]]=[indices[j],indices[i]];}
  let loss=0,mse=0;
  for(let step=0;step<indices.length;step++){
   const ex=examples[indices[step]],result=net.trainOne(model,ex.x,ex.policy,ex.value,lr);
   loss+=result.loss;mse+=result.mse;
  }
  const metrics=measure(test);
  epochs.push({epoch:e+1,trainLoss:loss/examples.length,trainValueMSE:mse/examples.length,heldout:metrics});
  console.log("EPOCH",JSON.stringify(epochs.at(-1)));
 }
 const meta={seed,inputDim:net.D,hiddenDim:net.H,actions:net.P,policyVersion:policy.VERSION,dataset:path.basename(dataset),
   split:"by canonical obstacle-layout fingerprint",trainMaps:trainMaps.size,heldoutMaps:holdoutMaps.size,trainRows:nTrain,heldoutRows:nValid,
   epochs,elapsedMs:Date.now()-started,trainedAt:new Date().toISOString()};
 const dir=path.join(__dirname,"models");fs.mkdirSync(dir,{recursive:true});
 const modelPath=path.join(dir,"policy-value-v1.json");
 fs.writeFileSync(modelPath,JSON.stringify({...net.serialize(model),meta}));
 fs.writeFileSync(path.join(root,"s3-report.json"),JSON.stringify(meta,null,2));
 const result=epochs.at(-1).heldout;
 const passed=result.crossEntropy<result.baselineCrossEntropy&&result.valueMSE<result.baselineValueMSE&&result.accuracy>=result.baselineAccuracy;
 console.log("S3 MODEL",JSON.stringify({passed,modelPath,metrics:result,elapsedMs:meta.elapsedMs}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
