/* Public Supabase Realtime rooms. No academy account data is touched. */
(function(root){
 'use strict';
 const config=()=>root.MMJJ_SB_CONFIG||{};
 const available=()=>!!(config().enabled&&/^https:\/\//.test(config().url||'')&&config().anonKey);
 const storage=root.localStorage;
 let modulePromise=null;
 async function clientModule(){
   if(!modulePromise)modulePromise=import('./supabase-room-transport.mjs')
     .catch(error=>{modulePromise=null;throw error});
   return modulePromise;
 }
 function createClient(){
   if(!available())throw Error('Supabase Realtime 未配置');
   let callback=()=>{};
   const inner=clientModule().then(mod=>mod.createClient({
      url:config().url,anonKey:config().anonKey,storage
   }));
   function init(op,args,cb){callback=cb;return inner.then(client=>client[op](...args,cb))}
   function send(op,...args){
     return inner.then(client=>client[op](...args))
       .catch(error=>callback({type:'error',message:error.message||'消息发送失败'}));
   }
   return Object.freeze({
     create:(settings,cb)=>init('create',[settings],cb),
     join:(code,cb)=>init('join',[code],cb),
     ready:()=>send('ready'),start:()=>send('start'),
     resign:()=>send('resign'),rematch:()=>send('rematch'),
     sendAction:(action,revision)=>send('sendAction',action,revision),
     close:()=>send('close')
   });
 }
 async function checkConnection(){
   if(!available())throw Error('Supabase 线路未配置');
   const {diagnoseSupabase}=await import('./supabase-network-check.mjs?v=sb-recovery-20261107-r3');
   return diagnoseSupabase({
     url:config().url,anonKey:config().anonKey,
     createRealtime:async()=>{
       const {RealtimeClient}=await import('./vendor/realtime.mjs');
       return new RealtimeClient(config().url.replace(/\/$/,'')+'/realtime/v1',
         {params:{apikey:config().anonKey},accessToken:async()=>config().anonKey,timeout:8500});
     }
   });
 }
 root.MumuSupabaseRooms=Object.freeze({available,createClient,checkConnection});
})(window);
