'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('默认小克首屏只下载棋盘脚本，大型 AI 引擎不阻塞 DOMContentLoaded',()=>{
 const html=read('index.html');
 assert.doesNotMatch(html,/<script[^>]+src="\.\/(xiaodi|zhongdi)-engine\.js/);
 const loader=html.indexOf('src="./ai-engine-loader.js');
 const game=html.indexOf('src="./game.js');
 assert.ok(loader>0&&loader<game, 'loader is registered before game.js');
});
test('需要时加载对应引擎，防止重复请求且不会加载另一个引擎',async()=>{
 const files=[],win={};
 const doc={head:{appendChild(s){files.push(s);}},createElement(){return {async:false,src:'',onload:null,onerror:null}}};
 vm.runInNewContext(read('ai-engine-loader.js'),{window:win,document:doc,Promise});
 assert.equal(files.length,0,'initial display must not download AI weights');
 const a=win.MMJJEnsureAIEngine('zhongdi'),b=win.MMJJEnsureAIEngine('zhongdi');
 assert.equal(files.length,1);
 assert.match(files[0].src,/zhongdi-engine\.js/);
 assert.equal(files[0].async,true);
 win.MumuZhongdi={choose(){}};
 files[0].onload();
 await Promise.all([a,b]);
 await win.MMJJEnsureAIEngine('zhongdi');
 assert.equal(files.length,1);
 const x=win.MMJJEnsureAIEngine('xiaodi');
 assert.equal(files.length,2);
 assert.match(files[1].src,/xiaodi-engine\.js/);
 win.MumuXiaodi={choose(){}};
 files[1].onload();
 await x;
 await win.MMJJEnsureAIEngine('xiaoke');
 assert.equal(files.length,2);
});
test('脚本请求失败可重新加载，不会伪装其他对手',async()=>{
 const pending=[],win={};
 const doc={head:{appendChild(s){pending.push(s);}},createElement(){return {}}};
 vm.runInNewContext(read('ai-engine-loader.js'),{window:win,document:doc,Promise});
 const a=win.MMJJEnsureAIEngine('xiaodi');
 pending[0].onerror();
 await assert.rejects(a);
 const b=win.MMJJEnsureAIEngine('xiaodi');
 assert.equal(pending.length,2);
 win.MumuXiaodi={id:'real'};
 pending[1].onload();
 await b;
 assert.equal(win.MumuZhongdi,undefined);
});
test('网络失败后再次点击选中对手会重试加载，加载成功后恢复电脑走棋',()=>{
 const game=read('game.js');
 assert.match(game,/if\(state\.playMode==="cpu"&&state\.aiLevel===level\)\{preloadSelectedEngine\(\);return;\}/);
 assert.match(game,/MMJJEnsureAIEngine\(level\)\.then\(function\(\)\{/);
});
test('电脑回合等待对应 AI 模型真正就绪，点击选择后预先发起下载',()=>{
 const game=read('game.js');
 assert.match(game,/MMJJEnsureAIEngine\(level\)/);
 assert.match(game,/MMJJEnsureAIEngine\(waitingLevel\)/);
 assert.match(game,/if\(engineName&&!window\[engineName\]\)/);
 assert.doesNotMatch(game,/MumuZhongdi\s*\|\|\s*window\.MumuXiaodi/);
});
