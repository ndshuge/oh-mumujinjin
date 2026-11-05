// Wall candidate audit against the production dynamic Map V2 rule engine.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('game.js','utf8'),nodes=new Map(),store={};
function el(id){if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',value:'',style:{},dataset:{},classList:{toggle(){}},addEventListener(){},appendChild(){},setAttribute(){},getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});return nodes.get(id);}
el('board').getContext=()=>new Proxy({},{get:(o,k)=>o[k]||(()=>{})});
const document={getElementById:el,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
const window={confirm:()=>true,setTimeout:()=>{}},localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v};
const expose='window.t={state:()=>state,resetGame,selectOrigin,installMap,validWall,hellWallAllowed,placeWall,findPath,randomMap,camps:CAMPS};state=load()||newGame("classic");';
vm.runInNewContext(source.replace('state=load()||newGame("classic");',expose),
{window,document,localStorage,Set,Math,JSON,Number,TextEncoder,TextDecoder,Uint8Array,btoa,atob,navigator:{},location:{hash:'',origin:'https://test',pathname:'/'},console},{timeout:20000});
const t=window.t;
let tested=0,legal=0,rejected=0,placed=0;
for(let k=0;k<30;k++){
 const map=t.randomMap(74011+k*31),terrain=[...map.rocks,...map.ice,...map.boost,...map.portals.flatMap(g=>[g.a,g.b])];
 for(const variant of ['classic','advanced']){
  assert(t.installMap(map));t.resetGame(variant);
  t.selectOrigin({x:7,y:12});t.selectOrigin({x:1,y:0});
  const state=t.state(),candidates=[];
  assert.strictEqual(t.validWall({x:0,y:0,o:"diagonal"}),false,'Reject unsupported wall orientation');
  assert.strictEqual(t.validWall({x:NaN,y:0,o:"h"}),false,'Reject NaN wall coordinate');
  assert.strictEqual(t.hellWallAllowed({players:state.players,dirs:state.slideDir,walls:state.walls,left:state.left},
    {x:0,y:0,o:"diagonal"},0),false,'AI cannot propose invalid wall orientation');
  for(const p of terrain.slice(0,27)){
   for(const o of ['h','v'])candidates.push({x:Math.max(0,Math.min(7,p.x)),y:Math.max(0,Math.min(11,p.y)),o});
  }
  for(const w of candidates){
    const valid=t.validWall(w);tested++;
    if(valid){
      legal++;
      assert(t.findPath(state.players[0],t.camps[1],state.walls.concat([w]),state.slideDir[0]),'Illegal wall blocks gold');
      assert(t.findPath(state.players[1],t.camps[0],state.walls.concat([w]),state.slideDir[1]),'Illegal wall blocks wood');
    }else rejected++;
  }
  const first=candidates.find(w=>t.validWall(w));
  if(first){t.placeWall(first);assert.equal(t.state().walls.length,1);assert(!t.validWall(first));tested++;rejected++;placed++;}
 }
}
console.log('DIAGNOSTIC_WALL_COUNTS',JSON.stringify({tested,legal,rejected,placed}));
assert(legal>0&&rejected>0&&placed>0);
console.log('PASS: 30 random terrain maps × two modes × near-special wall candidates',JSON.stringify({tested,legal,rejected,placed}));
