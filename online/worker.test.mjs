import test from 'node:test';
import assert from 'node:assert/strict';
import {GameRoom} from './worker.mjs';

const map={
  version:2,rulesVersion:'map-v2-r1',name:'桥头决战',
  rocks:[{x:4,y:5}],portals:[],ice:[],boost:[]
};

function fixture(){
  const mapStorage=new Map(),received=[];
  const ctx={
    storage:{
      async get(key){return mapStorage.get(key);},
      async put(key,val){mapStorage.set(key,structuredClone(val));},
      async setAlarm(t){ctx.alarm=t;},
      async deleteAll(){mapStorage.clear();}
    },
    sockets:[],
    getWebSockets(){return this.sockets;}
  };
  const websocket=(seat)=>{
    const messages=[];
    const socket={deserializeAttachment(){return {seat};},
      send(text){messages.push(JSON.parse(text));},close(){}};
    ctx.sockets.push(socket);received.push(messages);return socket;
  };
  return {ctx,room:new GameRoom(ctx,{}),websocket,received};
}
async function init(f,settings={}){
  const response=await f.room.fetch(new Request('https://room.internal/init',
    {method:'POST',body:JSON.stringify({code:'ABCDEF',settings:{variant:'classic',side:'wood',first:'host',map,...settings}})}));
  assert.equal(response.status,200);
  const host=await response.json();
  const joined=await f.room.fetch(new Request('https://room.internal/join',
    {method:'POST',body:JSON.stringify({})}));
  assert.equal(joined.status,200);
  const guest=await joined.json();
  assert.equal(host.code,guest.code);
  assert.notEqual(host.token,guest.token);
  const state=await f.room.getRoom();
  state.players[0].connected=true;state.players[1].connected=true;
  await f.room.save(state);
  return {host,guest};
}
test('real room emits authoritative snapshots and enforces chosen color and opening order',async()=>{
  const f=fixture();await init(f);
  const host=f.websocket(0),guest=f.websocket(1);
  await f.room.webSocketMessage(host,JSON.stringify({type:'ready'}));
  await f.room.webSocketMessage(guest,JSON.stringify({type:'ready'}));
  assert.equal((await f.room.getRoom()).status,'ready');
  await f.room.webSocketMessage(host,JSON.stringify({type:'start'}));
  let state=await f.room.getRoom();
  assert.equal(state.status,'playing');assert.deepEqual(state.seatSide,[1,0]);
  assert.equal(state.game.phase,'pick-defend');assert.equal(state.game.firstSide,1);
  assert.equal(f.received[0].at(-1).type,'room_state');
  await f.room.webSocketMessage(host,JSON.stringify({type:'action',revision:0,action:{kind:'origin',p:{x:0,y:0}}}));
  state=await f.room.getRoom();
  assert.equal(state.revision,1);assert.equal(state.game.phase,'pick-attack');
  await f.room.webSocketMessage(guest,JSON.stringify({type:'action',revision:1,action:{kind:'origin',p:{x:7,y:12}}}));
  state=await f.room.getRoom();
  assert.equal(state.revision,2);assert.equal(state.game.turn,1);
  // Host is wood; a valid wood move applies to both connected clients.
  await f.room.webSocketMessage(host,JSON.stringify({type:'action',revision:2,action:{kind:'move',to:{x:0,y:1}}}));
  state=await f.room.getRoom();
  assert.equal(state.revision,3);assert.equal(state.game.turn,0);
  assert.equal(f.received[1].filter(x=>x.type==='action_accepted').length,3);
});
test('stale turns and false moves are rejected without corrupting the room state',async()=>{
  const f=fixture();await init(f);
  const host=f.websocket(0),guest=f.websocket(1);
  await f.room.webSocketMessage(host,JSON.stringify({type:'ready'}));
  await f.room.webSocketMessage(guest,JSON.stringify({type:'ready'}));
  await f.room.webSocketMessage(host,JSON.stringify({type:'start'}));
  await f.room.webSocketMessage(guest,JSON.stringify({type:'action',revision:0,action:{kind:'origin',p:{x:7,y:12}}}));
  assert.equal((await f.room.getRoom()).revision,0);
  assert.match(f.received[1].at(-1).error,/当前不是/);
  await f.room.webSocketMessage(host,JSON.stringify({type:'action',revision:1,action:{kind:'origin',p:{x:0,y:0}}}));
  assert.equal((await f.room.getRoom()).revision,0);
  assert.match(f.received[0].at(-1).error,/版本已更新/);
});
test('joining a full room does not displace its players',async()=>{
  const f=fixture();await init(f);
  const response=await f.room.fetch(new Request('https://room.internal/join',{method:'POST',body:'{}'}));
  assert.equal(response.status,409);
});

test('durable room never rolls back on a single-player undo and persists only after opponent agrees',async()=>{
 const f=fixture();await init(f,{side:'gold',first:'host'});
 const host=f.websocket(0),guest=f.websocket(1);
 const send=(socket,message)=>f.room.webSocketMessage(socket,JSON.stringify(message));
 await send(host,{type:'ready'});await send(guest,{type:'ready'});await send(host,{type:'start'});
 await send(host,{type:'action',revision:0,action:{kind:'origin',p:{x:6,y:12}}});
 await send(guest,{type:'action',revision:1,action:{kind:'origin',p:{x:0,y:0}}});
 const before=structuredClone((await f.room.getRoom()).game);
 await send(host,{type:'action',revision:2,action:{kind:'move',to:{x:6,y:11}}});
 assert.equal((await f.room.getRoom()).revision,3);
 await send(host,{type:'undo_request',revision:3});
 assert.equal((await f.room.getRoom()).undoRequest.by,0);
 await send(guest,{type:'action',revision:3,action:{kind:'move',to:{x:0,y:1}}});
 assert.equal((await f.room.getRoom()).revision,3);
 assert.match(f.received[1].at(-1).error,/悔棋/);
 await send(host,{type:'undo_response',accepted:true,revision:3});
 assert.match(f.received[0].at(-1).error,/对方/);
 await send(guest,{type:'undo_response',accepted:true,revision:3});
 const after=await f.room.getRoom();
 assert.equal(after.revision,4);assert.equal(after.status,'playing');
 assert.deepEqual(after.game,before);
 assert.equal(after.undoRequest,null);
 assert.equal(f.received[0].at(-1).room.undoBefore,undefined);
});
test('durable undo rejected by opponent leaves version and move unchanged',async()=>{
 const f=fixture();await init(f,{side:'gold',first:'host'});
 const host=f.websocket(0),guest=f.websocket(1);
 const send=(socket,message)=>f.room.webSocketMessage(socket,JSON.stringify(message));
 await send(host,{type:'ready'});await send(guest,{type:'ready'});await send(host,{type:'start'});
 await send(host,{type:'action',revision:0,action:{kind:'origin',p:{x:6,y:12}}});
 await send(guest,{type:'action',revision:1,action:{kind:'origin',p:{x:0,y:0}}});
 await send(host,{type:'action',revision:2,action:{kind:'move',to:{x:6,y:11}}});
 await send(host,{type:'undo_request',revision:3});
 await send(guest,{type:'undo_response',accepted:false,revision:3});
 assert.equal((await f.room.getRoom()).revision,3);
 assert.equal((await f.room.getRoom()).undoRequest,null);
 assert.equal((await f.room.getRoom()).game.players[0].y,11);
});
