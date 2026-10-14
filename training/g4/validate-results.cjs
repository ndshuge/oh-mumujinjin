"use strict";
// Validate that match outcome records are paired, legally reported and complete.
// No chess moves or states are stored. Safe to run during live competition.
const fs=require("fs"),path=require("path");
const [population="population-g0-64.json",roundsString="6",budgetString="260",seedString="20261014"]=process.argv.slice(2),
 rounds=Number(roundsString),budget=Number(budgetString),seed=Number(seedString);
if(!/^[a-z0-9_-]+\.json$/.test(population)||![rounds,budget,seed].every(Number.isInteger)||rounds<1||rounds>31)
 throw Error("Invalid validation arguments");
const roster=JSON.parse(fs.readFileSync(path.join(__dirname,population),"utf8")),
 participants=new Set(roster.agents.map(a=>a.id));
if(participants.size!==64)throw Error("Not 64 unique agents");
const dir=path.join(__dirname,"..","output","lab","g4"),
 result={roster:population,roundsExpected:rounds,roundsVerified:0,recordsChecked:0,
 illegal:0,pairedGames:0,pendingPairComplements:0,density:{sparse:0,medium:0,dense:0},
 errors:[],perRound:[]};
for(let round=0;round<rounds;round++){
 const tag="gen"+roster.generation+"-round"+round+"-b"+budget+"-s"+seed,
  file=path.join(dir,tag+".results.jsonl"),receipt=path.join(dir,tag+".report.json");
 if(!fs.existsSync(file))continue;
 const text=fs.readFileSync(file,"utf8").trim(),matches=text?text.split("\n").filter(Boolean).map(JSON.parse):[];
 if(matches.length>64)throw Error("Round has >64 records");
 const byPair=new Map(),mapHashes=new Set(),denses=new Set();
 for(const [index,m] of matches.entries()){
  if(m.round!==round||m.generation!==roster.generation||m.game!==index+1||
   m.pairIndex!==Math.floor(index/2)||m.seat!==index%2||
   !participants.has(m.player0)||!participants.has(m.player1)||m.player0===m.player1||
   (m.winner!==null&&![m.player0,m.player1].includes(m.winner))||
   !["goal","noMovement","repetition","cap"].includes(m.ending)||m.illegal!==0)
   throw Error("Invalid result record round "+round+" index "+index);
  result.recordsChecked++;mapHashes.add(m.mapHash);denses.add(m.density);
  result.density[m.density]++;
  const pair=byPair.get(m.pairIndex)||[];
  pair.push(m);byPair.set(m.pairIndex,pair);
 }
 for(const pair of byPair.values()){
  if(pair.length===2){
   const a=pair[0],b=pair[1];
   if(a.seat===b.seat||a.player0!==b.player1||a.player1!==b.player0||
    a.mapHash!==b.mapHash)throw Error("Not a proper paired swap");
   result.pairedGames+=2;
  }else result.pendingPairComplements++;
 }
 if(mapHashes.size>1||denses.size>1)throw Error("Round used multiple maps without explicit pairing");
 if(fs.existsSync(receipt)){
  const r=JSON.parse(fs.readFileSync(receipt,"utf8"));
  if(matches.length!==64||!r.complete||r.matches!==64||r.illegal!==0||
    r.mapHash!==matches[0].mapHash)throw Error("Broken completed receipt "+tag);
  result.roundsVerified++;
 }
 result.perRound.push({round,games:matches.length,complete:fs.existsSync(receipt),
  category:matches[0]?.density||null,pairedGames:[...byPair.values()].filter(p=>p.length===2).length*2});
}
const out=path.join(dir,"g4-validated-live.json");
fs.writeFileSync(out,JSON.stringify({...result,allComplete:result.roundsVerified===rounds},null,2));
console.log("G4_RECORDS_VALID",JSON.stringify({...result,perRound:undefined}));
