const fs=require('fs'),vm=require('vm'),assert=require('assert'),timers=[],els=new Map();
const el=id=>{if(!els.has(id))els.set(id,{id,hidden:false,value:'',textContent:'',style:{},dataset:{},disabled:false,classList:{toggle(){},add(){}},addEventListener(){},setAttribute(){},appendChild(){},getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});return els.get(id)};
el('board').getContext=()=>new Proxy({},{get:()=>()=>{}});
const document={getElementById:el,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
const window={confirm:()=>true,setTimeout:fn=>timers.push(fn),crypto:{getRandomValues(a){a[0]=0;return a;}}};
const ctx={window,document,localStorage:{getItem:()=>null,setItem(){}},Set,Math,Date,JSON,Number,Uint32Array,Uint8Array,TextEncoder,TextDecoder,btoa,atob,navigator:{},location:{hash:'',origin:'http://test',pathname:'/'},console};
const source=fs.readFileSync('game.js','utf8'),hook='window.lab={state:()=>state,resetGame,setAILevel,beginRps,playRps,decideRpsSide,selectOrigin,availableMoves,playerMove,choosePortal,computerTakeTurn};';
vm.runInNewContext(source.replace('state=load()||newGame("classic");',hook+'state=load()||newGame("classic");'),ctx,{timeout:25000});
const t=window.lab;
function drain(){let n=0;while(timers.length){assert(++n<25,'timer loop');timers.shift()();}}
t.setAILevel('normal');assert.equal(t.state().phase,'rps');
t.playRps('paper'); // AI uses scissors, wins.
assert.equal(t.state().rps.winner,'cpu');
assert.equal(t.state().humanSide,1);
drain();
assert.equal(t.state().phase,'pick-defend');
assert(t.state().players[0],'AI gold spawn');
t.selectOrigin({x:1,y:0});drain();
assert.equal(t.state().phase,'play');
assert.equal(t.state().turn,1,'AI starts gold, then human wood');
assert.equal(t.state().moves,1,'AI gold should already have made the first move');
const move=t.availableMoves()[0];assert(move);
t.playerMove(move);if(t.state().pending)t.choosePortal(false);
drain();
assert.equal(t.state().moves,3,'AI gold must take its next turn');
assert.equal(t.state().turn,1,'return to human wood turn');
console.log('PASS: AI wins RPS, becomes gold, chooses spawn and executes gold turn');
