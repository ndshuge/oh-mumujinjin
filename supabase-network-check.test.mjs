import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseSupabase} from './supabase-network-check.mjs';
const cfg={url:'https://example.supabase.co',anonKey:'a'.repeat(40),timeoutMs:50};
function connection(response='SUBSCRIBED'){
 const chat={channel(){return {subscribe(cb){queueMicrotask(()=>cb(response,{message:'transport failure'}));}}},async removeChannel(){},disconnect(){}};
 return async()=>chat;
}
test('when HTTPS works but websocket fails, distinguish the two for a Chinese mobile user',async()=>{
 const output=await diagnoseSupabase({...cfg,
  doFetch:async()=>({ok:true,status:200}),
  createRealtime:connection('CHANNEL_ERROR')});
 assert.equal(output.httpsOk,true);
 assert.equal(output.websocketOk,false);
 assert.equal(output.ok,false);
 assert.match(output.detail,/HTTPS.*正常/);
 assert.match(output.detail,/WebSocket.*失败/);
});
test('both connections working reports success',async()=>{
 const result=await diagnoseSupabase({...cfg,
  doFetch:async()=>({ok:true,status:200}),createRealtime:connection()});
 assert.equal(result.ok,true);
 assert.match(result.detail,/实时通信正常/);
});
test('HTTPS failures should not be mistaken for invalid room code',async()=>{
 const result=await diagnoseSupabase({...cfg,
  doFetch:async()=>{throw new TypeError('Failed to fetch')},createRealtime:connection('CHANNEL_ERROR')});
 assert.equal(result.httpsOk,false);
 assert.equal(result.ok,false);
 assert.match(result.detail,/HTTPS/);
 assert.match(result.detail,/WebSocket/);
});
test('timeouts are finite even when promises do not settle',async()=>{
 const result=await diagnoseSupabase({...cfg,timeoutMs:45,
  doFetch:()=>new Promise(()=>{}),createRealtime:()=>new Promise(()=>{})});
 assert.equal(result.ok,false);
 assert.match(result.detail,/超时|无法访问/);
});
