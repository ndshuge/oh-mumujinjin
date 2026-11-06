'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('iPhone: page CSS blocks native pinch/double tap while allowing one finger panning',()=>{
 const css=read('mobile.css');
 assert.match(css,/html\s*,\s*body\s*\{[^}]*touch-action:\s*pan-x\s+pan-y/s);
 assert.match(css,/button\s*,\s*a[^}]*touch-action:\s*manipulation/s);
});
test('early gesturestart and touchstart are canceled for two fingers; single-finger normal',()=>{
 const d={hooks:{},addEventListener(name,handler,opts){this.hooks[name]={handler,opts}}};
 vm.runInNewContext(read('viewport-guard.js'),{document:d});
 function event(n){return {touches:new Array(n).fill({}),cancelable:true,canceled:false,preventDefault(){this.canceled=true}}}
 let a=event(1),b=event(2);d.hooks.touchstart.handler(a);d.hooks.touchstart.handler(b);
 assert.equal(a.canceled,false);assert.equal(b.canceled,true);
 assert.equal(d.hooks.touchstart.opts.passive,false);
});
