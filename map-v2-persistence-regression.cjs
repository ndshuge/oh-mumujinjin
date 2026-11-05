// Map V2 persistence and legacy-link black-box boot regression.
'use strict';const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('game.js','utf8');
function boot(mem={},hash=''){
 const map=new Map(),el=id=>{
  if(!map.has(id))map.set(id,{textContent:'',value:'',hidden:false,style:{},dataset:{},disabled:false,
   classList:{toggle(){},add(){}},addEventListener(){},setAttribute(){},appendChild(){},
   getBoundingClientRect(){return {left:0,top:0,width:720,height:980}}});
  return map.get(id);
 };
 el('board').getContext=()=>new Proxy({},{get:(o,k)=>o[k]??(()=>{})});
 const document={getElementById:el,createElement:()=>({}),querySelectorAll:()=>[],addEventListener(){}};
 const window={confirm:()=>true,setTimeout:()=>{}};
 const localStorage={getItem:k=>mem[k]||null,setItem:(k,v)=>{mem[k]=v}};
 const probe='window.test={state:()=>state,cleanMap,mapCurrent,mapFingerprint,installMap,resetGame,save,findPath,portal,choosePortal};state=load()||newGame("classic");';
 vm.runInNewContext(src.replace('state=load()||newGame("classic");',probe),
   {window,document,localStorage,Set,Number,Math,JSON,TextEncoder,TextDecoder,Uint8Array,btoa,atob,location:{hash,origin:'https://example.org',pathname:'/index.html'},navigator:{},console},{timeout:25000});
 return {t:window.test,api:window.MumuMapV2,mem,el};
}
const legacy={version:1,name:'Old share',rocks:[{x:4,y:6}]};
const v1=boot({},'#map='+Buffer.from(JSON.stringify(legacy),'utf8').toString('base64url'));
assert.equal(v1.t.mapCurrent().portals.length,3,'V1 share restores fixed portals');
assert.equal(v1.t.mapCurrent().name,'Old share');
assert.equal(JSON.parse(v1.mem['mumujinjin-active-map-v2']).version,2);
const map=v1.t.cleanMap(legacy);
const other=JSON.parse(JSON.stringify(map)),tmp=other.portals[0].b;
other.portals[0].b=other.portals[1].b;other.portals[1].b=tmp;other.name='new map';
assert(v1.t.installMap(other));
let s=v1.t.state();s.variant='advanced';s.phase='play';s.turn=1;s.moves=3;
s.players=[{x:7,y:12},{x:1,y:0}];s.history=[];
v1.t.save();
const payload=JSON.parse(v1.mem['mumujinjin-game-v1']);
assert.equal(payload.version,2);
assert.equal(payload.mapFingerprint,v1.t.mapFingerprint(other));
v1.mem['mumujinjin-active-map-v2']=JSON.stringify(map); // Simulate a stale active map.
const next=boot(v1.mem);
assert.equal(next.t.state().moves,3,'Resume state without discarding game');
assert.equal(next.t.mapFingerprint(next.t.mapCurrent()),payload.mapFingerprint,'Resume must use embedded original terrain');
const bad=JSON.parse(JSON.stringify(payload));
bad.mapFingerprint='f'.repeat(64);
const polluted={'mumujinjin-game-v1':JSON.stringify(bad),'mumujinjin-active-map-v2':JSON.stringify(map)};
const fallback=boot(polluted);
assert.equal(fallback.t.state().moves,0,'Fingerprint mismatch rejects stored match');
assert.equal(fallback.t.mapFingerprint(fallback.t.mapCurrent()),fallback.t.mapFingerprint(map));
console.log('PASS: legacy V1 share URL, full V2 map-bound save/resume, fingerprint mismatch fails safe');
