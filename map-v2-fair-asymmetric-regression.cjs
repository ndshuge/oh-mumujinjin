'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('game.js','utf8'),nodes=new Map(),store={};
function el(id){if(!nodes.has(id))nodes.set(id,{id,hidden:false,style:{},dataset:{},textContent:'',value:'',classList:{toggle(){},add(){}},addEventListener(){},appendChild(){},setAttribute(){},getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});return nodes.get(id)}
el('board').getContext=()=>new Proxy({},{get:()=>()=>{}});
const document={getElementById:el,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
const window={confirm:()=>true,setTimeout:()=>{}},localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v};
const inject='window.probe={randomMap,randomRocks,generateBalancedMap,reproduceMap,validateMap,mapMetrics,mapFingerprint,defaultMap,installMap,auditFairMap,getMap,randomizeInitialMap};state=load()||newGame("classic");';
vm.runInNewContext(source.replace('state=load()||newGame("classic");',inject),{window,document,localStorage,Math,Number,JSON,Set,Date,Uint8Array,TextEncoder,TextDecoder,btoa,atob,console,location:{hash:'',origin:'https://test',pathname:'/'},navigator:{}});
const api=window.probe;
const pos=p=>p.x+','+p.y;
function symmetric(a){let mirror=p=>({x:8-p.x,y:12-p.y});let points=name=>a[name].every(p=>a[name].some(q=>pos(q)===pos(mirror(p))));if(!['rocks','ice','boost'].every(points))return false;let links=a.portals.map(g=>[pos(g.a),pos(g.b)].sort().join('|'));return a.portals.every(g=>links.includes([pos(mirror(g.a)),pos(mirror(g.b))].sort().join('|')))}
const profiles=[undefined,{rocks:6,portals:1,ice:5,boost:4},{rocks:12,portals:4,ice:6,boost:8},{rocks:8,portals:0,ice:6,boost:4},{rocks:15,portals:4,ice:7,boost:5}];
let count=0, asymmetric=0, witnessed=new Set();
for(const method of ['generateBalancedMap','randomMap','randomRocks']){
 for(let i=0;i<100;i++){
  const seed=(20261106+Math.imul(i+1,0x9e3779b9))>>>0, options=method==='randomRocks'?undefined:profiles[i%profiles.length];
  const m=api[method](seed,options),r=api.auditFairMap(m);
  assert(api.validateMap(m).ok,method+' illegal '+seed);
  assert(r.ok,method+' unfair '+seed+': '+r.reason);
  assert(!symmetric(m),method+' forced rot180 symmetry '+seed);
  assert.equal(m.generatorVersion,'mapgen-v2-r3',method+' missing version');
  assert.equal(api.mapFingerprint(api.reproduceMap(m)),api.mapFingerprint(m),method+' seed replay');
  assert.equal(api.mapFingerprint(api[method](seed,options)),api.mapFingerprint(m),method+' deterministic output');
  count++;asymmetric++;witnessed.add(api.mapFingerprint(m));
 }
}
assert(witnessed.size>=195,'Too many duplicate maps across distinct seeds');
const def=api.defaultMap();assert(api.auditFairMap(def).ok,'default map is not fair');
assert(!symmetric(def),'default is intentionally symmetric');
assert(api.installMap(def,'default'),'default map must remain playable');
const legacy=JSON.parse(fs.readFileSync('docs/map-legacy-20261105.json','utf8'));
for(const [kind,m] of Object.entries(legacy)){
 assert.equal(api.mapFingerprint(api.reproduceMap(m)),api.mapFingerprint(m),kind+' legacy seed replay changed');
}
console.log('PASS_NON_SYMMETRIC_FAIR_MAPS '+JSON.stringify({count,asymmetric,unique:witnessed.size,legacy:Object.keys(legacy)}));
