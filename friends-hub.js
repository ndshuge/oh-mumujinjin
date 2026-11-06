/* Friends lobby and saved-map library. Reuses the live Map V2 game API and Zhixu UI tokens. */
(function () {
  'use strict';
  var api = window.MumuMapV2;
  if (!api || !window.MumuMapCollection) return;
  var store = window.MumuMapCollection.createStore(localStorage, function (input) {
    var result = api.validate(input);
    return result.ok ? result.map : null;
  }, api.fingerprint);
  var focusReturn = null, selected = null, category = 'mine', room = null, rpsWasOpen = false;
  var $ = function (id) { return document.getElementById(id); };
  var root = document.createElement('div');
  root.id = 'mmjjHub';
  root.className = 'mmjj-hub';
  root.hidden = true;
  root.innerHTML = `
    <div class="mmjj-backdrop" data-hub-close="1"></div>
    <section class="mmjj-sheet" role="dialog" aria-modal="true" aria-label="木木金金棋地图与好友" tabindex="-1">
      <header class="mmjj-head">
        <div class="mmjj-identity"><span class="mmjj-sigil" aria-hidden="true">木</span>
          <div><strong>木木金金棋</strong><small>地图与好友</small></div></div>
        <button id="mmjjClose" class="mmjj-icon-button" type="button" aria-label="关闭">×</button>
      </header>
      <nav class="mmjj-tabs" aria-label="游戏功能">
        <button id="mmjjTabMaps" class="current" type="button" aria-selected="true">地图中心</button>
        <button id="mmjjTabRooms" type="button" aria-selected="false">好友联机</button>
      </nav>
      <div class="mmjj-scroll">
        <div id="mmjjMapsPane">
          <div class="mmjj-section-head"><div><h2>地图中心</h2><p>收藏喜欢的布局，下次点开就能使用。</p></div></div>
          <div class="mmjj-compact-form"><label for="mmjjSaveName">收藏当前地图</label><div class="mmjj-inline">
             <input id="mmjjSaveName" type="text" maxlength="40" aria-label="新地图名称" placeholder="给地图起一个名字">
             <button id="mmjjSaveCurrent" class="mmjj-primary" type="button">保存</button>
          </div></div>
          <div class="mmjj-filters" role="group" aria-label="地图分类">
            <button class="current" type="button" data-map-filter="mine">我的地图 <span id="mmjjMapCount">0</span></button>
            <button type="button" data-map-filter="official">官方预设</button>
            <button type="button" data-map-filter="random">随机地图</button>
          </div>
          <div class="mmjj-map-grid" id="mmjjMapGrid" aria-live="polite"></div>
          <section class="mmjj-detail" id="mmjjMapDetail" hidden aria-label="地图详情">
            <div class="mmjj-detail-title"><div><small>地图详情</small><h3 id="mmjjDetailName"></h3></div>
              <button type="button" id="mmjjDetailBack" class="mmjj-ghost">返回列表</button></div>
            <div class="mmjj-detail-layout"><div id="mmjjDetailPreview" class="mmjj-detail-visual"></div>
            <div class="mmjj-detail-aside"><p id="mmjjDetailInfo"></p><p id="mmjjFairNote" class="mmjj-fairnote"></p>
              <button type="button" id="mmjjUseMap" class="mmjj-primary">使用此地图</button>
              <button type="button" id="mmjjEditMap" class="mmjj-secondary">进入地图编辑器</button>
              <label for="mmjjRenameField">地图名称</label><div class="mmjj-inline"><input type="text" id="mmjjRenameField" maxlength="40"><button type="button" id="mmjjRenameMap" class="mmjj-secondary">重命名</button></div>
              <div class="mmjj-detail-aux"><button type="button" id="mmjjExportMap" class="mmjj-ghost">导出 JSON</button><button type="button" id="mmjjDeleteMap" class="mmjj-danger">删除地图</button></div>
            </div></div>
          </section>
        </div>
        <div id="mmjjRoomsPane" hidden>
          <div class="mmjj-section-head"><div><h2>好友对战</h2><p>创建房间，分享链接，两个人在不同设备上下棋。</p></div></div>
          <div id="mmjjRoomSetup" class="mmjj-room-form">
            <div class="mmjj-form-row"><label for="mmjjVariant">游戏模式</label>
              <select id="mmjjVariant"><option value="classic">经典策略</option><option value="advanced">跑道挑战</option></select></div>
            <div class="mmjj-form-row"><label for="mmjjMapSource">地图类型</label>
              <select id="mmjjMapSource"><option value="random-battle">全随机地图</option><option value="random-rocks">随机障碍</option><option value="official">官方经典地图</option><option value="saved">我的预设地图</option><option value="current">当前地图</option></select></div>
            <div id="mmjjPresetRow" class="mmjj-form-row" hidden><label for="mmjjPreset">我的地图</label><select id="mmjjPreset"></select></div>
            <div id="mmjjSelectedMapPreview" class="mmjj-room-map-preview"></div>
            <div class="mmjj-form-split">
              <div class="mmjj-form-row"><label for="mmjjSide">我选哪一边</label><select id="mmjjSide"><option value="random">随机分配</option><option value="gold">金方 · 右下角</option><option value="wood">木方 · 左上角</option></select></div>
              <div class="mmjj-form-row"><label for="mmjjFirst">先后手</label><select id="mmjjFirst"><option value="random">随机</option><option value="host">我先手</option><option value="guest">好友先手</option></select></div>
            </div>
            <button id="mmjjCreateRoom" class="mmjj-primary mmjj-large" type="button">创建好友房间</button>
            <div class="mmjj-room-divider">或者输入好友的房间码</div>
            <div class="mmjj-inline"><input id="mmjjRoomCode" type="text" maxlength="8" autocapitalize="characters" placeholder="6 位房间码" aria-label="房间码"><button type="button" id="mmjjJoinRoom" class="mmjj-secondary">加入房间</button></div>
          </div>
          <div id="mmjjRoomLive" class="mmjj-room-live" hidden>
            <div class="mmjj-room-badge">好友房间 <strong id="mmjjLiveCode"></strong></div>
            <p id="mmjjRoomState">等待另一位玩家加入</p>
            <div id="mmjjRoomPlayers" class="mmjj-room-players"></div>
            <div class="mmjj-inline"><input id="mmjjRoomLink" readonly aria-label="房间邀请链接"><button id="mmjjCopyRoom" class="mmjj-secondary">复制邀请</button></div>
            <div class="mmjj-inline"><button id="mmjjReadyRoom" class="mmjj-secondary" type="button">我已准备</button><button id="mmjjStartRoom" class="mmjj-primary" type="button">开始对局</button></div>
            <button id="mmjjLeaveRoom" class="mmjj-ghost" type="button">退出房间</button>
          </div>
          <p id="mmjjRoomNotice" class="mmjj-room-notice" role="status" aria-live="polite">房间需要联机服务；无服务时不会生成假房间。</p>
        </div>
      </div>
    </section>`;
  document.body.appendChild(root);

  var launch = document.createElement('div');
  launch.className = 'mmjj-launch-row';
  launch.innerHTML = '<button type="button" id="mmjjOpenRoom" class="mmjj-launch-primary">好友联机</button><button type="button" id="mmjjOpenMaps" class="mmjj-launch-secondary">我的地图</button>';
  var target = $('playAI');
  var group = target && target.closest('.settings-choice-group');
  if (group) group.insertBefore(launch, group.firstElementChild);
  else document.querySelector('main').prepend(launch);
  var navButton = document.createElement('button');
  navButton.id = 'mmjjNavOpen';
  navButton.className = 'mmjj-nav-open';
  navButton.type = 'button';
  navButton.textContent = '好友联机';
  var nav = document.querySelector('.header-right');
  if (nav) nav.insertBefore(navButton, nav.firstChild);

  function message(text) { $('mmjjRoomNotice').textContent = text; }
  function open(tab) {
    focusReturn = document.activeElement;
    var rps=$('rpsModal');
    rpsWasOpen=!!rps && !rps.hidden;
    if(rpsWasOpen)rps.hidden=true;
    root.hidden = false; document.body.classList.add('mmjj-hub-open');
    switchTab(tab || 'maps'); $('mmjjClose').focus();
  }
  function close() {
    root.hidden = true; document.body.classList.remove('mmjj-hub-open');
    if(rpsWasOpen && $('rpsModal'))$('rpsModal').hidden=false;
    rpsWasOpen=false;
    if (focusReturn && focusReturn.focus) focusReturn.focus();
  }
  function switchTab(tab) {
    var maps = tab === 'maps';
    $('mmjjMapsPane').hidden = !maps; $('mmjjRoomsPane').hidden = maps;
    $('mmjjTabMaps').classList.toggle('current', maps);
    $('mmjjTabRooms').classList.toggle('current', !maps);
    $('mmjjTabMaps').setAttribute('aria-selected', String(maps));
    $('mmjjTabRooms').setAttribute('aria-selected', String(!maps));
    if (maps) renderMaps(); else refreshRoomMap();
  }
  function svgMap(map) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox','0 0 90 130'); svg.setAttribute('role','img');
    svg.setAttribute('aria-label', '地图缩略图：9 列 13 行');
    function box(x,y,fill,rx) {
      var el=document.createElementNS(svg.namespaceURI,'rect');
      el.setAttribute('x',String(x)); el.setAttribute('y',String(y));
      el.setAttribute('width','9.25');el.setAttribute('height','9.25');
      el.setAttribute('rx',String(rx===undefined?1.8:rx));el.setAttribute('fill',fill);
      svg.appendChild(el);
    }
    var bg = document.createElementNS(svg.namespaceURI,'rect');
    bg.setAttribute('width','90');bg.setAttribute('height','130');bg.setAttribute('rx','5');bg.setAttribute('fill','#eaf2eb');svg.appendChild(bg);
    for(var y=0;y<13;y++)for(var x=0;x<9;x++)box(x*10+.4,y*10+.4,'#f8fcf9',1.4);
    for(var i=0;i<3;i++){box(i*10+.4,.4,'#77b999');box((6+i)*10+.4,120.4,'#e3b367');}
    function paint(layer,color){(map[layer]||[]).forEach(function(p){if(Number.isInteger(p.x)&&Number.isInteger(p.y))box(p.x*10+.4,p.y*10+.4,color);});}
    paint('rocks','#597466');paint('ice','#a3d7e3');paint('boost','#d9c96c');
    (map.portals||[]).forEach(function(portal){[portal.a,portal.b].forEach(function(p){if(p)box(p.x*10+.4,p.y*10+.4,'#ae93cd',4);});});
    return svg;
  }
  function createCard(map, label, action) {
    var btn = document.createElement('button');
    btn.className='mmjj-map-card';btn.type='button';
    var scene=document.createElement('span');scene.className='mmjj-map-thumb';scene.appendChild(svgMap(map));btn.appendChild(scene);
    var name=document.createElement('strong');name.textContent=map.name;btn.appendChild(name);
    var meta=document.createElement('span');meta.className='mmjj-map-meta';
    meta.textContent=label+' · '+(map.rocks||[]).length+' 处障碍';btn.appendChild(meta);
    btn.addEventListener('click',action);return btn;
  }
  function renderMaps() {
    $('mmjjMapDetail').hidden = true;
    var list=store.list();$('mmjjMapCount').textContent=String(list.length);
    var container=$('mmjjMapGrid');container.replaceChildren();
    document.querySelectorAll('[data-map-filter]').forEach(function(btn){
      btn.classList.toggle('current',btn.dataset.mapFilter===category);
    });
    if(category==='mine'){
      if(!list.length){var empty=document.createElement('p');empty.className='mmjj-empty';empty.textContent='还没有收藏地图。可以先生成随机地图，再将它保存到这里。';container.appendChild(empty);}
      list.forEach(function(map){container.appendChild(createCard(map,'我的预设',function(){showDetail(map,'mine');}));});
    }else if(category==='official'){
      var classic=api.official();
      container.appendChild(createCard(classic,'官方预设',function(){showDetail(classic,'official');}));
    }else{
      var current=api.get();
      container.appendChild(createCard(Object.assign({},current,{name:'生成新的随机地图'}),'随机生成',function(){
        try{
          var generated=api.generateBalanced((Date.now()^Math.floor(Math.random()*4294967296))>>>0);
          showDetail(generated,'random');
        }catch(error){window.alert(error.message||'随机地图生成失败');}
      }));
    }
    $('mmjjSaveName').value = api.get().name === '随机棋盘' ? '我的随机地图' : api.get().name;
    refreshPresetSelect();
  }
  function showDetail(map, origin) {
    selected={map:map, origin:origin, id: origin==='mine' ? store.identity(map):null};
    $('mmjjMapDetail').hidden=false;
    $('mmjjDetailName').textContent=map.name;
    $('mmjjDetailPreview').replaceChildren(svgMap(map));
    $('mmjjRenameField').value=map.name;
    $('mmjjDetailInfo').textContent='9 × 13 · '+map.rocks.length+' 处障碍 · '+(map.portals||[]).length+' 对传送门';
    var fair=api.auditFair(map);
    $('mmjjFairNote').textContent=fair.ok?'通过竞技公平性检查':'仅供地图研究：'+(fair.reason||'未通过公平性检查');
    $('mmjjUseMap').disabled=!fair.ok;
    $('mmjjEditMap').hidden=origin==='random';
    $('mmjjRenameField').disabled=origin!=='mine';$('mmjjRenameMap').hidden=origin!=='mine';
    $('mmjjDeleteMap').hidden=origin!=='mine';
    $('mmjjMapDetail').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function clickGame(id) {var btn=$(id);if(btn)btn.click();}
  function useSaved(map, editor) {
    var id=store.identity(map), select=$('savedMaps');
    if($('mapEditor').hidden) clickGame('mapEditorButton');
    if($('mapEditor').hidden) return false;
    refreshNativeSelect();
    select.value=id;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    if(!editor) clickGame('editorPlay');
    return true;
  }
  function refreshNativeSelect(){
    var select=$('savedMaps');if(!select)return;
    var prev=select.value;select.replaceChildren(new Option('选择已保存地图',''));
    store.list().forEach(function(map){select.add(new Option(map.name,store.identity(map)));});
    select.value=prev;
  }
  function useMap(){
    if(!selected)return;
    if(!api.installFromLibrary(selected.map)){
      window.alert('这张地图目前无法使用，请检查地图合法性与公平性。');
      return;
    }
    if(window.MumuLobby&&window.MumuLobby.hide)window.MumuLobby.hide();
    close();
    var board=$('board');if(board)board.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function saveCurrent() {
    try{
      var map=api.get(); map.name=$('mmjjSaveName').value.trim().slice(0,40);
      store.save(map); refreshNativeSelect();category='mine';renderMaps();
    }catch(e){window.alert(e.message||'地图保存失败');}
  }
  function rename(){
    if(!selected||selected.origin!=='mine')return;
    try{var map=store.rename(selected.id,$('mmjjRenameField').value);
      selected={map:map,id:store.identity(map),origin:'mine'};refreshNativeSelect();
      showDetail(map,'mine');$('mmjjDetailName').textContent=map.name;
    }catch(e){window.alert(e.message||'重命名失败');}
  }
  function deleteMap(){
    if(!selected||selected.origin!=='mine')return;
    if(!window.confirm('确定删除“'+selected.map.name+'”？此操作不可撤销。'))return;
    store.remove(selected.id);selected=null;refreshNativeSelect();renderMaps();
  }
  function exportMap(){
    if(!selected)return;
    var data=JSON.stringify(selected.map,null,2);
    var url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
    var link=document.createElement('a');link.href=url;link.download='mmjj-map.json';link.click();
    setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }
  function refreshPresetSelect(){
    var selectedId=$('mmjjPreset').value;
    $('mmjjPreset').replaceChildren();
    store.list().forEach(function(map){$('mmjjPreset').add(new Option(map.name,store.identity(map)));});
    if(selectedId)$('mmjjPreset').value=selectedId;
  }
  function resolveRoomMap(){
    var src=$('mmjjMapSource').value;
    if(src==='saved'){
      return store.list().find(function(map){return store.identity(map)===$('mmjjPreset').value;})||null;
    }
    if(src==='current')return api.get();
    if(src==='official')return api.official();
    return null;
  }
  function refreshRoomMap(){
    refreshPresetSelect();
    var src=$('mmjjMapSource').value;
    $('mmjjPresetRow').hidden=src!=='saved';
    var preview=$('mmjjSelectedMapPreview');preview.replaceChildren();
    var map=resolveRoomMap();
    if(src==='saved'&&!map){preview.textContent='没有可用的收藏地图，请先到地图中心保存。';return;}
    if(map){
      var badge=document.createElement('span');badge.className='mmjj-room-map-thumb';badge.appendChild(svgMap(map));
      var txt=document.createElement('div');var strong=document.createElement('strong');strong.textContent=map.name;
      var small=document.createElement('small');small.textContent='将使用地图数据快照，房间开始后不可修改。';
      txt.append(strong,small);preview.append(badge,txt);
    }else{
      preview.textContent=src==='official'?'将使用标准经典地图。':'双方将共享服务器生成或确认的同一份随机地图。';
    }
  }
  function roomSettings(){
    var src=$('mmjjMapSource').value;
    var map=resolveRoomMap();
    if(src==='random-battle')map=api.generateBalanced((Date.now()^Math.floor(Math.random()*4294967296))>>>0);
    if(src==='random-rocks')map=api.generateRandomRocks((Date.now()^Math.floor(Math.random()*4294967296))>>>0);
    if(src==='saved'&&!map)throw Error('请先选择一张已保存地图');
    if(map){
      var valid=api.validate(map);
      if(!valid.ok)throw Error(valid.reason||'地图不合法');
      var fair=api.auditFair(map);
      if(!fair.ok && src!=='official')throw Error('该地图未通过竞技公平性检查：'+fair.reason);
    }
    return {variant:$('mmjjVariant').value,mapSource:src,map:JSON.parse(JSON.stringify(map)),side:$('mmjjSide').value,first:$('mmjjFirst').value};
  }
  function setRoomInfo(data){
    room=data;
    $('mmjjRoomSetup').hidden=true;$('mmjjRoomLive').hidden=false;
    $('mmjjLiveCode').textContent=data.code;
    $('mmjjRoomLink').value=location.origin+location.pathname+'?room='+encodeURIComponent(data.code);
    $('mmjjRoomState').textContent=data.state||'等待好友加入';
    $('mmjjRoomPlayers').textContent=data.playerText||'房主已加入 · 等待好友';
    $('mmjjReadyRoom').disabled=!data.readyAllowed;
    $('mmjjReadyRoom').textContent=data.isReady?'取消准备':'我已准备';
    $('mmjjStartRoom').disabled=!data.startAllowed;
  }
  function resetRoom(){
    room=null;$('mmjjRoomSetup').hidden=false;$('mmjjRoomLive').hidden=true;
    message('房间需要联机服务；无服务时不会生成假房间。');
  }
  function transport(){
    return window.MumuFriendRooms && window.MumuFriendRooms.createClient
      ? window.MumuFriendRooms.createClient() : null;
  }
  var client=null;
  function onRoomEvent(event){
    if(event.type==='error'){
      message(event.message);
      if(window.MumuOnline&&window.MumuOnline.reject)window.MumuOnline.reject(event.message);
      return;
    }
    if(event.type==='reconnecting'){
      $('mmjjReadyRoom').disabled=true;
      $('mmjjStartRoom').disabled=true;message('连接中断，正在自动重新连接…');return;}
    if(event.type==='connected'){message('房间连接已恢复。');return;}
    if(event.type==='close'){
      message('连接已断开，可以使用房间码重新加入。');
      if(window.MumuOnline)window.MumuOnline.stop();
      return;
    }
    if(event.type==='state'){
      var data=event.room;
      setRoomInfo({code:data.code,state:data.status==='playing'?'对局进行中':data.status==='ready'?'双方已就绪':'等待玩家准备',
        playerText:(data.players||[]).map(function(p,i){return (i===0?'房主':'好友')+'：'+(p.connected?'在线':'未连接')+(p.ready?' · 已准备':'');}).join('　'),
        readyAllowed:data.status!=='playing'&&!!(data.players||[])[event.owner?0:1]?.connected,
        startAllowed:!!event.owner&&data.status==='ready',
        isReady:!!(data.players||[])[event.owner?0:1]?.ready});
      message('房间设置与地图将以服务器状态为准。');
    }
    if(event.type==='started') {
      if(window.MumuLobby&&window.MumuLobby.hide)window.MumuLobby.hide();
      rpsWasOpen=false;
      message('双方已准备，房间正式开始。');
      if(window.MumuOnline&&window.MumuOnline.start)window.MumuOnline.start(event);
      close();
    }
    if(event.type==='action'&&window.MumuOnline&&window.MumuOnline.apply)window.MumuOnline.apply(event);
    if(event.type==='state'&&event.room.status==='playing'&&window.MumuOnline&&window.MumuOnline.sync)
      window.MumuOnline.sync(event.room.game,event.room.revision);
  }
  async function createRoom(){
    try{
      var settings=roomSettings(); client=transport();
      if(!client)throw Error('联机客户端未加载');
      var data=await client.create(settings,onRoomEvent);
      setRoomInfo({code:data.code,readyAllowed:false,startAllowed:false});
      message('房间已创建，可以复制邀请链接。');
    }catch(e){message(e.message||'创建房间失败');}
  }
  async function joinRoom(){
    try{
      var code=$('mmjjRoomCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
      if(!/^[A-Z0-9]{6}$/.test(code))throw Error('请输入有效的 6 位房间码');
      client=transport();if(!client)throw Error('联机客户端未加载');
      var data=await client.join(code,onRoomEvent);
      setRoomInfo({code:data.code,readyAllowed:false,startAllowed:false});
      message('已加入，等待双方准备。');
    }catch(e){message(e.message||'加入失败');}
  }
  $('mmjjClose').addEventListener('click',close);
  root.querySelector('[data-hub-close]').addEventListener('click',close);
  root.addEventListener('keydown',function(e){
    if(e.key==='Escape'){e.stopPropagation();close();}
    if(e.key==='Tab'){
      var focusable=[].slice.call(root.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled])')).filter(function(x){return x.getClientRects().length>0;});
      if(!focusable.length)return;
      if(e.shiftKey&&document.activeElement===focusable[0]){e.preventDefault();focusable[focusable.length-1].focus();}
      else if(!e.shiftKey&&document.activeElement===focusable[focusable.length-1]){e.preventDefault();focusable[0].focus();}
    }
  });
  $('mmjjOpenRoom').addEventListener('click',function(){open('rooms');});
  $('mmjjOpenMaps').addEventListener('click',function(){open('maps');});
  navButton.addEventListener('click',function(){open('rooms');});
  $('mmjjTabMaps').addEventListener('click',function(){switchTab('maps');});
  $('mmjjTabRooms').addEventListener('click',function(){switchTab('rooms');});
  document.querySelectorAll('[data-map-filter]').forEach(function(btn){btn.addEventListener('click',function(){category=btn.dataset.mapFilter;renderMaps();});});
  $('mmjjSaveCurrent').addEventListener('click',saveCurrent);
  $('mmjjDetailBack').addEventListener('click',function(){$('mmjjMapDetail').hidden=true;});
  $('mmjjUseMap').addEventListener('click',useMap);
  $('mmjjRenameMap').addEventListener('click',rename);
  $('mmjjDeleteMap').addEventListener('click',deleteMap);
  $('mmjjExportMap').addEventListener('click',exportMap);
  $('mmjjEditMap').addEventListener('click',function(){
    if(selected && selected.origin==='mine'&&useSaved(selected.map,true)){close();$('board').scrollIntoView({behavior:'smooth'});}
    else if(selected&&selected.origin==='official'){close();clickGame('mapEditorButton');}
  });
  $('mmjjMapSource').addEventListener('change',refreshRoomMap);
  $('mmjjPreset').addEventListener('change',refreshRoomMap);
  $('mmjjCreateRoom').addEventListener('click',createRoom);
  $('mmjjJoinRoom').addEventListener('click',joinRoom);
  $('mmjjReadyRoom').addEventListener('click',function(){
    if(client)try{client.ready();}catch(e){message(e.message);}
  });
  $('mmjjStartRoom').addEventListener('click',function(){
    if(client)try{client.start();}catch(e){message(e.message);}
  });
  function leaveRoom(){
    if(client)client.close();
    client=null;
    if(window.MumuOnline&&window.MumuOnline.active&&window.MumuOnline.active())window.MumuOnline.stop();
    resetRoom();
  }
  $('mmjjLeaveRoom').addEventListener('click',leaveRoom);
  $('mmjjCopyRoom').addEventListener('click',async function(){
    try{await navigator.clipboard.writeText($('mmjjRoomLink').value);message('邀请链接已复制。');}
    catch(_){$('mmjjRoomLink').select();message('请手动复制邀请链接。');}
  });
  // Initial AI opponent selection is a modal. Make multiplayer and maps reachable
  // before the first rock-paper-scissors choice; restore it when the hub closes.
  var rpsDialog=$('rpsModal')&&$('rpsModal').querySelector('.modal-dialog');
  if(rpsDialog){
    var shortcuts=document.createElement('div');
    shortcuts.className='mmjj-rps-shortcuts';
    shortcuts.innerHTML='<button type="button" id="rpsShortcutFriends">好友联机</button><button type="button" id="rpsShortcutMaps">地图中心</button>';
    rpsDialog.appendChild(shortcuts);
    $('rpsShortcutFriends').addEventListener('click',function(){open('rooms');});
    $('rpsShortcutMaps').addEventListener('click',function(){open('maps');});
  }
  var code=new URL(location.href).searchParams.get('room');
  if(code){$('mmjjRoomCode').value=code.toUpperCase();open('rooms');message('收到好友邀请，点击加入房间即可连接。');}
  window.MumuFriendsUI=Object.freeze({
    open:open,store:store,leave:leaveRoom,
    isPlaying:function(){return !!(window.MumuOnline&&window.MumuOnline.active&&window.MumuOnline.active());}
  });
})();
