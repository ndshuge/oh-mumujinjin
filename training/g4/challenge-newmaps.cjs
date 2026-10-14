"use strict";
// New-map paired arena, only stores win/loss/draw per game. Supports durable
// resume after process interruption. Never replaces the public AI.
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const {engine}=require("../train.cjs"),{check,move}=require("../league/agent.cjs");
const [rosterName="population-strange.json",id="odd-hawks",mapBank="novel-pilot-20261025-12.jsonl",budgetS="350"]=process.argv.slice(2),
 budget=Number(budgetS);
if(!/^[a-z0-9_-]+\.json$/.test(rosterName)||!/^[a-z0-9_-]{3,48}$/.test(id)||
 !/^novel-(pilot|sealed)-\d+-\d+\.jsonl$/.test(mapBank)||!Number.isInteger(budget)||budget<50||budget>6000)
 throw Error("Usage: challenge-newmaps.cjs roster.json candidate-id novel-map-bank.jsonl budgetMs");
const base=path.resolve(__dirname,".."),dir=path.join(base,"output","lab","g4"),
 roster=JSON.parse(fs.readFileSync(path.join(base,"league",rosterName),"utf8")),
 candidate=roster.agents.find(a=>a.id===id),champion={id:"frozen-v11",family:"search",engine:"v1.1",depth:2};
if(!candidate)throw Error("Unknown contender");check(candidate);
const raw=fs.readFileSync(path.join(dir,mapBank),"utf8"),
 manifest=JSON.parse(fs.readFileSync(path.join(dir,mapBank.replace(".jsonl",".manifest.json")),"utf8")),
 fingerprint=crypto.createHash("sha256").update(JSON.stringify(candidate)).digest("hex");
if(crypto.createHash("sha256").update(raw).digest("hex")!==manifest.layoutDigest)throw Error("Map bank digest changed");
if(manifest.mode==="sealed"&&manifest.candidateFingerprint!==fingerprint)throw Error("Candidate not frozen before map generation");
const maps=raw.trim().split("\n").map(JSON.parse);
if(maps.length!==manifest.maps||new Set(maps.map(m=>m.hash)).size!==maps.length)throw Error("Duplicate or missing novel maps");
const key=id+"-"+mapBank.replace(".jsonl","")+"-b"+budget,
 resultsFile=path.join(dir,"exam-"+key+".results.jsonl"),
 reportFile=path.join(dir,"exam-"+key+".report.json"),progressFile=path.join(dir,"exam-"+key+".progress.json");
if(fs.existsSync(reportFile))throw Error("Exam already completed, refuse overwrite");
const previous=fs.existsSync(resultsFile)?fs.readFileSync(resultsFile,"utf8").trim().split("\n").filter(Boolean).map(JSON.parse):[];
const desired=[];
for(const [index,map] of maps.entries())for(let seat=0;seat<2;seat++)desired.push({index,seat,mapHash:map.hash});
for(const [index,item] of previous.entries()){
 const expected=desired[index];
 if(!expected||item.index!==expected.index||item.seat!==expected.seat||
 item.mapHash!==expected.mapHash||item.candidate!==id||item.illegal!==0)throw Error("Previously recorded games do not match frozen schedule");
}
const same=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
function legal(s,who,a){
 if(!a)return false;
 if(a.wall)return engine.hellWallAllowed(s,a.wall,who);
 for(const m of engine.movementOptions(s.players[who],s.dirs[who],s.walls)){
  if(!a.move||!same(m.p,a.move.p)||!same(m.d,a.move.d)||m.steps!==a.move.steps||
   !same(m.firstDir,a.move.firstDir))continue;
  const portal=engine.portal(m.p);
  if(a.warp&&!portal)continue;
  const dst=a.warp?(same(portal.a,m.p)?portal.b:portal.a):m.p,lock=a.warp?null:m.nextLock;
  if(same(dst,a.p)&&((lock===null&&a.lock==null)||same(lock,a.lock)))return true;
 }
 return false;
}
const results=previous.slice(),began=Date.now(),times={candidate:[],baseline:[]};
function progress(){
 const payload={id,state:"running",completedGames:results.length,totalGames:desired.length,
 wins:results.filter(x=>x.winner===id).length,
 losses:results.filter(x=>x.winner==="frozen-v11").length,
 draws:results.filter(x=>x.winner===null).length,illegal:0,
 elapsedMs:Date.now()-began,mapType:manifest.mode,grandFinalEligible:false};
 fs.writeFileSync(progressFile,JSON.stringify(payload,null,2));return payload;
}
progress();
for(let i=results.length;i<desired.length;i++){
 const record=desired[i],map=maps[record.index],rosterSide=record.seat===0?[candidate,champion]:[champion,candidate];
 engine.setRocks(map.rocks);
 let s={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]};
 let ending="cap",winner=null,plies=0;
 const history=new Map();
 for(let ply=0;ply<120;ply++){
  const who=ply%2,role=rosterSide[who].id;
  if(!engine.movementOptions(s.players[who],s.dirs[who],s.walls).length){
   winner=rosterSide[1-who].id;ending="noMovement";break;
  }
  const start=Date.now(),decision=move(engine,s,who,map,rosterSide[who],budget),
   time=Date.now()-start;
  times[role===id?"candidate":"baseline"].push(time);
  if(!legal(s,who,decision.action))throw Error("Illegal move "+role+" map "+record.index+" ply "+ply);
  s=engine.hellApply(s,who,decision.action);plies++;
  if(engine.terrain.CAMPS[1-who].some(g=>same(g,s.players[who]))){
   winner=role;ending="goal";break;
  }
  if(!engine.movementOptions(s.players[1-who],s.dirs[1-who],s.walls).length){
   winner=role;ending="noMovement";break;
  }
  const key=JSON.stringify([1-who,s.players,s.dirs,s.left,s.walls.map(w=>w.o+w.x+":"+w.y).sort()]);
  const n=(history.get(key)||0)+1;history.set(key,n);
  if(n>=3){ending="repetition";break;}
 }
 const outcome={candidate:id,index:record.index,seat:record.seat,mapHash:record.mapHash,
  tier:map.tier,winner,ending,plies,illegal:0};
 fs.appendFileSync(resultsFile,JSON.stringify(outcome)+"\n");
 results.push(outcome);
 if(results.length%10===0){const p=progress();console.log("NOVEL_EXAM_PROGRESS",JSON.stringify({done:p.completedGames,planned:p.totalGames,w:p.wins,l:p.losses,d:p.draws}));}
}
const points=maps.map((m,i)=>results.slice(2*i,2*i+2).reduce((score,item)=>
 score+(item.winner===id?1:item.winner===null?.5:0),0)/2);
let rng=28310;const random=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);
const boot=[];
for(let k=0;k<5000;k++){
 let s=0;for(let j=0;j<maps.length;j++)s+=points[Math.floor(random()*maps.length)];
 boot.push(s/maps.length);
}
boot.sort((a,b)=>a-b);
const rate=results.reduce((s,x)=>s+(x.winner===id?1:x.winner===null?.5:0),0)/results.length;
const p95=series=>{
 series.sort((a,b)=>a-b);return series[Math.floor(series.length*.95)]??null;
};
const summary={schema:"mumu-sealed-paired-v1",candidate:id,roster:rosterName,mapBank,mode:manifest.mode,
 maps:maps.length,games:results.length,wins:results.filter(x=>x.winner===id).length,
 losses:results.filter(x=>x.winner==="frozen-v11").length,draws:results.filter(x=>x.winner===null).length,
 rate,pairedBootstrap95:[boot[125],boot[4875]],candidateP95Ms:p95(times.candidate),
 baselineP95Ms:p95(times.baseline),illegal:0,mapOverlapWithS0:manifest.overlapOld,
 sourceModelSha256:fingerprint,mapBankSha256:manifest.layoutDigest,
 eligibleForNextPromotionStage:manifest.mode==="sealed"&&maps.length>=500&&boot[125]>.5,
 autoPromotion:false,elapsedMs:Date.now()-began,
 note:"No move history is saved; pilot maps are not a sealed final exam"};
fs.writeFileSync(reportFile,JSON.stringify(summary,null,2));
fs.writeFileSync(progressFile,JSON.stringify({id,state:"complete",completedGames:results.length,totalGames:desired.length,
 wins:summary.wins,losses:summary.losses,draws:summary.draws,grandFinalEligible:summary.eligibleForNextPromotionStage},null,2));
console.log("NOVEL_EXAM_COMPLETE",JSON.stringify(summary));
