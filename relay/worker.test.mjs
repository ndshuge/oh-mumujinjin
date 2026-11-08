import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest} from './worker.mjs';
const host='https://yycokuphczoxfntcwizi.supabase.co';
const app='https://ndshuge.github.io';
const req=(path,init={})=>new Request('https://mmjj-relay-canary.pages.dev'+path,init);

test('a public health endpoint is usable by a mainland mobile browser',async()=>{
 const r=await handleRequest(req('/health'),{fetchUpstream:()=>{throw Error('unexpected');}});
 assert.equal(r.status,200);
 assert.equal((await r.json()).service,'mmjj-supabase-relay');
});
test('probe checks Supabase reachability without needing a private key',async()=>{
 const urls=[];
 const up=async r=>{urls.push(r.url);return new Response('Missing API key',{status:401});};
 const r=await handleRequest(req('/probe/upstream'),{fetchUpstream:up});
 assert.equal((await r.json()).upstreamReachable,true);
 assert.deepEqual(urls,[host+'/auth/v1/health']);
 const down=await handleRequest(req('/probe/upstream'),{fetchUpstream:()=>Promise.reject(Error('blocked'))});
 assert.equal((await down.json()).upstreamReachable,false);
});
test('forwards public-key HTTPS requests only to the pinned Supabase project',async()=>{
 let sent;
 const r=await handleRequest(req('/auth/v1/health',{headers:{Origin:app,apikey:'public-anon-key'}}),{
  fetchUpstream:async target=>{sent=target;return new Response('ok',{status:200});}
 });
 assert.equal(sent.url,host+'/auth/v1/health');
 assert.equal(sent.headers.get('apikey'),'public-anon-key');
 assert.equal(r.headers.get('access-control-allow-origin'),app);
});
test('forwards WebSocket upgrade to the canonical Realtime path',async()=>{
 let sent;const upgrade={status:101,webSocket:{},headers:new Headers()};
 const r=await handleRequest(req('/realtime/v1/websocket?apikey=public&vsn=1.0.0',{
  headers:{Origin:app,Upgrade:'websocket',Connection:'Upgrade'}
 }),{fetchUpstream:async target=>{sent=target;return upgrade;}});
 assert.equal(r,upgrade);
 assert.equal(new URL(sent.url).host,new URL(host).host);
 assert.equal(new URL(sent.url).pathname,'/realtime/v1/websocket');
 assert.equal(sent.headers.get('upgrade'),'websocket');
});
test('denies open proxy paths and unrelated origins',async()=>{
 const unexpected=()=>{throw Error('MUST NOT FORWARD');};
 for(const p of ['/https://evil.test','/rest/v1/profiles','/auth/v1/token','/storage/v1/object','/realtime/v1/api/tenants']){
  assert.equal((await handleRequest(req(p,{headers:{Origin:app}}),{fetchUpstream:unexpected})).status,404,p);
 }
 assert.equal((await handleRequest(req('/auth/v1/health',{headers:{Origin:'https://evil.test'}}),{fetchUpstream:unexpected})).status,403);
});
test('preflight permits only the GitHub Pages origin',async()=>{
 const ok=await handleRequest(req('/auth/v1/health',{method:'OPTIONS',headers:{Origin:app}}),{});
 assert.equal(ok.status,204);
 assert.equal(ok.headers.get('access-control-allow-origin'),app);
 assert.equal((await handleRequest(req('/auth/v1/health',{method:'OPTIONS',headers:{Origin:'https://bad.test'}}),{})).status,403);
});
