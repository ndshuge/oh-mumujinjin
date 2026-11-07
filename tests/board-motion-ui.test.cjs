const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const game=()=>fs.readFileSync('game.js','utf8');
test('Canvas characters are layered illustration, not old plain outlined circles',()=>{
 const s=game();const p=s.slice(s.indexOf('function drawGoldMascot'),s.indexOf('function drawBoard(){'));
 assert.match(p,/safeGradient/);assert.match(p,/ellipse\(/);assert.match(p,/quadraticCurveTo/);assert.match(p,/drawGoldMascot/);assert.match(p,/drawWoodMascot/);

});
test('piece motion is bounded to short requestAnimationFrame transitions and respects reduced motion',()=>{
 const s=game();assert.match(s,/pieceVisual/);assert.match(s,/requestAnimationFrame/);assert.match(s,/prefers-reduced-motion/);assert.match(s,/performance\.now\(/);
 assert.match(s,/\b220\b|\b240\b|\b250\b/);
});
test('board canvas geometry and logical hit target remain intact',()=>{
 const s=game();assert.match(s,/function drawBase\(\)/);assert.match(s,/function tileAt\(/);assert.match(s,/function drawBoard\(\)/);
});
