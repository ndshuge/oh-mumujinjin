const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname);
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
test('pages loads Supabase public configuration and bridge before room controls',()=>{
 const html=read('index.html');
 assert.match(html,/supabase-config\.js\?v=/);
 assert.match(html,/supabase-room-bridge\.js\?v=/);
 assert.ok(html.indexOf('supabase-room-bridge.js')<html.indexOf('friends-hub.js'));
});
test('friends UI lets invite link choose between legacy CF and Supabase channels',()=>{
 const hub=read('friends-hub.js');
 assert.match(hub,/id="mmjjNetwork"/);
 assert.match(hub,/value="sb"/);
 assert.match(hub,/MumuSupabaseRooms/);
 assert.match(hub,/&net=/);
});
test('only anonymous/Publishable key is shipped; no database changes to academy data',()=>{
 const config=read('supabase-config.js');
 assert.match(config,/supabase\.co/);
 assert.match(config,/anonKey/);
 assert.doesNotMatch(config,/service_role|sb_secret_|DATABASE_URL|postgres:/i);
});
