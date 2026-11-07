'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createClient}=require('./friend-rooms.js');

function memoryStorage(initial={}){
  const values=new Map(Object.entries(initial));
  return {getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}
test('room credentials migrate from sessionStorage to persistent localStorage and survive a new client',async()=>{
  const persistent=memoryStorage(),legacy=memoryStorage({'mmjj-room-ABC234':'legacy-token'});
  const requests=[],sockets=[];
  class Socket{constructor(url){this.url=url;this.readyState=1;sockets.push(this);}send(){}close(){this.readyState=3;}}
  const fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({code:'ABC234',token:'persistent-token',owner:false})};};
  const first=createClient({endpoint:'https://rooms.example',fetch,WebSocket:Socket,storage:persistent,legacyStorage:legacy});
  await first.join('ABC234',()=>{});
  assert.equal(requests[0].body.token,'legacy-token');
  assert.equal(persistent.getItem('mmjj-room-ABC234'),'persistent-token');
  assert.equal(legacy.getItem('mmjj-room-ABC234'),null);
  assert.equal(persistent.getItem('mmjj-last-room-code'),'ABC234');
  first.close();
  const second=createClient({endpoint:'https://rooms.example',fetch,WebSocket:Socket,storage:persistent,legacyStorage:legacy});
  await second.join('ABC234',()=>{});
  assert.equal(requests[1].body.token,'persistent-token');
  second.close();
});

test('last room can be resumed after a browser restart',async()=>{
  const persistent=memoryStorage({'mmjj-room-K2M9Q7':'saved-token','mmjj-last-room-code':'K2M9Q7'});
  const requests=[],sockets=[];
  class Socket{constructor(url){this.url=url;this.readyState=1;sockets.push(this);}send(){}close(){this.readyState=3;}}
  const client=createClient({endpoint:'https://rooms.example',storage:persistent,WebSocket:Socket,
    fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({code:'K2M9Q7',token:'saved-token',owner:true})};}});
  assert.equal(client.getLastRoom(),'K2M9Q7');
  await client.resumeLast(()=>{});
  assert.match(requests[0].url,/K2M9Q7\/join$/);
  assert.equal(requests[0].body.token,'saved-token');
  client.close();
});

test('reconnect keeps retrying after twelve consecutive failures',async()=>{
  const sockets=[],timers=[],events=[];
  class Socket{constructor(url){this.url=url;this.readyState=1;sockets.push(this);}send(){}close(){this.readyState=3;}}
  const client=createClient({endpoint:'https://rooms.example',WebSocket:Socket,
    setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},
    fetch:async()=>({ok:true,json:async()=>({code:'ABC234',token:'same-token',owner:true})})});
  await client.create({variant:'classic'},e=>events.push(e.type));
  for(let i=0;i<14;i++){
    sockets.at(-1).onclose();
    const next=timers.shift();assert.equal(typeof next,'function');next();
  }
  assert.equal(sockets.length,15);
  assert.ok(events.includes('reconnecting'));
  assert.equal(events.includes('close'),false);
  client.close();
});

test('active WebSocket sends periodic ping heartbeats',async()=>{
  const sockets=[],intervals=[];
  class Socket{constructor(url){this.url=url;this.readyState=1;this.sent=[];sockets.push(this);}send(text){this.sent.push(JSON.parse(text));}close(){this.readyState=3;}}
  const client=createClient({endpoint:'https://rooms.example',WebSocket:Socket,
    setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval:()=>{},
    fetch:async()=>({ok:true,json:async()=>({code:'ABC234',token:'same-token',owner:true})})});
  await client.create({variant:'classic'},()=>{});
  sockets[0].onopen();
  assert.equal(intervals.length,1);
  intervals[0]();
  assert.deepEqual(sockets[0].sent,[{type:'ping'}]);
  client.close();
});
