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
console.log("PASS: browser threefold repetition, 120-ply draw, undo restores state and repetition counts");
