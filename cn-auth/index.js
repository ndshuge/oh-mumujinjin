/* CloudBase event-style function. IM secret and ticket HMAC key only live here.
 * Deploy as an event cloud function exposed by a CORS-configured HTTP gateway route.
 * Web clients never receive the shared signing secret. */
'use strict';
const crypto=require('node:crypto');
const TTL_MS=30*24*60*60*1000;
const SIG_SECONDS=24*60*60;
const encode=x=>Buffer.from(x).toString('base64url');
function verifyTicket(ticket,key){
 if(typeof ticket!=='string'||ticket.length>700)throw Error('ticket invalid');
 const parts=ticket.split('.');
 if(parts.length!==2)throw Error('ticket invalid');
 const expected=crypto.createHmac('sha256',key).update(parts[0]).digest();
 const given=Buffer.from(parts[1],'base64url');
 if(expected.length!==given.length||!crypto.timingSafeEqual(expected,given))throw Error('ticket invalid');
 const obj=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
 if(!obj||typeof obj.id!=='string'||!/^m_[a-z0-9]{24}$/.test(obj.id)||!Number.isSafeInteger(obj.exp)||obj.exp<Date.now())throw Error('ticket expired');
 return obj.id;
}
function mintTicket(id,key){
 const payload=encode(JSON.stringify({id,exp:Date.now()+TTL_MS}));
 const mac=crypto.createHmac('sha256',key).update(payload).digest('base64url');
 return payload+'.'+mac;
}
function createApp(cfg=process.env,signer){
 const appID=Number(cfg.IM_APP_ID),allowed=String(cfg.ALLOWED_ORIGINS||'https://ndshuge.github.io')
    .split(',').map(x=>x.trim()).filter(Boolean);
 const key=cfg.IM_SESSION_SECRET,secret=cfg.IM_SECRET_KEY;
 if(!Number.isSafeInteger(appID)||appID<=0)throw Error('IM_APP_ID missing or invalid');
 if(!secret)throw Error('IM_SECRET_KEY missing');
 if(!key||key.length<32)throw Error('IM_SESSION_SECRET missing or too short');
 // Module is loaded only on the function server, not from the public JS bundle.
 const realSigner=signer || (async({userID})=>{
   const Sig=require('tls-sig-api-v2');
   return new Sig.Api(appID,secret).genSig(userID,SIG_SECONDS);
 });
 function reply(statusCode,data,origin){
   const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
   if(origin)headers['Access-Control-Allow-Origin']=origin;
   headers['Access-Control-Allow-Headers']='Content-Type';
   headers['Access-Control-Allow-Methods']='POST,OPTIONS';
   return {statusCode,headers,body:JSON.stringify(data)};
 }
 return async function main(event){
   const origin=event?.headers?.origin||event?.headers?.Origin||'';
   if(!allowed.includes(origin))return reply(403,{error:'请求来源不受允许'});
   const method=event?.httpMethod||event?.requestContext?.httpMethod||event?.method||'POST';
   if(method==='OPTIONS')return {...reply(204,{},origin),body:''};
   if(method!=='POST')return reply(405,{error:'请求方法不支持'},origin);
   try{
     const body=typeof event?.body==='string'
       ? JSON.parse(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body)
       : event?.body||{};
     if(JSON.stringify(body).length>1200) return reply(413,{error:'请求过大'},origin);
     let id;
     if(body.ticket){try{id=verifyTicket(body.ticket,key);}catch(_){return reply(401,{error:'身份票据失效，请重新打开房间'},origin);}}
     else id='m_'+crypto.randomBytes(12).toString('hex');
     const userSig=await realSigner({userID:id,sdkAppID:appID});
     if(typeof userSig!=='string'||!userSig)throw Error('签名服务暂不可用');
     return reply(200,{sdkAppID:appID,userID:id,userSig,ticket:mintTicket(id,key),expiresIn:SIG_SECONDS},origin);
   }catch(_){return reply(500,{error:'身份服务暂不可用'},origin);}
 };
}
/* CloudBase SDK callFunction sends the data object directly, not an HTTP event.
 * Deploy with function rule {"mmjj-cn-auth":{"invoke":"auth != null"}}.
 * CloudBase validates the anonymous session before calling this function.
 */
function createCloudBaseHandler(cfg=process.env,signer){
 const http=createApp(cfg,signer);
 return async(event)=>{
   if(!event||typeof event!=='object'||Array.isArray(event))return {statusCode:400,body:'{"error":"请求格式无效"}'};
   const allowed=String(cfg.ALLOWED_ORIGINS||'https://ndshuge.github.io').split(',')[0].trim();
   return http({httpMethod:'POST',headers:{origin:allowed},body:JSON.stringify(event)});
 };
}
let instance=null,callable=null;
exports.main=async(event,context)=>{
 if(event&&(event.httpMethod||event.requestContext?.httpMethod||event.method)){
   if(!instance)instance=createApp();
   return instance(event,context);
 }
 if(!callable)callable=createCloudBaseHandler();
 return callable(event,context);
};
exports.createApp=createApp;
exports.createCloudBaseHandler=createCloudBaseHandler;
exports.verifyTicket=verifyTicket;
