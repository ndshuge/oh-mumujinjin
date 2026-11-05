// Regression for portal pair IDs after deleting a middle pair under a fixed timestamp.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('game.js','utf8'),nodes=new Map(),storage={};
function el(id){
 if(!nodes.has(id))nodes.set(id,{id,hidden:false,textContent:'',value:'',innerHTML:'',style:{},dataset:{},disabled:false,
  classList:{toggle(){},add(){}},addEventListener(){},setAttribute(){},appendChild(){},
  getBoundingClientRect(){return {left:0,top:0,width:720,height:980}}});
 return nodes.get(id);
}
el('board').getContext=()=>new Proxy({},{get:(o,k)=>o[k]||(()=>{})});
const document={getElementById:el,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
const localStorage={getItem:k=>storage[k]||null,setItem:(k,v)=>storage[k]=v};
const window={confirm:()=>true,setTimeout:()=>{}};
const hook='window.test={openEditor,editCell,mapDraft,validateMap,setTool:(t)=>editorTool=t,clear:()=>{editorMap.rocks=[];editorMap.portals=[];editorMap.ice=[];editorMap.boost=[];editorRocks=editorMap.rocks;editorPendingPortal=null}};state=load()||newGame("classic");';
assert(src.includes('state=load()||newGame("classic");'));
vm.runInNewContext(src.replace('state=load()||newGame("classic");',hook),
 {window,document,localStorage,Set,Math,Number,JSON,Date:{now:()=>123456789},
 Uint8Array,TextEncoder,TextDecoder,btoa,atob,location:{origin:'https://test',pathname:'/',hash:''},navigator:{},console},
 {filename:'game.js'});
const t=window.test;
t.openEditor();t.clear();t.setTool('portal');
for(const [a,b] of [[{x:3,y:4},{x:3,y:5}],[{x:4,y:4},{x:4,y:5}],[{x:5,y:4},{x:5,y:5}]]){
 t.editCell(a);t.editCell(b);
}
assert.equal(t.mapDraft().portals.length,3);
t.setTool('erase');t.editCell({x:4,y:4});
assert.equal(t.mapDraft().portals.length,2);
t.setTool('portal');t.editCell({x:6,y:4});t.editCell({x:6,y:5});
const map=t.mapDraft(),ids=map.portals.map(p=>p.id);
assert.equal(map.portals.length,3);
assert.equal(new Set(ids).size,3,'Every portal pair ID must be unique even after deletion at the same millisecond');
assert(t.validateMap(map).ok,'The new pair should produce a valid map');
console.log('PASS: portal pair ID remains unique after delete-and-add with fixed Date.now',ids.join(','));
