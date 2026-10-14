"use strict";
// Strict stage C gate. Training quality != playing strength.
// Promotion requires paired-map game evidence, never just validation accuracy.
const fs=require("fs"),path=require("path");
const root=path.join(__dirname,"output"),load=f=>JSON.parse(fs.readFileSync(path.join(root,f),"utf8"));
const data=load("teacher-pilot-merged-report.json"),training=load("c-report.json"),inference=load("c-inference-check.json");
const e=training.epochs.at(-1).heldout;
const notes=[],criteria=[
 ["data_isolated",data.leak===0&&data.train>=1000&&data.heldOut>=200],
 ["policy_label_source",data.teacher==="strong-search-v1.1"],
 ["model_input_dim",training.inputDim===907&&training.hiddenDim===48&&training.actions===232],
 ["heldout_policy_better_than_frequency",e.accuracy>e.baselineAccuracy&&e.crossEntropy<e.baselineCrossEntropy],
 ["value_better_than_mean",e.valueMSE<e.baselineValueMSE],
 ["inference_finite_and_maskable",inference.invalidPredictions===0&&inference.positions>=200]
];
const arenaFiles=fs.readdirSync(root).filter(f=>f.startsWith("c-arena-p")&&f.endsWith(".json")),arena=arenaFiles.map(load);
let acceptedArena=false;
for(const a of arena){
  const pass=a.pairs>=100&&a.games>=200&&a.outcomes.noActions===0&&
    a.pairedBootstrap95?.[0]>.5;
  if(pass)acceptedArena=true;
  notes.push({mapOffset:a.mapOffset,pairs:a.pairs,score:a.model,pairedBootstrap95:a.pairedBootstrap95,pass});
}
const result={stage:"C search-teacher supervised pilot",engine:training.dataset,checks:criteria.map(([name,passed])=>({name,passed})),
 offlineTrained:criteria.every(x=>x[1]),playingStrengthCertified:acceptedArena,
 productionAllowed:false,arena:notes,reason:acceptedArena?
  "Research only: browser performance, separate frozen baseline and untouched-map blind tests still needed":
  "No statistically supported arena advantage yet. Model must not replace local hell AI."};
fs.writeFileSync(path.join(root,"c-gates.json"),JSON.stringify(result,null,2));
console.log("C_GATES",JSON.stringify(result));
if(!result.offlineTrained)process.exitCode=1;
