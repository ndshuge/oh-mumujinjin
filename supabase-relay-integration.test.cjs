const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('production Supabase project and public key are preserved when relay becomes first route',()=>{
 const ctx={window:{}};vm.runInNewContext(fs.readFileSync('supabase-config.js','utf8'),ctx);
 const cfg=ctx.window.MMJJ_SB_CONFIG;
 assert.equal(cfg.enabled,true);
 assert.equal(cfg.url,'https://yycokuphczoxfntcwizi.supabase.co');
 assert.equal(cfg.relayUrl,'https://mmjj-supabase-relay-canary.pages.dev');
 assert.ok(cfg.anonKey.length>40);
});
test('browser bridge configures relay priority and keeps original URL as backup',()=>{
 const s=fs.readFileSync('supabase-room-bridge.js','utf8');
 assert.match(s,/fallbackUrls:\s*config\(\)\.relayUrl/);
 assert.match(s,/config\(\)\.url,anonKey:config\(\)\.anonKey/);
 assert.match(s,/async function checkConnection/);
 assert.match(s,/route:'relay'/);
});
test('production HTML invalidates old cached bridge and transport modules',()=>{
 const s=fs.readFileSync('index.html','utf8');
 assert.match(s,/supabase-room-bridge\.js\?v=relay-primary-20261109-r1/);
 const b=fs.readFileSync('supabase-room-bridge.js','utf8');
 assert.match(b,/supabase-room-transport\.mjs\?v=relay-primary-20261109-r1/);
});
