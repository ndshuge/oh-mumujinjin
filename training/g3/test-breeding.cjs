"use strict";
// Deterministic unit smoke for breeder categories without consuming any match
// results, overwriting older populations, or mutating neural tensors.
const fs=require("fs"),path=require("path"),vm=require("vm");
const {check}=require("../league/agent.cjs");
const src=fs.readFileSync(path.join(__dirname,"select-and-breed.cjs"),"utf8");
const start=src.indexOf("const defaultPuct="),end=src.indexOf("const survivorsGen=");
if(start<0||end<=start)throw Error("Breeding code location changed");
let counter=0;
const ctx={check,
  rand:()=>((counter=(Math.imul(counter+23,1664525)+1013904223)>>>0)/4294967296),
  choose:arr=>arr[counter%arr.length],
  clamp:(x,lo,hi)=>Math.min(hi,Math.max(lo,x)),
  mutate:(x,span,lo,hi,d=3)=>Number(Math.max(lo,Math.min(hi,x+span*.07)).toFixed(d))
};
vm.runInNewContext(src.slice(start,end)+"\nthis.makeOffspring=offspring;",ctx);
const roster=JSON.parse(fs.readFileSync(path.join(__dirname,"population-g2.json"),"utf8"));
const s=roster.agents.find(a=>a.family==="search"),n=roster.agents.find(a=>a.models?.length);
if(!s||!n)throw Error("Need search and network donor");
const kinds=["search","rule-puct","neural","hybrid"];
for(const [i,k] of kinds.entries()){
 const c=ctx.makeOffspring(s,n,"check-child-"+i,k);
 check(c);
 const hasModel=!!c.models?.length;
 if(k==="search"&&c.family!=="search")throw Error("Lost search");
 if(k==="rule-puct"&&(c.family!=="puct"||hasModel))throw Error("Rule PUCT inherited neural weights");
 if(k==="neural"&&(c.family!=="puct"||!hasModel))throw Error("Lost neural lineage");
 if(k==="hybrid"&&(c.family!=="hybrid"||!hasModel))throw Error("Lost hybrid lineage");
 console.log("BREED_CATEGORY_PASS",k,c.family,c.engine||"-",c.models?.map(m=>m.name)||[]);
}
