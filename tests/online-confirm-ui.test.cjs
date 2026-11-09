const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const game=()=>fs.readFileSync('game.js','utf8'),hub=()=>fs.readFileSync('friends-hub.js','utf8');
test('online move stages an action and only sends after explicit confirmation',()=>{
 const s=game();
 assert.match(s,/function onlineConfirmDraft\(/);
 assert.match(s,/onlineSession\.draft\s*=\s*action/);
 assert.match(s,/onlineSession\.sendAction\(draft,onlineSession\.revision\)/);
 assert.match(s,/mmjjOnlineConfirm/);
 assert.match(s,/mmjjOnlineCancel/);
 assert.match(s,/function drawOnlinePreview\(/);
});
test('online undo button requests approval; other player gets agree or reject actions',()=>{
 const s=game(),h=hub();
 assert.match(s,/function renderOnlineControls\(/);
 assert.match(s,/mmjjOnlineUndoAccept/);assert.match(s,/mmjjOnlineUndoDecline/);
 assert.match(s,/mmjjOnlineUndoRequest/);
 assert.match(h,/requestUndo:function/);assert.match(h,/respondUndo:function/);
 assert.match(h,/MumuOnline\.setUndo\(/);
});
test('existing local undo still restores local state history',()=>{
 assert.match(game(),/while\(count-- > 0 && state\.history\.length\)restore\(state\.history\.pop\(\)\)/);
});
test('only the online active session renders the action confirmation bar',()=>{
 const s=game();assert.match(s,/!onlineSession\|\|!onlineSession\.draft/);assert.match(s,/onlineDock\.hidden=!needed/);
});
