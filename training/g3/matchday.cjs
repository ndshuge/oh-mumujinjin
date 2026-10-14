"use strict";
// One result-only matchday: 32 agents, 16 two-sided pairs on one stratified map.
// Each completed match is durable. No move-by-move transcript is saved.
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const {engine}=require("../train.cjs"),{check,move}=require("../league/agent.cjs");
const [rosterName="population-g0.json",roundText="0",budgetText="200",baseText="600",seedText="20261014"]=process.argv.slice(2),
 round=Number(roundText),budget=Number(budgetText),baseOffset=Number(baseText),seed=Number(seedText);
if(!/^[a-zA-Z0-9_-]+\.json$/.test(rosterName)||![round,budget,baseOffset,seed].every(Number.isInteger)||
 round<0||round>30||budget<50||budget>6000||baseOffset<0)throw Error("Invalid matchday arguments");
const roster=JSON.parse(fs.readFileSync(path.join(__dirname,rosterName),"utf8")),agents=roster.agents;
if(agents.length!==32||new Set(agents.map(a=>a.id)).size!==32)throw Error("Must contain exactly 32 distinct contenders");
agents.forEach(check);
const dir=path.join(__dirname,"..","output","lab","g3"),id="gen"+roster.generation+"-round"+round+"-b"+budget+"-s"+seed,
 resultsFile=path.join(dir,id+".results.jsonl"),reportFile=path.join(dir,id+".report.json");
fs.mkdirSync(dir,{recursive:true});
if(fs.existsSync(reportFile))throw Error("Round already finished: "+id);
let rng=(seed+roster.generation*9301)>>>0;
const random=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);
const rosterIndices=Array.from({length:32},(_,i)=>i);
for(let i=31;i>0;i--){const j=Math.floor(random()*(i+1));[rosterIndices[i],rosterIndices[j]]=[rosterIndices[j],rosterIndices[i]];}
function pairsAt(r){
 let ring=rosterIndices.slice();
 for(let k=0;k<r;k++)ring=[ring[0],ring[31],...ring.slice(1,31)];
 return Array.from({length:16},(_,i)=>[agents[ring[i]],agents[ring[31-i]]]);
}
const source=path.join(__dirname,"..","output","s0-records-120-10000.jsonl"),
 bank=[],uniques=new Set();
for(const line of fs.readFileSync(source,"utf8").split("\n")){
 if(!line)continue;const item=JSON.parse(line);if(item.split!=="train")continue;
 const hash=item.map.rocks.map(p=>p.x+","+p.y).sort().join("|");
 if(uniques.has(hash))continue;uniques.add(hash);bank.push({...item.map,hash});
}
if(!bank.length||baseOffset>=bank.length)throw Error("Map bank exhausted");
const categories=["sparse","medium","dense"],density=categories[round%3];
const region=bank.slice(baseOffset,Math.min(bank.length,baseOffset+180+round*3)),
 stageMaps=region.filter(m=>(m.rocks.length<=5?"sparse":m.rocks.length<=11?"medium":"dense")===density);
if(!stageMaps.length)throw Error("No map for required density "+density);
const map=stageMaps[Math.min(Math.floor(round/3),stageMaps.length-1)];
engine.setRocks(map.rocks);
const same=(x,y)=>!!x&&!!y&&x.x===y.x&&x.y===y.y;
function valid(state,who,action){
 if(!action)return false;
 if(action.wall)return engine.hellWallAllowed(state,action.wall,who);
 for(const m of engine.movementOptions(state.players[who],state.dirs[who],state.walls)){
  if(!action.move||!same(action.move.p,m.p)||!same(action.move.d,m.d)||action.move.steps!==m.steps||
     !same(action.move.firstDir,m.firstDir))continue;
  const gate=engine.portal(m.p);
  if(action.warp&&!gate)continue;
  const target=action.warp?(same(gate.a,m.p)?gate.b:gate.a):m.p,
   lock=action.warp?null:m.nextLock;
  if(same(action.p,target)&&((lock===null&&action.lock==null)||same(action.lock,lock)))return true;
 }
 return false;
}
function finishedGoal(s,who){return engine.terrain.CAMPS[1-who].some(g=>same(g,s.players[who]));}
const schedule=[];
for(const [pairIndex,[a,b]] of pairsAt(round).entries()){
 for(let seat=0;seat<2;seat++){
  const players=seat?[b,a]:[a,b];
  schedule.push({pairIndex,seat,player0:players[0].id,player1:players[1].id});
 }
}
const already=[];
if(fs.existsSync(resultsFile)){
 for(const l of fs.readFileSync(resultsFile,"utf8").split("\n")){
  if(!l)continue;
  const a=JSON.parse(l),s=schedule[already.length];
  if(!s||a.pairIndex!==s.pairIndex||a.seat!==s.seat||
   a.player0!==s.player0||a.player1!==s.player1||a.mapHash!==map.hash)throw Error("Unsafe resume mismatch");
  already.push(a);
 }
}
let current=already.length,wins=new Map(),outcomes={goal:0,noMovement:0,repetition:0,cap:0};
for(const r of already){if(r.winner)wins.set(r.winner,(wins.get(r.winner)||0)+1);outcomes[r.ending]++;}
console.log("G3_MATCHDAY_START",JSON.stringify({id,round,mapDensity:density,mapHash:map.hash.slice(0,16),
 scheduled:32,completed:current,budgetMs:budget,rest:32-current}));
for(;current<schedule.length;current++){
 const m=schedule[current],players=[agents.find(a=>a.id===m.player0),agents.find(a=>a.id===m.player1)];
 const start=Date.now(),history=new Map();
 let state={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]},
  winner=null,ending="cap";
 for(let ply=0;ply<120;ply++){
  const who=ply%2;
  if(engine.movementOptions(state.players[who],state.dirs[who],state.walls).length===0){
   winner=players[1-who].id;ending="noMovement";break;
  }
  const chosen=move(engine,state,who,map,players[who],budget);
  if(!valid(state,who,chosen.action))throw Error("Illegal action "+players[who].id+" round "+round+" game "+(current+1));
  state=engine.hellApply(state,who,chosen.action);
  if(finishedGoal(state,who)){winner=players[who].id;ending="goal";break;}
  if(engine.movementOptions(state.players[1-who],state.dirs[1-who],state.walls).length===0){
   winner=players[who].id;ending="noMovement";break;
  }
  const key=JSON.stringify([1-who,state.players,state.dirs,state.left,state.walls.map(w=>w.o+":"+w.x+":"+w.y).sort()]);
  const n=(history.get(key)||0)+1;history.set(key,n);
  if(n===3){ending="repetition";break;}
 }
 const record={generation:roster.generation,round,game:current+1,mapHash:map.hash,density,
  player0:m.player0,player1:m.player1,pairIndex:m.pairIndex,seat:m.seat,winner,ending,
  wallClockMs:Date.now()-start,illegal:0};
 fs.appendFileSync(resultsFile,JSON.stringify(record)+"\n");
 if(winner)wins.set(winner,(wins.get(winner)||0)+1);outcomes[ending]++;
 if((current+1)%4===0)console.log("G3_CHECKPOINT",JSON.stringify({round,completed:current+1,
    matches:32,status:"running",elapsedMs:Date.now()-start}));
}
const report={generation:roster.generation,round,density,mapHash:map.hash,budgetMs:budget,complete:true,
 matches:32,illegal:0,outcomes,wins:Object.fromEntries(wins),resultFile:path.basename(resultsFile),
 note:"Only match outcomes stored; no turn-by-turn notation"};
fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
console.log("G3_MATCHDAY_DONE",JSON.stringify({round,density,matches:32,outcomes,topWins:[...wins].sort((a,b)=>b[1]-a[1]).slice(0,4)}));
