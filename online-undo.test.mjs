import test from 'node:test';
import assert from 'node:assert/strict';
import {recordActionForUndo,requestUndo,respondUndo,undoPublicState} from './online-undo.mjs';

const initial=()=>({
 status:'playing',revision:3,seatSide:[0,1],
 game:{phase:'play',turn:0,pending:null,moves:0,players:[{x:7,y:12},{x:1,y:0}]}
});
test('a move is saved only when a complete turn is committed',()=>{
 const r=initial(),before=structuredClone(r.game);
 r.game={...structuredClone(before),turn:1,moves:1,players:[{x:7,y:11},{x:1,y:0}]};r.revision++;
 recordActionForUndo(r,before,0);
 assert.equal(undoPublicState(r).undoAvailableBy,0);
 assert.equal(undoPublicState(r).undoRequest,null);
 assert.equal(undoPublicState(r).undoBefore,undefined);
});
test('a portal entry remains one unfinished turn until the portal choice is committed',()=>{
 const r=initial(),before=structuredClone(r.game);
 r.game={...structuredClone(before),pending:0,players:[{x:7,y:11},{x:1,y:0}]};r.revision++;
 recordActionForUndo(r,before,0);
 assert.equal(undoPublicState(r).undoAvailableBy,null);
 const mid=structuredClone(r.game);
 r.game={...mid,pending:null,turn:1,moves:1};r.revision++;
 recordActionForUndo(r,mid,0);
 assert.deepEqual(r.undoBefore,before);
 assert.equal(undoPublicState(r).undoAvailableBy,0);
});
test('undo requires the last actor to request and the opposite seat to agree',()=>{
 const r=initial(),before=structuredClone(r.game);
 r.game={...structuredClone(before),turn:1,moves:1};r.revision=4;recordActionForUndo(r,before,0);
 assert.throws(()=>requestUndo(r,1,4),/最后一步|刚走|申请/);
 requestUndo(r,0,4);
 assert.throws(()=>respondUndo(r,0,true,4),/对方|双方/);
 assert.throws(()=>respondUndo(r,1,true,3),/版本/);
 assert.equal(r.game.moves,1);
 respondUndo(r,1,true,4);
 assert.deepEqual(r.game,before);
 assert.equal(r.revision,5);assert.equal(r.status,'playing');
 assert.equal(undoPublicState(r).undoAvailableBy,null);
 assert.equal(undoPublicState(r).undoRequest,null);
});
test('rejection and request cancellation preserve the board without changing revision',()=>{
 const r=initial(),before=structuredClone(r.game);
 r.game={...structuredClone(before),turn:1,moves:1};r.revision=4;recordActionForUndo(r,before,0);
 requestUndo(r,0,4);respondUndo(r,1,false,4);
 assert.equal(r.revision,4);assert.equal(r.game.moves,1);
 requestUndo(r,0,4);respondUndo(r,0,false,4);
 assert.equal(r.revision,4);assert.equal(undoPublicState(r).undoRequest,null);
});
test('request cannot be replayed after a newer move; request blocks normal actions',()=>{
 const r=initial(),before=structuredClone(r.game);
 r.game={...structuredClone(before),turn:1,moves:1};r.revision=4;recordActionForUndo(r,before,0);
 requestUndo(r,0,4);
 assert.throws(()=>requestUndo(r,0,4),/等待|申请/);
 assert.throws(()=>respondUndo(r,1,true,5),/版本/);
});
