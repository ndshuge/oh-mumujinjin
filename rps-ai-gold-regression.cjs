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
assert.equal(t.state().humanSide,0,'Human stays gold/bottom-right');
assert.equal(t.state().firstTurn,1);
drain();
assert.equal(t.state().phase,'pick-attack');
assert(t.state().players[1],'Computer selected wood from the top-left camp');
assert.equal(t.state().players[1].y,0);
t.selectOrigin({x:7,y:12});drain();
assert.equal(t.state().phase,'play');
assert.equal(t.state().turn,0,'Computer moves first, then human gold');
assert.equal(t.state().moves,1,'Computer must make the first move');
const move=t.availableMoves()[0];assert(move);
t.playerMove(move);if(t.state().pending)t.choosePortal(false);
drain();
assert.equal(t.state().moves,3,'Computer makes its next move');
assert.equal(t.state().turn,0,'Return to human gold');
console.log('PASS: computer starts as top-left wood, then human moves from right-bottom gold');
