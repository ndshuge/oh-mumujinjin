"use strict";
// Freezes or verifies reproducible AI genome and inference file hashes.
// This is a research integrity ledger, never deploys any model.
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const {check}=require("../league/agent.cjs");
const base=path.resolve(__dirname,"..",".."),hofPath=path.join(__dirname,"hall-of-fame.json"),
 sealPath=path.join(__dirname,"hall-of-fame-seal.json");
const hall=JSON.parse(fs.readFileSync(hofPath,"utf8"));
const hash=input=>crypto.createHash("sha256").update(input).digest("hex");
const files=[
 "strong-search-v1.1.js","strong-search-v2.js","strong-search-v3.js",
 "training/model-n24.cjs","training/model-v2.cjs","training/model-v3.cjs",
 "training/model-n64.cjs",
 "training/models/policy-value-n24.json",
 "training/models/policy-value-v2.json",
 "training/models/policy-value-v3-balanced.json",
 "training/models/policy-value-n64.json",
 "game.js"
];
const digests={};
for(const rel of files){
 const abs=path.join(base,rel);
 if(!fs.existsSync(abs))throw Error("Missing research dependency: "+rel);
 digests[rel]=hash(fs.readFileSync(abs));
}
for(const champ of hall.entries){
 check(champ.genome);
 if(hash(JSON.stringify(champ.genome))!==champ.genomeSha256)throw Error("Genome tampered: "+champ.name);
}
if(hall.promotionRules.autoDeployment!==false||hall.entries.some(x=>x.status==="certified_champion"))throw Error("Unsanctioned promotion");
const seal={schema:"mumu-reproducibility-v1",incumbent:hall.incumbentId,
 timestamp:"2026-10-14",hallHash:hash(fs.readFileSync(hofPath)),
 deps:digests,genomeCount:hall.entries.length,productionSwitchAllowed:false};
if(fs.existsSync(sealPath)){
 const old=JSON.parse(fs.readFileSync(sealPath,"utf8"));
 if(old.hallHash!==seal.hallHash||JSON.stringify(old.deps)!==JSON.stringify(seal.deps))throw Error("Research dependencies changed since seal created");
 console.log("HALL_SEAL_VERIFIED",JSON.stringify({entries:seal.genomeCount,files:files.length,valid:true}));
}else{
 fs.writeFileSync(sealPath,JSON.stringify(seal,null,2));
 console.log("HALL_SEAL_CREATED",JSON.stringify({entries:seal.genomeCount,files:files.length,
   hash:seal.hallHash.slice(0,12),promotionAllowed:false}));
}
