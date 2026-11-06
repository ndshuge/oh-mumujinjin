/* Real network smoke test: two separate WebSocket clients + SQLite Durable Object.
   Run after npx wrangler dev --port 8787. No fake socket transports. */
import assert from 'node:assert/strict';
const BASE=process.env.MMJJ_E2E_SERVER||'http://127.0.0.1:8787';
const map={version:2,rulesVersion:'map-v2-r1',name:'网络测试局面',rocks:[],portals:[],ice:[],boost:[]};
const cfg={variant:'classic',mapSource:'official',map,side:'gold',first:'host'};
const post=async(path,body)=>{
 const result=await fetch(BASE+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const json=await result.json();
 if(!result.ok)throw new Error(result.status+' '+JSON.stringify(json));
 return json;
};
const once=(socket,predicate,ms=10000)=>{
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{clean();reject(new Error('Timed out waiting for websocket message'));},ms);
  function message(ev){
   const data=JSON.parse(ev.data);
   if(predicate(data)){clean();resolve(data);}
  }
  function error(ev){clean();reject(new Error('Socket error'));}
  function clean(){clearTimeout(timer);socket.removeEventListener('message',message);socket.removeEventListener('error',error);}
  socket.addEventListener('message',message);socket.addEventListener('error',error);
 });
};
const open=async(code,auth)=>{
 const url=BASE.replace(/^http/,'ws')+'/api/rooms/'+code+'/ws?token='+auth;
 const socket=new WebSocket(url);
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('WebSocket open timeout')),10000);
  socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
  socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('WebSocket connect error'));},{once:true});
 });
 return socket;
};
let host,guest,guestAgain;
try{
 const room=await post('/api/rooms',{settings:cfg});
 assert.match(room.code,/^[A-Z0-9]{6}$/);
 const second=await post('/api/rooms/'+room.code+'/join',{});
 assert.notEqual(room.token,second.token);
 console.log('PASS create room and join, independent credentials',room.code);
 host=await open(room.code,room.token);
 guest=await open(room.code,second.token);
 console.log('PASS two real WebSockets connected');
 let hostReady=once(host,data=>data.type==='room_state'&&data.room.players[0].ready);
 host.send(JSON.stringify({type:'ready'}));
 await hostReady;
 let allReady=once(host,data=>data.type==='room_state'&&data.room.status==='ready');
 guest.send(JSON.stringify({type:'ready'}));
 await allReady;
 console.log('PASS two players synchronize ready state');
 const startedHost=once(host,data=>data.type==='match_start');
 const startedGuest=once(guest,data=>data.type==='match_start');
 host.send(JSON.stringify({type:'start'}));
 const [ah,ag]=await Promise.all([startedHost,startedGuest]);
 assert.equal(ah.side,0);assert.equal(ag.side,1);assert.equal(ag.room.game.phase,'pick-attack');
 console.log('PASS live match start, both clients agree colors and opening');
 let illegal=once(guest,data=>data.type==='error');
 guest.send(JSON.stringify({type:'action',revision:0,action:{kind:'origin',p:{x:0,y:0}}}));
 await illegal;
 const first=once(host,data=>data.type==='action_accepted'&&data.revision===1);
 host.send(JSON.stringify({type:'action',revision:0,action:{kind:'origin',p:{x:7,y:12}}}));
 const confirmed=await first;
 assert.equal(confirmed.game.phase,'pick-defend');
 const secondConfirmed=once(host,data=>data.type==='action_accepted'&&data.revision===2);
 guest.send(JSON.stringify({type:'action',revision:1,action:{kind:'origin',p:{x:0,y:0}}}));
 const snapshot=await secondConfirmed;
 assert.equal(snapshot.game.phase,'play');
 const moved=once(guest,data=>data.type==='action_accepted'&&data.revision===3);
 host.send(JSON.stringify({type:'action',revision:2,action:{kind:'move',to:{x:7,y:11}}}));
 const after=await moved;
 assert.equal(after.game.players[0].y,11);
 console.log('PASS server-authoritative turns, rejected illegal move, synchronized board');
 guest.close(1000,'rejoin');
 guestAgain=await open(room.code,second.token);
 const recovered=once(guestAgain,data=>data.type==='room_state'&&data.room.revision===3);
 const resume=await recovered;
 assert.equal(resume.room.game.players[0].y,11);
 console.log('PASS reconnect preserves room token and canonical board state');
 console.log('LIVE WEBSOCKET E2E PASS');
}finally{for(const s of [host,guest,guestAgain])try{s?.close();}catch(_){} }
