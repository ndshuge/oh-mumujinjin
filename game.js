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
  var DEFAULT_ROCKS = [{x:3,y:2},{x:3,y:3},{x:7,y:2},{x:2,y:4},{x:4,y:5},{x:5,y:5},{x:0,y:8},{x:3,y:9},{x:5,y:9},{x:6,y:9}];
  var PORTALS = [
    {symbol:"△",name:"三角之门",a:{x:5,y:2},b:{x:2,y:5}},
    {symbol:"✦",name:"星辉之门",a:{x:6,y:4},b:{x:1,y:11}},
    {symbol:"○",name:"圆环之门",a:{x:8,y:6},b:{x:3,y:8}}
  ];
  var ROCKS = DEFAULT_ROCKS.map(function(p){return {x:p.x,y:p.y};});
  var ICE = [{x:1,y:6},{x:1,y:7},{x:1,y:8},{x:7,y:7},{x:7,y:8}];
  var BOOST = [{x:4,y:3},{x:4,y:4},{x:6,y:10},{x:7,y:10}];
  var DIRS = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
  var state;
  var aiDialogueDisabled=false,aiBanterTurns=0;
  var AI_QUOTES={
    opening:["金方先手？那就看看你能走多远。","我已经在想三步之后的局面了。","别急，棋盘才刚刚热起来。"],
    wall:["这道墙，喜欢吗？","近路没了。现在考验你的耐心。","别只盯着终点，看看脚下的路。"],
    move:["我已经看见通往你营地的路了。","你的下一步，我会认真接招。","慢慢来，胜负还没定。"],
    portal:["传送门？真是有趣的捷径。","空间可比你想的复杂。"],
    danger:["看来局面有点危险，我要认真了。","好吧，这一步确实漂亮。"],
    lose:["这一局你赢了。下一局我会改变策略。"],
    win:["将军。下次再来挑战吧。"]
  };
  function showAIQuote(kind,force){
    if(!state||state.playMode!=="cpu"||editing||aiDialogueDisabled)return;
    if(!force&&state.moves%3!==0&&kind!=="wall")return;
    var box=$("aiBanter");if(!box)return;
    var list=AI_QUOTES[kind]||AI_QUOTES.move;
    $("aiBanterText").textContent=list[aiBanterTurns++%list.length];
    box.hidden=false;$("aiReplies").hidden=true;
  }
  function refreshAIBanter(){
    var box=$("aiBanter");if(!box)return;
    box.hidden=state.playMode!=="cpu"||editing||aiDialogueDisabled;
    $("aiQuiet").textContent=aiDialogueDisabled?"开启对话":"安静模式";
    $("aiReplyToggle").hidden=aiDialogueDisabled;
  }
  var editing=false,editorTool="add",editorName="我的地图",editorRocks=null;
  var MAP_KEY="mumujinjin-custom-maps-v1", ACTIVE_KEY="mumujinjin-active-map-v1";
  function fixedTile(t){return CAMPS.some(function(arr){return has(arr,t);})||PORTALS.some(function(g){return same(g.a,t)||same(g.b,t);})||has(ICE,t)||has(BOOST,t);}
  function cleanMap(input){
    if(!input||input.version!==1||!Array.isArray(input.rocks)||input.rocks.length>100||typeof input.name!=="string")return null;
    var name=input.name.trim().slice(0,40)||"自定义地图",seen=new Set(),rocks=[];
    for(var i=0;i<input.rocks.length;i++){
      var t=input.rocks[i];
      if(!t||!Number.isInteger(t.x)||!Number.isInteger(t.y)||!inside(t)||fixedTile(t)||seen.has(posKey(t)))return null;
      seen.add(posKey(t));rocks.push({x:t.x,y:t.y});
    }
    var old=ROCKS;ROCKS=rocks;
    var valid=CAMPS.every(function(starts,i){return starts.every(function(s){return findPath(s,CAMPS[1-i],[]);});});
    ROCKS=old;
    return valid?{version:1,name:name,rocks:rocks}:null;
  }
  function readMaps(){try{var m=JSON.parse(localStorage.getItem(MAP_KEY));return Array.isArray(m)?m.filter(cleanMap).slice(0,15):[];}catch(e){return [];}}
  function installMap(map){
    var valid=cleanMap(map);if(!valid)return false;
    ROCKS=valid.rocks.map(function(t){return {x:t.x,y:t.y};});
    editorName=valid.name;try{localStorage.setItem(ACTIVE_KEY,JSON.stringify(valid));}catch(e){}
    resetGame(state.variant);return true;
  }
  function mapCurrent(){return {version:1,name:editorName,rocks:ROCKS.map(function(t){return{x:t.x,y:t.y};})};}
  function mapDraft(){return {version:1,name:editorName,rocks:editorRocks.map(function(t){return{x:t.x,y:t.y};})};}
  function editorMessage(msg){$("editorMessage").textContent=msg;}
  function editorDraw(){
    $("mapEditor").hidden=!editing;
    $("mapEditorButton").textContent=editing?"关闭工坊":"地图工坊";
    $("editorAdd").classList.toggle("selected",editorTool==="add");
    $("editorErase").classList.toggle("selected",editorTool==="erase");
    $("editorName").value=editorName;
    $("mapNameActive").textContent=editorName;
    refreshAIBanter();
    drawBoard();
  }
  function openEditor(){
    if(!editing && state.moves>0&&!window.confirm("进入地图编辑将结束当前对局，确定继续？"))return;
    editing=!editing;
    if(editing){editorRocks=ROCKS.map(function(t){return{x:t.x,y:t.y};});editorTool="add";editorMessage("点击棋盘放置障碍；橙色提示表示该地图当前不可游玩。");}
    editorDraw();
  }
  function editCell(t){
    if(!t||fixedTile(t)){editorMessage("营地、传送门及特殊地形不能覆盖。");return;}
    var ix=editorRocks.findIndex(function(p){return same(p,t);});
    if(editorTool==="erase"){if(ix>=0)editorRocks.splice(ix,1);}
    else if(ix<0)editorRocks.push({x:t.x,y:t.y});
    var v=cleanMap(mapDraft());
    editorMessage(v?"地图合法，可保存或试玩。":"目前存在被封闭的出生路线，请调整障碍。");
    drawBoard();
  }
  function saveMap(){
    editorName=$("editorName").value.trim().slice(0,40)||"自定义地图";
    var map=cleanMap(mapDraft());
    if(!map){editorMessage("无法保存：地图存在不可到达的路线或无效障碍。");return;}
    var maps=readMaps().filter(function(x){return x.name!==map.name;});
    maps.unshift(map);try{localStorage.setItem(MAP_KEY,JSON.stringify(maps.slice(0,15)));}catch(e){editorMessage("浏览器存储失败。");return;}
    editorMessage("已保存："+map.name);refreshMapSelect();
  }
  function refreshMapSelect(){
    var select=$("savedMaps");if(!select||!select.appendChild)return;
    select.innerHTML="";
    var empty=document.createElement("option");empty.value="";empty.textContent="选择已保存地图";select.appendChild(empty);
    readMaps().forEach(function(map){var opt=document.createElement("option");opt.value=map.name;opt.textContent=map.name;select.appendChild(opt);});
  }
  function shareMap(){
    editorName=$("editorName").value.trim().slice(0,40)||"自定义地图";
    var map=cleanMap(mapDraft());if(!map){editorMessage("不能分享无解地图。");return;}
    var bytes=new TextEncoder().encode(JSON.stringify(map)),binary="";
    bytes.forEach(function(b){binary+=String.fromCharCode(b);});
    var code=btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
    var link=location.origin+location.pathname+"#map="+code;
    $("mapShareLink").value=link;
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(link).catch(function(){});
    editorMessage("分享链接已生成，并尝试复制到剪贴板。");
  }
  function loadShare(){
    var fragment=typeof location==="undefined"?"":(location.hash||""),value=fragment.startsWith("#map=")?fragment.slice(5):"";
    if(!value)return;
    try{
      if(value.length>5000)return;
      var binary=atob(value.replace(/-/g,"+").replace(/_/g,"/")),bytes=Uint8Array.from(binary,function(s){return s.charCodeAt(0);});
      var map=cleanMap(JSON.parse(new TextDecoder().decode(bytes)));
      if(map){ROCKS=map.rocks;editorName=map.name;localStorage.setItem(ACTIVE_KEY,JSON.stringify(map));}
    }catch(e){}
  }
  function initMap(){
    try{var active=cleanMap(JSON.parse(localStorage.getItem(ACTIVE_KEY)));if(active){ROCKS=active.rocks;editorName=active.name;}}catch(e){}
    loadShare();
  }
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
    return {variant:variant||"classic",playMode:"local",aiLevel:"normal",phase:"pick-attack",players:[null,null],turn:0,
      walls:[],left:[5,5],moves:0,history:[],action:"move",orientation:"h",
      hover:null,slideDir:[null,null],pending:null,winner:null,repetitions:{},notice:""};
  }
  function snapshot(){
    return JSON.stringify({phase:state.phase,players:state.players,turn:state.turn,walls:state.walls,
      left:state.left,moves:state.moves,slideDir:state.slideDir,pending:state.pending,winner:state.winner,repetitions:state.repetitions});
  }
  function restore(s){
    var old=JSON.parse(s);
    ["phase","players","turn","walls","left","moves","slideDir","pending","winner","repetitions"].forEach(function(k){state[k]=old[k];});
    state.repetitions=state.repetitions||{};
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
      parsed.state.repetitions=parsed.state.repetitions||{};
      return parsed.state;
    } catch(e){return null;}
  }
  function notice(text){state.notice=text;drawUI();}
  function commit(){state.notice="";save();drawUI();drawBoard();scheduleComputerTurn();}
  function resetGame(variant){
    var playMode=state.playMode||"local",aiLevel=state.aiLevel||"normal";
    state=newGame(variant||state.variant);
    state.playMode=playMode;state.aiLevel=aiLevel;
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
    var count=state.playMode==="cpu"&&state.phase==="play"&&state.turn===0?2:1;
    while(count-- > 0 && state.history.length)restore(state.history.pop());
    closeAll();commit();
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
      result.push({p:next,d:d,firstDir:d,steps:1,nextLock:ice(next)?(currentIce&&force?lock:d):null});
      if(boost(p)){
        DIRS.forEach(function(d2){
          var target={x:next.x+d2.x,y:next.y+d2.y};
          if(canStep(next,target,walls)&&!same(target,p)&&!boost(target)){
            if(!result.some(function(m){return same(m.p,target)&&m.steps===2;})){
              // On a two-step boost, momentum is determined by the LAST step.
              result.push({p:target,d:d2,firstDir:d,steps:2,nextLock:ice(target)?d2:null});
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
    if(who===1)showAIQuote("opening",true);
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
      state.repetitions=state.repetitions||{};
      var repeatKey=JSON.stringify([state.turn,state.players,state.slideDir,
        state.walls.map(function(w){return w.o+":"+w.x+":"+w.y;}).sort(),state.left]);
      var times=(state.repetitions[repeatKey]||0)+1;
      state.repetitions[repeatKey]=times;
      if(times>=3||state.moves>=120){
        state.phase="finished";state.winner=null;
        state.notice=times>=3?"同一局面出现三次，平局。":"达到 120 手上限，平局。";
        $("winTitle").textContent="平局";
        $("winDesc").textContent=state.notice;
        $("winTurns").textContent=String(state.moves);
        $("winWalls").textContent=String(state.walls.length);
        setModal("winModal",true);
      }else state.notice=NAMES[moving]+actionName+"。轮到"+NAMES[state.turn]+"行动。";
    }
    commit();
    if(state.playMode==="cpu"){
      if(state.phase==="finished"&&state.winner!==null)showAIQuote(state.winner===1?"win":"lose",true);
      else if(moving===1)showAIQuote(actionName.indexOf("墙")>=0?"wall":actionName.indexOf("门")>=0?"portal":"move",false);
      else if(state.moves%5===0)showAIQuote("danger",true);
    }
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
    if(editing){editCell(tileAt(pointerPos(event)));return;}
    if(state.playMode==="cpu"&&state.phase==="play"&&state.turn===1)return;
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
  // Local, deterministic-rule computer player. No server/API required.
  // All candidate moves and barriers use the same legal actions as human turns.
  var cpuScheduleToken=0;
  function computerDistance(start,goal,walls,lock){
    var queue=[{p:start,lock:lock||null,n:0}],head=0;
    var seen=new Set([pathStateKey(start,lock)]);
    while(head<queue.length){
      var cur=queue[head++];
      if(has(goal,cur.p))return cur.n;
      var options=movementOptions(cur.p,cur.lock,walls);
      for(var i=0;i<options.length;i++){
        var m=options[i],g=portal(m.p),out=[{p:m.p,lock:m.nextLock}];
        if(g){out.push({p:same(g.a,m.p)?g.b:g.a,lock:null});}
        for(var j=0;j<out.length;j++){
          var q=out[j],id=pathStateKey(q.p,q.lock);
          if(!seen.has(id)){seen.add(id);queue.push({p:q.p,lock:q.lock,n:cur.n+1});}
        }
      }
    }
    return Infinity;
  }
  function computerWallChoice(level){
    if(level==="easy"||!state.left[1])return null;
    var mine=state.players[1],them=state.players[0],beforeMine=computerDistance(mine,CAMPS[0],state.walls,state.slideDir[1]);
    var beforeThem=computerDistance(them,CAMPS[1],state.walls,state.slideDir[0]);
    var best=null,bestScore=-Infinity,seen=new Set();
    for(var dx=-2;dx<=1;dx++)for(var dy=-2;dy<=1;dy++)for(var k=0;k<2;k++){
      var w={x:them.x+dx,y:them.y+dy,o:k===0?"h":"v"},id=w.x+","+w.y+","+w.o;
      if(seen.has(id))continue;seen.add(id);
      if(!validWall(w))continue;
      var all=state.walls.concat([w]);
      var theirs=computerDistance(them,CAMPS[1],all,state.slideDir[0]);
      var ours=computerDistance(mine,CAMPS[0],all,state.slideDir[1]);
      if(!Number.isFinite(ours)||!Number.isFinite(theirs))continue;
      var score=1.5*(theirs-beforeThem)-1.1*(ours-beforeMine);
      if(score>bestScore){bestScore=score;best=w;}
    }
    var needed=level==="hell"?0.35:level==="hard"?1.05:2.3;
    return bestScore>=needed?best:null;
  }
  // 地狱级：有界两层对抗搜索（AI 下一步 vs 玩家最佳应对）。
  // Includes both legal wall placements and player moves, and both portal choices.
  function hellWallAllowed(s,w,who){
    if(w.x<0||w.y<0||w.x>W-2||w.y>H-2||s.left[who]<=0)return false;
    if(s.walls.some(function(q){
      return q.o===w.o?(w.o==="h"?q.y===w.y&&Math.abs(q.x-w.x)<2:q.x===w.x&&Math.abs(q.y-w.y)<2):q.x===w.x&&q.y===w.y;
    }))return false;
    var proposed=s.walls.concat([w]);
    return [0,1].every(function(p){return findPath(s.players[p],CAMPS[1-p],proposed,s.dirs[p]);});
  }
  function hellApply(s,who,a){
    var next={players:s.players.map(function(p){return{x:p.x,y:p.y};}),
      dirs:s.dirs.slice(),walls:s.walls.slice(),left:s.left.slice()};
    if(a.wall){next.walls.push(a.wall);next.left[who]--;}
    else {next.players[who]={x:a.p.x,y:a.p.y};next.dirs[who]=a.lock||null;}
    return next;
  }
  function hellEvaluate(s){
    if(has(CAMPS[0],s.players[1]))return 100000;
    if(has(CAMPS[1],s.players[0]))return -100000;
    var mine=computerDistance(s.players[1],CAMPS[0],s.walls,s.dirs[1]);
    var theirs=computerDistance(s.players[0],CAMPS[1],s.walls,s.dirs[0]);
    if(!Number.isFinite(mine))return -10000;
    if(!Number.isFinite(theirs))return 10000;
    return 4*(theirs-mine)+0.32*(s.left[1]-s.left[0]);
  }
  function hellCandidates(s,who){
    var result=[],moves=movementOptions(s.players[who],s.dirs[who],s.walls);
    moves.forEach(function(m){
      result.push({p:m.p,lock:m.nextLock,move:m,kind:"move"});
      var gate=portal(m.p);
      if(gate){var out=same(gate.a,m.p)?gate.b:gate.a;
        result.push({p:out,lock:null,move:m,warp:true,kind:"move"});}
    });
    var enemy=s.players[1-who];
    if(s.left[who]>0){
      for(var dx=-2;dx<=1;dx++)for(var dy=-2;dy<=1;dy++)
      for(var j=0;j<2;j++){
        var w={x:enemy.x+dx,y:enemy.y+dy,o:j?"v":"h"};
        if(hellWallAllowed(s,w,who))result.push({wall:w,kind:"wall"});
      }
    }
    return result;
  }
  function hellChooseAction(){
    var start={players:state.players,dirs:state.slideDir,walls:state.walls,left:state.left};
    var root=hellCandidates(start,1);
    if(!root.length)return null;
    var rootRanked=root.map(function(a){
      var s=hellApply(start,1,a);return{a:a,s:s,val:hellEvaluate(s)};
    }).sort(function(a,b){return b.val-a.val;}).slice(0,9);
    var best=null,bestScore=-Infinity;
    rootRanked.forEach(function(item){
      var score=item.val;
      if(score>=100000){best=item.a;bestScore=score;return;}
      var replies=hellCandidates(item.s,0);
      // Human makes their strongest immediate response.
      if(replies.length){
        var worst=Infinity;
        replies.forEach(function(reply){
          var val=hellEvaluate(hellApply(item.s,0,reply));
          if(val<worst)worst=val;
        });
        score=0.78*worst+0.22*item.val;
      }
      if(score>bestScore){bestScore=score;best=item.a;}
    });
    return best;
  }
  function hellMoveChoice(options){
    // Bounded tactical search: evaluate our candidate followed by the human's best
    // immediate response, then prioritize a robust line and avoid portal traps.
    var best=null,bestScore=-Infinity;
    var human=state.players[0],myGoal=CAMPS[0],humanGoal=CAMPS[1];
    var theirDist=computerDistance(human,humanGoal,state.walls,state.slideDir[0]);
    var theirReplies=movementOptions(human,state.slideDir[0],state.walls);
    var replyDist=theirReplies.reduce(function(shortest,m){
      var g=portal(m.p),positions=[{p:m.p,l:m.nextLock}];
      if(g)positions.push({p:same(g.a,m.p)?g.b:g.a,l:null});
      return Math.min(shortest,...positions.map(function(q){return computerDistance(q.p,humanGoal,state.walls,q.l);}));
    },theirDist);
    options.forEach(function(move){
      var g=portal(move.p),positions=[{p:move.p,l:move.nextLock}];
      if(g)positions.push({p:same(g.a,move.p)?g.b:g.a,l:null});
      var ownDist=Math.min(...positions.map(function(q){return computerDistance(q.p,myGoal,state.walls,q.l);}));
      var score=-3*ownDist+1.2*replyDist+0.25*theirDist+0.1*(move.steps-1);
      if(has(myGoal,move.p))score+=1000;
      if(score>bestScore){bestScore=score;best=move;}
    });
    return best;
  }
  function computerMoveChoice(level){
    var options=availableMoves();
    if(!options.length)return null;
    if(level==="hell")return hellMoveChoice(options);
    if(level==="easy"&&Math.random()<0.22)return options[Math.floor(Math.random()*options.length)];
    var goal=CAMPS[0],best=null,score=Infinity;
    for(var i=0;i<options.length;i++){
      var m=options[i],destinations=[{p:m.p,lock:m.nextLock}],g=portal(m.p);
      if(g)destinations.push({p:same(g.a,m.p)?g.b:g.a,lock:null});
      var dist=Math.min.apply(null,destinations.map(function(dest){
        return computerDistance(dest.p,goal,state.walls,dest.lock);
      }));
      var tie=(level==="hard"?Math.random()*0.08:Math.random()*0.6);
      var preference=dist+tie-0.07*(m.steps-1);
      if(preference<score){score=preference;best=m;}
    }
    return best;
  }
  function computerTakeTurn(){
    if(state.playMode!=="cpu"||state.phase!=="play"||state.turn!==1||state.pending)return;
    var level=state.aiLevel||"normal";
    var tactical=level==="hell"?hellChooseAction():null;
    var wall=tactical?tactical.wall:computerWallChoice(level);
    if(wall){placeWall(wall);return;}
    var move=tactical?tactical.move:computerMoveChoice(level);
    if(!move)return;
    playerMove(move);
    if(state.pending&&state.turn===1){
      var gate=PORTALS[state.pending.index],cur=state.players[1];
      var exit=same(gate.a,cur)?gate.b:gate.a;
      var stayDistance=computerDistance(cur,CAMPS[0],state.walls,null);
      var warpDistance=computerDistance(exit,CAMPS[0],state.walls,null);
      choosePortal(tactical?tactical.warp===true:warpDistance<stayDistance);
    }
  }
  function scheduleComputerTurn(){
    var token=++cpuScheduleToken;
    if(editing||state.playMode!=="cpu"||typeof window.setTimeout!=="function")return;
    if(state.phase==="pick-defend"){
      window.setTimeout(function(){
        if(token!==cpuScheduleToken||state.phase!=="pick-defend"||state.playMode!=="cpu")return;
        selectOrigin({x:1,y:0});
      },280);
    }else if(state.phase==="play"&&state.turn===1&&!state.pending){
      window.setTimeout(function(){
        if(token!==cpuScheduleToken||state.phase!=="play"||state.turn!==1||state.playMode!=="cpu")return;
        computerTakeTurn();
      },420);
    }
  }
  function setPlayMode(mode){
    if(state.playMode===mode)return;
    if(state.moves>0&&!window.confirm("切换对战方式会重置当前对局。确定继续？"))return;
    state.playMode=mode;resetGame(state.variant);
  }
  function setAILevel(level){
    if(state.playMode==="cpu"&&state.aiLevel===level)return;
    if(state.moves>0&&!window.confirm("切换人机难度会重置当前对局。确定继续？"))return;
    state.playMode="cpu";state.aiLevel=level;resetGame(state.variant);
  }
  function setAction(a){
    if(editing||state.phase!=="play"||(state.playMode==="cpu"&&state.turn===1))return;
    state.action=a;state.hover=null;drawUI();drawBoard();
  }
  function orientation(o){
    state.orientation=o;drawUI();drawBoard();
  }
  function setModal(id,show){$(id).hidden=!show;}
  function closeAll(){["guideModal","portalModal","winModal"].forEach(function(id){setModal(id,false);});}
  function drawUI(){
    var picking=state.phase!=="play"||editing;
    refreshAIBanter();
    $("mapEditorButton").textContent=editing?"关闭工坊":"地图工坊";
    $("mapNameActive").textContent=editorName;
    var title=state.phase==="pick-attack"?"金方选择起点":state.phase==="pick-defend"?"木方选择起点":
      state.phase==="finished"?(state.winner===null?"平局":NAMES[state.winner]+"赢得胜利"):NAMES[state.turn]+"的回合";
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
    if(state.playMode==="cpu"){
      if(state.phase==="pick-defend")help="电脑正在选择木方出生点…";
      if(state.phase==="play"&&state.turn===1){title="木方电脑的回合";help="电脑正在计算下一步，请稍候。";}
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
    var cpuBusy=state.playMode==="cpu"&&state.turn===1;
    $("moveMode").disabled=picking||cpuBusy;$("wallMode").disabled=picking||cpuBusy||state.left[state.turn]===0;
    $("wallTools").hidden=state.action!=="wall"||picking;
    $("wallH").classList.toggle("selected",state.orientation==="h");
    $("wallV").classList.toggle("selected",state.orientation==="v");
    $("modeClassic").classList.toggle("selected",state.variant==="classic");
    $("modeAdvanced").classList.toggle("selected",state.variant==="advanced");
    $("boardVersion").textContent=state.variant==="classic"?"经典战场":"跑道挑战";
    if(state.playMode==="cpu")$("player1Label").textContent=state.phase==="play"&&state.turn===1?"电脑思考中":"电脑执木方";
    $("playLocal").classList.toggle("selected",state.playMode!=="cpu");
    $("playAI").classList.toggle("selected",state.playMode==="cpu");
    $("aiDifficulty").hidden=state.playMode!=="cpu";
    ["easy","normal","hard","hell"].forEach(function(level){
      $("ai-"+level).classList.toggle("selected",state.aiLevel===level);
      if(typeof $("ai-"+level).setAttribute==="function")$("ai-"+level).setAttribute("aria-pressed",state.aiLevel===level?"true":"false");
    });
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
    (editing?editorRocks:ROCKS).forEach(function(p){
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
    if(!editing){drawPawn(1);drawPawn(0);}
    else {rounded(X-14,Y-14,W*STEP+28,H*STEP+28,16,null,cleanMap(mapDraft())?"#5fe3c2":"#fa786a");}
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
    $("mapEditorButton").addEventListener("click",openEditor);
    $("editorMore").addEventListener("click",function(){var expanded=$("mapEditor").classList.toggle("expanded");$("editorMore").setAttribute("aria-expanded",String(expanded));});
    $("editorAdd").addEventListener("click",function(){editorTool="add";editorDraw();});
    $("editorErase").addEventListener("click",function(){editorTool="erase";editorDraw();});
    $("editorDefault").addEventListener("click",function(){
      editorRocks=DEFAULT_ROCKS.map(function(p){return{x:p.x,y:p.y};});editorDraw();editorMessage("已恢复默认布局（尚未应用）。");
    });
    $("editorSave").addEventListener("click",saveMap);
    $("editorPlay").addEventListener("click",function(){
      editorName=$("editorName").value.trim().slice(0,40)||"自定义地图";
      var map=cleanMap(mapDraft());
      if(!map){editorMessage("地图尚未通过合法性检查。");return;}
      editing=false;installMap(map);editorDraw();
    });
    $("editorShare").addEventListener("click",shareMap);
    $("editorImport").addEventListener("click",function(){
      var source=$("mapImportData").value.trim(),data;
      try{
        if(source.includes("#map=")){var encoded=source.split("#map=")[1].split("&")[0];
          var str=atob(encoded.replace(/-/g,"+").replace(/_/g,"/"));
          data=JSON.parse(new TextDecoder().decode(Uint8Array.from(str,function(c){return c.charCodeAt(0);})));
        }else data=JSON.parse(source);
      }catch(e){editorMessage("无法解析导入内容。");return;}
      var map=cleanMap(data);if(!map){editorMessage("地图格式无效或存在不可通行的路线。");return;}
      editorRocks=map.rocks;editorName=map.name;editorDraw();editorMessage("导入成功，请试玩或保存。");
    });
    $("savedMaps").addEventListener("change",function(){
      var entry=readMaps().find(function(m){return m.name===$("savedMaps").value;});
      if(entry){editorRocks=entry.rocks.map(function(p){return{x:p.x,y:p.y};});editorName=entry.name;editorDraw();}
    });
    $("editorUseDefault").addEventListener("click",function(){editing=false;installMap({version:1,name:"经典地图",rocks:DEFAULT_ROCKS});editorDraw();});

    $("playLocal").addEventListener("click",function(){setPlayMode("local");});
    $("playAI").addEventListener("click",function(){setPlayMode("cpu");});
    $("aiQuiet").addEventListener("click",function(){
      aiDialogueDisabled=!aiDialogueDisabled;
      try{localStorage.setItem("mumujinjin-ai-quiet",aiDialogueDisabled?"1":"0");}catch(e){}
      refreshAIBanter();
      if(!aiDialogueDisabled)showAIQuote("opening",true);
    });
    $("aiReplyToggle").addEventListener("click",function(){$("aiReplies").hidden=!$("aiReplies").hidden;});
    document.querySelectorAll("[data-reply]").forEach(function(b){
      b.addEventListener("click",function(){
        $("aiBanterText").textContent="你：" + b.dataset.reply + "  木：好，我记下这句话了。";
        $("aiReplies").hidden=true;
      });
    });
    ["easy","normal","hard","hell"].forEach(function(level){
      $("ai-"+level).addEventListener("click",function(){setAILevel(level);});
    });
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
      if(state.phase!=="play"||(state.playMode==="cpu"&&state.turn===1))return;
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
  initMap();refreshMapSelect();
  state.hover=null;state.notice=state.notice||"";
  try{aiDialogueDisabled=localStorage.getItem("mumujinjin-ai-quiet")==="1";}catch(e){}
  state.playMode=state.playMode==="cpu"?"cpu":"local";
  state.aiLevel=["easy","normal","hard","hell"].indexOf(state.aiLevel)>=0?state.aiLevel:"normal";
  bindEvents();drawUI();drawBoard();
  if(state.playMode==="cpu"&&state.phase==="play")showAIQuote("opening",true);
  if(state.phase==="finished"&&state.winner!==null){
    $("winTitle").textContent=NAMES[state.winner]+"获胜！";
    $("winTurns").textContent=String(state.moves);
    $("winWalls").textContent=String(state.walls.length);
    setModal("winModal",true);
  }else if(state.pending){
    $("portalIcon").textContent=PORTALS[state.pending.index].symbol;
    setModal("portalModal",true);
  }
  scheduleComputerTurn();
})();
