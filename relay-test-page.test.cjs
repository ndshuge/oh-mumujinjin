const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
test('mobile relay test page uses the existing public Supabase credentials and two isolated realtime clients',()=>{
 const html=read('relay-test.html');
 assert.match(html,/<html lang="zh-CN">/);
 assert.match(html,/viewport/);
 assert.match(html,/aria-live="polite"/);
 assert.match(html,/supabase-config\.js/);
 assert.match(html,/vendor\/realtime\.mjs/);
 assert.match(html,/new RealtimeClient/);
 assert.match(html,/\.channel\(/);
 assert.match(html,/async function run/);
 assert.match(html,/copyReport/);
 assert.doesNotMatch(html,/service_role/i);
});
test('the existing network test links to the new relay-only websocket test',()=>{
 assert.match(read('network-test.html'),/href="\.\/relay-test\.html"/);
});
