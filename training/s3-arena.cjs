"use strict";
// Paired held-out maps; compare trained-policy PUCT with same-budget heuristic PUCT.
// Not an Elo claim; results remain out-of-sample and both sides are swapped.
const fs=require("fs"),path=require("path"),assert=require("assert");
const {engine}=require("./train.cjs"),puct=require("./puct.cjs"),net=require("./model.cjs"),policy=require("./policy.cjs");
const model=net.load(path.join(__dirname,"models","policy-value-v1.json"));
const pairs=Math.max(1,Math.min(500,Number(process.argv[2]||5))),sims=Math.max(2,Math.min(64,Number(process.argv[3]||6)));
const priorMix=Number(process.argv[4]??1),valueMix=Number(process.argv[5]??1),mapOffset=Math.max(0,Number(process.argv[6]??0));
const source=path.join(__dirname,"output","s0-records-120-10000.jsonl");
const list=[],seen=new Set();let uniqueSkipped=0;
for(const line of fs.readFileSync(source,"utf8").split("\n")){
 if(!line)continue;const row=JSON.parse(line),sig=row.map.rocks.map(p=>p.x+","+p.y).sort().join("|");
 if(row.split==="heldOut"&&!seen.has(sig)){seen.add(sig);if(uniqueSkipped++>=mapOffset)list.push(row.map);}
 if(list.length===pairs)break;
}
assert(list.length===pairs,"not enough held-out maps");
const report={pairs,games:0,simulations:sims,priorMix,valueMix,mapOffset,engineVersions:["puct-v2-heuristic","puct-v2-model-v1"],model:{wins:0,losses:0,draws:0},outcomes:{goal:0,repetition:0,cap:0,noActions:0},turns:0,elapsedMs:0,records:[]};
function same(a,b){return a.x===b.x&&a.y===b.y;}
function winner(s){for(let p=0;p<2;p++)if(engine.terrain.CAMPS[1-p].some(c=>same(c,s.players[p])))return p;return null;}
const before=Date.now();
for(let i=0;i<pairs;i++){
 const map=list[i];engine.setRocks(map.rocks);
 for(let seat=0;seat<2;seat++){
  const agent=["model","heuristic"];if(seat===1)agent.reverse();
  let s={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]};
  const seenPos=new Map();let win=null,ending="cap",moves=0;
  for(let ply=0;ply<100;ply++){
   const who=ply%2,opts={simulations:sims,timeMs:300};
   if(agent[who]==="model"){
    opts.priorWeight=priorMix;opts.valueWeight=valueMix;
    opts.prior=(board,side)=>net.predict(model,board,map,side).policy;
    opts.value=(board,side)=>net.predict(model,board,map,side).value;
   }
   const choice=puct.search(engine,s,who,opts).action;
   if(!choice){win=1-who;ending="noActions";break;}
   const legal=new Set(policy.actions(engine,s,who).ids);
   assert(legal.has(policy.encode(choice)),"AI invented an illegal move");
   s=engine.hellApply(s,who,choice);moves++;report.turns++;
   win=winner(s);
   if(win!==null){ending="goal";break;}
   const hash=JSON.stringify([1-who,s.players,s.dirs,s.walls,s.left]);
   const reps=(seenPos.get(hash)||0)+1;seenPos.set(hash,reps);
   if(reps>=3){ending="repetition";break;}
  }
  report.games++;report.outcomes[ending]++;
  const winnerAgent=win===null?null:agent[win];
  report.model[winnerAgent===null?"draws":winnerAgent==="model"?"wins":"losses"]++;
  report.records.push({map:map.name,rocks:map.rocks.length,seat,win,winningEngine:winnerAgent,ending,plies:moves});
  console.log("ARENA",i,seat,ending,winnerAgent,"plies",moves);
 }
}
report.elapsedMs=Date.now()-before;
// Paired-map bootstrap: resample maps rather than treating paired games as independent.
const scores=[];
for(let i=0;i<pairs;i++){
  const batch=report.records.slice(i*2,i*2+2);
  scores.push(batch.reduce((acc,g)=>acc+(g.winningEngine==="model"?1:g.winningEngine===null?.5:0),0)/2);
}
const sorted=scores.slice().sort((a,b)=>a-b),iterations=4000,boot=[];
let rng=984771;const draw=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);
for(let i=0;i<iterations;i++){let sum=0;for(let j=0;j<pairs;j++)sum+=scores[Math.floor(draw()*pairs)];boot.push(sum/pairs);}
boot.sort((a,b)=>a-b);
report.pairedWinRate=scores.reduce((a,b)=>a+b,0)/pairs;
report.pairedBootstrap95=[boot[Math.floor(.025*iterations)],boot[Math.floor(.975*iterations)]];
report.promotable=pairs>=100&&report.pairedBootstrap95[0]>.5;

fs.writeFileSync(path.join(__dirname,"output","s3-arena-p"+priorMix+"-v"+valueMix+(mapOffset?"-offset"+mapOffset:"")+".json"),JSON.stringify(report,null,2));
console.log("ARENA REPORT",JSON.stringify({pairs:report.pairs,games:report.games,model:report.model,outcomes:report.outcomes,elapsedMs:report.elapsedMs}));
