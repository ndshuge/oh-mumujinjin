"use strict";
// Teacher labels are generated ONLY from a frozen challenger that first passed B.
// Called by stage-C orchestrator AFTER acceptance; this module never publishes.
const fs=require("fs"),path=require("path");
const {engine}=require("./train.cjs"),teacher=require("../strong-search-v1.1.js"),policy=require("./policy.cjs");
const startTrain=Math.max(0,Number(process.argv[2]||0)),targetTrain=Math.max(1,Math.min(500,Number(process.argv[3]||120)));
const startValid=Math.max(0,Number(process.argv[4]||0)),targetValid=Math.max(1,Math.min(200,Number(process.argv[5]||30)));
const budget=Math.max(100,Math.min(2000,Number(process.argv[6]||220))),id=process.argv[7]||"0";
const data=fs.readFileSync(path.join(__dirname,"output","s0-records-120-10000.jsonl"),"utf8").split("\n");
let trainIndex=0,validIndex=0,trainWritten=0,validWritten=0,seen=new Set();
const output=[],stats={train:0,heldOut:0,invalid:0,meanMs:0,teacher:"strong-search-v1.1",teacherBudget:budget};
const started=Date.now();
function sig(map){return map.rocks.map(p=>p.x+":"+p.y).sort().join("|");}
function chooseIndex(row,index){
 const n=row.moves.length;if(n<3)return 0;
 let seed=(Math.imul(2654435761,index+1)>>>0);
 return Math.min(n-1,Math.floor((.12+.62*(seed/4294967296))*n));
}
for(const line of data){
 if(!line)continue;
 if(trainWritten>=targetTrain&&validWritten>=targetValid)break;
 const row=JSON.parse(line);
 if(row.ending!=="goal"||!["train","heldOut"].includes(row.split))continue;
 const key=sig(row.map),unique=row.split+":"+key;
 if(seen.has(unique))continue;
 seen.add(unique);
 const slot=row.split==="train"?trainIndex++:validIndex++;
 const selected=row.split==="train"?slot>=startTrain&&trainWritten<targetTrain:slot>=startValid&&validWritten<targetValid;
 if(!selected)continue;
 engine.setRocks(row.map.rocks);
 const index=chooseIndex(row,slot),side=index%2;
 let s={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]};
 for(let j=0;j<index;j++)s=engine.hellApply(s,j%2,row.moves[j].action);
 const start=Date.now();
 const recommendation=teacher.choose(engine,s,side,{depth:2,timeMs:budget});
 stats.meanMs+=Date.now()-start;
 const action=recommendation.action;
 if(!action)continue;
 let ok=!!action.wall?engine.hellWallAllowed(s,action.wall,side):
  engine.movementOptions(s.players[side],s.dirs[side],s.walls).some(m=>action.move&&m.p.x===action.move.p.x&&m.p.y===action.move.p.y&&m.steps===action.move.steps&&m.d.x===action.move.d.x&&m.d.y===action.move.d.y);
 if(!ok){stats.invalid++;throw Error("Teacher illegal action on "+row.map.name);}
 const payload={
  map:{version:row.map.version,rocks:row.map.rocks,name:row.map.name,
   terrain:{PORTALS:engine.terrain.PORTALS,ICE:engine.terrain.ICE,BOOST:engine.terrain.BOOST}},
  state:s,side,policy:policy.encode(action),value:row.winner===side?1:-1,
  source:"v1.1-search-teacher",split:row.split,policyVersion:policy.VERSION
 };
 output.push(JSON.stringify(payload));
 if(row.split==="train")trainWritten++;else validWritten++;
 if(output.length%40===0)console.log("TEACHER_PROGRESS",id,output.length,"/",targetTrain+targetValid);
}
stats.train=trainWritten;stats.heldOut=validWritten;
stats.meanMs=stats.meanMs/Math.max(1,output.length);stats.elapsedMs=Date.now()-started;
const file=path.join(__dirname,"output","teacher-pilot-"+id+".jsonl");
fs.writeFileSync(file,output.join("\n")+"\n");
fs.writeFileSync(path.join(__dirname,"output","teacher-pilot-"+id+".report.json"),JSON.stringify(stats,null,2));
console.log("TEACHER_SHARD_DONE",JSON.stringify({id,...stats}));
if(trainWritten<targetTrain||validWritten<targetValid||stats.invalid)process.exitCode=1;
