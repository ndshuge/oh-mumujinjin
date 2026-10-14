"use strict";
// 64-agent G4 selection with protected genetic niches.
// Keep 8 and breed 8 for each of Search/Rule-PUCT/Neural/Hybrid.
// Only strategy parameters and neural output ensembles are crossed.
const fs=require("fs"),path=require("path");
const {check}=require("../league/agent.cjs");
const [rosterFile="population-g0-64.json",roundsS="6",budgetS="260",seedS="20261014"]=process.argv.slice(2);
const rounds=Number(roundsS),budget=Number(budgetS),seed=Number(seedS),here=__dirname,
 lab=path.join(__dirname,"..","output","lab","g4");
if(!/^[a-z0-9_-]+\.json$/.test(rosterFile)||!Number.isInteger(rounds)||rounds<3||rounds>31||
 !Number.isInteger(budget)||budget<50||budget>6000||!Number.isInteger(seed))throw Error("Wrong 64 selection args");
const old=JSON.parse(fs.readFileSync(path.join(here,rosterFile),"utf8")),g=old.generation,roster=old.agents;
if(roster.length!==64||new Set(roster.map(a=>a.id)).size!==64)throw Error("Invalid source population");
const classify=a=>a.family==="search"?"search":a.family==="hybrid"?"hybrid":a.models?.length?"neural":"rule-puct";
const kinds=["search","rule-puct","neural","hybrid"],
 history=new Map(roster.map(a=>[a.id,{id:a.id,family:classify(a),w:0,l:0,d:0,games:0,score:0,
 rivals:[],densities:{sparse:{games:0,score:0},medium:{games:0,score:0},dense:{games:0,score:0}}}])),
 maps=new Set(),items=[];
for(let round=0;round<rounds;round++){
 const tag="gen"+g+"-round"+round+"-b"+budget+"-s"+seed;
 const summaryPath=path.join(lab,tag+".report.json"),matchPath=path.join(lab,tag+".results.jsonl");
 if(!fs.existsSync(summaryPath)||!fs.existsSync(matchPath))throw Error("Missing complete round "+tag);
 const summary=JSON.parse(fs.readFileSync(summaryPath,"utf8"));
 const matches=fs.readFileSync(matchPath,"utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
 if(!summary.complete||summary.matches!==64||summary.illegal||matches.length!==64)throw Error("Round not approved "+tag);
 const times=new Map(roster.map(a=>[a.id,0]));
 for(const item of matches){
  if(item.round!==round||item.illegal||!history.has(item.player0)||!history.has(item.player1)||
    !["goal","noMovement","repetition","cap"].includes(item.ending))throw Error("Bad match result");
  maps.add(item.mapHash);items.push(item);
  for(const [player,rival] of [[item.player0,item.player1],[item.player1,item.player0]]){
   const record=history.get(player),point=item.winner===null?.5:item.winner===player?1:0;
   record.score+=point;record.games++;record.rivals.push(rival);
   record.densities[item.density].games++;record.densities[item.density].score+=point;
   times.set(player,times.get(player)+1);
   if(item.winner===null)record.d++;else if(item.winner===player)record.w++;else record.l++;
  }
 }
 if([...times.values()].some(n=>n!==2))throw Error("Not all agents have both seats at round "+round);
}
const stats=[...history.values()];
for(const s of stats){s.winRate=s.score/s.games;s.opponentScore=s.rivals.reduce((n,id)=>n+history.get(id).score,0);}
const leaderboard=stats.slice().sort((a,b)=>b.score-a.score||b.opponentScore-a.opponentScore||a.id.localeCompare(b.id));
const winners=[],eliminated=[],genes=new Map(roster.map(a=>[a.id,a]));
for(const family of kinds){
 const rank=leaderboard.filter(x=>x.family===family);
 if(rank.length!==16)throw Error("Not exactly 16 original agents in "+family);
 winners.push(...rank.slice(0,8));eliminated.push(...rank.slice(8));
}
let rnd=(seed+g*27661+371)>>>0;
const random=()=>((rnd=(Math.imul(rnd,1664525)+1013904223)>>>0)/4294967296),
 pick=xs=>xs[Math.floor(random()*xs.length)],
 clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),
 jitter=(v,delta,min,max)=>Number(clamp(v+(random()-.5)*2*delta,min,max).toFixed(3));
const knownModels=["n24","v2","v3","n64"];
function crosses(a,b){
 const sums=new Map();
 for(const genome of [a,b])for(const m of genome.models||[])
  sums.set(m.name,(sums.get(m.name)||0)+m.weight*.5);
 const entries=[...sums].sort((x,y)=>y[1]-x[1]).slice(0,2);
 if(!entries.length)return[{name:pick(knownModels),weight:1}];
 const total=entries.reduce((n,e)=>n+e[1],0);
 return entries.map(([name,weight])=>({name,weight:weight/total}));
}
const newAgents=[],births=[];
const prefix=["search","rule-puct","neural","hybrid"];
for(const family of prefix){
 const elite=leaderboard.filter(x=>x.family===family).slice(0,8);
 for(let i=0;i<8;i++){
  const ancestor=elite[i],copy=JSON.parse(JSON.stringify(genes.get(ancestor.id)));
  const newId="g"+(g+1)+"-"+({search:"s", "rule-puct":"p",neural:"n",hybrid:"h"}[family])+"sv"+String(i+1).padStart(2,"0");
  copy.id=newId;copy.origin="survivor";copy.parents=[ancestor.id];copy.specialty=family;
  check(copy);newAgents.push(copy);
 }
}
for(const family of prefix){
 const elite=leaderboard.filter(x=>x.family===family).slice(0,8);
 for(let i=0;i<8;i++){
  const ancestor=pick(elite),sameOther=elite.filter(x=>x.id!==ancestor.id);
  const different=leaderboard.filter(x=>x.family!==family).slice(0,8);
  const second=pick((family==="hybrid"||family==="neural")&&random()<.45?different:sameOther);
  const a=genes.get(ancestor.id),b=genes.get(second.id),
   id="g"+(g+1)+"-"+({search:"s","rule-puct":"p",neural:"n",hybrid:"h"}[family])+"ch"+String(i+1).padStart(2,"0");
  let child={id,origin:"crossover",family:family==="search"?"search":family==="hybrid"?"hybrid":"puct",
   specialty:family,parents:[ancestor.id,second.id],description:"Crossed real strategy genes, no neural parameter splice"};
  const ap=a.family==="search"?{sims:8,c:1.3,priorMix:0,valueMix:0,models:[]} :a,
   bp=b.family==="search"?{sims:8,c:1.3,priorMix:0,valueMix:0,models:[]} :b;
  if(family==="search"){
   child.engine=pick([a.engine||"v1.1",b.engine||"v1.1",pick(["v1.1","v2","v3"])]);
   child.depth=clamp(Math.round(((a.depth||2)+(b.depth||2))/2+(random()-.5)*2),1,4);
  }else{
   child.sims=clamp(Math.round((ap.sims+bp.sims)/2+(random()-.5)*9),4,24);
   child.c=jitter((ap.c+bp.c)/2,.45,.3,3);
   child.models=family==="rule-puct"?[]:crosses(a,b);
   child.priorMix=child.models.length?jitter((ap.priorMix+bp.priorMix)/2,.17,0,.7):0;
   child.valueMix=child.models.length?jitter((ap.valueMix+bp.valueMix)/2,.1,0,.5):0;
   if(family==="hybrid"){
    child.engine=a.engine||b.engine||"v1.1";
    child.depth=clamp(Math.round((a.depth||2)+(random()-.5)*2),1,3);
    child.searchShare=jitter(((a.searchShare||.5)+(b.searchShare||.5))/2,.18,.25,.75);
   }
  }
  // One in four newborns gets a real, bounded, unusual mutation.
  if(random()<.25){
   const type=pick(["minimal-exploration","maximal-exploration","high-simulation",
     "search-obsession","neural-obsession","model-switch"]);
   if(family==="search"){child.depth=3;child.engine=pick(["v1.1","v2","v3"]);}
   else if(type==="minimal-exploration")child.c=.35;
   else if(type==="maximal-exploration")child.c=2.95;
   else if(type==="high-simulation")child.sims=24;
   else if(type==="search-obsession"&&family==="hybrid")child.searchShare=.75;
   else if(type==="neural-obsession"&&family==="hybrid")child.searchShare=.25;
   else if(type==="model-switch"&&child.models.length){
    child.models=[{name:pick(knownModels),weight:1}];child.priorMix=.6;
   }
   child.mutation=type;
  }
  check(child);newAgents.push(child);
  births.push({id,parents:child.parents,family:child.specialty,
    mutation:child.mutation||null,engine:child.engine||null,
    sims:child.sims||0,models:child.models||[]});
 }
}
if(newAgents.length!==64||new Set(newAgents.map(a=>a.id)).size!==64)throw Error("Broken offspring population");
const newCount={search:0,"rule-puct":0,neural:0,hybrid:0};
for(const a of newAgents)newCount[classify(a)]++;
if(Object.values(newCount).some(n=>n!==16))throw Error("Next generation lost a family "+JSON.stringify(newCount));
const nextFile=path.join(here,"population-g"+(g+1)+"-64.json"),
 reportFile=path.join(lab,"selection-g"+g+"-"+rounds+"r-b"+budget+".json"),
 mdFile=path.join(lab,"selection-g"+g+"-"+rounds+"r-b"+budget+".md");
if([nextFile,reportFile,mdFile].some(f=>fs.existsSync(f)))throw Error("Selection report already exists; refuse overwrite");
const nextPop={schema:old.schema,generation:g+1,previousPopulation:rosterFile,
 sourceMaps:maps.size,sourceGames:items.length,experimentOnly:true,
 families:newCount,agentCount:64,note:"G4 selection; neural model weights remain fixed",
 agents:newAgents};
const report={generation:g,rounds,totalMatches:items.length,uniqueMaps:maps.size,
 contenders:64,survivors:32,eliminated:32,newborns:32,categoryCounts:newCount,
 ranking:leaderboard.map((s,i)=>({rank:i+1,id:s.id,family:s.family,w:s.w,l:s.l,d:s.d,
 games:s.games,points:s.score,winRate:s.winRate,opponentScore:s.opponentScore,
 byDensity:s.densities})),
 survivorList:winners.map(s=>s.id),eliminatedList:eliminated.map(s=>s.id),
 offspring:births,promotionAllowed:false,
 warning:"6 rounds = 12 games per agent, still not enough to prove improvement over V1.1"};
fs.writeFileSync(nextFile,JSON.stringify(nextPop,null,2));
fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
let md="# G4 64 AI 自然选择 · 第 "+g+" 代\n\n"+
 "已赛 **"+items.length+" 局**，覆盖 **"+maps.size+" 张独立开发地图**，每位 AI **"+(rounds*2)+" 局**。\n\n"+
 "保留32，淘汰32，新生32；四个家族各16个席位保留。只记录胜负、淘汰、参数继承，不保存逐步棋谱。\n\n"+
 "| 排名 | AI | 家族 | 胜-负-和 | 得分率 |\n|---:|---|---|---|---:|\n";
for(const r of report.ranking.slice(0,24))md+="| "+r.rank+" | "+r.id+" | "+r.family+" | "+r.w+"-"+r.l+"-"+r.d+" | "+(100*r.winRate).toFixed(1)+"% |\n";
md+="\n## 淘汰32名\n\n"+report.eliminatedList.join(", ")+"\n\n## 新生变异\n\n"+
  births.map(b=>"- "+b.id+" ← "+b.parents.join(" + ")+(b.mutation?" / **"+b.mutation+"**":"")).join("\n")+
  "\n\n开发联赛不等于打赢冻结V1.1；线上版本不自动替换。\n";
fs.writeFileSync(mdFile,md);
console.log("G4_SELECTION_ACCEPTED",JSON.stringify({generation:g,games:items.length,maps:maps.size,
  top:report.ranking.slice(0,6).map(x=>({id:x.id,w:x.w,l:x.l,d:x.d})),
 survivors:32,eliminated:32,born:32,oddMutations:births.filter(x=>x.mutation).length,
 protectedFamilies:newCount,nextPopulation:nextFile,markdown:mdFile}));
