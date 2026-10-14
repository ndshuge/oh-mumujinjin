"use strict";
// G5 determinism gate. Runs every diagnostic config twice in two SEPARATE
// processes and demands byte-identical decision digests. This is the gate that
// replay-acceptance.json could only fail: the legacy comparison mixed a
// wall-clock arena record with a wall-clock replay, so mismatches were
// guaranteed by construction rather than by a rule bug.
const fs=require("fs"),path=require("path"),{spawnSync}=require("child_process");
const root=path.resolve(__dirname,"../.."),outDir=path.join(root,"training/output/lab/g5");
const maxNodes=Number(process.argv[2]||0);
// Digests recorded by the pre-optimisation run (before the computerDistance
// memo cache existed). The cache only stores a pure function's results, so it
// must not move a single decision. Any drift here means an optimisation bug.
const PRE_OPTIMISATION_DIGESTS={
 "3-0":"09cba122e377", "3-1":"d20fc4d40096", "4-0":"7c6b40e00af3",
 "4-1":"41b0d90c2797", "8-0":"e76ee6db7ab1", "8-1":"4cf10cda44be",
};
const configs=[];
for(const map of [3,4,8])for(const seat of [0,1])configs.push({map,seat});

function runReplay(map,seat,tag,node){
 const t0=Date.now();
 const r=spawnSync(process.execPath,[path.join(__dirname,"g5-replay-det.cjs"),String(map),String(seat),tag,String(maxNodes)],{cwd:root,encoding:"utf8"});
 const elapsedMs=Date.now()-t0;
 if(r.status!==0)return {ok:false,tag,elapsedMs,stderr:(r.stderr||"").slice(-400)};
 const file=path.join(outDir,`replay-det-map${map}-seat${seat}-${tag}.json`);
 const data=JSON.parse(fs.readFileSync(file,"utf8"));
 return {ok:true,tag,elapsedMs,file:path.relative(root,file),winner:data.winner,ending:data.ending,plies:data.plies,digest:data.decisionDigest,distanceCache:data.distanceCache,steps:data.steps};
}

const checks=[];
for(const {map,seat} of configs){
 const node=`m${map}s${seat}`;
 const a=runReplay(map,seat,`${node}-run1`),b=runReplay(map,seat,`${node}-run2`);
 let consistent=false,firstDivergence=null,reason=null;
 if(!a.ok||!b.ok){
  reason=!a.ok?`run1 failed: ${a.stderr||"unknown"}`:`run2 failed: ${b.stderr||"unknown"}`;
 }else if(a.digest!==b.digest){
  const n=Math.min(a.steps.length,b.steps.length);
  for(let i=0;i<n;i++){
   const x=a.steps[i],y=b.steps[i];
   if(JSON.stringify(x.action)!==JSON.stringify(y.action)){firstDivergence={ply:i,run1:x.action,run2:y.action};break;}
  }
  if(!firstDivergence)firstDivergence={ply:n,run1:`plies=${a.steps.length}`,run2:`plies=${b.steps.length}`};
  reason="decision digests differ";
 }else if(a.winner!==b.winner||a.ending!==b.ending||a.plies!==b.plies){
  reason="same digest but differing outcome metadata";
 }else consistent=true;
 const pre=PRE_OPTIMISATION_DIGESTS[`${map}-${seat}`];
 checks.push({
  map,seat,consistent,reason,firstDivergence,
  preOptimisationDigest:pre||null,
  matchesPreOptimisation:pre&&a.ok?a.digest.startsWith(pre):null,
  run1:{winner:a.winner,ending:a.ending,plies:a.plies,digest:a.digest,elapsedMs:a.elapsedMs,distanceCache:a.distanceCache},
  run2:{winner:b.winner,ending:b.ending,plies:b.plies,digest:b.digest,elapsedMs:b.elapsedMs},
 });
 console.log("DETERMINISM",`map${map}-seat${seat}`,consistent?"REPRODUCIBLE":"MISMATCH",checks.at(-1).run1.digest?.slice(0,12),`${checks.at(-1).run1.elapsedMs}ms/${checks.at(-1).run2.elapsedMs}ms`);
}

const pass=checks.every(x=>x.consistent)&&checks.every(x=>x.matchesPreOptimisation!==false);
const report={schema:"g5-determinism-gate-v1",date:new Date().toISOString().slice(0,10),pass,
 deterministic:{enabled:true,maxNodes:maxNodes||null},
 optimisations:{distanceMemoCache:checks[0]?.run1?.distanceCache?.enabled??null},
 equivalenceWithPreOptimisation:checks.every(x=>x.matchesPreOptimisation===true),
 configs:checks.length,reproducibleConfigs:checks.filter(x=>x.consistent).length,checks};
const out=path.join(outDir,"determinism-gate.json");
fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify({pass,configs:checks.length,reproducible:report.reproducibleConfigs,equivalentToPreOptimisation:report.equivalenceWithPreOptimisation,out}));
if(!pass)process.exitCode=1;
