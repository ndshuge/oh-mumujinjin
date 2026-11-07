import test from 'node:test';
import assert from 'node:assert/strict';
import {GameRoom} from './worker.mjs';

const map={version:2,rulesVersion:'map-v2-r1',name:'成熟版回归地图',rocks:[],portals:[],ice:[],boost:[]};
async function setup(){
 const data=new Map(),sockets=[];
 const ctx={
   storage:{
     async get(k){return data.get(k);},
     async put(k,v){data.set(k,structuredClone(v));},
     async setAlarm(){},async deleteAll(){data.clear();}
   },
   getWebSockets(){return sockets;}
 };
 const server=new GameRoom(ctx,{});
 const request=async(path,payload)=>{
   const res=await server.fetch(new Request('https://room.internal'+path,
     {method:'POST',body:JSON.stringify(payload)}));
   return {status:res.status,data:await res.json()};
 };
 const init=await request('/init',{code:'ABC987',settings:{variant:'classic',side:'gold',first:'host',map}});
 assert.equal(init.status,200);
 const guest=await request('/join',{});
 assert.equal(guest.status,200);
 const room=await server.getRoom();
 room.players[0].connected=true;room.players[1].connected=true;
 await server.save(room);
 const mkSocket=seat=>{
   const logs=[],socket={deserializeAttachment(){return {seat};},send(str){logs.push(JSON.parse(str));},close(){}};
   sockets.push(socket);return {socket,logs};
 };
 const host=mkSocket(0),friend=mkSocket(1);
 const send=(peer,payload)=>server.webSocketMessage(peer.socket,JSON.stringify(payload));
 await send(host,{type:'ready'});await send(friend,{type:'ready'});await send(host,{type:'start'});
 return {server,send,host,friend};
}

test('resignation ends match, announces a winner, and invalid moves stay rejected',async()=>{
 const {server,send,host,friend}=await setup();
 await send(host,{type:'resign'});
 const room=await server.getRoom();
 assert.equal(room.status,'finished');
 assert.equal(room.game.phase,'finished');
 assert.equal(room.game.winner,1);
 assert.equal(room.revision,1);
 assert.ok(friend.logs.some(e=>e.type==='room_state'&&e.room.game?.winner===1));
 await send(friend,{type:'action',revision:1,action:{kind:'origin',p:{x:0,y:0}}});
 assert.equal((await server.getRoom()).revision,1);
});

test('rematch requires both votes, swaps seats and resets revision and board',async()=>{
 const {server,send,host,friend}=await setup();
 await send(host,{type:'resign'});
 await send(host,{type:'rematch'});
 let room=await server.getRoom();
 assert.equal(room.status,'finished');
 assert.deepEqual(room.rematchVotes,[true,false]);
 await send(friend,{type:'rematch'});
 room=await server.getRoom();
 assert.equal(room.status,'playing');
 assert.deepEqual(room.seatSide,[1,0]);
 assert.equal(room.game.firstSide,1);
 assert.equal(room.game.moves,0);
 assert.equal(room.revision,0);
 assert.ok(host.logs.filter(e=>e.type==='match_start').length>=2);
 assert.ok(friend.logs.filter(e=>e.type==='match_start').length>=2);
});

test('ready messages cannot erase a finished match',async()=>{
 const {server,send,host}=await setup();
 await send(host,{type:'resign'});
 await send(host,{type:'ready'});
 assert.equal((await server.getRoom()).status,'finished');
 assert.equal(host.logs.at(-1).type,'error');
});

test('unrequested rematch while a game runs is rejected',async()=>{
 const {server,send,host}=await setup();
 await send(host,{type:'rematch'});
 assert.equal((await server.getRoom()).status,'playing');
 assert.equal(host.logs.at(-1).type,'error');
});
