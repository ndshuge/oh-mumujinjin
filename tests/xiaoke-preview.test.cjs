'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('入口属于额外预览按钮，不伪装为可玩 AI 难度', () => {
  const html = read('index.html');
  assert.match(html, /id="xiaokePreviewBtn"/);
  assert.match(html, /id="xiaokePreviewDialog"/);
  const selector = html.match(/<div class="ai-levels"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(selector);
  assert.match(selector[1], /id="ai-xiaoke"/);
  assert.match(html, /xiaoke-persona\.js/);
  assert.match(html, /xiaoke-preview\.js/);
  assert.match(html, /claude-avatar\.svg/);
});

test('角色预览代码不得接管游戏的难度与走子引擎', () => {
  const ui = read('xiaoke-preview.js');
  assert.match(ui, /showModal/);
  assert.match(ui, /nextLine/);
  assert.doesNotMatch(ui, /setAILevel|chooseAction|\.aiLevel\s*=|\.variant\s*=/);
});

test('减弱动效偏好需取消持续动画', () => {
  const css = read('xiaoke-preview.css');
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /animation\s*:\s*none\s*!important/);
});
