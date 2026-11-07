import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from './supabase-room-transport.mjs';
const settings={variant:'classic',map:{version:2,rulesVersion:'map-v2-r1',name:'map',rocks:[],ice:[],boost:[],portals:[]},side:'gold',first:'host'};
function mockRealtime(options={}){let latestState=null;
 const topics=new Map();
 const makeChannel=(topic)=>{
   const h={topic,handlers:[],state:'SUBSCRIBED',
     on(type,filter,callback){if(type==='broadcast')this.handlers.push({filter,callback});return this;},
     subscribe(fn){queueMicrotask(()=>fn('SUBSCRIBED'));return this;},
     async send({event,payload}){
       if(payload?.type==='state')latestState=payload;
       if(options.earlyAdmission&&payload?.type==='intent'&&payload.intent?.type==='join'){
         const admitted=JSON.parse(JSON.stringify(latestState));
         admitted.seq++;
         admitted.room.players[1]={id:payload.actor,connected:true,ready:false};
         for(const handler of h.handlers.filter(x=>x.filter.event===event))handler.callback({event,payload:admitted});
         return 'ok';
       }
       for(const other of topics.get(topic)||[])if(other!==h)
         queueMicrotask(()=>other.handlers.filter(x=>x.filter.event===event).forEach(x=>x.callback({event,payload})));
       return 'ok';
     }};
   if(!topics.has(topic))topics.set(topic,[]);topics.get(topic).push(h);return h;
 };
 return {factory:()=>({channel:makeChannel,removeChannel:async ch=>{
   topics.set(ch.topic,(topics.get(ch.topic)||[]).filter(x=>x!==ch));return 'ok';
 }}),topics};
}
const until=async(f)=>{for(let i=0;i<250;i++){if(f())return;await new Promise(r=>setTimeout(r,10));}throw Error('timeout');};
test('host and friend join, ready, move, resign and vote for rematch using public broadcast channels',async()=>{
 const net=mockRealtime(),a=[],b=[];
 const host=createClient({realtimeFactory:net.factory,identity:'host0000000000000000000001',codeFactory:()=> '4ZV9KH'});
 const guest=createClient({realtimeFactory:net.factory,identity:'guest000000000000000000001'});
 const created=await host.create(settings,e=>a.push(e));
 assert.equal(created.code,'4ZV9KH');
 const joined=await guest.join(created.code,e=>b.push(e));
 assert.equal(joined.code,'4ZV9KH');
 await until(()=>a.some(e=>e.type==='state'&&e.room.players[1].id));
 host.ready();await until(()=>b.some(e=>e.type==='state'&&e.room.players[0].ready));
 guest.ready();await until(()=>a.some(e=>e.type==='state'&&e.room.status==='ready'));
 host.start();await until(()=>b.some(e=>e.type==='started'));
 host.sendAction({kind:'origin',p:{x:7,y:12}},0);
 await until(()=>b.some(e=>e.type==='action'&&e.revision===1));
 assert.equal(b.filter(e=>e.type==='action').at(-1).game.players[0].x,7);
 host.resign();await until(()=>b.some(e=>e.type==='state'&&e.room.status==='finished'));
 host.rematch();await until(()=>b.some(e=>e.type==='state'&&e.room.rematchVotes[0]));
 guest.rematch();await until(()=>a.some(e=>e.type==='state'&&e.room.status==='playing'&&e.room.seatSide[0]===1));
 await host.close();await guest.close();
});
test('unanswered join fails, never creates fake opponent',async()=>{
 const net=mockRealtime(),guest=createClient({realtimeFactory:net.factory,identity:'g',joinTimeout:160});
 await assert.rejects(guest.join('ABC987',()=>{}),/host|offline|room/i);
 await guest.close();
});
test('unconfigured provider fails clearly',()=>{
 assert.throws(()=>createClient({}),/config|Supabase|provider/i);
});
test('join does not miss an admission snapshot delivered before send acknowledgement',async()=>{
 const net=mockRealtime({earlyAdmission:true}),events=[];
 const host=createClient({realtimeFactory:net.factory,identity:'host0000000000000000000001',codeFactory:()=> '4ZV9KH'});
 const guest=createClient({realtimeFactory:net.factory,identity:'guest000000000000000000001',joinTimeout:80});
 const created=await host.create(settings,()=>{});
 const joined=await guest.join(created.code,e=>events.push(e));
 assert.equal(joined.owner,false);
 assert.ok(events.some(e=>e.type==='state'&&e.room.players[1].id==='guest000000000000000000001'));
 await host.close();await guest.close();
});
