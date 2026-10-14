"use strict";
const fs=require("fs"),path=require("path");
const root=path.join(__dirname,"output"),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),"utf8"));
const a=read("selfplay-train-1600.report.json"),b=read("selfplay-train-1620.report.json"),v=read("selfplay-heldOut-700.report.json");
const joined=read("c-selfplay-combined-report.json"),trained=read("c-v3-balanced-report.json"),inference=read("c-balanced-inference-check.json");
const arena=read("c-balanced-arena-p0.25-v0-offset500.json");
const checks=[
 ["60 completed search-vs-search games",a.completed+b.completed+v.completed===60],
 ["every selfplay game had a valid terminal",a.goal+b.goal+v.goal===60&&a.illegal+b.illegal+v.illegal===0],
 ["combined dataset has zero train/validation map overlap",joined.overlap===0&&joined.samples===2887],
 ["trained model contains held-out validation",trained.validationMaps===260&&trained.leakage===0],
 ["719 validation positions legal-maskable",inference.positions===719&&inference.invalidPredictions===0],
 ["selfplay value error improved over direct-mix iteration",trained.epochs[trained.bestEpoch-1].metrics.selfplay.valueMSE<1.2130623962311042],
 ["arena positions have legal actions",arena.outcomes.noActions===0&&arena.games===24]
];
const pass=checks.every(([,ok])=>ok);
const result={stage:"C self-play value repair",technicalPass:pass,promotionApproved:false,
 wins:arena.model.wins,losses:arena.model.losses,pairedBootstrap95:arena.pairedBootstrap95,
 checks:checks.map(([name,passed])=>({name,passed})),
 reason:"Live game strength not demonstrated. Do not replace GitHub Pages AI."};
fs.writeFileSync(path.join(root,"c-balanced-gates.json"),JSON.stringify(result,null,2));
console.log("C_BALANCED_GATES",JSON.stringify(result));
if(!pass)process.exitCode=1;
