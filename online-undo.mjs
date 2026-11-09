/* Consent-only online undo, shared by Supabase host authority and Durable Object.
 * The whole turn is one undo unit, including optional portal choice.
 */
const clone=v=>JSON.parse(JSON.stringify(v));
const sideFor=(room,seat)=>room.seatSide?.[seat];
export function recordActionForUndo(room,before,side){
  room.undoRequest=null;
  const earlier=room.turnStartGame;
  const valid=before?.phase==='play'&&before.pending===null&&before.turn===side;
  const portal=before?.phase==='play'&&before.pending!==null&&before.turn===side;
  const start=portal?earlier:(valid?before:null);
  room.turnStartGame=null;
  room.undoBefore=null;room.undoSide=null;room.undoAtRevision=null;
  if(!start)return room;
  if(room.game?.pending!==null){
    room.turnStartGame=clone(start);
    return room;
  }
  if(room.game.turn!==side||room.game.phase==='finished'){
    room.undoBefore=clone(start);
    room.undoSide=side;
    room.undoAtRevision=room.revision;
  }else{
    room.turnStartGame=clone(start);
  }
  return room;
}
export function requestUndo(room,seat,revision){
  if(room.status!=='playing'&&room.status!=='finished')throw Error('当前不能申请悔棋');
  if(room.undoRequest)throw Error('已有悔棋申请，等待处理');
  if(!room.undoBefore||room.undoAtRevision!==room.revision||room.undoSide!==sideFor(room,seat))
    throw Error('只有刚走完最后一步的玩家才能申请悔棋');
  if(!Number.isSafeInteger(revision)||revision!==room.revision)throw Error('棋盘版本已更新，不能申请悔棋');
  if(room.game?.pending!==null)throw Error('请先完成传送门选择');
  room.undoRequest={by:seat,revision:room.revision};
  return room;
}
export function respondUndo(room,seat,accepted,revision){
  const req=room.undoRequest;
  if(!req)throw Error('当前没有待处理的悔棋申请');
  if(!Number.isSafeInteger(revision)||revision!==room.revision||revision!==req.revision)
    throw Error('棋盘版本已更新，不能处理悔棋');
  if(seat===req.by&&accepted)throw Error('必须由对方同意悔棋');
  if(seat!==req.by&&seat!==1-req.by)throw Error('无效玩家');
  if(accepted){
    if(!room.undoBefore||room.undoAtRevision!==room.revision)throw Error('悔棋记录已经失效');
    room.game=clone(room.undoBefore);room.status='playing';room.revision++;
    room.undoBefore=null;room.undoSide=null;room.undoAtRevision=null;room.turnStartGame=null;
  }
  room.undoRequest=null;
  return room;
}
export function undoPublicState(room){
 return {
  undoAvailableBy:(room.undoBefore&&room.undoAtRevision===room.revision&&room.undoSide!==null)
    ? room.seatSide.indexOf(room.undoSide):null,
  undoRequest:room.undoRequest?clone(room.undoRequest):null
 };
}
export function resetUndo(room){
 room.undoRequest=null;room.undoBefore=null;room.undoSide=null;room.undoAtRevision=null;room.turnStartGame=null;
 return room;
}
