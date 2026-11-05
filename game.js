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
  var DEFAULT_PORTALS = [
    {id:"portal-1",symbol:"△",name:"三角之门",a:{x:5,y:2},b:{x:2,y:5}},
    {id:"portal-2",symbol:"✦",name:"星辉之门",a:{x:6,y:4},b:{x:1,y:11}},
    {id:"portal-3",symbol:"○",name:"圆环之门",a:{x:8,y:6},b:{x:3,y:8}}
  ];
  var DEFAULT_ICE = [{x:1,y:6},{x:1,y:7},{x:1,y:8},{x:7,y:7},{x:7,y:8}];
  var DEFAULT_BOOST = [{x:4,y:3},{x:4,y:4},{x:6,y:10},{x:7,y:10}];
  var ROCKS = DEFAULT_ROCKS.map(function(p){return {x:p.x,y:p.y};});
  var PORTALS = DEFAULT_PORTALS.map(function(g){return {id:g.id,symbol:g.symbol,name:g.name,a:{x:g.a.x,y:g.a.y},b:{x:g.b.x,y:g.b.y}};});
  var ICE = DEFAULT_ICE.map(function(p){return {x:p.x,y:p.y};});
  var BOOST = DEFAULT_BOOST.map(function(p){return {x:p.x,y:p.y};});
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
  function aiOpponentName(){return state.aiLevel==="zhongdi"?"中迪":state.aiLevel==="xiaodi"?"小迪":state.aiLevel==="hell"?"小白":state.aiLevel==="normal"?"中级":"AI";}
  function refreshAIBanter(){
    var box=$("aiBanter");if(!box)return;
    box.hidden=state.playMode!=="cpu"||editing||aiDialogueDisabled;
    $("aiQuiet").textContent=aiDialogueDisabled?"开启对话":"安静模式";
    $("aiReplyToggle").hidden=aiDialogueDisabled;
  }
  // Map V2: a single active terrain snapshot is projected to all legacy rule readers.
  var RULES_VERSION="map-v2-r1", GENERATOR_VERSION="mapgen-v2-r1";
  var MAP_KEY="mumujinjin-custom-maps-v2", LEGACY_MAP_KEY="mumujinjin-custom-maps-v1";
  var ACTIVE_KEY="mumujinjin-active-map-v2", LEGACY_ACTIVE_KEY="mumujinjin-active-map-v1";
  var editing=false,editorTool="add",editorName="我的地图",editorRocks=null,editorMap=null;
  var editorUndo=[],editorRedo=[],editorSelection=null,editorPendingPortal=null;
  var activeMap=null,savedGameMap=null,savedGameHash=null,mapMode="default";
  var MODE_KEY="mumujinjin-layout-mode-v2";
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function defaultMap(){
    return {version:2,rulesVersion:RULES_VERSION,generatorVersion:GENERATOR_VERSION,name:"经典地图",seed:null,
      rocks:copy(DEFAULT_ROCKS),portals:copy(DEFAULT_PORTALS),ice:copy(DEFAULT_ICE),boost:copy(DEFAULT_BOOST)};
  }
  function normalizeMap(input){
    if(!input||typeof input!=="object"||(input.version!==1&&input.version!==2))return null;
    if(typeof input.name!=="string"||!Array.isArray(input.rocks))return null;
    if(input.version===2&&(!Array.isArray(input.portals)||!Array.isArray(input.ice)||!Array.isArray(input.boost)))return null;
    var base=input.version===1?defaultMap():input;
    return {version:2,rulesVersion:input.version===1?RULES_VERSION:base.rulesVersion,
      generatorVersion:input.version===1?GENERATOR_VERSION:(base.generatorVersion||GENERATOR_VERSION),
      name:input.name.trim().slice(0,40)||"自定义地图",
      seed:input.version===1?null:(base.seed===undefined?null:base.seed),
      generation:input.version===1?null:(base.generation||null),
      rocks:copy(input.rocks),portals:copy(base.portals),ice:copy(base.ice),boost:copy(base.boost)};
  }
  function pointOk(p){return p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&inside(p);}
  function terrainApply(m){
    ROCKS=copy(m.rocks);PORTALS=copy(m.portals).map(function(g,i){
      g.symbol=["△","✦","○","◇","◎","⬡","◈","⊙"][i%8];g.name="传送门 "+(i+1);return g;});
    ICE=copy(m.ice);BOOST=copy(m.boost);
  }
  function validateMap(input){
    var m=normalizeMap(input);
    function bad(code,reason,cells){return {ok:false,code:code,reason:reason,cells:cells||[]};}
    if(!m)return bad("schema","地图格式无效：需要完整的 V2 地形数组，或有效的 V1 障碍列表。");
    if(m.rulesVersion!==RULES_VERSION)return bad("rules","规则版本不兼容。");
    if(m.seed!==null&&(!Number.isInteger(m.seed)||m.seed<0||m.seed>4294967295))return bad("seed","种子必须是 0 到 4294967295 的整数。");
    if(m.rocks.length>90||m.portals.length>8||m.ice.length>80||m.boost.length>80)return bad("limit","地图元素超过安全限制。");
    var occupied=new Set(),ids=new Set(),groups=[["障碍",m.rocks],["冰面",m.ice],["加速格",m.boost]];
    for(var j=0;j<m.portals.length;j++){
      var gate=m.portals[j];
      if(!gate||typeof gate.id!=="string"||!gate.id||gate.id.length>48||ids.has(gate.id))
        return bad("portal-id","传送门编号缺失或重复。");
      ids.add(gate.id);
      if(!pointOk(gate.a)||!pointOk(gate.b))return bad("portal-pair","传送门尚未完成配对，或端点越界。",[gate.a,gate.b].filter(pointOk));
      if(same(gate.a,gate.b))return bad("portal-self","传送门不能连接自身。",[gate.a]);
      groups.push(["传送门", [gate.a,gate.b]]);
    }
    for(var k=0;k<groups.length;k++){
      var label=groups[k][0],arr=groups[k][1];
      for(var i=0;i<arr.length;i++){
        var p=arr[i];
        if(!pointOk(p))return bad("coordinates",label+"存在无效坐标。",[p].filter(pointOk));
        if(CAMPS.some(function(c){return has(c,p);}))return bad("camp",label+"与固定营地冲突。",[p]);
        var key=posKey(p);
        if(occupied.has(key))return bad("overlap",label+"与其他地形重叠。",[p]);
        occupied.add(key);
      }
    }
    // Use the exact authoritative rules, including portal arrival choice and ice heading.
    var prev={rocks:ROCKS,portals:PORTALS,ice:ICE,boost:BOOST,variant:state&&state.variant};
    try{
      terrainApply(m);
      for(var v=0;v<2;v++){
        if(state)state.variant=v?"advanced":"classic";
        for(var player=0;player<2;player++){
          for(var start=0;start<3;start++){
            var s=CAMPS[player][start];
            if(!findPath(s,CAMPS[1-player],[],null))
              return bad("unreachable",(v?"进阶":"经典")+"模式下"+NAMES[player]+"起点无法抵达目标营地。",[s]);
          }
        }
      }
    }finally{
      ROCKS=prev.rocks;PORTALS=prev.portals;ICE=prev.ice;BOOST=prev.boost;
      if(state)state.variant=prev.variant;
    }
    return {ok:true,map:m,reason:"地图合法：全部出生点在两种模式下均可到达目标。"};
  }
  function cleanMap(input){var r=validateMap(input);return r.ok?r.map:null;}
  // Synchronous SHA-256 over ASCII canonical JSON (all identity fields are ASCII).
  function sha256(s){
    var primes=[],n=2;
    while(primes.length<64){var prime=true;for(var d=2;d*d<=n;d++){if(n%d===0){prime=false;break;}}if(prime)primes.push(n);n++;}
    var k=primes.map(function(x){return (Math.pow(x,1/3)%1*4294967296)>>>0;});
    var h=primes.slice(0,8).map(function(x){return (Math.sqrt(x)%1*4294967296)>>>0;});
    var bytes=[];for(var i=0;i<s.length;i++)bytes.push(s.charCodeAt(i));
    var len=bytes.length*8;bytes.push(128);while(bytes.length%64!==56)bytes.push(0);
    var high=Math.floor(len/4294967296),low=len>>>0;
    for(var b=3;b>=0;b--)bytes.push((high>>>(b*8))&255);
    for(var b=3;b>=0;b--)bytes.push((low>>>(b*8))&255);
    function rr(x,t){return (x>>>t)|(x<<(32-t));}
    for(var off=0;off<bytes.length;off+=64){
      var w=new Array(64);
      for(var t=0;t<16;t++){var ix=off+t*4;w[t]=((bytes[ix]<<24)|(bytes[ix+1]<<16)|(bytes[ix+2]<<8)|bytes[ix+3])>>>0;}
      for(var t=16;t<64;t++){var a=w[t-15],z=w[t-2];w[t]=(w[t-16]+(rr(a,7)^rr(a,18)^(a>>>3))+w[t-7]+(rr(z,17)^rr(z,19)^(z>>>10)))>>>0;}
      var a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
      for(var t=0;t<64;t++){
        var s1=rr(e,6)^rr(e,11)^rr(e,25),ch=(e&f)^(~e&g);
        var temp1=(hh+s1+ch+k[t]+w[t])>>>0;
        var s0=rr(a,2)^rr(a,13)^rr(a,22),maj=(a&b)^(a&c)^(b&c);
        var temp2=(s0+maj)>>>0;
        hh=g;g=f;f=e;e=(d+temp1)>>>0;d=c;c=b;b=a;a=(temp1+temp2)>>>0;
      }
      var z=[a,b,c,d,e,f,g,hh];for(var q=0;q<8;q++)h[q]=(h[q]+z[q])>>>0;
    }
    return h.map(function(v){return v.toString(16).padStart(8,"0");}).join("");
  }
  function mapFingerprint(input){
    var m=normalizeMap(input);if(!m)throw Error("Invalid map fingerprint input");
    var sortPts=function(a){return a.map(function(p){return [p.x,p.y];}).sort(function(a,b){return a[0]-b[0]||a[1]-b[1];});};
    var pairs=m.portals.map(function(g){if(!pointOk(g.a)||!pointOk(g.b))throw Error("Incomplete portal");return sortPts([g.a,g.b]);})
      .sort(function(a,b){var x=JSON.stringify(a),y=JSON.stringify(b);return x<y?-1:x>y?1:0;});
    return sha256(JSON.stringify([9,13,m.rulesVersion,sortPts(m.rocks),pairs,sortPts(m.ice),sortPts(m.boost)]));
  }
  function getMap(){return copy(activeMap||defaultMap());}
  function setActiveMap(m){activeMap=copy(m);terrainApply(activeMap);editorName=activeMap.name;}
  function readMaps(){
    try{
      var newer=JSON.parse(localStorage.getItem(MAP_KEY)||"[]");
      var older=JSON.parse(localStorage.getItem(LEGACY_MAP_KEY)||"[]");
      if(!Array.isArray(newer))newer=[];if(!Array.isArray(older))older=[];
      var seen=new Set();return newer.concat(older).map(cleanMap).filter(function(m){
        if(!m)return false;var fp=mapFingerprint(m);if(seen.has(fp))return false;seen.add(fp);return true;
      }).slice(0,30);
    }catch(e){return [];}
  }
  function installMap(input){
    var result=validateMap(input);if(!result.ok)return false;
    setActiveMap(result.map);
    try{localStorage.setItem(ACTIVE_KEY,JSON.stringify(activeMap));localStorage.setItem(MODE_KEY,mapMode);}catch(e){}
    if(state)resetGame(state.variant);
    return true;
  }
  function mapCurrent(){return getMap();}
  function mapDraft(){return editorMap?copy(editorMap):getMap();}
  function editorMessage(msg){$("editorMessage").textContent=msg;}
  function editorDraw(){
    $("mapEditor").hidden=!editing;
    $("mapQuickTools").hidden=!editing;
    canvas.classList.toggle("map-editing",editing);
    if(document.body&&document.body.classList)document.body.classList.toggle("map-workshop-active",editing);
    $("mapEditorButton").textContent=editing?"关闭工坊":"地图工坊";
    ["add","erase","portal","ice","boost","select"].forEach(function(tool){
      var id=tool==="add"?"editorAdd":tool==="erase"?"editorErase":"editor"+tool.charAt(0).toUpperCase()+tool.slice(1);
      if($(id))$(id).classList.toggle("selected",editorTool===tool);
      var quickId="quickEditor"+tool.charAt(0).toUpperCase()+tool.slice(1);
      if($(quickId)){
        $(quickId).classList.toggle("selected",editorTool===tool);
        $(quickId).setAttribute("aria-pressed",editorTool===tool?"true":"false");
      }
    });
    [["mobileMapRock","add"],["mobileMapPortal","portal"],["mobileMapIce","ice"],
      ["mobileMapBoost","boost"],["mobileMapErase","erase"],["mobileMapSelect","select"]]
      .forEach(function(item){
        $(item[0]).classList.toggle("selected",editorTool===item[1]);
        $(item[0]).setAttribute("aria-pressed",String(editorTool===item[1]));
      });
    $("editorName").value=editorName;
    $("mapNameActive").textContent=activeMap?activeMap.name:editorName;
    refreshAIBanter();drawBoard();
  }
  function openEditor(){
    if(!editing&&state.moves>0&&!window.confirm("进入地图编辑将结束当前对局，确定继续？"))return;
    editing=!editing;
    if(editing){editorMap=getMap();editorRocks=editorMap.rocks;editorTool="add";editorUndo=[];editorRedo=[];editorPendingPortal=null;
      editorMessage("选择地形工具，在棋盘上绘制；橙色边框表示尚不能试玩。");}
    editorDraw();
  }
  function editCell(t){
    if(!t)return;
    if(CAMPS.some(function(c){return has(c,t);})){editorMessage("此处与固定营地冲突。");return;}
    var result=editorOperate(t);
    if(result!==false){
      var r=validateMap(mapDraft());editorMessage(r.reason);
      drawBoard();
    }
  }
  function editorCheckpoint(){
    editorUndo.push(copy(editorMap));if(editorUndo.length>80)editorUndo.shift();editorRedo=[];
  }
  function editorOperate(t){
    if(!pointOk(t))return false;
    var layers=["rocks","ice","boost"],existing=null;
    layers.forEach(function(l){if(has(editorMap[l],t))existing={layer:l,index:editorMap[l].findIndex(function(p){return same(p,t);})};});
    var portalIndex=editorMap.portals.findIndex(function(g){return same(g.a,t)||same(g.b,t);});
    if(editorTool==="erase"){
      if(existing){editorCheckpoint();editorMap[existing.layer].splice(existing.index,1);return true;}
      if(portalIndex>=0){editorCheckpoint();editorMap.portals.splice(portalIndex,1);editorPendingPortal=null;return true;}
      return false;
    }
    if(editorTool==="select"){editorSelection=existing|| (portalIndex>=0?{layer:"portals",index:portalIndex,end:same(editorMap.portals[portalIndex].a,t)?"a":"b"}:null);return false;}
    if(editorTool==="portal"){
      if(existing||portalIndex>=0){editorMessage("这里已有地形，请先移动或擦除。");return false;}
      if(editorPendingPortal!==null){
        var gate=editorMap.portals[editorPendingPortal];
        if(gate&&gate.b===null){editorCheckpoint();gate.b=copy(t);editorPendingPortal=null;return true;}
      }
      editorCheckpoint();var stamp=Date.now().toString(36),serial=editorMap.portals.length+1;
      var id="portal-"+stamp+"-"+serial;
      while(editorMap.portals.some(function(g){return g.id===id;}))id="portal-"+stamp+"-"+(++serial);
      editorMap.portals.push({id:id,a:copy(t),b:null});
      editorPendingPortal=editorMap.portals.length-1;
      editorMessage("已放置传送门第一个端点，请点击第二个端点完成配对。");return true;
    }
    var layer=editorTool==="add"?"rocks":editorTool;
    if(layers.indexOf(layer)<0)return false;
    if(portalIndex>=0||(existing&&existing.layer!==layer)){
      editorMessage("此格与其他地形冲突，请先擦除。");return false;
    }
    editorCheckpoint();
    if(existing)editorMap[layer].splice(existing.index,1);
    else editorMap[layer].push(copy(t));
    return true;
  }
  function saveMap(){
    editorName=$("editorName").value.trim().slice(0,40)||"自定义地图";
    editorMap.name=editorName;
    var r=validateMap(mapDraft());if(!r.ok){editorMessage("无法保存："+r.reason);return;}
    var maps=readMaps().filter(function(m){return mapFingerprint(m)!==mapFingerprint(r.map);});
    maps.unshift(r.map);
    try{localStorage.setItem(MAP_KEY,JSON.stringify(maps.slice(0,30)));}catch(e){editorMessage("浏览器存储失败。");return;}
    editorMessage("已保存："+r.map.name+" · "+mapFingerprint(r.map).slice(0,12));refreshMapSelect();
  }
  function refreshMapSelect(){
    var select=$("savedMaps");if(!select||!select.appendChild)return;
    select.innerHTML="";
    var empty=document.createElement("option");empty.value="";empty.textContent="选择已保存地图";select.appendChild(empty);
    readMaps().forEach(function(map){
      var opt=document.createElement("option");opt.value=mapFingerprint(map);opt.textContent=map.name;select.appendChild(opt);
    });
  }
  function shareMap(){
    editorName=$("editorName").value.trim().slice(0,40)||"自定义地图";editorMap.name=editorName;
    var r=validateMap(mapDraft());if(!r.ok){editorMessage("不能分享："+r.reason);return;}
    var bytes=new TextEncoder().encode(JSON.stringify(r.map)),binary="";
    bytes.forEach(function(b){binary+=String.fromCharCode(b);});
    var code=btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
    var link=location.origin+location.pathname+"#map="+code;
    $("mapShareLink").value=link;
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(link).catch(function(){});
    editorMessage("分享链接已生成，指纹 "+mapFingerprint(r.map).slice(0,12));
  }
  function loadShare(){
    var fragment=typeof location==="undefined"?"":(location.hash||""),value=fragment.startsWith("#map=")?fragment.slice(5):"";
    if(!value)return;
    try{
      if(value.length>12000)return;
      var binary=atob(value.replace(/-/g,"+").replace(/_/g,"/")),bytes=Uint8Array.from(binary,function(s){return s.charCodeAt(0);});
      var map=cleanMap(JSON.parse(new TextDecoder().decode(bytes)));
      if(map){setActiveMap(map);mapMode="custom";state=newGame(state.variant);localStorage.setItem(ACTIVE_KEY,JSON.stringify(map));localStorage.setItem(MODE_KEY,mapMode);}
    }catch(e){}
  }
  function randomizeInitialMap(){
    if(!window.MumuRandomMap)return null; // Compatibility with legacy isolated rule-test harnesses; production loads random-map.js first.
    var previous=window.MumuRandomMap.signature(ROCKS),seed=(Math.random()*4294967296)>>>0;
    var generated=window.MumuRandomMap.generate({seed:seed,width:W,height:H,count:10,previous:previous,
      blocked:fixedTile,fallback:DEFAULT_ROCKS,
      validate:function(rocks){return !!cleanMap({version:1,name:"随机棋盘",rocks:rocks});}});
    ROCKS=generated.rocks.map(function(p){return{x:p.x,y:p.y};});
    editorName="随机棋盘";
    try{localStorage.removeItem(ACTIVE_KEY);localStorage.setItem(RANDOM_KEY,JSON.stringify({version:1,name:editorName,rocks:ROCKS}));}catch(e){}
    return generated;
  }
  function initMap(){
    setActiveMap(defaultMap());
    try{var restoredMode=localStorage.getItem(MODE_KEY);if(["default","random-rocks","random-battle","custom"].indexOf(restoredMode)>=0)mapMode=restoredMode;}catch(e){}
    try{
      var saved=savedGameMap&&cleanMap(savedGameMap);
      if(savedGameMap&&(!saved||mapFingerprint(saved)!==savedGameHash)){
        saved=null;state=newGame(state.variant);
      }
      var active=cleanMap(JSON.parse(localStorage.getItem(ACTIVE_KEY)||localStorage.getItem(LEGACY_ACTIVE_KEY)||"null"));
      if(saved)setActiveMap(saved);
      else if(active)setActiveMap(active);
    }catch(e){}
    loadShare();
  }
  function seededRandom(seed){
    var s=(seed>>>0)||0x9e3779b9;return function(){
      s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;
    };
  }
  function mapMetrics(input){
    var r=validateMap(input);if(!r.ok)return {ok:false,reason:r.reason};
    var prev={rocks:ROCKS,portals:PORTALS,ice:ICE,boost:BOOST,variant:state&&state.variant};
    var distances=[[],[]],mobility=[[],[]],usableBoostTiles=0,iceDirectionalTiles=0,portalShortcuts=[0,0];
    try{
      terrainApply(r.map);
      for(var v=0;v<2;v++){
        if(state)state.variant=v?"advanced":"classic";
        for(var side=0;side<2;side++){
          var shortest=Infinity;
          CAMPS[side].forEach(function(s){
            var dist=computerDistance(s,CAMPS[1-side],[],null);
            if(dist<shortest)shortest=dist;
          });
          distances[v][side]=shortest;
          mobility[v][side]=CAMPS[side].reduce(function(n,s){return n+movementOptions(s,null,[]).length;},0);
        }
      }
      if(state)state.variant="advanced";
      usableBoostTiles=r.map.boost.filter(function(p){
        return movementOptions(p,null,[]).some(function(move){return move.steps===2;});
      }).length;
      iceDirectionalTiles=r.map.ice.filter(function(p){
        var free=movementOptions(p,null,[]);
        return DIRS.some(function(d){var lock=movementOptions(p,d,[]);return lock.length>0&&lock.length<free.length;});
      }).length;
      var actual=distances[1].slice();
      PORTALS=[];
      for(var side=0;side<2;side++){
        var noPortal=Math.min.apply(null,CAMPS[side].map(function(p){
          return computerDistance(p,CAMPS[1-side],[],null);
        }));
        portalShortcuts[side]=Number.isFinite(noPortal)?Math.max(0,noPortal-actual[side]):null;
      }
    }finally{ROCKS=prev.rocks;PORTALS=prev.portals;ICE=prev.ice;BOOST=prev.boost;if(state)state.variant=prev.variant;}
    return {ok:true,classicDistances:distances[0],advancedDistances:distances[1],
      fairnessGap:Math.abs(distances[1][0]-distances[1][1]),openingMobility:mobility,
      portalPairs:r.map.portals.length,iceTiles:r.map.ice.length,boostTiles:r.map.boost.length,
      usableBoostTiles:usableBoostTiles,iceDirectionalTiles:iceDirectionalTiles,portalShortcuts:portalShortcuts,
      rockTiles:r.map.rocks.length};
  }
  function randomMap(seed,opts){
    var options=opts||{},base=seed===undefined?Date.now()>>>0:Number(seed);
    if(!Number.isInteger(base)||base<0||base>4294967295)throw Error("Invalid seed");
    function count(n,def,max){return Number.isInteger(n)?Math.max(0,Math.min(max,n)):def;}
    var rocks=count(options.rocks,10,45),portals=count(options.portals,3,8),
      iceCount=count(options.ice,5,45),boostCount=count(options.boost,4,45);
    var attempts=count(options.attempts,120,300),continuity=Number(options.iceContinuity===undefined?0.76:options.iceContinuity),maxGap=Number(options.maxFairnessGap===undefined?12:options.maxFairnessGap);
    if(!Number.isFinite(continuity)||continuity<0||continuity>1||!Number.isFinite(maxGap)||maxGap<0)throw Error("Invalid map generation settings");
    var parameters={rocks:rocks,portals:portals,ice:iceCount,boost:boostCount,iceContinuity:continuity,maxFairnessGap:maxGap};
    if(attempts===0)throw Error("No generation attempts allowed");
    var timeLimitMs=options.timeLimitMs===undefined?2000:Number(options.timeLimitMs);
    if(!Number.isFinite(timeLimitMs)||timeLimitMs<1||timeLimitMs>10000)throw Error("Invalid generation time limit");
    var deadline=Date.now()+timeLimitMs;
    var failures={};
    for(var attempt=0;attempt<attempts;attempt++){
      if(Date.now()>deadline)throw Error("Random map generation time limit exceeded after "+attempt+" attempts: "+JSON.stringify(failures));
      var rand=seededRandom((base+Math.imul(0x9e3779b9,attempt))>>>0);
      var occupied=new Set(),available=[];
      for(var y=0;y<H;y++)for(var x=0;x<W;x++){
        var t={x:x,y:y};if(CAMPS.some(function(c){return has(c,t);}))continue;
        available.push(t);
      }
      function sample(){
        if(!available.length)return null;
        var i=Math.floor(rand()*available.length);
        var p=available.splice(i,1)[0];occupied.add(posKey(p));return p;
      }
      var map={version:2,rulesVersion:RULES_VERSION,generatorVersion:GENERATOR_VERSION,name:"随机战场",seed:base,
        rocks:[],portals:[],ice:[],boost:[]};
      for(var i=0;i<portals;i++){
        var a=sample(),b=sample();if(!a||!b)break;
        map.portals.push({id:"portal-"+(i+1),a:a,b:b});
      }
      if(map.portals.length!==portals){failures.space=(failures.space||0)+1;continue;}
      // Independent clusters are grown locally, preserving turns and occasional isolated ice.
      while(map.ice.length<iceCount){
        var candidate=null;
        if(map.ice.length&&rand()<continuity){
          var pivot=map.ice[Math.floor(rand()*map.ice.length)];
          var dirs=DIRS.slice();
          for(var shuffle=dirs.length-1;shuffle>0;shuffle--){
            var pick=Math.floor(rand()*(shuffle+1)),tmp=dirs[shuffle];dirs[shuffle]=dirs[pick];dirs[pick]=tmp;
          }
          for(var j=0;j<dirs.length;j++){
            var t={x:pivot.x+dirs[j].x,y:pivot.y+dirs[j].y};
            if(pointOk(t)&&!occupied.has(posKey(t))&&!CAMPS.some(function(c){return has(c,t);})) {candidate=t;break;}
          }
        }
        if(candidate){
          occupied.add(posKey(candidate));available=available.filter(function(t){return !same(t,candidate);});
        }else candidate=sample();
        if(!candidate)break;
        map.ice.push(candidate);
      }
      for(var i=0;i<boostCount;i++){var p=sample();if(p)map.boost.push(p);}
      for(var i=0;i<rocks;i++){var p=sample();if(p)map.rocks.push(p);}
      var v=validateMap(map);
      if(!v.ok){failures[v.code]=(failures[v.code]||0)+1;continue;}
      var metrics=mapMetrics(v.map);
      if(boostCount>0&&metrics.usableBoostTiles<Math.ceil(boostCount*.6)){
        failures.boostUnusable=(failures.boostUnusable||0)+1;continue;
      }
      if(metrics.fairnessGap>maxGap){
        failures.imbalanced=(failures.imbalanced||0)+1;continue;
      }
      v.map.quality=metrics;
      v.map.generation={parameters:parameters,attempt:attempt};
      return v.map;
    }
    var err=Error("Unable to generate legal map in "+attempts+" attempts: "+JSON.stringify(failures));
    err.rejections=failures;throw err;
  }
  function reproduceMap(input){
    var m=normalizeMap(input);
    if(!m||m.generatorVersion!==GENERATOR_VERSION||!m.generation||!m.generation.parameters||m.seed===null)
      throw Error("Missing or incompatible seeded map generation information");
    var out=m.generation.type==="random-rocks"?randomRocks(m.seed):randomMap(m.seed,m.generation.parameters);
    if(mapFingerprint(out)!==mapFingerprint(m))throw Error("Map generator does not reproduce original map fingerprint");
    return out;
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
  // Pre-match rock/paper/scissors; the winner chooses whether to take the first (gold) move.
  function cpuSide(){return state.humanSide===1?0:1;}
  function rpsRandom(){
    if(typeof crypto!=="undefined"&&crypto.getRandomValues){var a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%3;}
    if(window.crypto&&window.crypto.getRandomValues){var a=new Uint32Array(1);window.crypto.getRandomValues(a);return a[0]%3;}
    return Math.floor(Math.random()*3);
  }
  function beginRps(){
    if(state.playMode!=="cpu")return;
    state.phase="rps";state.rps={winner:null,human:null,computer:null,rounds:0};state.humanSide=0;
    $("rpsResult").textContent="选择石头、剪刀或布。平局重新猜拳。";
    $("rpsSideChoices").hidden=true;$("rpsChoices").hidden=false;
    setModal("rpsModal",true);save();drawUI();drawBoard();
  }
  function playRps(hand){
    if(state.playMode!=="cpu"||state.phase!=="rps"||!["rock","paper","scissors"].includes(hand))return;
    var choices=["scissors","rock","paper"],labels={rock:"石头",paper:"布",scissors:"剪刀"};
    var ai=choices[rpsRandom()];
    state.rps.human=hand;state.rps.computer=ai;state.rps.rounds++;
    if(hand===ai){$("rpsResult").textContent="双方都出 "+labels[hand]+"，平局！再猜一次。";save();return;}
    var win=(hand==="rock"&&ai==="scissors")||(hand==="scissors"&&ai==="paper")||(hand==="paper"&&ai==="rock");
    state.rps.winner=win?"human":"cpu";
    $("rpsResult").textContent="你出 "+labels[hand]+"，电脑出 "+labels[ai]+"。"+(win?"你赢了！选择先后手。":"电脑获胜，电脑决定先手。");
    $("rpsChoices").hidden=true;
    if(win)$("rpsSideChoices").hidden=false;
    else decideRpsSide("second");
    save();
  }
  function decideRpsSide(choice){
    if(state.phase!=="rps"||!state.rps||!state.rps.winner)return;
    if(state.rps.winner==="human"&&choice!=="first"&&choice!=="second")return;
    // CPU wins: it elects the first move; human occupies wood. User wins: can choose either.
    state.humanSide=choice==="second"?1:0;
    state.phase="pick-attack";state.turn=0;state.rps.chosen=choice;
    setModal("rpsModal",false);commit();
  }
  function newGame(variant){
    return {variant:variant||"classic",playMode:"cpu",aiLevel:"zhongdi",phase:"pick-attack",players:[null,null],turn:0,
      walls:[],left:[5,5],moves:0,history:[],action:"move",orientation:"h",
      hover:null,slideDir:[null,null],pending:null,winner:null,repetitions:{},notice:"",humanSide:0,rps:null};
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
    try {
      var current=mapCurrent();
      localStorage.setItem("mumujinjin-game-v1",JSON.stringify({version:2,state:state,map:current,mapFingerprint:mapFingerprint(current)}));
    } catch(e){}
  }
  function load(){
    try {
      var raw=localStorage.getItem("mumujinjin-game-v1");
      if(!raw)return null;
      var parsed=JSON.parse(raw);
      if((parsed.version!==1&&parsed.version!==2)||!parsed.state||!Array.isArray(parsed.state.walls)||!Array.isArray(parsed.state.players))return null;
      if(parsed.version===2){
        if(!parsed.map||typeof parsed.mapFingerprint!=="string")return null;
        savedGameMap=parsed.map;savedGameHash=parsed.mapFingerprint;
      }
      if(parsed.state.variant!=="classic"&&parsed.state.variant!=="advanced")return null;
      parsed.state.repetitions=parsed.state.repetitions||{};
      return parsed.state;
    } catch(e){return null;}
  }
  function notice(text){state.notice=text;drawUI();}
  function commit(){state.notice="";save();drawUI();drawBoard();scheduleComputerTurn();}
  function resetGame(variant,preserveSelectedMap){
    if(!preserveSelectedMap)randomizeInitialMap();
    var playMode=state.playMode||"local",aiLevel=state.aiLevel||"normal";
    state=newGame(variant||state.variant);
    state.playMode=playMode;state.aiLevel=aiLevel;
    closeAll();if(playMode==="cpu")beginRps();else commit();
  }
  function confirmSwitch(variant){
    if(state.variant===variant)return;
    if(state.moves>0&&!window.confirm("切换玩法会重新开始当前对局。确定切换吗？"))return;
    resetGame(variant);
  }
  function record(){state.history.push(snapshot());if(state.history.length>120)state.history.shift();}
  function undo(){
    if(!state.history.length){notice("还没有可悔的步骤。");return;}
    var count=state.playMode==="cpu"&&state.phase==="play"&&state.turn===state.humanSide?2:1;
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
    if(!w||!Number.isInteger(w.x)||!Number.isInteger(w.y)||(w.o!=="h"&&w.o!=="v"))return false;
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
      if(state.phase==="finished"&&state.winner!==null)showAIQuote(state.winner===cpuSide()?"win":"lose",true);
      else if(moving===cpuSide())showAIQuote(actionName.indexOf("墙")>=0?"wall":actionName.indexOf("门")>=0?"portal":"move",false);
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
    if(editing){if(suppressEditorClick){suppressEditorClick=false;return;}editCell(tileAt(pointerPos(event)));return;}
    if(state.playMode==="cpu"&&state.phase==="play"&&state.turn===1)return;
    if(state.phase==="finished"||state.pending)return;
    var p=pointerPos(event),t=tileAt(p);
    if(state.phase==="pick-attack"||state.phase==="pick-defend"){
      if(state.playMode==="cpu"&&(state.phase==="pick-attack"?0:1)===cpuSide())return;
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
    if(!w||!Number.isInteger(w.x)||!Number.isInteger(w.y)||(w.o!=="h"&&w.o!=="v"))return false;
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
  function xiaodiChooseAction(side){side=side===0?0:1;
    if(!window.MumuXiaodi){throw Error("小迪引擎未加载，拒绝降级为其他难度");}
    var snapshot={players:state.players.map(function(p){return {x:p.x,y:p.y};}),dirs:state.slideDir.map(function(d){return d?{x:d.x,y:d.y}:null;}),walls:state.walls.map(function(w){return {x:w.x,y:w.y,o:w.o};}),left:state.left.slice()};
    var engine={terrain:{CAMPS:CAMPS,PORTALS:PORTALS,ICE:ICE,BOOST:BOOST},setRocks:function(){},movementOptions:movementOptions,computerDistance:computerDistance,hellWallAllowed:hellWallAllowed,hellApply:hellApply,hellEvaluate:hellEvaluate,hellCandidates:hellCandidates,portal:portal};
    return window.MumuXiaodi.choose(engine,snapshot,side,{rocks:ROCKS,map:mapCurrent(),fingerprint:mapFingerprint(mapCurrent())},260);
  }
  function zhongdiChooseAction(side){side=side===0?0:1;
    if(!window.MumuZhongdi)throw Error("中迪引擎未加载，不会自动降级");
    var snapshot={players:state.players.map(function(p){return{x:p.x,y:p.y};}),dirs:state.slideDir.map(function(d){return d?{x:d.x,y:d.y}:null;}),walls:state.walls.map(function(w){return{x:w.x,y:w.y,o:w.o};}),left:state.left.slice()};
    var engine={terrain:{CAMPS:CAMPS,PORTALS:PORTALS,ICE:ICE,BOOST:BOOST},setRocks:function(){},movementOptions:movementOptions,computerDistance:computerDistance,hellWallAllowed:hellWallAllowed,hellApply:hellApply,hellEvaluate:hellEvaluate,hellCandidates:hellCandidates,portal:portal};
    return window.MumuZhongdi.choose(engine,snapshot,side,{rocks:ROCKS,map:mapCurrent(),fingerprint:mapFingerprint(mapCurrent())});
  }
  function computerTakeTurn(){
    if(state.playMode!=="cpu"||state.phase!=="play"||state.turn!==cpuSide()||state.pending)return;
    var level=state.aiLevel||"zhongdi";
    var tactical=level==="zhongdi"?zhongdiChooseAction(cpuSide()):level==="xiaodi"?xiaodiChooseAction(cpuSide()):level==="hell"&&cpuSide()===1?hellChooseAction():null;
    if(cpuSide()===0&&!tactical){
      var moves=movementOptions(state.players[0],state.slideDir[0],state.walls),best=null,value=Infinity;
      moves.forEach(function(m){
        var gate=portal(m.p),spots=[{move:m,p:m.p,warp:false}];
        if(gate)spots.push({move:m,p:same(gate.a,m.p)?gate.b:gate.a,warp:true});
        spots.forEach(function(option){var dist=computerDistance(option.p,CAMPS[1],state.walls,option.warp?null:m.nextLock);if(dist<value){value=dist;best=option;}});
      });
      if(best){playerMove(best.move);if(state.pending)choosePortal(best.warp);return;}
    }
    var wall=tactical?tactical.wall:computerWallChoice(level);
    if(wall){placeWall(wall);return;}
    var move=tactical?tactical.move:computerMoveChoice(level);
    if(!move)return;
    playerMove(move);
    if(state.pending&&state.turn===cpuSide()){
      var gate=PORTALS[state.pending.index],cur=state.players[cpuSide()];
      var exit=same(gate.a,cur)?gate.b:gate.a;
      var stayDistance=computerDistance(cur,CAMPS[1-cpuSide()],state.walls,null);
      var warpDistance=computerDistance(exit,CAMPS[1-cpuSide()],state.walls,null);
      choosePortal(tactical?tactical.warp===true:warpDistance<stayDistance);
    }
  }
  function scheduleComputerTurn(){
    var token=++cpuScheduleToken;
    if(editing||state.playMode!=="cpu"||typeof window.setTimeout!=="function")return;
    if(state.phase==="pick-attack"&&cpuSide()===0){
      window.setTimeout(function(){
        if(token!==cpuScheduleToken||state.phase!=="pick-attack"||state.playMode!=="cpu")return;
        selectOrigin({x:7,y:12});
      },280);
    }else if(state.phase==="pick-defend"&&cpuSide()===1){
      window.setTimeout(function(){
        if(token!==cpuScheduleToken||state.phase!=="pick-defend"||state.playMode!=="cpu")return;
        selectOrigin({x:1,y:0});
      },280);
    }else if(state.phase==="play"&&state.turn===cpuSide()&&!state.pending){
      window.setTimeout(function(){
        if(token!==cpuScheduleToken||state.phase!=="play"||state.turn!==cpuSide()||state.playMode!=="cpu")return;
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
    state.playMode="cpu";state.aiLevel=level;
    try{localStorage.setItem("mumujinjin-ai-choice-explicit-v1",level);}catch(e){}
    resetGame(state.variant);
  }
  function setAction(a){
    if(editing||state.phase!=="play"||(state.playMode==="cpu"&&state.turn===cpuSide()))return;
    state.action=a;state.hover=null;drawUI();drawBoard();
  }
  function orientation(o){
    state.orientation=o;drawUI();drawBoard();
  }
  function setModal(id,show){$(id).hidden=!show;}
  function closeAll(){["guideModal","portalModal","winModal","rpsModal"].forEach(function(id){setModal(id,false);});}
  function drawUI(){
    var picking=state.phase!=="play"||editing;
    refreshAIBanter();
    $("mapEditorButton").textContent=editing?"关闭工坊":"地图工坊";
    $("mapNameActive").textContent=editorName;
    var title=state.phase==="rps"?"猜拳决定先后手":state.phase==="pick-attack"?"金方选择起点":state.phase==="pick-defend"?"木方选择起点":
      state.phase==="finished"?(state.winner===null?"平局":NAMES[state.winner]+"赢得胜利"):NAMES[state.turn]+"的回合";
    var help=state.phase==="rps"?"选择石头、剪刀或布，赢的一方决定先后手。":state.phase==="pick-attack"?"点击棋盘右下角的任一金色营地格，作为金方出生点。":
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
      if(state.phase==="pick-defend"&&cpuSide()===1)help="电脑正在选择木方出生点…";
      if(state.phase==="play"&&state.turn===cpuSide()){title=NAMES[cpuSide()]+"电脑的回合";help="电脑正在计算下一步，请稍候。";}
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
    var cpuBusy=state.playMode==="cpu"&&state.turn===cpuSide();
    $("moveMode").disabled=picking||cpuBusy;$("wallMode").disabled=picking||cpuBusy||state.left[state.turn]===0;
    $("wallTools").hidden=state.action!=="wall"||picking;
    $("wallH").classList.toggle("selected",state.orientation==="h");
    $("wallV").classList.toggle("selected",state.orientation==="v");
    $("modeClassic").classList.toggle("selected",state.variant==="classic");
    $("modeAdvanced").classList.toggle("selected",state.variant==="advanced");
    [["mapDefault","default"],["mapRandomRocks","random-rocks"],["mapRandomBattle","random-battle"],["mapCustom","custom"]].forEach(function(x){
      $(x[0]).classList.toggle("selected",mapMode===x[1]);
    });
    $("boardVersion").textContent=state.variant==="classic"?"经典战场":"跑道挑战";
    $("aiOpponentNameBadge").hidden=state.playMode!=="cpu";
    $("aiOpponentNameBadge").textContent=aiOpponentName();
    $("aiOpponentChatName").textContent=aiOpponentName()+" · 电脑对手";

    if(state.playMode==="cpu")$("player"+cpuSide()+"Label").textContent=aiOpponentName()+(state.phase==="play"&&state.turn===cpuSide()?"思考中":"执"+NAMES[cpuSide()]);
    $("playLocal").classList.toggle("selected",state.playMode!=="cpu");
    $("playAI").classList.toggle("selected",state.playMode==="cpu");
    $("aiDifficulty").hidden=state.playMode!=="cpu";
    ["easy","normal","hard","hell","xiaodi","zhongdi"].forEach(function(level){
      $("ai-"+level).classList.toggle("selected",state.aiLevel===level);
      if(typeof $("ai-"+level).setAttribute==="function")$("ai-"+level).setAttribute("aria-pressed",state.aiLevel===level?"true":"false");
    });
    $("legendExtra").hidden=state.variant!=="advanced"&&!editing;
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
      if((state.variant==="advanced"||editing)&&has(editing?editorMap.ice:ICE,p)){
        ctx.save();ctx.globalAlpha=.5;
        for(var k=0;k<3;k++)line(px+12,py+24+k*9,px+52,py+24+k*9,"#7cbccc",2);
        ctx.restore();
      }
      if((state.variant==="advanced"||editing)&&has(editing?editorMap.boost:BOOST,p)){
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
    (editing?editorMap.portals:PORTALS).forEach(function(g,index){
      [g.a,g.b].filter(Boolean).forEach(function(p,end){
        var x=X+(p.x+.5)*STEP,y=Y+(p.y+.5)*STEP;
        ctx.save();ctx.shadowColor="#a2a3ef";ctx.shadowBlur=14;
        ctx.beginPath();ctx.arc(x,y,22,0,Math.PI*2);ctx.fillStyle="#414967";ctx.fill();ctx.shadowBlur=0;
        ctx.lineWidth=2;ctx.strokeStyle="#a9bce6";ctx.stroke();ctx.restore();
        text(editing?String(index+1)+(end?"B":"A"):g.symbol,x,y+1,editing?16:24,"#e0e1fb");
      });
    });
  }
  function drawTargets(){
    if(editing)return;
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
    else {
      var validity=validateMap(mapDraft());
      rounded(X-14,Y-14,W*STEP+28,H*STEP+28,16,null,validity.ok?"#5fe3c2":"#fa786a");
      if(editorSelection){
        var sel=editorSelection;
        var at=sel.layer==="portals"?editorMap.portals[sel.index]&&editorMap.portals[sel.index][sel.end]:
          editorMap[sel.layer]&&editorMap[sel.layer][sel.index];
        if(at){var sx=X+at.x*STEP,sy=Y+at.y*STEP;rounded(sx+2,sy+2,STEP-4,STEP-4,6,null,"#ffffff");}
      }
      if(editorHover&&editorTool!=="select"){
        var px=X+editorHover.x*STEP,py=Y+editorHover.y*STEP;
        rounded(px+3,py+3,STEP-6,STEP-6,7,null,editorCanPlace(editorHover,null)?"#8fffd9":"#ef7777");
      }
    }
    if(state.phase==="finished"&&!editing){
      ctx.save();ctx.fillStyle="#0b1424af";rounded(X+100,Y+350,W*STEP-200,118,8,"#0a1629df","#9d8d66");
      text(NAMES[state.winner]+" 获 胜",360,Y+403,35,state.winner===0?"#f6c180":"#9ce8dc");
      ctx.restore();
    }
  }
  function randomRocks(seed){
    var base=seed===undefined?(Date.now()>>>0):Number(seed),rnd=seededRandom(base);
    var fixed=defaultMap(),forbidden=new Set();
    fixed.portals.forEach(function(g){forbidden.add(posKey(g.a));forbidden.add(posKey(g.b));});
    fixed.ice.concat(fixed.boost).forEach(function(p){forbidden.add(posKey(p));});
    CAMPS.forEach(function(c){c.forEach(function(p){forbidden.add(posKey(p));});});
    var candidates=[];for(var y=0;y<H;y++)for(var x=0;x<W;x++){
      if(!forbidden.has(x+","+y))candidates.push({x:x,y:y});
    }
    for(var attempt=0;attempt<150;attempt++){
      var pool=candidates.slice();fixed.rocks=[];
      for(var i=0;i<10;i++){
        var pick=Math.floor(rnd()*pool.length);fixed.rocks.push(pool.splice(pick,1)[0]);
      }
      var r=validateMap(fixed);if(r.ok){r.map.seed=base;r.map.name="随机障碍";r.map.generation={type:"random-rocks",parameters:{rocks:10},attempt:attempt};return r.map;}
    }
    throw Error("随机障碍：150 次内未得到合法地图。");
  }
  function editorUndoAction(){
    if(!editing||!editorUndo.length)return;
    editorRedo.push(copy(editorMap));editorMap=editorUndo.pop();editorSelection=null;editorRocks=editorMap.rocks;
    editorPendingPortal=editorMap.portals.findIndex(function(g){return !g.b;});
    editorMessage("已撤销 · "+validateMap(editorMap).reason);editorDraw();
  }
  function editorRedoAction(){
    if(!editing||!editorRedo.length)return;
    editorUndo.push(copy(editorMap));editorMap=editorRedo.pop();editorSelection=null;editorRocks=editorMap.rocks;
    editorPendingPortal=editorMap.portals.findIndex(function(g){return !g.b;});
    editorMessage("已重做 · "+validateMap(editorMap).reason);editorDraw();
  }
  function editorCanPlace(t,selection){
    if(!pointOk(t))return false;
    if(CAMPS.some(function(c){return has(c,t);}))return false;
    for(var li=0;li<3;li++){
      var key=["rocks","ice","boost"][li];
      if(editorMap[key].some(function(p,i){return same(p,t)&&!(selection&&selection.layer===key&&selection.index===i);}))return false;
    }
    return !editorMap.portals.some(function(g,i){
      return ["a","b"].some(function(end){return g[end]&&same(g[end],t)&&!(selection&&selection.layer==="portals"&&selection.index===i&&selection.end===end);});
    });
  }
  function editorMoveSelection(t){
    if(!editorSelection||!pointOk(t))return;
    if(editorSelection.layer==="portals"&&!editorMap.portals[editorSelection.index])return;
    if(editorSelection.layer!=="portals"&&(!editorMap[editorSelection.layer]||!editorMap[editorSelection.layer][editorSelection.index]))return;
    var s=editorSelection,origin=s.layer==="portals"?editorMap.portals[s.index][s.end]:editorMap[s.layer][s.index];
    if(same(origin,t))return;
    if(!editorCanPlace(t,s)){editorMessage("此处越界、被占用或与营地冲突，无法移动。");return;}
    editorCheckpoint();
    if(s.layer==="portals")editorMap.portals[s.index][s.end]=copy(t);
    else editorMap[s.layer][s.index]=copy(t);
    editorRocks=editorMap.rocks;
    var r=validateMap(editorMap);editorMessage(r.reason);drawBoard();
  }
  var editorPointer=null,editorHover=null,suppressEditorClick=false;
  function editorPointerDown(e){
    if(!editing)return;
    var p=tileAt(pointerPos(e));if(!p)return;
    editorPointer={id:e.pointerId,last:p,start:p,seen:new Set([posKey(p)])};
    editorHover=p;
    if(editorTool==="select"){editorOperate(p);drawBoard();}
    else editCell(p);
    if(canvas.setPointerCapture&&e.pointerId!==undefined)canvas.setPointerCapture(e.pointerId);
    if(e.cancelable)e.preventDefault();
    suppressEditorClick=true;
  }
  function editorPointerMove(e){
    if(!editing)return;
    var p=tileAt(pointerPos(e));editorHover=p;
    if(!editorPointer||editorPointer.id!==e.pointerId){drawBoard();return;}
    if(!p)return;
    if(editorTool==="select"){drawBoard();return;}
    if(["portal","add","ice","boost","erase"].indexOf(editorTool)>=0){
      if(!editorPointer.seen.has(posKey(p))){
        editorPointer.seen.add(posKey(p));
        // Portal endpoints require separate clicks, not a paint stroke.
        if(editorTool!=="portal")editCell(p);
      }
    }
  }
  function editorPointerUp(e){
    if(!editing||!editorPointer)return;
    if(editorPointer.id!==e.pointerId)return;
    var p=tileAt(pointerPos(e));
    if(editorTool==="select"&&p)editorMoveSelection(p);
    editorPointer=null;editorHover=p;
    drawBoard();
  }
  function bindEvents(){
    canvas.addEventListener("click",canvasClick);
    // Mobile in-board tool dock: same editor state as the desktop toolbar.
    [["mobileMapRock","add"],["mobileMapPortal","portal"],["mobileMapIce","ice"],
      ["mobileMapBoost","boost"],["mobileMapErase","erase"],["mobileMapSelect","select"]]
      .forEach(function(item){
        $(item[0]).addEventListener("click",function(){
          if(!editing)return;
          editorTool=item[1];editorSelection=null;editorDraw();
        });
      });
    $("mobileMapUndo").addEventListener("click",editorUndoAction);
    $("mobileMapRedo").addEventListener("click",editorRedoAction);
    canvas.addEventListener("pointerdown",editorPointerDown);
    canvas.addEventListener("pointerup",editorPointerUp);
    canvas.addEventListener("pointercancel",function(){editorPointer=null;suppressEditorClick=false;});

    canvas.addEventListener("pointermove",function(e){
      if(editing){editorPointerMove(e);return;}
      if(state.phase!=="play"||state.action!=="wall"||state.pending)return;
      state.hover=pointerPos(e);drawBoard();
    });
    canvas.addEventListener("pointerleave",function(){if(editing)return;state.hover=null;drawBoard();});
    $("moveMode").addEventListener("click",function(){setAction("move");});
    $("wallMode").addEventListener("click",function(){setAction("wall");});
    $("wallH").addEventListener("click",function(){orientation("h");});
    $("wallV").addEventListener("click",function(){orientation("v");});
    $("mapEditorButton").addEventListener("click",openEditor);
    $("mobileWorkshopBtn").addEventListener("click",openEditor);
    $("editorMore").addEventListener("click",function(){var expanded=$("mapEditor").classList.toggle("expanded");$("editorMore").setAttribute("aria-expanded",String(expanded));});
    // Keep map mode independent of classic/advanced movement rules.
    function chooseMapMode(mode){
      if(mode==="custom"){if(!editing)openEditor();return;}
      if(state.moves>0&&!window.confirm("切换地图将结束当前对局，确定吗？"))return;
      if(editing&&!window.confirm("切换地图会放弃未应用的工坊草稿，确定吗？"))return;
      var previous=mapMode;mapMode=mode;var map=null;
      try{
        if(mode==="default")map=defaultMap();
        else if(mode==="random-rocks")map=randomRocks(Date.now()>>>0);
        else if(mode==="random-battle")map=randomMap(Date.now()>>>0);
        else throw Error("Unknown map layout mode");
        if(!installMap(map))throw Error("地图未通过合法性验证");
        editing=false;editorMap=null;editorRocks=null;editorSelection=null;editorPendingPortal=null;
        editorDraw();editorMessage("已切换地图："+map.name+" · "+mapFingerprint(map).slice(0,12));
      }catch(e){mapMode=previous;editorMessage("地图生成失败："+e.message);}
    }
    [["mapDefault","default"],["mapRandomRocks","random-rocks"],["mapRandomBattle","random-battle"],["mapCustom","custom"]].forEach(function(item){
      $(item[0]).addEventListener("click",function(){chooseMapMode(item[1]);});
    });
    ["add","erase","portal","ice","boost","select"].forEach(function(tool){
      var id=tool==="add"?"editorAdd":tool==="erase"?"editorErase":"editor"+tool.charAt(0).toUpperCase()+tool.slice(1);
      $(id).addEventListener("click",function(){editorTool=tool;editorSelection=null;editorDraw();});
    });
    $("editorDefault").addEventListener("click",function(){
      editorCheckpoint();editorMap=defaultMap();editorRocks=editorMap.rocks;editorName=editorMap.name;
      editorPendingPortal=null;editorSelection=null;editorDraw();editorMessage("草稿已恢复经典地图；点击试玩后才会应用。");
    });
    $("editorClear").addEventListener("click",function(){
      editorCheckpoint();editorMap.rocks=[];editorMap.portals=[];editorMap.ice=[];editorMap.boost=[];
      editorRocks=editorMap.rocks;editorPendingPortal=null;editorSelection=null;editorDraw();editorMessage("可编辑地形已清空，营地保留。");
    });
    ["add","portal","ice","boost","select","erase"].forEach(function(tool){
      $("quickEditor"+tool.charAt(0).toUpperCase()+tool.slice(1)).addEventListener("click",function(){
        editorTool=tool;editorSelection=null;editorDraw();
      });
    });
    $("quickEditorUndo").addEventListener("click",editorUndoAction);
    $("quickEditorRedo").addEventListener("click",editorRedoAction);
    $("editorUndo").addEventListener("click",editorUndoAction);
    $("editorRedo").addEventListener("click",editorRedoAction);
    $("editorSave").addEventListener("click",saveMap);
    $("editorPlay").addEventListener("click",function(){
      editorName=$("editorName").value.trim().slice(0,40)||"自定义地图";editorMap.name=editorName;
      var r=validateMap(mapDraft());
      if(!r.ok){editorMessage("不能试玩："+r.reason);return;}
      editing=false;mapMode="custom";installMap(r.map);editorDraw();
    });
    $("editorShare").addEventListener("click",shareMap);
    $("editorExport").addEventListener("click",function(){
      var r=validateMap(mapDraft());
      if(!r.ok){editorMessage("无法导出："+r.reason);return;}
      $("mapImportData").value=JSON.stringify(r.map,null,2);
      editorMessage("已生成完整 Map V2 JSON，可复制保存。");
    });
    $("editorRandom").addEventListener("click",function(){
      try{
        var v=$("editorSeed").value.trim(),seed=v===""?(Date.now()>>>0):Number(v);
        var opts={rocks:Number($("editorRocksCount").value),portals:Number($("editorPortalsCount").value),
          ice:Number($("editorIceCount").value),boost:Number($("editorBoostCount").value),
          iceContinuity:Number($("editorIceContinuity").value)};
        var map=randomMap(seed,opts);
        editorCheckpoint();editorMap=copy(map);editorRocks=editorMap.rocks;editorPendingPortal=null;
        editorName=map.name;editorDraw();
        $("editorSeed").value=String(seed);editorMessage("随机生成成功 · "+mapFingerprint(map).slice(0,12)+
          " · 进阶最短路径："+map.quality.advancedDistances.join(" / "));
      }catch(e){editorMessage("随机失败："+e.message);}
    });
    $("editorImport").addEventListener("click",function(){
      var source=$("mapImportData").value.trim(),data;
      try{
        if(source.includes("#map=")){
          var encoded=source.split("#map=")[1].split("&")[0];
          var binary=atob(encoded.replace(/-/g,"+").replace(/_/g,"/"));
          data=JSON.parse(new TextDecoder().decode(Uint8Array.from(binary,function(c){return c.charCodeAt(0);})));
        }else data=JSON.parse(source);
      }catch(e){editorMessage("无法解析导入内容。");return;}
      var r=validateMap(data);
      if(!r.ok){editorMessage("导入失败："+r.reason);return;}
      editorCheckpoint();editorMap=copy(r.map);editorRocks=editorMap.rocks;
      editorName=r.map.name;editorPendingPortal=null;editorDraw();editorMessage("导入成功 · "+mapFingerprint(r.map).slice(0,12));
    });
    $("savedMaps").addEventListener("change",function(){
      var fp=$("savedMaps").value,entry=readMaps().find(function(m){return mapFingerprint(m)===fp;});
      if(entry){editorCheckpoint();editorMap=copy(entry);editorRocks=editorMap.rocks;
        editorName=entry.name;editorPendingPortal=null;editorDraw();}
    });
    $("editorDelete").addEventListener("click",function(){
      var fp=$("savedMaps").value;if(!fp)return;
      try{
        [MAP_KEY,LEGACY_MAP_KEY].forEach(function(key){
          var raw=JSON.parse(localStorage.getItem(key)||"[]");
          if(Array.isArray(raw))localStorage.setItem(key,JSON.stringify(raw.filter(function(m){
            var valid=cleanMap(m);return !valid||mapFingerprint(valid)!==fp;
          })));
        });
      }catch(e){editorMessage("删除失败："+e.message);return;}
      refreshMapSelect();editorMessage("已从本地地图列表删除。");
    });
    $("editorRename").addEventListener("click",function(){
      var fp=$("savedMaps").value,name=$("editorName").value.trim().slice(0,40);
      if(!fp||!name){editorMessage("先选择地图并输入新名称。");return;}
      var maps=readMaps(),entry=maps.find(function(m){return mapFingerprint(m)===fp;});
      if(!entry)return;
      entry.name=name;editorMap.name=name;editorName=name;
      try{localStorage.setItem(MAP_KEY,JSON.stringify(maps));}
      catch(e){editorMessage("重命名失败："+e.message);return;}
      refreshMapSelect();editorDraw();editorMessage("地图已重命名："+name);
    });
    $("editorUseDefault").addEventListener("click",function(){
      editing=false;mapMode="default";installMap(defaultMap());editorDraw();
    });

    ["rock","paper","scissors"].forEach(function(hand){$("rps-"+hand).addEventListener("click",function(){playRps(hand);});});
    $("rpsFirst").addEventListener("click",function(){decideRpsSide("first");});
    $("rpsSecond").addEventListener("click",function(){decideRpsSide("second");});
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
    ["easy","normal","hard","hell","xiaodi","zhongdi"].forEach(function(level){
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
      if(editing&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){
        e.preventDefault();if(e.shiftKey)editorRedoAction();else editorUndoAction();return;
      }
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();undo();return;}
      if(state.phase!=="play"||(state.playMode==="cpu"&&state.turn===cpuSide()))return;
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
  var loadedAtBoot=load();state=load()||newGame("classic");
  initMap();refreshMapSelect();
  // Public read-only Map V2 API, independent from AI research policies.
  window.MumuMapV2=Object.freeze({
    rulesVersion:RULES_VERSION,generatorVersion:GENERATOR_VERSION,
    get:getMap,normalize:normalizeMap,validate:validateMap,
    generate:randomMap,generateRandomRocks:randomRocks,
    metrics:mapMetrics,fingerprint:mapFingerprint,reproduce:reproduceMap
  });
  state.hover=null;state.notice=state.notice||"";
  try{aiDialogueDisabled=localStorage.getItem("mumujinjin-ai-quiet")==="1";}catch(e){}
  state.playMode=state.playMode==="cpu"?"cpu":"local";
  state.aiLevel=["easy","normal","hard","hell","xiaodi","zhongdi"].indexOf(state.aiLevel)>=0?state.aiLevel:"zhongdi";
  bindEvents();if(!loadedAtBoot&&state.playMode==="cpu")beginRps();drawUI();drawBoard();
  if(state.playMode==="cpu"&&state.phase==="play")showAIQuote("opening",true);
  if(state.playMode==="cpu"&&state.phase==="rps")setModal("rpsModal",true);
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
