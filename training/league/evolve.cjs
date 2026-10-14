"use strict";
// Population Based Training: mutate/crossover STRATEGIES, NOT incompatible NN weights.
// Produces a CANDIDATE generation only. Actual promotion requires a fresh paired
// held-out 1000-game arena with CI lower bound >50% vs frozen incumbent.
const fs=require("fs"),path=require("path"),{check}=require("./agent.cjs");
const root=path.join(__dirname,"..","output","lab"),files=fs.readdirSync(root).filter(f=>/^league-train-\d+-\d+-b\d+\.json$/.test(f));
const inputName=process.argv[2]||files.sort().at(-1);
if(!/^[\w.-]+\.json$/.test(inputName)||!files.includes(inputName))throw Error("Pass completed train-league report file");
const report=JSON.parse(fs.readFileSync(path.join(root,inputName),"utf8"));
const rosterName=process.argv[3]||"population.json";
if(!/^[a-zA-Z0-9_-]+\.json$/.test(rosterName))throw Error("Invalid parent population file");
const population=JSON.parse(fs.readFileSync(path.join(__dirname,rosterName),"utf8"));
const childGeneration=population.generation+1,prefix="g"+childGeneration;
const byId=new Map(population.agents.map(p=>[p.id,p]));
const ranked=report.rankings.filter(r=>byId.has(r.id)).sort((a,b)=>b.scoreRate-a.scoreRate);
if(report.split!=="train"||report.rosterGeneration!==population.generation||ranked.length!==population.agents.length||!report.allLegal)throw Error("Invalid evidence for breeding");
let rng=20261014+report.mapOffset;const rand=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);
const pick=(a,b)=>rand()<.5?a:b,clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const puctGenes=p=>{
 if(p.family==="search")return {family:"puct",sims:8,c:1.35,priorMix:0,valueMix:0,models:[]};
 return{family:"puct",sims:p.sims,c:p.c,priorMix:p.priorMix,valueMix:p.valueMix,models:p.models||[]};
};
function mixWeights(a,b){
 if(!a.models.length)return b.models.map(m=>({...m}));
 if(!b.models.length)return a.models.map(m=>({...m}));
 const names=new Set([...a.models.map(m=>m.name),...b.models.map(m=>m.name)]);
 if(!names.size)return [];
 const all=[...names].slice(0,2),weight=.5;
 const raw=all.map(n=>({name:n,weight:
  weight*(a.models.find(x=>x.name===n)?.weight||0)+(1-weight)*(b.models.find(x=>x.name===n)?.weight||0)}));
 let total=raw.reduce((s,m)=>s+m.weight,0)||1;
 return raw.map(x=>({name:x.name,weight:x.weight/total})).filter(m=>m.weight>0);
}
function breed(left,right,id,forceHybrid=false){
 const a=puctGenes(left),b=puctGenes(right);
 const family=forceHybrid?"hybrid":pick("puct","puct");
 const sims=clamp(Math.round((a.sims+b.sims)/2+(rand()-.5)*5),4,24);
 const p={
  id,family,description:"候选杂交，不得据此自动晋级",
  sims,c:Number(clamp((a.c+b.c)/2+(rand()-.5)*.35,.65,2.5).toFixed(3)),
  priorMix:Number(clamp((a.priorMix+b.priorMix)/2+(rand()-.5)*.2,0,.6).toFixed(3)),
  valueMix:Number(clamp((a.valueMix+b.valueMix)/2+(rand()-.5)*.15,0,.4).toFixed(3)),
  models:mixWeights(a,b)
 };
 if(!p.models.length){p.priorMix=0;p.valueMix=0;}
 if(family==="hybrid"){
  p.engine=left.engine||right.engine||"v1.1";
  p.depth=2;p.searchShare=Number(clamp(.5+(rand()-.5)*.35,.3,.7).toFixed(3));
 }
 return check(p);
}
const best=ranked.slice(0,2).map(r=>byId.get(r.id));
const sRank=ranked.find(r=>r.family==="search"&&!best.some(b=>b.id===r.id))||ranked.find(r=>r.family==="search");
const nRank=ranked.find(r=>r.modelCount>0&&!best.some(b=>b.id===r.id))||ranked.find(r=>r.modelCount>0);
const eliteSearch=sRank?byId.get(sRank.id):population.agents[0],
 eliteNeural=nRank?byId.get(nRank.id):population.agents.at(-1);
const offspring=[
 {...best[0],id:prefix+"-elite-a",description:"复制胜率最高配置"},
 {...best[1],id:prefix+"-elite-b",description:"复制次优配置"},
 {...eliteSearch,id:prefix+"-search-specialist",description:"保留搜索家族多样性"},
 {...eliteNeural,id:prefix+"-neural-specialist",description:"保留神经网络家族多样性"},
 breed(best[0],best[1],prefix+"-child-strategy-a"),
 breed(eliteNeural,best[0],prefix+"-child-strategy-b"),
 breed(eliteSearch,eliteNeural,prefix+"-child-hybrid-a",true),
 breed(best[1],eliteNeural,prefix+"-child-hybrid-b",true)
];
const ids=new Set(offspring.map(p=>p.id));
if(ids.size!==8)throw Error("Offspring ID duplicates");
offspring.forEach(check);
const artifact={
 schema:population.schema,generation:childGeneration,globalBudgetMs:population.globalBudgetMs,
 sourceReport:inputName,evidence:{games:report.games,maps:report.uniqueMaps,split:report.split},
 status:"experimental-proposal",promotionApproved:false,
 lineage:{parents:best.map(p=>p.id),searchSpecialist:eliteSearch.id,neuralSpecialist:eliteNeural.id,
 method:"hyperparameter crossover and blended model inference; no raw tensor splice"},
 policy:"No winner auto-promoted; new generation must beat frozen incumbent on new maps.",
 agents:offspring
};
const baseName=rosterName.replace(/(?:-proposal-g\d+)?\.json$/,"");
const file=path.join(__dirname,baseName+"-proposal-g"+childGeneration+".json");
if(fs.existsSync(file))throw Error("Refuse to overwrite existing evolution proposal");
fs.writeFileSync(file,JSON.stringify(artifact,null,2));
console.log("BREED_PROPOSAL",JSON.stringify({file,source:inputName,ranked:ranked.map(({id,scoreRate})=>({id,scoreRate})),offspring:offspring.map(p=>({id:p.id,family:p.family,models:p.models?.map(m=>m.name),sims:p.sims,engine:p.engine}))}));
