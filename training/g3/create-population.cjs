"use strict";
// G3 generation zero: 32 distinct, bounded, validated agent configurations.
// No neural tensor splicing; the "genome" is inference/search strategy.
const fs=require("fs"),path=require("path");
const {check}=require("../league/agent.cjs");
const here=__dirname,output=path.join(here,"population-g0.json");
if(fs.existsSync(output))throw Error("Population exists: refuse overwrite");
const agents=[],add=(id,description,opts)=>{
 const a={id,description,...opts};check(a);agents.push(a);
};
const search=[["v1.1",1],["v1.1",2],["v2",1],["v2",2],["v2",3],["v3",1],["v3",2],["v3",3]];
search.forEach(([engine,depth],i)=>add("g0-s"+String(i+1).padStart(2,"0"),"规则搜索："+engine+" / 深度"+depth,{family:"search",engine,depth}));
const puct=[
 [4,.75],[6,1.15],[8,1.35],[10,1.6],[12,1.85],[14,2.1],[16,.95],[18,1.55]
];
puct.forEach(([sims,c],i)=>add("g0-p"+String(i+1).padStart(2,"0"),"PUCT："+sims+" 次模拟，探索系数 "+c,{
 family:"puct",sims,c,priorMix:0,valueMix:0,models:[]}));
const variants=[
 ["n24",.16,0,8,1.2],["n24",.32,.1,10,1.6],["n24",.55,.12,12,1.3],
 ["v2",.16,0,8,1.2],["v2",.32,.1,10,1.6],["v2",.55,.12,12,1.3],
 ["v3",.16,0,8,1.2],["v3",.32,.1,10,1.6],["v3",.55,.12,12,1.3],
 ["n64",.16,0,8,1.2],["n64",.32,.1,10,1.6],["n64",.55,.12,12,1.3]
];
variants.forEach(([name,priorMix,valueMix,sims,c],i)=>add("g0-n"+String(i+1).padStart(2,"0"),
 "神经网络 "+name+" / 策略权重 "+priorMix,{
 family:"puct",sims,c,priorMix,valueMix,models:[{name,weight:1}]}));
const hybrids=[
 {engine:"v1.1",depth:2,searchShare:.65,models:[{name:"v3",weight:1}],priorMix:.2,valueMix:.05,sims:8,c:1.3},
 {engine:"v2",depth:2,searchShare:.50,models:[{name:"n64",weight:1}],priorMix:.3,valueMix:.1,sims:10,c:1.6},
 {engine:"v3",depth:2,searchShare:.45,models:[{name:"v2",weight:1}],priorMix:.25,valueMix:0,sims:10,c:1.2},
 {engine:"v1.1",depth:2,searchShare:.6,models:[{name:"n24",weight:.4},{name:"v3",weight:.6}],priorMix:.3,valueMix:.08,sims:9,c:1.7}
];
hybrids.forEach((g,i)=>add("g0-h"+String(i+1).padStart(2,"0"),
 "混合搜索＋神经网络 "+g.models.map(m=>m.name).join("+"),{family:"hybrid",...g}));
if(agents.length!==32||new Set(agents.map(a=>a.id)).size!==32)throw Error("Bad population size");
const doc={schema:"mumu-g3-genome-v1",generation:0,seed:20261014,experimentOnly:true,game:"oh-mumujinjin",
 reasons:"A/B search, PUCT exploration, policy-value widths, controlled hybrids",
 modelWeights:"pretrained; fixed during generation, never raw-crossed",promotionAllowed:false,agents};
fs.writeFileSync(output,JSON.stringify(doc,null,2));
console.log("G3_POPULATION_CREATED",JSON.stringify({path:output,count:agents.length,
 families:agents.reduce((m,a)=>(m[a.family]=(m[a.family]||0)+1,m),{})}));
