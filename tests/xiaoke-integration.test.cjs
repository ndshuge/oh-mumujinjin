'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('小克进入可选难度，而不只是独立预览',()=>{
 const html=read('index.html'),game=read('game.js');
 const options=html.match(/<div class="ai-levels"[^>]*>([\s\S]*?)<\/div>/);
 assert.ok(options,'AI selector missing');
 assert.match(options[1],/id="ai-xiaoke"/);
 assert.match(options[1],/id="ai-xiaoke"[^>]*selected|selected[^>]*id="ai-xiaoke"/);
 assert.match(game,/xiaoke/);
});
test('先屏的头像、标题、话语不应该出现木木/小白',()=>{
 const html=read('index.html');
 assert.match(html, /class="mascot-guide mascot-v8 mascot-xiaoke/);
 assert.match(html, /id="mascotTap"[^>]*data-persona="xiaoke"/);
 assert.match(html, /id="mascotRole">小克/);
 assert.match(html, /id="mascotMessage">[⌁░▒▓⟡]/u);
 assert.match(html, /id="aiOpponentNameBadge">小克/);
});
test('小克不冒用任何已存在的中迪/小迪引擎',()=>{
 const game=read('game.js');
 assert.match(game,/state\.aiLevel\s*===\s*"xiaoke"/);
 assert.match(game,/waiting-ai/);
 assert.doesNotMatch(game,/xiaoke.*zhongdiChooseAction/);
});
test('上线版本必须刷新所有已修改的脚本 URL，避免旧资源与新页面混用',()=>{
 const h=read('index.html');
 for(const name of ['mobile.js','ui-ai-presets-v9.js']){
   assert.match(h,new RegExp(name.replaceAll('.','\\.')+'\\?v=xiaoke-20261106-r2'));
 }
});
test('页面资源版本与按需加载代码一致',()=>{assert.ok(read('index.html').includes('game.js?v=invite-polish-20261107-r1'))});
test('双指缩放拦截，一指滑动保留',()=>{
 const html=read('index.html'),js=read('viewport-guard.js');
 assert.match(html, /user-scalable=no/);
 assert.match(html,/viewport-guard\.js/);
 assert.match(js,/gesturestart/);
 assert.match(js,/touches\.length\s*>\s*1/);
 assert.match(js,/passive:\s*false/);
 assert.match(js,/preventDefault/);
});
test('存档读取强校验，恢复前避免调用 drawUI',()=>{
 const game=read('game.js');
 assert.match(game,/function validSavedState/);
 assert.match(game,/validSavedState\(parsed\.state\)/);
 assert.match(game,/mumujinjin-invalid-save-backup-v1/);
});
