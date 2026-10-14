"use strict";
// Exact result-only G4 matchday verifier. No chess move traces required.
// During a partial season, audit all completed mirrored pairs and report
// provisional coverage; never declare promotion.
const fs=require("fs"),path=require("path");
const rosterName=process.argv[2]||"population-g0-64.json",rounds=Number(process.argv[3]??6),
 budget=Number(process.argv[4]??260),seed=Number(process.argv[5]??20261014);
if(!/^population-g\d+-64\.json$/.test(rosterName)||![rounds,budget,seed].every(Number.isInteger)||
 rounds<1||rounds>31)throw Error("Invalid arguments");
const root=__dirname,roster=JSON.parse(fs.readFileSync(path.join(root,rosterName),"utf8")),
 dir=path.join(root,"..","output","lab","g4"),gen=roster.generation;
const ids=new Set(roster.agents.map(a=>a.id));
if(ids.size!==64)throw Error("Roster not 64 distinct members");
const family=a=>a.family==="search"?"search":a.family==="hybrid"?"hybrid":a.models?.length?"neural":"rule-puct";
const families={search:0,neural:0,hybrid:0,"rule-puct":0};
for(const a of roster.agents)families[family(a)]++;
if(Object.values(families).some(n=>n!==16))throw Error("Roster family imbalance");
const playerGames=new Map([...ids].map(id=>[id,0]));
let games=0,fullyAccepted=0,invalid=0,goals=0,draws=0,immobilized=0;
const densities={sparse:0,medium:0,dense:0},maps=new Set(),badPairs=[];
for(let round=0;round<rounds;round++){
 const key="gen"+gen+"-round"+round+"-b"+budget+"-s"+seed,
 file=path.join(dir,key+".results.jsonl"),summaryFile=path.join(dir,key+".report.json");
 if(!fs.existsSync(file))continue;
 const matches=fs.readFileSync(file,"utf8").split("\n").filter(Boolean).map(JSON.parse);
 if(matches.length>64)throw Error("Too many games in "+key);
 if(matches.some((m,i)=>m.game!==i+1||m.round!==round||!ids.has(m.player0)||
  !ids.has(m.player1)||m.player0===m.player1||m.illegal!==0||
  !["goal","repetition","cap","noMovement"].includes(m.ending)||
  !["sparse","medium","dense"].includes(m.density)))throw Error("Malformed match receipt "+key);
 const local=new Map();
 for(const m of matches){
  games++;invalid+=m.illegal;densities[m.density]++;
  maps.add(m.mapHash);playerGames.set(m.player0,playerGames.get(m.player0)+1);
  playerGames.set(m.player1,playerGames.get(m.player1)+1);
  if(m.ending==="goal")goals++;
  else if(m.ending==="noMovement")immobilized++;
  else draws++;
  const pair=local.get(m.pairIndex)||[];pair.push(m);local.set(m.pairIndex,pair);
 }
 for(const [p,events] of local){
  if(events.length===2&&(events[0].player0!==events[1].player1||
   events[0].player1!==events[1].player0))badPairs.push({round,p});
  if(events.length>2)throw Error("Overplayed pairing "+key);
 }
 if(fs.existsSync(summaryFile)){
  const summary=JSON.parse(fs.readFileSync(summaryFile,"utf8"));
  if(!summary.complete||summary.illegal!==0||summary.matches!==64||matches.length!==64)throw Error("Accepted round incomplete "+key);
  fullyAccepted++;
 }
}
if(badPairs.length||invalid)throw Error("Paired seat rule violation / illegal moves "+JSON.stringify(badPairs));
const perAgent=[...playerGames.values()],allEven=perAgent.every(n=>n%2===0),
 complete=fullyAccepted===rounds&&games===rounds*64&&perAgent.every(n=>n===rounds*2);
const report={generation:gen,complete,games,plannedGames:64*rounds,rounds,acceptedRounds:fullyAccepted,
 roster:rosterName,budgetMs:budget,independentMapLayouts:maps.size,densityGames:densities,
 playerGamesMin:Math.min(...perAgent),playerGamesMax:Math.max(...perAgent),
 allAgentGamesEven:allEven,illegalActions:invalid,
 endings:{goal:goals,noMovement:immobilized,draw:draws},
 familyCounts:families,allMirroredPairsValid:true,onlinePromotionAuthorized:false};
const out=path.join(dir,"VERIFY64_GEN"+gen+".json");
fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log("G4_SEASON_VERIFY",JSON.stringify(report));
if(complete&&!allEven)process.exitCode=1;
