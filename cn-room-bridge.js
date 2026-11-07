/* Tencent IM and CloudBase adapters load only if domestic mode is configured. */
(function (root) {
 'use strict';
 const config=()=>root.MMJJ_CN_CONFIG||{};
 const available=()=>!!(config().enabled&&Number(config().sdkAppID)>0&&
   (String(config().envId||'').trim() || /^https:\/\//.test(config().authEndpoint||'')));
 let authPromise=null;
 function cloudAuth(){
   if(!authPromise)authPromise=import('./cn-cloudbase-auth.mjs')
     .then(mod=>mod.createCloudBaseAuth({config:config(),storage:root.localStorage}))
     .catch(err=>{authPromise=null;throw err;});
   return authPromise;
 }
 async function signIn(){return (await cloudAuth())();}
 function createClient(){
   if(!available())throw Error('国内联机尚未配置完成，暂请选择国际线路');
   let callback=()=>{};
   const client=import('./cn-im-transport.mjs').then(mod=>mod.createClient(config().envId
     ? {auth:signIn,storage:root.localStorage}
     : {authEndpoint:config().authEndpoint,storage:root.localStorage}));
   function init(op,args,fn){callback=fn;return client.then(c=>c[op](...args,fn));}
   function fire(op,...args){
     client.then(c=>c[op](...args)).catch(e=>{
       callback({type:'error',message:e.message||'国内联机暂不可用'});
     });
   }
   return Object.freeze({
     create:(settings,fn)=>init('create',[settings],fn),
     join:(code,fn)=>init('join',[code],fn),
     ready:()=>fire('ready'),start:()=>fire('start'),
     resign:()=>fire('resign'),rematch:()=>fire('rematch'),
     sendAction:(action,revision)=>fire('sendAction',action,revision),
     close:()=>fire('close')
   });
 }
 async function checkConnection(){
   if(!available())throw Error('国内联机尚未配置');
   if(config().envId){
     const data=await signIn();
     return {ok:!!data.userSig,provider:'tencent-cloudbase'};
   }
   const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),10000);
   try{
     const rsp=await fetch(config().authEndpoint,{method:'POST',
       headers:{'Content-Type':'application/json'},body:'{}',signal:ctl.signal});
     const data=await rsp.json().catch(()=>({}));
     if(!rsp.ok)throw Error(data.error||'国内联机暂不可用');
     return {ok:!!data.userSig,provider:'tencent-im'};
   }finally{clearTimeout(timer);}
 }
 root.MumuCNRooms=Object.freeze({available,createClient,checkConnection});
})(window);