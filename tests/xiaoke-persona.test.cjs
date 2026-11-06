'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPersona, QUOTE_POOL } = require('../xiaoke-persona.js');

test('所有小克的对白没有中文/英文，也不是意外解码坏字', () => {
  for (const [event, lines] of Object.entries(QUOTE_POOL)) {
    assert.ok(lines.length >= 3, event);
    for (const line of lines) {
      assert.ok(line.length >= 3, event);
      assert.doesNotMatch(line, /[\p{Script=Han}A-Za-z\uFFFD]/u);
    }
  }
});

test('连续触发要能看到乱码和颜文字两个类别，不重复刷同一句', () => {
  const persona = createPersona();
  const lines = Array.from({length: 8}, () => persona.nextLine('tap'));
  assert.ok(lines.some(line => /[░▒▓⌁⟡∿╳]/u.test(line)));
  assert.ok(lines.some(line => /[()（）]/u.test(line)));
  assert.ok(lines.every((line, i) => i === 0 || line !== lines[i-1]));
});

test('未知事件安全回退，角色称谓和未来模式不决定引擎', () => {
  const persona = createPersona();
  assert.equal(persona.name, '小克');
  assert.ok(QUOTE_POOL.move.includes(persona.nextLine('not-an-event')));
  assert.equal(typeof persona.chooseAction, 'undefined');
  assert.equal(typeof persona.setAILevel, 'undefined');
});
