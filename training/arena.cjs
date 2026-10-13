"use strict";
const fs=require("fs"),path=require("path");
const {engine,mapGen,choose,seed}=require("./train.cjs");
const pairs=Math.max(1,Math.min(100,Number(process.argv[2]||4)));
const maxPly=120;
const outcomes={search:{win:0,loss:0,draw:0},greedy:{win:0,loss:0,draw:0}};
const records=[],start=Date.now();
for(let i=0;i<pairs;i++){
 const map=mapGen(i);
 for(let seat=0;seat<2;seat++){
  engine.setRocks(map.rocks);
  const agents=seat===0?["search","greedy"]:["greedy","search"];
  let state={players:[engine.terrain.CAMPS[0][1],engine.terrain.CAMPS[1][1]].map(p=>({x:p.x,y:p.y})),dirs:[null,null],walls:[],left:[5,5]};
  const visited=new Map(),moves=[];
  let winner=null,ending="ply-cap";
  for(let ply=0;ply<maxPly;ply++){
   const player=ply%2,action=choose(state,player,agents[player],visited);
   if(!action){winner=1-player;ending="no-actions";break;}
   moves.push({side:player,action});
   state=engine.hellApply(state,player,action);
   if(engine.terrain.CAMPS[1-player].some(p=>p.x===state.players[player].x&&p.y===state.players[player].y)){winner=player;ending="goal";break;}
   const hash=JSON.stringify({players:state.players,dirs:state.dirs,walls:state.walls,left:state.left,next:1-player});
   visited.set(hash,(visited.get(hash)||0)+1);
   if(visited.get(hash)>=3){ending="repetition";break;}
  }
  const winnerAgent=winner===null?null:agents[winner];
  for(const agent of ["search","greedy"])outcomes[agent][winnerAgent===null?"draw":winnerAgent===agent?"win":"loss"]++;
  records.push({map:map.name,rocks:map.rocks.length,seat,agents,winner,ending,plies:moves.length});
  console.log("pair",i,"seat",seat,ending,"winner",winnerAgent,"plies",moves.length);
 }
}
const report={seed,pairs,games:records.length,elapsedMs:Date.now()-start,outcomes,records,
 note:"Matched maps, both colors. Descriptive experiment only; no significance claim."};
const out=path.join(__dirname,"output");fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,"arena-"+seed+".json"),JSON.stringify(report,null,2));
console.log("REPORT",JSON.stringify({seed,pairs,games:records.length,outcomes,elapsedMs:report.elapsedMs}));
