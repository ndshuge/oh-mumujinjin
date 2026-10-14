"use strict";
const fs=require("fs"),path=require("path"),root=path.resolve(__dirname,"../.."),lab=path.join(root,"training/output/lab/g5");
const base=JSON.parse(fs.readFileSync(path.join(lab,"three-opponent-baseline.json"),"utf8"));
if(base.totalGames!==300||base.rows.length!==5)throw Error("Frozen baseline incomplete");
const champion=base.rows.slice().sort((a,b)=>b.worstScoreRate-a.worstScoreRate||b.meanScoreRate-a.meanScoreRate)[0];
if(champion.id!=="g4-h13")throw Error("Champion changed unexpectedly");
const candidate=JSON.parse(fs.readFileSync(path.join(lab,"n64-frozen-vs-g5-candidate-validation.json"),"utf8"));
const same=Object.values(candidate.byType).every(g=>["correct","ce","value"].every(k=>g[k+"A"]===g[k+"B"]));
// Determinism gate. Authoritative source is the two-process deterministic
// comparison. The legacy replay-acceptance.json compared a wall-clock arena
// record against a wall-clock replay, so it could only ever fail by
// construction; it is retained as a superseded reference, not as a gate.
const determinism={status:"NOT_RUN",reference:null,maxNodes:null,legacyDeprecated:null};
const gateFile=path.join(lab,"determinism-gate.json");
if(fs.existsSync(gateFile)){
 const gate=JSON.parse(fs.readFileSync(gateFile,"utf8"));
 determinism.reference="training/output/lab/g5/determinism-gate.json";
 determinism.maxNodes=gate.deterministic?gate.deterministic.maxNodes:null;
 determinism.status=gate.pass?`PASS_${gate.reproducibleConfigs}_OF_${gate.configs}`:`FAIL_${gate.configs-gate.reproducibleConfigs}_OF_${gate.configs}`;
}
const legacyFile=path.join(lab,"replay-acceptance.json");
if(fs.existsSync(legacyFile)){
 const legacy=JSON.parse(fs.readFileSync(legacyFile,"utf8"));
 determinism.legacyDeprecated={reference:"training/output/lab/g5/replay-acceptance.json",pass:legacy.pass,supersededBy:determinism.reference,reason:"Wall-clock arena record vs wall-clock replay: mismatch is expected and carries no signal about rule correctness."};
}
const state={schema:"g5-single-source-of-truth-v1",date:"2026-10-14",mission:"Human Gate Ready, then genuine expert human validation",champion:{id:champion.id,developmentGames:60,worstOpponentScore:champion.worstScoreRate,meanScore:champion.meanScoreRate,scores:champion.scores},challenge:{id:"g5-n64-candidate-1",status:same?"REJECTED_NO_MEASURED_CHANGE":"REQUIRES_MATCH",reason:same?"Identical validation outputs to frozen N64":null},determinism,gates:{baseline:"PASS",replayDeterminism:determinism.status,candidateTraining:"REJECTED_DUPLICATE",independentArena:"NOT_STARTED",humanReady:"NOT_STARTED",realHuman:"NOT_STARTED"},nextAction:"Produce one genuinely distinct challenger; test against frozen champion and strong opponent on development maps; promote only on reproducible paired-game evidence.",references:{baseline:"training/output/lab/g5/three-opponent-baseline.json",determinism:"training/output/lab/g5/determinism-gate.json",replay:"training/output/lab/g5/replay-acceptance.json",candidate:"training/output/lab/g5/n64-frozen-vs-g5-candidate-validation.json"},notes:["No online deployment","No sealed-map training","Historical experiments retained but not active gates","Deterministic replay requires searchOptions.deterministic (or maxNodes) to be passed to training/league/agent.cjs move(); the default wall-clock path is unchanged"]};
const out=path.join(lab,"STATUS.json");fs.writeFileSync(out,JSON.stringify(state,null,2));console.log(JSON.stringify({champion:state.champion.id,challenger:state.challenge.status,gates:state.gates,out}));
