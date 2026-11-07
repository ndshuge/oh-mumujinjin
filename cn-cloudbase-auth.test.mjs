import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudBaseAuth} from './cn-cloudbase-auth.mjs';
const cfg={envId:'mmjj-test',functionName:'mmjj-cn-auth'};
test('CloudBase auth uses anonymous session and function without a new domain',async()=>{
 const seen=[];let signins=0;
 const factory={init:({env})=>{assert.equal(env,'mmjj-test');return {
   auth:()=>({
     async getSession(){return {data:{session:null}};},
     async signInAnonymously(){signins++;return {data:{session:{}}};}
   }),
   async callFunction(obj){seen.push(obj);return {result:{sdkAppID:1600171481,userID:'m_user',userSig:'signature',ticket:'t-1'}};}
 };}};
 const storage={getItem:()=>null,setItem:()=>{}};
 const auth=createCloudBaseAuth({config:cfg,cloudbaseFactory:factory,storage});
 const first=await auth(),second=await auth();
 assert.equal(first.userSig,'signature');
 assert.equal(second.sdkAppID,1600171481);
 assert.equal(signins,1);
 assert.equal(seen.length,2);
 assert.equal(seen[0].name,'mmjj-cn-auth');
 assert.deepEqual(seen[0].data,{});
});
test('rejects unconfigured environments or cloud function errors',async()=>{
 assert.throws(()=>createCloudBaseAuth({config:{envId:''}}),/环境/);
 const factory={init:()=>({auth:()=>({getSession:async()=>({data:{session:{id:'x'}}})}),
  callFunction:async()=>({result:{statusCode:401,body:JSON.stringify({error:'身份失效'})}})})};
 await assert.rejects(createCloudBaseAuth({config:cfg,cloudbaseFactory:factory,storage:{getItem:()=>null}})(),/身份失效/);
});
