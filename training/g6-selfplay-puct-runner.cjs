"use strict";
// G6.6 PUCT self-play runner. Generates policy visit distributions.
const fs=require("fs"),path=require("path"),{engine}=require("./train.cjs"),puct=require("./puct.cjs");
const outDir=path.join(__dirname,"output/lab/g6");fs.mkdirSync(outDir,{recursive:true});
const out=path.join(outDir,"selfplay-puct-g6.jsonl");
if(fs.existsSync(out)) throw Error("immutable selfplay output exists");
const games=Math.max(1,Math.min(10000,Number(process.argv[2]||100)));
let seed=20261014;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
function clone(s){return JSON.parse(JSON.stringify(s));}
function makeMap(){return engine.cleanMap({version:1,name:"g6-map-"+Math.floor(rand()*1e9),rocks:[]});}
const samples=[],stats={games:0,moves:0,samples:0,illegal:0};
for(let g=0;g<games;g++){
 const map=makeMap();engine.setRocks(map.rocks);
 let s={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]};
 let winner=null;
 for(let ply=0;ply<120;ply++){
  const side=ply%2;
  const result=puct.search(engine,s,side,{simulations:64,timeMs:200});
  if(!result.action)break;
  samples.push({state:clone(s),side,map,policy:result.policyVector,value:null,source:"g6-puct-selfplay"});
  s=engine.hellApply(s,side,result.action);stats.moves++;
  if(engine.terrain.CAMPS[1-side].some(p=>p.x===s.players[side].x&&p.y===s.players[side].y)){winner=side;break;}
 }
 const value=winner===null?0:1;
 for(const x of samples.slice(-120))x.value=winner===null?0:(winner===x.side?1:-1);
 stats.games++;
}
fs.writeFileSync(out,samples.map(JSON.stringify).join("\n")+"\n");
fs.writeFileSync(out+".report.json",JSON.stringify({...stats,samples:samples.length},null,2));
console.log(JSON.stringify({...stats,samples:samples.length,output:out}));
