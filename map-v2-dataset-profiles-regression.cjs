const cp=require('child_process'),fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mumujinjin-map-v2-profiles-'));
try{
 const p=cp.spawnSync(process.execPath,[path.join(__dirname,'map-v2-dataset.cjs'),'--train','25','--validation','5','--holdout','5','--out',dir],{encoding:'utf8',timeout:15000});
 assert.equal(p.status,0,(p.stderr||'')+'\n'+(p.stdout||''));
 const sets={};for(const name of ['train','validation','holdout'])sets[name]=fs.readFileSync(path.join(dir,name+'.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.deepStrictEqual(sets.train.length,25);assert.deepStrictEqual(sets.validation.length,5);assert.deepStrictEqual(sets.holdout.length,5);
 const rows=Object.values(sets).flat();
 assert.equal(new Set(rows.map(r=>r.fingerprint)).size,35,'No cross-split collision');
 const densities=new Set(rows.map(r=>r.map.generation.parameters.rocks));
 const portalCounts=new Set(rows.map(r=>r.map.generation.parameters.portals));
 assert(densities.size>=3,'Generate varied densities for training');
 assert(portalCounts.size>=3,'Generate varied portal pairing counts for training');
 console.log('PASS: 35 deduped maps across three isolated splits, rock and portal profiles', [...densities],[...portalCounts]);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
