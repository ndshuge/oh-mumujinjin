"use strict";
const fs=require("fs"),path=require("path");
const dir=path.join(__dirname,"output");
const names=["teacher-pilot-pilot0.jsonl","teacher-pilot-pilot1.jsonl","teacher-pilot-pilot2.jsonl"];
const samples=[],trainMaps=new Set(),heldoutMaps=new Set(),keys=new Set(),counts={train:0,heldOut:0,duplicate:0};
for(const name of names){
 const file=path.join(dir,name);
 if(!fs.existsSync(file))throw Error("Missing teacher shard: "+file);
 for(const line of fs.readFileSync(file,"utf8").split("\n")){
  if(!line)continue;
  const row=JSON.parse(line);
  if(row.policyVersion!==2||row.source!=="v1.1-search-teacher"||row.policy<0||row.policy>=232)throw Error("Bad sample "+name);
  const sig=row.map.rocks.map(p=>p.x+":"+p.y).sort().join("|");
  const key=row.split+"|"+sig;
  if(keys.has(key)){counts.duplicate++;throw Error("Repeated training map "+key);}
  keys.add(key);
  if(row.split==="train"){trainMaps.add(sig);counts.train++;}
  else if(row.split==="heldOut"){heldoutMaps.add(sig);counts.heldOut++;}
  else throw Error("Bad split");
  samples.push(JSON.stringify(row));
 }
}
const leak=[...trainMaps].filter(x=>heldoutMaps.has(x));
if(leak.length)throw Error("Map leakage "+leak.length);
const file=path.join(dir,"teacher-pilot-merged.jsonl");
fs.writeFileSync(file,samples.join("\n")+"\n");
const meta={...counts,trainMaps:trainMaps.size,heldoutMaps:heldoutMaps.size,leak:leak.length,policyVersion:2,teacher:"strong-search-v1.1",note:"Policy labels from tested search; value labels from earlier heuristic games, not teacher self-play."};
fs.writeFileSync(path.join(dir,"teacher-pilot-merged-report.json"),JSON.stringify(meta,null,2));
console.log("TEACHER_MERGED",JSON.stringify(meta));
