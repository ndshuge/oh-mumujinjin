/* First-screen game lobby. Built from the existing Mumu game and Zhixu V5 UI language. */
(function () {
  'use strict';
  if (!window.MumuMapV2 || !window.MumuLobbyGame) return;
  var api=window.MumuMapV2,game=window.MumuLobbyGame;
  var activeMode='cpu',visible=false,createdPreview=null;
  var $=function(id){return document.getElementById(id);};
  var root=document.createElement('div');
  root.id='mmjjLobby';root.className='mmjj-lobby';root.hidden=true;
  root.innerHTML=`
    <div class="mmjj-lobby-shell">
      <header class="mmjj-lobby-header">
        <div class="mmjj-lobby-brand"><span class="mmjj-lobby-logo" aria-hidden="true">木</span>
          <div><strong>木木金金棋</strong><small>THE ART OF EVERY MOVE</small></div></div>
        <button id="mmjjLobbyInfo" type="button" class="mmjj-lobby-text-btn" aria-label="查看游戏玩法">玩法说明 ↗</button>
      </header>
      <main class="mmjj-lobby-content">
        <div class="mmjj-lobby-intro"><p class="mmjj-lobby-kicker"><span class="mmjj-dot"></span> ORIGINAL STRATEGY BOARD GAME</p>
           <h1>开始一场<span>好棋。</span></h1>
           <p class="mmjj-lobby-subtitle">选择对手，定下战场。接下来的每一步，由你决定。</p>
        </div>
        <div class="mmjj-lobby-columns">
          <section class="mmjj-mode-column" aria-label="选择对战方式">
            <h2>选择玩法 <small>PLAY</small></h2>
            <div class="mmjj-mode-cards">
              <button type="button" class="mmjj-mode-card selected" id="mmjjModeAI" data-mode="cpu" aria-pressed="true">
                <span class="mmjj-mode-icon mmjj-ai-icon"><img src="./xiaoke-clawd.svg" alt=""></span>
                <span class="mmjj-mode-description"><strong>挑战小克 <em>推荐</em></strong><small>与本地最强 AI 交锋，磨练战术。</small></span>
                <span class="mmjj-card-chevron" aria-hidden="true">›</span>
              </button>
              <button type="button" class="mmjj-mode-card" id="mmjjModeFriends" data-mode="friends" aria-pressed="false">
                <span class="mmjj-mode-icon mmjj-friends-icon" aria-hidden="true">↗</span>
                <span class="mmjj-mode-description"><strong>好友联机</strong><small>创建私人房间，邀请好友实时下棋。</small></span>
                <span class="mmjj-card-chevron" aria-hidden="true">›</span>
              </button>
              <button type="button" class="mmjj-mode-card" id="mmjjModeLocal" data-mode="local" aria-pressed="false">
                <span class="mmjj-mode-icon mmjj-local-icon" aria-hidden="true">Ⅱ</span>
                <span class="mmjj-mode-description"><strong>本地双人</strong><small>同一台设备，面对面轮流落子。</small></span>
                <span class="mmjj-card-chevron" aria-hidden="true">›</span>
              </button>
              <button type="button" class="mmjj-mode-card" id="mmjjModeMaps" data-mode="maps" aria-pressed="false">
                <span class="mmjj-mode-icon mmjj-maps-icon" aria-hidden="true">▦</span>
                <span class="mmjj-mode-description"><strong>地图中心</strong><small>编辑战场，收藏并命名自己的地图。</small></span>
                <span class="mmjj-card-chevron" aria-hidden="true">›</span>
              </button>
            </div>
            <div class="mmjj-lobby-hint">公平随机地图 · 9 × 13 棋盘 · 浏览器即玩</div>
          </section>
          <section class="mmjj-config-column" aria-label="开局配置">
            <div class="mmjj-lobby-panel-head"><div><small>QUICK MATCH</small><h2>开局配置</h2></div><span class="mmjj-config-badge">01 / 02</span></div>
            <label class="mmjj-lobby-label" for="mmjjLobbyVariant">游戏模式</label>
            <div class="mmjj-lobby-segments" role="group" aria-label="游戏模式">
               <button type="button" class="selected" id="mmjjLobbyClassic" data-variant="classic" aria-pressed="true">经典策略</button>
               <button type="button" id="mmjjLobbyAdvanced" data-variant="advanced" aria-pressed="false">进阶地形</button>
            </div>
            <label class="mmjj-lobby-label" for="mmjjLobbyMapSource">选择地图</label>
            <select id="mmjjLobbyMapSource">
               <option value="random-battle">公平随机战场</option><option value="random-rocks">随机障碍</option>
               <option value="official">官方经典地图</option><option value="saved">我的预设地图</option>
            </select>
            <div id="mmjjLobbyPresetRow" hidden><label class="mmjj-lobby-label" for="mmjjLobbySavedSelect">我的地图</label>
              <select id="mmjjLobbySavedSelect"></select></div>
            <div class="mmjj-lobby-preview" id="mmjjLobbyPreview">
              <div class="mmjj-lobby-preview-board" id="mmjjLobbyMapThumb" aria-label="地图缩略预览"></div>
              <div class="mmjj-lobby-preview-copy"><span>当前地图</span><strong id="mmjjLobbyMapName">正在准备地图</strong>
                <small id="mmjjLobbyMapStat">公平性检查通过后可以开局</small>
                <button type="button" id="mmjjLobbyReroll" class="mmjj-lobby-reroll">换一张地图 ↻</button>
              </div>
            </div>
            <p id="mmjjLobbyFeedback" role="status" class="mmjj-lobby-feedback" aria-live="polite"></p>
            <button type="button" id="mmjjLobbyStart" class="mmjj-lobby-start">挑战小克 <span aria-hidden="true">→</span></button>
            <button type="button" id="mmjjLobbyResume" class="mmjj-lobby-resume" hidden>继续上一次对局</button>
          </section>
        </div>
      </main>
      <footer class="mmjj-lobby-footer"><span>木木金金棋 · 2026</span><span>走棋 · 筑墙 · 传送 · 探索</span></footer>
    </div>
  `;
  document.body.appendChild(root);
  var nav=document.querySelector('.header-right');
  if(nav){
    var home=document.createElement('button');
    home.id='mmjjBackToLobby';home.className='mmjj-back-home';
    home.type='button';home.textContent='游戏大厅';nav.insertBefore(home,nav.firstChild);
    home.addEventListener('click',show);
  }
  var previewBoard=$('mmjjLobbyMapThumb'),currentMap=null,currentVariant='classic',generationToken=0;
  function miniature(map){
    var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 90 130');svg.setAttribute('role','img');
    svg.setAttribute('aria-label',map.name+' 的棋盘预览');
    function rectangle(x,y,fill,rad){
      var item=document.createElementNS(svg.namespaceURI,'rect');
      item.setAttribute('x',x);item.setAttribute('y',y);
      item.setAttribute('width',9.25);item.setAttribute('height',9.25);
      item.setAttribute('rx',rad||1.8);item.setAttribute('fill',fill);svg.appendChild(item);
    }
    for(var y=0;y<13;y++)for(var x=0;x<9;x++)rectangle(x*10+.4,y*10+.4,'#f2f7f3',1.3);
    for(var i=0;i<3;i++){rectangle(i*10+.4,.4,'#7ab999',2);rectangle((i+6)*10+.4,120.4,'#e3b66e',2);}
    function draw(type,fill){(map[type]||[]).forEach(function(p){rectangle(p.x*10+.4,p.y*10+.4,fill,2);});}
    draw('rocks','#536e5f');draw('ice','#9bcad7');draw('boost','#d9c36a');
    (map.portals||[]).forEach(function(g){[g.a,g.b].forEach(function(p){rectangle(p.x*10+.4,p.y*10+.4,'#b59ace',4);});});
    return svg;
  }
  function feedback(text){$('mmjjLobbyFeedback').textContent=text||'';}
  function displayMap(map){
    currentMap=map;previewBoard.replaceChildren(miniature(map));
    $('mmjjLobbyMapName').textContent=map.name;
    var fair=api.auditFair(map);
    $('mmjjLobbyMapStat').textContent=(map.rocks||[]).length+' 个障碍 · '+(map.portals||[]).length+' 对传送门 · '+(fair.ok?'公平验证通过':'未通过公平验证');
    $('mmjjLobbyStart').disabled=!fair.ok;
    feedback(fair.ok?'':fair.reason||'地图不符合公平性要求');
  }
  function libraryMaps(){return window.MumuFriendsUI?window.MumuFriendsUI.store.list():[];}
  function fillSelect(){
    var select=$('mmjjLobbySavedSelect'),past=select.value;
    select.replaceChildren();
    libraryMaps().forEach(function(map){select.add(new Option(map.name,api.fingerprint(map)));});
    if(past)select.value=past;
  }
  function refreshMap(recreate){
    var src=$('mmjjLobbyMapSource').value,reroll=$('mmjjLobbyReroll');
    fillSelect();$('mmjjLobbyPresetRow').hidden=src!=='saved';
    reroll.hidden=!['random-battle','random-rocks'].includes(src);
    feedback('');
    if(src==='saved'){
      var selected=libraryMaps().find(function(map){return api.fingerprint(map)===$('mmjjLobbySavedSelect').value;});
      if(!selected){
        currentMap=null;previewBoard.replaceChildren();
        $('mmjjLobbyMapName').textContent='还没有收藏地图';
        $('mmjjLobbyMapStat').textContent='请先去地图中心保存一张地图';
        $('mmjjLobbyStart').disabled=true;
      }else displayMap(selected);
      return;
    }
    if(src==='official'){displayMap(api.official());return;}
    if(!recreate&&createdPreview&&createdPreview.type===src){displayMap(createdPreview.map);return;}
    var token=++generationToken;
    $('mmjjLobbyMapName').textContent='生成公平地图中…';
    $('mmjjLobbyMapStat').textContent='正在检查双方出生点和路径';
    $('mmjjLobbyStart').disabled=true;
    // Schedule generation after painting so slower devices still show feedback.
    setTimeout(function(){
      if(token!==generationToken || $('mmjjLobbyMapSource').value!==src)return;
      try{
        var seed=(Date.now()^Math.floor(Math.random()*4294967296))>>>0;
        var map=src==='random-rocks'?api.generateRandomRocks(seed):api.generateBalanced(seed);
        createdPreview={type:src,map:map};displayMap(map);
      }catch(e){feedback(e.message||'地图生成失败，请重试');}
    },20);
  }
  function setOpponent(mode){
    if(mode==='friends'){
      if(window.MumuFriendsUI)window.MumuFriendsUI.open('rooms');
      return;
    }
    if(mode==='maps'){
      if(window.MumuFriendsUI)window.MumuFriendsUI.open('maps');
      return;
    }
    activeMode=mode;
    document.querySelectorAll('#mmjjLobby [data-mode]').forEach(function(button){
      var selected=button.dataset.mode===mode;
      button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
    });
    $('mmjjLobbyStart').firstChild.nodeValue=mode==='cpu'?'挑战小克 ':'开始本地双人 ';
  }
  function setVariant(value){
    currentVariant=value;
    document.querySelectorAll('#mmjjLobby [data-variant]').forEach(function(button){
      var selected=button.dataset.variant===value;
      button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
    });
  }
  function hide(){visible=false;root.hidden=true;document.body.classList.remove('mmjj-lobby-open');}
  function show(){
    if(window.MumuFriendsUI&&window.MumuFriendsUI.isPlaying()){
      if(!window.confirm('离开好友对局并返回游戏大厅？'))return;
      window.MumuFriendsUI.leave();
    }
    visible=true;root.hidden=false;document.body.classList.add('mmjj-lobby-open');
    var info=game.info();$('mmjjLobbyResume').hidden=!(info.moves>0 && info.phase!=='finished');
    refreshMap(false);
  }
  function begin(){
    if(!currentMap){feedback('请先选择或生成地图');return;}
    var selectedMap=JSON.parse(JSON.stringify(currentMap));
    var result=game.start({map:selectedMap,variant:currentVariant,opponent:activeMode});
    if(!result.ok){feedback(result.reason||'无法开始对局');return;}
    hide();
    if(activeMode==='cpu'&&$('rpsModal'))$('rpsModal').hidden=false;
  }
  function resume(){
    var result=game.resume();if(!result.ok){feedback('当前没有可恢复的对局');return;}
    hide();if($('rpsModal')&&game.info().phase==='rps')$('rpsModal').hidden=false;
  }
  document.querySelectorAll('#mmjjLobby [data-mode]').forEach(function(b){b.addEventListener('click',function(){setOpponent(b.dataset.mode);});});
  document.querySelectorAll('#mmjjLobby [data-variant]').forEach(function(b){b.addEventListener('click',function(){setVariant(b.dataset.variant);});});
  $('mmjjLobbyMapSource').addEventListener('change',function(){createdPreview=null;refreshMap(true);});
  $('mmjjLobbySavedSelect').addEventListener('change',function(){refreshMap(false);});
  $('mmjjLobbyReroll').addEventListener('click',function(){refreshMap(true);});
  $('mmjjLobbyStart').addEventListener('click',begin);
  $('mmjjLobbyResume').addEventListener('click',resume);
  $('mmjjLobbyInfo').addEventListener('click',function(){
    hide();var button=$('helpTop');if(button)button.click();
  });
  window.MumuLobby=Object.freeze({show:show,hide:hide,isVisible:function(){return visible;}});
  // Always land on the lobby, including for invited friends (room hub opens above).
  show();
})();
