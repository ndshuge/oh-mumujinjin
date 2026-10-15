"use strict";
// Verify browser Zhongdi decisions against the exact G5 training strategy.
const fs=require("fs"),vm=require("vm"),assert=require("assert"),path=require("path");
const root=path.resolve(__dirname,"..");process.chdir(root);
const source=fs.readFileSync("zhongdi-engine.js","utf8");
const browser={};
vm.runInNewContext(source,{window:browser,Float32Array,Float64Array,Uint8Array,Set,Map,Math,Number,Date,console},{timeout:30000});
assert(browser.MumuZhongdi&&browser.MumuZhongdi.id==="zhongdi-g5-phase-defense","Browser Zhongdi missing");
const {engine:e,mapGen}=require("./train.cjs"),phase=require("./zhongdi-freeze/training/phase-defense.cjs"),policy=require("./zhongdi-freeze/training/policy.cjs");
let tested=0,changed=0;
for(let m=0;m<4;m++){
 const map=mapGen(m),rocks=map.rocks;
 e.setRocks(rocks);
 let state={players:e.terrain.CAMPS.map(a=>({...a[1]})),dirs:[null,null],walls:[],left:[5,5]};
 for(let turn=0;turn<3;turn++){
  const side=(m+turn)%2;
  const expected=phase.move(e,state,side,map,"phase-defense",{nodes:100}).action;
  const actual=browser.MumuZhongdi.chooseRaw(e,state,side,map,100);
  assert.strictEqual(policy.encode(actual),policy.encode(expected),"Frozen G5 browser mismatch map="+m+" turn="+turn);
  const wrapped=browser.MumuZhongdi.choose(e,state,side,map);
  assert.strictEqual(!!wrapped.wall,!!actual.wall,"Wrong wall bridge");
  if(actual.wall)assert.deepStrictEqual(JSON.parse(JSON.stringify(wrapped.wall)),JSON.parse(JSON.stringify(actual.wall)));
  else {
   assert(wrapped.move&&wrapped.move.p,"Missing game movement bridge");
   assert.strictEqual(wrapped.warp,!!actual.warp,"Wrong portal decision");
  }
  const baseline=require("./zhongdi-freeze/training/league/agent.cjs").move(e,state,side,map,require("./zhongdi-freeze/training/league/population-g4-top5-v11.json").agents.find(x=>x.id==="g4-h13"),160,{deterministic:true,maxNodes:100}).action;
  if(policy.encode(expected)!==policy.encode(baseline))changed++;
  state=e.hellApply(state,side,expected);
  tested++;
 }
}
const html=fs.readFileSync("index.html","utf8"),game=fs.readFileSync("game.js","utf8");
assert(html.includes('id="ai-zhongdi"')&&html.includes('id="aiOpponentNameBadge"')&&html.includes('id="aiOpponentChatName"'),"Name UI missing");
assert(html.includes('src="./zhongdi-engine.js?v='),"Zhongdi script missing");
assert(game.includes('playMode:"cpu",aiLevel:"zhongdi"'),"Default Zhongdi not set");
assert(game.includes('window.MumuZhongdi.choose')&&game.includes('aiOpponentName()+" · 电脑对手"'),"Routing/name integration missing");
console.log("ZHONGDI_BROWSER_REGRESSION_PASS",JSON.stringify({exactTrainingChoices:tested,differentFromG4:changed,default:"zhongdi",names:"dynamic"}));
