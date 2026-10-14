"use strict";
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const {engine}=require("./train.cjs");
const policy=require("./policy.cjs");
const args=process.argv.slice(2),root=path.join(__dirname,"output","lab");
if(!args.length)throw Error("Pass one or more lab-record JSONL filenames (no arbitrary paths)");
const same=(a,b)=>a&&b&&a.x===b.x&&a.y===b.y;
const target=(s,side)=>engine.terrain.CAMPS[1-side].some(p=>same(p,s.players[side]));
const summary={files:[],games:0,actions:0,walls:0,warps:0,illegal:0,mismatch:0,endings:{goal:0,noMovement:0,repetition:0,cap:0}};
for(const name of args){
 if(!/^[a-zA-Z0-9_.-]+\.jsonl$/.test(name)||!name.endsWith(".jsonl"))throw Error("Invalid filename");
 const file=path.join(root,name);if(!fs.existsSync(file))throw Error("Missing records "+file);
 for(const line of fs.readFileSync(file,"utf8").trim().split("\n")){
  if(!line)continue;
  const {sha256,...record}=JSON.parse(line);
  const digest=crypto.createHash("sha256").update(JSON.stringify(record)).digest("hex");
  if(digest!==sha256){summary.mismatch++;throw Error("Transcript SHA mismatch");}
  const map=engine.cleanMap(record.map);
  if(!map||map.rocks.length!==record.map.rocks.length)throw Error("Invalid map");
  engine.setRocks(map.rocks);
  let state={players:record.starts.map(p=>({...p})),dirs:[null,null],walls:[],left:[5,5]},winner=null,reason="cap";
  const seen=new Map();
  for(const [ply,move] of record.moves.entries()){
   const side=ply%2,a=move.action;
   if(move.side!==side||policy.encode(a)!==move.policy)throw Error("Policy/side mismatch "+ply);
   if(!engine.movementOptions(state.players[side],state.dirs[side],state.walls).length)throw Error("Moves after immobilization");
   if(a.wall){
    if(!engine.hellWallAllowed(state,a.wall,side))throw Error("Illegal wall "+ply);
    summary.walls++;
   }else{
    let valid=false;
    for(const m of engine.movementOptions(state.players[side],state.dirs[side],state.walls)){
     if(!a.move||!same(m.p,a.move.p)||!same(m.d,a.move.d)||m.steps!==a.move.steps||!same(m.firstDir,a.move.firstDir))continue;
     const portal=engine.portal(m.p),destination=a.warp&&portal?(same(portal.a,m.p)?portal.b:portal.a):m.p;
     if(same(a.p,destination)&&((m.nextLock===null&&a.lock===null)||same(m.nextLock,a.lock))){valid=true;break;}
    }
    if(!valid)throw Error("Illegal movement or warp "+ply);
    if(a.warp)summary.warps++;
   }
   state=engine.hellApply(state,side,a);summary.actions++;
   if(target(state,side)){winner=side;reason="goal";if(ply!==record.moves.length-1)throw Error("Moves after win");break;}
   if(!engine.movementOptions(state.players[1-side],state.dirs[1-side],state.walls).length){
    winner=side;reason="noMovement";if(ply!==record.moves.length-1)throw Error("Moves after immobilization");break;
   }
   const key=JSON.stringify([1-side,state.players,state.dirs,state.left,state.walls.map(w=>w.o+":"+w.x+":"+w.y).sort()]);
   const n=(seen.get(key)||0)+1;seen.set(key,n);
   if(n>=3){reason="repetition";if(ply!==record.moves.length-1)throw Error("Moves after draw");break;}
  }
  if(record.ending==="noMovement"&&reason==="cap"&&!engine.movementOptions(state.players[record.moves.length%2],state.dirs[record.moves.length%2],state.walls).length){winner=1-(record.moves.length%2);reason="noMovement";}
  if(reason!==record.ending||winner!==record.winner){summary.mismatch++;throw Error("Winner / ending disagreement: "+record.map.name+" got "+reason+" "+winner+" claimed "+record.ending+" "+record.winner);}
  summary.endings[reason]++;summary.games++;
 }
 summary.files.push(name);
}
const out=path.join(root,"replay-check-"+Date.now()+".json");
fs.writeFileSync(out,JSON.stringify(summary,null,2));
console.log("LAB_REPLAY_PASS",JSON.stringify(summary));
