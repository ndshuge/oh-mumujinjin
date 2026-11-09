import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
const site=process.env.MMJJ_WEB_SERVER||'http://127.0.0.1:8996/';
const port=await new Promise((resolve,reject)=>{
 const s=createServer();s.on('error',reject);
 s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});
});
const profile=mkdtempSync(join(tmpdir(),'mmjj-ui-two-tab-'));
const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
 '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
 '--disable-extensions','--no-proxy-server','--remote-allow-origins=*',
 '--remote-debugging-port='+port,'--user-data-dir='+profile,'--window-size=390,844','about:blank'
],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),connections=[];
async function tab(){
 let target=null;
 for(let attempt=0;attempt<50;attempt++){
  try{const r=await fetch('http://127.0.0.1:'+port+'/json/new?'+site,{method:'PUT'});
   if(r.ok){target=await r.json();break;}}catch(_){}
  await sleep(200);
 }
 assert.ok(target,'Chrome browser unavailable');
 const ws=new WebSocket(target.webSocketDebuggerUrl);connections.push(ws);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 let serial=0;const callbacks=new Map();
 ws.addEventListener('message',evt=>{const data=JSON.parse(evt.data);
  if(data.id&&callbacks.has(data.id)){callbacks.get(data.id)(data);callbacks.delete(data.id);}});
 const cmd=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++serial;
  callbacks.set(id,data=>data.error?reject(Error(data.error.message)):resolve(data.result));
  ws.send(JSON.stringify({id,method,params}));
 });
 await cmd('Runtime.enable');await cmd('Page.enable');
 async function evalJS(expression){
  const data=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(data.exceptionDetails)throw Error('Browser error: '+JSON.stringify(data.exceptionDetails).slice(0,600));
  return data.result.value;
 }
 async function until(expression,timeout=7000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(await evalJS(expression))return;await sleep(130);}
  throw Error('Timeout waiting for '+expression);
 }
 return {evalJS,until};
}
const clickTile=(browser,x,y)=>browser.evalJS(
 '(()=>{const board=document.getElementById("board"),r=board.getBoundingClientRect();'+
 'board.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,'+
 'clientX:r.left+(67.5+('+x+'+.5)*65)*r.width/720,'+
 'clientY:r.top+(67.5+('+y+'+.5)*65)*r.height/980}));})()');
const confirm=async browser=>{
 await browser.until('!document.getElementById("mmjjOnlineConfirm").hidden',5000);
 await browser.evalJS('document.getElementById("mmjjOnlineConfirm").click()');
};
async function moveState(browser,action,side,revision){
 return browser.evalJS('(async()=>{const {applyAction}=await import("./online-rules.mjs");'+
  'window.__board=applyAction(window.__board,'+side+','+JSON.stringify(action)+');'+
  'window.MumuOnline.sync(window.__board,'+revision+');return window.MumuLobbyGame.info().phase;})()');
}
try{
 const owner=await tab(),guest=await tab();
 for(const [browser,side,isOwner] of [[owner,0,true],[guest,1,false]]){
  await browser.until('!!window.MumuOnline && !!window.MumuMapV2 && !!window.MumuLobby',14000);
  await browser.evalJS('(async()=>{const {newMatch}=await import("./online-rules.mjs");'+
   'const map=window.MumuMapV2.official();window.__board=newMatch(map,"classic",0);'+
   'window.__sent=[];window.__proposals=[];window.__responses=[];'+
   'const prior=window.MumuFriendsUI;window.MumuFriendsUI={...prior,'+
   'requestUndo:r=>window.__proposals.push(r),'+
   'respondUndo:(ok,r)=>window.__responses.push({ok,r})};'+
   'window.MumuOnline.start({room:{settings:{map,mapSource:"official"},game:window.__board,revision:0},'+
   'side:'+side+',owner:'+isOwner+',firstSide:0,'+
   'sendAction:(a,r)=>window.__sent.push({action:a,revision:r})});'+
   'window.MumuLobby.hide();})()');
  assert.equal(await browser.evalJS('document.getElementById("mmjjOnlineDock").hidden'),true);
  assert.equal(await browser.evalJS('document.documentElement.scrollWidth<=window.innerWidth+1'),true);
 }
 await clickTile(owner,7,12);
 console.log('MOBILE_DOCK_GEOMETRY',await owner.evalJS('JSON.stringify((()=>{const x=document.getElementById("mmjjOnlineDock").getBoundingClientRect(),b=document.querySelector(".sidebar .actions").getBoundingClientRect();return {width:x.width,top:x.top,bottom:x.bottom,barWidth:b.width,barHeight:b.height,viewportWidth:innerWidth,viewportHeight:innerHeight}})())'));
 const dockGeometry=JSON.parse(await owner.evalJS('JSON.stringify((()=>{const d=document.getElementById("mmjjOnlineDock").getBoundingClientRect();return {width:d.width,top:d.top,bottom:d.bottom,vw:innerWidth,vh:innerHeight}})())'));
 assert.ok(dockGeometry.width>dockGeometry.vw*.78,'online confirmation bar must span mobile width');
 assert.ok(dockGeometry.top>=0&&dockGeometry.bottom<=dockGeometry.vh+1,'online confirm must remain visible without scrolling: '+JSON.stringify(dockGeometry));

 assert.equal(await owner.evalJS('window.__sent.length'),0);
 assert.equal(await owner.evalJS('window.MumuLobbyGame.info().phase'),'pick-attack');
 await owner.evalJS('document.getElementById("mmjjOnlineCancel").click()');
 assert.equal(await owner.evalJS('document.getElementById("mmjjOnlineConfirm").hidden'),true);
 await clickTile(owner,7,12);await confirm(owner);
 assert.equal(await owner.evalJS('window.__sent.length'),1);
 for(const b of [owner,guest])await moveState(b,{kind:'origin',p:{x:7,y:12}},0,1);
 await clickTile(guest,1,0);assert.equal(await guest.evalJS('window.__sent.length'),0);
 await confirm(guest);
 for(const b of [owner,guest])await moveState(b,{kind:'origin',p:{x:1,y:0}},1,2);
 await clickTile(owner,7,11);
 assert.equal(await owner.evalJS('window.MumuLobbyGame.info().moves'),0);
 await confirm(owner);
 assert.equal(await owner.evalJS('window.__sent.length'),2);
 for(const b of [owner,guest])await moveState(b,{kind:'move',to:{x:7,y:11}},0,3);
 assert.equal(await guest.evalJS('window.MumuLobbyGame.info().moves'),1);
 console.log('PASS two Chrome tabs: no-send preview, cancel, confirm and synchronized move');
 for(const [b,own] of [[owner,true],[guest,false]])
  await b.evalJS('MumuOnline.setUndo({undoAvailableBy:0,undoRequest:null},'+own+')');
 assert.equal(await owner.evalJS('!document.getElementById("mmjjOnlineUndoRequest").hidden'),true);
 await owner.evalJS('document.getElementById("mmjjOnlineUndoRequest").click()');
 assert.equal(await owner.evalJS('window.__proposals[0]'),3);
 for(const [b,own] of [[owner,true],[guest,false]])
  await b.evalJS('MumuOnline.setUndo({undoAvailableBy:0,undoRequest:{by:0,revision:3}},'+own+')');
 assert.equal(await guest.evalJS('!document.getElementById("mmjjOnlineUndoBanner").hidden'),true);
 await guest.evalJS('document.getElementById("mmjjOnlineUndoDecline").click()');
 assert.deepEqual(await guest.evalJS('window.__responses.at(-1)'),{ok:false,r:3});
 assert.equal(await guest.evalJS('window.MumuLobbyGame.info().moves'),1);
 for(const [b,own] of [[owner,true],[guest,false]])
  await b.evalJS('MumuOnline.setUndo({undoAvailableBy:0,undoRequest:null},'+own+')');
 await owner.evalJS('document.getElementById("mmjjOnlineUndoRequest").click()');
 for(const [b,own] of [[owner,true],[guest,false]])
  await b.evalJS('MumuOnline.setUndo({undoAvailableBy:0,undoRequest:{by:0,revision:3}},'+own+')');
 await guest.evalJS('document.getElementById("mmjjOnlineUndoAccept").click()');
 assert.deepEqual(await guest.evalJS('window.__responses.at(-1)'),{ok:true,r:3});
 for(const b of [owner,guest])await b.evalJS('(async()=>{const {newMatch,applyAction}=await import("./online-rules.mjs");'+
  'const map=MumuMapV2.official();let game=newMatch(map,"classic",0);'+
  'game=applyAction(game,0,{kind:"origin",p:{x:7,y:12}});'+
  'game=applyAction(game,1,{kind:"origin",p:{x:1,y:0}});'+
  'MumuOnline.sync(game,4);})()');
 assert.equal(await owner.evalJS('window.MumuLobbyGame.info().moves'),0);
 assert.equal(await guest.evalJS('window.MumuLobbyGame.info().moves'),0);
 console.log('PASS two-browser undo UI: rejection keeps board; consent restores board');
 await owner.evalJS('(async()=>{const {newMatch}=await import("./online-rules.mjs");'+
  'const map=MumuMapV2.official(),game=newMatch(map,"classic",0);'+
  'game.phase="play";game.players=[{...map.portals[0].a},{x:1,y:0}];'+
  'game.turn=0;game.pending=0;MumuOnline.sync(game,5);})()');
 await owner.evalJS('MumuOnline.setUndo({undoAvailableBy:null,undoRequest:null},true)');
 await owner.evalJS('document.getElementById("stayBtn").click()');
 assert.equal(await owner.evalJS('document.getElementById("portalModal").hidden'),true);
 assert.equal(await owner.evalJS('!document.getElementById("mmjjOnlineConfirm").hidden'),true);
 console.log('PASS portal modal closes to reveal pending confirmation');
 console.log('OFFLINE TWO-TAB CHROME UX PASS');
}catch(error){console.error('OFFLINE TWO-TAB CHROME UX FAIL',error.stack);process.exitCode=1}
finally{for(const ws of connections)try{ws.close()}catch(_){}
 chrome.kill();await sleep(200);rmSync(profile,{recursive:true,force:true,maxRetries:4,retryDelay:120});}
