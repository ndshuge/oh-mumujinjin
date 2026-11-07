const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const hub=()=>fs.readFileSync('friends-hub.js','utf8');
test('map center offers obvious creation button and opens blank editor draft',()=>{
 const s=hub();assert.match(s,/id="mmjjCreateMap"/);assert.match(s,/mmjjCreateMap'\)\.addEventListener/);
 assert.match(s,/clickGame\('mapEditorButton'\)/);assert.match(s,/clickGame\('editorClear'\)/);
});
test('creating a map never deletes existing maps or saves an empty draft implicitly',()=>{
 const s=hub();const block=s.slice(s.indexOf('function createNewMap'),s.indexOf('function createNewMap')+650);
 assert.doesNotMatch(block,/store\.remove|store\.save/);
 assert.match(block,/mmjjMapDetail/);
});
