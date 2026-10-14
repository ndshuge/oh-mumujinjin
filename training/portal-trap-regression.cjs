"use strict";
// Tactical fixtures recovered from the first 1000-game paired arena.
// One fixture has no legal moves/walls; the other can only build a wall.
const assert=require("assert"),fs=require("fs"),path=require("path");
const {engine}=require("./train.cjs"),strong=require("../strong-search.js");
const cases=[
{mapName:"map-4136",ply:39,possibleWalls:0,state:{
 players:[{x:7,y:8},{x:8,y:6}],dirs:[null,null],
 walls:[{x:1,y:0,o:"v"},{x:1,y:2,o:"v"},{x:0,y:4,o:"v"},{x:1,y:11,o:"v"},{x:2,y:10,o:"h"},{x:4,y:10,o:"h"},{x:5,y:10,o:"v"},{x:6,y:11,o:"h"},{x:7,y:5,o:"v"}],left:[1,0]}},
{mapName:"map-8177",ply:27,possibleWalls:0,state:{
 players:[{x:7,y:11},{x:2,y:5}],dirs:[null,null],
 walls:[{x:1,y:11,o:"h"},{x:3,y:11,o:"h"},{x:0,y:1,o:"v"},{x:2,y:11,o:"v"},{x:4,y:10,o:"v"},{x:2,y:4,o:"v"},{x:1,y:4,o:"v"},{x:2,y:5,o:"h"}],left:[2,0]}},
{mapName:"map-5577",ply:42,possibleWalls:0,state:{
 players:[{x:8,y:6},{x:2,y:3}],dirs:[null,null],
 walls:[{x:4,y:10,o:"h"},{x:3,y:1,o:"v"},{x:1,y:1,o:"h"},{x:2,y:0,o:"v"},{x:0,y:0,o:"h"},{x:0,y:6,o:"h"},{x:2,y:6,o:"h"},{x:1,y:9,o:"h"},{x:7,y:5,o:"v"}],left:[1,0]}}
];
const source=fs.readFileSync(path.join(__dirname,"output","s0-records-120-10000.jsonl"),"utf8").split("\n");
const needed=new Set(cases.map(r=>r.mapName)),maps=new Map();
for(const line of source){if(!line)continue;const map=JSON.parse(line).map;if(needed.has(map.name))maps.set(map.name,map);}
if(maps.size!==needed.size)throw Error("missing tactical maps");
for(const e of cases){
 engine.setRocks(maps.get(e.mapName).rocks);
 const who=e.ply%2;
 const moves=engine.movementOptions(e.state.players[who],e.state.dirs[who],e.state.walls);
 assert.equal(moves.length,0,"fixture changed");
 const action=strong.choose(engine,e.state,who,{depth:2,timeMs:350}).action;
 if(e.possibleWalls>0){
  assert(action&&action.wall&&engine.hellWallAllowed(e.state,action.wall,who),"must have legal wall fallback");
 }else{
  assert.strictEqual(action,null,"should not invent an action when none exist");
 }
 const lastWall=e.state.walls.at(-1);
 const before={...e.state,walls:e.state.walls.slice(0,-1),left:e.state.left.slice()};
 before.left[1-who]++;
 assert.strictEqual(engine.hellWallAllowed(before,lastWall,1-who),false,"a wall must not imprison an occupied portal tile");
 console.log("PASS trap fixture",e.mapName,"side",who,"legal-walls",e.possibleWalls,"chosen",action?.wall?"wall":"none");
}
