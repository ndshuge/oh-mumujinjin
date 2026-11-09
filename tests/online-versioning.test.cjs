const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=p=>fs.readFileSync(p,'utf8');
const version='confirm-undo-20261109-r1';
test('HTML links refreshed game, multiplayer transport and controls rather than stale cached scripts',()=>{
 const html=load('index.html');
 for(const name of ['game.js','friend-rooms.js','friends-hub.js','friends-hub.css','supabase-room-bridge.js'])
  assert.ok(html.includes(name+'?v='+version),name);
});
test('Supabase dynamically imported core and transport are versioned with the same feature',()=>{
 const bridge=load('supabase-room-bridge.js');
 const transport=load('supabase-room-transport.mjs');
 assert.ok(bridge.includes('supabase-room-transport.mjs?v='+version));
 assert.ok(transport.includes('supabase-room-core.mjs?v='+version));
});
