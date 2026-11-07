const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const game=()=>fs.readFileSync('game.js','utf8');
test('gold and wood use distinct original mascot silhouettes and team accessories',()=>{
 const s=game();
 assert.match(s,/function drawGoldMascot\(/);
 assert.match(s,/function drawWoodMascot\(/);
 assert.match(s,/gold.*(ear|acorn|tail)|(?:ear|acorn|tail).*gold/is);
 assert.match(s,/wood.*(leaf|wing|crest)|(?:leaf|wing|crest).*wood/is);
});
test('characters react to turn, pending action and finished winner states',()=>{
 const s=game(),p=s.slice(s.indexOf('function drawGoldMascot'),s.indexOf('function drawBoard(){'));
 assert.match(p,/state\.turn/);
 assert.match(p,/state\.pending/);
 assert.match(p,/state\.phase/);
 assert.match(p,/state\.winner/);
 assert.match(p,/emotion==='joy'/);assert.match(p,/focused/);assert.match(p,/quadraticCurveTo/);assert.match(p,/ctx\.arc/);
});
test('movement has a bounded landing squash and turn reveal without an idle animation loop',()=>{
 const s=game(),p=s.slice(s.indexOf('function drawPawn(i)'),s.indexOf('function drawBoard(){'));
 assert.match(p,/landStart/);
 assert.match(p,/squash/);
 assert.match(s,/turnPulseStart/);
 assert.match(s,/pieceAnimating\s*&&\s*!pieceFrame/);
 assert.doesNotMatch(s,/requestAnimationFrame\s*\(\s*function\s*\(\)\s*\{\s*drawBoard\(\)/);
});
test('reduced motion and hidden tabs cancel scheduled animation frames',()=>{
 const s=game();
 assert.match(s,/prefers-reduced-motion/);
 assert.match(s,/visibilitychange/);
 assert.match(s,/cancelAnimationFrame/);
});
test('visual treatment keeps logical board dimensions and hit testing unchanged',()=>{
 const s=game();
 assert.match(s,/function drawBase\(\)/);
 assert.match(s,/function tileAt\(/);
 assert.match(s,/STEP\s*=\s*65/);
});

test('mascot renderer falls back safely when a minimal canvas has no gradient implementation',()=>{
 const s=game();
 assert.match(s,/function safeGradient\(/);
 assert.match(s,/gradient&&typeof gradient\.addColorStop==='function'/);
 assert.match(s,/return fallback/);
 assert.match(s,/safeGradient\(/);
});
