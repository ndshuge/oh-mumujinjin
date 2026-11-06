/* Browser-only XiaoKe worker coordinator. Fail visibly, never silently downgrade AI. */
(function(root){'use strict';
 let worker=null,seq=0,pending=new Map();
 function failAll(err){for(const item of pending.values()){clearTimeout(item.timeout);item.reject(err);}pending.clear();}
 function getWorker(){
  if(worker)return worker;
  if(typeof Worker!=='function')throw Error('当前浏览器不支持 Web Worker');
  const w=new Worker('./xiaoke-ai-worker.js?v=xiaoke-20261106-1');
  w.onmessage=function(e){
   const data=e.data||{},item=pending.get(data.id);
   if(!item)return;pending.delete(data.id);clearTimeout(item.timeout);
   if(data.ok)item.resolve(data.result);
   else item.reject(Error(data.error||'AI 搜索失败'));
  };
  w.onerror=function(e){
   failAll(Error('小克搜索线程出错：'+(e.message||'unknown')));
   w.terminate();if(worker===w)worker=null;
  };
  worker=w;return worker;
 }
 const api=Object.freeze({
  choose:function(req){
   let w;try{w=getWorker();}catch(e){return Promise.reject(e);}
   const id=++seq;
   return new Promise(function(resolve,reject){
    const timeout=setTimeout(function(){
     const item=pending.get(id);if(!item)return;
     pending.delete(id);reject(Error('小克搜索超时，请重开本局'));
     if(worker){worker.terminate();worker=null;}
     failAll(Error('小克搜索进程已重启'));
    },20000);
    pending.set(id,{resolve,reject,timeout});
    try{w.postMessage({...req,id});}
    catch(e){pending.delete(id);clearTimeout(timeout);reject(e);}
   });
  },
  reset:function(){
   if(worker){worker.terminate();worker=null;}
   failAll(Error('棋局变化，已取消上一轮搜索'));
  }
 });
 root.MMJJXiaokeAI=api;
})(window);
