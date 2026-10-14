"use strict";
// G3 survival selection and hyperparameter crossover, after complete results.
// Only match outcomes and population lineage are retained: no move transcripts.
// Results of a small selection league are development metrics, NOT promotion.
const fs=require("fs"),path=require("path");
const {check}=require("../league/agent.cjs");
const [populationName="population-g0.json",roundsText="3",budgetText="180",seedText="20261014"]=process.argv.slice(2),
 rounds=Number(roundsText),budget=Number(budgetText),seed=Number(seedText);
if(!/^[a-zA-Z0-9_-]+\.json$/.test(populationName)||![rounds,budget,seed].every(Number.isInteger)||
 rounds<1||rounds>31)throw Error("Invalid evolution args");
const pop=JSON.parse(fs.readFileSync(path.join(__dirname,populationName),"utf8")),agents=pop.agents,
 work=path.join(__dirname,"..","output","lab","g3"),generation=pop.generation;
if(agents.length!==32)throw Error("Expected 32 contestants");
const configs=new Map(agents.map(a=>[a.id,a]));
const scores=new Map(agents.map(a=>[a.id,{id:a.id,family:a.family,
  category:a.family==="search"?"search":a.family==="hybrid"?"hybrid":a.models?.length?"neural":"rule-puct",
  wins:0,losses:0,draws:0,games:0,points:0,opponents:[],byDensity:{sparse:{points:0,games:0},medium:{points:0,games:0},dense:{points:0,games:0}}}]));
const all=[],maps=new Set();
for(let r=0;r<rounds;r++){
 const name="gen"+generation+"-round"+r+"-b"+budget+"-s"+seed,
  receipt=path.join(work,name+".report.json"),events=path.join(work,name+".results.jsonl");
 if(!fs.existsSync(receipt)||!fs.existsSync(events))throw Error("Missing completed matchday "+name);
 const roundData=JSON.parse(fs.readFileSync(receipt,"utf8"));
 if(!roundData.complete||roundData.matches!==32||roundData.illegal)throw Error("Unaccepted round "+r);
 const matches=fs.readFileSync(events,"utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
 if(matches.length!==32)throw Error("Wrong match count "+r);
 const countPerAgent=new Map(agents.map(a=>[a.id,0]));
 for(const x of matches){
  if(x.round!==r||x.illegal||x.generation!==generation||!scores.has(x.player0)||!scores.has(x.player1)||
   !["goal","cap","repetition","noMovement"].includes(x.ending))throw Error("Invalid match receipt");
  maps.add(x.mapHash);all.push(x);
  for(const [id,rival] of [[x.player0,x.player1],[x.player1,x.player0]]){
   countPerAgent.set(id,countPerAgent.get(id)+1);
   const s=scores.get(id),d=s.byDensity[x.density];
   s.games++;d.games++;s.opponents.push(rival);
   const points=x.winner===null?.5:x.winner===id?1:0;
   s.points+=points;d.points+=points;
   if(x.winner===null)s.draws++;
   else if(x.winner===id)s.wins++;else s.losses++;
  }
 }
 if([...countPerAgent.values()].some(x=>x!==2))throw Error("Not every agent played both seats round "+r);
}
const ranking=[...scores.values()].map(s=>{
 s.winRate=s.games?(s.wins+.5*s.draws)/s.games:0;
 s.opponentScore=s.opponents.reduce((v,id)=>v+scores.get(id).points,0);
 return s;
}).sort((a,b)=>b.points-a.points||b.opponentScore-a.opponentScore||a.id.localeCompare(b.id));
// Prevent a single family from swallowing the whole ecosystem.
const categoryCaps={search:6,neural:6,"rule-puct":6,hybrid:8},
 survivors=[],alive=new Set(),categoryCounts={search:0,neural:0,"rule-puct":0,hybrid:0};
function preserve(s,reason){
 survivors.push(s);alive.add(s.id);categoryCounts[s.category]++;
 if(reason)s.selectionReason=reason;
}
// Keep the best available specialist of each family before global selection.
for(const category of ["search","neural","rule-puct","hybrid"]){
 const s=ranking.find(x=>x.category===category&&!alive.has(x.id));
 if(s)preserve(s,"diversity");
}
for(const s of ranking){
 if(survivors.length===16)break;
 if(!alive.has(s.id)&&categoryCounts[s.category]<categoryCaps[s.category])preserve(s,"ranked");
}
// If a family has too few actual survivors, fill remaining places fairly.
for(const s of ranking){
 if(survivors.length===16)break;
 if(!alive.has(s.id))preserve(s,"vacancy");
}
if(survivors.length!==16)throw Error("Wrong survivors count");
const eliminated=ranking.filter(x=>!alive.has(x.id));
let rng=(seed+generation*99823+277)>>>0;
const rand=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);
const choose=a=>a[Math.floor(rand()*a.length)],clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x)),
 mutate=(v,span,lo,hi,decimals=2)=>Number(clamp(v+(rand()-.5)*2*span,lo,hi).toFixed(decimals));
const defaultPuct={sims:8,c:1.35,priorMix:0,valueMix:0,models:[]};
function puctGenes(g){
 return g.family==="search"?{...defaultPuct}:{sims:g.sims,c:g.c,priorMix:g.priorMix,valueMix:g.valueMix,
  models:(g.models||[]).map(m=>({...m}))};
}
function mixModels(a,b){
 const joint=new Map();
 for(const src of [a,b])for(const m of src.models||[])joint.set(m.name,(joint.get(m.name)||0)+m.weight*.5);
 const selected=[...joint].sort((x,y)=>y[1]-x[1]).slice(0,2);
 if(!selected.length)return [];
 const sum=selected.reduce((v,x)=>v+x[1],0);
 return selected.map(([name,weight])=>({name,weight:weight/sum}));
}
function offspring(p1,p2,id,category){
 const a=puctGenes(p1),b=puctGenes(p2);

 const family=category==="search"?"search":category==="hybrid"?"hybrid":"puct";
 let child={id,family,description:"G3 生存淘汰后交叉＋有限变异"};
 if(family==="search"){
  child.engine=rand()<.5?(p1.engine||"v1.1"):(p2.engine||"v1.1");
  if(rand()<.15)child.engine=choose(["v1.1","v2","v3"]);
  child.depth=clamp(Math.round(((p1.depth||2)+(p2.depth||2))/2+(rand()-.5)*2),1,3);
 }else{
  child.sims=clamp(Math.round((a.sims+b.sims)/2+(rand()-.5)*8),4,24);
  child.c=mutate((a.c+b.c)/2,.38,.6,2.5,3);
  child.models=category==="rule-puct"?[]:mixModels(a,b);
  if(!child.models.length&&category!=="rule-puct"){
   child.models=[{name:choose(["n24","v2","v3","n64"]),weight:1}];
  }
  child.priorMix=child.models.length?mutate((a.priorMix+b.priorMix)/2,.16,0,.65,3):0;
  child.valueMix=child.models.length?mutate((a.valueMix+b.valueMix)/2,.1,0,.4,3):0;
  if(family==="hybrid"){
   child.engine=p1.engine||p2.engine||"v1.1";
   child.depth=clamp(Math.round((p1.depth||2)+(rand()-.5)*2),1,3);
   child.searchShare=mutate(((p1.searchShare||.5)+(p2.searchShare||.5))/2,.15,.25,.75,3);
  }
 }
 // A minority of newborns receive controlled high-variance strategy mutations.
 // Only actual supported parameters are changed; no fictional portal talent.
 if(rand()<.18){
  const odd=choose(["explore-max","explore-min","many-sims","search-stubborn","brain-heavy"]);
  if(child.family==="search"){
   child.depth=3;
   child.engine=choose(["v1.1","v2","v3"]);
  }else if(odd==="explore-max")child.c=2.9;
  else if(odd==="explore-min")child.c=.35;
  else if(odd==="many-sims")child.sims=24;
  else if(odd==="search-stubborn"&&child.family==="hybrid")child.searchShare=.75;
  else if(odd==="brain-heavy"&&child.models?.length){
   child.priorMix=.65;child.valueMix=.2;
   if(child.family==="hybrid")child.searchShare=.25;
  }
  child.mutation=odd;
 }
 return check(child);
}
const survivorsGen=survivors.map((s,i)=>({
 ...configs.get(s.id),id:"g"+(generation+1)+"-sv"+String(i+1).padStart(2,"0"),
 description:"G3 保留: "+s.id+" ( "+s.points+"/"+s.games+" 得分 )",
 parents:[s.id],origin:"survivor",selectionReason:s.selectionReason||"ranked"
}));
const birthRecord=[],children=[],birthTypes=[
 "search","search","search","search",
 "rule-puct","rule-puct","rule-puct","rule-puct",
 "neural","neural","neural","neural",
 "hybrid","hybrid","hybrid","hybrid"];
for(let i=0;i<16;i++){
 const category=birthTypes[i],preferred=survivors.filter(s=>
  category==="search"?s.category==="search":
  category==="neural"?["neural","hybrid"].includes(s.category):
  category==="rule-puct"?["rule-puct","neural"].includes(s.category):
  ["search","neural","hybrid"].includes(s.category));
 const p1=choose(preferred.length?preferred:survivors.slice(0,8)),
   p2=choose(survivors.filter(p=>p.id!==p1.id));
 const id="g"+(generation+1)+"-ch"+String(i+1).padStart(2,"0");
 const child=offspring(configs.get(p1.id),configs.get(p2.id),id,category);
 child.parents=[p1.id,p2.id];child.origin="crossover";child.specialty=category;
 children.push(child);
 birthRecord.push({child:id,parents:[p1.id,p2.id],category,family:child.family,
  models:child.models?.map(m=>m.name)||[],engine:child.engine||null,
  sims:child.sims||null,priorMix:child.priorMix||0,valueMix:child.valueMix||0,
  mutation:child.mutation||null});
}
const nextAgents=[...survivorsGen,...children];nextAgents.forEach(check);
if(nextAgents.length!==32||new Set(nextAgents.map(a=>a.id)).size!==32)throw Error("Broken next generation");
const nextPop={schema:pop.schema,generation:generation+1,seed,experimentOnly:true,
 previousPopulation:populationName,sourceRounds:rounds,sourceGames:all.length,
 note:"Strategy/hyperparameter evolution, pre-trained neural weights frozen. Not a newly trained NN.",
 promotionAllowed:false,agents:nextAgents};
const suffix="g"+generation+"-r"+rounds+"-b"+budget+"-s"+seed,
 summaryFile=path.join(work,"evolution-"+suffix+".json"),
 nextFile=path.join(__dirname,"population-g"+(generation+1)+".json"),
 markdown=path.join(work,"evolution-"+suffix+".md");
if([summaryFile,nextFile,markdown].some(f=>fs.existsSync(f)))throw Error("Evolution artifacts exist; refuse overwrite");
const summary={generation,rounds,matchCount:all.length,uniqueMaps:maps.size,
 rosterSize:agents.length,survivors:survivors.map(s=>({id:s.id,w:s.wins,l:s.losses,d:s.draws,points:s.points,games:s.games,
 category:s.category,selectionReason:s.selectionReason||"ranked"})),
 eliminated:eliminated.map(s=>({id:s.id,w:s.wins,l:s.losses,d:s.draws,points:s.points,games:s.games})),
 childCount:children.length,offspring:birthRecord,
 ranking:ranking.map((s,i)=>({rank:i+1,id:s.id,category:s.category,wins:s.wins,losses:s.losses,
 draws:s.draws,games:s.games,points:s.points,winRate:s.winRate,opponentScore:s.opponentScore,
 byDensity:s.byDensity})),promotionApproved:false,
 caveat:"Only "+rounds+" maps and "+(2*rounds)+" games per agent; selection is exploratory, not proof of strength."};
fs.writeFileSync(summaryFile,JSON.stringify(summary,null,2));
fs.writeFileSync(nextFile,JSON.stringify(nextPop,null,2));
const top=summary.ranking.slice(0,12);
let md="# 木木金金棋 · G3 第 "+generation+" 代生存淘汰结果\n\n"+
 "这是**真实离线比赛**，只存每局胜负，不保存走棋过程；目前属于小样本筛选，**不是已证实强于线上 AI**。\n\n"+
 "总数：32 个 AI；地图："+maps.size+"；对战："+all.length+" 局；保留："+survivors.length+"；淘汰："+eliminated.length+"；新生："+children.length+"。\n\n"+
 "| 排名 | AI | 风格 | 胜-负-和 | 得分率 |\n|---:|---|---|---|---:|\n";
for(const s of top)md+="| "+s.rank+" | "+s.id+" | "+s.category+" | "+s.wins+"-"+s.losses+"-"+s.draws+" | "+(100*s.winRate).toFixed(1)+"% |\n";
md+="\n## 淘汰名单\n\n"+eliminated.map(s=>"- "+s.id+"： "+s.w+"胜 "+s.l+"负 "+s.d+"和").join("\n")+
 "\n\n## 下一代\n\n保留父代 16 名，产生新候选 16 名；只交叉搜索/PUCT 超参数及网络**输出比例**，不拼接神经元权重。\n\n"+
 "正式晋级必须另行进行独立新地图千局配对检验，网页版本不自动替换。\n";
fs.writeFileSync(markdown,md);
console.log("G3_EVOLUTION_DONE",JSON.stringify({generation,games:all.length,maps:maps.size,
  top:top.slice(0,6).map(x=>({id:x.id,w:x.wins,l:x.losses,d:x.draws,rate:x.winRate})),
  eliminated:eliminated.map(x=>x.id),survivors:survivors.length,children:children.length,
  nextPopulation:path.basename(nextFile),summary:path.basename(summaryFile),markdown:path.basename(markdown)}));
