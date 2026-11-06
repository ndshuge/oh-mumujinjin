'use strict';
// 搜索共用的分析工具：距离场缓存（按墙集合）、正向 BFS、最短路 DAG 边、墙候选与 Δ、精确竞速结果。
const E = require('./engine');

class DistCache {
  constructor(geo, max = 40000) { this.geo = geo; this.map = new Map(); this.max = max; this.bfs = 0; }
  get(st) {
    const k = st.wallKey();
    let e = this.map.get(k);
    if (!e) {
      if (this.map.size >= this.max) this.map.clear();
      e = [E.distField(this.geo, st.block, 0, new Uint8Array(E.NS)), E.distField(this.geo, st.block, 1, new Uint8Array(E.NS))];
      this.map.set(k, e); this.bfs += 2;
    }
    return e;
  }
}

// 到达 move 落点后（可选择传送）的剩余距离
function arriveDist(geo, gp, m) {
  let d = gp[m.to * 5 + m.lock + 1];
  const pp = geo.portal[m.to];
  if (pp >= 0 && gp[pp * 5] < d) d = gp[pp * 5];
  return d;
}

// 正向 BFS（状态空间），深度上限 maxD。高级玩法用预计算走法模板（第六代），经典玩法用 moveOptions。
const _fq = new Int32Array(E.NS), _opts = [];
function forwardField(geo, block, startSid, maxD, out) {
  if (!geo.adv) return forwardFieldRef(geo, block, startSid, maxD, out);
  const f = out || new Uint8Array(E.NS), R = E.advGraph(geo);
  f.fill(E.INF); f[startSid] = 0;
  let qh = 0, qt = 0; _fq[qt++] = startSid;
  while (qh < qt) {
    const s = _fq[qh++], k = f[s] + 1;
    if (k > maxD) continue;
    for (let i = R.fhead[s]; i >= 0; i = R.fnext[i]) {
      const t = R.to[i];
      if (f[t] !== E.INF || !E.advAvail(R, i, block)) continue;
      f[t] = k; _fq[qt++] = t;
    }
  }
  return f;
}
// 参考实现（moveOptions 逐步展开；tests/dist.js 用它独立校验）
function forwardFieldRef(geo, block, startSid, maxD, out) {
  const f = out || new Uint8Array(E.NS);
  f.fill(E.INF); f[startSid] = 0;
  let qh = 0, qt = 0; _fq[qt++] = startSid;
  while (qh < qt) {
    const s = _fq[qh++], k = f[s] + 1;
    if (k > maxD) continue;
    E.moveOptions(geo, block, (s / 5) | 0, (s % 5) - 1, _opts);
    for (const m of _opts) {
      const t = m.to * 5 + m.lock + 1;
      if (f[t] === E.INF) { f[t] = k; _fq[qt++] = t; }
      const pp = geo.portal[m.to];
      if (pp >= 0 && f[pp * 5] === E.INF) { f[pp * 5] = k; _fq[qt++] = pp * 5; }
    }
  }
  return f;
}

// 玩家 p 在 slack 松弛内的路径边集合（edge = cell*4+dir）
const _ff = new Uint8Array(E.NS), _opts2 = [], _cf = new Uint8Array(E.N), _cq = new Int16Array(E.N);
// 经典玩法快速路径：只在格子上做 BFS
function pathEdgesClassic(st, p, gp, slack) {
  const geo = st.geo, nbr = geo.nbr, rock = geo.rock, portal = geo.portal, block = st.block;
  const start = st.pos[p], D = gp[start * 5], lim = D + slack, edges = [];
  if (D === E.INF) return edges;
  _cf.fill(E.INF); _cf[start] = 0;
  let qh = 0, qt = 0; _cq[qt++] = start;
  while (qh < qt) {
    const u = _cq[qh++], fu = _cf[u];
    if (fu + gp[u * 5] > lim || gp[u * 5] === 0) continue;
    const bu = block[u];
    for (let d = 0; d < 4; d++) {
      const v = nbr[u * 4 + d];
      if (v < 0 || rock[v] || (bu & (1 << d))) continue;
      let arr = gp[v * 5]; const q = portal[v];
      if (q >= 0 && gp[q * 5] < arr) arr = gp[q * 5];
      if (fu + 1 + arr > lim) continue;
      edges.push(u * 4 + d);
      if (_cf[v] === E.INF) { _cf[v] = fu + 1; _cq[qt++] = v; }
      if (q >= 0 && _cf[q] === E.INF) { _cf[q] = fu + 1; _cq[qt++] = q; }
    }
  }
  return edges;
}
function pathEdges(st, p, gp, slack = 0) {
  if (!st.geo.adv) return pathEdgesClassic(st, p, gp, slack);
  const geo = st.geo, start = st.sid(p), D = gp[start], edges = new Set();
  if (D === E.INF) return edges;
  forwardField(geo, st.block, start, D + slack, _ff);
  // 走法模板：每个模板的 e1/e2 就是 moveOptions 的 first 边与加速带第二步的边；传送落点是单独的模板，
  // 所以“任一落点满足松弛界”即加边，与旧版 arriveDist（取两种落点的较小者）等价。
  const R = E.advGraph(geo), block = st.block, lim = D + slack;
  for (let s = 0; s < E.NS; s++) {
    const fs = _ff[s];
    if (fs === E.INF || fs + gp[s] > lim || gp[s] === 0) continue;
    for (let i = R.fhead[s]; i >= 0; i = R.fnext[i]) {
      if (fs + 1 + gp[R.to[i]] > lim || !E.advAvail(R, i, block)) continue;
      edges.add(R.e1[i]);
      if (R.e2[i] >= 0) edges.add(R.e2[i]);
    }
  }
  return edges;
}

function slotsForEdges(st, edges, into) {
  const set = into || new Set();
  for (const e of edges) for (const s of E.EDGE_SLOTS[e]) if (!st.occ[s] && E.slotFree(st, s)) set.add(s);
  return set;
}

// 评估一个墙槽：返回 {s, d0, d1}（放墙后双方距离），非法返回 null。会写入缓存。
function wallEffect(st, cache, s) {
  E.setWall(st, s, true);
  const e = cache.get(st);
  const d0 = e[0][st.sid(0)], d1 = e[1][st.sid(1)];
  E.setWall(st, s, false);
  if (d0 === E.INF || d1 === E.INF) return null;
  return { s, d0, d1 };
}

// 进攻墙候选：切到对手 slack 内路径的墙，带 Δ。mover = 放墙方。
function wallCandidates(st, cache, mover, slack = 0, extraSlots = null) {
  const opp = 1 - mover, e = cache.get(st);
  const base = [e[0][st.sid(0)], e[1][st.sid(1)]];
  const slots = slotsForEdges(st, pathEdges(st, opp, e[opp], slack));
  if (extraSlots) for (const s of extraSlots) if (!st.occ[s] && E.slotFree(st, s)) slots.add(s);
  const out = [];
  for (const s of slots) {
    const r = wallEffect(st, cache, s);
    if (!r) continue;
    const dOpp = (opp === 0 ? r.d0 : r.d1) - base[opp], dMe = (mover === 0 ? r.d0 : r.d1) - base[mover];
    out.push({ s, dOpp, dMe, net: dOpp - dMe });
  }
  out.sort((a, b) => b.net - a.net || b.dOpp - a.dOpp || a.s - b.s);
  return out;
}

// ---------------------------------------------------------------- 快速单源距离：A*，以祖先距离场为启发
// 墙只会让距离变长，所以任何祖先（墙集合的子集）的距离场都是可采纳且一致的启发函数；
// Δ 小时 A* 几乎只沿原最短路扩展。
const _stamp = new Uint32Array(E.NS), _gq = new Uint8Array(E.NS);
let _stampV = 1;
const _head = new Int32Array(256).fill(-1), _eS = new Int32Array(E.NS * 8), _eN = new Int32Array(E.NS * 8);
const QD_CHECK = !!process.env.QD_CHECK;
function _qdCheck(geo, block, s, h) { // 诊断：启发必须一致（h[s] ≤ 1 + h[t]），否则抛出
  if (geo.adv) return;
  const c = (s / 5) | 0;
  for (let d = 0; d < 4; d++) {
    const v = geo.nbr[c * 4 + d];
    if (v < 0 || geo.rock[v] || (block[c] & (1 << d))) continue;
    for (const t of [v * 5, geo.portal[v] >= 0 ? geo.portal[v] * 5 : -1]) {
      if (t >= 0 && h[t] !== E.INF && h[s] > 1 + h[t]) { const err = new Error(`quickD inconsistent heuristic: s=${s} h=${h[s]} t=${t} h=${h[t]}`); err.qd = true; throw err; }
    }
  }
}
/*
 * 第七代修正（e13a/e16a 卡死）：桶队列原来只在 [fmin, used] 内复位。启发一旦不一致（ff < 当前桶），条目会进到更低的桶，
 * 本次不处理也不复位，留下的过期链表被以后的调用接上，形成环 → 死循环（检查器实测：桶头指向本次尚未写入的条目）。
 * 现在：① 复位本次触及的全部桶；② 出现非单调入队或桶号越界（≥256）时放弃 A*，改用精确正向 BFS，并计数 quickD.bad。
 * 启发一致时行为与原来完全相同。
 */
const _bq = new Int32Array(E.NS), _bd = new Uint8Array(E.NS);
function bfsD(geo, block, startSid, tgtMask) { // 精确正向 BFS（与 quickD 同样的扩展规则），不依赖启发
  _bd.fill(E.INF); _bd[startSid] = 0;
  let qh = 0, qt = 0; _bq[qt++] = startSid;
  const nbr = geo.nbr, rock = geo.rock, portal = geo.portal;
  while (qh < qt) {
    const s = _bq[qh++], c = (s / 5) | 0, g = _bd[s];
    if (tgtMask[c]) return g;
    if (!geo.adv) {
      for (let d = 0; d < 4; d++) {
        const v = nbr[c * 4 + d];
        if (v < 0 || rock[v] || (block[c] & (1 << d))) continue;
        if (_bd[v * 5] === E.INF) { _bd[v * 5] = g + 1; _bq[qt++] = v * 5; }
        const q = portal[v];
        if (q >= 0 && _bd[q * 5] === E.INF) { _bd[q * 5] = g + 1; _bq[qt++] = q * 5; }
      }
    } else {
      const R = E.advGraph(geo);
      for (let i = R.fhead[s]; i >= 0; i = R.fnext[i]) { const t = R.to[i]; if (_bd[t] === E.INF && E.advAvail(R, i, block)) { _bd[t] = g + 1; _bq[qt++] = t; } }
    }
  }
  return E.INF;
}
function quickD(geo, block, startSid, h, tgtMask) {
  if (h[startSid] === E.INF) return E.INF;
  if (++_stampV === 0xffffffff) { _stamp.fill(0); _stampV = 1; }
  const sv = _stampV, INF = E.INF;
  let fmin = h[startSid], used = fmin, res = INF, ne = 0, cur = fmin, lo = fmin, bad = false;
  const push = (t, ng) => {
    const ff = ng + h[t];
    if (ff < cur || ff > 255 || ne >= _eS.length) { bad = true; if (ff < lo) lo = ff; return; }
    _stamp[t] = sv; _gq[t] = ng; _eS[ne] = t; _eN[ne] = _head[ff]; _head[ff] = ne++; if (ff > used) used = ff;
  };
  push(startSid, 0);
  const nbr = geo.nbr, rock = geo.rock, portal = geo.portal, adv = geo.adv;
  outer:
  for (let f = fmin; f <= used && !bad; f++) {
    cur = f;
    while (_head[f] >= 0 && !bad) {
      const e = _head[f]; _head[f] = _eN[e];
      const s = _eS[e], gs = _gq[s];
      if (gs + h[s] !== f) continue; // 过期条目
      const c = (s / 5) | 0;
      if (tgtMask[c]) { res = gs; break outer; }
      const ng = gs + 1;
      if (QD_CHECK) _qdCheck(geo, block, s, h);
      if (!adv) {
        const bu = block[c];
        for (let d = 0; d < 4; d++) {
          const v = nbr[c * 4 + d];
          if (v < 0 || rock[v] || (bu & (1 << d))) continue;
          let t = v * 5;
          if (h[t] !== INF && (_stamp[t] !== sv || _gq[t] > ng)) push(t, ng);
          const q = portal[v];
          if (q >= 0) { t = q * 5; if (h[t] !== INF && (_stamp[t] !== sv || _gq[t] > ng)) push(t, ng); }
        }
      } else { // 高级玩法：走法模板（含传送落点）
        const R = E.advGraph(geo);
        for (let i = R.fhead[s]; i >= 0; i = R.fnext[i]) {
          const t = R.to[i];
          if (h[t] !== INF && (_stamp[t] !== sv || _gq[t] > ng) && E.advAvail(R, i, block)) push(t, ng);
        }
      }
    }
  }
  for (let f = Math.max(0, lo); f <= Math.min(255, used); f++) _head[f] = -1;
  if (bad) { quickD.bad++; return bfsD(geo, block, startSid, tgtMask); }
  return res;
}
quickD.bad = 0;

// 墙槽是否切到边集合（edge 标记数组）
function slotTouches(s, mark) {
  const e = E.SLOT_EDGES, o = s * 8;
  return mark[e[o] * 4 + e[o + 1]] || mark[e[o + 2] * 4 + e[o + 3]] || mark[e[o + 4] * 4 + e[o + 5]] || mark[e[o + 6] * 4 + e[o + 7]];
}

// 高级玩法：冰面格四周的“刹车墙”槽位（挡住滑行方向可让棋子转向，可能缩短距离）
const _gA = new Uint8Array(E.NS);
// “可能缩短距离”的墙槽：冰面格四周（解除强制滑行），以及被去重依赖引用的加速带两步路线上的边
// （挡住第一条路线会让另一条落在冰面、锁定方向不同的路线可用——现行固定布局不存在，随机布局 Map V2 可能出现）。
// 其余墙只删除走法，旧距离场是可采纳且一致的启发。
function iceBrakeSlots(geo) {
  if (geo._brake) return geo._brake;
  const set = new Set();
  for (let c = 0; c < E.N; c++) if (geo.ice[c]) for (let d = 0; d < 4; d++) for (const s of E.EDGE_SLOTS[c * 4 + d]) set.add(s);
  if (geo.adv) {
    const R = E.advGraph(geo);
    for (const j of R.depList) for (const e of [R.e1[j], R.e2[j]]) if (e >= 0) for (const s of E.EDGE_SLOTS[e]) set.add(s);
  }
  return (geo._brake = [...set]);
}
function iceBrakeMask(geo) {
  if (geo._brakeMask) return geo._brakeMask;
  const m = new Uint8Array(E.SLOTS);
  for (const s of iceBrakeSlots(geo)) m[s] = 1;
  return (geo._brakeMask = m);
}
// 快速墙候选：fields=[g0,g1] 为当前局面完整距离场。返回 [{s, d0, d1, dOpp, dMe, net}]（已排除非法墙）。
const _markMe = new Uint8Array(E.N * 4), _markOpp = new Uint8Array(E.N * 4);
function wallCandidatesFast(st, fields, mover, slack = 0) {
  const opp = 1 - mover, geo = st.geo;
  const D = [fields[0][st.sid(0)], fields[1][st.sid(1)]];
  const oppEdges = pathEdges(st, opp, fields[opp], slack), myEdges = pathEdges(st, mover, fields[mover], 0);
  _markMe.fill(0); for (const e of myEdges) _markMe[e] = 1;
  _markOpp.fill(0); for (const e of pathEdges(st, opp, fields[opp], 0)) _markOpp[e] = 1;
  const slots = slotsForEdges(st, oppEdges), out = [];
  if (geo.adv) for (const s of iceBrakeSlots(geo)) if (!st.occ[s] && E.slotFree(st, s)) slots.add(s);
  const brake = geo.adv ? iceBrakeMask(geo) : null;
  for (const s of slots) {
    E.setWall(st, s, true);
    const nd = [D[0], D[1]];
    if (geo.adv && brake[s]) { // 刹车墙：冰面滑行方向被挡后可转向，距离可能变短，必须精确重算
      nd[0] = E.distField(geo, st.block, 0, _gA)[st.sid(0)];
      nd[1] = E.distField(geo, st.block, 1, _gA)[st.sid(1)];
    } else {
      // 非刹车墙只删除边（经典与高级玩法都成立）：不切最短路 DAG 则距离不变；切到时旧距离场是一致启发，A* 精确。
      // （高级玩法 pathEdges 已包含加速带两步的两段边。）
      if (slotTouches(s, _markOpp)) nd[opp] = quickD(geo, st.block, st.sid(opp), fields[opp], geo.target[opp]);
      if (slotTouches(s, _markMe)) nd[mover] = quickD(geo, st.block, st.sid(mover), fields[mover], geo.target[mover]);
    }
    E.setWall(st, s, false);
    if (nd[0] === E.INF || nd[1] === E.INF) continue;
    const dOpp = nd[opp] - D[opp], dMe = nd[mover] - D[mover];
    out.push({ s, d0: nd[0], d1: nd[1], dOpp, dMe, net: dOpp - dMe });
  }
  out.sort((a, b) => b.net - a.net || b.dOpp - a.dOpp || a.s - b.s);
  return out;
}

// 惰性墙候选（经典玩法）：不算 Δ，只给代理分。代理 = 该墙切断对手最短路 DAG 某一层边的比例（层越窄越致命），
// 减去切到自己 DAG 的惩罚。真正的 Δ 在搜索访问该子节点时才用 A* 计算。
const _layerOf = new Int16Array(E.N * 4), _width = new Int16Array(256);
function dagLayers(st, p, gp, markLayer) {
  const geo = st.geo, nbr = geo.nbr, rock = geo.rock, portal = geo.portal, block = st.block;
  const start = st.pos[p], D = gp[start * 5];
  _cf.fill(E.INF); _cf[start] = 0; _width.fill(0);
  let qh = 0, qt = 0; _cq[qt++] = start;
  const edges = [];
  while (qh < qt) {
    const u = _cq[qh++], fu = _cf[u];
    if (fu + gp[u * 5] > D || gp[u * 5] === 0) continue;
    const bu = block[u];
    for (let d = 0; d < 4; d++) {
      const v = nbr[u * 4 + d];
      if (v < 0 || rock[v] || (bu & (1 << d))) continue;
      let arr = gp[v * 5]; const q = portal[v];
      if (q >= 0 && gp[q * 5] < arr) arr = gp[q * 5];
      if (fu + 1 + arr > D) continue;
      const e = u * 4 + d; edges.push(e); markLayer[e] = fu + 1; _width[fu]++;
      if (_cf[v] === E.INF) { _cf[v] = fu + 1; _cq[qt++] = v; }
      if (q >= 0 && _cf[q] === E.INF) { _cf[q] = fu + 1; _cq[qt++] = q; }
    }
  }
  return edges;
}
const _layMe = new Int16Array(E.N * 4), _layOpp = new Int16Array(E.N * 4), _widthOpp = new Int16Array(256);
/*
 * 第六代：wallSlotsLazy 结果缓存。输出只取决于（墙集合, 双方位置, 放墙方, slack）——经典玩法没有冰面锁定，
 * 距离场由墙集合决定。搜索中同一组合会在走法生成与威胁评估里反复出现（剖析：该函数占经典玩法 37% 自身时间）。
 * 调用方只读结果数组。缓存挂在 geo（每张地图一个）上——wallKey 只编码墙，不编码地图，
 * 同一进程连续下不同地图（锦标赛 worker、--serve 长驻进程）时绝不能共用。按墙集合分桶，超过上限整体清空。
 */
function wallSlotsLazy(st, fields, mover, slack = 0) {
  const geo = st.geo;
  const C = geo._slotCache || (geo._slotCache = { map: new Map(), n: 0 });
  const wk = st.wallKey();
  let bucket = C.map.get(wk);
  const pk = ((slack * 2 + mover) * 117 + st.pos[0]) * 117 + st.pos[1];
  if (bucket) { const r = bucket.get(pk); if (r) return r; }
  else { if (C.n > 200000) { C.map.clear(); C.n = 0; } bucket = new Map(); C.map.set(wk, bucket); }
  const r = wallSlotsLazyCompute(st, fields, mover, slack);
  bucket.set(pk, r); C.n++;
  return r;
}
function wallSlotsLazyCompute(st, fields, mover, slack) {
  const opp = 1 - mover;
  const myEdges = dagLayers(st, mover, fields[mover], _layMe);
  const oppEdges = dagLayers(st, opp, fields[opp], _layOpp); _widthOpp.set(_width);
  const slots = slotsForEdges(st, slack > 0 ? pathEdges(st, opp, fields[opp], slack) : oppEdges);
  const out = [], SE = E.SLOT_EDGES;
  const lo = [0, 0, 0, 0];
  for (const s of slots) {
    let cutOpp = 0, cutMe = 0;
    for (let k = 0; k < 4; k++) {
      const e = SE[s * 8 + 2 * k] * 4 + SE[s * 8 + 2 * k + 1];
      lo[k] = _layOpp[e]; if (lo[k]) cutOpp++;
      if (_layMe[e]) cutMe++;
    }
    // 同一层被切断的边数 / 该层宽度，取最大（与旧版 Map 实现数值完全相同，只是不分配对象）
    let frac = 0;
    for (let k = 0; k < 4; k++) {
      const l = lo[k]; if (!l) continue;
      let n = 0; for (let j = 0; j < 4; j++) if (lo[j] === l) n++;
      const fr = n / _widthOpp[l - 1]; if (fr > frac) frac = fr;
    }
    out.push({ s, proxy: Math.round(1000 * frac) + 50 * cutOpp - 400 * cutMe, cutMe });
  }
  for (const e of myEdges) _layMe[e] = 0;
  for (const e of oppEdges) _layOpp[e] = 0;
  out.sort((a, b) => b.proxy - a.proxy || a.s - b.s);
  return out;
}

/*
 * 第六代：高级玩法的惰性墙候选。与经典版同一思路，但 DAG 在状态图（含冰面锁定、加速带两步、传送）上求：
 *   层 = 该边起点状态的正向距离 + 1；代理 = 切断对手 DAG 同层边的最大比例（越窄越致命）+ 50·切边数 − 400·切到自己 DAG 的边数。
 * 候选集合 = 切到对手 slack 松弛路径边的墙槽（刹车墙若切到对手路径也在其中）。Δ 在搜索访问时才算：
 *   普通墙只删除边 → A*（祖先距离场为一致启发）精确；刹车墙可能缩短距离 → 完整 BFS（见 ab.js resolveLazy）。
 */
const _layA = new Int16Array(E.N * 4), _layB = new Int16Array(E.N * 4), _widA = new Int16Array(256), _ffA = new Uint8Array(E.NS);
function dagLayersAdv(st, p, gp, lay, wid) {
  const geo = st.geo, start = st.sid(p), D = gp[start], R = E.advGraph(geo), block = st.block, edges = [];
  if (wid) wid.fill(0);
  if (D === E.INF) return edges;
  forwardField(geo, block, start, D, _ffA);
  for (let s = 0; s < E.NS; s++) {
    const fs = _ffA[s];
    if (fs === E.INF || fs + gp[s] > D || gp[s] === 0) continue;
    for (let i = R.fhead[s]; i >= 0; i = R.fnext[i]) {
      if (fs + 1 + gp[R.to[i]] > D || !E.advAvail(R, i, block)) continue;
      const e = R.e1[i];
      if (!lay[e]) { lay[e] = fs + 1; edges.push(e); if (wid) wid[fs]++; }
      const e2 = R.e2[i];
      if (e2 >= 0 && !lay[e2]) { lay[e2] = fs + 2; edges.push(e2); if (wid) wid[fs + 1]++; }
    }
  }
  return edges;
}
function wallSlotsLazyAdv(st, fields, mover, slack = 0) {
  const opp = 1 - mover;
  const myEdges = dagLayersAdv(st, mover, fields[mover], _layB, null);
  const oppEdges = dagLayersAdv(st, opp, fields[opp], _layA, _widA);
  const slots = slotsForEdges(st, slack > 0 ? pathEdges(st, opp, fields[opp], slack) : oppEdges);
  const out = [], SE = E.SLOT_EDGES, lo = [0, 0, 0, 0];
  for (const s of slots) {
    let cutOpp = 0, cutMe = 0;
    for (let k = 0; k < 4; k++) {
      const e = SE[s * 8 + 2 * k] * 4 + SE[s * 8 + 2 * k + 1];
      lo[k] = _layA[e]; if (lo[k]) cutOpp++;
      if (_layB[e]) cutMe++;
    }
    let frac = 0;
    for (let k = 0; k < 4; k++) {
      const l = lo[k]; if (!l) continue;
      let n = 0; for (let j = 0; j < 4; j++) if (lo[j] === l) n++;
      const w = _widA[l - 1] || 1, fr = n / w; if (fr > frac) frac = fr;
    }
    out.push({ s, proxy: Math.round(1000 * Math.min(1, frac)) + 50 * cutOpp - 400 * cutMe });
  }
  for (const e of myEdges) _layB[e] = 0;
  for (const e of oppEdges) _layA[e] = 0;
  out.sort((a, b) => b.proxy - a.proxy || a.s - b.s);
  return out;
}

// 纯竞速（双方都不再放墙）的精确结果。返回 {winner: 0/1/-1(平), plies}
function raceOutcome(st, d0, d1) {
  const a = st.turn, b = 1 - a, da = a === 0 ? d0 : d1, db = a === 0 ? d1 : d0;
  if (da <= db) { const pl = 2 * da - 1; return st.moves + pl <= E.MAX_PLIES ? { winner: a, plies: pl } : { winner: -1, plies: E.MAX_PLIES - st.moves }; }
  const pl = 2 * db; return st.moves + pl <= E.MAX_PLIES ? { winner: b, plies: pl } : { winner: -1, plies: E.MAX_PLIES - st.moves };
}

// 最短路走法（安全回退）：在所有合法移动中选到达后距离最小者；平局按确定性顺序。
function bestRunMove(st, cache) {
  const p = st.turn, gp = cache.get(st)[p], opts = [];
  E.moveOptions(st.geo, st.block, st.pos[p], st.lock[p], opts);
  let best = null, bd = 1e9;
  for (const m of opts) {
    const stay = gp[m.to * 5 + m.lock + 1], pp = st.geo.portal[m.to];
    const tele = pp >= 0 ? gp[pp * 5] : E.INF;
    const d = Math.min(stay, tele);
    if (d < bd) { bd = d; best = m.to * 2 + (tele < stay ? 1 : 0); }
  }
  return best;
}

module.exports = { DistCache, arriveDist, forwardField, forwardFieldRef, pathEdges, slotsForEdges, wallEffect, wallCandidates, wallCandidatesFast, wallSlotsLazy, wallSlotsLazyAdv, iceBrakeMask, quickD, slotTouches, raceOutcome, bestRunMove };
