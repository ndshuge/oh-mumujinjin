'use strict';
const fs=require('fs'),p=require('path'),crypto=require('crypto');
const root=p.resolve(__dirname,'..'),dst=p.join(root,'xiaoke-ai-src'),
source='E:/CHATGPT/_tmp/zhongdi-ai-fiveway-league-20261105/v2/participants';
const modules=['engine','analysis','threat','maps','endgame','protocol','agents/ab','agents/baselines'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const specs={classic:p.join(source,'C-ab8-policies-20261106','ab8-e2rc.json'),
advanced:p.join(source,'C-ab8-combined-20261106','ab8-combined.json')};
const manifest={modules:{},policies:{}};const policies={};
function pin(a,b){fs.mkdirSync(p.dirname(b),{recursive:true});if(!fs.existsSync(b))fs.copyFileSync(a,b,fs.constants.COPYFILE_EXCL);
const src=fs.readFileSync(a),copy=fs.readFileSync(b);if(!src.equals(copy))throw Error('Source mismatch '+a);return sha(copy)}
for(const id of modules)manifest.modules[id]=pin(p.join(source,'C-ab7-v2-20261106','src',id+'.js'),p.join(dst,id+'.js'));
for(const [key,file] of Object.entries(specs)){const dest=p.join(dst,'policy-'+key+'.json');manifest.policies[key]=pin(file,dest);policies[key]=JSON.parse(fs.readFileSync(dest,'utf8'))}
if(policies.classic.label!=='ab8-e2rc'||policies.advanced.label!=='ab8')throw Error('Unexpected strategies');
let s='/* XiaoKe original C model, bundled from SHA-locked source. */\n(function(root){"use strict";const process={env:{}};const modules={\n';
for(const id of modules){s+=JSON.stringify(id)+':function(require,module,exports){\n'+fs.readFileSync(p.join(dst,id+'.js'),'utf8')+'\n},\n'}
s+='};const cache={};function load(id){if(cache[id])return cache[id].exports;const f=modules[id];if(!f)throw Error("Missing module "+id);const m={exports:{}};cache[id]=m;f(req=>{if(req[0]!==".")throw Error("External require: "+req);const path=id.split("/");path.pop();for(const part of req.split("/")){if(part===".." )path.pop();else if(part!=="."&&part)path.push(part)}return load(path.join("/"));},m,m.exports);return m.exports;}\n';
s+='const P=load("protocol"),AB=load("agents/ab");const policies='+JSON.stringify(policies)+';';
s+='const agents={classic:AB.makeAB(policies.classic),advanced:AB.makeAB(policies.advanced)};';
s+='root.MMJJXiaokeEngine=Object.freeze({policy:mode=>policies[mode]||null,decide:req=>{const mode=req?.state?.variant;if(!agents[mode])throw Error("Invalid variant");return P.decide({state:req.state,timeBudgetMs:Math.max(250,Math.min(8000,req.budgetMs||3000))},agents[mode]);}});';
s+='})(typeof self==="object"?self:globalThis);\n';
fs.writeFileSync(p.join(root,'xiaoke-ai-engine.js'),s);manifest.bundleSha256=sha(Buffer.from(s));fs.writeFileSync(p.join(root,'xiaoke-ai-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({bundleKB:Math.round(Buffer.byteLength(s)/1024),manifest}));
