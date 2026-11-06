/* Isolated local XiaoKe search; never runs search on the UI thread. */
'use strict';
self.importScripts('./xiaoke-ai-engine.js?v=xiaoke-20261106-1');
self.onmessage=function(e){
 const req=e.data||{};
 try{
  if(!Number.isInteger(req.id)||!req.state)throw Error('Invalid XiaoKe search request');
  const result=self.MMJJXiaokeEngine.decide({state:req.state,budgetMs:req.budgetMs});
  self.postMessage({id:req.id,ok:true,result});
 }catch(error){
  self.postMessage({id:req.id,ok:false,error:String(error&&error.message||error)});
 }
};
