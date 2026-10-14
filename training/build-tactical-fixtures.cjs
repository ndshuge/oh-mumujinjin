"use strict";
// Tactical fixtures extracted from TRAIN-SPLIT game records, not test maps.
// Snapshot labels are derived from the authoritative rules engine, never a model.
const fs=require("fs"),path=require("path"),{engine}=require("./train.cjs");
const source=path.join(__dirname,"output","s0-records-120-10000.jsonl");
const target=path.join(__dirname,"tactical-fixtures.json");
const wantWins=140,wantDefends=40,winCases=[],defendCases=[];
const mapSeen=new Set();
const has=(arr,p)=>arr.some(g=>g.x===p.x&&g.y===p.y);
function canWin(s,p){
 const goal=engine.terrain.CAMPS[1-p];
 for(const m of engine.movementOptions(s.players[p],s.dirs[p],s.walls)){
  if(has(goal,m.p))return true;
  const gate=engine.portal(m.p);
  if(gate&&has(goal,has([gate.a],m.p)?gate.b:gate.a))return true;
 }
 return false;
}
function canBlock(s,p){
 if(canWin(s,p))return [];
 const answers=[];
 // This also discovers defence walls away from either pawn.
 for(let y=0;y<12;y++)for(let x=0;x<8;x++)for(const o of ["h","v"]){
  const a={wall:{x,y,o}};
  if(!engine.hellWallAllowed(s,a.wall,p))continue;
  const next=engine.hellApply(s,p,a);
  if(!canWin(next,1-p))answers.push(a.wall);
 }
 return answers;
}
for(const line of fs.readFileSync(source,"utf8").split("\n")){
 if(!line)continue;
 const row=JSON.parse(line);
 if(row.split!=="train"||row.ending!=="goal"||row.moves.length===0)continue;
 const sig=row.map.rocks.map(p=>p.x+","+p.y).sort().join("|");
 if(mapSeen.has(sig))continue;mapSeen.add(sig);
 engine.setRocks(row.map.rocks);
 let state={players:engine.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]};
 for(let i=0;i<row.moves.length-1;i++)state=engine.hellApply(state,i%2,row.moves[i].action);
 const who=(row.moves.length-1)%2;
 if(!canWin(state,who))continue;
 if(winCases.length<wantWins)
  winCases.push({kind:"win-in-one",map:row.map,state,side:who,sourcePly:row.moves.length-1});
 if(defendCases.length<wantDefends&&canWin(state,who)&&!canWin(state,1-who)){
  const defender=1-who;
  const defenceWalls=canBlock(state,defender);
  if(defenceWalls.length)
   defendCases.push({kind:"defend-in-one",map:row.map,state,side:defender,opponent:who,
    defenceWalls: defenceWalls.length,sourcePly:row.moves.length-1});
 }
 if(winCases.length>=wantWins&&defendCases.length>=wantDefends)break;
}
const fixtures={version:1,generatedFrom:"training/output/s0-records-120-10000.jsonl (train split only)",
 generatedAt:new Date().toISOString(),winCases:winCases.length,defendCases:defendCases.length,
 cases:[...winCases,...defendCases]};
fs.writeFileSync(target,JSON.stringify(fixtures));
console.log("TACTICAL_GENERATED",JSON.stringify({winCases:winCases.length,defendCases:defendCases.length,total:fixtures.cases.length,bytes:fs.statSync(target).size}));
if(winCases.length<100||defendCases.length<5)process.exitCode=1;
