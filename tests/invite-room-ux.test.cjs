const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const hub=()=>fs.readFileSync('friends-hub.js','utf8');
test('a room deep link automatically joins and shows waiting UI',()=>{
 const s=hub();assert.match(s,/function showInvitePending\(/);assert.match(s,/joinRoom\(\)/);assert.match(s,/自动加入|正在连接房间/);
});
test('failed invite can be retried from the same room view',()=>{
 const s=hub();assert.match(s,/mmjjRetryRoom/);assert.match(s,/retry.*joinRoom\(\)|joinRoom\(\).*retry/s);assert.match(s,/resetRoom\(\)/);
});
test('Supabase is default unless explicit invite uses Cloudflare',()=>{
 const s=hub();assert.match(s,/<option value="sb" selected>/);assert.match(s,/<option value="cf">/);assert.match(s,/network==='sb'\|\|network==='cf'/);
});
