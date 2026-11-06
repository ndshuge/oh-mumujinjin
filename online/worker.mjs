/* Cloudflare Workers + SQLite Durable Objects room service.
   Each room owns the canonical game state and validates moves with online-rules.mjs.
   Deploy separately; GitHub Pages remains a static frontend. */
import {newMatch, applyAction} from '../online-rules.mjs';

const ROOM_LIFETIME_MS=12*60*60*1000;
function randomString(size,alphabet){
  const bytes=new Uint8Array(size);crypto.getRandomValues(bytes);
  return [...bytes].map(b=>alphabet[b%alphabet.length]).join('');
}
const roomCode=()=>randomString(6,'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
const token=()=>randomString(32,'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
function response(data,status=200,headers={}){
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
}
function inputError(msg,status=400){return response({error:msg},status);}
function allowOrigin(request,env){
  const origin=request.headers.get('Origin');
  const allowed=(env.ALLOWED_ORIGINS||'https://ndshuge.github.io,http://localhost:5500,http://localhost:8787').split(',').map(x=>x.trim());
  return !origin || allowed.includes(origin) ? origin : false;
}
function addCors(request,env,res){
  const origin=allowOrigin(request,env);
  if(origin===false)return response({error:'来源不受允许'},403);
  const headers=new Headers(res.headers);
  if(origin){headers.set('Access-Control-Allow-Origin',origin);headers.set('Vary','Origin');}
  headers.set('Access-Control-Allow-Headers','Content-Type');
  headers.set('Access-Control-Allow-Methods','POST,GET,OPTIONS');
  return new Response(res.body,{status:res.status,headers});
}
async function jsonBody(request){
  const text=await request.text();
  if(text.length>36000)throw Error('请求内容过大');
  return JSON.parse(text||'{}');
}
export default {
  async fetch(request,env){
    const url=new URL(request.url),method=request.method,pathname=url.pathname;
    if(allowOrigin(request,env)===false)return inputError('不允许的请求来源',403);
    if(method==='OPTIONS')return addCors(request,env,new Response(null,{status:204}));
    try{
      if(method==='POST'&&pathname==='/api/rooms'){
        const body=await jsonBody(request),settings=body.settings;
        if(!settings||!['classic','advanced'].includes(settings.variant)||!['gold','wood','random'].includes(settings.side)
          ||!['host','guest','random'].includes(settings.first)||!settings.map) return addCors(request,env,inputError('房间设置不完整'));
        // Validate map once before allocating an online room; never trust the browser alone.
        newMatch(settings.map,settings.variant,0);
        for(let attempt=0;attempt<6;attempt++){
          const code=roomCode(),id=env.ROOMS.idFromName(code),stub=env.ROOMS.get(id);
          const res=await stub.fetch(new Request('https://room.internal/init',{method:'POST',
            body:JSON.stringify({code,settings}),headers:{'Content-Type':'application/json'}}));
          if(res.status===409)continue;
          return addCors(request,env,res);
        }
        return addCors(request,env,inputError('暂时无法分配房间，请重试',503));
      }
      const match=pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})\/(join|ws)$/);
      if(!match)return addCors(request,env,inputError('找不到接口',404));
      const [,code,action]=match;
      if((action==='join'&&method!=='POST')||(action==='ws'&&method!=='GET'))
        return addCors(request,env,inputError('请求方法不支持',405));
      const stub=env.ROOMS.get(env.ROOMS.idFromName(code));
      if(action==='join'){
        const body=await jsonBody(request);
        const res=await stub.fetch(new Request('https://room.internal/join',{method:'POST',
          headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
        return addCors(request,env,res);
      }
      // WebSocket upgrade is forwarded without body; browser connects over wss://.
      return await stub.fetch(new Request('https://room.internal/ws'+url.search,{method:'GET',headers:request.headers}));
    }catch(error){
      return addCors(request,env,inputError(error.message||'房间请求失败',400));
    }
  }
};

export class GameRoom {
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  async getRoom(){return await this.ctx.storage.get('room');}
  async save(room){await this.ctx.storage.put('room',room);}
  clean(room){return room && room.expiresAt>Date.now();}
  publicRoom(room){
    return {code:room.code,status:room.status,revision:room.revision,
      settings:room.settings,game:room.game,
      players:room.players.map(p=>({connected:!!p.connected,ready:!!p.ready}))};
  }
  broadcast(room,message){
    for(const socket of this.ctx.getWebSockets()){
      try{socket.send(JSON.stringify(message));}catch(_){}
    }
  }
  broadcastState(room){this.broadcast(room,{type:'room_state',room:this.publicRoom(room)});}
  async fetch(request){
    const url=new URL(request.url),path=url.pathname,room=await this.getRoom();
    if(path==='/init'&&request.method==='POST'){
      if(room&&this.clean(room))return inputError('房间号重复',409);
      const {code,settings}=await jsonBody(request);
      newMatch(settings.map,settings.variant,0);
      const ownerToken=token(),now=Date.now();
      const next={code,settings,createdAt:now,expiresAt:now+ROOM_LIFETIME_MS,
        players:[{token:ownerToken,connected:false,ready:false},{token:null,connected:false,ready:false}],
        status:'waiting',revision:0,game:null,seatSide:null};
      await this.save(next);await this.ctx.storage.setAlarm(next.expiresAt);
      return response({code,token:ownerToken,owner:true});
    }
    if(!this.clean(room))return inputError('房间不存在或已过期',404);
    if(path==='/join'&&request.method==='POST'){
      const body=await jsonBody(request),presented=body.token;
      const existing=room.players.findIndex(p=>p.token&&p.token===presented);
      if(existing>=0)return response({code:room.code,token:room.players[existing].token,owner:existing===0});
      if(room.players[1].token)return inputError('房间已有两位玩家',409);
      if(room.status==='playing')return inputError('对局已经开始',409);
      const guestToken=token();room.players[1].token=guestToken;
      await this.save(room);this.broadcastState(room);
      return response({code:room.code,token:guestToken,owner:false});
    }
    if(path==='/ws'&&request.method==='GET'){
      if(request.headers.get('Upgrade')!=='websocket')return inputError('需要 WebSocket 连接',426);
      const presented=url.searchParams.get('token');
      const seat=room.players.findIndex(p=>p.token&&p.token===presented);
      if(seat<0)return inputError('房间身份无效',403);
      const pair=new WebSocketPair(),client=pair[0],server=pair[1];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({seat});
      room.players[seat].connected=true;await this.save(room);
      server.send(JSON.stringify({type:'room_state',room:this.publicRoom(room)}));
      if(room.status==='playing'){
        server.send(JSON.stringify({type:'match_start',room:this.publicRoom(room),
          side:room.seatSide[seat],firstSide:room.game.firstSide}));
      }
      this.broadcastState(room);
      return new Response(null,{status:101,webSocket:client});
    }
    return inputError('无效的房间操作',404);
  }
  async webSocketMessage(socket,raw){
    const attachment=socket.deserializeAttachment(),seat=attachment&&attachment.seat;
    let room=await this.getRoom();
    if(!this.clean(room)||![0,1].includes(seat))return;
    try{
      if(String(raw).length>2048)throw Error('操作数据过大');
      const msg=JSON.parse(String(raw));
      if(msg.type==='ping'){socket.send(JSON.stringify({type:'pong'}));return;}
      if(msg.type==='ready'){
        if(room.status==='playing')throw Error('对局已开始');
        room.players[seat].ready=!room.players[seat].ready;
        room.status=room.players.every(p=>p.token&&p.ready&&p.connected)?'ready':'waiting';
        await this.save(room);this.broadcastState(room);return;
      }
      if(msg.type==='start'){
        if(seat!==0)throw Error('只有房主可以开始比赛');
        if(room.status!=='ready')throw Error('需要两人在线并准备');
        const side=room.settings.side;
        const hostSide=side==='gold'?0:side==='wood'?1:Math.floor(Math.random()*2);
        room.seatSide=[hostSide,1-hostSide];
        const first=room.settings.first;
        const firstSide=first==='host'?hostSide:first==='guest'?1-hostSide:Math.floor(Math.random()*2);
        room.game=newMatch(room.settings.map,room.settings.variant,firstSide);
        room.status='playing';await this.save(room);
        for(const peer of this.ctx.getWebSockets()){
          const who=peer.deserializeAttachment()?.seat;
          try{peer.send(JSON.stringify({type:'match_start',room:this.publicRoom(room),
            side:room.seatSide[who],firstSide:firstSide}));}catch(_){}
        }
        this.broadcastState(room);return;
      }
      if(msg.type==='action'){
        if(room.status!=='playing'||!room.game)throw Error('对局尚未开始');
        if(msg.revision!==room.revision)throw Error('棋盘版本已更新，请同步房间');
        const next=applyAction(room.game,room.seatSide[seat],msg.action);
        room.game=next;room.revision++;
        await this.save(room);
        this.broadcast(room,{type:'action_accepted',action:msg.action,
          by:room.seatSide[seat],revision:room.revision,game:next});
        this.broadcastState(room);return;
      }
      throw Error('不支持的房间操作');
    }catch(error){try{socket.send(JSON.stringify({type:'error',error:error.message||'操作失败'}));}catch(_){}}
  }
  async webSocketClose(socket){
    const seat=socket.deserializeAttachment()?.seat;
    let room=await this.getRoom();
    if(!this.clean(room)||![0,1].includes(seat))return;
    const occupied=this.ctx.getWebSockets().some(other=>other!==socket&&other.deserializeAttachment()?.seat===seat);
    room.players[seat].connected=occupied;
    if(!occupied&&room.status!=='playing'){room.players[seat].ready=false;room.status='waiting';}
    await this.save(room);this.broadcastState(room);
  }
  async webSocketError(socket){await this.webSocketClose(socket);}
  async alarm(){
    const room=await this.getRoom();
    if(room&&room.expiresAt<=Date.now()){
      for(const socket of this.ctx.getWebSockets()){try{socket.close(1000,'Room expired');}catch(_){}}
      await this.ctx.storage.deleteAll();
    }else if(room)await this.ctx.storage.setAlarm(room.expiresAt);
  }
}
