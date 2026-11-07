/* Local Chrome DevTools smoke test: lobby, map card CRUD, solo match and AI.
   Uses Node's built-in WebSocket, without adding production dependencies. */
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';

const port=await new Promise((resolve,reject)=>{const server=createServer();server.on("error",reject);server.listen(0,"127.0.0.1",()=>{const selected=server.address().port;server.close(()=>resolve(selected));});});
const profile=mkdtempSync(join(tmpdir(),'mmjj-e2e-'));
const executable='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const process=spawn(executable,[
 '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
 '--disable-extensions','--no-proxy-server','--remote-allow-origins=*',
 '--remote-debugging-port='+port,'--user-data-dir='+profile,'--window-size=390,844',
 'about:blank'
],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket=null,serial=0,pending=new Map();
try{
 let target=null;
 for(let attempt=0;attempt<45;attempt++){
   try{
     const res=await fetch('http://127.0.0.1:'+port+'/json/new?'+(globalThis.process.env.MMJJ_WEB_SERVER||'http://127.0.0.1:8898/'),{method:'PUT'});
     if(res.ok){target=await res.json();break;}
   }catch(_){}
   await delay(250);
 }
 assert.ok(target,'Chrome DevTools endpoint unavailable');
 socket=new WebSocket(target.webSocketDebuggerUrl);
 socket.addEventListener('message',event=>{
   const data=JSON.parse(event.data);
   if(!data.id)return;
   const receiver=pending.get(data.id);
   if(receiver){pending.delete(data.id);receiver(data);}
 });
 await new Promise((resolve,reject)=>{
   socket.addEventListener('open',resolve,{once:true});
   socket.addEventListener('error',reject,{once:true});
 });
 async function cmd(method,params={}){
   const id=++serial;
   const result=new Promise((resolve,reject)=>{
     pending.set(id,(data)=>data.error?reject(new Error(data.error.message)):resolve(data.result));
   });
   socket.send(JSON.stringify({id,method,params}));
   return result;
 }
 async function evalJS(expression){
   const result=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
   if(result.exceptionDetails)throw Error('Browser error: '+JSON.stringify(result.exceptionDetails));
   return result.result.value;
 }
 async function awaitTruthy(expression,timeout=8000){
   const deadline=Date.now()+timeout;
   while(Date.now()<deadline){
     if(await evalJS(expression))return;
     await delay(180);
   }
   throw Error('Condition timed out: '+expression);
 }
 await cmd('Runtime.enable');await cmd('Page.enable');
 await awaitTruthy('!!(window.MumuLobby && window.MumuFriendsUI && document.getElementById("mmjjLobbyStart"))',12000);
 assert.equal(await evalJS('MumuLobby.isVisible()'),true,'should open game lobby first');
 assert.equal(await evalJS('document.querySelectorAll("#mmjjLobby .mmjj-mode-card.selected").length'),0);
 assert.equal(await evalJS('document.querySelector(".mmjj-config-column").hidden'),true);
 console.log('PASS four equal lobby cards; none selected');
 await evalJS('document.getElementById("mmjjModeFriends").click()');
 assert.equal(await evalJS('!document.getElementById("mmjjHub").hidden'),true);
 await evalJS('document.getElementById("mmjjClose").click()');
 assert.equal(await evalJS('MumuLobby.isVisible()'),true);
 console.log('PASS lobby -> room settings -> lobby');
 await evalJS('document.getElementById("mmjjModeMaps").click()');
 assert.equal(await evalJS('!document.getElementById("mmjjHub").hidden'),true);
 await evalJS('document.getElementById("mmjjSaveName").value="浏览器测试地图";document.getElementById("mmjjSaveCurrent").click()');
 assert.equal(await evalJS('MumuFriendsUI.store.list().some(m=>m.name==="浏览器测试地图")'),true);
 await evalJS('document.querySelector("#mmjjMapGrid .mmjj-map-card").click()');
 assert.equal(await evalJS('document.getElementById("mmjjDetailName").textContent'),"浏览器测试地图");
 await evalJS('document.getElementById("mmjjRenameField").value="改名的预设地图";document.getElementById("mmjjRenameMap").click()');
 assert.equal(await evalJS('MumuFriendsUI.store.list().some(m=>m.name==="改名的预设地图")'),true);
 await evalJS('document.getElementById("mmjjClose").click()');
 console.log('PASS saved-map cards, detail view and rename');
 await evalJS('document.getElementById("mmjjModeLocal").click()');
 assert.equal(await evalJS('MumuLobby.isConfiguring()'),true);
 assert.equal(await evalJS('document.querySelector(".mmjj-mode-column").hidden'),true);
 await awaitTruthy('!document.getElementById("mmjjLobbyStart").disabled',20000);
 await evalJS('document.getElementById("mmjjLobbyStart").click()');
 assert.equal(await evalJS('MumuLobby.isVisible()'),false);
 assert.equal(await evalJS('MumuLobbyGame.info().mode'),'local');
 assert.equal(await evalJS('MumuLobbyGame.info().phase'),'pick-attack');
 console.log('PASS new local match from lobby');
 await evalJS('document.getElementById("mmjjBackToLobby").click()');
 assert.equal(await evalJS('MumuLobby.isVisible()'),true);
 await evalJS('document.getElementById("mmjjModeAI").click()');
 await evalJS('document.getElementById("mmjjLobbyStart").click()');
 assert.equal(await evalJS('MumuLobbyGame.info().mode'),'cpu');
 assert.equal(await evalJS('!document.getElementById("rpsModal").hidden'),true);
 assert.equal(await evalJS('MumuLobby.isVisible()'),false);
 console.log('PASS challenge AI after choosing mode');
 await evalJS('document.getElementById("mmjjBackToLobby").click()');
 await evalJS('document.getElementById("mmjjModeLocal").click()');
 await evalJS('document.getElementById("mmjjLobbyMapSource").value="official";document.getElementById("mmjjLobbyMapSource").dispatchEvent(new Event("change",{bubbles:true}))');
 assert.equal(await evalJS('document.getElementById("mmjjLobbyStart").disabled'),false,'official map should be playable');
 assert.equal(await evalJS('document.getElementById("mmjjLobbyMapName").textContent'),'经典地图');
 await evalJS('document.getElementById("mmjjModeLocal").click();document.getElementById("mmjjLobbyAdvanced").click()');
 await evalJS('document.getElementById("mmjjLobbyStart").click()');
 assert.equal(await evalJS('MumuLobbyGame.info().variant'),'advanced');
 assert.equal(await evalJS('MumuMapV2.fingerprint(MumuMapV2.get())===MumuMapV2.fingerprint(MumuMapV2.official())'),true);
 console.log('PASS advanced match uses exact official map');
 await evalJS('document.getElementById("mmjjBackToLobby").click()');
 await evalJS('document.getElementById("mmjjModeLocal").click()');
 await evalJS('document.getElementById("mmjjLobbyMapSource").value="saved";document.getElementById("mmjjLobbyMapSource").dispatchEvent(new Event("change",{bubbles:true}))');
 assert.equal(await evalJS('document.getElementById("mmjjLobbyStart").disabled'),false,'saved map should be playable');
 const selectedName=await evalJS('document.getElementById("mmjjLobbyMapName").textContent');
 assert.equal(selectedName,await evalJS('MumuFriendsUI.store.list()[0].name'));
 await evalJS('document.getElementById("mmjjLobbyStart").click()');
 assert.equal(await evalJS('MumuLobby.isVisible()'),false);
 assert.equal(await evalJS('MumuMapV2.get().name'),selectedName);
 console.log('PASS named saved map opens as exact playable terrain');
 await evalJS('document.getElementById("mmjjBackToLobby").click();document.getElementById("mmjjModeAI").click()');
 await evalJS('document.getElementById("mmjjLobbyMapSource").value="random-battle";document.getElementById("mmjjLobbyMapSource").dispatchEvent(new Event("change",{bubbles:true}))');
 await awaitTruthy('!document.getElementById("mmjjLobbyStart").disabled',20000);
 const beforeMap=await evalJS('MumuMapV2.fingerprint(MumuLobby.preview())');
 await evalJS('document.getElementById("mmjjLobbyBack").click();document.getElementById("mmjjModeLocal").click()');
 assert.equal(await evalJS('MumuMapV2.fingerprint(MumuLobby.preview())'),beforeMap);
 console.log('PASS random map remains the same across navigation');
 await evalJS('document.getElementById("mmjjBackToLobby").click()');
 const overflow=await evalJS('document.documentElement.scrollWidth > window.innerWidth + 1');
 assert.equal(overflow,false,'main lobby must not overflow horizontally');
 console.log('PASS responsive lobby has no horizontal overflow');
 console.log('BROWSER SMOKE PASS');
}finally{
 if(socket)socket.close();
 process.kill();
 await delay(200);
 rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
