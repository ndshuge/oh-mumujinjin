/* CloudBase Web SDK anonymous login + callFunction.
 * No UserSig private key, API key, or admin token is exposed to the browser.
 */
export function createCloudBaseAuth({config,cloudbaseFactory,storage=globalThis.localStorage}={}){
 const envId=String(config?.envId||'').trim();
 const functionName=String(config?.functionName||'mmjj-cn-auth').trim();
 if(!/^[\w-]{3,100}$/.test(envId))throw Error('腾讯 CloudBase 环境尚未配置');
 if(!/^[\w-]{2,64}$/.test(functionName))throw Error('云函数名称无效');
 let appPromise;
 async function getApp(){
   if(!appPromise)appPromise=(async()=>{
     const sdk=cloudbaseFactory||(await import('./vendor/cloudbase.mjs')).default;
     const app=sdk.init({env:envId});
     const auth=typeof app.auth==='function'?app.auth():app.auth;
     if(!auth)throw Error('CloudBase 身份验证接口不可用');
     const existing=typeof auth.getSession==='function'?await auth.getSession():null;
     if(!existing?.data?.session){
       const login=await auth.signInAnonymously();
       if(login?.error)throw Error(login.error.message||'匿名登录失败');
     }
     return app;
   })().catch(error=>{appPromise=null;throw error;});
   return appPromise;
 }
 return async function signIntoIM(){
   const app=await getApp();
   let ticket=null;
   try{ticket=storage?.getItem('mmjj-cn-session')||null;}catch(_){}
   const {result,error}=await app.callFunction({
     name:functionName,data:ticket?{ticket}:{}
   });
   if(error)throw Error(error.message||'云函数调用失败');
   let data=result;
   if(typeof data==='string'){try{data=JSON.parse(data);}catch{throw Error('云端身份响应无效');}}
   if(data?.statusCode){
     if(Number(data.statusCode)!==200) {
       let failure={};
       try{failure=typeof data.body==='string'?JSON.parse(data.body):data.body||{};}catch{}
       throw Error(failure.error||'云端身份服务不可用');
     }
     data=typeof data.body==='string'?JSON.parse(data.body):data.body;
   }
   if(!data||!data.userID||!data.userSig||!Number.isSafeInteger(Number(data.sdkAppID)))throw Error('云端身份返回不完整');
   if(Number(data.sdkAppID)!==Number(config.sdkAppID)&&Number(config.sdkAppID)>0)throw Error('IM SDKAppID 与云端不一致');
   if(data.ticket)try{storage?.setItem('mmjj-cn-session',data.ticket);}catch(_){}
   return data;
 };
}
