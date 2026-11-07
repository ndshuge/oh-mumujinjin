import test from 'node:test';
import assert from 'node:assert/strict';
import {GameRoom} from './worker.mjs';

const map={version:2,rulesVersion:'map-v2-r1',name:'host-offline',rocks:[],portals:[],ice:[],boost:[]};
function fixture(){
  const data=new Map(),sockets=[];
  const ctx={alarm:null,storage:{
    async get(key){const value=data.get(key);return value?structuredClone(value):undefined;},
    async put(key,value){data.set(key,structuredClone(value));},
    async setAlarm(value){ctx.alarm=value;},
    async deleteAll(){data.clear();}
  },getWebSockets(){return sockets;}};
  const room=new GameRoom(ctx,{});
  const socket=seat=>{const messages=[],value={deserializeAttachment(){return {seat};},send(text){messages.push(JSON.parse(text));},close(){}};sockets.push(value);return {socket:value,messages};};
  return {room,ctx,data,socket};
}
async function start(f){
  const created=await f.room.fetch(new Request('https://room.internal/init',{method:'POST',body:JSON.stringify({
    code:'ABC234',settings:{variant:'classic',side:'wood',first:'host',map}
  })}));
  const host=await created.json();
  const joined=await f.room.fetch(new Request('https://room.internal/join',{method:'POST',body:'{}'}));
  const guest=await joined.json();
  const a=f.socket(0),b=f.socket(1);
  let state=await f.room.getRoom();state.players[0].connected=true;state.players[1].connected=true;await f.room.save(state);
  await f.room.webSocketMessage(a.socket,JSON.stringify({type:'ready'}));
  await f.room.webSocketMessage(b.socket,JSON.stringify({type:'ready'}));
  await f.room.webSocketMessage(a.socket,JSON.stringify({type:'start'}));
  return {host,guest,a,b};
}
test('host disconnect does not stop canonical room; guest may finish the guest turn and host can reclaim same seat',async()=>{
  const f=fixture(),players=await start(f);
  await f.room.webSocketMessage(players.a.socket,JSON.stringify({type:'action',revision:0,action:{kind:'origin',p:{x:0,y:0}}}));
  await f.room.webSocketClose(players.a.socket);
  let room=await f.room.getRoom();
  assert.equal(room.status,'playing');assert.equal(room.players[0].connected,false);
  await f.room.webSocketMessage(players.b.socket,JSON.stringify({type:'action',revision:1,action:{kind:'origin',p:{x:7,y:12}}}));
  room=await f.room.getRoom();
  assert.equal(room.revision,2);assert.equal(room.status,'playing');
  const rejoin=await f.room.fetch(new Request('https://room.internal/join',{method:'POST',body:JSON.stringify({token:players.host.token})}));
  const restored=await rejoin.json();
  assert.equal(restored.owner,true);assert.equal(restored.token,players.host.token);
  assert.equal((await f.room.getRoom()).revision,2);
});

test('concurrent actions with the same revision cannot both mutate the board',async()=>{
  const f=fixture(),players=await start(f);
  await f.room.webSocketMessage(players.a.socket,JSON.stringify({type:'action',revision:0,action:{kind:'origin',p:{x:0,y:0}}}));
  const outcomes=await Promise.all([
    f.room.webSocketMessage(players.b.socket,JSON.stringify({type:'action',revision:1,action:{kind:'origin',p:{x:7,y:12}}})),
    f.room.webSocketMessage(players.b.socket,JSON.stringify({type:'action',revision:1,action:{kind:'origin',p:{x:6,y:12}}}))
  ]);
  const room=await f.room.getRoom();
  assert.equal(room.revision,2);
  assert.equal(players.b.messages.filter(m=>m.type==='error').length,1);
});

test('ping heartbeat updates presence and sliding 24-hour expiry without changing game revision',async()=>{
  const f=fixture(),oldNow=Date.now;let clock=100_000;Date.now=()=>clock;
  try{
    const players=await start(f);
    const before=await f.room.getRoom(),initialExpiry=before.expiresAt,revision=before.revision;
    clock+=30_000;
    await f.room.webSocketMessage(players.a.socket,JSON.stringify({type:'ping'}));
    const after=await f.room.getRoom();
    assert.equal(after.players[0].lastSeenAt,clock);
    assert.equal(after.revision,revision);
    assert.ok(after.expiresAt>initialExpiry);
    assert.equal(f.ctx.alarm,after.expiresAt);
    assert.ok(after.expiresAt-clock>=24*60*60*1000-10);
  }finally{Date.now=oldNow;}
});

test('expired durable room is deleted by alarm',async()=>{
  const f=fixture(),oldNow=Date.now;let clock=100_000;Date.now=()=>clock;
  try{
    await start(f);const room=await f.room.getRoom();clock=room.expiresAt+1;await f.room.alarm();
    assert.equal(await f.room.getRoom(),undefined);
  }finally{Date.now=oldNow;}
});
