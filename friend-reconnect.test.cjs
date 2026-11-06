'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createClient}=require('./friend-rooms.js');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(){
  const sockets=[],events=[];
  class Socket{
    constructor(url){this.url=url;this.readyState=1;sockets.push(this);}
    send(){}
    close(){this.readyState=3;}
  }
  const fetch=async()=>({ok:true,json:async()=>({code:'ABC234',token:'private123',owner:true})});
  const client=createClient({endpoint:'https://rooms.example',fetch,WebSocket:Socket});
  return {sockets,events,client};
}
test('unexpected websocket close schedules reconnect with same identity',async()=>{
  const {sockets,events,client}=fixture();
  await client.create({variant:'classic'},event=>events.push(event.type));
  assert.equal(sockets.length,1);
  sockets[0].onclose();
  assert.ok(events.includes('reconnecting'));
  await pause(750);
  assert.equal(sockets.length,2);
  assert.equal(sockets[1].url,sockets[0].url);
  client.close();
});
test('user leave cancels pending reconnection',async()=>{
  const {sockets,client}=fixture();
  await client.create({variant:'classic'},()=>{});
  sockets[0].onclose();
  client.close();
  await pause(740);
  assert.equal(sockets.length,1);
});
