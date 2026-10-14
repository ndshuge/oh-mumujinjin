"use strict";
// Reproducible hall of fame: freeze exact agent configurations and evidence.
// Development winners are "candidates"; only a properly verified new-map gate
// may ever confer "certified_champion". This script never deploys an AI.
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const {check}=require("../league/agent.cjs"),root=path.resolve(__dirname,"..");
const target=path.join(__dirname,"hall-of-fame.json");
if(fs.existsSync(target))throw Error("Hall-of-Fame already exists, refusing to rewrite frozen genome record");
const load=name=>JSON.parse(fs.readFileSync(path.join(root,name),"utf8"));
const rosters={
 initial:load("g3/population-g0.json"),
 g1:load("g3/population-g1.json"),
 g2:load("g3/population-g2.json"),
 mutant:load("league/population-strange.json")
};
const results=JSON.parse(fs.readFileSync(path.join(root,"output/lab/g3/champions-population-strange-1100-4-b250.json"),"utf8"));
function freeze(name,population,id,source,gate,status="candidate"){
 const a=rosters[population]?.agents.find(x=>x.id===id);
 if(!a)throw Error("Unknown champion "+id);
 check(a);
 const genome=JSON.parse(JSON.stringify(a));
 const hash=crypto.createHash("sha256").update(JSON.stringify(genome)).digest("hex");
 return{name,source,originalId:id,status,genomeSha256:hash,genome,evidence:gate};
}
const participants=[
 freeze("G0-6W","initial","g0-h02","initial generation 0: 6-0",{
  games:6,wins:6,losses:0,draws:0,evaluation:"intra-population, 3 maps, 6 games"}),
 freeze("G1-5W","g1","g1-sv15","generation 1: 5-1",{
  games:6,wins:5,losses:1,draws:0,evaluation:"intra-population, 3 maps, 6 games"})
];
for(const id of ["odd-hawks","odd-tunnel","odd-tortoise","odd-dreamer"]){
 const r=results.results.find(x=>x.id===id);
 if(!r)throw Error("Missing match evidence for "+id);
 participants.push(freeze(id,"mutant",id,"V1.1 challenge at 250ms × 4 paired maps",{
  games:r.wins+r.losses+r.draws,wins:r.wins,losses:r.losses,draws:r.draws,
  pairedBootstrap95:r.pairedBootstrap95,latencyP95Ms:r.p95MoveMs,
  evaluation:"development; reused maps, cannot certify chess strength"}));
}
const file={
 schema:"mumu-hall-of-fame-v1",createdDate:"2026-10-14",incumbentId:"frozen-v11",
 incumbent:{id:"frozen-v11",engine:"strong-search-v1.1.js",depth:2,
  role:"stable research reference, not newly certified from this file",status:"incumbent"},
 entries:participants,
 promotionRules:{minPairs:500,minGames:1000,requireUnseenMaps:true,
  pairedBootstrapLowerBoundMin:.5,illegalAllowed:0,
  requiresBrowserWorkerAcceptance:true,
  autoDeployment:false},
 note:"No one here besides the frozen incumbent is authorized to replace the public game AI."
};
fs.writeFileSync(target,JSON.stringify(file,null,2));
console.log("HALL_OF_FAME_CREATED",JSON.stringify({file:target,incumbent:file.incumbentId,
 entries:file.entries.map(x=>({name:x.name,id:x.originalId,status:x.status,
 evidenceGames:x.evidence.games,sha256:x.genomeSha256.slice(0,12)})),
 promotionAuthorized:false}));
