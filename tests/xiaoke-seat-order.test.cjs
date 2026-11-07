'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),engine={};
vm.runInNewContext(fs.readFileSync(path.join(root,'xiaoke-ai-engine.js'),'utf8'),
 {self:engine,Date,Math,Set,Map,JSON,Number,Uint32Array,Int32Array,Float64Array,Array,console});
function harness(seedStore={}){
 const els=new Map(),timers=[],store={...seedStore},chosen=[];
 const elem=id=>{
   if(!els.has(id))els.set(id,{id,hidden:false,style:{},dataset:{},textContent:'',value:'',
     classList:{toggle(){},add(){},remove(){}},addEventListener(){},setAttribute(){},appendChild(){},
     getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});
   return els.get(id);
 };
 elem('board').getContext=()=>new Proxy({},{get:()=>()=>{}});
 const document={getElementById:elem,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
 const window={confirm:()=>true,setTimeout:fn=>(timers.push(fn),timers.length)};
 window.MMJJXiaokeAI={choose:({state,budgetMs})=>{
   chosen.push({phase:state.phase,variant:state.variant});
   return Promise.resolve(engine.MMJJXiaokeEngine.decide({state,budgetMs:Math.min(budgetMs,170)}));
 }};
 const localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v};
 const raw=fs.readFileSync(path.join(root,'game.js'),'utf8');
 const anchor='var loadedAtBoot=load();state=load()||newGame("classic");';
 const expose='window.testAPI={get:()=>state,decideRpsSide,selectOrigin,playerMove,availableMoves,choosePortal,resetGame,cpuSide,undo};';
 assert.ok(raw.includes(anchor),'test injection anchor changed');
 vm.runInNewContext(raw.replace(anchor,expose+anchor),{
   window,document,localStorage,Set,Math,Number,Date,JSON,Uint8Array,TextEncoder,TextDecoder,
   btoa,atob,navigator:{},location:{origin:'https://local.invalid',pathname:'/',hash:''},console
 },{timeout:18000});
 return {api:window.testAPI,store,window,chosen,async tick(){assert.ok(timers.length,'missing scheduled turn');timers.shift()();await new Promise(setImmediate)}};
}
for(const mode of ['classic','advanced']){
 test(mode+' CPU wins: XiaoKe selects top-left then moves first, human stays bottom-right',async()=>{
   const t=harness(),a=t.api;
   if(mode==='advanced')a.resetGame('advanced');
   assert.equal(a.get().phase,'rps');
   a.get().rps.winner='cpu';a.decideRpsSide('second');
   assert.equal(a.get().humanSide,0);
   assert.equal(a.cpuSide(),1);
   assert.equal(a.get().phase,'pick-defend','CPU should choose its own start first');
   await t.tick();
   assert.deepEqual(Array.from({length:1},()=>a.get().players[1].y),[0]);
   assert.ok([0,1,2].includes(a.get().players[1].x));
   assert.equal(a.get().players[0],null);
   assert.equal(a.get().phase,'pick-attack','human must choose second start');
   a.selectOrigin({x:7,y:12});
   assert.equal(a.get().players[0].x,7);
   assert.equal(a.get().players[0].y,12);
   assert.equal(a.get().phase,'play');
   assert.equal(a.get().turn,1);
   await t.tick();
   assert.equal(a.get().moves,1);
   assert.equal(a.get().turn,0);
   assert.ok(t.chosen.some(v=>v.phase==='pick-defend'));
   assert.ok(t.chosen.some(v=>v.phase==='play'));
 });
 test(mode+' human wins and chooses first: positions still fixed, user acts first',async()=>{
   const t=harness(),a=t.api;
   if(mode==='advanced')a.resetGame('advanced');
   a.get().rps.winner='human';a.decideRpsSide('first');
   assert.equal(a.get().humanSide,0);
   assert.equal(a.get().phase,'pick-attack');
   a.selectOrigin({x:6,y:12});
   assert.equal(a.get().phase,'pick-defend');
   await t.tick();
   assert.equal(a.get().players[0].x,6);
   assert.equal(a.get().players[1].y,0);
   assert.equal(a.get().turn,0);
   assert.equal(a.get().phase,'play');
 });
 test(mode+' human wins but chooses second: XiaoKe still chooses its start first',async()=>{
   const t=harness(),a=t.api;
   if(mode==='advanced')a.resetGame('advanced');
   a.get().rps.winner='human';a.decideRpsSide('second');
   assert.equal(a.get().humanSide,0);
   assert.equal(a.get().phase,'pick-defend');
   await t.tick();
   a.selectOrigin({x:8,y:12});
   assert.equal(a.get().players[0].x,8);
   assert.equal(a.get().turn,1);
 });
}

test('legacy save with human in wood camp is backed up and restarted into fixed gold layout',()=>{
 const t=harness(),a=t.api;
 a.get().rps.winner='human';a.decideRpsSide('first');
 a.selectOrigin({x:7,y:12});
 const old={...JSON.parse(JSON.stringify(a.get())),humanSide:1,firstTurn:0};
 old.players[1]={x:1,y:0};old.phase='play';old.turn=0;
 const map=t.window.MumuMapV2.get(),fp=t.window.MumuMapV2.fingerprint(map);
 const original=JSON.stringify({version:2,state:old,map,mapFingerprint:fp});
 const fresh=harness({'mumujinjin-game-v1':original,'mumujinjin-xiaoke-default-v1':'1'});
 assert.equal(fresh.api.get().humanSide,0);
 assert.equal(fresh.api.get().phase,'rps');
 assert.equal(fresh.store['mumujinjin-pre-fixed-gold-20261106'],original);
 assert.equal(fresh.window.MumuMapV2.fingerprint(fresh.window.MumuMapV2.get()),fp);
});
test('do not undo the computer opening before human makes any move',async()=>{
 const t=harness(),a=t.api;
 a.get().rps.winner='cpu';a.decideRpsSide('second');
 await t.tick();a.selectOrigin({x:7,y:12});await t.tick();
 assert.equal(a.get().moves,1);
 a.undo();
 assert.equal(a.get().moves,1,'computer first move should remain until the player moves');
 assert.equal(a.get().turn,0);
});
