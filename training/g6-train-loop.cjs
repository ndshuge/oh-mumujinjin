"use strict";
// G6 experimental loop. Never overwrite frozen champion.
const fs=require("fs"),path=require("path"),net=require("./model-n64.cjs");
const root=__dirname;
const replay=path.join(root,"output/lab/g6/replay-buffer-g6.jsonl");
const out=path.join(root,"output/lab/g6/policy-value-g6-candidate.json");
const report=path.join(root,"output/lab/g6/train-g6-report.json");
if(fs.existsSync(out)) throw Error("immutable candidate exists");
const train=[];
for(const line of fs.readFileSync(replay,"utf8").split("\n")){if(!line)continue;const r=JSON.parse(line);if(typeof r.policy!=="number")continue;train.push({x:net.feature(r.state,r.map,r.side),policy:r.policy,value:r.value});}
let m=net.create(20261014);
for(let ep=0;ep<5;ep++){for(const x of train)net.trainOne(m,x.x,x.policy,x.value,0.004,0.1);console.log("G6_EPOCH",ep+1,train.length);}
const meta={schema:"g6-n64-candidate-v1",samples:train.length,epochs:5,frozenChampionUntouched:true};
fs.writeFileSync(out,JSON.stringify({...net.serialize(m),meta}));fs.writeFileSync(report,JSON.stringify(meta,null,2));
console.log(JSON.stringify(meta));