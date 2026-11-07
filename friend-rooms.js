/* Real-time room client; requires a deployed room server. No fake local rooms. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MumuFriendRooms = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function createClient(options) {
    options = options || {};
    var env = typeof window !== 'undefined' ? window : {};
    var endpoint = options.endpoint !== undefined ? options.endpoint : env.MMJJ_ROOM_SERVER_URL;
    if(!endpoint && typeof location!=='undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname))
      endpoint='http://localhost:8787';
    endpoint = String(endpoint || '').replace(/\/+$/, '');
    var doFetch=options.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    var Socket=options.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    var socket=null,token=null,code=null,owner=false,callback=function(){},currentState=null;
    var reconnectTimer=null,reconnectAttempts=0,manuallyClosed=false;
    function ensure() {
      if (!endpoint) throw Error('联机服务尚未配置，目前无法创建真实的线上房间。');
      if (!doFetch || !Socket) throw Error('当前浏览器不支持好友联机。');
    }
    async function post(path, body) {
      ensure();
      var controller=typeof AbortController!=='undefined'?new AbortController():null;
      var timer=controller?setTimeout(function(){controller.abort();},12000):null;
      try{
        var res;
        try{
          res=await doFetch(endpoint+path,{method:'POST',
            headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{}),
            signal:controller&&controller.signal});
        }catch(error){
          var offline=typeof navigator!=='undefined'&&navigator.onLine===false;
          if(offline)throw Error('当前设备没有网络连接，请检查网络后重试。');
          if(error&&error.name==='AbortError')throw Error('联机服务器响应超时（12 秒）。请切换 Wi-Fi／移动数据后重试。');
          if(error instanceof TypeError||error&&/fetch|network|load failed/i.test(error.message||'')){
            throw Error('无法连接联机服务器。当前网络可能无法访问 workers.dev；请先点「检测联机网络」，或切换 Wi-Fi／移动数据重试。');
          }
          throw error;
        }
        var data=await res.json().catch(function(){return{};});
        if(!res.ok)throw Error(data.error || '房间服务返回错误（'+res.status+'）');
        return data;
      }finally{if(timer!==null)clearTimeout(timer);}
    }
    function connect(data,onEvent,isOwner) {
      manuallyClosed=true;
      if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
      if(socket){socket.onclose=null;socket.close();}
      code=data.code;token=data.token;owner=!!isOwner;callback=onEvent;
      reconnectAttempts=0;manuallyClosed=false;
      openSocket();
      return {code:code,token:token};
    }
    function openSocket() {
      if(manuallyClosed)return;
      var ws=endpoint.replace(/^http:/,'ws:').replace(/^https:/,'wss:')+'/api/rooms/'+code+'/ws?token='+encodeURIComponent(token);
      socket=new Socket(ws);
      socket.onopen=function(){
        reconnectAttempts=0;
        callback({type:'connected'});
      };
      socket.onmessage=function(e){
        try {
          var message=JSON.parse(e.data);
          if(message.type==='room_state'){currentState=message.room;callback({type:'state',room:message.room,owner:owner});}
          else if(message.type==='match_start'){callback({type:'started',room:message.room,owner:owner,side:message.side,firstSide:message.firstSide,sendAction:sendAction});}
          else if(message.type==='action_accepted'){callback({type:'action',action:message.action,by:message.by,revision:message.revision,game:message.game});}
          else if(message.type==='error'){callback({type:'error',message:message.error||'服务器拒绝此操作'});}
        }catch(error){callback({type:'error',message:'收到无效房间消息'});}
      };
      socket.onclose=function(){
        if(manuallyClosed)return;
        reconnectAttempts++;
        if(reconnectAttempts>12){callback({type:'close'});return;}
        callback({type:'reconnecting',attempt:reconnectAttempts});
        reconnectTimer=setTimeout(openSocket,Math.min(650*Math.pow(1.7,reconnectAttempts-1),12000));
      };
      socket.onerror=function(){callback({type:'error',message:'当前连接异常，正在尝试恢复。'});};
    }
    async function create(settings,onEvent) {
      var data=await post('/api/rooms',{settings:settings});
      try{if(typeof sessionStorage!=='undefined')sessionStorage.setItem('mmjj-room-'+data.code,data.token);}catch(_){}
      return connect(data,onEvent,true);
    }
    async function join(input,onEvent) {
      var roomCode=String(input||'').trim().toUpperCase();
      if(!/^[A-Z0-9]{6}$/.test(roomCode))throw Error('房间码必须是 6 位字母或数字');
      var prior=null;
      try{if(typeof sessionStorage!=='undefined')prior=sessionStorage.getItem('mmjj-room-'+roomCode);}catch(_){}
      var data=await post('/api/rooms/'+roomCode+'/join',{token:prior||null});
      try{if(typeof sessionStorage!=='undefined')sessionStorage.setItem('mmjj-room-'+roomCode,data.token);}catch(_){}
      return connect(data,onEvent,!!data.owner);
    }
    function send(message) {
      if(!socket || socket.readyState!==1)throw Error('当前未连接房间');
      socket.send(JSON.stringify(message));
    }
    function ready() {send({type:'ready'});}
    function start() {send({type:'start'});}
    function resign() {send({type:'resign'});}
    function rematch() {send({type:'rematch'});}
    function sendAction(action,revision) {send({type:'action',action:action,revision:revision});}
    function close() {
      manuallyClosed=true;
      if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
      if(socket){socket.onclose=null;socket.close();socket=null;}
      currentState=null;
    }
    return Object.freeze({create:create,join:join,ready:ready,start:start,resign:resign,rematch:rematch,sendAction:sendAction,close:close,
      getState:function(){return currentState;},getCode:function(){return code;},isOwner:function(){return owner;}});
  }
  async function checkConnection(endpoint){
    var base=String(endpoint||'').replace(/\/+$/,'');
    if(!/^https?:\/\//.test(base))throw Error('联机服务地址未配置');
    var controller=typeof AbortController!=='undefined'?new AbortController():null;
    var timer=controller?setTimeout(function(){controller.abort();},8000):null;
    try{
      var res=await fetch(base+'/api/health',{method:'GET',mode:'cors',cache:'no-store',
        signal:controller&&controller.signal});
      if(!res.ok)throw Error('联机服务响应异常（'+res.status+'）');
      var data=await res.json();
      if(!data.ok)throw Error('联机服务未就绪');
      return data;
    }catch(error){
      if(error.name==='AbortError')throw Error('联机检测超时。当前网络可能无法访问服务器，建议换 Wi-Fi／移动数据重试。');
      if(error instanceof TypeError)throw Error('当前网络无法访问联机服务器（workers.dev）。这不是房间码错误；可以换网络、检查 DNS 或使用可访问的网络重试。');
      throw error;
    }finally{if(timer!==null)clearTimeout(timer);}
  }
  return Object.freeze({createClient:createClient,checkConnection:checkConnection});
});
