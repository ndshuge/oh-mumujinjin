"use strict";
// Genuine unusual gene configurations, constrained by the game's legal-action
// engine and executable agent adapter; never pretend a nonexistent ability exists.
const fs=require("fs"),path=require("path"),{check}=require("../league/agent.cjs");
const current=JSON.parse(fs.readFileSync(path.join(__dirname,"population-g2.json"),"utf8"));
const byId=new Map(current.agents.map(x=>[x.id,x]));
const selected=["g2-sv01","g2-sv02","g2-sv03","g2-sv05"]
 .map(id=>byId.get(id)).filter(Boolean).map(x=>({...x}));
const weird=[
 {id:"odd-scout",family:"puct",description:"疯狂探索：接近最大 UCB 探索系数",sims:18,c:2.9,priorMix:0,valueMix:0,models:[]},
 {id:"odd-tunnel",family:"puct",description:"顽固路线：接近最小探索系数",sims:18,c:.35,priorMix:0,valueMix:0,models:[]},
 {id:"odd-prophet",family:"puct",description:"偏执预言：非常高的 V3 策略先验",sims:12,c:1.1,priorMix:.65,valueMix:.05,models:[{name:"v3",weight:1}]},
 {id:"odd-judge",family:"puct",description:"唯价值论：偏重 64 神经元价值评估",sims:12,c:1.45,priorMix:.05,valueMix:.62,models:[{name:"n64",weight:1}]},
 {id:"odd-twins",family:"puct",description:"异形双胞胎：24+64 神经元相反规模组合",sims:14,c:1.6,priorMix:.55,valueMix:.15,models:[{name:"n24",weight:.85},{name:"n64",weight:.15}]},
 {id:"odd-mutant",family:"puct",description:"混乱预言：V2+V3 网络高权重集成",sims:16,c:2.35,priorMix:.58,valueMix:.21,models:[{name:"v2",weight:.25},{name:"v3",weight:.75}]},
 {id:"odd-hawks",family:"hybrid",description:"激进神经：只有25%预算留给搜索",engine:"v3",depth:2,searchShare:.25,sims:12,c:2.2,priorMix:.52,valueMix:.13,models:[{name:"v3",weight:1}]},
 {id:"odd-tortoise",family:"hybrid",description:"铁壁搜索：75%预算搜索，网络仅提供奇招",engine:"v1.1",depth:2,searchShare:.75,sims:10,c:.8,priorMix:.62,valueMix:.02,models:[{name:"n64",weight:1}]},
 {id:"odd-dreamer",family:"hybrid",description:"大脑杂交：神经网络双头加搜",engine:"v2",depth:2,searchShare:.33,sims:18,c:2.4,priorMix:.5,valueMix:.35,models:[{name:"n24",weight:.35},{name:"n64",weight:.65}]},
 {id:"odd-sentinel",family:"search",description:"纯搜索异常：V3 三层高优先威胁分析",engine:"v3",depth:3}
];
const agents=[...selected,...weird];
agents.forEach(check);
if(new Set(agents.map(a=>a.id)).size!==agents.length)throw Error("Duplicate odd genome");
const population={schema:"mumu-g3-strange-v1",generation:2,source:"population-g2.json",
 mode:"development-challenge",frozenWeights:true,promotionApproved:false,
 notes:"Models are existing pretrained networks, unusual mixtures alter search, not underlying rule mechanics.",
 agents};
const dest=path.join(__dirname,"..","league","population-strange.json");
if(fs.existsSync(dest))throw Error("Odd roster already exists");
fs.writeFileSync(dest,JSON.stringify(population,null,2));
console.log("STRANGE_GENES_CREATED",JSON.stringify({count:agents.length,roster:dest,
 competitors:agents.map(a=>({id:a.id,family:a.family,models:a.models?.map(m=>m.name)}))}));
