'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('game.js','utf8'),nodes=new Map(),storage={};
const el=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,style:{},dataset:{},value:'',textContent:'',classList:{toggle(){}},addEventListener(){},appendChild(){},setAttribute(){},getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});return nodes.get(id)};
el('board').getContext=()=>new Proxy({},{get:()=>()=>{}});
const document={getElementById:el,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
const localStorage={getItem:k=>storage[k]||null,setItem:(k,v)=>storage[k]=v};
const window={confirm:()=>true,setTimeout:()=>{}};
const hook='window.fairProbe={installMap,mapFingerprint,mapCurrent,randomMap,validateMap,auditFairMap,defaultMap};state=load()||newGame("classic");';
vm.runInNewContext(source.replace('state=load()||newGame("classic");',hook),
 {window,document,localStorage,Math,Number,Date,JSON,Set,Uint8Array,TextEncoder,TextDecoder,btoa,atob,location:{origin:'http://t',pathname:'/',hash:''},navigator:{},console});
const x=window.fairProbe,good=x.randomMap(391213),unfair=JSON.parse(fs.readFileSync('docs/map-legacy-20261105.json','utf8')).r2;
assert(x.validateMap(unfair).ok,'legacy symmetrical map must be structurally valid');
assert.equal(x.auditFairMap(unfair).ok,false,'exact symmetry cannot pass new competitive certification');
assert(x.installMap(good,'custom'),'fair custom map should be playable');
const before=x.mapFingerprint(x.mapCurrent());
assert.equal(x.installMap(unfair,'custom'),false,'unfair custom terrain may be saved but not activated for competitive play');
assert.equal(x.mapFingerprint(x.mapCurrent()),before,'a rejected map must leave current match intact');
console.log('PASS_CUSTOM_FAIRNESS_GATE');
