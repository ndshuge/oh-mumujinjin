// Contract test: frozen AI policy is NOT invoked or modified. Capture only the game's adapter input.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('game.js','utf8'),nodes=new Map(),mem={};
function el(id){
 if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',value:'',style:{},dataset:{},disabled:false,classList:{toggle(){},add(){}},
 addEventListener(){},setAttribute(){},appendChild(){},getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});
 return nodes.get(id);
}
el('board').getContext=()=>new Proxy({},{get:(o,k)=>o[k]||(()=>{})});
const document={getElementById:el,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
const localStorage={getItem:k=>mem[k]||null,setItem:(k,v)=>mem[k]=v};
let captured;
const window={confirm:()=>true,setTimeout:()=>{},MumuXiaodi:{choose:(engine,state,side,map,ms)=>{
 captured={terrain:JSON.parse(JSON.stringify(engine.terrain)),map:JSON.parse(JSON.stringify(map)),side,ms};
 return null;
}}};
const hook='window.test={installMap,resetGame,selectOrigin,randomMap,mapFingerprint,xiaodiChooseAction,state:()=>state};state=load()||newGame("classic");';
vm.runInNewContext(src.replace('state=load()||newGame("classic");',hook),
{window,document,localStorage,Math,Set,Number,JSON,TextEncoder,TextDecoder,Uint8Array,btoa,atob,location:{hash:'',origin:'https://test',pathname:'/'},navigator:{},console},{timeout:20000});
const t=window.test;
const first=t.randomMap(4441),other=t.randomMap(5522);
function verify(map){
 assert(t.installMap(map));
 t.resetGame('advanced');t.selectOrigin({x:7,y:12});t.selectOrigin({x:1,y:0});
 t.xiaodiChooseAction();
 assert.equal(captured.side,1);assert.equal(captured.ms,260);
 assert.equal(JSON.stringify(captured.map.map.portals.map(x=>[x.a,x.b])),JSON.stringify(map.portals.map(x=>[x.a,x.b])));
 assert.equal(captured.map.fingerprint,t.mapFingerprint(map));
 assert.equal(JSON.stringify(captured.terrain.PORTALS.map(x=>[x.a,x.b])),JSON.stringify(map.portals.map(x=>[x.a,x.b])));
 assert.equal(captured.terrain.ICE.length,map.ice.length);
 assert.equal(captured.terrain.BOOST.length,map.boost.length);
}
verify(first);verify(other);
assert.notEqual(t.mapFingerprint(first),t.mapFingerprint(other));
console.log('PASS: 2 distinct Map V2 identities and full terrains passed through AI adapter without running policy');
