"use strict";
const fs=require("fs"),path=require("path"),dir=path.join(__dirname,"output");
const input=["teacher-pilot-merged.jsonl","selfplay-train-1600.jsonl","selfplay-train-1620.jsonl","selfplay-heldOut-700.jsonl"];
const train=new Set(),heldOut=new Set(),ids=new Set(),samples=[],sourceTotals={};
for(const name of input){
 const file=path.join(dir,name);if(!fs.existsSync(file))throw Error("Missing "+name);
 for(const line of fs.readFileSync(file,"utf8").split("\n")){
  if(!line)continue;const r=JSON.parse(line);
  if(r.policyVersion!==2||!Number.isInteger(r.policy)||r.policy<0||r.policy>=232)throw Error("Bad label");
  const key=r.map.rocks.map(p=>p.x+":"+p.y).sort().join("|");
  (r.split==="train"?train:heldOut).add(key);
  sourceTotals[r.source]=(sourceTotals[r.source]||0)+1;
  samples.push(line);
 }
}
const overlap=[...train].filter(x=>heldOut.has(x));
if(overlap.length)throw Error("Data leak "+overlap.length+" layouts");
const output=path.join(dir,"c-selfplay-combined.jsonl");
fs.writeFileSync(output,samples.join("\n")+"\n");
const report={sources:input,samples:samples.length,trainMaps:train.size,heldoutMaps:heldOut.size,overlap:overlap.length,sourceTotals,
 note:"Value labels for selfplay come from actual V1.1-vs-V1.1 terminals; other training rows keep their older weak-game value labels."};
fs.writeFileSync(path.join(dir,"c-selfplay-combined-report.json"),JSON.stringify(report,null,2));
console.log("COMBINED_C",JSON.stringify(report));
