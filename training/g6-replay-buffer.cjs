"use strict";
// G6.1 Replay Buffer: append-only experience store with deduplication.
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const root=path.resolve(__dirname,"..");
const dir=path.join(root,"training/output/lab/g6");
fs.mkdirSync(dir,{recursive:true});
const file=path.join(dir,"replay-buffer.jsonl");
function key(x){return crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");}
function append(records){
 const seen=new Set();
 if(fs.existsSync(file)) for(const l of fs.readFileSync(file,"utf8").split("\n")){if(l)seen.add(JSON.parse(l)._key);}
 let added=0;
 const out=[];
 for(const r of records){const e={...r,_key:key(r)};if(!seen.has(e._key)){seen.add(e._key);out.push(JSON.stringify(e));added++;}}
 if(out.length)fs.appendFileSync(file,out.join("\n")+"\n");
 return {added,total:seen.size,file};
}
function sample(n=256){if(!fs.existsSync(file))return [];const a=fs.readFileSync(file,"utf8").split("\n").filter(Boolean);return Array.from({length:Math.min(n,a.length)},()=>JSON.parse(a[Math.floor(Math.random()*a.length)]));}
module.exports={append,sample,file};
if(require.main===module)console.log(JSON.stringify({file,exists:fs.existsSync(file)}));
