'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('game.js','utf8'),legacy=JSON.parse(fs.readFileSync('docs/map-legacy-20261105.json','utf8')).r2;
const mem={'mumujinjin-active-map-v2':JSON.stringify(legacy),'mumujinjin-layout-mode-v2':'random-battle'},elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',value:'',style:{},dataset:{},classList:{toggle(){},add(){}},addEventListener(){},setAttribute(){},appendChild(){},getBoundingClientRect(){return{left:0,top:0,width:720,height:980}}});return elements.get(id)}
el('board').getContext=()=>new Proxy({},{get:()=>()=>{}});
const document={getElementById:el,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}},window={confirm:()=>true,setTimeout:()=>{}};
const hook='window.cacheCheck={getMap,auditFairMap,mapFingerprint,defaultMap};state=load()||newGame("classic");';
vm.runInNewContext(src.replace('state=load()||newGame("classic");',hook),{window,document,localStorage:{getItem:k=>mem[k]||null,setItem:(k,v)=>mem[k]=v},Math,JSON,Number,Set,Date,Uint8Array,TextEncoder,TextDecoder,atob,btoa,console,navigator:{},location:{hash:'',origin:'http://test',pathname:'/'}});
const current=window.cacheCheck.getMap();
assert(window.cacheCheck.auditFairMap(current).ok,'cached R2 pre-match map must be replaced by fair R3');
assert.equal(current.generatorVersion,'mapgen-v2-r3','new map should be generated for fresh match');
assert.notEqual(window.cacheCheck.mapFingerprint(current),window.cacheCheck.mapFingerprint(legacy));
console.log('PASS_LEGACY_SYMMETRIC_PREMATCH_CACHE_MIGRATION');
