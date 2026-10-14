"use strict";
// Deterministic population league. Round-robin pairings, same map with swapped
// seats, authoritative game.js legality, full result trace and no auto-promotion.
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const {engine}=require("../train.cjs"),policy=require("../policy.cjs"),agents=require("./agent.cjs");
const split=process.argv[2]||"train",mapOffset=Number(process.argv[3]??2700),
 mapsCount=Number(process.argv[4]??1),budget=Number(process.argv[5]??120);
if(!["train","heldOut"].includes(split)||!Number.isInteger(mapOffset)||mapOffset<0||
 !Number.isInteger(mapsCount)||mapsCount<1||mapsCount>100||
 !Number.isInteger(budget)||budget<50||budget>6000)throw Error("Usage: node training/league/arena.cjs train|heldOut mapOffset mapsCount timeBudgetMs");
const rosterName=process.argv[6]||"population.json";
if(!/^[a-zA-Z0-9_-]+\.json$/.test(rosterName))throw Error("Invalid roster filename");
const roster=JSON.parse(fs.readFileSync(path.join(__dirname,rosterName),"utf8"));
const candidates=roster.agents;
if(candidates.length!==8||new Set(candidates.map(a=>a.id)).size!==8)throw Error("League roster requires 8 unique agents");
candidates.forEach(agents.check);
const source=path.join(__dirname,"..","output","s0-records-120-10000.jsonl"),seenMap=new Set(),mapBank=[];
for(const line of fs.readFileSync(source,"utf8").split("\n")){
 if(!line)continue;
 const row=JSON.parse(line);
 if(row.split!==split)continue;
 const hash=row.map.rocks.map(p=>p.x+","+p.y).sort().join("|");
 if(seenMap.has(hash))continue;
 seenMap.add(hash);mapBank.push({...row.map,hash});
}
if(mapOffset+mapsCount>mapBank.length)throw Error("Only "+mapBank.length+" unique maps; window out of range");
// Avoid accidentally comparing only dense maps: draw from three rock-density
// strata within a reproducible, local window of each split.
const pool=mapBank.slice(mapOffset,Math.min(mapBank.length,mapOffset+Math.max(60,mapsCount*10)));
const tiers={sparse:[],medium:[],dense:[]};
for(const m of pool)tiers[m.rocks.length<=5?"sparse":m.rocks.length<=11?"medium":"dense"].push(m);
const maps=[],used=new Set();
for(let i=0;i<mapsCount;i++){
 const stratum=["sparse","medium","dense"][i%3];
 const options=tiers[stratum].length?tiers[stratum]:pool;
 const next=options.find(m=>!used.has(m.hash))||pool.find(m=>!used.has(m.hash));
 if(!next)throw Error("Could not select enough distinct maps");
 used.add(next.hash);maps.push(next);
}
const getGoal=(s,p)=>engine.terrain.CAMPS[1-p].some(g=>g.x===s.players[p].x&&g.y===s.players[p].y);
const key=s=>JSON.stringify([s.players,s.dirs,s.left,s.walls.map(w=>w.o+w.x+":"+w.y).sort()]);
function legal(s,p,a){
 if(!a)return false;
 if(a.wall)return engine.hellWallAllowed(s,a.wall,p);
 const same=(x,y)=>!!x&&!!y&&x.x===y.x&&x.y===y.y;
 for(const m of engine.movementOptions(s.players[p],s.dirs[p],s.walls)){
  if(!a.move||!same(a.move.p,m.p)||!same(a.move.d,m.d)||a.move.steps!==m.steps||!same(a.move.firstDir,m.firstDir))continue;
  const portal=engine.portal(m.p);
  if(a.warp&&!portal)continue;
  const dst=a.warp?(same(portal.a,m.p)?portal.b:portal.a):m.p;
  const lock=a.warp?null:m.nextLock;
  if(same(a.p,dst)&&((lock===null&&a.lock==null)||same(a.lock,lock)))return true;
 }
 return false;
}
function pairings(round){
 let rotating=[0,1,2,3,4,5,6,7];
 for(let k=0;k<(round%7);k++)rotating=[rotating[0],rotating[7],...rotating.slice(1,7)];
 const pairs=[];
 for(let i=0;i<4;i++)pairs.push([rotating[i],rotating[7-i]]);
 return pairs;
}
const results=[],started=Date.now(),scores=new Map(candidates.map(c=>[c.id,{id:c.id,family:c.family,wins:0,losses:0,draws:0,games:0,score:0,
 byDensity:{sparse:{wins:0,games:0},medium:{wins:0,games:0},dense:{wins:0,games:0}},times:[],modelCount:c.models?.length||0}]));
for(const [mi,map] of maps.entries()){
 engine.setRocks(map.rocks);
 const density=map.rocks.length<=5?"sparse":map.rocks.length<=11?"medium":"dense";
 for(const pair of pairings(mi)){
  for(let seat=0;seat<2;seat++){
   const ids=seat===0?pair:[pair[1],pair[0]],
    participants=ids.map(i=>candidates[i]);
   const state={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]};
   let s=state,win=null,ending="cap",illegal=0,ply=0;
   const history=new Map();
   for(let step=0;step<120;step++){
    const who=step%2,p=participants[who];
    if(!engine.movementOptions(s.players[who],s.dirs[who],s.walls).length){win=1-who;ending="noMovement";break;}
    const result=agents.move(engine,s,who,map,p,budget),a=result.action;
    scores.get(p.id).times.push(result.timeMs);
    if(!legal(s,who,a)){illegal++;throw Error("Illegal "+p.id+" "+map.name+" step "+step);}
    s=engine.hellApply(s,who,a);ply++;
    if(getGoal(s,who)){win=who;ending="goal";break;}
    if(!engine.movementOptions(s.players[1-who],s.dirs[1-who],s.walls).length){win=who;ending="noMovement";break;}
    const h=JSON.stringify([1-who,key(s)]),n=(history.get(h)||0)+1;
    history.set(h,n);if(n===3){ending="repetition";break;}
   }
   const victor=win===null?null:participants[win].id;
   for(const p of participants){
    const row=scores.get(p.id);
    row.games++;row.byDensity[density].games++;
    if(victor===null){row.draws++;row.score+=0.5;}
    else if(victor===p.id){row.wins++;row.score++;row.byDensity[density].wins++;}
    else row.losses++;
   }
   results.push({map:map.name,mapHash:map.hash,rocks:map.rocks.length,density,round:mi,pair:pair.map(i=>candidates[i].id),
    seat,player0:participants[0].id,player1:participants[1].id,winner:victor,ending,plies:ply,illegal});
   console.log("LEAGUE_GAME",results.length,"/",mapsCount*8,"winner",victor||"draw","round",mi,"pair",pair.map(i=>candidates[i].id).join("/"),"plies",ply);
  }
 }
}
const rankings=[...scores.values()].map(r=>{
 r.times.sort((a,b)=>a-b);
 const percentile=p=>r.times[Math.floor((r.times.length-1)*p)]??0;
 return{...r,scoreRate:r.games?r.score/r.games:0,medianMs:percentile(.5),p95Ms:percentile(.95),maxMs:r.times.at(-1)||0,times:undefined};
}).sort((a,b)=>b.scoreRate-a.scoreRate||a.p95Ms-b.p95Ms||a.modelCount-b.modelCount);
const full={schema:roster.schema,rosterGeneration:roster.generation,
 split,mapOffset,uniqueMaps:maps.length,games:results.length,budgetPerMoveMs:budget,allLegal:results.every(x=>x.illegal===0),
 averageRockCounts:maps.reduce((a,m)=>a+m.rocks.length,0)/maps.length,elapsedMs:Date.now()-started,rankings,
 gamesByDensity:maps.reduce((m,r)=>(m[r.rocks.length<=5?"sparse":r.rocks.length<=11?"medium":"dense"]++,m),{sparse:0,medium:0,dense:0}),
 promotionApproved:false,reason:"Evolution development only: results too small, not an independent held-out promotion test.",matches:results};
const dir=path.join(__dirname,"..","output","lab"),out=path.join(dir,"league-"+split+"-"+mapOffset+"-"+mapsCount+"-b"+budget+".json");
if(fs.existsSync(out))throw Error("Refuse overwrite prior league results");
fs.writeFileSync(out,JSON.stringify(full,null,2));
console.log("LEAGUE_FINAL",JSON.stringify({...full,matches:undefined}));
