/* Real browser + Supabase invite and map-creation acceptance on an isolated local build. */
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {createClient} from './supabase-room-transport.mjs';

const raw=fs.readFileSync('supabase-config.js','utf8');
const url=raw.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0],anonKey=raw.match(/eyJ[A-Za-z0-9_.-]+/)?.[0];
assert.ok(url&&anonKey,'public Supabase config required');
const settings={variant:'classic',map:{version:2,rulesVersion:'map-v2-r1',name:'invite-acceptance',rocks:[],ice:[],boost:[],portals:[]},side:'gold',first:'host'};
const code='V4N8JK',events=[];
const host=createClient({url,anonKey,codeFactory:()=>code,identity:'browser-e2e-host-'+Date.now()});
const port=await new Promise((resolve,reject)=>{const net=createServer();net.on('error',reject);net.listen(0,'127.0.0.1',()=>{const p=net.address().port;net.close(()=>resolve(p));});});
const profile=mkdtempSync(join(tmpdir(),'mmjj-browser-invite-'));
const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
'--headless=new','--disable-gpu','--no-first-run','--no-proxy-server','--remote-allow-origins=*',
'--remote-debugging-port='+port,'--user-data-dir='+profile,'--window-size=390,844',
'about:blank'],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let socket,serial=0,pending=new Map();
async function command(method,params={}){
 const id=++serial;
 const promise=new Promise((resolve,reject)=>pending.set(id,data=>data.error?reject(Error(data.error.message)):resolve(data.result)));
 socket.send(JSON.stringify({id,method,params}));return promise;
}
async function evalJS(expression){
 const res=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 if(res.exceptionDetails)throw Error('browser JS '+JSON.stringify(res.exceptionDetails));
 return res.result.value;
}
async function until(expression,label,timeout=20000){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){if(await evalJS(expression))return;await delay(160)}
 throw Error('TIMEOUT '+label+' JS='+JSON.stringify(await evalJS("({hub:!!window.MumuFriendsUI,visible:!document.getElementById('mmjjHub')?.hidden,notice:document.getElementById('mmjjRoomNotice')?.textContent,players:document.getElementById('mmjjRoomPlayers')?.textContent})")));
}
try{
 await host.create(settings,e=>events.push(e));
 let target;
 for(let i=0;i<55;i++){
  try{
   const res=await fetch('http://127.0.0.1:'+port+'/json/new?http://127.0.0.1:8910/?room='+code+'&net=sb',{method:'PUT'});
   if(res.ok){target=await res.json();break}
  }catch{}
  await delay(200);
 }
 assert.ok(target,'Chrome CDP start');
 socket=new WebSocket(target.webSocketDebuggerUrl);
 socket.addEventListener('message',ev=>{const data=JSON.parse(ev.data);if(data.id&&pending.has(data.id)){const cb=pending.get(data.id);pending.delete(data.id);cb(data)}});
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
 await command('Runtime.enable');await command('Page.enable');
 await until("!!window.MumuFriendsUI && !document.getElementById('mmjjHub').hidden",'invitation opens room');
 assert.equal(await evalJS("document.getElementById('mmjjNetwork').value"),'sb');
 assert.equal(await evalJS("document.getElementById('mmjjRoomSetup').hidden"),true);
 assert.equal(await evalJS("document.getElementById('mmjjLiveCode').textContent"),code);
 await until("!document.getElementById('mmjjReadyRoom').disabled",'guest joined with ready enabled');
 console.log('PASS live invite auto joined and ready page shown');
 await evalJS("document.getElementById('mmjjReadyRoom').click()");
 for(let i=0;i<80;i++){if(events.some(e=>e.type==='state'&&e.room?.players?.[1]?.ready))break;await delay(100)}
 assert.ok(events.some(e=>e.type==='state'&&e.room?.players?.[1]?.ready),'guest ready reaches host');
 console.log('PASS ready sync reached real host via Supabase');
 await command('Page.navigate',{url:'http://127.0.0.1:8910/'});
 await until("!!window.MumuFriendsUI && !!window.MumuLobby && !!document.getElementById('mmjjCreateMap')",'map page');
 assert.equal(await evalJS("document.getElementById('mmjjNetwork').value"),'sb','normal entry defaults to Supabase');
 await evalJS("document.getElementById('mmjjModeMaps').click()");
 assert.equal(await evalJS("!document.getElementById('mmjjHub').hidden"),true);
 await evalJS("document.getElementById('mmjjCreateMap').click()");
 assert.equal(await evalJS("document.getElementById('mapEditor').hidden"),false);
 assert.equal(await evalJS("document.getElementById('editorName').value"),'我的新地图');
 const draftEmpty=await evalJS("document.querySelectorAll('#mapEditor .selected').length>=0");
 assert.equal(draftEmpty,true);
 await evalJS("document.getElementById('editorSave').click()");
 assert.equal(await evalJS("MumuFriendsUI.store.list().some(m=>m.name==='我的新地图')"),true);
 console.log('PASS map center -> blank workshop -> save -> maps library');
 await command('Page.navigate',{url:'http://127.0.0.1:8910/?room='+code+'&net=cf'});
 await until("!!window.MumuFriendsUI && !document.getElementById('mmjjHub').hidden",'Cloudflare invite route');
 assert.equal(await evalJS("document.getElementById('mmjjNetwork').value"),'cf','invitation overrides the default domestic line');
 console.log('PASS explicit Cloudflare invitation overrides Supabase default');
 console.log('INVITE_AND_MAP_BROWSER_E2E_PASS');
}catch(e){console.error('INVITE_AND_MAP_BROWSER_E2E_FAIL',e.message);process.exitCode=2}
finally{
 try{await host.close()}catch{}
 try{socket?.close()}catch{}
 chrome.kill();try{rmSync(profile,{recursive:true,force:true})}catch{}
}
setTimeout(()=>process.exit(process.exitCode||0),100).unref();
