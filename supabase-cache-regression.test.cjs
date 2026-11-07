const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=name=>fs.readFileSync(name,'utf8');
test('Supabase recovery deploy invalidates all changed browser script caches',()=>{
 const tag='sb-recovery-20261107-r3';
 assert.ok(read('index.html').includes('supabase-room-bridge.js?v='+tag));
 assert.ok(read('index.html').includes('friends-hub.js?v=invite-polish-20261107-r1'));
 assert.ok(read('friends-hub.js').includes('supabase-network-check.mjs?v='+tag));
 assert.ok(read('supabase-room-bridge.js').includes('supabase-network-check.mjs?v='+tag));
});
