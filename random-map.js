/* Playable per-game map generator. Standalone for deterministic seed regression. */
(function(root){
 "use strict";
 function seeded(seed){var x=(seed>>>0)||0x9e3779b9;return function(){x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
 function signature(rocks){return rocks.map(function(p){return p.x+","+p.y;}).sort().join("|");}
 function generate(opts){
  var ok=opts.validate,blocked=opts.blocked,width=opts.width||9,height=opts.height||13,count=opts.count||10,
   seed=(opts.seed>>>0)||1,previous=opts.previous||"",tries=opts.tries||160;
  if(typeof ok!=="function"||typeof blocked!=="function")throw Error("Missing map safety checker");
  var all=[];for(var y=0;y<height;y++)for(var x=0;x<width;x++){var p={x:x,y:y};if(!blocked(p))all.push(p);}
  if(all.length<count)throw Error("Not enough unblocked tiles");
  var rng=seeded(seed);
  for(var attempt=0;attempt<tries;attempt++){
   var pool=all.slice(),rocks=[];
   for(var i=0;i<count;i++){var j=i+Math.floor(rng()*(pool.length-i)),tmp=pool[i];pool[i]=pool[j];pool[j]=tmp;rocks.push(pool[i]);}
   if(signature(rocks)===previous)continue;
   if(ok(rocks))return {rocks:rocks,seed:seed,attempt:attempt+1,signature:signature(rocks),fallback:false};
  }
  var fallback=(opts.fallback||[]).map(function(p){return{x:p.x,y:p.y};});
  if(fallback.length&&ok(fallback))return {rocks:fallback,seed:seed,attempt:tries,signature:signature(fallback),fallback:true};
  throw Error("No playable initial layout, refusing to start invalid game");
 }
 root.MumuRandomMap=Object.freeze({generate:generate,signature:signature,seeded:seeded});
})(typeof window!=="undefined"?window:globalThis);
