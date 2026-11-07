/* Tencent Cloud Chat Meeting-room transport.
 * Friendly casual matches: the room owner verifies game rules and emits
 * canonical full snapshots. Competitive tournaments should use server authority.
 */
import {codeToGroup,createRoom,applyIntent,viewFor} from './cn-room-core.mjs';
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function code(){
 const bytes=new Uint8Array(6);
 if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(bytes);
 else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
 return [...bytes].map(x=>ALPHABET[x%ALPHABET.length]).join('');
}
function makeAuth(endpoint,storage=globalThis.localStorage,doFetch=globalThis.fetch){
 return async()=>{
   if(!endpoint)throw Error('尚未配置腾讯云鉴权地址');
   const saved=storage?.getItem('mmjj-cn-session')||null;
   const res=await doFetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(saved?{ticket:saved}:{})});
   const data=await res.json().catch(()=>({}));
   if(!res.ok)throw Error(data.error||'国内联机身份签发失败');
   if(!data.userID||!data.userSig||!data.sdkAppID)throw Error('国内联机返回的身份信息不完整');
   if(data.ticket)try{storage?.setItem('mmjj-cn-session',data.ticket);}catch(_){}
   return data;
 };
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function createClient(options={}){
 const storage=options.storage||globalThis.localStorage;
 const auth=options.auth||makeAuth(options.authEndpoint,storage,options.fetch);
 const onEventError=err=>String(err?.message||err||'网络异常');
 let sdkFactory=options.sdkFactory||null,chat=null,userID=null,room=null,
    groupID=null,callback=()=>{},owner=false,closed=false,seq=0,lastSeq=-1,watchdog=null,
    previousStatus=null,readyListeners=[],pendingIntent=Promise.resolve(),trustedOwnerId=null;
 async function sdkReady(factory){
   const sdk= factory|| (await import('./vendor/tencent-chat.mjs')).default;
   if(!sdk||!sdk.TYPES||!sdk.EVENT||!sdk.create)throw Error('腾讯 IM SDK 尚未加载');
   return sdk;
 }
 async function login(){
   sdkFactory=await sdkReady(sdkFactory);
   const user=await auth();
   userID=user.userID;
   chat=sdkFactory.create({SDKAppID:Number(user.sdkAppID)});
   await new Promise(async(resolve,reject)=>{
     const timeout=setTimeout(()=>reject(Error('连接腾讯 IM 超时，请检查国内网络')),15000);
     const ready=()=>{clearTimeout(timeout);resolve();};
     chat.on(sdkFactory.EVENT.SDK_READY,ready);
     readyListeners.push(()=>chat.off?.(sdkFactory.EVENT.SDK_READY,ready));
     try{await chat.login({userID,userSig:user.userSig});}
     catch(err){clearTimeout(timeout);reject(err);}
   });
   chat.on(sdkFactory.EVENT.MESSAGE_RECEIVED,onMessage);
 }
 function parseMessage(msg){
   if(!msg||msg.conversationID!=='GROUP'+groupID&&msg.to!==groupID)return null;
   if(typeof msg.payload?.data!=='string'||new TextEncoder().encode(msg.payload.data).length>12000)return null;
   let body;
   try{body=JSON.parse(msg.payload.data);}catch(_){return null;}
   if(!body||body.v!==1||!['intent','snapshot'].includes(body.kind))return null;
   return {body,from:msg.from};
 }
 function stateEvent(next){
   const old=room;
   room=next;
   const seat=room.players.findIndex(p=>p.id===userID);
   callback({type:'state',room:viewFor(room),owner});
   // The existing engine must enter online mode on a new match or recovery.
   if(room.game&&room.status==='playing'&&seat>=0&&
      (!old?.game||old.status!=='playing'||old.game?.firstSide!==room.game.firstSide&&room.revision===0)){
     callback({type:'started',room:viewFor(room),owner,side:room.seatSide[seat],
       firstSide:room.game.firstSide,sendAction});
   }else if(old?.game&&room.game&&room.revision>old.revision&&seat>=0){
     callback({type:'action',revision:room.revision,game:room.game});
   }
 }
 async function broadcast(snapshot){
   const next=++seq;
   const msg={v:1,kind:'snapshot',seq:next,room:viewFor(snapshot)};
   if(new TextEncoder().encode(JSON.stringify(msg)).length>11500)
     throw Error('地图状态超过腾讯 IM 的消息大小限制，请缩减自定义地图');
   const outgoing=chat.createCustomMessage({
      to:groupID,conversationType:sdkFactory.TYPES.CONV_GROUP,
      payload:{data:JSON.stringify(msg),description:'木木金金棋房间状态'}
   });
   await chat.sendMessage(outgoing);
   stateEvent(snapshot);
 }
 function hostIntent(actor,payload){
   const execute=async()=>broadcast(applyIntent(room,actor,payload));
   pendingIntent=pendingIntent.then(execute,execute);
   return pendingIntent;
 }
 async function intent(payload){
   if(closed||!chat||!groupID)throw Error('国内联机尚未连接');
   if(owner) {
     try{await hostIntent(userID,payload);}
     catch(error){callback({type:'error',message:onEventError(error)});}
   }else{
     const body={v:1,kind:'intent',intent:payload};
     const outgoing=chat.createCustomMessage({
       to:groupID,conversationType:sdkFactory.TYPES.CONV_GROUP,
       payload:{data:JSON.stringify(body),description:'木木金金棋走棋'}
     });
     await chat.sendMessage(outgoing);
   }
 }
 function onMessage(event){
   const list=event?.data||[];
   for(const msg of list){
     const packet=parseMessage(msg);if(!packet)continue;
     const {body,from}=packet;
     if(owner&&body.kind==='intent'&&from!==userID){
       hostIntent(from,body.intent).catch(error=>callback({type:'error',message:onEventError(error)}));
     }
     if(body.kind==='snapshot'&&from!==userID&&
        typeof body.seq==='number'&&body.seq>lastSeq&&
        from===trustedOwnerId&&body.room?.ownerId===trustedOwnerId&&body.room?.code===groupID.slice(5)){
       lastSeq=body.seq;
       // Snapshots come from a valid sender identity in the IM service,
       // never from a claimed sender inside payload.
       stateEvent(body.room);
     }
   }
 }
 async function recover(){
   try{
     const rsp=await chat.getMessageList({conversationID:'GROUP'+groupID,count:15});
     const messages=rsp?.data?.messageList||[];
     const prior=messages.map(parseMessage).filter(Boolean)
       .filter(x=>x.body.kind==='snapshot'&&x.from===trustedOwnerId&&x.body.room?.ownerId===trustedOwnerId)
       .sort((a,b)=>a.body.seq-b.body.seq);
     if(prior.length){
       const recent=prior.at(-1);
       lastSeq=recent.body.seq;
       seq=lastSeq;
       if(recent.body.room.ownerId===userID)owner=true;
       stateEvent(recent.body.room);
       return true;
     }
   }catch(_){}
   return false;
 }
 async function create(settings,onEvent){
   if(closed)throw Error('请重新打开联机房间');
   callback=onEvent;
   await login();owner=true;
   let id,created=false;
   for(let tries=0;tries<5;tries++){
     id=code();groupID=codeToGroup(id);
     try{await chat.createGroup({type:sdkFactory.TYPES.GRP_MEETING,groupID,name:'木木金金棋 · '+id});created=true;break;}
     catch(error){if(tries===4)throw Error('创建腾讯好友房间失败：'+onEventError(error));}
   }
   if(!created)throw Error('无法分配国内房间码');
   trustedOwnerId=userID;
   room=createRoom(id,userID,settings);
   await broadcast(room);
   callback({type:'connected'});
   return {code:id,owner:true};
 }
 async function join(id,onEvent){
   if(closed)throw Error('请重新打开联机房间');
   codeToGroup(id);callback=onEvent;
   await login();owner=false;groupID=codeToGroup(id);
   try{await chat.joinGroup({groupID});}
   catch(error){throw Error('无法加入房间：房间不存在、已过期或网络不可用');}
   const profile=await chat.getGroupProfile({groupID});
   trustedOwnerId=profile?.data?.group?.ownerID;
   if(!trustedOwnerId)throw Error('无法验证房主身份，请重新加入房间');
   await recover();
   if(owner && room?.ownerId===userID){
     callback({type:'connected'});
     return {code:id,owner:true};
   }
   await intent({type:'join'});
   if(room&&room.players.some(p=>p.id===userID)){
     callback({type:'connected'});return {code:id,owner:false};
   }
   await new Promise((resolve,reject)=>{
     const until=Date.now()+10500;
     const tick=()=>{
       if(room?.players.some(p=>p.id===userID)){clearInterval(watchdog);watchdog=null;resolve();}
       else if(Date.now()>until){clearInterval(watchdog);watchdog=null;reject(Error('房主不在线或没有响应，请让房主重新打开房间'));}};
     watchdog=setInterval(tick,100);tick();
   });
   callback({type:'connected'});
   return {code:id,owner:false};
 }
 const invoke=(type,extra={})=>intent({type,...extra});
 function ready(){return invoke('ready');}
 function start(){return invoke('start');}
 function resign(){return invoke('resign');}
 function rematch(){return invoke('rematch');}
 function sendAction(action,revision){return invoke('action',{action,revision});}
 async function close(){
   closed=true;
   if(watchdog){clearInterval(watchdog);watchdog=null;}
   if(chat){
     chat.off?.(sdkFactory.EVENT.MESSAGE_RECEIVED,onMessage);
     readyListeners.forEach(fn=>fn());readyListeners=[];
     try{
       // Explicit room departure retires the group, while browser refresh
       // does not invoke close and can still recover from cloud history.
       if(owner&&groupID)await chat.dismissGroup(groupID);
       else if(groupID)await chat.quitGroup(groupID);
     }catch(_){}
     try{await chat.logout();}catch(_){}
   }
   room=null;
 }
 return Object.freeze({
   create,join,ready,start,resign,rematch,sendAction,close,
   getState:()=>room,getCode:()=>groupID?.slice(5)||null,isOwner:()=>owner
 });
}
