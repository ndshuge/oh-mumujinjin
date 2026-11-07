'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const engine={};
vm.runInNewContext(fs.readFileSync(path.join(root,'xiaoke-ai-engine.js'),'utf8'),{
 self:engine,Date,Math,Set,Map,JSON,Number,Uint32Array,Int32Array,Float64Array,Array,console
});
function harness(){
 const elements=new Map(),timers=[],store={};let aiReplies=0;
 function elem(id){
  if(!elements.has(id))elements.set(id,{id,hidden:false,style:{},dataset:{},textContent:'',value:'',
    classList:{toggle(){},add(){},remove(){}},addEventListener(){},setAttribute(){},appendChild(){},
    getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});
  return elements.get(id);
 }
 elem('board').getContext=()=>new Proxy({},{get:()=>()=>{}});
 const document={getElementById:elem,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
 const window={confirm:()=>true,setTimeout:fn=>(timers.push(fn),timers.length)};
 window.MMJJXiaokeAI={
  choose:({state,budgetMs})=>{
   aiReplies++;return Promise.resolve(engine.MMJJXiaokeEngine.decide({state,budgetMs:Math.min(budgetMs,180)}));
  }
 };
 const localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v};
 const script=fs.readFileSync(path.join(root,'game.js'),'utf8');
 const anchor='var loadedAtBoot=load();state=load()||newGame("classic");';
 assert.ok(script.includes(anchor));
 const hook='window.testAPI={get:()=>state,choosePortal,decideRpsSide,selectOrigin,playerMove,availableMoves,resetGame,cpuSide};';
 const ctx={window,document,localStorage,Set,Math,Number,Date,JSON,Uint8Array,TextEncoder,TextDecoder,
   btoa,atob,navigator:{},location:{origin:'https://test.local',pathname:'/',hash:''},console};
 vm.runInNewContext(script.replace(anchor,hook+anchor),ctx,{timeout:15000});
 return {window,timers,aiReplies:()=>aiReplies,async runTimer(){const fn=timers.shift();assert.ok(fn,'missing scheduled CPU turn');fn();await new Promise(setImmediate);}};
}
async function play(mode){
 const t=harness(),api=t.window.testAPI;
 if(mode==='advanced')api.resetGame('advanced');
 assert.equal(api.get().phase,'rps','XiaoKe should start with RPS');
 api.get().rps.winner='human';api.decideRpsSide('first');
 assert.equal(api.get().phase,'pick-attack');
 api.selectOrigin({x:7,y:12});
 assert.equal(api.get().phase,'pick-defend');
 await t.runTimer();
 assert.equal(api.get().phase,'play');
 assert.equal(api.cpuSide(),1);
 assert.equal(api.get().turn,0);
 const moves=api.availableMoves();
 assert.ok(moves.length);
 api.playerMove(moves[0]);
 if(api.get().pending)api.choosePortal(false);
 assert.equal(api.get().turn,1);
 await t.runTimer();
 await new Promise(setImmediate);
 assert.ok(t.aiReplies()>0,'real C policy should have searched');
 assert.equal(api.get().moves,2,'the XiaoKe model should play an actual legal move');
 assert.equal(api.get().turn,0,'control returns to human');
 assert.equal(api.get().phase,'play');
}
test('Classic XiaoKe: RPS -> both camps -> human move -> genuine C-e2rc response',()=>play('classic'));
test('Advanced XiaoKe: RPS -> both camps -> human move -> genuine C-f5 response',()=>play('advanced'));
