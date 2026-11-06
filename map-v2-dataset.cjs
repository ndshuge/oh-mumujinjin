#!/usr/bin/env node
// Map V2 offline dataset generator and validator. Does not touch training algorithms.
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),assert=require('assert');
const source=fs.readFileSync(path.join(__dirname,'game.js'),'utf8');
function loadMapAPI(){
  const elements=new Map(),get=id=>{
    if(!elements.has(id))elements.set(id,{id,hidden:false,textContent:'',value:'',innerHTML:'',dataset:{},style:{},
      disabled:false,classList:{toggle(){},add(){}},addEventListener(){},setAttribute(){},appendChild(){},
      getBoundingClientRect:()=>({left:0,top:0,width:720,height:980})});
    return elements.get(id);
  };
  get('board').getContext=()=>new Proxy({}, {get:(o,k)=>typeof o[k]!=='undefined'?o[k]:()=>{}});
  const window={confirm:()=>true,setTimeout:()=>{}};
  const document={getElementById:get,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
  const store=new Map(),localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
  vm.runInNewContext(source,{window,document,localStorage,Set,Math,Number,JSON,
    TextEncoder,TextDecoder,Uint8Array,btoa,atob,console,location:{hash:'',origin:'http://localhost',pathname:'/'},
    navigator:{}},{filename:'game.js',timeout:20000});
  return window.MumuMapV2;
}
const api=loadMapAPI();
const argv=process.argv.slice(2);
function arg(k,def){let i=argv.indexOf('--'+k);return i>=0?argv[i+1]:def;}
function number(k,def){let n=Number(arg(k,def));if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid --'+k);return n;}
const train=number('train',700),validation=number('validation',150),holdout=number('holdout',150);
const seed=number('seed',20261105),count=train+validation+holdout;
if(count===0||count>10000)throw Error('Total must be in 1..10000');
const out=arg('out',null),accepted=[],seen=new Set(),rejected={};
const balanced=argv.includes('--balanced');
const profiles=balanced?[
 {rocks:6,portals:1,ice:5,boost:4,iceContinuity:0.35},
 {rocks:10,portals:3,ice:5,boost:4,iceContinuity:0.76},
 {rocks:16,portals:4,ice:8,boost:6,iceContinuity:0.9},
 {rocks:8,portals:0,ice:6,boost:4,iceContinuity:0.85},
 {rocks:14,portals:2,ice:7,boost:4,iceContinuity:0.45}
]:[
 {rocks:5,portals:1,ice:3,boost:2,iceContinuity:0.35},
 {rocks:10,portals:3,ice:5,boost:4,iceContinuity:0.76},
 {rocks:15,portals:4,ice:8,boost:5,iceContinuity:0.9},
 {rocks:9,portals:0,ice:6,boost:4,iceContinuity:0.85},
 {rocks:13,portals:2,ice:7,boost:3,iceContinuity:0.45}
];
const t0=Date.now(),retryLimit=count*8;
for(let i=0,attempt=0;i<count&&attempt<retryLimit;attempt++){
  const id=(seed+Math.imul(0x9e3779b9,attempt))>>>0;
  let map;
  try{map=(balanced?api.generateBalanced:api.generate)(id,profiles[i%profiles.length]);}
  catch(e){rejected[e.message]=(rejected[e.message]||0)+1;continue;}
  const result=api.validate(map);
  assert(result.ok,'Generator accepted illegal map seed '+id+': '+result.reason);
  const fp=api.fingerprint(map);
  const canonical=JSON.stringify([map.version,map.rulesVersion,map.rocks,map.portals,map.ice,map.boost]);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify([
    9,13,map.rulesVersion,
    map.rocks.map(p=>[p.x,p.y]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),
    map.portals.map(g=>[g.a,g.b].map(p=>[p.x,p.y]).sort((a,b)=>a[0]-b[0]||a[1]-b[1])).sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:JSON.stringify(a)>JSON.stringify(b)?1:0),
    map.ice.map(p=>[p.x,p.y]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),
    map.boost.map(p=>[p.x,p.y]).sort((a,b)=>a[0]-b[0]||a[1]-b[1])
  ])).digest('hex'),fp,'SHA-256 mismatch at '+id);
  if(seen.has(fp)){rejected.duplicate=(rejected.duplicate||0)+1;continue;}
  seen.add(fp);
  assert.equal(map.seed,id);
  assert(api.fingerprint(api.reproduce(map))===fp,'Seed replay mismatch '+id);
  accepted.push({fingerprint:fp,seed:id,map:api.normalize(map),metrics:api.metrics(map)});
  i++;
  if(i%100===0)console.log('checked',i+'/'+count,'elapsed_ms',Date.now()-t0);
}
assert.equal(accepted.length,count,'Did not produce required unique valid maps');
const manifest={schema:'map-v2-dataset-1',rulesVersion:api.rulesVersion,generatorVersion:api.generatorVersion,mode:balanced?'balanced':'legacy',
  baseSeed:seed,counts:{train,validation,holdout},profiles:profiles,fingerprints:accepted.map(x=>x.fingerprint),
  uniqueCount:seen.size,elapsedMs:Date.now()-t0,rejections:rejected};
if(out){
  const dir=path.resolve(out);fs.mkdirSync(dir,{recursive:true});
  let from=0;
  for(const [name,n] of [['train',train],['validation',validation],['holdout',holdout]]){
    const rows=accepted.slice(from,from+n);from+=n;
    fs.writeFileSync(path.join(dir,name+'.jsonl'),rows.map(row=>JSON.stringify(row)).join('\n')+'\n','utf8');
  }
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({...manifest,fingerprints:undefined},null,2),'utf8');
}
console.log('PASS: full Map V2 unique dataset validation '+JSON.stringify({...manifest,fingerprints:undefined}));
