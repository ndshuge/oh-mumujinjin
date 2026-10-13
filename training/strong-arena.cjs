"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert");
const {engine}=require("./train.cjs"),strong=require("../strong-search.js");
const count=Math.max(1,Math.min(100,Number(process.argv[2]||8))),searchDepth=Math.max(1,Math.min(4,Number(process.argv[4]||2))),searchBudget=Math.max(100,Math.min(2000,Number(process.argv[5]||350)));
const source=fs.readFileSync(path.join(__dirname,"output","s0-records-120-10000.jsonl"),"utf8").trim().split("\n");
const maps=[],used=new Set(),offset=Number(process.argv[3]||350);
let skipped=0;
for(const line of source){
 const item=JSON.parse(line);
 if(item.split!=="heldOut")continue;
 const sig=item.map.rocks.map(r=>r.x+","+r.y).sort().join("|");
 if(used.has(sig))continue;
 used.add(sig);
 if(skipped++>=offset)maps.push(item.map);
 if(maps.length>=count)break;
}
assert(maps.length===count,"not enough held-out maps");
function baseline(s,player){
 const roots=engine.hellCandidates(s,player),sign=player===1?1:-1;
 if(!roots.length)return null;
 const ranked=roots.map(a=>{
   const n=engine.hellApply(s,player,a);
   return {a,n,val:sign*engine.hellEvaluate(n)};
 }).sort((a,b)=>b.val-a.val).slice(0,9);
 let best=ranked[0].a,score=-Infinity;
 for(const item of ranked){
  let val=item.val;
  if(val>=100000){best=item.a;score=val;break;}
  const replies=engine.hellCandidates(item.n,1-player);
  if(replies.length){
   const worst=replies.reduce((v,a)=>Math.min(v,sign*engine.hellEvaluate(engine.hellApply(item.n,1-player,a))),Infinity);
   val=.78*worst+.22*item.val;
  }
  if(val>score){score=val;best=item.a;}
 }
 return best;
}
const games=[],stats={strong:{wins:0,losses:0,draws:0},baseline:{wins:0,losses:0,draws:0},illegal:0,repetitions:0,goal:0,cap:0,turns:0,strongMs:[],strongDepth:[]};
const start=Date.now();
for(let i=0;i<count;i++){
 engine.setRocks(maps[i].rocks);
 for(let seat=0;seat<2;seat++){
  let s={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]};
  const kinds=seat===0?["strong","baseline"]:["baseline","strong"];
  let winner=null,reason="cap";
  const seen=new Map();
  for(let ply=0;ply<100;ply++){
    const who=ply%2;
    const startTurn=Date.now();
    const advice=kinds[who]==="strong"?strong.choose(engine,s,who,{depth:searchDepth,timeMs:searchBudget}):null;
    const act=advice?advice.action:baseline(s,who);
    if(advice){stats.strongMs.push(Date.now()-startTurn);stats.strongDepth.push(advice.depth);}
    if(!act){reason="no-actions";winner=1-who;break;}
    const legal=!!act.wall?engine.hellWallAllowed(s,act.wall,who):
        engine.movementOptions(s.players[who],s.dirs[who],s.walls).some(m=>{
          return m.p.x===act.move?.p.x&&m.p.y===act.move?.p.y&&m.d.x===act.move?.d.x&&m.d.y===act.move?.d.y&&m.steps===act.move?.steps;
        });
    if(!legal){stats.illegal++;throw Error("illegal move on map "+i+" ply "+ply);}
    s=engine.hellApply(s,who,act);stats.turns++;
    if(engine.terrain.CAMPS[1-who].some(g=>g.x===s.players[who].x&&g.y===s.players[who].y)){winner=who;reason="goal";break;}
    const hash=JSON.stringify([1-who,s.players,s.dirs,s.walls,s.left]),reps=(seen.get(hash)||0)+1;
    seen.set(hash,reps);
    if(reps===3){reason="repetition";break;}
  }
  stats[reason]=(stats[reason]||0)+1;
  const winName=winner===null?null:kinds[winner];
  for(const agent of ["strong","baseline"])stats[agent][winName===null?"draws":agent===winName?"wins":"losses"]++;
  games.push({map:maps[i].name,seat,winName,winner,reason});
  console.log("ARENA",i,seat,winName||"draw",reason,"elapsed",Date.now()-start);
 }
}
stats.strongMs.sort((a,b)=>a-b);
const pct=p=>stats.strongMs[Math.floor((stats.strongMs.length-1)*p)];
const report={maps:count,games:games.length,searchDepth,searchBudget,outcomes:stats,latency:{p50:pct(.5),p95:pct(.95),max:stats.strongMs.at(-1)},elapsedMs:Date.now()-start,mapsOffset:offset,records:games};
const out=path.join(__dirname,"output","strong-v1-arena-"+offset+"-d"+searchDepth+".json");
fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log("RESULT",JSON.stringify({games:report.games,strong:stats.strong,baseline:stats.baseline,illegal:stats.illegal,latency:report.latency,elapsedMs:report.elapsedMs}));
