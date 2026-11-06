/* Deterministic server-side game rules, ported from the existing browser game.js.
   The room server validates actions and advances canonical turn/board state. */
export const CAMPS = [
  [{x:6,y:12},{x:7,y:12},{x:8,y:12}],
  [{x:0,y:0},{x:1,y:0},{x:2,y:0}],
];
const DIRS=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
const inside=p=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.x<9&&p.y>=0&&p.y<13;
const same=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
const has=(list,p)=>(list||[]).some(q=>same(q,p));
const key=p=>p.x+','+p.y;
const copy=value=>JSON.parse(JSON.stringify(value));
function checkMap(map){
  if(!map || map.version!==2 || map.rulesVersion!=='map-v2-r1'
    || typeof map.name!=='string'||map.name.length>40
    || !['rocks','ice','boost','portals'].every(k=>Array.isArray(map[k])))throw Error('地图格式或版本无效');
  if(map.rocks.length>90||map.ice.length>80||map.boost.length>80||map.portals.length>8)throw Error('地图超出限制');
  let cells=new Set(),ids=new Set();
  function insert(p){
    if(!inside(p)||CAMPS.some(c=>has(c,p)))throw Error('地图坐标越界或占据营地');
    if(cells.has(key(p)))throw Error('地图地形重叠');
    cells.add(key(p));
  }
  ['rocks','ice','boost'].forEach(k=>map[k].forEach(insert));
  map.portals.forEach(g=>{
    if(!g||typeof g.id!=='string'||!g.id||g.id.length>48||ids.has(g.id)||same(g.a,g.b))throw Error('传送门无效');
    ids.add(g.id);insert(g.a);insert(g.b);
  });
  // The actual browser validator also calculates a stricter fairness score.
  return copy(map);
}
function ice(s,p){return s.variant==='advanced'&&has(s.map.ice,p);}
function boost(s,p){return s.variant==='advanced'&&has(s.map.boost,p);}
function portal(s,p){return s.map.portals.find(g=>same(g.a,p)||same(g.b,p));}
function barrier(a,b,walls){
  if(b.x===a.x+1)return walls.some(w=>w.o==='v'&&w.x===a.x&&(w.y===a.y||w.y===a.y-1));
  if(b.x===a.x-1)return walls.some(w=>w.o==='v'&&w.x===b.x&&(w.y===a.y||w.y===a.y-1));
  if(b.y===a.y+1)return walls.some(w=>w.o==='h'&&w.y===a.y&&(w.x===a.x||w.x===a.x-1));
  if(b.y===a.y-1)return walls.some(w=>w.o==='h'&&w.y===b.y&&(w.x===a.x||w.x===a.x-1));
  return true;
}
function canStep(s,a,b,walls){
  return inside(b)&&!has(s.map.rocks,b)&&Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1&&!barrier(a,b,walls);
}
export function movementOptions(s,p,lock,walls){
  const currentIce=ice(s,p),force=lock&&currentIce&&canStep(s,p,{x:p.x+lock.x,y:p.y+lock.y},walls);
  const choices=force?[lock]:DIRS,result=[];
  choices.forEach(d=>{
    const next={x:p.x+d.x,y:p.y+d.y};
    if(!canStep(s,p,next,walls))return;
    result.push({p:next,d:d,firstDir:d,steps:1,nextLock:ice(s,next)?(currentIce&&force?lock:d):null});
    if(boost(s,p))DIRS.forEach(d2=>{
      const target={x:next.x+d2.x,y:next.y+d2.y};
      if(canStep(s,next,target,walls)&&!same(target,p)&&!boost(s,target)){
        if(!result.some(m=>same(m.p,target)&&m.steps===2))
          result.push({p:target,d:d2,firstDir:d,steps:2,nextLock:ice(s,target)?d2:null});
      }
    });
  });
  return result;
}
function findPath(s,start,target,walls,initialLock){
  if(!start||has(s.map.rocks,start))return false;
  const queue=[{p:start,lock:initialLock||null}],seen=new Set();
  let at=0;
  const enqueue=(p,lock)=>{
    const id=key(p)+'|'+(lock?key(lock):'free');
    if(!seen.has(id)){seen.add(id);queue.push({p,lock});}
  };
  enqueue(start,initialLock||null);
  while(at<queue.length){
    const cur=queue[at++];
    if(has(target,cur.p))return true;
    movementOptions(s,cur.p,cur.lock,walls).forEach(m=>enqueue(m.p,m.nextLock));
    const gate=portal(s,cur.p);
    if(gate){
      const dest=same(gate.a,cur.p)?gate.b:gate.a;
      if(inside(dest)&&!has(s.map.rocks,dest))enqueue(dest,null);
    }
  }
  return false;
}
function validWall(s,w){
  if(!w||!Number.isInteger(w.x)||!Number.isInteger(w.y)||!['h','v'].includes(w.o))return false;
  if(w.x<0||w.y<0||w.x>7||w.y>11||s.left[s.turn]===0||s.phase!=='play')return false;
  if(s.walls.some(q=>q.o===w.o?
      (w.o==='h'?q.y===w.y&&Math.abs(q.x-w.x)<2:q.x===w.x&&Math.abs(q.y-w.y)<2):
      q.x===w.x&&q.y===w.y))return false;
  const all=s.walls.concat([w]);
  for(let i=0;i<2;i++){
    const starts=s.players[i]?[s.players[i]]:CAMPS[i];
    if(!starts.some(start=>findPath(s,start,CAMPS[1-i],all,s.players[i]?s.slideDir[i]:null)))return false;
  }
  return true;
}
export function newMatch(input,variant,firstSide){
  const map=checkMap(input);
  if(!['classic','advanced'].includes(variant)||![0,1].includes(firstSide))throw Error('模式或先后手无效');
  const s={map,variant,firstSide,phase:firstSide===0?'pick-attack':'pick-defend',
    players:[null,null],turn:firstSide,walls:[],left:[5,5],moves:0,
    slideDir:[null,null],pending:null,winner:null,repetitions:{}};
  // Validate reachability under BOTH gameplay variants as in the browser map editor.
  for(const mode of ['classic','advanced']){
    const probe={...s,variant:mode};
    for(let side=0;side<2;side++)for(const start of CAMPS[side])
      if(!findPath(probe,start,CAMPS[1-side],[],null))throw Error('地图存在被封闭的出生路线');
  }
  return s;
}
function finishTurn(s,who){
  s.moves++;
  if(has(CAMPS[1-who],s.players[who])){s.phase='finished';s.winner=who;return;}
  s.turn=1-who;
  const historyKey=JSON.stringify([s.turn,s.players,s.slideDir,
    s.walls.map(w=>w.o+':'+w.x+':'+w.y).sort(),s.left]);
  s.repetitions[historyKey]=(s.repetitions[historyKey]||0)+1;
  if(s.repetitions[historyKey]>=3||s.moves>=120){s.phase='finished';s.winner=null;}
}
export function applyAction(state,who,action){
  if(!state||!action||![0,1].includes(who))throw Error('对局操作格式无效');
  const s=copy(state);
  if(s.phase==='finished')throw Error('比赛已经结束');
  const required=s.phase==='pick-attack'?0:s.phase==='pick-defend'?1:s.turn;
  if(required!==who)throw Error('当前不是你的回合');
  if(s.phase==='pick-attack'||s.phase==='pick-defend'){
    if(action.kind!=='origin'||!inside(action.p)||!has(CAMPS[who],action.p))throw Error('出生点无效');
    s.players[who]={x:action.p.x,y:action.p.y};
    if(!s.players[1-who]){s.phase=who===0?'pick-defend':'pick-attack';s.turn=1-who;}
    else{s.phase='play';s.turn=s.firstSide;}
    return s;
  }
  if(s.pending!==null){
    if(action.kind!=='portal'||typeof action.warp!=='boolean')throw Error('必须先决定是否传送');
    const gate=s.map.portals[s.pending],p=s.players[who];
    if(!gate||(!same(gate.a,p)&&!same(gate.b,p)))throw Error('传送门状态无效');
    if(action.warp){s.players[who]=same(gate.a,p)?gate.b:gate.a;s.slideDir[who]=null;}
    s.pending=null;finishTurn(s,who);return s;
  }
  if(action.kind==='wall'){
    if(!validWall(s,action.wall))throw Error('不能在这里筑墙');
    const w=action.wall;s.walls.push({x:w.x,y:w.y,o:w.o,owner:who});s.left[who]--;
    finishTurn(s,who);return s;
  }
  if(action.kind==='move'){
    if(!inside(action.to))throw Error('无法移动到目标格');
    const move=movementOptions(s,s.players[who],s.slideDir[who],s.walls).find(m=>same(m.p,action.to));
    if(!move)throw Error('此处不可移动');
    s.players[who]={x:move.p.x,y:move.p.y};s.slideDir[who]=move.nextLock||null;
    const gate=portal(s,move.p);
    if(gate){s.pending=s.map.portals.indexOf(gate);return s;}
    finishTurn(s,who);return s;
  }
  throw Error('无效的走棋操作');
}
