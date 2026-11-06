'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('game.js','utf8'),nodes=new Map(),store={};
const el=id=>{
 if(!nodes.has(id))nodes.set(id,{id,hidden:false,style:{},dataset:{},textContent:'',value:'',
  classList:{toggle(){},add(){}},addEventListener(){},setAttribute(){},appendChild(){},
  getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});
 return nodes.get(id);
};
el('board').getContext=()=>new Proxy({},{get:()=>()=>{}});
const document={getElementById:el,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
const window={confirm:()=>true,setTimeout:()=>{}};
const localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v};
const hook='window.integration={state:()=>state,mode:()=>mapMode,get:getMap,resetGame,defaultMap,installMap,mapFingerprint};';
if(!src.includes('state=load()||newGame("classic");'))throw Error('entry point moved');
vm.runInNewContext(src.replace('state=load()||newGame("classic");',hook+'state=load()||newGame("classic");'),{
 window,document,localStorage,Set,Math,Number,Date,JSON,Uint8Array,TextEncoder,TextDecoder,btoa,atob,
 navigator:{},location:{origin:'http://test',pathname:'/',hash:''},console
},{timeout:20000});
const t=window.integration,first=t.get();
assert.equal(t.mode(),'random-battle');
assert.equal(first.generatorVersion,'mapgen-v2-r3');
assert(first.rocks.length>0 && first.portals.length>0 && first.ice.length>0 && first.boost.length>0);
assert.notEqual(t.mapFingerprint(first),t.mapFingerprint(t.defaultMap()));
assert.equal(t.state().phase,'rps','XiaoKe is playable and begins with fair rock-paper-scissors');
t.state().aiLevel='zhongdi';t.resetGame('classic');
assert.equal(t.state().phase,'rps','Supported CPU game starts with fair rock-paper-scissors');
const initial=t.mapFingerprint(first);
t.resetGame('advanced');
assert.equal(t.get().generatorVersion,'mapgen-v2-r3');
assert.equal(t.state().phase,'rps');
assert.notEqual(t.mapFingerprint(t.get()),initial,'New random match changes layout');
assert(t.installMap(t.defaultMap(),'default'));
const staticFp=t.mapFingerprint(t.get());
t.resetGame('classic');
assert.equal(t.mapFingerprint(t.get()),staticFp,'Explicit classic layout persists on restart');
console.log('PASS: online first load balanced V2, new match reshuffles all terrain, fixed map persists, RPS survives');
