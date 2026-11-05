'use strict';
// Diagnostic bridge: read-only legacy agent policies on the authoritative Map V2 rules.
// No AI weights, research branches, or original training runners are changed.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const league=require('./training/league/agent.cjs');
const docEls=new Map();function el(id){
 if(!docEls.has(id))docEls.set(id,{hidden:false,value:'',textContent:'',style:{},dataset:{},disabled:false,
  classList:{add(){},toggle(){}},addEventListener(){},setAttribute(){},appendChild(){},getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});
 return docEls.get(id);
}
el('board').getContext=()=>new Proxy({},{get:()=>()=>{}});
const document={getElementById:el,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
const localStorage={getItem:()=>null,setItem(){}},window={setTimeout:()=>{},confirm:()=>true};
const ctx={window,document,localStorage,Set,Number,Math,JSON,Date,Uint8Array,TextEncoder,TextDecoder,Float32Array,Float64Array,
 btoa,atob,navigator:{},location:{origin:'http://local',pathname:'/',hash:''},console};
const game=fs.readFileSync('game.js','utf8');
const hook='window.lab={generateBalancedMap,randomMap,mapFingerprint,validateMap,installMap,resetGame,hellCandidates,hellApply,hellEvaluate,hellWallAllowed,movementOptions,portal,computerDistance,CAMPS,liveTerrain:()=>({CAMPS,PORTALS,ICE,BOOST})};';
const entry='state=load()||newGame("classic");';
assert(game.includes(entry));vm.runInNewContext(game.replace(entry,hook+entry),ctx,{timeout:25000});
vm.runInNewContext(fs.readFileSync('xiaodi-engine.js','utf8'),ctx,{timeout:25000});
const lab=window.lab;
const engine={hellCandidates:lab.hellCandidates,hellApply:lab.hellApply,
 hellEvaluate:lab.hellEvaluate,hellWallAllowed:lab.hellWallAllowed,
 movementOptions:lab.movementOptions,portal:lab.portal,computerDistance:lab.computerDistance};
Object.defineProperty(engine,'terrain',{enumerable:true,get:()=>lab.liveTerrain()});
const same=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
function legal(s,side,a){
 if(!a)return false;
 if(a.wall)return engine.hellWallAllowed(s,a.wall,side);
 return engine.movementOptions(s.players[side],s.dirs[side],s.walls).some(m=>{
  if(!a.move||!same(a.move.p,m.p)||!same(a.move.d,m.d)||a.move.steps!==m.steps)return false;
  if(m.steps===2&&!same(a.move.firstDir,m.firstDir))return false;
  const g=engine.portal(m.p),target=a.warp&&g?(same(g.a,m.p)?g.b:g.a):m.p;
  const lock=a.warp?null:m.nextLock;
  return (!a.warp||!!g)&&same(target,a.p)&&((lock===null&&a.lock==null)||same(lock,a.lock));
 });
}
const choices={
 search:{id:'v2-search-smoke',family:'search',engine:'v3',depth:2},
 puct:{id:'v2-puct-smoke',family:'puct',sims:8,c:1.3,priorMix:0,valueMix:0,models:[]},
 neural:{id:'v2-neural-smoke',family:'puct',sims:8,c:1.3,priorMix:.25,valueMix:.1,models:[{name:'n64',weight:1}]}
};
choices.g5={id:'g5-weight-compat',family:'puct',sims:8,c:1.3,priorMix:.25,valueMix:.1,models:[{name:'g5fine',weight:1}]};
const names=['search','puct','neural','g5','xiaodi'];
const counts={},failures=[];
function move(name,s,side,map){
 if(name==='xiaodi')return window.MumuXiaodi.choose(engine,s,side,{rocks:map.rocks,map,fingerprint:lab.mapFingerprint(map)},70);
 const result=league.move(engine,s,side,{rocks:map.rocks,map,terrain:engine.terrain},choices[name],70,{deterministic:true,maxNodes:150});
 return result.action;
}
// Paired side-swap arena. This is compatibility QA, not AI evaluation or promotion.
const mapCount=Number(process.argv[2]||3),maxPly=Number(process.argv[3]||76);
assert(mapCount>=1&&mapCount<=15&&maxPly>=10&&maxPly<=150);
const goals=side=>engine.terrain.CAMPS[1-side];
const equal=(a,b)=>a&&b&&a.x===b.x&&a.y===b.y;
const summary={maps:mapCount,modes:['classic','advanced'],matches:[],invalid:0,bySide:[0,0],draws:0,terminal:0,
  turnCap:0,repetition:0,agentWins:{search:0,neural:0,xiaodi:0,g5:0},totalTurns:0};
for(let i=0;i<mapCount;i++)for(const variant of ['classic','advanced']){
 const seed=(26660+i*1729)>>>0;
 const map=lab.generateBalancedMap(seed);assert(lab.installMap(map));lab.resetGame(variant);
 const matchups=[['search','g5'],['g5','search']];
 for(const namesOfPlayers of matchups){
  let state={players:lab.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]},
   winner=null,end='turn-cap',plies=0,repeat=new Map(),portals=0,boosts=0,iceArrivals=0;
  for(let ply=0;ply<maxPly;ply++){
    const side=ply%2,who=namesOfPlayers[side],moves=engine.movementOptions(state.players[side],state.dirs[side],state.walls);
    if(!moves.length){winner=1-side;end='no-actions';break;}
    let action;
    try{action=move(who,state,side,map);}catch(e){throw Error('AI_CRASH '+who+' '+variant+' '+seed+' ply'+ply+' '+e.message);}
    if(!legal(state,side,action)){
      summary.invalid++;throw Error('AI_ILLEGAL '+who+' '+variant+' '+seed+' ply'+ply+' '+JSON.stringify(action));
    }
    if(action.warp)portals++;
    if(action.move&&action.move.steps===2)boosts++;
    if(action.move&&map.ice.some(p=>equal(p,action.p)))iceArrivals++;
    state=engine.hellApply(state,side,action);plies++;
    if(goals(side).some(p=>equal(p,state.players[side]))){winner=side;end='goal';break;}
    if(engine.movementOptions(state.players[1-side],state.dirs[1-side],state.walls).length===0){
      winner=side;end='no-actions';break;
    }
    const key=JSON.stringify([1-side,state.players,state.dirs,state.left,state.walls.map(w=>w.o+','+w.x+','+w.y).sort()]);
    const count=(repeat.get(key)||0)+1;repeat.set(key,count);
    if(count===3){end='repetition';break;}
  }
  const row={seed,variant,seat:namesOfPlayers,winnerSide:winner,winnerAgent:winner===null?null:namesOfPlayers[winner],end,plies,portals,boosts,iceArrivals};
  summary.matches.push(row);summary.totalTurns+=plies;
  if(winner===null){summary.draws++;if(end==='repetition')summary.repetition++;else summary.turnCap++;}
  else{summary.bySide[winner]++;summary.terminal++;summary.agentWins[namesOfPlayers[winner]]++;}
  if(summary.matches.length%4===0)console.log('V2_AI_ARENA_PROGRESS',summary.matches.length,row.end,row.plies);
 }
}
fs.writeFileSync('docs/MAP_V2_AI_G5_COMPAT_ARENA.json',JSON.stringify(summary,null,2));
console.log('MAP_V2_AI_ARENA_FINAL',JSON.stringify({...summary,matches:undefined}));
assert.equal(summary.invalid,0);
