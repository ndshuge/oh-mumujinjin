import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch,applyAction,movementOptions} from '../online-rules.mjs';
const map={version:2,rulesVersion:'map-v2-r1',name:'screen-trap-repro',rocks:[{x:4,y:12},{x:6,y:11}],ice:[],boost:[],portals:[]};
function state(wall){
 const s=newMatch(map,'classic',0);
 s.phase='play';s.turn=0;s.players=[{x:7,y:12},{x:5,y:12}];s.left=[4,5];
 s.walls=[{...wall,owner:0}];return s;
}
test('screenshot bottom-row trap must be rejected when horizontal wall is laid second',()=>{
 const s=state({x:5,y:11,o:'v'});
 assert.throws(()=>applyAction(s,0,{kind:'wall',wall:{x:4,y:11,o:'h'}}),/不能|筑墙|路径/);
});
test('screenshot bottom-row trap must be rejected when vertical wall is laid second',()=>{
 const s=state({x:4,y:11,o:'h'});
 assert.throws(()=>applyAction(s,0,{kind:'wall',wall:{x:5,y:11,o:'v'}}),/不能|筑墙|路径/);
});
test('the visually boxed wood F1 square has zero exits',()=>{
 const s=state({x:4,y:11,o:'h'});
 s.walls.push({x:5,y:11,o:'v',owner:0});
 assert.equal(movementOptions(s,{x:5,y:12},null,s.walls).length,0);
});
