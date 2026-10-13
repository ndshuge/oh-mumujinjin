// Regression: a route through a paired portal is a legal path for wall checks.
// Run: node portal-regression.cjs
const fs=require("fs"),vm=require("vm"),assert=require("assert");
const source=fs.readFileSync("game.js","utf8");
const elements=new Map();
function el(id){
 if(!elements.has(id))elements.set(id,{hidden:false,style:{},textContent:"",dataset:{},disabled:false,classList:{toggle(){}},addEventListener(){},getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});
 return elements.get(id);
}
const ctx=new Proxy({},{get(target,key){return key in target?target[key]:(()=>{});},set(target,key,value){target[key]=value;return true;}});
el("board").getContext=()=>ctx;
const document={getElementById:el,querySelectorAll:()=>[],addEventListener(){}},window={confirm:()=>true};
const storage={};
const localStorage={getItem(k){return storage[k]||null;},setItem(k,v){storage[k]=v;}};
const exposed='window.test={state:()=>state,resetGame,validWall,findPath,canStep,portal};state=load()||newGame("classic");';
assert(source.includes('state=load()||newGame("classic");'),"Game test hook has changed");
vm.runInNewContext(source.replace('state=load()||newGame("classic");',exposed),{window,document,localStorage,Set,JSON,Math,console},{filename:"game.js"});
const game=window.test;
const a={x:5,y:2},b={x:2,y:5};
assert(game.portal(a),"upper triangle gate exists");
assert(game.portal(b),"lower triangle gate exists");

function setup(start) {
 game.resetGame("classic");
 const s=game.state();
 s.phase="play";s.turn=0;
 s.players=[start,{x:1,y:0}];
 // A 2x2 room around the upper triangle. The right wall closes the last exit.
 s.walls=[
  {o:"h",x:4,y:1,owner:0},
  {o:"h",x:4,y:3,owner:0},
  {o:"v",x:3,y:2,owner:0},
 ];
 s.left=[5,5];
 return s;
}
let s=setup(a);
const closing={o:"v",x:5,y:2};
assert.strictEqual(game.findPath(a,[{x:0,y:0},{x:1,y:0},{x:2,y:0}],s.walls.concat([closing])),true,
 "The upper triangle must still reach the opponent camp through its paired gate");
assert.strictEqual(game.validWall(closing),true,
 "Wall is legal: both players can still reach their goal using the optional portal");

s=setup({x:4,y:2});
assert.strictEqual(game.validWall(closing),true,
 "Adjacent to the triangle still has a legal portal escape route");

s=setup({x:4,y:3});
s.walls.push({o:"h",x:4,y:2,owner:0});
// The extra internal wall isolates the player from the triangle itself.
// The candidate does not overlap or cross any existing wall.
assert.strictEqual(game.validWall(closing),false,
 "Reject a non-conflicting wall if the player can no longer access the gate or goal");

s=setup(a);
assert.strictEqual(game.validWall({o:"h",x:4,y:1}),false,
 "Existing wall overlap remains forbidden");
assert.strictEqual(game.validWall({o:"v",x:4,y:1}),false,
 "Crossing walls remains forbidden");
console.log("PASS: portal-assisted reachability / valid enclosure / sealed enclosure rejection / overlap / crossing");