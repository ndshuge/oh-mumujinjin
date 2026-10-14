"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert");
const {engine}=require("./train.cjs");
const version=process.argv[2]||"v2";
const search=require("../strong-search-"+version+".js");
const fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,"tactical-fixtures.json"),"utf8"));
const budget=Math.max(100,Math.min(1000,Number(process.argv[3]||300)));
function contains(points,p){return points.some(q=>q.x===p.x&&q.y===p.y);}
function canWin(s,p){
 for(const m of engine.movementOptions(s.players[p],s.dirs[p],s.walls)){
  if(contains(engine.terrain.CAMPS[1-p],m.p))return true;
  const portal=engine.portal(m.p);
  if(portal&&contains(engine.terrain.CAMPS[1-p],portal.a.x===m.p.x&&portal.a.y===m.p.y?portal.b:portal.a))return true;
 }
 return false;
}
const counts={total:fixtures.cases.length,win:0,defend:0,winPassed:0,defendPassed:0,invalid:0,latencies:[],fails:[]};
for(const [i,fixture] of fixtures.cases.entries()){
 engine.setRocks(fixture.map.rocks);
 const who=fixture.side,s=fixture.state;
 const start=Date.now(),recommendation=search.choose(engine,s,who,{depth:2,timeMs:budget});
 counts.latencies.push(Date.now()-start);
 const act=recommendation.action;
 let legal=false;
 if(act?.wall)legal=engine.hellWallAllowed(s,act.wall,who);
 else if(act?.move)legal=engine.movementOptions(s.players[who],s.dirs[who],s.walls).some(m=>{
  const a=act.move;return m.p.x===a.p.x&&m.p.y===a.p.y&&m.steps===a.steps&&m.d.x===a.d.x&&m.d.y===a.d.y;
 });
 if(!legal)counts.invalid++;
 let passed=false;
 if(legal){
  const next=engine.hellApply(s,who,act);
  if(fixture.kind==="win-in-one"){counts.win++;passed=contains(engine.terrain.CAMPS[1-who],next.players[who]);if(passed)counts.winPassed++;}
  else{counts.defend++;passed=!canWin(next,1-who);if(passed)counts.defendPassed++;}
 }else if(fixture.kind==="win-in-one")counts.win++;else counts.defend++;
 if(!passed&&counts.fails.length<25)counts.fails.push({index:i,map:fixture.map.name,kind:fixture.kind,side:who,action:act?.wall?act.wall:act?.p,legality:legal});
 if((i+1)%40===0)console.log("TACTICAL_PROGRESS",version,i+1,"/",fixtures.cases.length);
}
counts.latencies.sort((a,b)=>a-b);
const summary={version,budget,total:counts.total,win:{passed:counts.winPassed,total:counts.win},
 defence:{passed:counts.defendPassed,total:counts.defend},
 illegal:counts.invalid,p50Ms:counts.latencies[Math.floor(counts.latencies.length*.5)],
 p95Ms:counts.latencies[Math.floor(counts.latencies.length*.95)],
 failures:counts.fails};
fs.mkdirSync(path.join(__dirname,"output"),{recursive:true});
fs.writeFileSync(path.join(__dirname,"output","tactical-"+version+"-report.json"),JSON.stringify(summary,null,2));
console.log("TACTICAL_RESULT",JSON.stringify(summary));
if(counts.invalid)process.exitCode=1;
