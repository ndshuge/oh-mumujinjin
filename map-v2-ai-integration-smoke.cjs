'use strict';
// Diagnostic bridge: read-only legacy agent policies on the authoritative Map V2 rules.
// No AI weights, research branches, or original training runners are changed.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const league=require('./training/league/agent.cjs');
const docEls=new Map();function el(id){
 if(!docEls.has(id))docEls.set(id,{hidden:false,value:'',textContent:'',style:{},dataset:{},disabled:false,
  classList:{add(){},toggle(){}},addEventListener(){},setAttribute(){},appendChild(){},getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});
 return docEls.get(id);
}
el('board').getContext=()=>new Proxy({},{get:()=>()=>{}});
const document={getElementById:el,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
const localStorage={getItem:()=>null,setItem(){}},window={setTimeout:()=>{},confirm:()=>true};
const ctx={window,document,localStorage,Set,Number,Math,JSON,Date,Uint8Array,TextEncoder,TextDecoder,Float32Array,Float64Array,
 btoa,atob,navigator:{},location:{origin:'http://local',pathname:'/',hash:''},console};
const game=fs.readFileSync('game.js','utf8');
const hook='window.lab={generateBalancedMap,randomMap,mapFingerprint,validateMap,installMap,resetGame,hellCandidates,hellApply,hellEvaluate,hellWallAllowed,movementOptions,portal,computerDistance,CAMPS,liveTerrain:()=>({CAMPS,PORTALS,ICE,BOOST})};';
const entry='state=load()||newGame("classic");';
assert(game.includes(entry));vm.runInNewContext(game.replace(entry,hook+entry),ctx,{timeout:25000});
vm.runInNewContext(fs.readFileSync('xiaodi-engine.js','utf8'),ctx,{timeout:25000});
const lab=window.lab;
const engine={hellCandidates:lab.hellCandidates,hellApply:lab.hellApply,
 hellEvaluate:lab.hellEvaluate,hellWallAllowed:lab.hellWallAllowed,
 movementOptions:lab.movementOptions,portal:lab.portal,computerDistance:lab.computerDistance};
Object.defineProperty(engine,'terrain',{enumerable:true,get:()=>lab.liveTerrain()});
const same=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
function legal(s,side,a){
 if(!a)return false;
 if(a.wall)return engine.hellWallAllowed(s,a.wall,side);
 return engine.movementOptions(s.players[side],s.dirs[side],s.walls).some(m=>{
  if(!a.move||!same(a.move.p,m.p)||!same(a.move.d,m.d)||a.move.steps!==m.steps)return false;
  if(m.steps===2&&!same(a.move.firstDir,m.firstDir))return false;
  const g=engine.portal(m.p),target=a.warp&&g?(same(g.a,m.p)?g.b:g.a):m.p;
  const lock=a.warp?null:m.nextLock;
  return (!a.warp||!!g)&&same(target,a.p)&&((lock===null&&a.lock==null)||same(lock,a.lock));
 });
}
const choices={
 search:{id:'v2-search-smoke',family:'search',engine:'v3',depth:2},
 puct:{id:'v2-puct-smoke',family:'puct',sims:8,c:1.3,priorMix:0,valueMix:0,models:[]},
 neural:{id:'v2-neural-smoke',family:'puct',sims:8,c:1.3,priorMix:.25,valueMix:.1,models:[{name:'n64',weight:1}]}
};
choices.g5={id:'g5-weight-compat',family:'puct',sims:8,c:1.3,priorMix:.25,valueMix:.1,models:[{name:'g5fine',weight:1}]};
const names=['search','puct','neural','g5','xiaodi'];
if(!fs.existsSync('training/output/lab/g5/policy-value-g5-finetune-v1.json')){
 console.log('G5_FROZEN_WEIGHT_UNAVAILABLE: skipping frozen weight smoke');
 names.splice(names.indexOf('g5'),1);
}
const counts={},failures=[];
function move(name,s,side,map){
 if(name==='xiaodi')return window.MumuXiaodi.choose(engine,s,side,{rocks:map.rocks,map,fingerprint:lab.mapFingerprint(map)},70);
 const result=league.move(engine,s,side,{rocks:map.rocks,map,terrain:engine.terrain},choices[name],70,{deterministic:true,maxNodes:150});
 return result.action;
}
let n=0;
for(const seed of [20261105,20261106])for(const variant of ['classic','advanced']){
 const map=lab.generateBalancedMap(seed);assert(lab.installMap(map));lab.resetGame(variant);
 const s={players:lab.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]};
 for(const side of [0,1])for(const name of names){
  try{
   const action=move(name,s,side,map);
   assert(legal(s,side,action),'illegal action');
   n++;counts[name]=(counts[name]||0)+1;
  }catch(e){failures.push({seed,variant,side,name,error:e.message});}
 }
}
console.log('MAP_V2_AI_SMOKE',JSON.stringify({actions:n,counts,failures}));
if(failures.length)process.exitCode=1;
