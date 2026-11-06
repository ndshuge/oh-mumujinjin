'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
test('classic and advanced frozen policies select different champion configurations',()=>{
 const s=fs.readFileSync(path.join(root,'xiaoke-ai-engine.js'),'utf8');
 const worker={};vm.runInNewContext(s,{self:worker,Date,Math,Set,Map,JSON,Number,Uint32Array,Int32Array,Float64Array,Array,console});
 assert.equal(worker.MMJJXiaokeEngine.policy('classic').label,'ab8-e2rc');
 assert.equal(worker.MMJJXiaokeEngine.policy('advanced').label,'ab8');
});
test('static worker and client are wired to existing playable XiaoKe game',()=>{
 const game=fs.readFileSync(path.join(root,'game.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(fs.existsSync(path.join(root,'xiaoke-ai-worker.js')));
 assert.ok(fs.existsSync(path.join(root,'xiaoke-ai-client.js')));
 assert.ok(html.includes('xiaoke-ai-client.js'));
 assert.ok(game.includes('xiaokeChooseTurn'));
 assert.ok(!game.includes('state.aiLevel==="xiaoke"||state.phase!=="play"'));
 assert.ok(!game.includes('aiLevel!=="xiaoke")beginRps()'));
 assert.ok(!html.includes('小克模型正在接入，暂不能开始人机对局'));
});
