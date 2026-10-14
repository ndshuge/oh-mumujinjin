"use strict";
// G6 self-play data generator v1: produces auditable self-play manifest.
// It intentionally does not replace champion models.
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const root=path.resolve(__dirname,"..");
const outDir=path.join(root,"training/output/lab/g6");fs.mkdirSync(outDir,{recursive:true});
const out=path.join(outDir,"selfplay-manifest-g6.json");
if(fs.existsSync(out)) throw Error("immutable selfplay manifest exists");
const manifest={schema:"g6-selfplay-manifest-v1",champion:"g4-h13",candidate:"g6-n64-candidate",targetGames:10000,policyTarget:"PUCT_distribution_required",valueTarget:"terminal_result",trainingPromotion:false,createdAt:new Date().toISOString()};
manifest.sha256=crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
fs.writeFileSync(out,JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest));
