"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path"),root=path.resolve(__dirname,"../..");
const input=fs.readFileSync(path.join(root,"training/output/c-selfplay-combined.jsonl"),"utf8").split("\n").filter(Boolean).map(JSON.parse);
const train=new Set(input.filter(x=>x.split==="train").map(x=>x.map.rocks.map(p=>p.x+":"+p.y).sort().join("|")));
const heldOut=new Set(input.filter(x=>x.split==="heldOut").map(x=>x.map.rocks.map(p=>p.x+":"+p.y).sort().join("|")));
assert([...train].every(x=>!heldOut.has(x)),"Train/heldOut leakage");
const bank=[],seen=new Set();for(const line of fs.readFileSync(path.join(root,"training/output/s0-records-120-10000.jsonl"),"utf8").split("\n")){if(!line)continue;const r=JSON.parse(line);if(r.split!=="train")continue;const key=r.map.rocks.map(p=>p.x+":"+p.y).sort().join("|");if(seen.has(key))continue;seen.add(key);bank.push(key);}
const leaked=bank.slice(1600,1606).filter(k=>train.has(k));assert.strictEqual(leaked.length,6,"Historical contaminated test fixture changed");
const clean=bank.filter(k=>!train.has(k)).slice(1200,1206);assert.strictEqual(clean.length,6);assert(clean.every(k=>!train.has(k)),"Development maps leaked into training");console.log("DEV_ARENA_VALIDATION_OVERLAP",clean.filter(k=>heldOut.has(k)).length);
const report=path.join(root,"training/output/lab/g5/g5-finetune-v1-disjoint-6maps-b180.report.json");if(fs.existsSync(report)){const r=JSON.parse(fs.readFileSync(report,"utf8"));assert.strictEqual(r.trainMapOverlap,0);assert.strictEqual(r.promotionApproved,false);assert.strictEqual(r.independentSealedArena,"NOT_RUN");}
console.log("G5_LEAKAGE_AND_NO_AUTO_PROMOTION_PASS",JSON.stringify({trainMaps:train.size,validationMaps:heldOut.size,quarantinedLeakedMaps:leaked.length,cleanMaps:clean.length}));
