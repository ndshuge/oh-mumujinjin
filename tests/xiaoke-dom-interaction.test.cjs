'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createPersona, QUOTE_POOL } = require('../xiaoke-persona.js');

function element(id) {
  const listeners = {};
  const attributes = {};
  const classes = new Set();
  return {
    id, listeners, attributes, dataset: {},
    classList: { add: s => classes.add(s), remove: s => classes.delete(s) },
    textContent: '', open: false, offsetWidth: 88, focused: false,
    addEventListener: (event, fn) => { listeners[event] = fn; },
    setAttribute: (key, value) => { attributes[key] = value; },
    removeAttribute: key => { delete attributes[key]; },
    showModal() { this.open = true; },
    close() { this.open = false; },
    focus() { this.focused = true; },
    click(event = {}) { assert.ok(listeners.click, id + ' missing click handler'); listeners.click(event); }
  };
}

test('小克预览可打开、切换纯符号台词、关闭且不修改现有游戏状态', () => {
  const ids = ['xiaokePreviewBtn','xiaokePreviewDialog','xiaokeNextLine','xiaokeClose','xiaokeSpeech','xiaokeAvatar'];
  const nodes = Object.fromEntries(ids.map(id => [id, element(id)]));
  const emotion = element('emotion');
  emotion.dataset.xiaokeEvent = 'wall';
  const state = {aiLevel:'zhongdi', variant:'advanced', moves:4};
  const doc = {
    getElementById: id => nodes[id] || null,
    querySelectorAll: selector => selector === '[data-xiaoke-event]' ? [emotion] : []
  };
  const script = fs.readFileSync(path.join(__dirname, '..', 'xiaoke-preview.js'), 'utf8');
  vm.runInNewContext(script, {document:doc,window:{
    MMJJXiaokePersona: {createPersona,QUOTE_POOL},
    matchMedia: () => ({ matches:true }),
    state
  }});
  nodes.xiaokePreviewBtn.click();
  assert.equal(nodes.xiaokePreviewDialog.open, true);
  const a = nodes.xiaokeSpeech.textContent;
  assert.ok(QUOTE_POOL.opening.includes(a));
  nodes.xiaokeNextLine.click();
  const b = nodes.xiaokeSpeech.textContent;
  assert.notEqual(b,a);
  assert.doesNotMatch(b, /[A-Za-z\p{Script=Han}]/u);
  emotion.click();
  assert.ok(QUOTE_POOL.wall.includes(nodes.xiaokeSpeech.textContent));
  assert.equal(emotion.attributes['aria-pressed'], 'true');
  nodes.xiaokeClose.click();
  assert.equal(nodes.xiaokePreviewDialog.open,false);
  assert.equal(nodes.xiaokePreviewBtn.focused,true);
  assert.deepEqual(state,{aiLevel:'zhongdi',variant:'advanced',moves:4});
});
