"use strict";
const fs=require("fs"),vm=require("vm"),assert=require("assert"),path=require("path");
process.chdir(path.resolve(__dirname,".."));
const elements=new Map(),timers=[],store={};
function el(id){
 if(!elements.has(id))elements.set(id,{id,hidden:false,style:{},textContent:"",dataset:{},disabled:false,classList:{toggle(){},remove(){},add(){}},addEventListener(){},setAttribute(){},appendChild(){},getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});
 return elements.get(id);
}
const ctx=new Proxy({},{get(obj,k){return k in obj?obj[k]:()=>{};},set(obj,k,v){obj[k]=v;return true;}});
el("board").getContext=()=>ctx;
const document={getElementById:el,querySelectorAll:()=>[],addEventListener(){},createElement:tag=>({tagName:tag,value:"",textContent:"",style:{},appendChild(){},addEventListener(){}})};
const win={confirm:()=>true,setTimeout:cb=>(timers.push(cb),timers.length)};
const storage={getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v;}};
const sandbox={window:win,document,localStorage:storage,Set,Map,Math,Number,Uint8Array,Float32Array,Float64Array,Date,JSON,console,TextDecoder,TextEncoder};
vm.runInNewContext(fs.readFileSync("xiaodi-engine.js","utf8"),sandbox,{timeout:30000});
vm.runInNewContext(fs.readFileSync("zhongdi-engine.js","utf8"),sandbox,{timeout:30000});
const src=fs.readFileSync("game.js","utf8");
const needle='state=load()||newGame("classic");';
assert(src.includes(needle));
vm.runInNewContext(src.replace(needle,'window.test={state:()=>state,setAILevel,setPlayMode,selectOrigin,availableMoves,playerMove,choosePortal,resetGame};'+needle),sandbox,{timeout:30000});
const t=win.test;assert.strictEqual(t.state().playMode,"cpu");assert.strictEqual(t.state().aiLevel,"zhongdi");assert.strictEqual(el("aiOpponentNameBadge").textContent,"中迪");assert.strictEqual(el("aiOpponentChatName").textContent,"中迪 · 电脑对手");
let steps=0;function drain(max=20){while(timers.length){assert(++steps<=max,"Turn scheduling loop");timers.shift()();}}
t.selectOrigin({x:7,y:12});drain();
assert.strictEqual(t.state().turn,0);assert.strictEqual(t.state().phase,"play");
const human=t.availableMoves().find(a=>a.p.x===7&&a.p.y===11)||t.availableMoves()[0];assert(human);
t.playerMove(human);drain();
assert.strictEqual(t.state().turn,0,"Zhongdi failed to complete a real CPU turn");
assert.strictEqual(t.state().moves,2,"Zhongdi did not move");
assert.strictEqual(el("aiOpponentNameBadge").textContent,"中迪");
t.setAILevel("xiaodi");assert.strictEqual(t.state().aiLevel,"xiaodi");
assert.strictEqual(el("aiOpponentNameBadge").textContent,"小迪");assert.strictEqual(el("aiOpponentChatName").textContent,"小迪 · 电脑对手");
t.setAILevel("zhongdi");assert.strictEqual(el("aiOpponentNameBadge").textContent,"中迪");
t.setPlayMode("local");assert.strictEqual(el("aiOpponentNameBadge").hidden,true);
console.log("ZHONGDI_UI_REGRESSION_PASS",JSON.stringify({default:"cpu/zhongdi",realCPUTurn:true,changedToXiaodi:true,changedBack:true,localHidesName:true}));
