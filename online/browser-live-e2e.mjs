/* Complete in-browser two-tab duel smoke, local Wrangler + static server.
 * Requires: python -m http.server 8899 + wrangler dev --port 8787.
 * Uses Chrome CDP, two independent page runtimes and real WebSocket transport. */
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const port=9368,base='http://127.0.0.1:'+port,web='http://127.0.0.1:8899/';
const executable='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile=mkdtempSync(join(tmpdir(),'mmjj-real-pvp-'));
const chrome=spawn(executable,['--headless=new','--disable-gpu','--no-first-run',
 '--no-default-browser-check','--disable-extensions','--no-proxy-server',
 '--remote-allow-origins=*','--remote-debugging-port='+port,
 '--user-data-dir='+profile,'--window-size=390,844','about:blank'],
 {stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sessions=[];
async function tab(url){
 let target=null;
 for(let i=0;i<45;i++){
  try{const res=await fetch(base+'/json/new?'+url,{method:'PUT'});if(res.ok){target=await res.json();break;}}catch(_){}
  await sleep(250);
 }
 assert.ok(target,'Chrome CDP missing');
 const ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 let serial=0;const callbacks=new Map();
 ws.addEventListener('message',event=>{
  const data=JSON.parse(event.data);
  if(data.id&&callbacks.has(data.id)){callbacks.get(data.id)(data);callbacks.delete(data.id);}
 });
 async function cmd(method,params={}){
  const id=++serial;
  const response=new Promise((resolve,reject)=>callbacks.set(id,data=>data.error?reject(Error(JSON.stringify(data.error))):resolve(data.result)));
  ws.send(JSON.stringify({id,method,params}));return response;
 }
 await cmd('Runtime.enable');await cmd('Page.enable');
 async function evaluate(expression){
  const data=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(data.exceptionDetails)throw Error('Browser '+JSON.stringify(data.exceptionDetails));
  return data.result.value;
 }
 async function until(expr,timeout=10000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(await evaluate(expr))return;await sleep(200);}
  throw Error('Timeout waiting for '+expr+' on '+url);
 }
 sessions.push(ws);return {evaluate,until};
}
try{
 const owner=await tab(web);
 await owner.until('!!window.MumuLobby && !!window.MumuFriendsUI');
 await owner.evaluate('document.getElementById("mmjjModeFriends").click()');
 await owner.evaluate('document.getElementById("mmjjMapSource").value="official";document.getElementById("mmjjMapSource").dispatchEvent(new Event("change",{bubbles:true}));document.getElementById("mmjjSide").value="gold";document.getElementById("mmjjFirst").value="host";document.getElementById("mmjjCreateRoom").click()');
 await owner.until('document.getElementById("mmjjLiveCode").textContent.length===6',12000);
 const code=await owner.evaluate('document.getElementById("mmjjLiveCode").textContent');
 assert.match(code,/^[A-Z0-9]{6}$/);
 console.log('PASS browser A created real Cloudflare-local room '+code);
 const friend=await tab(web+'?room='+code);
 await friend.until('!!window.MumuLobby && !!window.MumuFriendsUI');
 assert.equal(await friend.evaluate('document.getElementById("mmjjRoomCode").value'),code);
 await friend.evaluate('document.getElementById("mmjjJoinRoom").click()');
 await friend.until('document.getElementById("mmjjRoomLive").hidden===false',15000);
 console.log('PASS browser B opened invite URL and joined room');
 await owner.until('document.getElementById("mmjjReadyRoom").disabled===false',2500);
 await friend.until('document.getElementById("mmjjReadyRoom").disabled===false',2500);
 await owner.evaluate('document.getElementById("mmjjReadyRoom").click()');
 await friend.evaluate('document.getElementById("mmjjReadyRoom").click()');
 try{await owner.until('document.getElementById("mmjjStartRoom").disabled===false',9000);}
 catch(error){
  const dump=async p=>await p.evaluate('JSON.stringify({notice:document.getElementById("mmjjRoomNotice").textContent,players:document.getElementById("mmjjRoomPlayers").textContent,state:document.getElementById("mmjjRoomState").textContent,ready:document.getElementById("mmjjReadyRoom").disabled,start:document.getElementById("mmjjStartRoom").disabled})');
  console.error('HOST STATE',await dump(owner),'GUEST STATE',await dump(friend));throw error;
 }
 await owner.evaluate('document.getElementById("mmjjStartRoom").click()');
 await owner.until('window.MumuOnline.active()===true',12000);
 await friend.until('window.MumuOnline.active()===true',12000);
 assert.equal(await owner.evaluate('MumuLobby.isVisible()'),false);
 assert.equal(await friend.evaluate('MumuLobby.isVisible()'),false);
 assert.equal(await owner.evaluate('MumuLobbyGame.info().phase'),'pick-attack');
 assert.equal(await friend.evaluate('MumuLobbyGame.info().phase'),'pick-attack');
 console.log('PASS both browser clients entered synchronized gameplay; game lobby closed');
 await owner.evaluate('window.confirm=()=>true;document.getElementById("mmjjBackToLobby").click()');
 await owner.until('window.MumuOnline.active()===false');
 assert.equal(await owner.evaluate('MumuLobby.isVisible()'),true);
 console.log('PASS leaving online match returns to lobby');
 console.log('BROWSER PVP E2E PASS');
}catch(error){
 console.error('BROWSER PVP E2E FAIL: '+error.stack);
 process.exitCode=1;
}finally{
 for(const ws of sessions)try{ws.close();}catch(_){}
 chrome.kill();await sleep(220);rmSync(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});
}
