'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const collection=require('../map-collection.js'),repair=require('../map-repair.js');
const mem=new Map(),storage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)};
const valid=m=>m&&typeof m.name==='string'?m:null;
const fingerprint=m=>String(m.seed||0)+':'+(m.rocks||[]).map(x=>x.x+','+x.y).join('|');
const old={version:2,rulesVersion:'map-v2-r1',name:'均衡随机战场',seed:12,generatorVersion:'mapgen-v2-r2',
 generation:{type:'balanced-r2'},rocks:[{x:1,y:1},{x:7,y:11}],ice:[],boost:[],portals:[]};
const custom={...old,name:'我的手工棋盘',seed:13,generatorVersion:'handmade',generation:null};
test('auto-migrates only legacy generated unfair maps, keeps backup and does not alter handmade maps',()=>{
 mem.clear();mem.set(collection.KEY,JSON.stringify([old,custom]));
 const store=collection.createStore(storage,valid,fingerprint);
 const api={auditFair:m=>({ok:m.generatorVersion==='mapgen-v2-r3'}),
  generateBalanced:seed=>({...old,seed,name:'新图',generatorVersion:'mapgen-v2-r3',rocks:[{x:3,y:4}]})};
 const result=repair.migrate(store,api,storage);
 assert.equal(result.length,1);
 const maps=store.list();
 assert.equal(maps.length,2);
 assert.ok(maps.some(m=>m.name==='均衡随机战场'&&m.generatorVersion==='mapgen-v2-r3'));
 assert.ok(maps.some(m=>m.name==='我的手工棋盘'&&m.generatorVersion==='handmade'));
 assert.equal(JSON.parse(mem.get(repair.BACKUP_KEY)).length,1);
 assert.equal(repair.migrate(store,api,storage).length,0);
});
