import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
import {RealtimeClient} from './vendor/realtime.mjs';
const ctx={window:{}};
runInNewContext(readFileSync(new URL('./supabase-config.js',import.meta.url),'utf8'),ctx);
const {url,anonKey}=ctx.window.MMJJ_SB_CONFIG;
const topic='mmjj:live-probe:'+randomUUID();
const make=()=>new RealtimeClient(url+'/realtime/v1',{params:{apikey:anonKey},accessToken:async()=>anonKey,timeout:10000});
const a=make(),b=make(),logs=[];
function subscribe(client,id){
 return new Promise((resolve,reject)=>{
  const ch=client.channel(topic,{config:{broadcast:{ack:true,self:false},private:false}});
  if(id==='B')ch.on('broadcast',{event:'ping'},payload=>{logs.push(payload.payload?.message)});
  const timer=setTimeout(()=>reject(Error(id+': connection timeout')),16000);
  ch.subscribe((state,err)=>{
   if(state==='SUBSCRIBED'){clearTimeout(timer);resolve(ch);}
   if(state==='CHANNEL_ERROR'||state==='TIMED_OUT'||state==='CLOSED'){clearTimeout(timer);reject(Error(id+': '+state+' '+(err?.message||'')));}
  });
 });
}
let chA,chB;
try{
 chA=await subscribe(a,'A');chB=await subscribe(b,'B');
 const result=await chA.send({type:'broadcast',event:'ping',payload:{message:'probe-'+Date.now()}});
 for(let i=0;i<50&&!logs.length;i++)await new Promise(r=>setTimeout(r,100));
 if(result!=='ok'||!logs.length)throw Error('Broadcast not delivered: '+result);
 console.log('SUPABASE_REALTIME_BROADCAST_OK: two separate connections, both subscribed, one received event.');
}catch(err){console.error('SUPABASE_REALTIME_BROADCAST_FAILED: '+err.message);process.exitCode=1}
finally{
 for(const [client,channel] of [[a,chA],[b,chB]]){try{if(channel)await client.removeChannel(channel);}catch(_){};try{client.disconnect()}catch(_){}}
}
