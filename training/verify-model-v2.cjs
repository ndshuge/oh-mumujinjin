"use strict";
// Small independent legality + prediction check of the stage-C V2 network.
const fs=require("fs"),path=require("path"),assert=require("assert");
const {engine}=require("./train.cjs"),net=require("./model-v2.cjs"),policy=require("./policy.cjs");
const model=net.load(path.join(__dirname,"models","policy-value-v2.json"));
const lines=fs.readFileSync(path.join(__dirname,"output","teacher-pilot-merged.jsonl"),"utf8").trim().split("\n");
let positions=0,legalPreferred=0,illegal=0,tooLarge=0;
for(const line of lines){
 if(!line)continue;
 const row=JSON.parse(line);if(row.split!=="heldOut")continue;
 engine.setRocks(row.map.rocks);
 const {policy:probs,value}=net.predict(model,row.state,row.map,row.side);
 assert.strictEqual(probs.length,policy.SIZE);
 assert(Number.isFinite(value)&&Math.abs(value)<=1);
 let total=0;for(const v of probs)total+=v;
 assert(Math.abs(total-1)<0.0001);
 const legal=new Set(policy.actions(engine,row.state,row.side).ids);
 let best=-1,bp=-Infinity;
 for(const id of legal)if(probs[id]>bp){best=id;bp=probs[id];}
 assert(legal.has(best));
 if(best===row.policy)legalPreferred++;
 const invalidMass=probs.reduce((s,v,i)=>s+(legal.has(i)?0:v),0);
 if(!Number.isFinite(invalidMass))illegal++;
 if(invalidMass>0.99)tooLarge++;
 positions++;
}
const report={model:"policy-value-v2.json",positions,correctLegalTop1:legalPreferred,correctLegalTop1Rate:legalPreferred/positions,invalidPredictions:illegal,almostAllProbabilityIllegal:tooLarge,policySpace:policy.SIZE};
fs.writeFileSync(path.join(__dirname,"output","c-inference-check.json"),JSON.stringify(report,null,2));
console.log("C_PILOT_INFERENCE",JSON.stringify(report));
if(illegal)process.exitCode=1;
