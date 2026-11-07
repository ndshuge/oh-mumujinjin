/* Complete in-browser two-tab duel smoke, local Wrangler + static server.
 * Requires: python -m http.server 8899 + wrangler dev --port 8787.
 * Uses Chrome CDP, two independent page runtimes and real WebSocket transport. */
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
const port=await new Promise((resolve,reject)=>{const server=createServer();server.on("error",reject);server.listen(0,"127.0.0.1",()=>{const selected=server.address().port;server.close(()=>resolve(selected));});}),base='http://127.0.0.1:'+port,web=process.env.MMJJ_WEB_SERVER||'http://127.0.0.1:8898/';
const executable='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile=mkdtempSync(join(tmpdir(),'mmjj-real-pvp-'));
const chrome=spawn(executable,['--headless=new','--disable-gpu','--no-first-run',
 '--no-default-browser-check','--disable-extensions',
 ...(process.env.MMJJ_E2E_PROXY?['--proxy-server='+process.env.MMJJ_E2E_PROXY]:['--no-proxy-server']),
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
 await owner.until('document.getElementById("mmjjLiveMapSummary").hidden===false',5000);
 await friend.until('document.getElementById("mmjjLiveMapSummary").hidden===false',5000);
 const hostMap=await owner.evaluate('document.getElementById("mmjjLiveMapSummary").querySelector("strong").textContent');
 assert.equal(hostMap,await friend.evaluate('document.getElementById("mmjjLiveMapSummary").querySelector("strong").textContent'));
 console.log('PASS host and guest preview the same immutable room map');
 await owner.until('document.getElementById("mmjjReadyRoom").disabled===false',2500);
 await friend.until('document.getElementById("mmjjReadyRoom").disabled===false',2500);
 assert.equal(await owner.evaluate('document.getElementById("mmjjReadyRoom").textContent'),'点击准备');
 await owner.evaluate('document.getElementById("mmjjReadyRoom").click()');
 await owner.until('document.getElementById("mmjjReadyRoom").textContent.includes("我已准备")',7000);
 await friend.evaluate('document.getElementById("mmjjReadyRoom").click()');
 await friend.until('document.getElementById("mmjjReadyRoom").textContent.includes("我已准备")',7000);
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
 const mobileHeader=await owner.evaluate('JSON.stringify({viewport:innerWidth,page:document.documentElement.scrollWidth,headerRight:document.querySelector(".header-right").getBoundingClientRect().right,resignVisible:!document.getElementById("mmjjOnlineResign").hidden})');
 const mobileLayout=JSON.parse(mobileHeader);
 assert.equal(mobileLayout.resignVisible,true,'the resign option must be visible during a match');
 assert.ok(mobileLayout.page<=mobileLayout.viewport+1,'online game must not overflow the mobile viewport: '+mobileHeader);
 console.log('PASS active online controls fit the mobile layout');
 const clickTile=async(client,x,y)=>{
  return client.evaluate(`(() => {
   const board=document.getElementById("board"),r=board.getBoundingClientRect();
   const ax=67.5+( ${x}+.5)*65,ay=67.5+(${y}+.5)*65;
   board.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,
     clientX:r.left+ax*r.width/720,clientY:r.top+ay*r.height/980}));
  })()`);
 };
 await clickTile(owner,7,12);
 await owner.until('MumuLobbyGame.info().phase==="pick-defend"',8000);
 await friend.until('MumuLobbyGame.info().phase==="pick-defend"',8000);
 await clickTile(friend,1,0);
 await owner.until('MumuLobbyGame.info().phase==="play"',8000);
 await friend.until('MumuLobbyGame.info().phase==="play"',8000);
 await clickTile(owner,7,11);
 await owner.until('MumuLobbyGame.info().moves===1',8000);
 await friend.until('MumuLobbyGame.info().moves===1',8000);
 console.log('PASS real board clicks: both birth positions + synchronized move');
 await friend.evaluate('location.reload()');
 await friend.until('!!window.MumuFriendsUI && document.getElementById("mmjjJoinRoom")',12000);
 await friend.evaluate('document.getElementById("mmjjJoinRoom").click()');
 await friend.until('window.MumuOnline.active()===true',12000);
 assert.equal(await friend.evaluate('MumuLobbyGame.info().moves'),1);
 assert.equal(await friend.evaluate('MumuLobby.isVisible()'),false);
 console.log('PASS guest refreshes the browser and restores the ongoing match');
 await owner.evaluate('window.confirm=()=>true;document.getElementById("mmjjOnlineResign").click()');
 await owner.until('MumuLobbyGame.info().phase==="finished"',8000);
 await friend.until('MumuLobbyGame.info().phase==="finished"',8000);
 console.log('PASS owner resigns; both clients receive finished game');
 assert.equal(await owner.evaluate('document.getElementById("playAgainBtn").textContent'),'再来一局');
 await owner.evaluate('document.getElementById("playAgainBtn").click()');
 await owner.until('document.getElementById("playAgainBtn").textContent.includes("我已准备")',7000);
 await friend.until('document.getElementById("mmjjRematchFriend").textContent.includes("已准备") || document.getElementById("mmjjRematchMine").textContent.includes("已准备")',7000);
 assert.equal(await owner.evaluate('document.getElementById("playAgainBtn").disabled'),true);
 await friend.evaluate('document.getElementById("playAgainBtn").click()');
 await owner.until('MumuLobbyGame.info().phase==="pick-defend"',9000);
 await friend.until('MumuLobbyGame.info().phase==="pick-defend"',9000);
 assert.equal(await owner.evaluate('MumuOnline.active()'),true);
 assert.equal(await friend.evaluate('MumuOnline.active()'),true);
 console.log('PASS both players approve rematch and swap seats');
 await owner.evaluate('window.confirm=()=>true;document.getElementById("mmjjBackToLobby").click()');
 await owner.until('window.MumuOnline.active()===false');
 assert.equal(await owner.evaluate('MumuLobby.isVisible()'),true);
 console.log('PASS leaving online match returns to lobby');
 const portalResult=await owner.evaluate(`(() => {
   const map=MumuMapV2.official(),a=map.portals[0].a;
   window.__mmjjPortalActions=[];
   const game={variant:"classic",firstSide:0,phase:"play",
     players:[{x:a.x,y:a.y},{x:1,y:0}],turn:0,walls:[],left:[5,5],
     moves:3,slideDir:[null,null],pending:0,winner:null,repetitions:{}};
   MumuOnline.start({room:{settings:{map:map,mapSource:"official"},game,revision:3},
     side:0,firstSide:0,sendAction:(action)=>window.__mmjjPortalActions.push(action)});
   const modalVisible=!document.getElementById("portalModal").hidden;
   document.getElementById("stayBtn").click();
   const actions=window.__mmjjPortalActions.slice();
   MumuOnline.stop();
   return {modalVisible,actions};
 })()`);
 assert.equal(portalResult.modalVisible,true,'first portal must open modal');
 assert.deepEqual(portalResult.actions,[{kind:'portal',warp:false}],'first portal must allow a stay decision');
 console.log('PASS first portal index 0 accepts a decision via UI');
 console.log('BROWSER PVP E2E PASS');
}catch(error){
 console.error('BROWSER PVP E2E FAIL: '+error.stack);
 process.exitCode=1;
}finally{
 for(const ws of sessions)try{ws.close();}catch(_){}
 chrome.kill();await sleep(220);rmSync(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});
}
