"use strict";
// Read-only scoreboard: only outcomes, no move transcripts.
// Usage: node training/g3/status.cjs [generation] [rounds] [budget] [seed]
const fs=require("fs"),path=require("path");
const g=Number(process.argv[2]??0),rounds=Number(process.argv[3]??3),
 budget=Number(process.argv[4]??180),seed=Number(process.argv[5]??20261014);
if(![g,rounds,budget,seed].every(Number.isInteger))throw Error("Bad scoreboard arguments");
const dir=path.join(__dirname,"..","output","lab","g3"),popPath=path.join(__dirname,"population-g"+g+".json");
const roster=JSON.parse(fs.readFileSync(popPath,"utf8"));
const standings=new Map(roster.agents.map(a=>[a.id,{id:a.id,
  kind:a.family==="search"?"搜索":a.family==="hybrid"?"混合":a.models?.length?"神经网络":"PUCT",
  w:0,l:0,d:0,games:0,points:0,density:{sparse:0,medium:0,dense:0}}]));
let matches=0,goals=0,noMovement=0,draws=0;
const mapCounts={sparse:0,medium:0,dense:0};
for(let r=0;r<rounds;r++){
 const p=path.join(dir,"gen"+g+"-round"+r+"-b"+budget+"-s"+seed+".results.jsonl");
 if(!fs.existsSync(p))continue;
 for(const line of fs.readFileSync(p,"utf8").split("\n")){
  if(!line)continue;
  const m=JSON.parse(line);
  if(!standings.has(m.player0)||!standings.has(m.player1)||m.round!==r)throw Error("Unknown result");
  matches++;mapCounts[m.density]++;
  if(m.ending==="goal")goals++;else if(m.ending==="noMovement")noMovement++;else draws++;
  for(const id of [m.player0,m.player1]){
   const s=standings.get(id);s.games++;const value=m.winner===null?.5:m.winner===id?1:0;
   s.points+=value;s.density[m.density]+=value;
   if(m.winner===null)s.d++;else if(m.winner===id)s.w++;else s.l++;
  }
 }
}
const table=[...standings.values()].map(s=>({...s,winRate:s.games?s.points/s.games:0}))
 .sort((a,b)=>b.points-a.points||a.id.localeCompare(b.id));
let out="# 木木金金棋 G3 实时进化战报 · 第 "+g+" 代\n\n"+
 "已完成 **"+matches+" / "+(rounds*32)+"** 场，行动合法性由 game.js 校验；"+
 "只记录对战胜负，不保存逐手走棋。\n\n"+
 "稀疏图："+mapCounts.sparse+" 场；中密图："+mapCounts.medium+" 场；密集图："+mapCounts.dense+" 场。"+
 "终局：到达目标 "+goals+" 场，受困 "+noMovement+" 场，平局 "+draws+" 场。\n\n"+
 "注意：这是进行中的开发赛，不同 AI 可能已比赛局数不同，**临时名次不代表真实强弱**。\n\n"+
 "| 暂列 | AI | 类型 | 胜-负-和 | 得分 | 场数 |\n|---:|---|---|---|---:|---:|\n";
table.forEach((s,i)=>out+="| "+(i+1)+" | "+s.id+" | "+s.kind+" | "+s.w+"-"+s.l+"-"+s.d+
 " | "+s.points.toFixed(1)+" | "+s.games+" |\n");
const file=path.join(dir,"LIVE_G"+g+"_RESULTS.md");
fs.writeFileSync(file,out);
console.log("G3_LIVE_SCOREBOARD",JSON.stringify({generation:g,played:matches,target:rounds*32,
  winners:table.slice(0,8).map(s=>({id:s.id,w:s.w,l:s.l,d:s.d,games:s.games})),
  density:mapCounts,report:file}));
