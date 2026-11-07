import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch, applyAction} from './online-rules.mjs';
const map={version:2,rulesVersion:'map-v2-r1',name:'测试',rocks:[],portals:[],ice:[],boost:[]};

test('wood may choose its start first and remains the first mover',()=>{
  let s=newMatch(map,'classic',1);
  assert.equal(s.phase,'pick-defend');
  assert.throws(()=>applyAction(s,0,{kind:'origin',p:{x:7,y:12}}),/当前不是/);
  s=applyAction(s,1,{kind:'origin',p:{x:0,y:0}});
  assert.equal(s.phase,'pick-attack');
  s=applyAction(s,0,{kind:'origin',p:{x:7,y:12}});
  assert.equal(s.phase,'play');assert.equal(s.turn,1);
  assert.equal(s.players[1].x,0);
});
test('rejects illegal moves and enforces the active seat',()=>{
  let s=newMatch(map,'classic',0);
  s=applyAction(s,0,{kind:'origin',p:{x:7,y:12}});
  s=applyAction(s,1,{kind:'origin',p:{x:0,y:0}});
  assert.throws(()=>applyAction(s,1,{kind:'move',to:{x:0,y:1}}),/当前不是/);
  assert.throws(()=>applyAction(s,0,{kind:'move',to:{x:0,y:0}}),/不可/);
  s=applyAction(s,0,{kind:'move',to:{x:7,y:11}});
  assert.equal(s.turn,1);assert.equal(s.moves,1);
});
test('no client can place a wall over another wall',()=>{
  let s=newMatch(map,'classic',0);
  s=applyAction(s,0,{kind:'origin',p:{x:7,y:12}});
  s=applyAction(s,1,{kind:'origin',p:{x:0,y:0}});
  s=applyAction(s,0,{kind:'wall',wall:{x:4,y:5,o:'h'}});
  assert.equal(s.left[0],4);
  s=applyAction(s,1,{kind:'move',to:{x:0,y:1}});
  assert.throws(()=>applyAction(s,0,{kind:'wall',wall:{x:4,y:5,o:'h'}}),/不能/);
});
test('portal waits for arrival choice before switching turns',()=>{
  const portalMap={...map,portals:[{id:'portal-1',a:{x:7,y:11},b:{x:2,y:3}}]};
  let s=newMatch(portalMap,'classic',0);
  s=applyAction(s,0,{kind:'origin',p:{x:7,y:12}});
  s=applyAction(s,1,{kind:'origin',p:{x:0,y:0}});
  s=applyAction(s,0,{kind:'move',to:{x:7,y:11}});
  assert.equal(s.turn,0);assert.equal(s.pending,0);
  s=applyAction(s,0,{kind:'portal',warp:true});
  assert.deepEqual(s.players[0],{x:2,y:3});assert.equal(s.turn,1);
});
