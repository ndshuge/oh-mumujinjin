'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createClient} = require('./friend-rooms.js');

test('unconfigured client refuses to create a fake room', async () => {
  const client=createClient({endpoint:''});
  await assert.rejects(client.create({variant:'classic'},()=>{}), /联机服务尚未配置/);
});

test('create posts server settings and connects with returned token', async () => {
  const requests=[],sockets=[];
  class Socket {constructor(url){this.url=url;this.readyState=1;sockets.push(this);}send(){}close(){}}
  const client=createClient({endpoint:'https://game.example',fetch:async(url,opts)=>{
    requests.push({url,opts});return {ok:true,json:async()=>({code:'K2M9Q7',token:'private'})};
  },WebSocket:Socket});
  const result=await client.create({variant:'advanced'},()=>{});
  assert.equal(result.code,'K2M9Q7');
  assert.equal(requests[0].url,'https://game.example/api/rooms');
  assert.equal(JSON.parse(requests[0].opts.body).settings.variant,'advanced');
  assert.match(sockets[0].url,/wss:\/\/game.example\/api\/rooms\/K2M9Q7\/ws\?token=private/);
});

test('join rejects malformed room ids before contacting a server', async () => {
  let calls=0;
  const client=createClient({endpoint:'https://game.example',fetch:async()=>{calls++;}});
  await assert.rejects(client.join('??????',()=>{}),/房间码/);
  assert.equal(calls,0);
});
