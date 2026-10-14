"use strict";
// Synthetic genome construction test, NOT a fake arena or strength evaluation.
// Validates future 64-player breeding without consuming a completed league.
const fs=require("fs"),path=require("path"),vm=require("vm");
const {check}=require("../league/agent.cjs");
const src=fs.readFileSync(path.join(__dirname,"select64.cjs"),"utf8");
const from=src.indexOf("let rnd="),to=src.indexOf("const nextFile=");
if(from<0||to<=from)throw Error("Breeder source structure changed");
const old=JSON.parse(fs.readFileSync(path.join(__dirname,"population-g0-64.json"),"utf8"));
const classify=a=>a.family==="search"?"search":a.family==="hybrid"?"hybrid":a.models?.length?"neural":"rule-puct";
const grades=old.agents.map(a=>({id:a.id,family:classify(a),score:1,winRate:1,
 games:12,opponentScore:1}));
const kinds=["search","rule-puct","neural","hybrid"];
const winners=kinds.flatMap(type=>grades.filter(x=>x.family===type).slice(0,8));
const ctx={seed:20261014,g:0,check,leaderboard:grades,kinds,genes:new Map(old.agents.map(a=>[a.id,a])),
 classify,winners,JSON,Map,Set,Math,Number,String,Array};
vm.runInNewContext(src.slice(from,to)+"\nthis.exam={nextAgents:newAgents,births,newCount};",ctx);
const out=ctx.exam;
if(out.nextAgents.length!==64||out.births.length!==32)throw Error("Bad offspring size");
for(const gene of out.nextAgents)check(gene);
const actual=Object.fromEntries(kinds.map(type=>[type,out.nextAgents.filter(a=>classify(a)===type).length]));
if(kinds.some(type=>actual[type]!==16))throw Error("Families not protected "+JSON.stringify(actual));
const odd=out.births.filter(x=>x.mutation);
console.log("G4_BREED_UNIT_PASS",JSON.stringify({contenders:64,descendants:32,survivors:32,
 protectedFamilies:actual,oddExamples:odd.slice(0,4).map(x=>x.mutation),note:"synthetic only; not game wins"}));
