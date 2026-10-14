"use strict";
// G4 selection v2: read-only statistical advisor for existing outcome-only logs.
// Never executes matches, overwrites genomes, trains neural weights, or deploys.
// Produces explicit provisional status while a season is running.
const fs=require("fs"),path=require("path");
const [rosterName="population-g0-64.json",roundsString="6",budgetString="260",seedString="20261014"]=process.argv.slice(2);
const rounds=Number(roundsString),budget=Number(budgetString),seed=Number(seedString);
if(!/^population-g\d+-64\.json$/.test(rosterName)||![rounds,budget,seed].every(Number.isInteger)||
 rounds<3||rounds>21||budget<50||budget>6000)throw Error("Usage: selection-advisor.cjs population-g0-64.json rounds budget seed");
const root=__dirname,lab=path.join(root,"..","output","lab","g4");
const population=JSON.parse(fs.readFileSync(path.join(root,rosterName),"utf8"));
const policy=JSON.parse(fs.readFileSync(path.join(root,"selection-policy-v2.json"),"utf8"));
const category=p=>p.family==="search"?"search":p.family==="hybrid"?"hybrid":p.models?.length?"neural":"rule-puct";
const members=new Map(population.agents.map(p=>[p.id,{genome:p,id:p.id,family:category(p),
 wins:0,losses:0,draws:0,games:0,points:0,
 byDensity:{sparse:{games:0,points:0},medium:{games:0,points:0},dense:{games:0,points:0}},
 opponents:[],pairedScores:[]}]));
if(members.size!==64)throw Error("Invalid population size");
const finishedMaps=new Set(),roundCompletes=[],pendingPairs=[];let games=0,illegal=0;
const score=(m,id)=>m.winner===null?.5:m.winner===id?1:0;
for(let round=0;round<rounds;round++){
 const tag="gen"+population.generation+"-round"+round+"-b"+budget+"-s"+seed,
 outcome=path.join(lab,tag+".results.jsonl"),receipt=path.join(lab,tag+".report.json");
 if(!fs.existsSync(outcome))continue;
 const events=fs.readFileSync(outcome,"utf8").split("\n").filter(Boolean).map(JSON.parse);
 const paired=new Map();
 for(const [ix,m] of events.entries()){
  if(m.round!==round||m.game!==ix+1||!members.has(m.player0)||!members.has(m.player1)||
   m.player0===m.player1||m.illegal!==0||!["sparse","medium","dense"].includes(m.density))
   throw Error("Invalid outcome "+tag+" index "+ix);
  games++;illegal+=m.illegal;
  finishedMaps.add(m.mapHash);
  for(const [id,opp] of [[m.player0,m.player1],[m.player1,m.player0]]){
   const x=members.get(id),v=score(m,id);
   x.games++;x.points+=v;x.opponents.push(opp);
   x.byDensity[m.density].games++;x.byDensity[m.density].points+=v;
   if(m.winner===null)x.draws++;
   else if(m.winner===id)x.wins++;
   else x.losses++;
  }
  const arr=paired.get(m.pairIndex)||[];arr.push(m);paired.set(m.pairIndex,arr);
 }
 for(const [pairId,events] of paired){
  if(events.length===2){
   const [a,b]=events;
   if(a.seat===b.seat||a.player0!==b.player1||a.player1!==b.player0)
    throw Error("Broken mirrored pair "+tag+" "+pairId);
   for(const p of [a.player0,a.player1]){
    const x=members.get(p);
    x.pairedScores.push((score(a,p)+score(b,p))/2);
   }
  }else{
   pendingPairs.push({round,pair:pairId,events:events.length});
  }
 }
 if(fs.existsSync(receipt)){
  const r=JSON.parse(fs.readFileSync(receipt,"utf8"));
  if(!r.complete||r.illegal!==0||r.matches!==64||events.length!==64)
   throw Error("Incomplete accepted round "+tag);
  roundCompletes.push(round);
 }
}
const complete=roundCompletes.length===rounds&&games===64*rounds&&pendingPairs.length===0;
function pairedInterval(pairs,salt){
 if(!pairs.length)return [0,1];
 let state=0x9E3779B9;
 for(const c of salt)state=(Math.imul(state,31)+c.charCodeAt(0))>>>0;
 const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
 const samples=[];
 for(let n=0;n<1500;n++){
  let total=0;
  for(let j=0;j<pairs.length;j++)total+=pairs[Math.floor(random()*pairs.length)];
  samples.push(total/pairs.length);
 }
 samples.sort((a,b)=>a-b);
 return [samples[Math.floor(.025*samples.length)],samples[Math.floor(.975*samples.length)]];
}
const list=[...members.values()];
for(const x of list){
 x.rate=x.games?x.points/x.games:0;
 x.interval=pairedInterval(x.pairedScores,x.id);
 x.opponentRate=x.opponents.length?
  x.opponents.reduce((sum,id)=>sum+(members.get(id).games?members.get(id).points/members.get(id).games:.5),0)/x.opponents.length:.5;
 x.worstDensity=Math.min(...Object.values(x.byDensity).filter(d=>d.games).map(d=>d.points/d.games).concat([1]));
 const g=x.genome;
 x.mutationStyle=!!g.mutation||g.c<=.4||g.c>=2.8||g.searchShare===.25||g.searchShare===.75||
  g.priorMix>=.55||g.valueMix>=.5||g.depth>=4;
 // Heuristic shortlist ONLY: not Elo, not a calibrated win probability.
 x.screenScore=.5*x.rate+.2*x.interval[0]+.15*x.opponentRate+.15*x.worstDensity;
}
const groups=["search","rule-puct","neural","hybrid"],selections=[],categories={};
for(const family of groups){
 const ranked=list.filter(x=>x.family===family).sort((a,b)=>b.screenScore-a.screenScore||a.id.localeCompare(b.id));
 if(ranked.length!==16)throw Error("Family of 16 invalid "+family);
 const top=ranked.slice(0,3),others=ranked.slice(3);
 const median=ranked[7].rate;
 const alternative=others.filter(x=>x.mutationStyle&&x.rate>=median-.1)
   .sort((a,b)=>b.worstDensity-a.worstDensity||b.screenScore-a.screenScore)[0];
 const fourth=alternative||others[0],selected=[...top,fourth];
 categories[family]={members:ranked.length,topThree:top.map(x=>x.id),
  specialistSlot:fourth.id,specialistSlotReason:alternative?"preserve counter-style/novelty with competitive score":"best remaining overall"};
 for(const [slot,x] of selected.entries())selections.push({id:x.id,family,
  path:slot===3?"specialist-or-fourth":"overall",games:x.games,wins:x.wins,losses:x.losses,
  draws:x.draws,rate:x.rate,paired95:x.interval,screenScore:x.screenScore,
  hardestDensity:x.worstDensity,opponentRate:x.opponentRate,mutationStyle:x.mutationStyle});
}
const output={
 schema:"g4-staged-selection-plan-v2",generation:population.generation,roster:rosterName,
 basedOn:{matches:games,expected:64*rounds,complete,
 acceptedRounds:roundCompletes.length,rounds,uniqueLayouts:finishedMaps.size,illegal,
 pairedSeatComplete:pendingPairs.length===0,pendingPairCount:pendingPairs.length,
 note:"All participant scores are uncalibrated, based on different opponents and few maps"},
 status:complete?"screening_complete_shortlist_PROPOSAL_ONLY":"PROVISIONAL_NOT_FOR_SELECTION",
 shortlistIsValid:complete,
 protectedFamilies:categories,shortlist:complete?selections:[],
 provisionalFavorites:!complete?selections.map(x=>({id:x.id,family:x.family,games:x.games,rate:x.rate})):[],
 nextStages:policy.stageB&&[policy.stageB,policy.stageC,policy.stageD],
 operationalGates:{
 stageBStartOnlyAfterComplete:true,stageBNeverUsesSealedMaps:true,
 stageDRequiresFreshNewMapsAndLockedChampion:true,
 noAutomaticPromotion:true
 }
};
const dest=path.join(lab,"STAGED_SELECTION_ADVICE_G"+population.generation+".json");
fs.writeFileSync(dest,JSON.stringify(output,null,2));
let md="# 木木金金棋 G4 · 自适应选育建议\n\n"+
 "**状态："+output.status+"**。已赛 "+games+"/"+(64*rounds)+"，已验收轮 "+roundCompletes.length+"/"+rounds+
 "，完整换手检查："+(pendingPairs.length?"仍有部分单局未配对":"通过")+"；非法行动："+illegal+"。\n\n"+
 "只有全部完成后，下面的名单才可视为进入二阶段的正式**候选提议**，不是获得冠军。\n\n"+
 "| 分支 | 进入第二阶段的预估选手 | 暂得分 | 经验配对 95% 区间 | 已赛 |\n|---|---|---:|---|---:|\n";
for(const x of selections)md+="| "+x.family+" | "+x.id+(x.path==="specialist-or-fourth"?"（专精/保种）":"")+" | "+
 (x.rate*100).toFixed(1)+"% | "+x.paired95.map(v=>(v*100).toFixed(0)+"%").join("–")+" | "+x.games+" |\n";
md+="\n## 高效计算漏斗\n\n64 人首轮每人 12 局，共 **384 局** → 16 人挑战共同基准、每人 24 局，共 **384 局** → 4 人每人 100 局，共 **400 局** → 1–2 人进入真正封闭的每人 1000 局闸门。\n"+
 "\n要防止假进步：各家族各占四席；每家族前三名按总表现，一名偏向战术多样性。所有较强候选必须在相同地图与 V1.1 比赛，最终独立新图在方案冻结前不能被查看或调参。\n"+
 "\n该评分仅用于调度，不是 Elo，也不是已证实的棋力提升。历史冠军库作为额外克星压力池，正式晋级还需真机 Web Worker 性能。\n";
fs.writeFileSync(dest.replace(/\.json$/,".md"),md);
console.log("G4_SELECTION_ADVISOR",JSON.stringify({status:output.status,played:games,
 acceptedRounds:roundCompletes.length,shortlistReady:complete,
 provisional:selections.slice(0,8).map(x=>({id:x.id,family:x.family,rate:x.rate})),
 output:dest}));
