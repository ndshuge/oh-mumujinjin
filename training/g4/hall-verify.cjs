"use strict";
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const root=path.resolve(__dirname,"..",".."),
 ledger=JSON.parse(fs.readFileSync(path.join(__dirname,"hall-fingerprints.json"),"utf8")),
 hall=JSON.parse(fs.readFileSync(path.join(__dirname,"hall-of-fame.json"),"utf8"));
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");
const tampered=[],missing=[];
for(const item of ledger.files){
 const file=path.join(root,item.relativePath);
 if(!fs.existsSync(file)){missing.push(item.relativePath);continue;}
 const actual=sha(fs.readFileSync(file));
 if(actual!==item.sha256)tampered.push({file:item.relativePath,expected:item.sha256,actual});
}
const genomeMismatches=[];
for(const entry of hall.entries){
 const actual=sha(Buffer.from(JSON.stringify(entry.genome),"utf8"));
 if(actual!==entry.genomeSha256)genomeMismatches.push(entry.originalId);
 if(entry.status!=="candidate")genomeMismatches.push(entry.originalId+" status changed");
}
if(ledger.files.length<5||ledger.frozenChampionEntries.length!==hall.entries.length)
 throw Error("Incomplete Hall of Fame manifest");
const okay=!tampered.length&&!missing.length&&!genomeMismatches.length;
console.log("G4_HALL_VERIFY",JSON.stringify({okay,entries:hall.entries.length,files:ledger.files.length,
 changedSourceFiles:tampered.map(x=>x.file),missingFiles:missing,genomeMismatches,
 onlinePromotionAllowed:false}));
if(!okay)process.exitCode=1;
