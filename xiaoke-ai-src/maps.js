'use strict';
// 地图（岩石布局）生成：与游戏工坊约束一致——岩石不得落在营地/传送门/冰面/加速带，且每个营地格在无墙时可到达对方营地（两种玩法都要求）。
const E = require('./engine');

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }

function mapConnected(rocks, layout = null) {
  for (const variant of ['classic', 'advanced']) {
    const geo = E.makeGeo(rocks, variant, layout), st = E.newGame(geo);
    for (let p = 0; p < 2; p++) {
      const g = E.distField(geo, st.block, p);
      for (const c of geo.home[p]) if (g[c * 5] === E.INF) return false;
    }
  }
  return true;
}

function randomMap(seed, opts = {}) {
  const r = rng(seed), lo = opts.minRocks ?? 6, hi = opts.maxRocks ?? 18;
  const fixed = E.makeGeo([], 'advanced').fixed;
  for (let attempt = 0; attempt < 1000; attempt++) {
    const n = lo + Math.floor(r() * (hi - lo + 1)), set = new Set();
    while (set.size < n) { const c = Math.floor(r() * E.N); if (!fixed[c]) set.add(c); }
    const rocks = [...set].sort((a, b) => a - b).map(c => [E.cx(c), E.cy(c)]);
    if (mapConnected(rocks)) return { name: `seed-${seed}`, seed, rocks };
  }
  throw new Error('map gen failed');
}

// 地图集：tag 决定种子空间。dev 用于调参；sealed 在冻结后由冻结哈希派生。
function mapSet(tag, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push({ ...randomMap(hashStr(tag + ':' + i)), name: `${tag}-${i}` });
  return out;
}
const DEFAULT_MAP = { name: 'default', rocks: E.DEFAULT_ROCKS.map(r => r.slice()) };

/*
 * “类 Map V2”随机布局（假设性压力测试用，不是官方 V2 规则）：营地固定；3 对传送门、5 个冰面、4 个加速带、6–18 个岩石
 * 都随机放在互不重叠的非营地格上；只要求每个营地格在两种玩法、无墙时都能到达对方营地。官方 V2 的数量/约束可能不同。
 * 地图对象带 layout 字段，makeGeo(map.rocks, variant, map.layout) 使用。
 */
function randomLayoutMap(seed, opts = {}) {
  const r = rng(seed), home = E.makeGeo([], 'classic').home, camp = new Set([...home[0], ...home[1]]);
  const nP = opts.portals ?? 3, nI = opts.ice ?? 5, nB = opts.boost ?? 4, lo = opts.minRocks ?? 6, hi = opts.maxRocks ?? 18;
  for (let attempt = 0; attempt < 2000; attempt++) {
    const used = new Set(camp);
    const pick = () => { let c; do { c = Math.floor(r() * E.N); } while (used.has(c)); used.add(c); return [E.cx(c), E.cy(c)]; };
    const portals = []; for (let i = 0; i < nP; i++) portals.push([pick(), pick()]);
    const ice = []; for (let i = 0; i < nI; i++) ice.push(pick());
    const boost = []; for (let i = 0; i < nB; i++) boost.push(pick());
    const n = lo + Math.floor(r() * (hi - lo + 1)), rocks = [];
    for (let i = 0; i < n; i++) rocks.push(pick());
    const layout = { portals, ice, boost };
    if (mapConnected(rocks, layout)) return { name: `v2-${seed}`, seed, rocks, layout };
  }
  throw new Error('layout map gen failed');
}
function layoutMapSet(tag, count, opts) {
  const out = [];
  for (let i = 0; i < count; i++) out.push({ ...randomLayoutMap(hashStr('v2:' + tag + ':' + i), opts), name: `${tag}-${i}` });
  return out;
}

module.exports = { rng, hashStr, randomMap, mapSet, mapConnected, randomLayoutMap, layoutMapSet, DEFAULT_MAP };
