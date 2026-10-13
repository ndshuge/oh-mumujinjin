// Custom map and hell AI deterministic regression. Run node workshop-regression.cjs
const fs=require("fs"),vm=require("vm"),assert=require("assert");
const source=fs.readFileSync("game.js","utf8"),nodes=new Map(),mem={},callbacks=[];
const el=id=>{
 if(!nodes.has(id))nodes.set(id,{id,hidden:false,textContent:"",value:"",style:{},dataset:{},disabled:false,classList:{toggle(){}},addEventListener(){},setAttribute(){},appendChild(){},getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});
 return nodes.get(id);
};
const ctx=new Proxy({},{get(t,k){return k in t?t[k]:()=>{};}});
el("board").getContext=()=>ctx;
const document={getElementById:el,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
const window={confirm:()=>true,setTimeout:fn=>callbacks.push(fn)};
const localStorage={getItem:k=>mem[k]||null,setItem:(k,v)=>{mem[k]=v}};
const injection='window.test={state:()=>state,cleanMap,installMap,mapCurrent,resetGame,setAILevel,selectOrigin,availableMoves,playerMove,choosePortal,hellChooseAction,hellWallAllowed,hellCandidates,saveMap,shareMap,openEditor};state=load()||newGame("classic");';
assert(source.includes('state=load()||newGame("classic");'));
vm.runInNewContext(source.replace('state=load()||newGame("classic");',injection),{window,document,localStorage,Set,Math,JSON,Number,Uint8Array,TextEncoder,btoa,atob,location:{origin:"https://example.com",pathname:"/game",hash:""},navigator:{clipboard:{writeText:async()=>{}}},console},{filename:"game.js"});
const t=window.test;
const map={version:1,name:"测试地图",rocks:[{x:4,y:6}]};
const good=t.cleanMap(map);
assert(good,"Valid one-rock map accepted");
const invalids=[
{version:1,name:"越界",rocks:[{x:9,y:1}]},
{version:1,name:"营地",rocks:[{x:0,y:0}]},
{version:1,name:"传送门",rocks:[{x:5,y:2}]},
{version:1,name:"冰面",rocks:[{x:1,y:7}]},
{version:1,name:"重复",rocks:[{x:0,y:1},{x:0,y:1}]},
{version:1,name:"完全封锁",rocks:Array.from({length:9},(_,x)=>({x,y:1}))}
];
for(const item of invalids)assert(!t.cleanMap(item),"Invalid map rejected: "+item.name);
assert(t.installMap(good),"Valid map installs");
assert.strictEqual(t.mapCurrent().rocks.length,1);
t.openEditor();el("editorName").value="测试地图";
t.saveMap();
const saved=JSON.parse(mem["mumujinjin-custom-maps-v1"]);
assert.strictEqual(saved.length,1);
t.shareMap();
const link=el("mapShareLink").value;
assert(link.startsWith("https://example.com/game#map="));
const raw=link.split("#map=")[1].replace(/-/g,"+").replace(/_/g,"/");
const decoded=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw),c=>c.charCodeAt(0))));
assert.strictEqual(decoded.rocks.length,1);
t.openEditor();t.resetGame("classic");
t.setAILevel("hell");t.selectOrigin({x:7,y:12});
for(let i=0;i<callbacks.length;i++){const cb=callbacks[i];cb();if(i>50)throw Error("Too many async turns");}
const state=t.state();
assert.strictEqual(state.phase,"play");assert.strictEqual(state.turn,0);
const legal=t.availableMoves();
t.playerMove(legal[0]);
const before=Date.now();
const choice=t.hellChooseAction();
const ms=Date.now()-before;
assert(choice,"Hell AI should choose an action");
if(choice.wall)assert(t.hellWallAllowed({players:state.players,dirs:state.slideDir,walls:state.walls,left:state.left},choice.wall,1),"AI wall legal");
else assert(choice.move,"AI move must exist");
console.log("PASS: map validation / spawn and portal protection / unreachable map rejection / save / share roundtrip / hell legal choice in",ms+"ms");
