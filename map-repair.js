/* One-time repair of pre-r3 generated maps that fail modern competitive rules.
 * Preserve originals in backup storage; do not alter intentional custom creations. */
(function (root, factory) {
  if (typeof module==='object'&&module.exports)module.exports=factory();
  else root.MumuCompetitiveMaps=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const BACKUP_KEY='mumujinjin-legacy-competitive-backups-v1';
  function legacyGenerated(m){
    const type=m&&m.generation&&m.generation.type||'';
    return /^balanced-r[12]$|^random-rocks-r[12]$|^fair-rocks-r2$/.test(type) ||
      (!!m && /^均衡随机战场$/.test(m.name) && m.generatorVersion!=='mapgen-v2-r3');
  }
  function repairedMap(map,api,identity){
    const id=identity(map);
    const seed=parseInt(String(id).slice(0,8),16)>>>0;
    for(let trial=0;trial<5;trial++){
      const fresh=api.generateBalanced((seed+trial*98761)>>>0);
      const named=Object.assign({},fresh,{name:map.name});
      if(api.auditFair(named).ok)return named;
    }
    throw Error('暂时无法生成公平地图');
  }
  function migrate(store,api,storage){
    const changed=[];
    for(const item of store.list()){
      if(!legacyGenerated(item) || api.auditFair(item).ok)continue;
      const id=store.identity(item);
      let replacement;
      try{replacement=repairedMap(item,api,store.identity);}catch(_){continue;}
      // Backup before modifying the original map; write failure leaves the original untouched.
      let archive=[];
      try{archive=JSON.parse(storage.getItem(BACKUP_KEY)||'[]');}catch(_){}
      if(!Array.isArray(archive))archive=[];
      if(!archive.some(x=>x.fingerprint===id))archive.push({fingerprint:id,map:item});
      try{storage.setItem(BACKUP_KEY,JSON.stringify(archive.slice(-30)));}catch(_){continue;}
      store.remove(id);store.save(replacement);
      changed.push({old:id,now:store.identity(replacement),name:item.name});
    }
    return changed;
  }
  return Object.freeze({legacyGenerated,repairedMap,migrate,BACKUP_KEY});
});
