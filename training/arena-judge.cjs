"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert");
const folder=path.join(__dirname,"output");
const files=process.argv.slice(2);
if(!files.length)throw Error("Usage: node training/arena-judge.cjs s3-arena-...json [other reports]");
const reports=files.map(file=>JSON.parse(fs.readFileSync(path.join(folder,file),"utf8")));
let seed=630417;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function judge(r){
 assert.strictEqual(r.records.length,r.pairs*2);
 const scores=[];
 for(let i=0;i<r.pairs;i++){
  const pair=r.records.slice(2*i,2*i+2);
  assert(pair[0].map===pair[1].map,"mismatched paired map");
  assert(pair[0].seat!==pair[1].seat,"seats not swapped");
  scores.push(pair.reduce((total,g)=>total+(g.winningEngine==="model"?1:g.winningEngine===null?.5:0),0)/2);
 }
 const runs=[];
 for(let k=0;k<5000;k++){
  let value=0;
  for(let i=0;i<scores.length;i++)value+=scores[Math.floor(random()*scores.length)];
  runs.push(value/scores.length);
 }
 runs.sort((a,b)=>a-b);
 const winRate=scores.reduce((a,b)=>a+b,0)/scores.length;
 return{
  pairs:r.pairs,games:r.games,mapOffset:r.mapOffset||0,
  winRate:Math.round(winRate*10000)/10000,
  pairedBootstrap95:[runs[125],runs[4875]].map(x=>Math.round(x*10000)/10000),
  score:r.model,
  sampleVerdict:r.pairs>=100&&runs[125]>.5?"candidate-meets-paired-threshold":"not-promoted",
  caution:"Bootstrap groups by paired maps; this is exploratory and does not replace untouched final evaluation."
 };
}
const results=reports.map(judge),out={method:"paired bootstrap 5000 samples, 95% percentile interval",reports:results,promotionApproved:false};
fs.writeFileSync(path.join(folder,"arena-confidence.json"),JSON.stringify(out,null,2));
for(let i=0;i<results.length;i++)console.log(files[i],JSON.stringify(results[i]));
if(results.some(x=>x.sampleVerdict==="candidate-meets-paired-threshold"))console.log("Candidate still requires untouched blind evaluation; promotion remains disabled");
