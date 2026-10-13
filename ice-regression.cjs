// Advanced-mode regressions: momentum is stateful and must match wall checks.
const fs=require("fs"),vm=require("vm"),assert=require("assert");
const source=fs.readFileSync("game.js","utf8");
const items=new Map();
const el=id=>{
 if(!items.has(id))items.set(id,{hidden:false,style:{},textContent:"",dataset:{},disabled:false,classList:{toggle(){}},addEventListener(){},getBoundingClientRect(){return {left:0,top:0,width:720,height:980}}});
 return items.get(id);
};
const ctx=new Proxy({},{get(t,k){return k in t?t[k]:()=>{};},set(t,k,v){t[k]=v;return true;}});
el("board").getContext=()=>ctx;
const document={getElementById:el,querySelectorAll:()=>[],addEventListener(){}};
const window={confirm:()=>true},mem={};
const localStorage={getItem(k){return mem[k]||null;},setItem(k,v){mem[k]=v;}};
const injection='window.test={state:()=>state,resetGame,movementOptions,validWall,findPath,availableMoves,playerMove};state=load()||newGame("classic");';
assert(source.includes('state=load()||newGame("classic");'));
vm.runInNewContext(source.replace('state=load()||newGame("classic");',injection),{window,document,localStorage,Set,Math,JSON,console},{filename:"game.js"});
const t=window.test,point=(x,y)=>({x,y}),up=point(0,-1),down=point(0,1);
const same=(a,b)=>a&&a.x===b.x&&a.y===b.y;
function setup(){
 t.resetGame("advanced");
 const s=t.state();
 s.phase="play";s.turn=0;
 s.players=[point(7,12),point(1,7)];
 s.slideDir=[null,down];
 s.left=[5,5];
 return s;
}
// Wooden pawn is mid-ice and locked downward. A gap to the right exists
// on the middle cell, but no real sequence of moves can turn into it.
let s=setup();
s.walls=[
 {o:"h",x:0,y:5,owner:0}, // stop upward slide at x1,y6
 {o:"v",x:0,y:6,owner:0}, // block the left exit at y6/y7
 {o:"v",x:1,y:5,owner:0}, // block the right exit at y6
 {o:"v",x:1,y:8,owner:0}, // block the right exit at y8
];
const closing={o:"h",x:0,y:8};
assert.strictEqual(t.findPath(s.players[1],[point(6,12),point(7,12),point(8,12)],s.walls,down),true,
 "Before the final wall the wood player has a reachable exit");
assert.strictEqual(t.findPath(s.players[1],[point(6,12),point(7,12),point(8,12)],s.walls.concat([closing]),down),false,
 "Reject a static-looking route through the side of a direction-locked ice tile");
assert.strictEqual(t.validWall(closing),false,
 "Wall checking must reject the frozen corridor configuration");

// If the direction ahead is blocked, choosing an alternative resets heading.
s=setup();
s.turn=1;
s.players[1]=point(1,8);
s.walls=[{o:"h",x:0,y:8,owner:0}];
const back=t.availableMoves().find(m=>same(m.p,point(1,7)));
assert(back && same(back.nextLock,up),"Turning back on ice after hitting a wall must update momentum to UP");
t.playerMove(back);
assert(same(s.slideDir[1],up),"Committed move must preserve the new direction");
s.turn=1;
const next=t.availableMoves();
assert(next.some(m=>same(m.p,point(1,6))),"New upward momentum continues through the ice");
assert(!next.some(m=>same(m.p,point(1,8))),"Old downward momentum is not retained");

// Classical rules are unaffected even on tiles visually used as ice.
s=setup();
s.variant="classic";
s.turn=1;
s.players[1]=point(1,7);
s.slideDir[1]=down;
const classicMoves=t.availableMoves();
assert(classicMoves.some(m=>same(m.p,point(2,7))),"Classic mode ignores momentum");

// When boosts turn, momentum direction should represent the last step.
s=setup();
s.turn=0;s.players[0]=point(6,10);
const boostMove=t.availableMoves().find(m=>m.steps===2&&same(m.p,point(7,9)));
assert(boostMove && same(boostMove.d,up),"A turning boost must use the second segment as its heading");
console.log("PASS: advanced ice corridor / forbidden soft-lock wall / heading reset / classic unaffected / boost direction");