/* Public Supabase Realtime rooms. No academy account data is touched. */
(function(root){
 'use strict';
 const config=()=>root.MMJJ_SB_CONFIG||{};
 const available=()=>!!(config().enabled&&/^https:\/\//.test(config().url||'')&&config().anonKey);
 const storage=root.localStorage;
 let modulePromise=null;
 async function clientModule(){
   if(!modulePromise)modulePromise=import('./supabase-room-transport.mjs?v=relay-fallback-20261108-r1')
     .catch(error=>{modulePromise=null;throw error});
   return modulePromise;
 }
 function createClient(){
   if(!available())throw Error('Supabase Realtime 未配置');
   let callback=()=>{};
   const inner=clientModule().then(mod=>mod.createClient({
      url:config().url,anonKey:config().anonKey,storage,
      fallbackUrls:config().relayUrl?[config().relayUrl]:[]
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

 async function diagnoseAt(url){
   const {diagnoseSupabase}=await import('./supabase-network-check.mjs?v=sb-recovery-20261107-r3');
   return diagnoseSupabase({
     url,anonKey:config().anonKey,timeoutMs:url===config().url?9500:30000,
     createRealtime:async()=>{
       const {RealtimeClient}=await import('./vendor/realtime.mjs');
       return new RealtimeClient(url.replace(/\/$/,'')+'/realtime/v1',
         {params:{apikey:config().anonKey},accessToken:async()=>config().anonKey,timeout:url===config().url?8500:28000});
     }
   });
 }
 async function checkConnection(){
   if(!available())throw Error('Supabase 线路未配置');
   const primary=await diagnoseAt(config().url);
   if(primary.ok||!config().relayUrl)return primary;
   const relay=await diagnoseAt(config().relayUrl);
   if(relay.ok)return {...relay,route:'relay',detail:'Supabase 原地址暂时无法连接，备用中转线路已通过 HTTPS 和 WebSocket 检测。可以尝试创建房间。'};
   return {...primary,detail:primary.detail+' 备用中转也未连接成功；此网络暂不具备联机条件。'};
 }
 root.MumuSupabaseRooms=Object.freeze({available,createClient,checkConnection});
})(window);
