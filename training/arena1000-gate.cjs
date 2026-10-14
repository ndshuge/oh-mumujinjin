"use strict";
// Formal, read-only gate on completed 1000-game held-out paired evaluation.
// Does not modify game.js and never upgrades the production AI.
const fs=require("fs"),path=require("path");
const location=path.join(__dirname,"output","hell-ai-1000-report.json");
if(!fs.existsSync(location)){console.error("NO_COMPLETE_REPORT: 1000-game arena still running");process.exit(2);}
const r=JSON.parse(fs.readFileSync(location,"utf8"));
const checks=[
 ["all 1000 games complete",r.games===1000],
 ["500 distinct paired maps",r.maps===500],
 ["zero illegal moves",r.illegalMoves===0],
 ["all outcomes recorded",Object.values(r.terminal).reduce((a,b)=>a+b,0)===r.games],
 ["no non-rule no-action results",r.terminal.noActions===0],
 ["95% paired CI excludes 50%",r.pairedBootstrap95?.[0]>.5],
 ["local P95 below 2 seconds",r.latencyMs?.p95<=2000]
];
for(const [name,pass] of checks)console.log((pass?"PASS":"FAIL"),name);
const allPass=checks.every(x=>x[1]);
const verdict={
 run:"hell-ai-1000-report.json",engine:r.version,checks:checks.map(([name,passed])=>({name,passed})),
 passed:allPass,productionAllowed:false,
 note:allPass?"Candidate for browser device qualification; no automatic deployment":"Rejected for automatic production promotion; keep original hell AI",
 winRate:r.outcomes.scoreRate,pairedBootstrap95:r.pairedBootstrap95
};
fs.writeFileSync(path.join(__dirname,"output","hell-ai-1000-gate.json"),JSON.stringify(verdict,null,2));
console.log("GATE",JSON.stringify(verdict));
if(!allPass)process.exitCode=1;
