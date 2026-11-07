/* Check the two independent Supabase paths used by the Academy (HTTPS)
 * and the game (WebSocket). This is a read-only connectivity diagnosis.
 */
function withTimeout(action,ms,label){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{if(!settled){settled=true;reject(Error(label+'超时'));}},ms);
    Promise.resolve().then(action).then(
      value=>{if(!settled){settled=true;clearTimeout(timer);resolve(value);}},
      error=>{if(!settled){settled=true;clearTimeout(timer);reject(error);}});
  });
}
export function describeSupabaseRoomError(error){
  const message=String(error?.message||error||'未知错误');
  if(/room not found|host offline/i.test(message))
    return '未找到该房间，或房主已离线。请核对房间码和联机线路，并让房主保持网页打开。';
  if(/HTTP\s*(401|403)|invalid.*(?:key|jwt)|(?:apikey|token).*invalid/i.test(message))
    return 'Supabase 项目访问凭证可能无效。请核对项目地址与公开 anon/publishable 密钥，切勿使用 service_role 密钥。';
  if(/realtime|websocket|transport failure|channel.error|timed.out|load failed|failed to fetch|network/i.test(message))
    return 'Supabase 实时连接失败。请先检测联机网络，并在 Supabase 控制台确认项目没有暂停、项目地址正确。不要反复创建房间。';
  return message;
}
export async function diagnoseSupabase({url,anonKey,doFetch=fetch,createRealtime,timeoutMs=9500}={}){
  if(!/^https:\/\//.test(url||'')||!anonKey||typeof createRealtime!=='function')
    throw Error('Supabase 连接配置不完整');
  const target=url.replace(/\/$/,'');
  const https=withTimeout(async()=>{
    const response=await doFetch(target+'/auth/v1/health',{
      method:'GET',mode:'cors',cache:'no-store',
      headers:{apikey:anonKey}
    });
    if(!response.ok)throw Error('HTTP '+response.status);
    return response.status;
  },timeoutMs,'HTTPS');
  const webSocket=withTimeout(async()=>{
    const backend=await createRealtime();
    let channel=null;
    try{
      await new Promise((resolve,reject)=>{
        let finished=false;
        const timer=setTimeout(()=>{if(!finished){finished=true;reject(Error('WebSocket超时'));}},timeoutMs);
        channel=backend.channel('mmjj:diagnostic:'+Date.now()+':'+Math.floor(Math.random()*1e9),
          {config:{broadcast:{self:false,ack:true},private:false}});
        channel.subscribe((status,error)=>{
          if(finished)return;
          if(status==='SUBSCRIBED'){finished=true;clearTimeout(timer);resolve();}
          else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){
            finished=true;clearTimeout(timer);reject(Error(error?.message||status));
          }
        });
      });
      return true;
    }finally{
      if(channel)try{await backend.removeChannel(channel)}catch(_){}
      try{backend.disconnect()}catch(_){}
    }
  },timeoutMs+600,'WebSocket');
  const [httpResult,wsResult]=await Promise.allSettled([https,webSocket]);
  const httpsOk=httpResult.status==='fulfilled',websocketOk=wsResult.status==='fulfilled';
  const why=reason=>String(reason?.message||reason||'未知错误').replace(/https?:\/\/\S+/g,'连接地址').slice(0,80);
  const detail=httpsOk&&websocketOk?'Supabase HTTPS 与 WebSocket 实时通信正常，可以尝试创建房间。':
   httpsOk?'Supabase HTTPS 连接正常（HTTP '+httpResult.value+'），但 WebSocket 失败（'+why(wsResult.reason)+'）。当前实时联机不可用；可考虑 HTTPS 轮询模式。':
   websocketOk?'WebSocket 实时连接成功，但 HTTPS 接口异常（'+why(httpResult.reason)+'），建议复查服务状态。':
   'Supabase HTTPS 无法访问或超时（'+why(httpResult.reason)+'），WebSocket 也失败（'+why(wsResult.reason)+'）。请在 Supabase 控制台检查项目是否暂停、项目地址是否正确，再检查本机网络。不要反复创建房间。';
  return {ok:httpsOk&&websocketOk,httpsOk,websocketOk,detail};
}
