'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('./map-collection.js');

function fixture(initial = {}) {
  const data = new Map(Object.entries(initial));
  const storage = {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value),
  };
  const normalize = map => map && Array.isArray(map.rocks) && typeof map.name === 'string' && map.version === 2
    ? { ...map, name: map.name.trim().slice(0, 40) } : null;
  const fingerprint = map => map.rocks.map(p => p.x + ':' + p.y).sort().join('|');
  return { store: createStore(storage, normalize, fingerprint), storage };
}
const map = (name, x) => ({ version: 2, name, rocks: [{ x, y: 3 }], portals: [], ice: [], boost: [] });

test('saves maps by terrain identity and preserves display names', () => {
  const { store } = fixture();
  store.save(map('峡谷攻防', 1));
  store.save(map('桥头对决', 2));
  assert.deepEqual(store.list().map(m => m.name), ['桥头对决', '峡谷攻防']);
  store.rename('1:3', '  新名字  ');
  assert.equal(store.list().find(m => m.rocks[0].x === 1).name, '新名字');
});

test('does not merge distinct maps with identical names', () => {
  const { store } = fixture();
  store.save(map('我的地图', 1));
  store.save(map('我的地图', 2));
  assert.equal(store.list().length, 2);
});

test('deleting a legacy map persists across reloads', () => {
  const data = { 'mumujinjin-custom-maps-v1': JSON.stringify([map('旧地图', 1)]) };
  const { store, storage } = fixture(data);
  assert.equal(store.list().length, 1);
  store.remove('1:3');
  assert.equal(store.list().length, 0);
  const again = createStore(storage, m => m && m.version === 2 ? m : null, m => m.rocks.map(p => p.x + ':' + p.y).join('|'));
  assert.equal(again.list().length, 0);
});

test('refuses invalid or blank names and keeps existing saved maps', () => {
  const { store } = fixture();
  assert.throws(() => store.save({ name: 'invalid', rocks: [] }));
  store.save(map('有效地图', 1));
  assert.throws(() => store.rename('1:3', '     '));
  assert.equal(store.list()[0].name, '有效地图');
});

test('updating an existing terrain keeps one card with its newest name', () => {
  const { store } = fixture();
  store.save(map('旧', 1));
  store.save(map('新', 1));
  assert.deepEqual(store.list().map(m => m.name), ['新']);
});
