/* 哦，木木金金棋 | 零依赖静态网页游戏。 */
(function () {
  "use strict";

  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var W = 9, H = 13, STEP = 65, X = 67.5, Y = 67.5;
  var NAMES = ["金方", "木方"];
  var CAMPS = [
    [{x:6,y:12},{x:7,y:12},{x:8,y:12}],
    [{x:0,y:0},{x:1,y:0},{x:2,y:0}]
  ];
  var ROCKS = [{x:3,y:2},{x:3,y:3},{x:7,y:2},{x:2,y:4},{x:4,y:5},{x:5,y:5},{x:0,y:8},{x:3,y:9},{x:5,y:9},{x:6,y:9}];
  var PORTALS = [
    {symbol:"△",name:"三角之门",a:{x:5,y:2},b:{x:2,y:5}},
    {symbol:"✦",name:"星辉之门",a:{x:6,y:4},b:{x:1,y:11}},
    {symbol:"○",name:"圆环之门",a:{x:8,y:6},b:{x:3,y:8}}
  ];
  var ICE = [{x:1,y:6},{x:1,y:7},{x:1,y:8},{x:7,y:7},{x:7,y:8}];
  var BOOST = [{x:4,y:3},{x:4,y:4},{x:6,y:10},{x:7,y:10}];
  var DIRS = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
  var state;
  var $ = function(id){return document.getElementById(id);};
  var posKey = function(p){return p.x + "," + p.y;};
  var same = function(a,b){return a && b && a.x===b.x && a.y===b.y;};
  var has = function(list,p){return list.some(function(q){return same(q,p);});};
  var inside = function(p){return p.x>=0 && p.x<W && p.y>=0 && p.y<H;};
  var rock = function(p){return has(ROCKS,p);};
  var ice = function(p){return state.variant==="advanced" && has(ICE,p);};
  var boost = function(p){return state.variant==="advanced" && has(BOOST,p);};
  var portal = function(p){return PORTALS.find(function(g){return same(g.a,p)||same(g.b,p);}) || null;};
  function newGame(variant){
    return {variant:variant||"classic",phase:"pick-attack",players:[null,null],turn:0,
      walls:[],left:[5,5],moves:0,history:[],action:"move",orientation:"h",
      hover:null,slideDir:[null,null],pending:null,winner:null,notice:""};
  }
  function snapshot(){
    return JSON.stringify({phase:state.phase,players:state.players,turn:state.turn,walls:state.walls,
      left:state.left,moves:state.moves,slideDir:state.slideDir,pending:state.pending,winner:state.winner});
  }
  function restore(s){
    var old=JSON.parse(s);
    ["phase","players","turn","walls","left","moves","slideDir","pending","winner"].forEach(function(k){state[k]=old[k];});
    state.hover=null;state.notice="";
  }
  function save(){
    try {localStorage.setItem("mumujinjin-game-v1",JSON.stringify({version:1,state:state}));} catch(e){}
  }
  function load(){
    try {
      var raw=localStorage.getItem("mumujinjin-game-v1");
      if(!raw)return null;
      var parsed=JSON.parse(raw);
      if(parsed.version!==1||!parsed.state||!Array.isArray(parsed.state.walls)||!Array.isArray(parsed.state.players))return null;
      if(parsed.state.variant!=="classic"&&parsed.state.variant!=="advanced")return null;
      return parsed.state;
    } catch(e){return null;}
  }
  function notice(text){state.notice=text;drawUI();}
  function commit(){state.notice="";save();drawUI();drawBoard();}
  function resetGame(variant){
    state=newGame(variant||state.variant);
    closeAll();commit();
  }
  function confirmSwitch(variant){
    if(state.variant===variant)return;
    if(state.moves>0&&!window.confirm("切换玩法会重新开始当前对局。确定切换吗？"))return;
    resetGame(variant);
  }
  function record(){state.history.push(snapshot());if(state.history.length>120)state.history.shift();}
  function undo(){
    if(!state.history.length){notice("还没有可悔的步骤。");return;}
    restore(state.history.pop());closeAll();commit();
  }
  function campOwner(p){
    if(has(CAMPS[0],p))return 0;
    if(has(CAMPS[1],p))return 1;
    return -1;
  }
  function barrier(a,b,walls){
    var ws=walls||state.walls;
    if(b.x===a.x+1)return ws.some(function(w){return w.o==="v" && w.x===a.x && (w.y===a.y||w.y===a.y-1);});
    if(b.x===a.x-1)return ws.some(function(w){return w.o==="v" && w.x===b.x && (w.y===a.y||w.y===a.y-1);});
    if(b.y===a.y+1)return ws.some(function(w){return w.o==="h" && w.y===a.y && (w.x===a.x||w.x===a.x-1);});
    if(b.y===a.y-1)return ws.some(function(w){return w.o==="h" && w.y===b.y && (w.x===a.x||w.x===a.x-1);});
    return true;
  }
  function canStep(a,b,walls){return inside(b)&&!rock(b)&&Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1&&!barrier(a,b,walls);}
  // Use one movement rule for both real turns and legal-wall path searches.
  // On ice the entry heading is part of the game state, not just the tile.
  function movementOptions(p,lock,walls){
    var currentIce=ice(p),force=lock&&currentIce&&canStep(p,{x:p.x+lock.x,y:p.y+lock.y},walls);
    var choices=force?[lock]:DIRS,result=[];
    choices.forEach(function(d){
      var next={x:p.x+d.x,y:p.y+d.y};
      if(!canStep(p,next,walls))return;
      result.push({p:next,d:d,steps:1,nextLock:ice(next)?(currentIce&&force?lock:d):null});
      if(boost(p)){
        DIRS.forEach(function(d2){
          var target={x:next.x+d2.x,y:next.y+d2.y};
          if(canStep(next,target,walls)&&!same(target,p)&&!boost(target)){
            if(!result.some(function(m){return same(m.p,target)&&m.steps===2;})){
              // On a two-step boost, momentum is determined by the LAST step.
              result.push({p:target,d:d2,steps:2,nextLock:ice(target)?d2:null});
            }
          }
        });
      }
    });
    return result;
  }
  function pathStateKey(p,dir){
    return posKey(p)+"|"+(dir?dir.x+","+dir.y:"free");
  }
  function findPath(start,target,walls,initialLock){
    if(!start||rock(start))return false;
    var queue=[{p:start,lock:initialLock||null}],at=0;
    var seen=new Set([pathStateKey(start,initialLock)]);
    function enqueue(p,lock){
      var id=pathStateKey(p,lock);
      if(!seen.has(id)){seen.add(id);queue.push({p:p,lock:lock});}
    }
    while(at<queue.length){
      var current=queue[at++],cur=current.p;
      if(has(target,cur))return true;
      movementOptions(cur,current.lock,walls).forEach(function(move){
        enqueue(move.p,move.nextLock);
      });
      // Teleporting is optional; either stay at this portal or take its exit.
      // Arrival by teleportation clears ice momentum (same as choosePortal).
      var gate=portal(cur);
      if(gate){
        var exit=same(cur,gate.a)?gate.b:gate.a;
        if(inside(exit)&&!rock(exit))enqueue(exit,null);
      }
    }
    return false;
  }
  function validWall(w){
    if(w.x<0||w.y<0||w.x>W-2||w.y>H-2)return false;
    if(state.left[state.turn]===0||state.phase!=="play")return false;
    var conflicts=state.walls.some(function(q){
      if(q.o===w.o){
        return w.o==="h" ? (q.y===w.y&&Math.abs(q.x-w.x)<2) :
          (q.x===w.x&&Math.abs(q.y-w.y)<2);
      }
      return q.x===w.x&&q.y===w.y;
    });
    if(conflicts)return false;
    var all=state.walls.concat([w]);
    for(var i=0;i<2;i++){
      var starts=state.players[i] ? [state.players[i]] : CAMPS[i];
      var target=CAMPS[1-i];
      if(!starts.some(function(s){return findPath(s,target,all,state.players[i]?state.slideDir[i]:null);}))return false;
    }
    return true;
  }
  function placeWall(w){
    if(!validWall(w)){notice("不能在这里筑墙：墙不得交叉、重叠或彻底封住去路。");return;}
    record();state.walls.push({x:w.x,y:w.y,o:w.o,owner:state.turn});
    state.left[state.turn]--;
    finishTurn("筑起了一道" + (w.o==="h"?"横":"竖") + "墙");
  }
  function availableMoves(){
    if(state.phase!=="play"||!state.players[state.turn])return [];
    return movementOptions(state.players[state.turn],state.slideDir[state.turn],state.walls);
  }
  function selectOrigin(p){
    var who=state.phase==="pick-attack"?0:1;
    if(!has(CAMPS[who],p)){
      notice(who===0?"请点击右下角任意一格金色营地。":"请点击左上角任意一格青色营地。");
      return;
    }
    record();state.players[who]={x:p.x,y:p.y};
    if(who===0){state.phase="pick-defend";state.turn=1;}
    else {state.phase="play";state.turn=0;}
    commit();
  }
  function playerMove(move){
    record();
    state.players[state.turn]={x:move.p.x,y:move.p.y};
    // The destination's momentum is calculated by the same transition
    // function used by wall validation. A turn after hitting a wall resets it.
    state.slideDir[state.turn]=move.nextLock||null;
    var gate=portal(move.p);
    if(gate){
      state.pending={index:PORTALS.indexOf(gate)};
      $("portalIcon").textContent=gate.symbol;
      setModal("portalModal",true);save();drawUI();drawBoard();
      return;
    }
    finishTurn(move.steps===2?"完成一次加速移动":"移动了一格");
  }
  function choosePortal(warp){
    if(!state.pending)return;
    var gate=PORTALS[state.pending.index],p=state.players[state.turn];
    if(warp){
      var target=same(gate.a,p)?gate.b:gate.a;
      state.players[state.turn]={x:target.x,y:target.y};
      state.slideDir[state.turn]=null;
    }
    state.pending=null;setModal("portalModal",false);
    finishTurn(warp?"穿越了"+gate.name:"决定留在传送门");
  }
  function finishTurn(actionName){
    var moving=state.turn;
    state.moves++;
    if(has(CAMPS[1-moving],state.players[moving])){
      state.winner=moving;state.phase="finished";state.notice="";
      $("winTitle").textContent=NAMES[moving]+"获胜！";
      $("winDesc").textContent=actionName+"，率先踏入对方营地。";
      $("winTurns").textContent=String(state.moves);
      $("winWalls").textContent=String(state.walls.length);
      setModal("winModal",true);
    }else{
      state.turn=1-moving;
      state.notice=NAMES[moving]+actionName+"。轮到"+NAMES[state.turn]+"行动。";
    }
    commit();
  }
  function pointerPos(event){
    var rect=canvas.getBoundingClientRect();
    return {x:(event.clientX-rect.left)*720/rect.width,y:(event.clientY-rect.top)*980/rect.height};
  }
  function tileAt(p){
    var x=Math.floor((p.x-X)/STEP),y=Math.floor((p.y-Y)/STEP),t={x:x,y:y};
    return inside(t)?t:null;
  }
  function wallAt(p){
    var o=state.orientation,x,y;
    if(o==="h"){
      x=Math.max(0,Math.min(W-2,Math.floor((p.x-X)/STEP)));
      y=Math.round((p.y-Y)/STEP)-1;
    }else{
      x=Math.round((p.x-X)/STEP)-1;
      y=Math.max(0,Math.min(H-2,Math.floor((p.y-Y)/STEP)));
    }
    var w={x:x,y:y,o:o};
    return w.x>=0&&w.y>=0&&w.x<W-1&&w.y<H-1?w:null;
  }
  function canvasClick(event){
    if(state.phase==="finished"||state.pending)return;
    var p=pointerPos(event),t=tileAt(p);
    if(state.phase==="pick-attack"||state.phase==="pick-defend"){
      if(t)selectOrigin(t);
      return;
    }
    if(state.action==="wall"){
      var w=wallAt(p);
      if(w)placeWall(w);
      else notice("请在棋盘范围内选择筑墙位置。");
    }else{
      if(!t)return;
      var moves=availableMoves(),chosen=moves.find(function(m){return same(m.p,t);});
      if(chosen)playerMove(chosen);
      else notice("此处不可到达。请选择棋盘上发光的可移动格。");
    }
  }
  function setAction(a){
    if(state.phase!=="play")return;
    state.action=a;state.hover=null;drawUI();drawBoard();
  }
  function orientation(o){
    state.orientation=o;drawUI();drawBoard();
  }
  function setModal(id,show){$(id).hidden=!show;}
  function closeAll(){["guideModal","portalModal","winModal"].forEach(function(id){setModal(id,false);});}
  function drawUI(){
    var picking=state.phase!=="play";
    var title=state.phase==="pick-attack"?"金方选择起点":state.phase==="pick-defend"?"木方选择起点":
      state.phase==="finished"?NAMES[state.winner]+"赢得胜利":NAMES[state.turn]+"的回合";
    var help=state.phase==="pick-attack"?"点击棋盘右下角的任一金色营地格，作为金方出生点。":
      state.phase==="pick-defend"?"点击棋盘左上角的任一青色营地格，作为木方出生点。":
      state.phase==="finished"?"本局对战结束。可以悔棋或再来一局。":
      state.action==="wall"?"在棋盘上点击修筑两格长的墙。修墙会结束当前回合。":"点击棋盘内发光的格子行动。一次移动或筑墙即结束回合。";
    // Show the forced ice heading to make advanced movement predictable.
    if(state.variant==="advanced"&&state.phase==="play"&&state.action==="move"&&ice(state.players[state.turn])&&state.slideDir[state.turn]){
      var at=state.players[state.turn],heading=state.slideDir[state.turn];
      var forward={x:at.x+heading.x,y:at.y+heading.y};
      var arrow=heading.x>0?"→":heading.x<0?"←":heading.y>0?"↓":"↑";
      help=canStep(at,forward)?"冰面惯性 "+arrow+"：本回合必须沿箭头方向移动。":
        "冰面前方受阻：可转向，下一回合沿新方向继续滑行。";
    }
    $("phaseInfo").textContent=title;
    $("message").textContent=state.notice||help;
    $("roundBadge").textContent="ROUND "+String(Math.floor(state.moves/2)+1).padStart(2,"0");
    for(var i=0;i<2;i++){
      var card=$("player"+i);card.classList.toggle("active",state.turn===i&&state.phase!=="finished");
      card.classList.toggle("guard-active",i===1&&state.turn===i&&state.phase!=="finished");
      $("player"+i+"Label").textContent=!state.players[i]?"等待选择起点":
        state.phase==="finished"?(state.winner===i?"已获胜":"本局结束"):
        state.phase==="play"&&state.turn===i?"正在行动":"准备就绪";
      $("walls"+i).textContent="✦ ".repeat(state.left[i]).trim()+" · ".repeat(5-state.left[i]).trim();
    }
    $("moveMode").classList.toggle("selected",state.action==="move");
    $("wallMode").classList.toggle("selected",state.action==="wall");
    $("moveMode").disabled=picking;$("wallMode").disabled=picking||state.left[state.turn]===0;
    $("wallTools").hidden=state.action!=="wall"||picking;
    $("wallH").classList.toggle("selected",state.orientation==="h");
    $("wallV").classList.toggle("selected",state.orientation==="v");
    $("modeClassic").classList.toggle("selected",state.variant==="classic");
    $("modeAdvanced").classList.toggle("selected",state.variant==="advanced");
    $("boardVersion").textContent=state.variant==="classic"?"经典战场":"跑道挑战";
    $("legendExtra").hidden=state.variant!=="advanced";
    $("undoBtn").disabled=state.history.length===0;
    $("board").style.cursor=state.action==="wall"&&state.phase==="play"?"crosshair":"pointer";
  }
  function rounded(x,y,w,h,r,fill,stroke){
    ctx.beginPath();ctx.roundRect(x,y,w,h,r);
    if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}
  }
  function line(x1,y1,x2,y2,color,width){
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke();
  }
  function text(t,x,y,size,color,align,font){
    ctx.font=(font||"600")+" "+size+"px 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillStyle=color;ctx.textAlign=align||"center";ctx.textBaseline="middle";ctx.fillText(t,x,y);
  }
  function drawBase(){
    ctx.clearRect(0,0,720,980);
    rounded(X-14,Y-14,W*STEP+28,H*STEP+28,16,"#101c2b","#395164");
    for(var y=0;y<H;y++)for(var x=0;x<W;x++){
      var p={x:x,y:y},px=X+x*STEP,py=Y+y*STEP;
      var camp=campOwner(p);
      var fill=camp===0?"#43382f":camp===1?"#1e4147":(x+y)%2?"#1c3041":"#223649";
      rounded(px+2,py+2,STEP-4,STEP-4,5,fill,camp===0?"#846345":camp===1?"#467a7b":"#33495c");
      if(camp!==-1){
        ctx.save();ctx.globalAlpha=.15;rounded(px+7,py+7,STEP-14,STEP-14,3,camp===0?"#ffba67":"#9df2e2");ctx.restore();
        text(camp===0?"攻":"守",px+STEP/2,py+11,10,camp===0?"#cd9b60":"#7aadae");
      }
      if(state.variant==="advanced"&&ice(p)){
        ctx.save();ctx.globalAlpha=.5;
        for(var k=0;k<3;k++)line(px+12,py+24+k*9,px+52,py+24+k*9,"#7cbccc",2);
        ctx.restore();
      }
      if(state.variant==="advanced"&&boost(p)){
        text("ϟ",px+STEP/2,py+STEP/2,34,"#efc37d");
      }
    }
    for(var col=0;col<W;col++)text(String.fromCharCode(65+col),X+col*STEP+STEP/2,Y-30,13,"#627c91");
    for(var row=0;row<H;row++)text(String(H-row),X-28,Y+row*STEP+STEP/2,12,"#657c90");
    ROCKS.forEach(function(p){
      var x=X+p.x*STEP,y=Y+p.y*STEP;
      rounded(x+7,y+7,STEP-14,STEP-14,6,"#536671","#75919a");
      rounded(x+10,y+10,STEP-20,STEP-20,5,"#283947","#3f5a65");
      ctx.save();ctx.globalAlpha=.3;line(x+19,y+18,x+35,y+32,"#8eb2b5",2);line(x+43,y+31,x+34,y+50,"#9dc4c4",2);ctx.restore();
    });
    PORTALS.forEach(function(g){
      [g.a,g.b].forEach(function(p){
        var x=X+(p.x+.5)*STEP,y=Y+(p.y+.5)*STEP;
        ctx.save();ctx.shadowColor="#a2a3ef";ctx.shadowBlur=14;
        ctx.beginPath();ctx.arc(x,y,22,0,Math.PI*2);ctx.fillStyle="#414967";ctx.fill();ctx.shadowBlur=0;
        ctx.lineWidth=2;ctx.strokeStyle="#a9bce6";ctx.stroke();ctx.restore();
        text(g.symbol,x,y+1,24,"#e0e1fb");
      });
    });
  }
  function drawTargets(){
    if(state.phase==="pick-attack"||state.phase==="pick-defend"){
      var who=state.phase==="pick-attack"?0:1;
      CAMPS[who].forEach(function(p){
        var x=X+p.x*STEP,y=Y+p.y*STEP;
        ctx.save();ctx.shadowColor=who===0?"#ffd08d":"#75dfd3";ctx.shadowBlur=12;
        rounded(x+5,y+5,STEP-10,STEP-10,6,null,who===0?"#ffd08d":"#8de1da");
        ctx.restore();text("+",x+STEP/2,y+STEP/2+6,29,who===0?"#ffcf85":"#a5f6e6");
      });
      return;
    }
    if(state.phase!=="play"||state.pending)return;
    if(state.action==="move"){
      var moves=availableMoves();
      moves.forEach(function(m){
        var x=X+(m.p.x+.5)*STEP,y=Y+(m.p.y+.5)*STEP;
        ctx.beginPath();ctx.arc(x,y,m.steps===2?19:16,0,Math.PI*2);
        ctx.fillStyle=state.turn===0?"#f7b65a35":"#72dace35";ctx.fill();
        ctx.lineWidth=2;ctx.strokeStyle=state.turn===0?"#edb56d":"#80dccb";ctx.stroke();
        if(m.steps===2)text("2",x,y,13,"#f4e9d5");
        else{ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle=state.turn===0?"#ffca85":"#9de9d9";ctx.fill();}
      });
    }else if(state.hover){
      var w=wallAt(state.hover);
      if(w){drawWall(w,validWall(w),true);}
    }
  }
  function drawWall(w,valid,preview){
    var c=w.owner===1?"#73d3c6":"#f4b967";
    if(preview)c=valid?"#ffdc9c":"#ed7777";
    var x1,y1,x2,y2;
    if(w.o==="h"){x1=X+w.x*STEP+7;x2=X+(w.x+2)*STEP-7;y1=Y+(w.y+1)*STEP;y2=y1;}
    else{x1=X+(w.x+1)*STEP;x2=x1;y1=Y+w.y*STEP+7;y2=Y+(w.y+2)*STEP-7;}
    ctx.save();ctx.globalAlpha=preview?.78:1;
    ctx.shadowColor=c;ctx.shadowBlur=preview?18:10;
    line(x1,y1,x2,y2,"#0d1620",17);line(x1,y1,x2,y2,c,10);
    ctx.shadowBlur=0;line(x1,y1,x2,y2,"#ffffff42",2);ctx.restore();
  }
  function drawPawn(i){
    var p=state.players[i];if(!p)return;
    var sameCell=state.players[1-i]&&same(p,state.players[1-i]);
    var x=X+(p.x+.5)*STEP+(sameCell?(i===0?-13:13):0),y=Y+(p.y+.5)*STEP;
    var color=i===0?"#ffd18e":"#a0e9d9",shadow=i===0?"#f1a64d":"#62cabb";
    ctx.save();ctx.shadowColor=shadow;ctx.shadowBlur=state.turn===i?18:8;
    ctx.beginPath();ctx.arc(x,y,sameCell?17:23,0,Math.PI*2);ctx.fillStyle=i===0?"#6e4a32":"#1d5154";ctx.fill();
    ctx.lineWidth=3;ctx.strokeStyle=color;ctx.stroke();ctx.restore();
    text(i===0?"金":"木",x,y+2,sameCell?16:21,color);
    if(state.variant==="advanced"&&ice(p)&&state.slideDir[i]){
      var d=state.slideDir[i],arrow=d.x>0?"→":d.x<0?"←":d.y>0?"↓":"↑";
      text(arrow,x+17,y-21,18,"#ffffff");
    }
    if(state.phase==="play"&&state.turn===i&&!state.pending){
      ctx.beginPath();ctx.arc(x,y,sameCell?22:29,0,Math.PI*2);ctx.strokeStyle=color+"65";ctx.lineWidth=1.5;ctx.stroke();
    }
  }
  function drawBoard(){
    if(!state)return;
    drawBase();
    drawTargets();
    state.walls.forEach(function(w){drawWall(w,true,false);});
    drawPawn(1);drawPawn(0);
    if(state.phase==="finished"){
      ctx.save();ctx.fillStyle="#0b1424af";rounded(X+100,Y+350,W*STEP-200,118,8,"#0a1629df","#9d8d66");
      text(NAMES[state.winner]+" 获 胜",360,Y+403,35,state.winner===0?"#f6c180":"#9ce8dc");
      ctx.restore();
    }
  }
  function bindEvents(){
    canvas.addEventListener("click",canvasClick);
    canvas.addEventListener("pointermove",function(e){
      if(state.phase!=="play"||state.action!=="wall"||state.pending)return;
      state.hover=pointerPos(e);drawBoard();
    });
    canvas.addEventListener("pointerleave",function(){state.hover=null;drawBoard();});
    $("moveMode").addEventListener("click",function(){setAction("move");});
    $("wallMode").addEventListener("click",function(){setAction("wall");});
    $("wallH").addEventListener("click",function(){orientation("h");});
    $("wallV").addEventListener("click",function(){orientation("v");});
    $("undoBtn").addEventListener("click",undo);
    $("restartBtn").addEventListener("click",function(){
      if(state.moves>0&&!window.confirm("确定放弃当前对局并重新开始吗？"))return;
      resetGame(state.variant);
    });
    $("modeClassic").addEventListener("click",function(){confirmSwitch("classic");});
    $("modeAdvanced").addEventListener("click",function(){confirmSwitch("advanced");});
    $("helpTop").addEventListener("click",function(){setModal("guideModal",true);});
    $("guideBtn").addEventListener("click",function(){setModal("guideModal",true);});
    $("stayBtn").addEventListener("click",function(){choosePortal(false);});
    $("warpBtn").addEventListener("click",function(){choosePortal(true);});
    $("playAgainBtn").addEventListener("click",function(){resetGame(state.variant);});
    document.querySelectorAll("[data-close]").forEach(function(b){
      b.addEventListener("click",function(){setModal(b.dataset.close,false);});
    });
    document.addEventListener("keydown",function(e){
      if(e.key==="Escape"){setModal("guideModal",false);return;}
      if(!$("portalModal").hidden||!$("winModal").hidden||!$("guideModal").hidden)return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();undo();return;}
      if(state.phase!=="play")return;
      if(e.key.toLowerCase()==="r"){orientation(state.orientation==="h"?"v":"h");return;}
      var m={"ArrowRight":{x:1,y:0},"ArrowLeft":{x:-1,y:0},"ArrowDown":{x:0,y:1},"ArrowUp":{x:0,y:-1}}[e.key];
      if(m&&state.action==="move"){
        e.preventDefault();
        var p=state.players[state.turn],t={x:p.x+m.x,y:p.y+m.y};
        var possible=availableMoves().find(function(k){return same(k.p,t)&&k.steps===1;});
        if(possible)playerMove(possible);
      }
    });
    document.querySelectorAll(".modal-cover").forEach(function(m){
      m.addEventListener("click",function(e){if(e.target===m&&m.id==="guideModal")m.hidden=true;});
    });
  }
  state=load()||newGame("classic");
  state.hover=null;state.notice=state.notice||"";
  bindEvents();drawUI();drawBoard();
  if(state.phase==="finished"&&state.winner!==null){
    $("winTitle").textContent=NAMES[state.winner]+"获胜！";
    $("winTurns").textContent=String(state.moves);
    $("winWalls").textContent=String(state.walls.length);
    setModal("winModal",true);
  }else if(state.pending){
    $("portalIcon").textContent=PORTALS[state.pending.index].symbol;
    setModal("portalModal",true);
  }
})();
