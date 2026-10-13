"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm"),assert=require("assert");
const source=fs.readFileSync(path.join(__dirname,"../game.js"),"utf8");
const nodes=new Map();
function el(id){if(!nodes.has(id))nodes.set(id,{value:"",hidden:false,style:{},dataset:{},classList:{toggle(){}},addEventListener(){},appendChild(){},setAttribute(){}});return nodes.get(id);}
el("board").getContext=()=>new Proxy({},{get:()=>()=>{}});
const document={getElementById:el,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}},window={confirm:()=>true,setTimeout:()=>0};
const needle='state=load()||newGame("classic");';
vm.runInNewContext(source.replace(needle,'window.engine={hellCandidates,hellApply,cleanMap,terrain:{CAMPS},setMap:m=>{ROCKS=m}};'+needle),{window,document,localStorage:{getItem:()=>null,setItem(){}},location:{hash:""},Set,JSON,Math,Number,Uint8Array,TextEncoder,TextDecoder,atob,btoa});
const e=window.engine;let games=0,turns=0;
function id(a){return a.wall?["W",a.wall.o,a.wall.x,a.wall.y].join(":"):["M",a.p.x,a.p.y,Number(!!a.warp)].join(":");}
for(const filename of process.argv.slice(2)){
 const file=path.join(__dirname,"output",filename);
 for(const line of fs.readFileSync(file,"utf8").trim().split("\n")){
  const game=JSON.parse(line),valid=e.cleanMap(game.map);
  assert(valid,"invalid map");e.setMap(valid.rocks);
  let s={players:[e.terrain.CAMPS[0][1],e.terrain.CAMPS[1][1]].map(p=>({...p})),dirs:[null,null],walls:[],left:[5,5]};
  for(const move of game.moves){
   const legal=e.hellCandidates(s,move.side);
   const found=legal.find(a=>id(a)===move.notation);
   assert(found,"illegal action "+game.map.name+" turn "+move.ply+" "+move.notation);
   s=e.hellApply(s,move.side,found);turns++;
  }
  if(game.ending==="no-actions")assert.strictEqual(e.hellCandidates(s,game.winner===0?1:0).length,0,"no-action outcome invalid");
  if(game.winner!==null&&game.ending==="goal")assert(e.terrain.CAMPS[1-game.winner].some(p=>p.x===s.players[game.winner].x&&p.y===s.players[game.winner].y),"winner mismatch "+game.map.name+" winner="+game.winner+" final="+JSON.stringify(s.players)+" last="+game.moves.at(-1).notation);
  games++;
 }
}
console.log("PASS: replayed "+games+" games and "+turns+" legal moves; winner verified");
