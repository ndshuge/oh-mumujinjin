"use strict";
const fs=require("fs"),path=require("path"),net=require("./model-v2.cjs");
const root=path.join(__dirname,"output");
const v1=net.load(path.join(__dirname,"models","policy-value-v2.json"));
const v2=net.load(path.join(__dirname,"models","policy-value-v2-iter2.json"));
const rows=fs.readFileSync(path.join(root,"c-selfplay-combined.jsonl"),"utf8").split("\n");
const results={};
for(const line of rows){
 if(!line)continue;const ex=JSON.parse(line);
 if(ex.split!=="heldOut")continue;
 const source=ex.source;results[source]??={n:0,baseline:{accuracy:0,CE:0,valueMSE:0},iter2:{accuracy:0,CE:0,valueMSE:0}};
 const entry=results[source];entry.n++;
 for(const [tag,m] of [["baseline",v1],["iter2",v2]]){
  const o=net.predict(m,ex.state,ex.map,ex.side);
  const top=o.policy.reduce((best,p,i)=>p>best.p?{p,id:i}:best,{p:-1,id:-1}).id;
  if(top===ex.policy)entry[tag].accuracy++;
  entry[tag].CE-=Math.log(Math.max(1e-9,o.policy[ex.policy]));
  entry[tag].valueMSE+=(o.value-ex.value)**2;
 }
}
for(const entry of Object.values(results))for(const key of ["baseline","iter2"])
 for(const metric of ["accuracy","CE","valueMSE"])entry[key][metric]/=entry.n;
const report={modelA:"policy-value-v2.json",modelB:"policy-value-v2-iter2.json",
 notes:"Validation across unchanged held-out teacher layouts plus previously unused self-play maps. Never infer chess strength from supervision metrics.",results,promoted:false};
fs.writeFileSync(path.join(root,"c-iter2-comparison.json"),JSON.stringify(report,null,2));
console.log("ITER2_COMPARISON",JSON.stringify(report));
