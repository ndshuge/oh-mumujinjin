'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('二指阻止缩放，一指仍可滑动，触控监听是非 passive',()=>{
  const hooks={};
  const document={addEventListener:(name,handler,options)=>{hooks[name]={handler,options}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','viewport-guard.js'),'utf8'),{document});
  const e=touches=>({cancelable:true,touches,prevented:false,preventDefault(){this.prevented=true}});
  const one=e([{}]),two=e([{},{}]);
  hooks.touchmove.handler(one);assert.equal(one.prevented,false);
  hooks.touchmove.handler(two);assert.equal(two.prevented,true);
  assert.equal(hooks.touchmove.options.passive,false);
  for(const name of ['gesturestart','gesturechange','gestureend']){
    const event=e([]);hooks[name].handler(event);assert.equal(event.prevented,true);
    assert.equal(hooks[name].options.passive,false);
  }
  const scroll=e([]);scroll.ctrlKey=false;hooks.wheel.handler(scroll);assert.equal(scroll.prevented,false);
  scroll.ctrlKey=true;hooks.wheel.handler(scroll);assert.equal(scroll.prevented,true);
});
