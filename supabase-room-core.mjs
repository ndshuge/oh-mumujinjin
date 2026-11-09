/* Rule authority for casual Tencent IM friend rooms.
 * No credentials/secret tokens in this module. The host is the authority. */
import {newMatch,applyAction} from './online-rules.mjs';
import {recordActionForUndo,requestUndo,respondUndo,undoPublicState,resetUndo} from './online-undo.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
const CODE=/^[A-HJ-NP-Z2-9]{6}$/;
export function codeToGroup(code){
  if(typeof code!=='string'||!CODE.test(code))throw Error('房间码必须是六位字母或数字');
  return 'MMJJ_'+code;
}
export function createRoom(code,ownerId,settings){
  codeToGroup(code);
  if(!ownerId||typeof ownerId!=='string')throw Error('房主身份无效');
  if(!settings||!['classic','advanced'].includes(settings.variant)||
     !['gold','wood','random'].includes(settings.side)||
     !['host','guest','random'].includes(settings.first))throw Error('房间设置无效');
  newMatch(settings.map,settings.variant,0); // validates map and reachability
  return {
    schema:1,code,ownerId,settings:copy(settings),revision:0,status:'waiting',
    game:null,seatSide:null,rematchVotes:[false,false],
    players:[{id:ownerId,connected:true,ready:false},{id:null,connected:false,ready:false}],
    undoRequest:null,undoBefore:null,undoSide:null,undoAtRevision:null,turnStartGame:null,
    updatedAt:Date.now()
  };
}
function randomSide(){return Math.random()<.5?0:1;}
function requireActor(room,actor){
 const seat=room.players.findIndex(p=>p.id&&p.id===actor);
 if(seat<0)throw Error('玩家不在房间内');
 return seat;
}
export function applyIntent(state,actor,intent){
 if(!state||state.schema!==1||!intent||typeof intent.type!=='string')throw Error('房间协议不兼容');
 const room=copy(state);
 if(intent.type==='join'){
   let seat=room.players.findIndex(p=>p.id===actor);
   if(seat<0){
     if(room.players[1].id||room.status!=='waiting')throw Error('房间已满或对局已开始');
     room.players[1]={id:actor,connected:true,ready:false};seat=1;
   }
   room.players[seat].connected=true;
 }else if(intent.type==='presence'){
   const seat=requireActor(room,actor);
   room.players[seat].connected=!!intent.connected;
   if(!intent.connected&&room.status!=='playing'&&room.status!=='finished'){
     room.players[seat].ready=false;room.status='waiting';
   }
 }else if(intent.type==='ready'){
   const seat=requireActor(room,actor);
   if(!['waiting','ready'].includes(room.status))throw Error('当前不能准备');
   room.players[seat].ready=!room.players[seat].ready;
   room.status=room.players.every(p=>p.id&&p.ready)?'ready':'waiting';
 }else if(intent.type==='start'){
   if(actor!==room.ownerId)throw Error('只有房主可以开始对局');
   if(room.status!=='ready')throw Error('双方还没有准备');
   const side=room.settings.side,first=room.settings.first;
   const host=side==='gold'?0:side==='wood'?1:randomSide();
   const starting=first==='host'?host:first==='guest'?1-host:randomSide();
   room.seatSide=[host,1-host];
   room.game=newMatch(room.settings.map,room.settings.variant,starting);
   room.status='playing';room.revision=0;room.rematchVotes=[false,false];resetUndo(room);
 }else if(intent.type==='undo_request'){
   requestUndo(room,requireActor(room,actor),intent.revision);
 }else if(intent.type==='undo_response'){
   respondUndo(room,requireActor(room,actor),intent.accepted===true,intent.revision);
 }else if(intent.type==='action'){
   const seat=requireActor(room,actor);
   if(room.undoRequest)throw Error('请先处理悔棋申请');
   if(room.status!=='playing'||!room.game)throw Error('对局尚未开始');
   if(intent.revision!==room.revision)throw Error('棋盘版本已更新，请重新同步');
   const before=copy(room.game);
   room.game=applyAction(room.game,room.seatSide[seat],intent.action);
   room.revision++;
   recordActionForUndo(room,before,room.seatSide[seat]);
   if(room.game.phase==='finished'){room.status='finished';room.rematchVotes=[false,false];}
 }else if(intent.type==='resign'){
   const seat=requireActor(room,actor);
   if(room.status!=='playing'||!room.game)throw Error('当前没有进行中的对局');
   room.game.phase='finished';room.game.winner=1-room.seatSide[seat];
   room.status='finished';room.revision++;room.rematchVotes=[false,false];resetUndo(room);
 }else if(intent.type==='rematch'){
   const seat=requireActor(room,actor);
   if(room.status!=='finished'||room.game?.phase!=='finished')throw Error('请先结束当前对局');
   room.rematchVotes[seat]=true;
   if(room.rematchVotes.every(Boolean)){
     room.seatSide=[room.seatSide[1],room.seatSide[0]];
     const starting=1-room.game.firstSide;
     room.game=newMatch(room.settings.map,room.settings.variant,starting);
     room.status='playing';room.revision=0;room.rematchVotes=[false,false];resetUndo(room);
   }
 }else throw Error('未知房间操作');
 room.updatedAt=Date.now();
 return room;
}
export function viewFor(room){
 const result=copy(room);
 Object.assign(result,room.undoBefore?undoPublicState(room):{
   undoAvailableBy:Number.isInteger(room.undoAvailableBy)?room.undoAvailableBy:null,
   undoRequest:room.undoRequest||null
 });
 for(const key of ['undoBefore','undoSide','undoAtRevision','turnStartGame'])delete result[key];
 // IDs are anonymous random identities and are not credentials. No UserSig or signer keys travel here.
 result.players=result.players.map(({id,connected,ready})=>({id,connected,ready}));
 return result;
}
