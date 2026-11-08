import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeConnectivity,runProbeSeries} from './network-lab.mjs';

test('all HTTPS and WebSocket failures point to a device network path problem, not a paused project',()=>{
  const result=summarizeConnectivity([{httpsOk:false,websocketOk:false},{httpsOk:false,websocketOk:false}],{cloudflareOk:false});
  assert.equal(result.category,'offline');
  assert.match(result.message,/当前设备|网络/);
  assert.doesNotMatch(result.message,/项目已暂停|密钥失效/);
});
test('HTTPS works but WebSocket fails distinguishes the Realtime channel from project HTTPS',()=>{
  const result=summarizeConnectivity([{httpsOk:true,websocketOk:false}],{cloudflareOk:true});
  assert.equal(result.category,'websocket');
  assert.match(result.message,/HTTPS/);
  assert.match(result.message,/WebSocket/);
});
test('mixed results are reported as unstable rather than working',()=>{
  const samples=[{httpsOk:true,websocketOk:true},{httpsOk:false,websocketOk:false},{httpsOk:true,websocketOk:true}];
  const result=summarizeConnectivity(samples,{cloudflareOk:false});
  assert.equal(result.category,'intermittent');
  assert.equal(result.successCount,2);
  assert.match(result.message,/间歇|时好时坏/);
});
test('three successful rounds require both paths to work in each round',()=>{
  const result=summarizeConnectivity(Array.from({length:3},()=>({httpsOk:true,websocketOk:true})),{cloudflareOk:false});
  assert.equal(result.category,'healthy');
  assert.equal(result.successCount,3);
});
test('runProbeSeries collects sequential samples without storing sensitive keys or URLs',async()=>{
  let count=0;
  const result=await runProbeSeries({probe:async()=>{count++;return {httpsOk:count>1,websocketOk:count>1,detail:'private-url-secret'};},count:3,pause:async()=>{}});
  assert.equal(count,3);
  assert.equal(result.length,3);
  assert.deepEqual(result.map(v=>v.ok),[false,true,true]);
  assert.equal(JSON.stringify(result).includes('private-url-secret'),false);
});
test('a failed probe is recorded as a failure, and does not abort subsequent rounds',async()=>{
  let n=0;
  const result=await runProbeSeries({probe:async()=>{n++;if(n===2)throw Error('secret request url');return {httpsOk:true,websocketOk:true};},count:3,pause:async()=>{}});
  assert.equal(result.length,3);
  assert.deepEqual(result.map(v=>v.ok),[true,false,true]);
  assert.equal(JSON.stringify(result).includes('secret request url'),false);
});
