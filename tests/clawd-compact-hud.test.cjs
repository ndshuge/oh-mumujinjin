'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('Clawd 像素小螃蟹用在棋盘、设置入口及预览中',()=>{
 const html=read('index.html'),css=read('xiaoke-preview.css');
 assert.equal((html.match(/src="\.\/xiaoke-clawd\.svg"/g)||[]).length,3);
 assert.doesNotMatch(html,/src="\.\/claude-avatar\.svg"/);
 assert.match(css,/pixelated/);
 const svg=read('xiaoke-clawd.svg');
 assert.match(svg,/shape-rendering="crispEdges"/);
 assert.match(svg,/fill="#D97757"/i);
 assert.match(svg,/fill="#2D2724"/i);
 assert.ok((svg.match(/<rect /g)||[]).length>=7,'pixel shell, claws, four legs and square eyes');
});

test('不出现任何遮挡棋盘的展开角色对话浮层或底部长说明条',()=>{
 const html=read('index.html'),script=read('ui-mascot-v8.js');
 assert.doesNotMatch(html,/id="mascotExpanded"/);
 assert.doesNotMatch(html,/id="xiaokeStatusNotice"/);
 assert.doesNotMatch(html,/aria-controls="mascotExpanded"/);
 assert.doesNotMatch(script,/popup\.hidden\s*=\s*!open|show\(true\)/);
 assert.match(script,/xiaokeLine\s*=\s*xiaokePersona\.nextLine\("tap"\)/);
 assert.match(read('xiaoke-preview.css'),/#aiBanter\s*\{\s*display:\s*none\s*!important/);
 assert.doesNotMatch(read('game.js'),/\$\("xiaokeStatusNotice"\)\.hidden/);
});

test('清掉遮挡层后仍保留顶部小气泡和主动打开的角色预览',()=>{
 const html=read('index.html');
 assert.match(html,/id="mascotMessage"/);
 assert.match(html,/id="xiaokePreviewDialog"/);
 assert.match(html,/id="xiaokePreviewBtn"/);
 assert.match(html,/id="xiaokePendingHint"/);
});
