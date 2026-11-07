/* Lazy browser adapter. Existing friends-hub expects a synchronous client factory. */
(function (root) {
  'use strict';
  const config=()=>root.MMJJ_CN_CONFIG||{};
  const available=()=>!!(config().enabled&&Number(config().sdkAppID)>0&&
                       /^https:\/\//.test(config().authEndpoint));
  function createClient() {
    if(!available())throw Error('国内联机尚未开通，请选择国际联机或等待服务配置');
    let cb=()=>{};
    const client=import('./cn-im-transport.mjs').then(mod=>mod.createClient({
      authEndpoint:config().authEndpoint,
      storage:root.localStorage
    }));
    function init(op,args,fn){
      cb=fn;
      return client.then(c=>c[op](...args,fn));
    }
    function fire(op,...args){
      client.then(c=>c[op](...args)).catch(e=>{
        cb({type:'error',message:e.message||'国内联机暂时不可用'});
      });
    }
    return Object.freeze({
      create:(settings,fn)=>init('create',[settings],fn),
      join:(code,fn)=>init('join',[code],fn),
      ready:()=>fire('ready'),start:()=>fire('start'),
      resign:()=>fire('resign'),rematch:()=>fire('rematch'),
      sendAction:(action,revision)=>fire('sendAction',action,revision),
      close:()=>fire('close'),
      getCode:()=>null,isOwner:()=>false
    });
  }
  async function checkConnection(){
    if(!available())throw Error('国内联机尚未配置');
    let ticket=null;
    try{ticket=root.localStorage.getItem('mmjj-cn-session');}catch(_){}
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),10000);
    try{
      const res=await root.fetch(config().authEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(ticket?{ticket}:{}),signal:ctl.signal});
      const result=await res.json().catch(()=>({}));
      if(!res.ok)throw Error(result.error||'国内联机服务不可用');
      if(result.ticket)try{root.localStorage.setItem('mmjj-cn-session',result.ticket);}catch(_){}
      return {ok:true,provider:'tencent-im'};
    }catch(error){
      if(error.name==='AbortError')throw Error('国内联机连接超时，请检查移动网络');
      throw error;
    }finally{clearTimeout(timer);}
  }
  root.MumuCNRooms=Object.freeze({available,createClient,checkConnection});
})(window);
