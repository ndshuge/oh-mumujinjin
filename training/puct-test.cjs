"use strict";
const assert=require("assert"),lab=require("./train.cjs"),policy=require("./policy.cjs"),{search}=require("./puct.cjs");
const e=lab.engine;
let count=0;
for(let mapId=0;mapId<5;mapId++){
 const map=lab.mapGen(mapId);e.setRocks(map.rocks);
 const s={players:e.terrain.CAMPS.map(c=>({...c[1]})),dirs:[null,null],walls:[],left:[5,5]};
 for(let side=0;side<2;side++){
  const {list,ids}=policy.actions(e,s,side);
  assert(list.length>0);
  const used=new Set();
  list.forEach((a,i)=>{
   const idx=policy.encode(a),decoded=policy.decode(idx);
   assert(!used.has(idx));used.add(idx);
   assert.strictEqual(policy.encode(decoded),idx);
   assert.strictEqual(idx,ids[i]);
  });
  const now=Date.now(),result=search(e,s,side,{simulations:12});
  const duration=Date.now()-now;
  assert(result.action&&used.has(policy.encode(result.action)));
  assert.strictEqual(result.policySize,232);
  assert.strictEqual(result.visits.reduce((v,x)=>v+x.n,0),12);
  console.log("map",mapId,"side",side,"rocks",map.rocks.length,"legal",list.length,"ms",duration);
  count++;
 }
}
console.log("PASS:",count,"cross-map search cases, policy encoding and legal root actions");
