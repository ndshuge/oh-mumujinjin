import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createClient} from './supabase-room-transport.mjs';

const relay='https://mmjj-supabase-relay-canary.pages.dev';
const direct='https://yycokuphczoxfntcwizi.supabase.co';
const settings={variant:'classic',map:{version:2,rulesVersion:'map-v2-r1',name:'priority-check',rocks:[],portals:[],ice:[],boost:[]},side:'gold',first:'host'};
function stubRealtime(fail){
 const calls=[];
 function factory(url){
  calls.push(url);
  return {
   channel(){return {
    on(){return this;},
    subscribe(callback){queueMicrotask(()=>callback(url===fail?'CHANNEL_ERROR':'SUBSCRIBED',url===fail?Error('network unavailable'):undefined));return this;},
    async send(){return 'ok';}
   };},
   async removeChannel(){},disconnect(){}
  };
 }
 return {calls,factory};
}

test('relay-first preference immediately uses the relay when it is reachable',async()=>{
 const net=stubRealtime(direct);
 const client=createClient({url:direct,fallbackUrls:[relay],preferRelay:true,realtimeFactory:net.factory,
  identity:'p_relay_primary_user',codeFactory:()=> 'ABC234'});
 const created=await client.create(settings,()=>{});
 assert.equal(created.code,'ABC234');
 assert.deepEqual(net.calls,[relay]);
 await client.close();
});

test('relay-first preference falls back to the original Supabase project when relay fails',async()=>{
 const net=stubRealtime(relay);
 const client=createClient({url:direct,fallbackUrls:[relay],preferRelay:true,realtimeFactory:net.factory,
  identity:'p_relay_primary_user',codeFactory:()=> 'ABC234'});
 await client.create(settings,()=>{});
 assert.deepEqual(net.calls,[relay,direct]);
 await client.close();
});

test('production config explicitly opts into relay-first without changing the original project URL or key',()=>{
 const context={window:{}};
 runInNewContext(readFileSync('supabase-config.js','utf8'),context);
 const cfg=context.window.MMJJ_SB_CONFIG;
 assert.equal(cfg.url,direct);
 assert.equal(cfg.relayUrl,relay);
 assert.equal(cfg.preferRelay,true);
 assert.equal(cfg.enabled,true);
 assert.ok(cfg.anonKey.length>40);
});

test('production bridge passes the relay-first choice and checks relay before direct',()=>{
 const bridge=readFileSync('supabase-room-bridge.js','utf8');
 assert.match(bridge,/preferRelay:config\(\)\.preferRelay===true/);
 assert.match(bridge,/const primary=await diagnoseAt\(config\(\)\.relayUrl\)/);
 assert.match(bridge,/const fallback=await diagnoseAt\(config\(\)\.url\)/);
});

test('main page refreshes config, bridge and Realtime transport URL to avoid stale iPhone cache',()=>{
 const html=readFileSync('index.html','utf8');
 const bridge=readFileSync('supabase-room-bridge.js','utf8');
 assert.match(html,/supabase-config\.js\?v=relay-primary-20261109-r1/);
 assert.match(html,/supabase-room-bridge\.js\?v=confirm-undo-20261109-r1/);
 assert.match(bridge,/supabase-room-transport\.mjs\?v=confirm-undo-20261109-r1/);
});
