"use strict";
// D0 acceptance and dataset split audit. Non-mutating except generated report.
// Never reports repeated maps as independent layouts.
const fs=require("fs"),path=require("path");
const dir=path.join(__dirname,"output","lab"),files=fs.readdirSync(dir).filter(f=>/^(train|heldOut)-.+\.report\.json$/.test(f));
const splitLayouts={train:new Set(),heldOut:new Set()},allLayouts=new Set();
const stats={runs:0,games:0,actions:0,examples:0,illegal:0,endings:{goal:0,noMovement:0,repetition:0,cap:0},wallMoves:0,warps:0,splits:{train:{games:0,examples:0},heldOut:{games:0,examples:0}},source:"V1.1 search self-play; game.js rules"};
for(const name of files){
 const r=JSON.parse(fs.readFileSync(path.join(dir,name),"utf8"));
 const recordsFile=path.join(dir,r.id+".jsonl"),examplesFile=path.join(dir,r.id+".samples.jsonl");
 if(!fs.existsSync(recordsFile)||!fs.existsSync(examplesFile))throw Error("Missing output "+r.id);
 const records=fs.readFileSync(recordsFile,"utf8").trim().split("\n").filter(Boolean);
 const examples=fs.readFileSync(examplesFile,"utf8").trim().split("\n").filter(Boolean);
 if(records.length!==r.completed||examples.length!==r.generatedExamples)throw Error("Report count mismatch "+r.id);
 if(r.invalid!==0)throw Error("Detected illegal action "+r.id);
 for(const line of records){
  const record=JSON.parse(line);if(record.split!==r.split)throw Error("Split mismatch");
  const key=record.map.rocks.map(p=>p.x+","+p.y).sort().join("|");
  splitLayouts[r.split].add(key);allLayouts.add(key);
 }
 stats.splits[r.split].games+=records.length;stats.splits[r.split].examples+=examples.length;
 stats.runs++;stats.games+=r.completed;stats.actions+=r.actions;stats.examples+=r.generatedExamples;
 stats.illegal+=r.invalid;stats.wallMoves+=r.wallMoves;stats.warps+=r.warps;
 for(const [key,count] of Object.entries(r.endings))stats.endings[key]=(stats.endings[key]||0)+count;
}
const leak=[...splitLayouts.train].filter(x=>splitLayouts.heldOut.has(x)).length;
const sumEndings=Object.values(stats.endings).reduce((a,b)=>a+b,0);
const passed=stats.games>0&&stats.illegal===0&&leak===0&&sumEndings===stats.games;
const result={...stats,uniqueLayouts:allLayouts.size,
 trainLayouts:splitLayouts.train.size,heldoutLayouts:splitLayouts.heldOut.size,
 repeatedGames:stats.games-allLayouts.size,trainTestLayoutOverlap:leak,
 checks:{completeEndings:sumEndings===stats.games,zeroIllegal:stats.illegal===0,noMapLeak:leak===0,replayIndependent:"see lab-replay.cjs receipts"},
 passed,modelStrengthProven:false};
fs.writeFileSync(path.join(dir,"d0-acceptance.json"),JSON.stringify(result,null,2));
console.log("D0_ACCEPTANCE",JSON.stringify(result));
if(!passed)process.exitCode=1;
