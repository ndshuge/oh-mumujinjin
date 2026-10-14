"use strict";
const fs=require("fs"),vm=require("vm"),assert=require("assert");
const source=fs.readFileSync("game.js","utf8"),els=new Map();
function el(id){if(!els.has(id))els.set(id,{hidden:false,textContent:"",value:"",dataset:{},style:{},classList:{toggle(){}},addEventListener(){},setAttribute(){}});return els.get(id);}
el("board").getContext=()=>new Proxy({},{get:()=>()=>{}});
const document={getElementById:el,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({})};
const localStorage={getItem:()=>null,setItem(){}},window={confirm:()=>true};
const marker='state=load()||newGame("classic");';
vm.runInNewContext(source.replace(marker,'window.test={state:()=>state,resetGame,record,undo,finishTurn};'+marker),{window,document,localStorage,Set,Math,JSON,Uint8Array,TextEncoder,TextDecoder,atob,btoa,location:{hash:""}});
const t=window.test;
function setup(){t.resetGame("classic");const s=t.state();s.phase="play";s.players=[{x:7,y:10},{x:1,y:2}];s.turn=0;s.repetitions={};return s;}
let s=setup();s.moves=119;t.record();t.finishTurn("pass-test");
assert.strictEqual(s.phase,"finished");assert.strictEqual(s.winner,null);assert.strictEqual(s.moves,120);
assert.strictEqual(el("winTitle").textContent,"平局");
t.undo();assert.strictEqual(s.phase,"play");assert.strictEqual(s.moves,119);assert.deepStrictEqual(Object.keys(s.repetitions),[]);
s=setup();
const key=JSON.stringify([1,s.players,s.slideDir,s.walls.map(w=>w.o+":"+w.x+":"+w.y).sort(),s.left]);
s.repetitions[key]=2;t.record();t.finishTurn("pass-test");
assert.strictEqual(s.phase,"finished");assert.strictEqual(s.winner,null);assert.strictEqual(s.repetitions[key],3);
t.undo();assert.strictEqual(s.repetitions[key],2);
s=setup();
s.players=[{x:7,y:10},{x:0,y:0}];s.walls=[{x:0,y:0,o:"v"},{x:0,y:0,o:"h"}];
t.record();t.finishTurn("trap-test");
assert.strictEqual(s.phase,"finished","trapped next player must not soft-lock the board");
assert.strictEqual(s.winner,0,"side that trapped the other must win");
assert.strictEqual(el("winTitle").textContent,"金方获胜");
t.undo();assert.strictEqual(s.phase,"play","undo must restore the game after a trap ending");
console.log("PASS: browser repetition, 120-ply draw, trapped-pawn win and undo restoration");
