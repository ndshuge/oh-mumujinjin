import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from './cn-im-transport.mjs';
const map={version:2,rulesVersion:'map-v2-r1',name:'国内测试图',rocks:[],ice:[],boost:[],portals:[]};
const settings={map,variant:'classic',side:'gold',first:'host'};
function fakeNetwork(){
 const sdkList=[],groups=new Map();
 const TYPES={GRP_MEETING:'Meeting',CONV_GROUP:'GROUP',JOIN_STATUS_SUCCESS:'Joined'};
 const EVENT={SDK_READY:'ready',MESSAGE_RECEIVED:'received'};
 function sdk(){
  const events=new Map(),obj={
   TYPES,EVENT,id:null,group:null,
   on(name,fn){if(!events.has(name))events.set(name,[]);events.get(name).push(fn);},
   off(name,fn){events.set(name,(events.get(name)||[]).filter(x=>x!==fn));},
   emit(name,data){(events.get(name)||[]).forEach(fn=>fn(data));},
   async login({userID}){obj.id=userID;queueMicrotask(()=>obj.emit(EVENT.SDK_READY,{}));return {};},
   async createGroup({groupID}){if(groups.has(groupID))throw Error('group exists');groups.set(groupID,{ownerID:obj.id,messages:[],members:new Set([obj])});obj.group=groupID;return {data:{group:{groupID}}};},
   async joinGroup({groupID}){const g=groups.get(groupID);if(!g)throw Error('not found');g.members.add(obj);obj.group=groupID;return {data:{status:TYPES.JOIN_STATUS_SUCCESS}};},
   createCustomMessage({to,payload}){return {to,payload};},
   async sendMessage(msg){const g=groups.get(msg.to);if(!g)throw Error('not found');
    const event={to:msg.to,conversationID:'GROUP'+msg.to,from:obj.id,payload:msg.payload};
    g.messages.push(event);
    for(const other of g.members)if(other!==obj)queueMicrotask(()=>other.emit(EVENT.MESSAGE_RECEIVED,{data:[event]}));
    return {data:{message:event}};
   },
   async getGroupProfile({groupID}){return {data:{group:{ownerID:groups.get(groupID)?.ownerID}}};},
   async getMessageList({conversationID}){const groupID=conversationID.replace(/^GROUP/,'');return {data:{messageList:groups.get(groupID)?.messages.slice(-15)||[]}};},
   async dismissGroup(groupID){groups.delete(groupID);return {}},
   async quitGroup(){return {}},
   async logout(){return {}}
  };sdkList.push(obj);return obj;
 }
 let counter=0;
 const sdkFactory={TYPES,EVENT,create(){return sdk();}};
 const auth=async()=>({sdkAppID:1400000000,userID:'m_'+String(++counter).padStart(24,'0'),userSig:'TEST',ticket:'t'});
 return {sdkFactory,auth,groups,sdkList};
}
const wait=async(testFn,ms=2000)=>{const end=Date.now()+ms;while(Date.now()<end){if(testFn())return;await new Promise(r=>setTimeout(r,10));}throw Error('event timeout');};
test('two separate Tencent SDK peers create, join and synchronize a real board by host authority',async()=>{
 const net=fakeNetwork(),a=[],b=[];
 const host=createClient({sdkFactory:net.sdkFactory,auth:net.auth}),guest=createClient({sdkFactory:net.sdkFactory,auth:net.auth});
 const info=await host.create(settings,e=>a.push(e));
 await guest.join(info.code,e=>b.push(e));
 await wait(()=>a.some(e=>e.type==='state'&&e.room.players[1].id));
 host.ready();await wait(()=>b.some(e=>e.type==='state'&&e.room.players[0].ready));
 guest.ready();await wait(()=>a.some(e=>e.type==='state'&&e.room.status==='ready'));
 host.start();await wait(()=>b.some(e=>e.type==='started'));
 assert.equal(b.at(-1).room?.status,'playing');
 host.sendAction({kind:'origin',p:{x:7,y:12}},0);
 await wait(()=>b.some(e=>e.type==='action'&&e.revision===1));
 assert.equal(b.filter(e=>e.type==='action').at(-1).game.players[0].x,7);
 guest.sendAction({kind:'origin',p:{x:0,y:0}},1);
 await wait(()=>a.some(e=>e.type==='action'&&e.revision===2));
 await host.close();await guest.close();
});
test('guest cannot force a state snapshot or play for host',async()=>{
 const net=fakeNetwork(),a=[],b=[];
 const host=createClient({sdkFactory:net.sdkFactory,auth:net.auth}),guest=createClient({sdkFactory:net.sdkFactory,auth:net.auth});
 const info=await host.create(settings,e=>a.push(e));
 await guest.join(info.code,e=>b.push(e));
 await wait(()=>b.some(e=>e.type==='state'));
 const g=net.sdkList[1];
 await g.sendMessage(g.createCustomMessage({to:'MMJJ_'+info.code,payload:{data:JSON.stringify({v:1,kind:'snapshot',room:{status:'playing',ownerId:g.id}})}}));
 assert.notEqual(guest.getState().status,'playing');
 // A third IM group participant may send arbitrary JSON messages; it must never
 // gain authority by claiming to be the group owner in its own message.
 const intruder=net.sdkFactory.create();
 await intruder.login({userID:'m_'+'x'.repeat(24),userSig:'TEST'});
 await intruder.joinGroup({groupID:'MMJJ_'+info.code});
 const forged={...guest.getState(),ownerId:intruder.id,status:'playing',revision:99};
 await intruder.sendMessage(intruder.createCustomMessage({
   to:'MMJJ_'+info.code,payload:{data:JSON.stringify({v:1,kind:'snapshot',seq:999,room:forged})}
 }));
 await new Promise(r=>setTimeout(r,30));
 assert.notEqual(guest.getState().status,'playing');
 await host.close();
 assert.equal(net.groups.has('MMJJ_'+info.code),false,'owner must dismiss meeting group');
 await guest.close();
});

test('simultaneous ready intents are serialized by the host instead of overwriting',async()=>{
 const net=fakeNetwork(),a=[],b=[];
 const host=createClient({sdkFactory:net.sdkFactory,auth:net.auth}),guest=createClient({sdkFactory:net.sdkFactory,auth:net.auth});
 const info=await host.create(settings,e=>a.push(e));
 await guest.join(info.code,e=>b.push(e));
 await Promise.all([host.ready(),guest.ready()]);
 await wait(()=>a.some(e=>e.type==='state'&&e.room.status==='ready'));
 assert.equal(host.getState().players.filter(p=>p.ready).length,2);
 await host.close();await guest.close();
});
test('rejoining with host identity resumes authority',async()=>{
 const net=fakeNetwork(),events=[];
 const stable=async()=>({sdkAppID:1400000000,userID:'m_'+'a'.repeat(24),userSig:'TEST',ticket:'same'});
 const original=createClient({sdkFactory:net.sdkFactory,auth:stable});
 const info=await original.create(settings,()=>{});
 const restored=createClient({sdkFactory:net.sdkFactory,auth:stable});
 const joined=await restored.join(info.code,e=>events.push(e));
 assert.equal(joined.owner,true);
 assert.equal(restored.isOwner(),true);
 await restored.close();
});
