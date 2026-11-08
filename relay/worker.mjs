// Small, opt-in Supabase Realtime relay canary for restricted mobile networks.
// No service_role keys, generic proxy endpoint, or user-provided upstream URLs.
const SUPABASE_ORIGIN='https://yycokuphczoxfntcwizi.supabase.co';
const ALLOWED_ORIGIN='https://ndshuge.github.io';
const timeoutMs=8500;
function json(data,status=200,origin=null){
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
 if(origin===ALLOWED_ORIGIN)headers['Access-Control-Allow-Origin']=origin;
 return new Response(JSON.stringify(data),{status,headers});
}
const preflight=origin=>new Response(null,{status:204,headers:{
 'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,OPTIONS',
 'Access-Control-Allow-Headers':'apikey,authorization,content-type,x-client-info',
 'Access-Control-Max-Age':'600','Vary':'Origin'
}});
const allowedRoute=path=>path==='/auth/v1/health'||path==='/realtime/v1/websocket';

export async function handleRequest(request,{fetchUpstream=fetch}={}){
 const url=new URL(request.url),origin=request.headers.get('Origin');
 // Access restrictions must be evaluated before reading any upstream credentials.
 if(origin&&origin!==ALLOWED_ORIGIN)return json({error:'Origin forbidden'},403);
 if(request.method==='OPTIONS'){
  if(!['/auth/v1/health','/realtime/v1/websocket'].includes(url.pathname)||origin!==ALLOWED_ORIGIN)
   return json({error:'Invalid preflight'},403);
  return preflight(origin);
 }
 if(request.method!=='GET')return json({error:'GET only'},405,origin);
 if(url.pathname==='/health'){
  return json({ok:true,service:'mmjj-supabase-relay',mode:'canary',note:'This only verifies reachability to the relay. Upstream WebSocket not guaranteed.'},200,origin);
 }
 if(url.pathname==='/probe/upstream'){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const res=await fetchUpstream(new Request(SUPABASE_ORIGIN+'/auth/v1/health',{signal:controller.signal}));
   return json({ok:true,upstreamReachable:[200,401,403].includes(res.status),upstreamStatus:res.status},200,origin);
  }catch(_){return json({ok:true,upstreamReachable:false},200,origin);}
  finally{clearTimeout(timer);}
 }
 if(!allowedRoute(url.pathname))return json({error:'Not found'},404,origin);
 const websocket=url.pathname==='/realtime/v1/websocket';
 if(websocket && request.headers.get('Upgrade')?.toLowerCase()!=='websocket')
  return json({error:'WebSocket upgrade required'},426,origin);
 if(!websocket && request.headers.get('Upgrade'))
  return json({error:'Unexpected upgrade'},400,origin);

 const upstreamUrl=new URL(SUPABASE_ORIGIN+url.pathname+url.search);
 try{
  // The target host is hard-coded, never derived from request headers or query params.
  // Native Workers fetch preserves WebSocket upgrades and allows returning the 101 response.
  const remote=await fetchUpstream(new Request(upstreamUrl.toString(),request));
  if(websocket)return remote;
  const headers=new Headers(remote.headers);
  headers.set('Cache-Control','no-store');headers.set('Vary','Origin');
  if(origin===ALLOWED_ORIGIN)headers.set('Access-Control-Allow-Origin',origin);
  return new Response(remote.body,{status:remote.status,statusText:remote.statusText,headers});
 }catch(_){
  return json({error:'Supabase upstream unavailable from relay'},502,origin);
 }
}
export default {fetch(request,env,ctx){return handleRequest(request);}};
