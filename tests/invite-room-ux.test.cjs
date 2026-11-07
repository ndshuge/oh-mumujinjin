const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const hub=()=>fs.readFileSync('friends-hub.js','utf8');
test('a room deep link automatically joins and shows waiting UI',()=>{
 const s=hub();assert.match(s,/function showInvitePending\(/);assert.match(s,/joinRoom\(\)/);assert.match(s,/自动加入|正在连接房间/);
});
test('failed invite can be retried from the same room view',()=>{
 const s=hub();assert.match(s,/mmjjRetryRoom/);assert.match(s,/retry.*joinRoom\(\)|joinRoom\(\).*retry/s);assert.match(s,/resetRoom\(\)/);
});
test('domestic Supabase is the default and Cloudflare remains an explicit fallback',()=>{
 const s=hub();
 assert.match(s,/<option value="sb" selected>国内默认线路 · Supabase<\/option>/);
 assert.match(s,/<option value="cf">国际备用线路 · Cloudflare<\/option>/);
 assert.match(s,/network==='sb'\|\|network==='cf'/);
 assert.match(s,/当前默认国内线路：Supabase Realtime/);
});
