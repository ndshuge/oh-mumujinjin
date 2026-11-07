import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,applyIntent,viewFor,codeToGroup} from './cn-room-core.mjs';

const map={version:2,rulesVersion:'map-v2-r1',name:'国内好友测试',rocks:[],ice:[],boost:[],portals:[]};
const settings={map,variant:'classic',side:'gold',first:'host'};
test('room code maps to a reserved Meeting group without a secret',()=>{
 assert.equal(codeToGroup('4ZV9KH'),'MMJJ_4ZV9KH');
 assert.throws(()=>codeToGroup('1'),/房间码/);
});
test('two-player room refuses third actor and premature start',()=>{
 let room=createRoom('ABC987','h',settings);
 assert.equal(room.status,'waiting');
 assert.throws(()=>applyIntent(room,'h',{type:'start'}),/准备/);
 room=applyIntent(room,'g',{type:'join'});
 assert.equal(room.players[1].id,'g');
 assert.throws(()=>applyIntent(room,'third',{type:'join'}),/已满/);
 room=applyIntent(room,'h',{type:'ready'});
 room=applyIntent(room,'g',{type:'ready'});
 assert.equal(room.status,'ready');
 room=applyIntent(room,'h',{type:'start'});
 assert.equal(room.status,'playing');
 assert.deepEqual(room.seatSide,[0,1]);
 assert.equal(room.game.phase,'pick-attack');
});
test('host validates all actions; snapshots carry canonical state and revision',()=>{
 let room=createRoom('ABC987','h',settings);
 room=applyIntent(room,'g',{type:'join'});
 room=applyIntent(room,'h',{type:'ready'});
 room=applyIntent(room,'g',{type:'ready'});
 room=applyIntent(room,'h',{type:'start'});
 assert.throws(()=>applyIntent(room,'g',{type:'action',revision:0,action:{kind:'origin',p:{x:0,y:0}}}),/回合/);
 room=applyIntent(room,'h',{type:'action',revision:0,action:{kind:'origin',p:{x:7,y:12}}});
 assert.equal(room.revision,1);
 assert.throws(()=>applyIntent(room,'g',{type:'action',revision:0,action:{kind:'origin',p:{x:0,y:0}}}),/版本/);
 room=applyIntent(room,'g',{type:'action',revision:1,action:{kind:'origin',p:{x:0,y:0}}});
 room=applyIntent(room,'h',{type:'action',revision:2,action:{kind:'move',to:{x:7,y:11}}});
 assert.equal(room.revision,3);
 assert.equal(viewFor(room,'g').game.players[0].y,11);
});
test('resignation and rematch require distinct affirmative votes',()=>{
 let room=createRoom('ABC987','h',settings);
 room=applyIntent(room,'g',{type:'join'});
 room=applyIntent(room,'h',{type:'ready'});room=applyIntent(room,'g',{type:'ready'});
 room=applyIntent(room,'h',{type:'start'});
 room=applyIntent(room,'h',{type:'resign'});
 assert.equal(room.status,'finished');assert.equal(room.game.winner,1);
 room=applyIntent(room,'h',{type:'rematch'});
 assert.equal(room.status,'finished');
 room=applyIntent(room,'g',{type:'rematch'});
 assert.equal(room.status,'playing');
 assert.deepEqual(room.seatSide,[1,0]);assert.equal(room.revision,0);
});
test('rejoining same identity retains original seat even when playing',()=>{
 let room=createRoom('ABC987','h',settings);
 room=applyIntent(room,'g',{type:'join'});
 room=applyIntent(room,'g',{type:'join'});
 assert.equal(room.players.length,2);
 assert.equal(room.players[1].id,'g');
});
