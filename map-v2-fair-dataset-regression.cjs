'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert'),{spawnSync}=require('child_process');
const os=require('os'),out=fs.mkdtempSync(path.join(os.tmpdir(),'mumu-map-v2-balanced-'));
const result=spawnSync(process.execPath,['map-v2-dataset.cjs','--balanced','--train','9','--validation','3','--holdout','3','--out',out],{encoding:'utf8',timeout:30000});
assert.equal(result.status,0,result.stderr||result.stdout);
const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8'));
assert.equal(manifest.generatorVersion,'mapgen-v2-r3','dataset uses fair non-symmetric generator');
assert.equal(manifest.uniqueCount,15);
const hashes=new Set(),loc=p=>p.x+','+p.y;
for(const name of ['train','validation','holdout']){
 const lines=fs.readFileSync(path.join(out,name+'.jsonl'),'utf8').trim().split('\n');
 for(const line of lines){
  const row=JSON.parse(line),map=row.map;assert(!hashes.has(row.fingerprint),'duplicates between partitions');hashes.add(row.fingerprint);
  assert.equal(map.generation.type,'fair-asymmetric-r3');
  assert(row.metrics.fairnessGap<=2,"advanced path gap");
  const mirror=p=>({x:8-p.x,y:12-p.y});
  const mirrored=layers=>layers.every(layer=>map[layer].every(p=>map[layer].some(q=>loc(q)===loc(mirror(p)))));
  const links=new Set(map.portals.map(g=>[loc(g.a),loc(g.b)].sort().join('|')));
  const paired=map.portals.every(g=>links.has([loc(mirror(g.a)),loc(mirror(g.b))].sort().join('|')));
  assert(!(mirrored(['rocks','ice','boost'])&&paired),'no forced rotational symmetry'); }
}
fs.rmSync(out,{recursive:true});
console.log('PASS: balanced map train/validation/holdout split with disjoint SHA-256 keys');
