const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=name=>fs.readFileSync(name,'utf8');
test('Supabase default and multiplayer UI script cache versions are current',()=>{
 const tag='sb-recovery-20261107-r3';
 assert.ok(read('index.html').includes('supabase-room-bridge.js?v=confirm-undo-20261109-r1'));
 assert.ok(read('index.html').includes('supabase-config.js?v=relay-primary-20261109-r1'));
 assert.ok(read('index.html').includes('friends-hub.js?v=confirm-undo-20261109-r1'));
 assert.ok(read('index.html').includes('game.js?v=confirm-undo-20261109-r1'));
 assert.ok(read('index.html').includes('friend-rooms.js?v=confirm-undo-20261109-r1'));
 assert.ok(read('friends-hub.js').includes('supabase-network-check.mjs?v='+tag));
 assert.ok(read('supabase-room-bridge.js').includes('supabase-network-check.mjs?v='+tag));
});
