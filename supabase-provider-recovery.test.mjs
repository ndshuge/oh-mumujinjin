import test from 'node:test';
import assert from 'node:assert/strict';
import * as diagnostics from './supabase-network-check.mjs';

function brokenRealtime(){
 return async()=>({
  channel(){return {subscribe(cb){queueMicrotask(()=>cb('CHANNEL_ERROR',{message:'transport failure'}))}}},
  async removeChannel(){},disconnect(){}
 });
}

test('dual-path outage asks to verify Supabase project and avoid repeated room creation',async()=>{
 const result=await diagnostics.diagnoseSupabase({
  url:'https://missing.supabase.co',anonKey:'a'.repeat(40),timeoutMs:50,
  doFetch:async()=>{throw new TypeError('Load failed')},createRealtime:brokenRealtime()
 });
 assert.equal(result.ok,false);
 assert.match(result.detail,/控制台/);
 assert.match(result.detail,/项目.*(?:暂停|地址)/);
 assert.match(result.detail,/不要反复创建房间/);
});

test('realtime transport failure becomes actionable Chinese text',()=>{
 const message=diagnostics.describeSupabaseRoomError(
  Error('Supabase Realtime is unreachable: channel error: transport failure'));
 assert.match(message,/Supabase.*连接失败/);
 assert.match(message,/项目.*(?:暂停|地址)/);
 assert.doesNotMatch(message,/transport failure/i);
});

test('host offline is different from provider down',()=>{
 assert.match(diagnostics.describeSupabaseRoomError(Error('Room not found or host offline')),/房主.*离线/);
});

test('HTTP unauthorized asks for public API credential review',()=>{
 assert.match(diagnostics.describeSupabaseRoomError(Error('HTTP 401')),/密钥|凭证/);
});

test('unknown game business error stays unchanged',()=>{
 assert.equal(diagnostics.describeSupabaseRoomError(Error('双方还没有准备')),'双方还没有准备');
});
