"use strict";
const fs=require("fs"),vm=require("vm"),path=require("path"),{engine}=require("../train.cjs"),{move}=require("../league/agent.cjs");
const root=path.resolve(__dirname,"../.."),ctx={console,Date,Math,Map,Set,Float32Array,Float64Array,Uint8Array};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,"xiaodi-engine.js"),"utf8"),ctx);
const roster=JSON.parse(fs.readFileSync(path.join(root,"training/league/population-g4-top5-v11.json"),"utf8")),p=roster.agents.find(x=>x.id==="g4-h13");
const rocks=[{x:3,y:2},{x:3,y:3},{x:7,y:2},{x:2,y:4},{x:4,y:5},{x:5,y:5},{x:0,y:8},{x:3,y:9},{x:5,y:9},{x:6,y:9}];engine.setRocks(rocks);
const s={players:[{x:7,y:12},{x:1,y:0}],dirs:[null,null],walls:[],left:[5,5]},map={rocks};const action=ctx.MumuXiaodi.choose(engine,s,1,map,260);if(!action)throw Error("No browser action");
const next=engine.hellApply(s,1,action);if(!next||!next.players[1])throw Error("Invalid browser action");console.log("XIAODI_RUNTIME_OK",JSON.stringify({action,genome:p.id}));
