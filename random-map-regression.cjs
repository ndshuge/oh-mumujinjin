"use strict";
const fs=require("fs"),vm=require("vm"),assert=require("assert");
const elements=new Map(),storage=new Map();
function el(id){if(!elements.has(id))elements.set(id,{id,hidden:false,style:{},textContent:"",dataset:{},disabled:false,classList:{toggle(){},add(){},remove(){}},addEventListener(){},setAttribute(){},appendChild(){},getBoundingClientRect(){return {left:0,top:0,width:720,height:980}}});return elements.get(id);}
const ctx=new Proxy({},{get(a,k){return k in a?a[k]:()=>{};},set(a,k,v){a[k]=v;return true;}});el("board").getContext=()=>ctx;
const document={getElementById:el,querySelectorAll:()=>[],addEventListener(){},createElement:tag=>({tagName:tag,value:"",textContent:"",style:{},appendChild(){},addEventListener(){}})};
const win={confirm:()=>true,setTimeout:()=>0};
const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const sandbox={window:win,document,localStorage,Set,Map,Math,Number,Uint8Array,Float32Array,Float64Array,Date,JSON,console,TextDecoder,TextEncoder};
vm.runInNewContext(fs.readFileSync("random-map.js","utf8"),sandbox);
vm.runInNewContext(fs.readFileSync("xiaodi-engine.js","utf8"),sandbox);
vm.runInNewContext(fs.readFileSync("zhongdi-engine.js","utf8"),sandbox);
const text=fs.readFileSync("game.js","utf8"),needle='state=load()||newGame("classic");';
assert(text.includes(needle));
vm.runInNewContext(text.replace(needle,'window.test={state:()=>state,cleanMap,randomizeInitialMap,resetGame,mapCurrent,findPath,ROCKS:()=>ROCKS};'+needle),sandbox,{timeout:30000});
const g=win.test;let previous=win.MumuRandomMap.signature(g.ROCKS()),fallback=0;
const blocked=new Set(["6,12","7,12","8,12","0,0","1,0","2,0","5,2","2,5","6,4","1,11","8,6","3,8","1,6","1,7","1,8","7,7","7,8","4,3","4,4","6,10","7,10"]);
for(let seed=1;seed<=600;seed++){
 const map=win.MumuRandomMap.generate({seed,width:9,height:13,count:10,previous,
  blocked:p=>blocked.has(p.x+","+p.y),fallback:g.ROCKS(),validate:rocks=>!!g.cleanMap({version:1,name:"random",rocks})});
 assert(map.rocks.length===10);assert(!map.fallback);assert.notStrictEqual(map.signature,previous);
 assert(g.cleanMap({version:1,name:"random",rocks:map.rocks}));
 previous=map.signature;fallback+=Number(map.fallback);
}
let unique=new Set();
for(let i=0;i<50;i++){g.resetGame("classic");const m=g.mapCurrent();assert(g.cleanMap(m));unique.add(win.MumuRandomMap.signature(m.rocks));}
assert(unique.size>=45,"Not sufficiently randomized");
const active=JSON.parse(localStorage.getItem("mumujinjin-random-last-v1"));
assert(g.cleanMap(active),"Persisted active map invalid");
assert(!localStorage.getItem("mumujinjin-active-map-v1"),"Prior fixed user map should not mask generated maps");
console.log("RANDOM_MAP_600_SEEDS_50_RESTARTS_PASS",JSON.stringify({seeds:600,restarts:50,unique:unique.size,fallbacks:fallback,validBothSides:true,lockedTilesProtected:true}));
