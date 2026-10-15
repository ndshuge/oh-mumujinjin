"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const source=fs.readFileSync(path.join(__dirname,"../game.js"),"utf8"),N=Number(process.argv[2]||12),seed=Number(process.argv[3]||20261013);
let rng=seed>>>0;const rand=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296),pick=n=>Math.floor(rand()*n);
const els=new Map();function el(id){if(!els.has(id))els.set(id,{hidden:false,value:"",textContent:"",dataset:{},style:{},classList:{toggle(){}},addEventListener(){},appendChild(){},setAttribute(){}});return els.get(id);}
el("board").getContext=()=>new Proxy({},{get:()=>()=>{}});
const document={getElementById:el,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}},localStorage={getItem:()=>null,setItem(){}},window={confirm:()=>true,setTimeout:()=>0};
const needle='state=load()||newGame("classic");';
if(!source.includes(needle))throw Error("Engine entry changed");
const expose='window.lab={cleanMap,hellCandidates,hellApply,hellEvaluate,hellWallAllowed,movementOptions,portal,computerDistance,terrain:{CAMPS,PORTALS,ICE,BOOST},setRocks:r=>{ROCKS=r},getRocks:()=>ROCKS};'+needle;
vm.runInNewContext(source.replace(needle,expose),{window,document,localStorage,Set,Math,JSON,Number,Uint8Array,TextEncoder,TextDecoder,atob,btoa,console,location:{hash:""}});
const engine=window.lab,excluded=new Set();
for(const list of engine.terrain.CAMPS)for(const p of list)excluded.add(p.x+","+p.y);
for(const p of [...engine.terrain.ICE,...engine.terrain.BOOST])excluded.add(p.x+","+p.y);
for(const gate of engine.terrain.PORTALS)for(const p of [gate.a,gate.b])excluded.add(p.x+","+p.y);
const spaces=[];for(let y=0;y<13;y++)for(let x=0;x<9;x++)if(!excluded.has(x+","+y))spaces.push({x,y});
const defaultRocks=engine.getRocks().map(p=>({...p}));
function mapGen(n){
 for(let attempt=0;attempt<80;attempt++){
  const arr=spaces.slice();
  for(let i=arr.length-1;i>0;i--){const j=pick(i+1);[arr[i],arr[j]]=[arr[j],arr[i]];}
  const m=engine.cleanMap({version:1,name:"map-"+n,rocks:n===0?defaultRocks:arr.slice(0,pick(18))});
  if(m)return m;
 }
 throw Error("No valid map "+n);
}
const dist=(s,i)=>engine.computerDistance(s.players[i],engine.terrain.CAMPS[1-i],s.walls,s.dirs[i]);
function score(s,i){const a=dist(s,i),b=dist(s,1-i);return (Number.isFinite(b)?b:1000)-(Number.isFinite(a)?a:1000)+.08*(s.left[i]-s.left[1-i]);}
function notation(a){return a.wall?["W",a.wall.o,a.wall.x,a.wall.y].join(":"):["M",a.p.x,a.p.y,Number(!!a.warp)].join(":");}
function choose(s,i,method,seen){
 const list=engine.hellCandidates(s,i);
 if(!list.length)return null;
 if(method==="random")return list[pick(list.length)];
 const before=dist(s,i),opponentBefore=dist(s,1-i);
 const ranked=list.map(a=>{
   const next=engine.hellApply(s,i,a),self=dist(next,i),opponent=dist(next,1-i);
   const progress=before-self,blocking=opponent-opponentBefore;
   const repeats=seen.get(JSON.stringify({players:next.players,dirs:next.dirs,walls:next.walls,left:next.left,next:1-i}))||0;
   // A wall is only worthwhile if it lengthens the opponent's path more
   // than our own. Favor reaching the target and avoid stale positions.
   const q=(a.wall?1.6*blocking+0.3*progress-1.25:4*progress+0.5*blocking+0.3)
       +score(next,i)*0.12-8*repeats+(a.wall?0:0.02);
   return {a,s:next,q};
 }).sort((a,b)=>b.q-a.q);
 if(method==="greedy")return ranked[0].a;
 let best=ranked[0].a,quality=-Infinity;
 for(const item of ranked.slice(0,5)){
   const replies=engine.hellCandidates(item.s,1-i);
   let worst=Infinity;
   // Search the most promising opponent replies rather than rewarding
   // an unrelated globally high static score.
   for(const reply of replies){
     const next=engine.hellApply(item.s,1-i,reply);
     const opponentAdvance=dist(item.s,1-i)-dist(next,1-i);
     const stop=dist(next,i)-dist(item.s,i);
     const harm=4*opponentAdvance+1.5*stop;
     worst=Math.min(worst,item.q-harm);
   }
   const q=.7*(Number.isFinite(worst)?worst:item.q)+.3*item.q;
   if(q>quality){quality=q;best=item.a;}
 }
 return best;
}
module.exports={engine,mapGen,choose,score,notation,rand,pick,seed};
if(require.main===module){
const folder=path.join(__dirname,"output");fs.mkdirSync(folder,{recursive:true});
const lines=[],report={seed,games:N,train:0,heldOut:0,wins:[0,0],draws:0,repetitions:0,outcomes:{goal:0,"no-actions":0,repetition:0,"ply-cap":0},agentResults:{search:{wins:0,losses:0,draws:0},greedy:{wins:0,losses:0,draws:0}},heldOutResults:{wins:[0,0],draws:0}};
const start=Date.now();
for(let n=0;n<N;n++){
 const map=mapGen(n);engine.setRocks(map.rocks);
 let s={players:[engine.terrain.CAMPS[0][1],engine.terrain.CAMPS[1][1]].map(p=>({...p})),dirs:[null,null],walls:[],left:[5,5]};
 const agents=n%2?["greedy","search"]:["search","greedy"],moves=[],split=n%4===0?"heldOut":"train";
 let winner=null,ending="ply-cap",positions=new Map();
 for(let ply=0;ply<120;ply++){
  const player=ply%2,action=choose(s,player,agents[player],positions);
  if(!action){winner=1-player;ending="no-actions";break;}
  moves.push({ply:ply+1,side:player,notation:notation(action),action});
  s=engine.hellApply(s,player,action);
  const hash=JSON.stringify({players:s.players,dirs:s.dirs,walls:s.walls,left:s.left,next:1-player});
  positions.set(hash,(positions.get(hash)||0)+1);
  if(positions.get(hash)>=3){ending="repetition";break;}
  if(engine.terrain.CAMPS[1-player].some(p=>p.x===s.players[player].x&&p.y===s.players[player].y)){winner=player;ending="goal";break;}
 }
 report[split]++;if(winner===null)report.draws++;else{report.wins[winner]++;}
 if(ending==="repetition")report.repetitions++;
 report.outcomes[ending]++;
 if(split==="heldOut"){if(winner===null)report.heldOutResults.draws++;else report.heldOutResults.wins[winner]++;}
 for(const agent of ["search","greedy"]){
   if(winner===null)report.agentResults[agent].draws++;
   else if(agents[winner]===agent)report.agentResults[agent].wins++;
   else report.agentResults[agent].losses++;
 }
 lines.push(JSON.stringify({seed,map,split,agents,moves,winner,ending}));
 console.log("game",n,split,"rocks",map.rocks.length,"plies",moves.length,"winner",winner,"ending",ending);
}
report.elapsedMs=Date.now()-start;
fs.writeFileSync(path.join(folder,"games-"+seed+".jsonl"),lines.join("\n")+"\n");
fs.writeFileSync(path.join(folder,"report-"+seed+".json"),JSON.stringify(report,null,2));
console.log("REPORT",JSON.stringify(report));

}
