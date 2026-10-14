"use strict";
// Candidate-vs-frozen-champion paired gate. Never deploys game.js.
// For formal blind promotion new maps must be generated after the genome is frozen.
const fs=require("fs"),path=require("path"),{engine}=require("../train.cjs"),agent=require("../league/agent.cjs");
const fileName=process.argv[2]||"population-strange.json",candidateId=process.argv[3]||"odd-hawks",
 offset=Number(process.argv[4]??0),mapCount=Number(process.argv[5]??60),budget=Number(process.argv[6]??500),
 mapBankName=process.argv[7]||"fresh-map-bank-20261015-120.json";
if(!/^[a-zA-Z0-9_-]+\.json$/.test(fileName)||!/^fresh-map-bank-\d+-\d+\.json$/.test(mapBankName)||!Number.isInteger(offset)||offset<0||
 !Number.isInteger(mapCount)||mapCount<1||mapCount>500||!Number.isInteger(budget)||budget<50||budget>6000)throw Error("Usage: challenge.cjs roster.json agentId heldOutMapOffset mapCount budgetMs");
const crypto=require("crypto");
const roster=JSON.parse(fs.readFileSync(path.join(__dirname,"..","league",fileName),"utf8")),candidate=roster.agents.find(x=>x.id===candidateId);
if(!candidate)throw Error("Unknown candidate");
agent.check(candidate);
const champion={id:"frozen-v11",family:"search",engine:"v1.1",depth:2};
const bankFile=path.join(__dirname,"..","output","lab","g4",mapBankName),
 lockFile=bankFile.replace(/\.json$/,".lock.json");
if(!fs.existsSync(bankFile)||!fs.existsSync(lockFile))throw Error("Missing locked fresh evaluation maps");
const bankText=fs.readFileSync(bankFile,"utf8"),bank=JSON.parse(bankText),lock=JSON.parse(fs.readFileSync(lockFile,"utf8"));
const bankHash=crypto.createHash("sha256").update(bankText).digest("hex");
if(bankHash!==lock.sha256||bank.historicalOverlap!==0||bank.uniqueLayouts!==bank.count||
 bank.maps.length!==bank.count)throw Error("Untrusted or modified fresh map bank");
if(offset+mapCount>bank.maps.length)throw Error("Fresh map window out of range");
const maps=bank.maps.slice(offset,offset+mapCount);
const results=[],start=Date.now(),timings=[];
let invalid=0;
const same=(x,y)=>!!x&&!!y&&x.x===y.x&&x.y===y.y;
function legal(s,p,a){
 if(!a)return false;
 if(a.wall)return engine.hellWallAllowed(s,a.wall,p);
 return engine.movementOptions(s.players[p],s.dirs[p],s.walls).some(m=>{
  if(!a.move||!same(m.p,a.move.p)||!same(m.d,a.move.d)||m.steps!==a.move.steps||!same(m.firstDir,a.move.firstDir))return false;
  const portal=engine.portal(m.p),target=a.warp&&portal?(same(portal.a,m.p)?portal.b:portal.a):m.p;
  const lock=a.warp?null:m.nextLock;
  return (!a.warp||!!portal)&&same(target,a.p)&&((lock===null&&a.lock==null)||same(lock,a.lock));
 });
}
for(const [i,map] of maps.entries()){
 engine.setRocks(map.rocks);
 for(let seat=0;seat<2;seat++){
  const players=seat===0?[candidate,champion]:[champion,candidate];
  let s={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]},
   winner=null,ending="cap",plies=0;
  const seen=new Map();
  for(let ply=0;ply<120;ply++){
   const who=ply%2;
   if(!engine.movementOptions(s.players[who],s.dirs[who],s.walls).length){winner=1-who;ending="noMovement";break;}
   const result=agent.move(engine,s,who,map,players[who],budget);
   if(players[who].id===candidateId)timings.push(result.timeMs);
   if(!legal(s,who,result.action)){invalid++;throw Error("Illegal "+players[who].id+" map "+i+" move "+ply);}
   s=engine.hellApply(s,who,result.action);plies++;
   if(engine.terrain.CAMPS[1-who].some(g=>same(g,s.players[who]))){winner=who;ending="goal";break;}
   if(!engine.movementOptions(s.players[1-who],s.dirs[1-who],s.walls).length){winner=who;ending="noMovement";break;}
   const k=JSON.stringify([1-who,s.players,s.dirs,s.left,s.walls.map(w=>w.o+w.x+":"+w.y).sort()]);
   const count=(seen.get(k)||0)+1;seen.set(k,count);if(count===3){ending="repetition";break;}
  }
  results.push({map:map.name,density:map.density,seat,winner:winner===null?null:players[winner].id,ending,plies});
  if((i+1)%5===0&&seat===1)console.log("CHALLENGE_PROGRESS",i+1,"/",mapCount);
 }
}
const wins=results.filter(x=>x.winner===candidateId).length,
 losses=results.filter(x=>x.winner===champion.id).length,draws=results.length-wins-losses;
const pairs=Array.from({length:mapCount},(_,i)=>results.slice(2*i,2*i+2).reduce((s,r)=>s+(r.winner===candidateId?1:r.winner===null?.5:0),0)/2);
let randSeed=20261014;const random=()=>((randSeed=(Math.imul(randSeed,1664525)+1013904223)>>>0)/4294967296);
const b=[];
for(let i=0;i<4000;i++){let sum=0;for(let j=0;j<mapCount;j++)sum+=pairs[Math.floor(random()*mapCount)];b.push(sum/mapCount);}
b.sort((x,y)=>x-y);
timings.sort((a,b)=>a-b);
const byDensity=Object.fromEntries(["sparse","medium","dense"].map(d=>{const list=results.filter(x=>x.density===d);return[d,{games:list.length,wins:list.filter(x=>x.winner===candidateId).length,losses:list.filter(x=>x.winner===champion.id).length,draws:list.filter(x=>x.winner===null).length}];}));
const summary={candidate:candidateId,baseChampion:champion.id,roster:fileName,mapBank:mapBankName,mapBankSHA256:bankHash,mapStart:offset,byDensity,mapCount,games:results.length,
 wins,losses,draws,scoreRate:(wins+.5*draws)/results.length,
 pairedBootstrap95:[b[100],b[3900]],illegal:invalid,
 p95MoveMs:timings[Math.floor(timings.length*.95)]||0,elapsedMs:Date.now()-start,
 ruleBasis:"game.js",source:"Fresh generated legal map bank; excluded all original S0 8947 layouts before challenger runs",
 statisticallyBetter:mapCount>=500&&b[100]>.5,
 promotionApproved:false,reason:"Research-only fresh map check; at least 500 untouched paired maps plus browser and replay gates still required",
 matches:results};
const out=path.join(__dirname,"..","output","lab","g4","fresh-challenge-"+candidateId+"-"+offset+"-"+mapCount+"-b"+budget+".json");
if(fs.existsSync(out))throw Error("Refuse overwrite existing challenge result");
fs.writeFileSync(out,JSON.stringify(summary,null,2));
console.log("CHALLENGE_DONE",JSON.stringify({...summary,matches:undefined}));
