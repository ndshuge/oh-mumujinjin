"use strict";
const path=require("path"),fs=require("fs"),assert=require("assert");
const {engine,mapGen}=require("./train.cjs"),net=require("./model.cjs"),puct=require("./puct.cjs"),policy=require("./policy.cjs");
const f=path.join(__dirname,"models","policy-value-v1.json"),model=net.load(f);
const n=Math.max(2,Math.min(100,Number(process.argv[2]||20)));
let passed=0,invalid=0,totalNodes=0,totalMs=0;
for(let i=0;i<n;i++){
 const map=mapGen(i+9000);engine.setRocks(map.rocks);
 const s={players:engine.terrain.CAMPS.map(a=>({...a[1]})),dirs:[null,null],walls:[],left:[5,5]};
 for(let who=0;who<2;who++){
  const prob=net.predict(model,s,map,who);
  assert.strictEqual(prob.policy.length,policy.SIZE);
  assert(Number.isFinite(prob.value)&&Math.abs(prob.value)<=1);
  const t=Date.now();
  const result=puct.search(engine,s,who,{
    simulations:8,timeMs:500,
    prior:(state,player)=>net.predict(model,state,map,player).policy,
    value:(state,player)=>net.predict(model,state,map,player).value
  });
  totalMs+=Date.now()-t;totalNodes+=result.nodes;
  const legal=new Set(policy.actions(engine,s,who).ids);
  if(!result.action||!legal.has(policy.encode(result.action)))invalid++;
  for(let j=0;j<policy.SIZE;j++)if(!legal.has(j)&&result.policy[j]!==0)throw Error("unmasked illegal policy");
  passed++;
 }
}
const report={maps:n,positions:passed,invalid,policySize:policy.SIZE,averageMs:totalMs/passed,totalNodes,modelShaLength:fs.statSync(f).size};
fs.writeFileSync(path.join(__dirname,"output","s3-inference-report.json"),JSON.stringify(report,null,2));
assert.strictEqual(invalid,0);console.log("S3 INFERENCE PASS",JSON.stringify(report));
