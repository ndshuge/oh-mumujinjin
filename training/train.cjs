"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const source=fs.readFileSync(path.join(__dirname,"../game.js"),"utf8"),N=Number(process.argv[2]||12),seed=Number(process.argv[3]||20261013);
let rng=seed>>>0;const rand=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296),pick=n=>Math.floor(rand()*n);
const els=new Map();function el(id){if(!els.has(id))els.set(id,{hidden:false,value:"",textContent:"",dataset:{},style:{},classList:{toggle(){}},addEventListener(){},appendChild(){},setAttribute(){}});return els.get(id);}
el("board").getContext=()=>new Proxy({},{get:()=>()=>{}});
const document={getElementById:el,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}},localStorage={getItem:()=>null,setItem(){}},window={confirm:()=>true,setTimeout:()=>0};
const needle='state=load()||newGame("classic");';
if(!source.includes(needle))throw Error("Engine entry changed");
const expose='window.lab={cleanMap,hellCandidates,hellApply,computerDistance,terrain:{CAMPS,PORTALS,ICE,BOOST},setRocks:r=>{ROCKS=r},getRocks:()=>ROCKS};'+needle;
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
function choose(s,i,method){
 const list=engine.hellCandidates(s,i);
 if(!list.length)return null;
 if(method==="random")return list[pick(list.length)];
 const ranked=list.map(a=>({a,s:engine.hellApply(s,i,a)})).sort((a,b)=>score(b.s,i)-score(a.s,i));
 if(method==="greedy")return ranked[0].a;
 let best=ranked[0].a,quality=-Infinity;
 for(const item of ranked.slice(0,5)){
  const replies=engine.hellCandidates(item.s,1-i);
  let worst=score(item.s,i);
  for(const reply of replies)worst=Math.min(worst,score(engine.hellApply(item.s,1-i,reply),i));
  const q=.8*worst+.2*score(item.s,i);
  if(q>quality){quality=q;best=item.a;}
 }
 return best;
}
const folder=path.join(__dirname,"output");fs.mkdirSync(folder,{recursive:true});
const lines=[],report={seed,games:N,train:0,heldOut:0,wins:[0,0],draws:0,repetitions:0};
const start=Date.now();
for(let n=0;n<N;n++){
 const map=mapGen(n);engine.setRocks(map.rocks);
 let s={players:[engine.terrain.CAMPS[0][1],engine.terrain.CAMPS[1][1]].map(p=>({...p})),dirs:[null,null],walls:[],left:[5,5]};
 const agents=n%2?["greedy","search"]:["search","greedy"],moves=[],split=n%4===0?"heldOut":"train";
 let winner=null,ending="ply-cap",positions=new Map();
 for(let ply=0;ply<50;ply++){
  const player=ply%2,action=choose(s,player,agents[player]);
  if(!action){winner=1-player;break;}
  moves.push({ply:ply+1,side:player,notation:notation(action),action});
  s=engine.hellApply(s,player,action);
  const hash=JSON.stringify({players:s.players,dirs:s.dirs,walls:s.walls,left:s.left,next:1-player});
  positions.set(hash,(positions.get(hash)||0)+1);
  if(positions.get(hash)>=3){ending="repetition";break;}
  if(engine.terrain.CAMPS[1-player].some(p=>p.x===s.players[player].x&&p.y===s.players[player].y)){winner=player;break;}
 }
 report[split]++;if(winner===null)report.draws++;else{report.wins[winner]++;ending="goal";}
 if(ending==="repetition")report.repetitions++;
 lines.push(JSON.stringify({seed,map,split,agents,moves,winner,ending}));
 console.log("game",n,split,"rocks",map.rocks.length,"plies",moves.length,"winner",winner,"ending",ending);
}
report.elapsedMs=Date.now()-start;
fs.writeFileSync(path.join(folder,"games-"+seed+".jsonl"),lines.join("\n")+"\n");
fs.writeFileSync(path.join(folder,"report-"+seed+".json"),JSON.stringify(report,null,2));
console.log("REPORT",JSON.stringify(report));
