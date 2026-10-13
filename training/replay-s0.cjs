"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert");
const {engine}=require("./train.cjs"),policy=require("./policy.cjs");
const file=path.join(__dirname,"output",process.argv[2]||"s0-records-120-1000.jsonl");
let games=0,actions=0,walls=0,warps=0;
function same(a,b){return a&&b&&a.x===b.x&&a.y===b.y;}
function actualWinner(s){for(let p=0;p<2;p++)if(engine.terrain.CAMPS[1-p].some(c=>same(c,s.players[p])))return p;return null;}
for(const line of fs.readFileSync(file,"utf8").trim().split("\n")){
 const game=JSON.parse(line),map=engine.cleanMap(game.map);
 assert(map&&JSON.stringify(map.rocks)===JSON.stringify(game.map.rocks),"invalid saved map");
 engine.setRocks(map.rocks);
 let s={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]};
 const seen=new Map();let reason="cap",winner=null;
 for(let k=0;k<game.moves.length;k++){
  const step=game.moves[k],who=k%2,action=step.action;
  assert.strictEqual(step.side,who,"turn order");
  assert.strictEqual(policy.encode(action),step.notation,"policy index");
  let ok=false;
  if(action.wall){
   ok=engine.hellWallAllowed(s,action.wall,who);
   walls++;
  }else{
   for(const move of engine.movementOptions(s.players[who],s.dirs[who],s.walls)){
    if(policy.encode({move,warp:!!action.warp})!==step.notation)continue;
    if(!same(move.p,action.move.p)||!same(move.nextLock,action.lock)&&!(move.nextLock==null&&action.lock==null))continue;
    const gate=engine.portal(move.p);
    const expected=action.warp&&gate?(same(gate.a,move.p)?gate.b:gate.a):move.p;
    if(same(expected,action.p)){ok=true;break;}
   }
   if(action.warp)warps++;
  }
  assert(ok,"illegal game "+games+" ply "+(k+1));
  s=engine.hellApply(s,who,action);actions++;
  winner=actualWinner(s);
  if(winner!==null){reason="goal";assert.strictEqual(k,game.moves.length-1,"moves after terminal");break;}
  const key=JSON.stringify([1-who,s.players,s.dirs,s.walls,s.left]);
  const c=(seen.get(key)||0)+1;seen.set(key,c);
  if(c>=3){reason="repetition";assert.strictEqual(k,game.moves.length-1);break;}
 }
 assert.strictEqual(game.ending,reason,"terminal tag mismatch game "+games);
 assert.strictEqual(game.winner,winner,"winner tag mismatch game "+games);
 games++;
}
const report={games,actions,walls,warps,invalid:0,replayOk:true};
fs.writeFileSync(path.join(__dirname,"output","s0-replay-report.json"),JSON.stringify(report,null,2));
console.log("S0 REPLAY PASS",JSON.stringify(report));
