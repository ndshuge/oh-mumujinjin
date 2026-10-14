"use strict";
// Freeze an auditable manifest of neural weights, search implementations and
// current rules alongside the champion genomes. DOES NOT re-label old games
// as having used exactly these file bytes; it establishes a reference NOW.
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const root=path.resolve(__dirname,"..",".."),g4=__dirname,
 manifest=path.join(g4,"hall-fingerprints.json");
if(fs.existsSync(manifest))throw Error("Manifest exists; refuse to re-freeze without explicit review");
const hallPath=path.join(g4,"hall-of-fame.json"),hall=JSON.parse(fs.readFileSync(hallPath,"utf8")),
 modelFiles={n24:"training/models/policy-value-n24.json",
  v2:"training/models/policy-value-v2.json",
  v3:"training/models/policy-value-v3-balanced.json",
  n64:"training/models/policy-value-n64.json"};
const usedModels=new Set(),engines=new Set();
for(const e of hall.entries){
 if(e.genome.models)for(const m of e.genome.models)usedModels.add(m.name);
 if(e.genome.engine)engines.add(e.genome.engine);
}
engines.add("v1.1");
const tracked=["game.js","training/league/agent.cjs","training/league/puct.cjs"];
// puct implementation lives in training/puct.cjs, never fabricate source.
tracked.splice(tracked.indexOf("training/league/puct.cjs"),1,"training/puct.cjs");
for(const name of usedModels){if(!modelFiles[name])throw Error("Unknown model "+name);tracked.push(modelFiles[name]);}
for(const version of engines)tracked.push("strong-search-"+version+".js");
tracked.push("training/g4/hall-of-fame.json");
const unique=[...new Set(tracked)].sort();
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const files=unique.map(rel=>{
 const source=path.join(root,rel);if(!fs.existsSync(source))throw Error("Missing required engine or weight "+source);
 const buffer=fs.readFileSync(source);return {relativePath:rel,sha256:sha(buffer),bytes:buffer.length};
});
const manifestDoc={schema:"mumu-hall-component-fingerprints-v1",createdAt:new Date().toISOString(),
 role:"current component fingerprint for reproducibility; not proof that older matches used identical bytes",
 frozenChampionEntries:hall.entries.map(e=>({id:e.originalId,genomeSha256:e.genomeSha256})),
 files,promotionApproved:false};
fs.writeFileSync(manifest,JSON.stringify(manifestDoc,null,2));
console.log("G4_FINGERPRINTS_FROZEN",JSON.stringify({entries:hall.entries.length,models:[...usedModels],
 engines:[...engines],files:files.length,manifest,bytes:fs.statSync(manifest).size}));
