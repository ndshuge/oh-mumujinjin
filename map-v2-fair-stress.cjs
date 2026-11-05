'use strict';
// 1000-map fairness stress: no use of training/holdout map sets.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const total=Number(process.argv[2]||1000);
assert(Number.isInteger(total)&&total>=1&&total<=5000);
const els=new Map();function el(id){
 if(!els.has(id))els.set(id,{value:'',hidden:false,textContent:'',style:{},dataset:{},classList:{add(){},toggle(){}},
 addEventListener(){},appendChild(){},setAttribute(){},getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});
 return els.get(id);
}
el('board').getContext=()=>new Proxy({},{get:()=>()=>{}});
const document={getElementById:el,createElement:()=>({}),querySelectorAll:()=>[],addEventListener(){}},window={setTimeout:()=>{},confirm:()=>true};
const code=fs.readFileSync('game.js','utf8'),hook='window.lab={generateBalancedMap,reproduceMap,mapFingerprint,validateMap,mapMetrics};';
vm.runInNewContext(code.replace('state=load()||newGame("classic");',hook+'state=load()||newGame("classic");'),
{window,document,localStorage:{getItem:()=>null,setItem(){}},Set,Math,Number,JSON,Date,Uint8Array,TextEncoder,TextDecoder,btoa,atob,console,navigator:{},location:{hash:'',origin:'http://test',pathname:'/'}},{timeout:20000});
const api=window.lab,hashes=new Set(),start=Date.now();
const failures=[],byReason={},distDiff={classicMax:0,advancedMax:0},attemptCounts=[],boost=[],ice=[],portal=[];
const key=p=>p.x+','+p.y,flip=p=>({x:8-p.x,y:12-p.y}),edge=(a,b)=>[key(a),key(b)].sort().join('|');
for(let i=0;i<total;i++){
 const seed=(20261105+Math.imul(i,2654435761))>>>0;
 let m;
 try{m=api.generateBalancedMap(seed);}
 catch(e){failures.push({seed,error:e.message});if(failures.length>=10)break;continue;}
 const f=api.mapFingerprint(m);
 assert(!hashes.has(f),'duplicate map');hashes.add(f);
 assert(api.validateMap(m).ok,'invalid map');
 assert.equal(api.mapFingerprint(api.reproduceMap(m)),f,'seed mismatch');
 for(const layer of ['rocks','ice','boost']){
  const set=new Set(m[layer].map(key));
  for(const p of m[layer])assert(set.has(key(flip(p))),layer+' asymmetric');
 }
 const links=new Set(m.portals.map(g=>edge(g.a,g.b)));
 for(const g of m.portals)assert(links.has(edge(flip(g.a),flip(g.b))),'portal paired links asymmetric');
 const mt=api.mapMetrics(m);
 const dc=Math.abs(mt.classicDistances[0]-mt.classicDistances[1]),da=Math.abs(mt.advancedDistances[0]-mt.advancedDistances[1]);
 distDiff.classicMax=Math.max(distDiff.classicMax,dc);
 distDiff.advancedMax=Math.max(distDiff.advancedMax,da);
 assert(dc===0&&da===0,'path advantage');
 attemptCounts.push(m.generation.attempt);
 boost.push(mt.usableBoostTiles);
 ice.push(mt.iceDirectionalTiles);
 portal.push(...mt.portalShortcuts.filter(Number.isFinite));
 if((i+1)%100===0)console.log('MAP_FAIR_PROGRESS',i+1,total,'elapsed_ms',Date.now()-start);
}
function mean(arr){return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null;}
const result={sample:total,generated:hashes.size,rejectSeeds:failures.length,
 distinct:hashes.size===total,maxDistancesDifference:distDiff,meanRetries:mean(attemptCounts),
 meanUsableBoosts:mean(boost),meanDirectionalIce:mean(ice),meanPortalShortcuts:mean(portal),
 maxGenerationAttempt:Math.max(0,...attemptCounts),elapsedMs:Date.now()-start,
 failures:failures};
fs.writeFileSync('docs/MAP_V2_FAIR_STRESS_RESULT.json',JSON.stringify(result,null,2),'utf8');
console.log('MAP_V2_FAIR_STRESS_RESULT',JSON.stringify(result));
assert.equal(result.generated,total,'Generator failed to create all requested maps');
