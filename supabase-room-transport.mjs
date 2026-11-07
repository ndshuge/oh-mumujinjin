/* Friend-room protocol over Supabase Realtime Broadcast.
 * No database tables, academy account sessions, or service_role key involved.
 * Host-authoritative, suitable for trusted casual matches (not prizes).
 */
import {createRoom,applyIntent,viewFor} from './supabase-room-core.mjs';
const ABC='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clone=o=>JSON.parse(JSON.stringify(o));
function randomID(n=24){
 const data=new Uint8Array(n);
 if(globalThis.crypto?.getRandomValues)globalThis.crypto.getRandomValues(data);
 else throw Error('Secure random generator unavailable');
 return Array.from(data,x=>ABC[x%ABC.length]).join('');
}
function validCode(code){if(!/^[A-Z2-9]{6}$/.test(code))throw Error('Invalid room code');}
async function defaultRealtime(config){
 const {RealtimeClient}=await import('./vendor/realtime.mjs');
 const endpoint=config.url?.replace(/\/$/,'')+'/realtime/v1';
 if(!/^https:\/\//.test(endpoint)||!/^[A-Za-z0-9_.-]{30,}$/.test(config.anonKey||''))
   throw Error('Supabase provider configuration missing');
 return new RealtimeClient(endpoint,{params:{apikey:config.anonKey},accessToken:async()=>config.anonKey,
   timeout:12000,heartbeatIntervalMs:25000});
}
export function createClient(options={}){
 const factory=options.realtimeFactory||(()=>defaultRealtime(options));
 if(!options.realtimeFactory&&(!options.url||!options.anonKey))throw Error('Supabase provider configuration missing');
 const storage=options.storage||globalThis.localStorage||null;
 let identity=options.identity;
 if(!identity){
   try{identity=storage?.getItem('mmjj-sb-user')}catch(_){}
   if(!identity){identity='p_'+randomID(24);try{storage?.setItem('mmjj-sb-user',identity)}catch(_){}}
 }
 let callback=()=>{},room=null,owner=false,channel=null,backend=null,code=null,seq=0,lastSeq=-1,
     closed=false,joinTimer=null,joining=null,mutation=Promise.resolve(),connected=false,ownerID=null,published=null;
 const topic=id=>'mmjj:friend:'+id;
 const onEvent=event=>{try{callback(event)}catch(err){queueMicrotask(()=>{throw err})}};
 async function send(payload){
   if(!channel||!connected)throw Error('Realtime channel disconnected');
   const result=await channel.send({type:'broadcast',event:'mmjj',payload});
   if(result!=='ok' && result!=='success' && result!==undefined)throw Error('Realtime delivery failed: '+String(result));
 }
 function saveHost(){
   if(!owner||!room)return;
   try{storage?.setItem('mmjj-sb-host-'+code,JSON.stringify({room,seq}));}catch(_){}
 }
 function receiveState(snapshot){
   if(!snapshot||snapshot.schema!==1||snapshot.code!==code||snapshot.ownerId!==ownerID)return;
   const old=published;
   published=clone(snapshot);
   room=clone(snapshot);
   onEvent({type:'state',room:viewFor(room),owner});
   if(room.game&&room.status==='playing'&&
     (!old?.game||old.status!=='playing'||room.revision===0&&old.revision!==0)){
     const seat=room.players.findIndex(p=>p.id===identity);
     if(seat>=0)onEvent({type:'started',room:viewFor(room),owner,side:room.seatSide[seat],
       firstSide:room.game.firstSide,sendAction});
   }else if(room.game&&old?.game&&room.revision>old.revision){
     onEvent({type:'action',revision:room.revision,game:room.game});
   }
 }
 async function broadcast(){
   if(!owner||!room)return;
   const payload={v:1,type:'state',seq:++seq,actor:identity,room:viewFor(room)};
   await send(payload);
   saveHost();
   receiveState(room);
 }
 async function processIntent(actor,intent){
   try{
     room=applyIntent(room,actor,intent);
     await broadcast();
   }catch(err){onEvent({type:'error',message:String(err.message||err)})}
 }
 function receivePacket(p){
   if(closed||!p||p.v!==1||!/^[A-Z2-9]{6}$/.test(code||''))return;
   if(owner){
     if(p.type==='hello'){mutation=mutation.then(()=>broadcast());return;}
     if(p.type==='intent'&&p.actor!==identity && typeof p.actor==='string' && p.intent){
       mutation=mutation.then(()=>processIntent(p.actor,p.intent));return;
     }
   }else if(p.type==='state'&&(!ownerID||p.actor===ownerID)&&p.room?.ownerId===p.actor&&
     Number.isSafeInteger(p.seq)&&p.seq>lastSeq){
     ownerID=p.actor;
     lastSeq=p.seq;receiveState(p.room);
     if(joining&&(joining.stage==='snapshot'||room?.players.some(x=>x.id===identity))){joining.resolve();joining=null;}
   }
 }
 async function connect(roomCode){
   validCode(roomCode);code=roomCode;
   backend=await factory();
   channel=backend.channel(topic(code),{config:{broadcast:{self:false,ack:true},private:false}});
   channel.on('broadcast',{event:'mmjj'},e=>receivePacket(e.payload));
   await new Promise((resolve,reject)=>{
     let finished=false;
     const timer=setTimeout(()=>{if(!finished){finished=true;reject(Error('Supabase Realtime connection timed out'))}},options.connectTimeout||12000);
     channel.subscribe((status,err)=>{
       if(finished)return;
       if(status==='SUBSCRIBED'){finished=true;connected=true;clearTimeout(timer);resolve();}
       if(status==='TIMED_OUT'||status==='CHANNEL_ERROR'||status==='CLOSED'){
         finished=true;clearTimeout(timer);reject(Error('Supabase Realtime is unreachable: '+(err?.message||status)));
       }
     });
   });
 }
 function invoke(type,data={}){
   mutation=mutation.then(async()=>{
     try{
       const msg={type,...data};
       if(owner)await processIntent(identity,msg);
       else await send({v:1,type:'intent',actor:identity,intent:msg});
     }catch(err){onEvent({type:'error',message:String(err.message||err)})}
   });
   return mutation;
 }
 async function create(settings,cb){
   if(closed)throw Error('Client closed');
   callback=cb;owner=true;ownerID=identity;
   await connect(options.codeFactory?.()||randomID(6));
   room=createRoom(code,identity,settings);
   saveHost();
   await broadcast();
   return {code,owner:true};
 }
 async function join(roomCode,cb){
   if(closed)throw Error('Client closed');
   callback=cb;validCode(roomCode);
   let cached=null;try{cached=JSON.parse(storage?.getItem('mmjj-sb-host-'+roomCode)||'null')}catch(_){}
   if(cached?.room?.ownerId===identity && cached.room.code===roomCode){
     owner=true;ownerID=identity;room=cached.room;seq=cached.seq||0;
     await connect(roomCode);await broadcast();
     return {code,owner:true};
   }
   owner=false;await connect(roomCode);
   await new Promise(async(resolve,reject)=>{
     joinTimer=setTimeout(()=>{joining=null;reject(Error('Room not found or host offline'))},options.joinTimeout||9000);
     joining={stage:'snapshot',resolve:()=>{clearTimeout(joinTimer);joinTimer=null;resolve()}};
     try{await send({v:1,type:'hello',actor:identity})}
     catch(err){clearTimeout(joinTimer);joinTimer=null;reject(err)}
   });
   ownerID=room.ownerId;
   // If we were previously in the room, hello recovered state; otherwise ask host to admit us.
   if(!room.players.some(x=>x.id===identity)){
     await send({v:1,type:'intent',actor:identity,intent:{type:'join'}});
     await new Promise((resolve,reject)=>{
       joinTimer=setTimeout(()=>{joining=null;reject(Error('Host did not accept joining'))},options.joinTimeout||9000);
       joining={stage:'admit',resolve:()=>{clearTimeout(joinTimer);joinTimer=null;resolve()}};
     });
   }
   onEvent({type:'connected'});
   return {code,owner:false};
 }
 async function close(){
   closed=true;if(joinTimer)clearTimeout(joinTimer);joinTimer=null;joining=null;
   try{if(channel)await backend.removeChannel(channel)}catch(_){}
   try{backend?.disconnect?.()}catch(_){}
   channel=null;connected=false;
 }
 const ready=()=>invoke('ready'),start=()=>invoke('start'),resign=()=>invoke('resign'),
   rematch=()=>invoke('rematch'),sendAction=(action,revision)=>invoke('action',{action,revision});
 return Object.freeze({create,join,ready,start,resign,rematch,sendAction,close});
}
