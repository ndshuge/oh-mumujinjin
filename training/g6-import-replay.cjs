"use strict";
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const root=path.resolve(__dirname,"..");
const inputs=["training/output/s0-records-120-10000.jsonl","training/output/c-selfplay-combined.jsonl"].map(x=>path.join(root,x));
const outDir=path.join(root,"training/output/lab/g6");fs.mkdirSync(outDir,{recursive:true});
const out=path.join(outDir,"replay-buffer-g6.jsonl");
if(fs.existsSync(out))throw Error("immutable replay exists");
const seen=new Set();let count=0,maps=new Set();
for(const file of inputs){if(!fs.existsSync(file))continue;for(const line of fs.readFileSync(file,"utf8").split("\n")){if(!line)continue;const r=JSON.parse(line);if(!r.state||!r.map||typeof r.policy==='undefined')continue;const key=crypto.createHash("sha256").update(JSON.stringify([r.state,r.policy,r.value])).digest("hex");if(seen.has(key))continue;seen.add(key);maps.add(r.map.rocks.map(p=>p.x+":"+p.y).sort().join("|"));fs.appendFileSync(out,JSON.stringify({...r,g6:{source:path.basename(file),imported:true}})+"\n");count++;}}
const report={schema:"g6-replay-import-v1",samples:count,maps:maps.size,sha256:crypto.createHash("sha256").update(fs.readFileSync(out)).digest("hex"),createdAt:new Date().toISOString()};fs.writeFileSync(out.replace(".jsonl",".report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report));



