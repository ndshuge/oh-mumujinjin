"use strict";
// Deterministic goal-directed games across procedurally varied legal maps.
// Shared game movement and wall validation are called directly; output is
// replayable actions and supervised observations (not trained weights).
const fs=require("fs"),path=require("path");
const {engine,mapGen,seed:initialSeed}=require("./train.cjs");
const policy=require("./policy.cjs");
const games=Math.max(1,Math.min(12000,Number(process.argv[2]||100)));
const seed=initialSeed,plyCap=Math.max(80,Math.min(180,Number(process.argv[3]||120)));
const dataset=process.argv.includes("--dataset"),writeRecords=process.argv.includes("--records");
let rng=(seed^0x51ef40ab)>>>0;
const random=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);
const rand=n=>Math.floor(random()*n);
const hash=(s,next)=>JSON.stringify([next,s.players,s.dirs,s.walls.map(w=>w.o+w.x+","+w.y),s.left]);
const root=path.join(__dirname,"output");fs.mkdirSync(root,{recursive:true});
const obsFile=path.join(root,"dataset-"+seed+"-"+games+".jsonl");
const movesFile=path.join(root,"s0-records-"+seed+"-"+games+".jsonl");
const observations=[],records=[];
const report={seed,games,plyCap,policyVersion:policy.VERSION,legalActions:0,illegalActions:0,terminal:{goal:0,repetition:0,cap:0,noActions:0},mapCount:0,unseenMaps:0,sampleCount:0,wallMoves:0,teleports:0,wins:[0,0],wallRejected:0};
const start=Date.now(),seenMaps=new Set(),trainMaps=new Set(),holdoutMaps=new Set();
function partitionMap(signature){let h=2166136261;for(let i=0;i<signature.length;i++)h=Math.imul(h^signature.charCodeAt(i),16777619)>>>0;return h%5===0?"heldOut":"train";}
function equal(a,b){return a.x===b.x&&a.y===b.y;}
function options(s,who){
 const moves=engine.movementOptions(s.players[who],s.dirs[who],s.walls),candidates=[];
 for(const m of moves){
  candidates.push({p:m.p,lock:m.nextLock,move:m,warp:false});
  const gate=engine.portal(m.p);
  if(gate)candidates.push({p:equal(gate.a,m.p)?gate.b:gate.a,lock:null,move:m,warp:true});
 }
 return candidates;
}
function choose(s,who,visited){
 const list=options(s,who);
 if(!list.length)return null;
 const old=engine.computerDistance(s.players[who],engine.terrain.CAMPS[1-who],s.walls,s.dirs[who]);
 const scored=list.map(a=>{
  const next=engine.hellApply(s,who,a);
  const d=engine.computerDistance(next.players[who],engine.terrain.CAMPS[1-who],next.walls,next.dirs[who]);
  const prev=visited.get(hash(next,1-who))||0;
  return{a,score:3*(old-d)-4*prev+random()*(who?0.6:0.4)};
 }).sort((a,b)=>b.score-a.score);
 return random()<0.035?scored[rand(Math.min(3,scored.length))].a:scored[0].a;
}
function wallTry(s,who){
 if(s.left[who]===0)return null;
 const target=s.players[1-who];
 const possible=[];
 for(let k=0;k<12;k++){
  const w={x:target.x+rand(5)-2,y:target.y+rand(5)-2,o:rand(2)?"h":"v"};
  if(engine.hellWallAllowed(s,w,who))possible.push({wall:w});
  else report.wallRejected++;
 }
 return possible.length?possible[rand(possible.length)]:null;
}
function valid(s,who,a){
 if(a.wall)return engine.hellWallAllowed(s,a.wall,who);
 const legal=options(s,who);
 return legal.some(q=>policy.encode(q)===policy.encode(a)&&equal(q.p,a.p)&&!!q.warp===!!a.warp);
}
function findWin(s){
 for(let p=0;p<2;p++)if(engine.terrain.CAMPS[1-p].some(c=>equal(c,s.players[p])))return p;
 return null;
}
for(let i=0;i<games;i++){
 const map=mapGen(i),rockSig=map.rocks.map(p=>p.x+":"+p.y).sort().join("|");
 seenMaps.add(rockSig);engine.setRocks(map.rocks);
 const players=engine.terrain.CAMPS.map(a=>({...a[1]}));
 let s={players,dirs:[null,null],walls:[],left:[5,5]},winner=null,reason="cap";
 const visited=new Map(),moves=[],examples=[];
 for(let ply=0;ply<plyCap;ply++){
  const who=ply%2;
  let a=null;
  if(random()<0.055)a=wallTry(s,who);
  if(!a)a=choose(s,who,visited);
  if(!a){reason="noActions";winner=1-who;break;}
  if(!valid(s,who,a)){report.illegalActions++;throw Error("Invalid candidate game "+i+" ply "+ply);}
  report.legalActions++;
  const idx=policy.encode(a);
  // Subsample reproducible training positions, balancing maps and sides.
  if(dataset && (ply<6||ply%9===0||a.wall)){
   examples.push({state:{players:s.players.map(p=>({...p})),dirs:s.dirs.slice(),walls:s.walls.map(w=>({...w})),left:s.left.slice()},side:who,policy:idx});
  }
  const serialized={side:who,notation:idx,action:a.wall?{wall:a.wall}:{p:a.p,lock:a.lock,move:a.move,warp:!!a.warp}};
  moves.push(serialized);
  if(a.wall)report.wallMoves++;
  if(a.warp)report.teleports++;
  s=engine.hellApply(s,who,a);
  winner=findWin(s);
  if(winner!==null){reason="goal";break;}
  const h=hash(s,1-who),count=(visited.get(h)||0)+1;
  visited.set(h,count);
  if(count>=3){reason="repetition";winner=null;break;}
 }
 report.terminal[reason]++;if(winner!==null)report.wins[winner]++;
 const split=partitionMap(rockSig);if(split==="heldOut"){report.unseenMaps++;holdoutMaps.add(rockSig);}else trainMaps.add(rockSig);
 if(dataset){
  // Value is an observed game outcome, never evaluated on the holdout split while training.
  for(const x of examples){x.value=winner===null?0:winner===x.side?1:-1;x.map=map;x.split=split;x.policyVersion=policy.VERSION;observations.push(JSON.stringify(x));}
 }
 if(writeRecords)records.push(JSON.stringify({map,split,winner,ending:reason,moves}));
 if((i+1)%Math.max(1,Math.floor(games/10))===0)console.log("PROGRESS",i+1,"/",games,"goal",report.terminal.goal,"illegal",report.illegalActions,"ms",Date.now()-start);
}
report.mapCount=seenMaps.size;report.trainMapCount=trainMaps.size;report.holdoutMapCount=holdoutMaps.size;report.splitLeakage=[...trainMaps].filter(x=>holdoutMaps.has(x)).length;report.sampleCount=observations.length;report.elapsedMs=Date.now()-start;
if(dataset)fs.writeFileSync(obsFile,observations.join("\n")+"\n");
if(writeRecords)fs.writeFileSync(movesFile,records.join("\n")+"\n");
const name=path.join(root,"s0-report-"+seed+"-"+games+".json");fs.writeFileSync(name,JSON.stringify(report,null,2));
console.log("REPORT",JSON.stringify(report));
