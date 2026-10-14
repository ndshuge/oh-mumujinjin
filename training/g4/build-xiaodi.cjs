"use strict";
// Reproducible offline browser build of the frozen G4-h13 hybrid, no external services.
const fs=require("fs"),path=require("path"),vm=require("vm"),root=path.resolve(__dirname,"../..");
const sources={
 "policy":fs.readFileSync(path.join(root,"training/policy.cjs"),"utf8"),
 "puct":fs.readFileSync(path.join(root,"training/puct.cjs"),"utf8").replace(/require\("\.\/policy\.cjs"\)/g,'require("policy")'),
 "model":fs.readFileSync(path.join(root,"training/model-n64.cjs"),"utf8").replace(/require\("fs"\)/g,'require("fs")').replace(/require\("\.\/policy\.cjs"\)/g,'require("policy")'),
 "search":fs.readFileSync(path.join(root,"strong-search-v1.1.js"),"utf8")
};
const weights=JSON.parse(fs.readFileSync(path.join(root,"training/models/policy-value-n64.json"),"utf8"));
const modules=Object.entries(sources).map(([id,src])=>JSON.stringify(id)+":function(require,module,exports){\n"+src+"\n}").join(",\n");
const bundle=`/* Frozen G4-h13 browser runtime; generated from training source. */
(function(global){
"use strict";
const factories={${modules}};
const cache={};
function require(id){if(id==="fs")return{readFileSync:()=>JSON.stringify(WEIGHTS)};if(!factories[id])throw Error("Missing browser module "+id);if(!cache[id]){const m={exports:{}};cache[id]=m;factories[id](require,m,m.exports);}return cache[id].exports;}
const WEIGHTS=${JSON.stringify(weights)};
const search=require("search"),puct=require("puct"),net=require("model"),model=net.restore(WEIGHTS);
const genome={id:"g4-h13",family:"hybrid",engine:"v1.1",depth:2,searchShare:.25,sims:12,c:1.25,priorMix:.5,valueMix:.06};
function rank(engine,state,who,action){if(!action)return -Infinity;const next=engine.hellApply(state,who,action);if(engine.terrain.CAMPS[1-who].some(g=>g.x===next.players[who].x&&g.y===next.players[who].y))return 100000;let val=(who===1?1:-1)*engine.hellEvaluate(next);for(const m of engine.movementOptions(next.players[1-who],next.dirs[1-who],next.walls)){const goal=engine.terrain.CAMPS[who];if(goal.some(g=>g.x===m.p.x&&g.y===m.p.y)){val-=10000;break;}const gate=engine.portal(m.p);if(gate){const dst=gate.a.x===m.p.x&&gate.a.y===m.p.y?gate.b:gate.a;if(goal.some(g=>g.x===dst.x&&g.y===dst.y)){val-=10000;break;}}}return val;}
function choose(engine,state,who,map,timeMs=260){const sb=Math.max(50,Math.round(timeMs*genome.searchShare)),pb=Math.max(50,timeMs-Math.round(timeMs*genome.searchShare));const a=search.choose(engine,state,who,{depth:2,timeMs:sb}).action;const opts={simulations:12,c:1.25,timeMs:pb,priorWeight:.5,valueWeight:.06,prior:(s,p)=>net.predict(model,s,{...map,terrain:engine.terrain},p).policy,value:(s,p)=>net.predict(model,s,{...map,terrain:engine.terrain},p).value};const b=puct.search(engine,state,who,opts).action;return rank(engine,state,who,a)>=rank(engine,state,who,b)?a:b;}
global.MumuXiaodi={id:"g4-h13",choose,genome};
})(typeof window!=="undefined"?window:globalThis);
`;
const out=path.join(root,"xiaodi-engine.js");fs.writeFileSync(out,bundle);new vm.Script(bundle);console.log("XIAODI_BUNDLE_OK",out,Buffer.byteLength(bundle));
