"use strict";
// G6.5 PUCT policy export skeleton. Keeps champion untouched.
// Converts searchable positions into policy distributions when self-play records exist.
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const root=path.resolve(__dirname,"..");
const outDir=path.join(root,"training/output/lab/g6");
fs.mkdirSync(outDir,{recursive:true});
const out=path.join(outDir,"puct-policy-replay-g6.jsonl");
if(fs.existsSync(out)) throw Error("immutable puct export exists");
const puct=require("./puct.cjs");
const report={schema:"g6-puct-policy-export-v1",status:"prepared",source:"selfplay_required",policy:"visit_distribution",value:"terminal_result",samples:0,createdAt:new Date().toISOString()};
// Existing records currently store action labels. Do not pretend they are PUCT distributions.
// The exporter is intentionally waiting for generated self-play states with search metadata.
fs.writeFileSync(out+".README.json",JSON.stringify(report,null,2));
report.sha256=crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
console.log(JSON.stringify(report));
