const fs=require('fs'),vm=require('vm'),assert=require('assert'),mem={},events={},els=new Map();
function el(id){if(!els.has(id))els.set(id,{id,value:'',hidden:false,textContent:'',style:{},dataset:{},classList:{toggle(){},add(){}},addEventListener(k,f){events[id+':'+k]=f},appendChild(){},setAttribute(){},getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});return els.get(id)}
el('board').getContext=()=>new Proxy({},{get:()=>()=>{}});
const document={getElementById:el,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
const localStorage={getItem:k=>mem[k]||null,setItem:(k,v)=>mem[k]=v};
const window={confirm:()=>true,setTimeout:()=>{},crypto:{getRandomValues(a){a[0]=0;return a;}}};
const src=fs.readFileSync('game.js','utf8'),probe='window.rpsTest={state:()=>state,beginRps,playRps,decideRpsSide,selectOrigin,computerTakeTurn,resetGame};state=load()||newGame("classic");';
vm.runInNewContext(src.replace('state=load()||newGame("classic");',probe),{window,document,localStorage,Set,Math,Number,Date,JSON,Uint8Array,TextEncoder,TextDecoder,btoa,atob,navigator:{},location:{hash:'',pathname:'/',origin:'http://test'},console},{timeout:12000});
const t=window.rpsTest;
t.state().playMode='cpu';t.state().aiLevel='zhongdi';t.beginRps();assert.equal(t.state().phase,'rps');
t.playRps('rock');assert.equal(t.state().rps.winner,'human');
t.decideRpsSide('second');assert.equal(t.state().humanSide,1);
assert.equal(t.state().phase,'pick-attack');
assert.equal(t.state().turn,0);
assert.equal(t.state().playMode,'cpu');
assert.equal(t.state().rps.winner,'human');
t.resetGame('advanced');assert.equal(t.state().phase,'rps');
console.log('RPS flow and AI-gold ownership PASS');
