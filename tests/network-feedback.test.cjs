const test=require('node:test'),assert=require('node:assert/strict');
const {createClient}=require('../friend-rooms.js');
test('unreachable Worker produces actionable message instead of raw Failed to fetch',async()=>{
 const client=createClient({endpoint:'https://mmjj-friends.ndshuge.workers.dev',
  fetch:async()=>{throw new TypeError('Failed to fetch');},WebSocket:class{}});
 await assert.rejects(client.join('4ZV9KH',()=>{}),/无法连接联机服务器.*workers.dev/);
 await assert.rejects(client.create({map:{}},()=>{}),/无法连接联机服务器.*workers.dev/);
});
test('room code validation is separate from network failures',async()=>{
 const client=createClient({endpoint:'https://example.invalid',fetch:async()=>{throw new TypeError('Failed to fetch');},WebSocket:class{}});
 await assert.rejects(client.join('XX',()=>{}),/6 位字母或数字/);
});
