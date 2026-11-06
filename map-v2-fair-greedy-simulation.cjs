// Move-level agent smoke: complete games through the actual human game action handlers.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('game.js','utf8'),mem={};
function el(id){
 if(!el.nodes.has(id))el.nodes.set(id,{id,hidden:false,textContent:'',value:'',style:{},dataset:{},disabled:false,
  classList:{toggle(){},add(){}},addEventListener(){},setAttribute(){},appendChild(){},getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});
 return el.nodes.get(id);
}el.nodes=new Map();
el('board').getContext=()=>new Proxy({},{get:(o,k)=>o[k]||(()=>{})});
const document={getElementById:el,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
const localStorage={getItem:k=>mem[k]||null,setItem:(k,v)=>mem[k]=v};
const window={setTimeout:()=>{},confirm:()=>true};
const hook='window.test={state:()=>state,resetGame,installMap,selectOrigin,availableMoves,playerMove,choosePortal,computerDistance,portal,randomMap,generateBalancedMap};state=load()||newGame("classic");';
assert(source.includes('state=load()||newGame("classic");'));
vm.runInNewContext(source.replace('state=load()||newGame("classic");',hook),
  {window,document,localStorage,Set,Number,Math,JSON,TextEncoder,TextDecoder,Uint8Array,btoa,atob,navigator:{},location:{origin:'https://test',pathname:'/',hash:''},console}, {timeout:20000});
const t=window.test,GOALS=[[{x:0,y:0},{x:1,y:0},{x:2,y:0}],[{x:6,y:12},{x:7,y:12},{x:8,y:12}]];
let all={games:0,wins:0,bySide:[0,0],draws:0,teleports:0,boosts:0,iceArrivals:0,turns:0,limitGames:0};
for(let k=0;k<60;k++)for(const variant of ['classic','advanced']){
 const m=t.generateBalancedMap((37111+k*131)>>>0),state=t.state();
 assert(t.installMap(m));t.state().playMode="local";t.resetGame(variant);
 t.selectOrigin({x:7,y:12});t.selectOrigin({x:1,y:0});
 assert.equal(t.state().phase,'play');
 let turns=0;
 while(t.state().phase==='play'&&turns++<130){
  let st=t.state(),side=st.turn,goal=GOALS[side],options=t.availableMoves();
  assert(options.length>0,JSON.stringify({reason:'No legal move',seed:(37111+k*131)>>>0,variant,turn:turns,side,at:st.players[side],rocks:m.rocks,ice:m.ice}));
  const evalMove=move=>{
    let cost=t.computerDistance(move.p,goal,st.walls,move.nextLock);
    const gate=t.portal(move.p);if(gate){const dst=(gate.a.x===move.p.x&&gate.a.y===move.p.y)?gate.b:gate.a;
      cost=Math.min(cost,t.computerDistance(dst,goal,st.walls,null));}
    return cost+((move.steps===2)?-.01:0);
  };
  options.sort((a,b)=>evalMove(a)-evalMove(b));const move=options[0];
  if(move.steps===2)all.boosts++;
  if(variant==='advanced'&&m.ice.some(p=>p.x===move.p.x&&p.y===move.p.y))all.iceArrivals++;
  t.playerMove(move);
  if(st.pending){
    const gate=m.portals[st.pending.index],dest=(gate.a.x===st.players[st.turn].x&&gate.a.y===st.players[st.turn].y)?gate.b:gate.a;
    const warp=t.computerDistance(dest,goal,st.walls,null)<t.computerDistance(st.players[st.turn],goal,st.walls,st.slideDir[st.turn]);
    if(warp)all.teleports++;
    t.choosePortal(warp);
  }
 }
 assert(['finished','play'].includes(t.state().phase));
 all.games++;all.turns+=t.state().moves;
 if(t.state().phase==='finished'){if(t.state().winner===null)all.draws++;else {all.wins++;all.bySide[t.state().winner]++;}}
 else all.limitGames++;
}
console.log('FAIR_GREEDY_BASELINE (same move-only agent both sides, no walls): '+JSON.stringify(all));
