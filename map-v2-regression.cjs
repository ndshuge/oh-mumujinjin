// Map V2 red-green behavioral regression; isolate game code in Node VM.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('game.js','utf8'), mem={},listeners={},nodes=new Map();
const el=id=>{if(!nodes.has(id))nodes.set(id,{id,hidden:false,style:{},value:'',textContent:'',dataset:{},disabled:false,innerHTML:'',classList:{toggle(){},add(){}},addEventListener(k,f){listeners[id+':'+k]=f},setAttribute(){},appendChild(){},getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});return nodes.get(id)};
el('board').getContext=()=>new Proxy({},{get:(o,k)=>k in o?o[k]:()=>{}});
const doc={getElementById:el,querySelectorAll:()=>[],createElement:()=>({value:'',textContent:''}),addEventListener(){}};
const localStorage={getItem:k=>mem[k]||null,setItem:(k,v)=>mem[k]=v};
const window={confirm:()=>true,setTimeout:()=>{}};
const probe='window.test={auditFairMap,rotationallySymmetricMap,defaultMap,cleanMap,validateMap,mapFingerprint,mapCurrent,installMap,findPath,portal,ice,boost,sha256,mapMetrics,randomMap,randomRocks,reproduceMap,openEditor,editCell,mapDraft,saveMap,shareMap,state:()=>state,mapMode:()=>mapMode};state=load()||newGame("classic");';
assert(src.includes('state=load()||newGame("classic");'));
vm.runInNewContext(src.replace('state=load()||newGame("classic");',probe),{window,document:doc,localStorage,Set,Math,Number,JSON,Uint8Array,TextEncoder,TextDecoder,btoa,atob,Date:{now:()=>123456789},location:{hash:'',origin:'https://test',pathname:'/'},navigator:{},console},{filename:'game.js'});
const t=window.test,copy=x=>JSON.parse(JSON.stringify(x));
const migrated=t.cleanMap({version:1,name:'旧地图',rocks:[{x:4,y:6}]});
assert(migrated&&migrated.version===2&&migrated.portals.length===3&&migrated.ice.length===5&&migrated.boost.length===4);
const hash=t.mapFingerprint(migrated);
assert(/^[0-9a-f]{64}$/.test(hash));
assert.equal(t.sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
const changed=copy(migrated),swap=changed.portals[0].b;changed.portals[0].b=changed.portals[1].b;changed.portals[1].b=swap;
assert(t.validateMap(changed).ok);
assert.notEqual(t.mapFingerprint(changed),hash,'Only portal pairing differs');
const renamed=copy(migrated);renamed.name='不同名称';assert.equal(t.mapFingerprint(renamed),hash);
const invalid=copy(migrated);invalid.portals[0].b=null;assert.equal(t.validateMap(invalid).code,'portal-pair');
const overlap=copy(migrated);overlap.ice.push(copy(overlap.rocks[0]));assert.equal(t.validateMap(overlap).code,'overlap');
const camp=copy(migrated);camp.boost.push({x:0,y:0});assert.equal(t.validateMap(camp).code,'camp');
const sealed=copy(migrated);sealed.rocks=Array.from({length:9},(_,x)=>({x,y:1}));assert(!t.validateMap(sealed).ok);
assert(t.installMap(changed));assert(t.portal(changed.portals[0].a));
const custom=copy(changed);custom.ice=[{x:4,y:6}];custom.boost=[{x:4,y:7}];custom.rocks=[];
assert(t.installMap(custom));t.state().variant='advanced';assert(t.ice({x:4,y:6})&&t.boost({x:4,y:7}));
assert(!t.ice(migrated.ice[0]));
const a=t.randomMap(20261105),b=t.randomMap(20261105);
assert(t.auditFairMap(t.defaultMap()).ok,'Official map must pass competitive audit');
assert(!t.rotationallySymmetricMap(t.defaultMap()),'Official map must be asymmetric');
for(const seed of [20261107,3212026,731337,2112026]){
 const candidate=t.randomMap(seed);assert(t.auditFairMap(candidate).ok,`seed ${seed} unfair`);
 assert(!t.rotationallySymmetricMap(candidate),`seed ${seed} symmetric`);
}
for(const seed of [20261107,123321]){
 const candidate=t.randomRocks(seed);assert(t.auditFairMap(candidate).ok,`rocks seed ${seed} unfair`);
 assert(!t.rotationallySymmetricMap(candidate),`rocks seed ${seed} symmetric`);
}
console.log('PASS: official and sampled generated maps are asymmetric, fair and playable');
assert.equal(t.mapFingerprint(a),t.mapFingerprint(b));assert.equal(JSON.stringify(a),JSON.stringify(b));
assert(t.validateMap(a).ok);assert.equal(a.portals.length,3);assert.equal(a.ice.length,5);assert.equal(a.boost.length,4);
assert(a.generation&&a.generation.parameters.rocks===10,'Generator parameters must survive');
assert(t.cleanMap(a).generation.parameters.portals===3,'Generator parameters survive JSON import');
assert.equal(t.mapFingerprint(t.reproduceMap(a)),t.mapFingerprint(a),'Seed+parameters reproduce exact terrain');
const obstacleOnly=t.randomRocks(12121);assert.equal(t.mapFingerprint(t.reproduceMap(obstacleOnly)),t.mapFingerprint(obstacleOnly),'Random obstacle mode reproduces');
assert.throws(()=>t.randomMap(1,{attempts:0}),/attempt/);
assert.throws(()=>t.randomMap(1,{timeLimitMs:-1}),/time/i);
assert(t.mapMetrics(a).ok);
assert(Number.isInteger(t.mapMetrics(a).usableBoostTiles),'Need exact boost utility metric');
assert(Number.isInteger(t.mapMetrics(a).iceDirectionalTiles),'Need exact ice momentum metric');
assert(Array.isArray(t.mapMetrics(a).portalShortcuts),'Need portal route advantage metric');
t.openEditor();el('editorName').value='工坊 V2';t.saveMap();
assert.equal(JSON.parse(mem['mumujinjin-custom-maps-v2']).length,1);
t.shareMap();assert(el('mapShareLink').value.startsWith('https://test/#map='));
console.log('PASS: V1 migration, dynamic terrain, SHA-256 portal pairing, strict validation, seeded random, save/share');

const fire=(id,event,e)=>{const fn=listeners[id+':'+event];assert(fn,'Missing bound '+id+':'+event);return fn(e||{})};
const tap=(x,y,id=41)=>{
  const e={pointerId:id,clientX:67.5+x*65+26,clientY:67.5+y*65+26,cancelable:true,preventDefault(){}};
  fire('board','pointerdown',e);fire('board','pointerup',e);fire('board','click',e);
};
fire('editorClear','click');
assert.equal(t.mapDraft().rocks.length,0);assert.equal(t.mapDraft().portals.length,0);
fire('editorPortal','click');tap(3,4);
assert.equal(t.mapDraft().portals.length,1);assert.equal(t.mapDraft().portals[0].b,null);
const savedBefore=mem['mumujinjin-custom-maps-v2'];
fire('editorSave','click');assert.equal(mem['mumujinjin-custom-maps-v2'],savedBefore,'Incomplete pair cannot save');
tap(3,5);assert.equal(t.mapDraft().portals.length,1);assert(t.mapDraft().portals[0].b);
fire('quickEditorIce','click'); // Board-adjacent compact toolbar must control drawing.
let down={pointerId:77,clientX:67.5+65*5+26,clientY:67.5+65*6+26,cancelable:true,preventDefault(){}};
fire('board','pointerdown',down);
fire('board','pointermove',{...down,clientX:down.clientX+65});
fire('board','pointerup',{...down,clientX:down.clientX+65});
assert.equal(t.mapDraft().ice.length,2,'Touch brush painted two adjacent ice cells');
fire('editorUndo','click');assert.equal(t.mapDraft().ice.length,1);
fire('editorRedo','click');assert.equal(t.mapDraft().ice.length,2);
fire('editorBoost','click');tap(4,9);assert.equal(t.mapDraft().boost.length,1);
fire('editorSelect','click');
let s={pointerId:88,clientX:67.5+65*4+26,clientY:67.5+65*9+26,cancelable:true,preventDefault(){}};
fire('board','pointerdown',s);fire('board','pointerup',{...s,clientX:s.clientX+65});
assert(t.mapDraft().boost.some(p=>p.x===5&&p.y===9),'Drag moved selected boost');
fire('editorErase','click');tap(5,9);assert.equal(t.mapDraft().boost.length,0);
fire('editorExport','click');assert(el('mapImportData').value.includes('"version": 2'));
const beforeRule=t.state().variant;
fire('mapRandomBattle','click');
assert.equal(t.mapMode(),'random-battle');
assert.equal(el('mapEditor').hidden,true,'Switching layout closes stale editing draft');
assert.equal(t.state().variant,beforeRule,'Map layout mode must not change game rules');
assert.equal(mem['mumujinjin-layout-mode-v2'],'random-battle');
console.log('PASS: editor portal pairing, touch brush, undo/redo, select drag, erase, export, independent map modes');
// Mobile map dock must operate real edit actions without scrolling to the full panel.
t.openEditor();fire('editorClear','click');
fire('mobileMapIce','click');tap(7,9);
assert.equal(t.mapDraft().ice.length,1,'Mobile dock ice tool paints');
fire('mobileMapUndo','click');assert.equal(t.mapDraft().ice.length,0,'Mobile dock undo works');
fire('mobileMapRedo','click');assert.equal(t.mapDraft().ice.length,1,'Mobile dock redo works');
// Map IDs must remain unique after deleting a middle pair and immediately adding another.
fire('editorClear','click');fire('editorPortal','click');
tap(3,4);tap(3,5);tap(4,4);tap(4,5);tap(5,4);tap(5,5);
fire('editorErase','click');tap(4,4);
fire('editorPortal','click');tap(6,4);tap(6,5);
assert.equal(t.mapDraft().portals.length,3);
assert.equal(new Set(t.mapDraft().portals.map(p=>p.id)).size,t.mapDraft().portals.length,'Portal IDs must be unique');
assert(t.validateMap(t.mapDraft()).ok,'New portal IDs must not collide with an existing pair');
