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
      var res=await doFetch(endpoint+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});
      var data=await res.json().catch(function(){return{};});
      if(!res.ok)throw Error(data.error || '房间服务暂时不可用');
      return data;
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
  return Object.freeze({createClient:createClient});
});
