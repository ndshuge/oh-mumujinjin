import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from './supabase-room-transport.mjs';
const settings={variant:'classic',map:{version:2,rulesVersion:'map-v2-r1',name:'fallback-test',rocks:[],ice:[],boost:[],portals:[]},side:'gold',first:'host'};

function fakeFactory({failedOrigin='https://direct.example'}={}){
 const calls=[],closed=[];
 function realtimeFactory(url){
  calls.push(url);
  const broken=url===failedOrigin;
  return {
   channel(){
    return {on(){return this;},subscribe(fn){queueMicrotask(()=>fn(broken?'CHANNEL_ERROR':'SUBSCRIBED',broken?Error('transport failure'):undefined));return this;},
      async send(){return 'ok';}};
   },
   async removeChannel(){closed.push(url);},
   disconnect(){closed.push(url+':socket');}
  };
 }
 return {realtimeFactory,calls,closed};
}
test('direct Supabase continues to take priority when it is available',async()=>{
 const f=fakeFactory({failedOrigin:'https://not-direct.example'});
 const c=createClient({url:'https://direct.example',fallbackUrls:['https://relay.example'],
  realtimeFactory:f.realtimeFactory,identity:'player-host',codeFactory:()=> 'ABC234'});
 const result=await c.create(settings,()=>{});
 assert.equal(result.code,'ABC234');
 assert.deepEqual(f.calls,['https://direct.example']);
 await c.close();
});
test('failed direct subscription automatically retries the same room through the Supabase relay',async()=>{
 const f=fakeFactory();
 const c=createClient({url:'https://direct.example',fallbackUrls:['https://relay.example'],
  realtimeFactory:f.realtimeFactory,identity:'player-host',codeFactory:()=> 'ABC234'});
 const result=await c.create(settings,()=>{});
 assert.equal(result.code,'ABC234');
 assert.deepEqual(f.calls,['https://direct.example','https://relay.example']);
 assert.ok(f.closed.includes('https://direct.example:socket'));
 await c.close();
});
test('does not claim a room was created when direct and relay are both unreachable',async()=>{
 const f=fakeFactory({failedOrigin:'https://direct.example'});
 const allBroken=()=>({
  channel(){return {on(){return this;},subscribe(fn){queueMicrotask(()=>fn('CHANNEL_ERROR',Error('network blocked')));return this;}}},
  async removeChannel(){},disconnect(){}
 });
 const c=createClient({url:'https://direct.example',fallbackUrls:['https://relay.example'],
  realtimeFactory:allBroken,identity:'player-host',codeFactory:()=> 'ABC234'});
 await assert.rejects(c.create(settings,()=>{}),/unreachable|failed|blocked|连接/i);
 await c.close();
});

test('relay tolerates an initial SDK TIMED_OUT and accepts a later SUBSCRIBED event',async()=>{
 const attempts=[];
 const factory=url=>{
  attempts.push(url);
  const relay=url==='https://relay.example';
  return {
   channel(){return {
    on(){return this;},
    subscribe(cb){
     if(!relay)queueMicrotask(()=>cb('CHANNEL_ERROR',Error('network blocked')));
     else{queueMicrotask(()=>cb('TIMED_OUT'));setTimeout(()=>cb('SUBSCRIBED'),12);}
     return this;
    },
    async send(){return 'ok';}
   };},
   disconnect(){}
  };
 };
 const c=createClient({url:'https://direct.example',fallbackUrls:['https://relay.example'],
  realtimeFactory:factory,identity:'player-host',codeFactory:()=> 'ABC234',connectTimeout:100});
 const created=await c.create(settings,()=>{});
 assert.equal(created.code,'ABC234');
 assert.deepEqual(attempts,['https://direct.example','https://relay.example']);
 await c.close();
});
