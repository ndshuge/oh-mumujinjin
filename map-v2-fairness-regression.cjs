'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('game.js','utf8'),elements=new Map(),handlers={};
const el=id=>{if(!elements.has(id))elements.set(id,{id,hidden:false,style:{},value:'',textContent:'',dataset:{},classList:{toggle(){},add(){}},addEventListener(k,f){handlers[id+':'+k]=f},setAttribute(){},appendChild(){},getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});return elements.get(id)};
el('board').getContext=()=>new Proxy({},{get:()=>()=>{}});
const document={getElementById:el,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
const memory={};const localStorage={getItem:k=>memory[k]||null,setItem:(k,v)=>memory[k]=v};
const window={confirm:()=>true,setTimeout:()=>{}};
const expose='window.test={generateBalancedMap:generateBalancedMapR2,reproduceMap,mapCurrent,validateMap,mapFingerprint,mapMetrics};state=load()||newGame("classic");';
vm.runInNewContext(src.replace('state=load()||newGame("classic");',expose),{window,document,localStorage,Set,JSON,Math,Number,Date,Uint8Array,TextEncoder,TextDecoder,btoa,atob,console,navigator:{},location:{origin:'http://test',pathname:'/',hash:''}},{filename:'game.js'});
const t=window.test;
const flip=p=>({x:8-p.x,y:12-p.y}),key=p=>p.x+','+p.y,edge=(a,b)=>[key(a),key(b)].sort().join('|');
function check(m){
 assert(t.validateMap(m).ok,'balanced map must be legal');
 for(const layer of ['rocks','ice','boost']){
  const points=new Set(m[layer].map(key));
  for(const p of m[layer])assert(points.has(key(flip(p))),layer+' not rot180 symmetric at '+key(p));
 }
 const links=new Set(m.portals.map(g=>edge(g.a,g.b)));
 for(const gate of m.portals)assert(links.has(edge(flip(gate.a),flip(gate.b))),'portal paired links not symmetric');
 const x=t.mapMetrics(m);
 assert.equal(x.classicDistances[0],x.classicDistances[1],'classic shortest path parity');
 assert.equal(x.advancedDistances[0],x.advancedDistances[1],'advanced shortest path parity');
 assert.equal(x.openingMobility[0][0],x.openingMobility[0][1],'classic opening options');
 assert.equal(x.openingMobility[1][0],x.openingMobility[1][1],'advanced opening options');
}
const a=t.generateBalancedMap(20261105),b=t.generateBalancedMap(20261105);
check(a);assert.equal(t.mapFingerprint(a),t.mapFingerprint(b),'seed replay');
assert.equal(t.mapFingerprint(t.reproduceMap(a)),t.mapFingerprint(a),'recorded generator version replay');
assert.equal(a.portals.length,3);assert.equal(a.ice.length,5);assert.equal(a.boost.length,4);assert.equal(a.rocks.length,10);
assert.notEqual(a.generatorVersion,'mapgen-v2-r1','must distinguish new generator version');
for(const [i,seed] of [0,1,2,3,123456,987654321].entries())check(t.generateBalancedMap(seed));
assert.equal(t.mapFingerprint(t.reproduceMap(t.generateBalancedMap(999))),t.mapFingerprint(t.generateBalancedMap(999)));
const many=t.generateBalancedMap(17,{rocks:12,portals:4,ice:6,boost:8});check(many);
assert.throws(()=>t.generateBalancedMap(1,{rocks:11,ice:5,boost:4}),/count|odd|中心|不能|invalid/i,'odd rock count conflicts with center occupied by ice');
assert(handlers['mapRandomBattle:click']);handlers['mapRandomBattle:click']();
assert(t.validateMap(t.mapCurrent()).ok,'UI random battle must remain legal');
assert.equal(t.mapCurrent().generatorVersion,'mapgen-v2-r3','UI random battle uses new fairness generator');
console.log('PASS historical r2 symmetry replay and new r3 UI mode');
