// Functional CPU opponent regression on the actual game engine.
// Node.js: node ai-regression.cjs
const fs=require("fs"),vm=require("vm"),assert=require("assert");
const source=fs.readFileSync("game.js","utf8");
const all=new Map(),timers=[];
function el(id){
 if(!all.has(id))all.set(id,{hidden:false,style:{},textContent:"",dataset:{},disabled:false,classList:{toggle(){}},addEventListener(){},getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});
 return all.get(id);
}
const ctx=new Proxy({},{get(t,k){return k in t?t[k]:(()=>{});},set(t,k,v){t[k]=v;return true;}});
el("board").getContext=()=>ctx;
const document={getElementById:el,querySelectorAll:()=>[],addEventListener(){}},data={};
const window={confirm:()=>true,setTimeout:(fn)=>{timers.push(fn);return timers.length;}};
const localStorage={getItem(k){return data[k]||null;},setItem(k,v){data[k]=v;}};
const inject='window.test={state:()=>state,setAILevel,setPlayMode,selectOrigin,availableMoves,playerMove,choosePortal,undo,resetGame,computerDistance,computerMoveChoice,computerWallChoice,validWall};state=load()||newGame("classic");';
assert(source.includes('state=load()||newGame("classic");'),"entry hook changed");
vm.runInNewContext(source.replace('state=load()||newGame("classic");',inject),{window,document,localStorage,Set,Math,JSON,Number,console},{filename:"game.js"});
const bundle=fs.readFileSync("xiaodi-engine.js","utf8"); vm.runInNewContext(bundle,{window,console,Date,Math,Map,Set,Float32Array,Float64Array}); const t=window.test;
function drain(max=20){
 let n=0;
 while(timers.length){assert(++n<=max,"AI scheduled too many callbacks");timers.shift()();}
}
const pos=(x,y)=>({x,y});
for(const level of ["xiaodi"]){
 t.resetGame("classic");
 t.setAILevel(level);
 assert.strictEqual(t.state().playMode,"cpu");
 assert.strictEqual(t.state().aiLevel,level);
 t.selectOrigin(pos(7,12));
 drain();
 assert.strictEqual(t.state().phase,"play");
 assert.strictEqual(t.state().turn,0,"Computer spawn should finish then human moves");
 assert(t.state().players[1],"Computer must choose a wood spawn");
 const move=t.availableMoves().find(m=>m.p.x===7&&m.p.y===11);
 assert(move,"Human move must be legal");
 t.playerMove(move);
 drain();
 assert.strictEqual(t.state().turn,0,level+" AI must finish its turn");
 assert.strictEqual(t.state().moves,2,level+" AI should perform one full turn");
 assert(t.state().players[1],"AI needs a board position");
 t.undo();
 drain();
 assert.strictEqual(t.state().turn,0,level+" undo should return to human turn");
 assert.strictEqual(t.state().moves,0,level+" undo should reverse human and AI turns");
}
t.setPlayMode("local");
assert.strictEqual(t.state().playMode,"local");
t.selectOrigin(pos(6,12));drain();
assert.strictEqual(t.state().phase,"pick-defend","Local two-player mode still needs manual wood spawn");
let turns=0;
for(const variant of ["classic","advanced"]){
 for(const level of ["xiaodi"]){
  t.resetGame(variant);t.setAILevel(level);t.selectOrigin(pos(7,12));drain();
  for(let i=0;i<10 && t.state().phase==="play";i++){
   assert.strictEqual(t.state().turn,0);
   const legal=t.availableMoves();
   assert(legal.length>0,variant+" / "+level+" must offer a human move");
   // Move the human along one available legal edge, and resolve optional portal.
   t.playerMove(legal[i%legal.length]);
   if(t.state().pending)t.choosePortal(true);
   drain(10);
   turns++;
   assert(!t.state().pending,"Computer should resolve its own portal prompt");
   assert(t.state().turn===0||t.state().phase==="finished","Computer should finish its move");
  }
 }
}
console.log("PASS: CPU easy/normal/hard automatic spawn, turn, undo, local-mode isolation; "+turns+" multi-variant turns");

