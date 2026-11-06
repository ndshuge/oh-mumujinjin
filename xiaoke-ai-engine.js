/* XiaoKe original C model, bundled from SHA-locked source. */
(function(root){"use strict";const process={env:{}};const modules={
"engine":function(require,module,exports){
'use strict';
/*
 * C 组自研规则引擎（木木金金棋）。
 * 只依据游戏规则独立实现：棋盘几何、合法动作、状态转移、终局判定、距离场。
 * 坐标：cell = y*9 + x。方向顺序与规则一致：0=右(+x) 1=左(-x) 2=下(+y) 3=上(-y)。
 * 玩家 0 = 金方（营地右下，目标左上），玩家 1 = 木方（营地左上，目标右下）。
 * 墙槽：slot = o*96 + y*8 + x，o=0 横墙(h)，o=1 竖墙(v)，x∈[0,7]，y∈[0,11]。
 */

const W = 9, H = 13, N = W * H, SLOTS = 192, NS = N * 5; // 状态 = cell*5 + (lock+1)
const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1], OPPD = [1, 0, 3, 2];
const CAMPS = [[[6, 12], [7, 12], [8, 12]], [[0, 0], [1, 0], [2, 0]]];
const DEFAULT_ROCKS = [[3, 2], [3, 3], [7, 2], [2, 4], [4, 5], [5, 5], [0, 8], [3, 9], [5, 9], [6, 9]];
const PORTALS = [[[5, 2], [2, 5]], [[6, 4], [1, 11]], [[8, 6], [3, 8]]];
const ICE = [[1, 6], [1, 7], [1, 8], [7, 7], [7, 8]];
const BOOST = [[4, 3], [4, 4], [6, 10], [7, 10]];
const MAX_PLIES = 120, WALLS_EACH = 5;
const INF = 255;
const idx = (x, y) => y * W + x;
const cx = c => c % W, cy = c => (c / W) | 0;

// ---------------------------------------------------------------- geometry
/*
 * layout（第六代后，为 Map V2 预备）：{ portals: [[[x,y],[x,y]], ...], ice: [[x,y], ...], boost: [[x,y], ...] }，
 * 缺省为现行固定布局（PORTALS/ICE/BOOST 常量），因此现行地图行为完全不变。营地固定。
 * 坐标可写成 [x,y] 或 {x,y}。g.layoutSig 是“玩法 + 岩石 + 传送门 + 冰面 + 加速带”的签名，供按地图绑定的缓存使用。
 */
const xyOf = p => {
  const r = Array.isArray(p) ? [p[0], p[1]] : p && typeof p === 'object' ? [p.x, p.y] : null;
  // 第八代：坐标格式错误（例如传入格子编号）必须报错，不能静默忽略（tools/extreplay.js 曾因此生成无岩石地图）
  if (!r || !Number.isInteger(r[0]) || !Number.isInteger(r[1]) || r[0] < 0 || r[0] >= W || r[1] < 0 || r[1] >= H) throw new Error('bad coordinate ' + JSON.stringify(p));
  return r;
};
function makeGeo(rocks, variant, layout = null) {
  variant = variant === 'advanced' ? 'advanced' : 'classic';
  const g = { variant, adv: variant === 'advanced' };
  const portals = (layout && layout.portals) || PORTALS, ice = (layout && layout.ice) || ICE, boost = (layout && layout.boost) || BOOST;
  g.rock = new Uint8Array(N);
  for (const r of rocks || DEFAULT_ROCKS) { const [x, y] = xyOf(r); g.rock[idx(x, y)] = 1; }
  g.rocks = []; for (let c = 0; c < N; c++) if (g.rock[c]) g.rocks.push([cx(c), cy(c)]);
  g.ice = new Uint8Array(N); g.boost = new Uint8Array(N);
  if (g.adv) { for (const p of ice) { const [x, y] = xyOf(p); g.ice[idx(x, y)] = 1; } for (const p of boost) { const [x, y] = xyOf(p); g.boost[idx(x, y)] = 1; } }
  g.portal = new Int16Array(N).fill(-1); g.portalId = new Int8Array(N).fill(-1);
  portals.forEach((pair, i) => {
    const [ax, ay] = xyOf(pair[0]), [bx, by] = xyOf(pair[1]);
    const ia = idx(ax, ay), ib = idx(bx, by);
    g.portal[ia] = ib; g.portal[ib] = ia; g.portalId[ia] = i; g.portalId[ib] = i;
  });
  g.layout = { portals: portals.map(pr => [xyOf(pr[0]), xyOf(pr[1])]), ice: ice.map(xyOf), boost: boost.map(xyOf) };
  g.layoutSig = (g.adv ? 'A' : 'C') + '|r' + g.rocks.map(([x, y]) => idx(x, y)).join(',') +
    '|p' + g.layout.portals.map(([a, b]) => idx(a[0], a[1]) + '-' + idx(b[0], b[1])).join(',') +
    (g.adv ? '|i' + g.layout.ice.map(([x, y]) => idx(x, y)).join(',') + '|b' + g.layout.boost.map(([x, y]) => idx(x, y)).join(',') : '');
  g.nbr = new Int16Array(N * 4).fill(-1);
  for (let c = 0; c < N; c++) for (let d = 0; d < 4; d++) {
    const x = cx(c) + DX[d], y = cy(c) + DY[d];
    if (x >= 0 && x < W && y >= 0 && y < H) g.nbr[c * 4 + d] = idx(x, y);
  }
  g.home = [CAMPS[0].map(([x, y]) => idx(x, y)), CAMPS[1].map(([x, y]) => idx(x, y))];
  g.target = [new Uint8Array(N), new Uint8Array(N)]; // target[p][c]=1 若 c 是玩家 p 的目标格
  for (const c of g.home[1]) g.target[0][c] = 1;
  for (const c of g.home[0]) g.target[1][c] = 1;
  g.fixed = new Uint8Array(N);
  for (const h of g.home) for (const c of h) g.fixed[c] = 1;
  for (const [a, b] of g.layout.portals) { g.fixed[idx(a[0], a[1])] = 1; g.fixed[idx(b[0], b[1])] = 1; }
  for (const [x, y] of g.layout.ice) g.fixed[idx(x, y)] = 1;
  for (const [x, y] of g.layout.boost) g.fixed[idx(x, y)] = 1;
  return g;
}

// 墙槽 -> 被挡住的 4 条有向边 (cell, dir)
const SLOT_EDGES = new Int16Array(SLOTS * 8);
for (let s = 0; s < SLOTS; s++) {
  const o = s < 96 ? 0 : 1, r = s % 96, x = r % 8, y = (r / 8) | 0;
  let e;
  if (o === 0) e = [idx(x, y), 2, idx(x, y + 1), 3, idx(x + 1, y), 2, idx(x + 1, y + 1), 3];
  else e = [idx(x, y), 0, idx(x + 1, y), 1, idx(x, y + 1), 0, idx(x + 1, y + 1), 1];
  SLOT_EDGES.set(e, s * 8);
}
// 每条有向边被哪些墙槽覆盖（至多 2 个）
const EDGE_SLOTS = Array.from({ length: N * 4 }, () => []);
for (let s = 0; s < SLOTS; s++) for (let k = 0; k < 8; k += 2) EDGE_SLOTS[SLOT_EDGES[s * 8 + k] * 4 + SLOT_EDGES[s * 8 + k + 1]].push(s);
// 冲突墙槽表：同向重叠 + 交叉
const SLOT_CONFLICTS = Array.from({ length: SLOTS }, (_, s) => {
  const o = s < 96 ? 0 : 1, r = s % 96, x = r % 8, y = (r / 8) | 0, out = [];
  const add = (oo, xx, yy) => { if (xx >= 0 && xx < 8 && yy >= 0 && yy < 12) out.push(oo * 96 + yy * 8 + xx); };
  if (o === 0) { add(0, x - 1, y); add(0, x, y); add(0, x + 1, y); add(1, x, y); }
  else { add(1, x, y - 1); add(1, x, y); add(1, x, y + 1); add(0, x, y); }
  return out;
});
const slotXYO = s => ({ x: (s % 96) % 8, y: ((s % 96) / 8) | 0, o: s < 96 ? 'h' : 'v' });
const slotOf = (x, y, o) => (o === 'h' ? 0 : 96) + y * 8 + x;

// ---------------------------------------------------------------- Zobrist
let seedZ = 0x9e3779b9;
function zr() { seedZ ^= seedZ << 13; seedZ >>>= 0; seedZ ^= seedZ >>> 17; seedZ ^= seedZ << 5; seedZ >>>= 0; return seedZ; }
const Z_POS = [new Uint32Array(NS), new Uint32Array(NS)], Z_POS2 = [new Uint32Array(NS), new Uint32Array(NS)];
for (let p = 0; p < 2; p++) for (let i = 0; i < NS; i++) { Z_POS[p][i] = zr(); Z_POS2[p][i] = zr(); }
const Z_WALL = new Uint32Array(SLOTS), Z_WALL2 = new Uint32Array(SLOTS);
for (let i = 0; i < SLOTS; i++) { Z_WALL[i] = zr(); Z_WALL2[i] = zr(); }
const Z_LEFT = [new Uint32Array(6), new Uint32Array(6)], Z_LEFT2 = [new Uint32Array(6), new Uint32Array(6)];
for (let p = 0; p < 2; p++) for (let i = 0; i < 6; i++) { Z_LEFT[p][i] = zr(); Z_LEFT2[p][i] = zr(); }
const Z_TURN = zr(), Z_TURN2 = zr();

// ---------------------------------------------------------------- state
const PH_PICK0 = 0, PH_PICK1 = 1, PH_PLAY = 2, PH_DONE = 3;

class State {
  constructor(geo) {
    this.geo = geo;
    this.pos = [-1, -1]; this.lock = [-1, -1]; this.left = [WALLS_EACH, WALLS_EACH];
    this.turn = 0; this.moves = 0; this.phase = PH_PICK0; this.winner = -1; this.draw = false;
    this.block = new Uint8Array(N); this.occ = new Uint8Array(SLOTS); this.walls = []; this.wallOwner = [];
    this.wh1 = 0; this.wh2 = 0; // 墙集合哈希
    this.rep = new Map(); this.zrep = new Map();
  }
  clone() {
    const s = new State(this.geo);
    s.pos = this.pos.slice(); s.lock = this.lock.slice(); s.left = this.left.slice();
    s.turn = this.turn; s.moves = this.moves; s.phase = this.phase; s.winner = this.winner; s.draw = this.draw;
    s.block.set(this.block); s.occ.set(this.occ); s.walls = this.walls.slice(); s.wallOwner = this.wallOwner.slice();
    s.wh1 = this.wh1; s.wh2 = this.wh2; s.rep = new Map(this.rep); s.zrep = new Map(this.zrep);
    return s;
  }
  sid(p) { return this.pos[p] * 5 + this.lock[p] + 1; }
  wallKey() { return this.wh1 * 2097152 + (this.wh2 & 0x1fffff); }
  key() { // 全局面哈希（不含步数）
    let a = this.wh1 ^ Z_LEFT[0][this.left[0]] ^ Z_LEFT[1][this.left[1]] ^ (this.turn ? Z_TURN : 0);
    let b = this.wh2 ^ Z_LEFT2[0][this.left[0]] ^ Z_LEFT2[1][this.left[1]] ^ (this.turn ? Z_TURN2 : 0);
    if (this.pos[0] >= 0) { a ^= Z_POS[0][this.sid(0)]; b ^= Z_POS2[0][this.sid(0)]; }
    if (this.pos[1] >= 0) { a ^= Z_POS[1][this.sid(1)]; b ^= Z_POS2[1][this.sid(1)]; }
    return (a >>> 0) * 2097152 + (b & 0x1fffff);
  }
  // 规则同款的重复局面键（turn, players, slideDir, 已排序墙, left）
  repKey() {
    const ws = this.walls.map(s => { const w = slotXYO(s); return w.o + ':' + w.x + ':' + w.y; }).sort();
    return this.turn + '|' + this.pos[0] + ',' + this.lock[0] + '|' + this.pos[1] + ',' + this.lock[1] + '|' + ws.join(';') + '|' + this.left[0] + ',' + this.left[1];
  }
}

function canStep(geo, block, c, d) {
  const n = geo.nbr[c * 4 + d];
  return n >= 0 && !geo.rock[n] && !(block[c] & (1 << d));
}

// 与规则 movementOptions 等价（含冰面锁定、加速带两步、两步去重顺序）。
// 输出到 out 数组：每个选项 {to, steps, lock, first}
function moveOptions(geo, block, c, lock, out) {
  out.length = 0;
  const curIce = geo.ice[c];
  const force = lock >= 0 && curIce && canStep(geo, block, c, lock);
  for (let k = 0; k < 4; k++) {
    const d = force ? lock : k;
    if (force && k > 0) break;
    if (!canStep(geo, block, c, d)) continue;
    const nx = geo.nbr[c * 4 + d];
    out.push({ to: nx, steps: 1, lock: geo.ice[nx] ? d : -1, first: d, mid: -1, last: d });
    if (geo.boost[c]) {
      for (let d2 = 0; d2 < 4; d2++) {
        if (!canStep(geo, block, nx, d2)) continue;
        const t = geo.nbr[nx * 4 + d2];
        if (t === c || geo.boost[t]) continue;
        let dup = false;
        for (const m of out) if (m.steps === 2 && m.to === t) { dup = true; break; }
        if (!dup) out.push({ to: t, steps: 2, lock: geo.ice[t] ? d2 : -1, first: d, mid: nx, last: d2 });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- 距离场（反向 BFS）
// 返回 Uint8Array(NS)：从任意状态到玩家 p 目标的最少回合数（INF=不可达）。
const _q = new Int32Array(NS * 4);
function distField(geo, block, p, out) {
  const g = out || new Uint8Array(NS);
  g.fill(INF);
  const tgt = geo.target[p], rock = geo.rock, nbr = geo.nbr, portal = geo.portal;
  let qh = 0, qt = 0;
  if (!geo.adv) {
    for (let c = 0; c < N; c++) if (tgt[c]) { g[c * 5] = 0; _q[qt++] = c; }
    while (qh < qt) {
      const v = _q[qh++], k = g[v * 5] + 1;
      for (let d = 0; d < 4; d++) { // 前驱 u 经方向 OPPD[d] 走到 v
        const u = nbr[v * 4 + d];
        if (u < 0 || rock[u] || g[u * 5] !== INF) continue;
        if (block[u] & (1 << OPPD[d])) continue;
        g[u * 5] = k; _q[qt++] = u;
      }
      const pp = portal[v];
      if (pp >= 0) { // 落在 v 可能是踏上 pp 后传送而来
        for (let d = 0; d < 4; d++) {
          const u = nbr[pp * 4 + d];
          if (u < 0 || rock[u] || g[u * 5] !== INF) continue;
          if (block[u] & (1 << OPPD[d])) continue;
          g[u * 5] = k; _q[qt++] = u;
        }
      }
    }
    return g;
  }
  return distFieldAdv(geo, block, p, g);
}

// 高级玩法（第六代）：预计算“无墙时的反向走法模板”，BFS 时只用墙位比特判断模板是否可用，不再每次调用 moveOptions 建图。
// 模板 (u → v)：需要边 e1（以及加速带第二步的 e2）未被墙挡；ne ≥ 0 表示“冰面锁定方向 L 的边必须被挡住”
// （冰面上锁定方向可走时只能沿锁定方向滑行，挡住后才可转向）。与 moveOptions 逐项等价，由 tests/dist.js 对拍。
/*
 * 加速带两步的去重规则（Map V2 预备）：moveOptions 对同一落点 t 只保留“第一条可用”的两步路线（按 d、d2 的顺序）。
 * 落点不是冰面时各路线到达同一状态，去重无关紧要；落点是冰面时锁定方向 = 第二步方向 d2，不同路线到达不同状态。
 * 现行固定布局里唯一的“加速带两步落在冰面”只有一条路线，所以第六代最初的模板不需要处理；随机布局下必须处理：
 * 这类模板带依赖表 deps = 同一起点、同一冰面落点、顺序更早的两步路线模板，要求它们全部不可用（只看它们自身的边，不递归）。
 */
function buildRevAdv(geo) {
  const from = [], e1 = [], e2 = [], nb = [], to = [], deps = [];
  const add = (u, v, a, b, c, dp = null) => { from.push(u); to.push(v); e1.push(a); e2.push(b); nb.push(c); deps.push(dp); return from.length - 1; };
  const okStep = (c, d) => { const n = geo.nbr[c * 4 + d]; return n >= 0 && !geo.rock[n]; };
  for (let c = 0; c < N; c++) {
    if (geo.rock[c]) continue;
    const nl = geo.ice[c] ? 5 : 1;
    for (let lk = 0; lk < nl; lk++) {
      const u = c * 5 + lk, L = lk - 1;
      const forcing = L >= 0 && geo.ice[c] && okStep(c, L); // 锁定方向静态可走时才可能被强制
      const iceRoutes = new Map(); // 冰面落点 t -> 更早的两步路线模板（停留在 t 的那一个）
      for (let d = 0; d < 4; d++) {
        if (!okStep(c, d)) continue;
        const need = forcing && d !== L ? c * 4 + L : -1;
        const nx = geo.nbr[c * 4 + d];
        add(u, nx * 5 + (geo.ice[nx] ? d + 1 : 0), c * 4 + d, -1, need);
        if (geo.portal[nx] >= 0) add(u, geo.portal[nx] * 5, c * 4 + d, -1, need);
        if (geo.boost[c]) {
          for (let d2 = 0; d2 < 4; d2++) {
            if (!okStep(nx, d2)) continue;
            const t = geo.nbr[nx * 4 + d2];
            if (t === c || geo.boost[t]) continue;
            const a = c * 4 + d, b = nx * 4 + d2;
            if (geo.ice[t]) {
              const earlier = iceRoutes.get(t) || [];
              const i = add(u, t * 5 + d2 + 1, a, b, need, earlier.length ? earlier.slice() : null);
              earlier.push(i); iceRoutes.set(t, earlier);
            } else add(u, t * 5, a, b, need);
            if (geo.portal[t] >= 0) add(u, geo.portal[t] * 5, a, b, need); // 传送落点与路线无关
          }
        }
      }
    }
  }
  // 按目标状态 v 建反向邻接表；按起点状态 u 建正向邻接表（供 A*、正向 BFS、最短路边使用）
  const M = from.length, head = new Int32Array(NS).fill(-1), next = new Int32Array(M);
  const fhead = new Int32Array(NS).fill(-1), fnext = new Int32Array(M);
  for (let i = M - 1; i >= 0; i--) { fnext[i] = fhead[from[i]]; fhead[from[i]] = i; }
  for (let i = 0; i < M; i++) { next[i] = head[to[i]]; head[to[i]] = i; }
  const dep0 = new Int32Array(M).fill(-1), depN = new Int32Array(M), depList = [];
  for (let i = 0; i < M; i++) if (deps[i]) { dep0[i] = depList.length; depN[i] = deps[i].length; depList.push(...deps[i]); }
  return { head, next, fhead, fnext, from: Int32Array.from(from), to: Int32Array.from(to), e1: Int32Array.from(e1), e2: Int32Array.from(e2), nb: Int32Array.from(nb),
    dep0, depN, depList: Int32Array.from(depList), nDeps: depList.length };
}
function advGraph(geo) { return geo._revAdv || (geo._revAdv = buildRevAdv(geo)); }
// 模板自身的边条件（不看去重依赖）
function advRaw(R, i, block) {
  let e = R.e1[i]; if (block[e >> 2] & (1 << (e & 3))) return false;
  e = R.e2[i]; if (e >= 0 && (block[e >> 2] & (1 << (e & 3)))) return false;
  e = R.nb[i]; if (e >= 0 && !(block[e >> 2] & (1 << (e & 3)))) return false;
  return true;
}
// 去重依赖：更早的同落点两步路线必须全部走不通
function advDepsClear(R, i, block) {
  for (let k = R.dep0[i], end = k + R.depN[i]; k < end; k++) if (advRaw(R, R.depList[k], block)) return false;
  return true;
}
// 模板 i 在当前墙集合下是否可用
function advAvail(R, i, block) {
  return advRaw(R, i, block) && (R.dep0[i] < 0 || advDepsClear(R, i, block));
}
function distFieldAdv(geo, block, p, g) {
  const R = advGraph(geo);
  const head = R.head, next = R.next, from = R.from, E1 = R.e1, E2 = R.e2, NB = R.nb, D0 = R.dep0;
  let qh = 0, qt = 0;
  for (let c = 0; c < N; c++) if (geo.target[p][c]) { g[c * 5] = 0; _q[qt++] = c * 5; }
  while (qh < qt) {
    const v = _q[qh++], k = g[v] + 1;
    for (let i = head[v]; i >= 0; i = next[i]) {
      const u = from[i];
      if (g[u] !== INF) continue;
      let e = E1[i]; if (block[e >> 2] & (1 << (e & 3))) continue;
      e = E2[i]; if (e >= 0 && (block[e >> 2] & (1 << (e & 3)))) continue;
      e = NB[i]; if (e >= 0 && !(block[e >> 2] & (1 << (e & 3)))) continue;
      if (D0[i] >= 0 && !advDepsClear(R, i, block)) continue;
      g[u] = k; _q[qt++] = u;
    }
  }
  return g;
}

// 第五代及以前的实现（保留作对拍基准）：显式建图后反向 BFS
const _predHead = new Int32Array(NS), _predNext = new Int32Array(NS * 40), _predFrom = new Int32Array(NS * 40), _opts = [];
function distFieldAdvRef(geo, block, p, g) {
  g.fill(INF);
  _predHead.fill(-1);
  let ne = 0;
  const addEdge = (from, to) => { _predFrom[ne] = from; _predNext[ne] = _predHead[to]; _predHead[to] = ne++; };
  for (let c = 0; c < N; c++) {
    if (geo.rock[c]) continue;
    const nl = geo.ice[c] ? 5 : 1;
    for (let lk = 0; lk < nl; lk++) {
      const s = c * 5 + lk;
      moveOptions(geo, block, c, lk - 1, _opts);
      for (const m of _opts) {
        addEdge(s, m.to * 5 + m.lock + 1);
        const pp = geo.portal[m.to];
        if (pp >= 0) addEdge(s, pp * 5);
      }
    }
  }
  let qh = 0, qt = 0;
  for (let c = 0; c < N; c++) if (geo.target[p][c]) { g[c * 5] = 0; _q[qt++] = c * 5; }
  while (qh < qt) {
    const v = _q[qh++], k = g[v] + 1;
    for (let e = _predHead[v]; e >= 0; e = _predNext[e]) {
      const u = _predFrom[e];
      if (g[u] === INF) { g[u] = k; _q[qt++] = u; }
    }
  }
  return g;
}

// ---------------------------------------------------------------- 墙
function slotFree(st, s) {
  for (const t of SLOT_CONFLICTS[s]) if (st.occ[t]) return false;
  return true;
}
function setWall(st, s, on) {
  const e = SLOT_EDGES;
  for (let k = 0; k < 8; k += 2) {
    const c = e[s * 8 + k], d = e[s * 8 + k + 1];
    if (on) st.block[c] |= (1 << d); else st.block[c] &= ~(1 << d);
  }
  st.occ[s] = on ? 1 : 0;
  st.wh1 ^= Z_WALL[s]; st.wh2 ^= Z_WALL2[s];
}
// 规则意义上的完全合法性检查（含双方仍有通路）。
const _gTmp = new Uint8Array(NS);
function wallLegal(st, s) {
  if (st.phase !== PH_PLAY || st.left[st.turn] <= 0 || !slotFree(st, s)) return false;
  setWall(st, s, true);
  let ok = true;
  for (let p = 0; p < 2 && ok; p++) {
    distField(st.geo, st.block, p, _gTmp);
    if (_gTmp[st.sid(p)] === INF) ok = false;
  }
  setWall(st, s, false);
  return ok;
}

// ---------------------------------------------------------------- 动作
// 动作编码（整数）：
//   原点选择：  2000 + cell
//   移动：      cell*2 + warp（warp=1 表示踏上传送门后传送）
//   筑墙：      1000 + slot
const A_WALL = 1000, A_PICK = 2000;
const isWall = a => a >= A_WALL && a < A_PICK, isPick = a => a >= A_PICK, isMove = a => a < A_WALL;

function legalActions(st, includeWalls = true) {
  const out = [];
  if (st.phase === PH_PICK0 || st.phase === PH_PICK1) {
    for (const c of st.geo.home[st.phase === PH_PICK0 ? 0 : 1]) out.push(A_PICK + c);
    return out;
  }
  if (st.phase !== PH_PLAY) return out;
  const p = st.turn, opts = [];
  moveOptions(st.geo, st.block, st.pos[p], st.lock[p], opts);
  for (const m of opts) {
    out.push(m.to * 2);
    if (st.geo.portal[m.to] >= 0) out.push(m.to * 2 + 1);
  }
  if (includeWalls && st.left[p] > 0) for (let s = 0; s < SLOTS; s++) if (wallLegal(st, s)) out.push(A_WALL + s);
  return out;
}

// 应用动作（完整规则，含重复/步数/被困判定）。返回 false 表示非法。
function applyAction(st, a, trackRep = true) {
  const geo = st.geo;
  if (st.phase === PH_PICK0 || st.phase === PH_PICK1) {
    const who = st.phase === PH_PICK0 ? 0 : 1, c = a - A_PICK;
    if (!isPick(a) || !geo.home[who].includes(c)) return false;
    st.pos[who] = c;
    if (who === 0) { st.phase = PH_PICK1; st.turn = 1; } else { st.phase = PH_PLAY; st.turn = 0; }
    return true;
  }
  if (st.phase !== PH_PLAY) return false;
  const p = st.turn;
  if (isWall(a)) {
    if (!wallLegal(st, a - A_WALL)) return false;
    setWall(st, a - A_WALL, true); st.walls.push(a - A_WALL); st.wallOwner.push(p); st.left[p]--;
  } else if (isMove(a)) {
    const to = a >> 1, warp = a & 1, opts = [];
    moveOptions(geo, st.block, st.pos[p], st.lock[p], opts);
    const m = opts.find(o => o.to === to);
    if (!m || (warp && geo.portal[to] < 0)) return false;
    st.pos[p] = to; st.lock[p] = m.lock;
    if (warp) { st.pos[p] = geo.portal[to]; st.lock[p] = -1; }
  } else return false;
  finishTurn(st, trackRep);
  return true;
}

function finishTurn(st, trackRep) {
  const mover = st.turn, geo = st.geo;
  st.moves++;
  if (geo.target[mover][st.pos[mover]]) { st.winner = mover; st.phase = PH_DONE; return; }
  st.turn = 1 - mover;
  let times = 1;
  if (trackRep) {
    const k = st.repKey(); times = (st.rep.get(k) || 0) + 1; st.rep.set(k, times);
    const z = st.key(); st.zrep.set(z, (st.zrep.get(z) || 0) + 1);
  }
  if (times >= 3 || st.moves >= MAX_PLIES) { st.phase = PH_DONE; st.winner = -1; st.draw = true; }
  if (st.phase === PH_PLAY) {
    const opts = []; moveOptions(geo, st.block, st.pos[st.turn], st.lock[st.turn], opts);
    if (!opts.length) { st.winner = 1 - st.turn; st.phase = PH_DONE; }
  }
}

function newGame(geo) { return new State(geo); }

// 人类可读动作
function actionToObj(a, st) {
  if (isPick(a)) { const c = a - A_PICK; return { type: 'pick', x: cx(c), y: cy(c) }; }
  if (isWall(a)) { const w = slotXYO(a - A_WALL); return { type: 'wall', x: w.x, y: w.y, o: w.o }; }
  const c = a >> 1; return { type: 'move', x: cx(c), y: cy(c), warp: !!(a & 1) };
}
function actionStr(a) {
  const o = actionToObj(a);
  if (o.type === 'pick') return `P${o.x},${o.y}`;
  if (o.type === 'wall') return `${o.o.toUpperCase()}${o.x},${o.y}`;
  return `M${o.x},${o.y}${o.warp ? '*' : ''}`;
}
function objToAction(o) {
  if (o.type === 'pick') return A_PICK + idx(o.x, o.y);
  if (o.type === 'wall') return A_WALL + slotOf(o.x, o.y, o.o);
  return idx(o.x, o.y) * 2 + (o.warp ? 1 : 0);
}

module.exports = {
  W, H, N, NS, SLOTS, INF, DX, DY, OPPD, CAMPS, DEFAULT_ROCKS, PORTALS, ICE, BOOST, MAX_PLIES, WALLS_EACH,
  PH_PICK0, PH_PICK1, PH_PLAY, PH_DONE, A_WALL, A_PICK, isWall, isPick, isMove,
  SLOT_EDGES, EDGE_SLOTS, SLOT_CONFLICTS, slotXYO, slotOf, idx, cx, cy,
  makeGeo, State, newGame, canStep, moveOptions, distField, distFieldAdvRef, advGraph, advAvail, slotFree, setWall, wallLegal,
  legalActions, applyAction, finishTurn, actionToObj, actionStr, objToAction,
  Z_POS, Z_POS2, Z_LEFT, Z_LEFT2, Z_TURN, Z_TURN2,
};

},
"analysis":function(require,module,exports){
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

},
"threat":function(require,module,exports){
'use strict';
/*
 * 第四代：咽喉威胁（throat threat）。
 *
 * 定义：攻方 x 在当前局面“立刻放一堵墙”能取得的最大净节拍差
 *     T_x = max_s [ Δ_对手(s) − Δ_x(s) ]，s 取遍合法墙槽。
 * 一堵墙的净节拍 = T − 1（自己用掉一拍）。持有的墙本身已按 wallValue≈1 拍计入评估，
 * 所以“超出基准”的部分是 T − 2：T ≥ 3 的咽喉才是真正的额外威胁。
 *
 * 为什么这样估计不会像第二代那样有噪声：
 *   - 它是精确值（单墙、当前局面），不是多墙贪心的近似；
 *   - 只对“对手最短路 DAG”上的墙槽求值（不切 DAG 的墙对对手 Δ=0，经典玩法可证）；
 *   - 按代理分取前 K 个，用 A*（祖先距离场作一致启发）求精确 Δ，结果按局面缓存。
 * 仅用于经典玩法（A* 与单调性只在经典玩法成立）；高级玩法返回 0（交给搜索本身）。
 */
const E = require('./engine');
const A = require('./analysis');

// 返回 {gain, slot}：攻方 attacker 的单墙最大 (Δ对手 − Δ自己)；无墙或无候选时 gain=0。
// 第六代 allowAdv：高级玩法也计算（状态图上的惰性候选；刹车墙会缩短距离、A* 不适用，跳过）。
function bestThreat(st, fields, attacker, K, minBase = 2, allowAdv = false) {
  if (st.left[attacker] <= 0 || (st.geo.adv && !allowAdv)) return { gain: 0, slot: -1 };
  const victim = 1 - attacker, geo = st.geo;
  const sv = st.sid(victim), sa = st.sid(attacker);
  const baseV = fields[victim][sv], baseA = fields[attacker][sa];
  if (baseV === E.INF || baseV < minBase) return { gain: 0, slot: -1 };
  const slots = geo.adv ? A.wallSlotsLazyAdv(st, fields, attacker, 0) : A.wallSlotsLazy(st, fields, attacker, 0);
  const brake = geo.adv ? A.iceBrakeMask(geo) : null;
  let best = 0, bestS = -1, n = 0;
  for (const c of slots) {
    if (brake && brake[c.s]) continue;
    if (++n > K) break;
    const s = c.s;
    E.setWall(st, s, true);
    const dv = A.quickD(geo, st.block, sv, fields[victim], geo.target[victim]);
    let g = -99;
    if (dv !== E.INF && dv - baseV > best) {
      const da = A.quickD(geo, st.block, sa, fields[attacker], geo.target[attacker]);
      if (da !== E.INF) g = (dv - baseV) - (da - baseA);
    }
    E.setWall(st, s, false);
    if (g > best) { best = g; bestS = s; }
  }
  return { gain: best, slot: bestS };
}

/*
 * 威胁感知评估（作为 ab.js 的 evalFn）。
 *   v = 100·(D_b − D_a) + 50 + wallValue·(L_a − L_b) + wMover·B(T_a) − wOther·B(T_b)
 *   B(T) = 100·min(cap, max(0, T − 2))
 * 行动方可以立刻兑现威胁，权重更高；非行动方的威胁打折（行动方可能先走过咽喉）。
 */
/*
 * 墙储备价值（第五代选项 wallCurve）：持有 k 堵墙的价值 R(k)（单位：百分之一拍）。
 * 缺省为线性 wallValue·k。e06 起用实测曲线：每次放墙的实际净拍按“放墙前剩余墙数”统计（tools/wallstats.js，5,693 次放墙），
 * 剩 5→1 堵时依次为 1.11、1.24、1.40、1.80、2.70 拍，累加得 R = [0, 270, 450, 590, 714, 825]。
 * 威胁超出基准的部分相应改为 T − 1 − 边际(k)，边际(k) = R(k) − R(k−1)。
 */
function reserveFns(o) {
  const wv = o.wallValue ?? 100, curve = o.wallCurve || null;
  const R = k => curve ? curve[k] : wv * k;
  const marg = k => (k <= 0 ? 0 : (curve ? (curve[k] - curve[k - 1]) : wv) / 100);
  return { R, marg };
}

// 地图签名：玩法 + 岩石格子列表（传送门/冰面/加速带位置是固定常量）
function geoSig(geo) {
  let s = geo.adv ? 'A' : 'C';
  for (let c = 0; c < E.N; c++) if (geo.rock[c]) s += ',' + c;
  return s;
}

function makeThreatEval(o) {
  const K = o.threatK || 6, wM = o.wMover ?? 1.0, wO = o.wOther ?? 0.75, cap = o.threatCap ?? 3;
  const { R, marg } = reserveFns(o);
  // 第六代 wallCurveAdv：高级玩法单独的墙储备曲线（e08a/e08b 高级玩法 1,398 次放墙实测）
  const Radv = o.wallCurveAdv ? (k => o.wallCurveAdv[k]) : R;
  /*
   * 记忆表按局面键缓存威胁项，跨着法复用。局面键（Zobrist）只编码墙/位置/轮次/剩余墙，不编码地图：
   * 同一代理实例连续下不同地图时（--serve 长驻进程、裁判适配器）会取到别的地图的值（tests/memo.js 实测 20/20 污染，误差最大 2.2 拍）。
   * 修正（f2 之后）：记忆表绑定地图签名（玩法 + 岩石布局），签名变化即清空。同一局内仍跨着法复用。
   */
  let memo = new Map(), memoSig = null;
  // 第七代选项 threatBase：威胁项的基准与墙曲线解耦，B = min(cap, max(0, T − threatBase))（缺省沿用 T − 1 − 边际(k)）
  const tb = o.threatBase;
  const B = tb !== undefined ? (t => 100 * Math.min(cap, Math.max(0, t - tb))) : ((t, k) => 100 * Math.min(cap, Math.max(0, t - 1 - marg(k))));
  const adv = !!o.advThreat;
  const lin = o.threatLinear, linO = o.threatLinearOther ?? o.threatLinear;
  /*
   * 第七代选项 wallCurveLate（经典玩法）：墙价值随阶段变化。Dsum = D_me + D_op；
   * α = clamp((Dsum − phaseLo)/(phaseHi − phaseLo), 0, 1)，R(k) = α·wallCurve[k] + (1−α)·wallCurveLate[k]。
   * 依据：tools/tempofit.js 对 10 万个局面的结构化逻辑回归（开局墙更值钱）。威胁项的边际同样按混合曲线计算。
   */
  const late = o.wallCurveLate || null, pLo = o.phaseLo ?? 12, pHi = o.phaseHi ?? 26;
  const fn = function (S, da, db) {
    const s = S.s, me = s.turn, op = 1 - me;
    let RR = s.geo.adv ? Radv : R, MG = marg;
    if (late && !s.geo.adv) {
      const al = Math.min(1, Math.max(0, (da + db - pLo) / (pHi - pLo)));
      RR = k => al * R(k) + (1 - al) * late[k];
      MG = k => (k <= 0 ? 0 : (RR(k) - RR(k - 1)) / 100);
    }
    let v = 100 * (db - da) + 50 + RR(s.left[me]) - RR(s.left[op]);
    if ((s.geo.adv && !adv) || (s.left[0] === 0 && s.left[1] === 0)) return v;
    const sig = s.geo.layoutSig || s.geo._sig || (s.geo._sig = geoSig(s.geo)); // layoutSig 含传送门/冰面/加速带（Map V2）
    if (sig !== memoSig) { memo = new Map(); memoSig = sig; fn.memo = memo; }
    const key = s.key();
    let t = memo.get(key);
    if (t === undefined) {
      const fields = S.cache.get(s);
      const tm = bestThreat(s, fields, me, K, 2, adv).gain, to = bestThreat(s, fields, op, K, 2, adv).gain;
      if (lin !== undefined) t = lin * tm - linO * to; // 第八代 threatLinear：线性单墙威胁（回归 e18 风格对局：约 0.45 拍 / 单位）
      else {
        const Bk = MG === marg || tb !== undefined ? B : (x, k) => 100 * Math.min(cap, Math.max(0, x - 1 - MG(k)));
        t = wM * Bk(tm, s.left[me]) - wO * Bk(to, s.left[op]);
      }
      if (memo.size > 300000) memo.clear();
      memo.set(key, t);
    }
    return v + t;
  };
  fn.memo = memo;
  return fn;
}

/*
 * 第五代：路线一致的咽喉威胁 V（route-consistent throat threat）。
 *
 * 第四代的 T 只看受害方“当前格”：退回岔路口会让 T 变小，于是搜索来回踱步（e05a 复盘，dev-1）。
 * 但咽喉若在所有路线上，退回去并不能躲开它。正确的量是一个小博弈的值：
 *   攻方每回合可以“现在放墙”（得 T(x)），或者等待；受害方每步选择下一格 n（绕路要付出步数）。
 *   V(x) = max( T(x), min_n [ V(n) + extra(n) ] ),  extra(n) = g(n) + 1 − g(x) ≥ 0,  V(目标) = 0。
 * extra 是相对最短路多付的步数（最短一步 0，横移 1，后退 2），所以任何回路代价为正，值迭代收敛。
 * 性质：沿最佳分支前进时 V 不变（V(x) = V(最佳后继)），退回岔路口也不会让 V 低于“该分支本来的值 + 绕路代价”，
 * 因此评估在相邻局面之间一致，消除了踱步的诱因。
 * 计算量：根节点为两名受害方各算一次全部可达格子的 T（每格 K 个候选墙的 A*）+ 值迭代，约几毫秒。
 * 搜索中若墙集合与根节点相同则查表，否则退回第四代的当前格 T。
 */
function routeTable(st, fields, victim, K) {
  const N = E.N, attacker = 1 - victim, geo = st.geo, g = fields[victim];
  const V = new Float32Array(N).fill(0);
  if (st.left[attacker] <= 0 || geo.adv) return V;
  const T = new Int8Array(N);
  const savePos = st.pos[victim], saveLock = st.lock[victim];
  const cells = [];
  for (let c = 0; c < N; c++) {
    if (geo.rock[c] || g[c * 5] === E.INF || g[c * 5] === 0) continue;
    cells.push(c);
    st.pos[victim] = c; st.lock[victim] = -1;
    T[c] = bestThreat(st, fields, attacker, K, 1).gain;
  }
  st.pos[victim] = savePos; st.lock[victim] = saveLock;
  cells.sort((a, b) => g[a * 5] - g[b * 5]);
  const INFV = 1e9;
  for (const c of cells) V[c] = INFV;
  const opts = [];
  for (let sweep = 0; sweep < 60; sweep++) {
    let changed = false;
    for (const c of cells) {
      E.moveOptions(geo, st.block, c, -1, opts);
      let best = INFV;
      const gc = g[c * 5];
      for (const m of opts) {
        const n = m.to;
        if (g[n * 5] !== E.INF) { const val = V[n] + (g[n * 5] + 1 - gc); if (val < best) best = val; }
        const q = geo.portal[n];
        if (q >= 0 && g[q * 5] !== E.INF) { const val = V[q] + (g[q * 5] + 1 - gc); if (val < best) best = val; }
      }
      const nv = Math.max(T[c], best);
      if (nv < V[c]) { V[c] = nv; changed = true; }
    }
    if (!changed) break;
  }
  for (const c of cells) if (V[c] >= INFV) V[c] = T[c];
  return V;
}

function routeTables(st, fields, K) {
  return { wallKey: st.wallKey(), left: st.left.slice(), V: [routeTable(st, fields, 0, K), routeTable(st, fields, 1, K)] };
}

/*
 * 第五代评估：墙集合与根节点相同时用 V（路线一致），否则用 T（当前格）。
 *   v = 100·(D_b − D_a) + 50 + wallValue·(L_a − L_b) + wMover·B(threat_a→b) − wOther·B(threat_b→a)
 */
function makeRouteThreatEval(o) {
  const K = o.threatK || 6, wM = o.wMover ?? 1.0, wO = o.wOther ?? 0.75, cap = o.threatCap ?? 3;
  const { R, marg } = reserveFns(o);
  const B = (t, k) => 100 * Math.min(cap, Math.max(0, t - 1 - marg(k)));
  return function (S, da, db) {
    const s = S.s, me = s.turn, op = 1 - me;
    let v = 100 * (db - da) + 50 + R(s.left[me]) - R(s.left[op]);
    if (s.geo.adv || (s.left[0] === 0 && s.left[1] === 0)) return v;
    const rt = S.rt;
    if (rt && s.wallKey() === rt.wallKey) {
      const tm = s.left[me] > 0 ? rt.V[op][s.pos[op]] : 0, to = s.left[op] > 0 ? rt.V[me][s.pos[me]] : 0;
      return v + wM * B(tm, s.left[me]) - wO * B(to, s.left[op]);
    }
    if (!S.memo) S.memo = new Map();
    const key = s.key();
    let t = S.memo.get(key);
    if (t === undefined) {
      const fields = S.cache.get(s);
      t = wM * B(bestThreat(s, fields, me, K).gain, s.left[me]) - wO * B(bestThreat(s, fields, op, K).gain, s.left[op]);
      S.memo.set(key, t);
    }
    return v + t;
  };
}

module.exports = { bestThreat, makeThreatEval, routeTable, routeTables, makeRouteThreatEval, reserveFns };

},
"maps":function(require,module,exports){
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

},
"endgame":function(require,module,exports){
'use strict';
/*
 * 第六代：残局子博弈精确求解 —— “跑者（墙已用尽）对攻方（还剩 k 堵墙）”。（仅经典玩法）
 *
 * 为什么这是一个可以精确求解的子博弈：
 *   跑者没有墙，就无法影响攻方；棋子之间没有碰撞。所以攻方每回合只有两类有意义的动作：
 *   “前进一步”（攻方距离 −1，没有任何东西能阻止它），或“放一堵墙”（花掉这一拍）。
 *   攻方的位置只通过它自己的距离 D_a 参与胜负比较，跑者的位置才是博弈的真正状态。
 *
 * 值的定义：V = 跑者到达目标还需走的步数 − 攻方此后放下的墙数（双方最优，跑者取小，攻方取大）。
 *   跑者行棋时：跑者胜 ⇔ V_R ≤ D_a；攻方行棋时：跑者胜 ⇔ V_A ≤ D_a − 1。（推导见 docs/02-experiment-log.md e08）
 *   R_k[W](x)：跑者行棋、跑者在 x、墙集合 W、攻方剩 k 堵；A_k[W](x)：攻方行棋。
 *     R_0[W](x) = d_W(x)
 *     A_k[W](x) = max( R_k[W](x),  max_{s 合法} ( R_{k−1}[W+s](x) − 1 ) )
 *     R_k[W](x) = 0（x 为目标）；否则 1 + min_{n ∈ 后继(x)} A_k[W](n)
 *   R_k 对跑者的回路有正代价，从 d_W 自下而上值迭代收敛到最小不动点，即博弈值。
 *
 * 攻方墙的限制（“干净墙”）：只允许不切攻方当前最短路 DAG 的墙。
 *   这样攻方距离永远不变（攻方沿 DAG 前进时剩余 DAG 只会变小，干净墙始终不切到它），自伤恒为 0，
 *   D_a 只随前进递减 —— 模型自洽。代价：攻方偶尔值得放的“自伤墙”不在考虑之内（对攻方是保守的下界）。
 *
 * 计算量：一次完整距离场约 2 µs，192 个墙槽。
 *   k=1：192 次 BFS + 一次值迭代 ≈ 0.4 ms；k=2：对每个第一堵墙求一张 k=1 表 ≈ 192² 次 BFS ≈ 70–100 ms。
 */
const E = require('./engine');
const A = require('./analysis');

const BIG = 1000;

// 跑者在 block 下从格子 x 的所有后继格（含“踏上传送门后传送”的落点）
function successors(geo, block, x, out) {
  out.length = 0;
  const nbr = geo.nbr, rock = geo.rock, portal = geo.portal, b = block[x];
  for (let d = 0; d < 4; d++) {
    const v = nbr[x * 4 + d];
    if (v < 0 || rock[v] || (b & (1 << d))) continue;
    out.push(v);
    const q = portal[v];
    if (q >= 0) out.push(q);
  }
  return out;
}

class EndgameSolver {
  /*
   * st：当前局面（不会被修改；内部克隆）。runner：墙已用尽的一方；attacker：另一方。
   * opts.slotLimit：每层最多考虑的墙槽数（按单墙伤害排序截断；缺省全部 → k≤2 精确）。
   */
  constructor(st, runner, opts = {}) {
    this.st = st.clone();
    this.geo = st.geo; this.r = runner; this.a = 1 - runner;
    this.slotLimit = opts.slotLimit || Infinity;
    this.bfs = 0;
    this._succ = []; this._g = new Uint8Array(E.NS);
    // 攻方干净墙：不切攻方当前最短路 DAG
    const ga = E.distField(this.geo, this.st.block, this.a);
    this.markA = new Uint8Array(E.N * 4);
    for (const e of A.pathEdges(this.st, this.a, ga, 0)) this.markA[e] = 1;
    this.Da = ga[this.st.sid(this.a)];
    this.cells = [];
    for (let c = 0; c < E.N; c++) if (!this.geo.rock[c]) this.cells.push(c);
  }

  // 当前（克隆）局面上跑者的距离场，转成 Int16（INF → BIG）
  distR(out) {
    const g = E.distField(this.geo, this.st.block, this.r, this._g); this.bfs++;
    const R = out || new Int16Array(E.N);
    for (let c = 0; c < E.N; c++) R[c] = g[c * 5] === E.INF ? BIG : g[c * 5];
    return R;
  }

  // 当前墙集合下攻方可以放的干净墙槽
  cleanSlots() {
    const st = this.st, out = [];
    for (let s = 0; s < E.SLOTS; s++) {
      if (st.occ[s] || !E.slotFree(st, s) || A.slotTouches(s, this.markA)) continue;
      out.push(s);
    }
    return out;
  }

  /*
   * 求 R_k[W]（W = 克隆局面当前墙集合）。返回 {R, A, B, best}：
   *   B[x] = max_s (R_{k−1}[W+s](x) − 1)，best[x] = 取到该最大值的墙槽（−1 = 无合法墙）。
   */
  table(k) {
    const N = E.N, geo = this.geo, tgt = geo.target[this.r];
    const d = this.distR();
    if (k === 0) return { R: d, A: d, B: null, best: null };
    const B = new Int16Array(N).fill(-BIG), best = new Int16Array(N).fill(-1);
    let slots = this.cleanSlots();
    if (slots.length > this.slotLimit) slots = this.rankSlots(slots, d).slice(0, this.slotLimit);
    for (const s of slots) {
      E.setWall(this.st, s, true);
      const sub = k === 1 ? this.distR() : this.table(k - 1).R;
      // 墙的合法性：跑者在 x 时放墙后仍须有路（攻方的路不受干净墙影响）
      const dd = k === 1 ? sub : this.distR();
      E.setWall(this.st, s, false);
      for (let x = 0; x < N; x++) {
        if (tgt[x] || dd[x] >= BIG || d[x] >= BIG) continue;
        const v = sub[x] - 1;
        if (v > B[x]) { B[x] = v; best[x] = s; }
      }
    }
    // 值迭代：R 从 d 自下而上
    const R = Int16Array.from(d), Av = new Int16Array(N);
    const order = this.cells.slice().sort((p, q) => d[p] - d[q]);
    for (let it = 0; it < 400; it++) {
      let changed = false;
      for (const x of order) Av[x] = tgt[x] ? 0 : Math.max(R[x], B[x]);
      for (const x of order) {
        if (tgt[x] || d[x] >= BIG) continue;
        successors(geo, this.st.block, x, this._succ);
        let m = BIG;
        for (const n of this._succ) { const v = tgt[n] ? 0 : Math.max(R[n], B[n]); if (v < m) m = v; }
        const nv = Math.min(BIG, 1 + m);
        if (nv > R[x]) { R[x] = nv; changed = true; }
      }
      if (!changed) break;
    }
    for (const x of order) Av[x] = tgt[x] ? 0 : Math.max(R[x], B[x]);
    return { R, A: Av, B, best };
  }

  // 墙槽排序（slotLimit 截断时用）：按“单墙对跑者距离场的最大增量”
  rankSlots(slots, d) {
    const sc = [];
    for (const s of slots) {
      E.setWall(this.st, s, true); const dd = this.distR(); E.setWall(this.st, s, false);
      let m = 0; for (let x = 0; x < E.N; x++) if (d[x] < BIG && dd[x] < BIG && dd[x] - d[x] > m) m = dd[x] - d[x];
      sc.push([s, m]);
    }
    sc.sort((p, q) => q[1] - p[1] || p[0] - q[0]);
    return sc.map(p => p[0]);
  }
}

/*
 * 根节点决策（供 ab.js 调用）。条件：经典玩法、对局阶段、恰有一方墙已用尽、另一方剩 1..kMax 堵、双方距离有限。
 * 返回 null（不适用）或 {action, value, win, runner, info}：
 *   - 轮到跑者：在所有走子中取 1 + A_k(落点) 最小者；
 *   - 轮到攻方：比较“前进”（R_k(x_r)）与每堵干净墙（R_{k−1}[W+s](x_r) − 1），取最大者；
 *     若“前进”已经能赢则前进（保留墙），走哪一步前进交给调用方的最短路走法。
 *   win：按上面的胜负判据，求解结果对行棋方是否必胜（不计 120 手上限与重复局面）。
 */
function rootDecision(st, opts = {}) {
  const kMax = opts.kMax ?? 2;
  if (st.geo.adv || st.phase !== E.PH_PLAY) return null;
  const l0 = st.left[0], l1 = st.left[1];
  if ((l0 === 0) === (l1 === 0)) return null;
  const runner = l0 === 0 ? 0 : 1, attacker = 1 - runner, k = st.left[attacker];
  if (k > kMax) return null;
  const t0 = Date.now();
  const S = new EndgameSolver(st, runner, opts);
  const xr = st.pos[runner];
  const gr = E.distField(st.geo, st.block, runner);
  if (gr[st.sid(runner)] === E.INF || S.Da === E.INF) return null;
  const T = S.table(k);
  const me = st.turn, Da = S.Da;
  if (me === runner) {
    const opts2 = []; E.moveOptions(st.geo, st.block, xr, -1, opts2);
    let best = null, bv = BIG + 1;
    for (const m of opts2) {
      for (const warp of [0, 1]) {
        if (warp && st.geo.portal[m.to] < 0) continue;
        const n = warp ? st.geo.portal[m.to] : m.to;
        const v = st.geo.target[runner][m.to] && !warp ? 1 : 1 + T.A[n];
        if (best === null || v < bv || (v === bv && gr[n * 5] < gr[best.n * 5])) { bv = v; best = { a: m.to * 2 + warp, n }; }
      }
    }
    return { action: best.a, value: bv, win: bv <= Da, runner, side: 'runner', info: { k, Da, ms: Date.now() - t0, bfs: S.bfs } };
  }
  // 轮到攻方
  const vProgress = T.R[xr];
  const vWall = T.B[xr], wall = T.best[xr];
  const winBy = v => v >= Da; // 攻方行棋：跑者胜 ⇔ V ≤ Da − 1
  let choice;
  if (winBy(vProgress) || wall < 0 || vProgress >= vWall) choice = { action: null, value: vProgress };
  else choice = { action: E.A_WALL + wall, value: vWall };
  return { action: choice.action, value: choice.value, win: winBy(choice.value), runner, side: 'attacker', info: { k, Da, vProgress, vWall, ms: Date.now() - t0, bfs: S.bfs } };
}

module.exports = { EndgameSolver, rootDecision, successors, BIG };

},
"protocol":function(require,module,exports){
'use strict';
/*
 * mumujinjin-ai/1 协议适配（纯 I/O，不含策略）。
 * 输入（每行一个 JSON 或单个 JSON 文档）：
 *   { protocol:"mumujinjin-ai/1", state:{ variant, rocks|map.rocks, phase, players, slideDir, walls, left, turn, moves, repetitions },
 *     legalActions:[...], timeBudgetMs }
 *   state 采用游戏原生结构（与 game.js 的 state 字段同名）；rocks 缺省为默认地图。
 * 输出：{ protocol:"mumujinjin-ai/1", action:<legalActions 中的同一个元素>, index, engine, info }
 * 安全性：最终动作必须能在 legalActions 中找到；若找不到（格式不一致等），按“最短路前进”在列表内回退；
 *         仍无法匹配时返回列表第一个元素，并在 info.warning 中如实说明。
 */
const E = require('./engine');
const A = require('./analysis');

const DIRV = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function dirIndex(d) { if (!d) return -1; for (let i = 0; i < 4; i++) if (DIRV[i][0] === d.x && DIRV[i][1] === d.y) return i; return -1; }

/*
 * 第八代：正式 Map V2 地形（规则版本 map-v2-r1；游戏 window.MumuMapV2 的地图对象 {rocks, portals:[{a,b}], ice, boost, rulesVersion}）。
 * 接受 state.map 为地图对象，或 {map: 地图对象, fingerprint}（游戏 AI 适配层的形状）；坐标为 {x,y} 或 [x,y]；传送门为 {a,b} 或 [a,b]。
 * 规则版本声明为 map-v2* 但地形字段缺失/不完整时**抛错**（由 decide 改走安全回退），绝不静默退回旧版固定地形。
 * 没有任何地图字段时视为旧版（V1）固定地形，与原来行为一致。
 */
function layoutFromNative(js) {
  const outer = js.map || null, m = outer && outer.map && typeof outer.map === 'object' ? outer.map : outer;
  const rv = (m && m.rulesVersion) || (outer && outer.rulesVersion) || js.rulesVersion || '';
  const v2 = /^map-v2/.test(rv);
  const has = m && (m.portals || m.ice || m.boost);
  if (!has) { if (v2) throw new Error('Map V2 state without terrain fields'); return null; }
  if (!Array.isArray(m.portals) || !Array.isArray(m.ice) || !Array.isArray(m.boost)) throw new Error('incomplete Map V2 terrain (portals/ice/boost required)');
  const portals = m.portals.map(p => (Array.isArray(p) ? [p[0], p[1]] : [p.a, p.b]));
  return { portals, ice: m.ice, boost: m.boost };
}
function stateFromNative(js) {
  const outer = js.map || null, m = outer && outer.map && typeof outer.map === 'object' ? outer.map : outer;
  const rocks = js.rocks || (m && m.rocks) || E.DEFAULT_ROCKS;
  const geo = E.makeGeo(rocks, js.variant || 'classic', layoutFromNative(js));
  const st = E.newGame(geo);
  const phaseMap = { 'pick-attack': E.PH_PICK0, 'pick-defend': E.PH_PICK1, play: E.PH_PLAY, finished: E.PH_DONE };
  st.phase = phaseMap[js.phase] ?? E.PH_PLAY;
  for (let p = 0; p < 2; p++) {
    const pl = js.players && js.players[p];
    st.pos[p] = pl ? E.idx(pl.x, pl.y) : -1;
    st.lock[p] = dirIndex(js.slideDir && js.slideDir[p]);
  }
  for (const w of js.walls || []) { const s = E.slotOf(w.x, w.y, w.o); E.setWall(st, s, true); st.walls.push(s); st.wallOwner.push(w.owner ?? -1); }
  if (js.left) st.left = [js.left[0], js.left[1]];
  st.turn = js.turn | 0; st.moves = js.moves | 0;
  // 历史重复计数：把原生重复键换算为 C 组引擎的 zobrist 键
  if (js.repetitions) {
    for (const [k, n] of Object.entries(js.repetitions)) {
      try {
        const [turn, players, slide, walls, left] = JSON.parse(k);
        const t = st.clone();
        t.turn = turn; t.left = [left[0], left[1]];
        for (let p = 0; p < 2; p++) { t.pos[p] = players[p] ? E.idx(players[p].x, players[p].y) : -1; t.lock[p] = dirIndex(slide && slide[p]); }
        for (const s of t.walls.slice()) E.setWall(t, s, false);
        t.walls = [];
        for (const ws of walls) { const [o, x, y] = ws.split(':'); const s = E.slotOf(+x, +y, o); E.setWall(t, s, true); t.walls.push(s); }
        st.zrep.set(t.key(), n); st.rep.set(t.repKey(), n);
      } catch (e) { /* 忽略无法解析的键 */ }
    }
  }
  return st;
}

function actionKeyFromObj(o) {
  if (!o || typeof o !== 'object') return null;
  const type = o.type || o.kind || (o.o || o.orientation ? 'wall' : null);
  if (type === 'pick' || type === 'origin' || type === 'select') return `P${o.x},${o.y}`;
  if (type === 'wall') return `W${o.o || o.orientation}${o.x},${o.y}`;
  if (type === 'move' || o.x !== undefined) {
    const warp = !!(o.warp ?? o.teleport ?? o.portal);
    return `M${o.x},${o.y}${warp ? '*' : ''}`;
  }
  return null;
}
function actionKeyFromInt(a) {
  const o = E.actionToObj(a);
  if (o.type === 'pick') return `P${o.x},${o.y}`;
  if (o.type === 'wall') return `W${o.o}${o.x},${o.y}`;
  return `M${o.x},${o.y}${o.warp ? '*' : ''}`;
}

// spentMs：调用方在本次请求上已花掉的时间（例如单次调用模式下 Node 进程启动与模块加载），从搜索预算中扣除。
function decide(req, agent, spentMs = 0) {
  const legal = Array.isArray(req.legalActions) ? req.legalActions : null;
  let st;
  try { st = stateFromNative(req.state || {}); }
  catch (e) { // 状态无法可靠解析（例如 V2 地形不完整）：不搜索，只在合法列表里选一个走子，如实报告
    const keys = legal ? legal.map(actionKeyFromObj) : [];
    let idx = keys.findIndex(k => k && k[0] === 'M'); if (idx < 0) idx = legal && legal.length ? 0 : -1;
    return { protocol: 'mumujinjin-ai/1', action: idx >= 0 ? legal[idx] : null, index: idx, info: { warning: 'state rejected: ' + String(e && e.message || e) } };
  }
  const budget = { ms: Math.max(20, Math.floor((req.timeBudgetMs || 1000) * 0.85 - spentMs)) };
  const t0 = Date.now();
  let a = null, warning = null;
  try { a = agent.choose(st.clone(), budget); } catch (e) { warning = 'agent error: ' + String(e && e.message || e); }
  const info = { ms: Date.now() - t0, search: agent.lastInfo || null };
  if (!legal) return { protocol: 'mumujinjin-ai/1', action: a === null ? null : E.actionToObj(a), info };
  const keys = legal.map(actionKeyFromObj);
  let idx = a === null ? -1 : keys.indexOf(actionKeyFromInt(a));
  if (idx < 0) { // 回退：列表内最短路前进
    warning = (warning ? warning + '; ' : '') + 'chosen action not in legalActions; fallback used';
    if (st.phase === E.PH_PLAY) { const fb = A.bestRunMove(st, new A.DistCache(st.geo, 8)); idx = keys.indexOf(actionKeyFromInt(fb)); }
    if (idx < 0) idx = keys.findIndex(k => k && k[0] === 'M');
    if (idx < 0) idx = 0;
  }
  if (warning) info.warning = warning;
  return { protocol: 'mumujinjin-ai/1', action: legal[idx], index: idx, info };
}

module.exports = { stateFromNative, decide, actionKeyFromObj, actionKeyFromInt };

},
"agents/ab":function(require,module,exports){
'use strict';
/*
 * 路线 A：节拍 α-β（Tempo Alpha-Beta）。
 * - 局面价值核心：竞速差 (D_对手 - D_自己)，行动方在平手时获胜（+半拍）。
 * - 精确截断（由“可逆图”竞速理论推出）：
 *     落后方已无墙 → 领先方必胜（直接跑）；D_自己=1 → 必胜；120 手上限 → 平局。
 * - 墙候选只取切到对手最短路（含 slack 松弛）的墙，按净节拍 (Δ对手 - Δ自己) 排序。
 * - 子节点的双方距离由父节点算好传下（走子=查表，筑墙=A*），叶子零 BFS。
 * - 迭代加深 + PVS + 置换表 + 杀手着法；时间/节点预算可中断，回退到最近完成迭代的最佳着法。
 */
const E = require('../engine');
const A = require('../analysis');
const T = require('../threat');
const { pickStart } = require('./baselines');

const WIN = 100000, MATE_EDGE = WIN - 1000;
class Abort extends Error {}

/*
 * 第四代新增选项（缺省全部关闭，旧版本 ab-v1/ab-v3 行为不变）：
 *   infExact     距离 INF（主动传送进被墙封死的门出口）按“无法获胜”精确处理，而不是当作 255 步评估。
 *   tieRun       根节点同分时优先走子：每轮先搜最佳走子，墙必须严格更好才被选中（保留墙的期权价值）。
 *   threat       叶子评估加入单墙咽喉威胁项（见 src/threat.js），参数 threatK / wMover / wOther / threatCap。
 * 第五代：
 *   routeThreat  路线一致的咽喉威胁 V（根节点值迭代表；墙集合变化后退回 T），取代 threat。（e06a：负面结果）
 *   wallCurve    墙储备价值曲线 R(k)（实测，见 src/threat.js reserveFns）。
 *   noRetreat0   任一方墙已用尽时剪除不前进的走子（支配性剪枝，含根节点）。
 */
function makeAB(opts = {}) {
  const o = Object.assign({ name: 'ab', wallValue: 100, slack: 0, rootSlack: 1, minDOpp: 1, maxWalls: 20, rootMaxWalls: 40, evalFn: null, maxDepth: 64 }, opts);
  if (o.routeThreat && !o.evalFn) o.evalFn = T.makeRouteThreatEval(o);
  if (o.threat && !o.evalFn) o.evalFn = T.makeThreatEval(o);
  const agent = { name: o.name, opts: o, lastInfo: null };
  agent.choose = function (st0, budget = {}) {
    const t0 = Date.now();
    const st = st0.clone();
    const cache = new A.DistCache(st.geo, 60000);
    if (st.phase !== E.PH_PLAY) return o.startSearch ? searchStart(st, o, budget) : pickStart(st, cache);
    const S = new Searcher(st, cache, o, budget, t0);
    const res = S.run();
    agent.lastInfo = res.info;
    // 搜索中断时工作副本可能处于半走状态，必须用未改动的原局面验证
    return verifyOrFallback(st0, res.action, A.bestRunMove(st0, new A.DistCache(st0.geo, 8)));
  };
  return agent;
}

class Searcher {
  constructor(st, cache, o, budget, t0) {
    this.s = st; this.cache = cache; this.o = o;
    this.deadline = budget.ms ? t0 + budget.ms : Infinity;
    this.maxNodes = budget.nodes || Infinity;
    this.nodes = 0; this.tt = new Map(); this.killers = []; this.extUsed = 0;
    // 检查时钟的间隔（节点数掩码）：高级玩法每个节点要精确重算刹车墙距离（约 0.4 ms/节点），每节点检查；
    // 经典玩法每 64 个节点检查一次。只影响按时间预算的中断点，不影响节点预算的可复现性。
    this.clockMask = st.geo.adv ? 0 : 63;
    this.path = [];
    // 游戏历史中已出现 2 次的局面：再出现即三次重复和棋
    this.histZ = new Set();
    if (st.zrep) for (const [k, n] of st.zrep) if (n >= 2) this.histZ.add(k);
  }

  // 生成着法：[{a, lock, d0, d1, sc}]
  gen(ply, root) {
    const s = this.s, me = s.turn, fields = this.cache.get(s), gm = fields[me];
    const D = [fields[0][s.sid(0)], fields[1][s.sid(1)]];
    const da = D[me], out = [], opts = [];
    E.moveOptions(s.geo, s.block, s.pos[me], s.lock[me], opts);
    // 内部节点不展开“不前进”的走子（反视界拖延）。
    // 第五代 noRetreat0：任一方墙已用尽时（含根节点），不前进的走子被支配：
    //   我方无墙 → 对方“等待”只需继续跑向自己的目标，没有代价，我拖延换不来任何东西；
    //   对方无墙 → 没有任何东西能再推迟我，后退只是白丢节拍。
    const prune = (this.o.pruneRetreat && !root) || (this.o.noRetreat0 && (s.left[me] === 0 || s.left[1 - me] === 0) && da !== E.INF);
    for (const m of opts) {
      const stay = gm[m.to * 5 + m.lock + 1];
      if (!prune || stay < da) {
        const nd = [D[0], D[1]]; nd[me] = stay;
        out.push({ a: m.to * 2, lock: m.lock, d0: nd[0], d1: nd[1], sc: 1000 * (da - stay) - 5 });
      }
      const pp = s.geo.portal[m.to];
      if (pp >= 0) { const tele = gm[pp * 5]; if (!prune || tele < da) { const n2 = [D[0], D[1]]; n2[me] = tele; out.push({ a: m.to * 2 + 1, lock: -1, d0: n2[0], d1: n2[1], sc: 1000 * (da - tele) - 5 }); } }
    }
    if (s.left[me] > 0 && this.o.lazyWalls && !root && (!s.geo.adv || this.o.advLazy)) {
      // 惰性：只按代理分排序，Δ 在访问时计算（见 resolveLazy）。第六代 advLazy：高级玩法也用（状态图上的 DAG 代理）。
      const slots = s.geo.adv ? A.wallSlotsLazyAdv(s, fields, me, this.o.slack) : A.wallSlotsLazy(s, fields, me, this.o.slack);
      let n = 0;
      for (const c of slots) {
        if (++n > this.o.maxWalls) break;
        out.push({ a: E.A_WALL + c.s, lazy: true, fields, sc: c.proxy - 600, cutMe: c.cutMe });
      }
    } else if (s.left[me] > 0) {
      const cands = A.wallCandidatesFast(s, fields, me, root ? this.o.rootSlack : this.o.slack);
      let n = 0;
      for (const c of cands) {
        if (c.dOpp < this.o.minDOpp) continue;
        if (++n > (root ? this.o.rootMaxWalls : this.o.maxWalls)) break;
        out.push({ a: E.A_WALL + c.s, d0: c.d0, d1: c.d1, sc: 1000 * c.net + 10 * c.dOpp - 500 });
      }
    }
    if (this.o.noRetreat0 && prune && !out.some(m => m.a < E.A_WALL)) { // 安全网：剪完没有走子时恢复全部走子
      for (const m of opts) { const nd = [D[0], D[1]]; nd[me] = gm[m.to * 5 + m.lock + 1]; out.push({ a: m.to * 2, lock: m.lock, d0: nd[0], d1: nd[1], sc: -5 }); }
    }
    const k = this.killers[ply];
    if (k !== undefined) for (const m of out) if (m.a === k) m.sc += 400;
    out.sort((x, y) => y.sc - x.sc);
    return out;
  }

  // 惰性墙：用 A*（祖先距离场为一致启发）求放墙后双方距离；非法或对对手无效则跳过
  resolveLazy(m, me) {
    const s = this.s, sl = m.a - E.A_WALL, f = m.fields, op = 1 - me;
    E.setWall(s, sl, true);
    let dOpp, dMe;
    if (s.geo.adv && A.iceBrakeMask(s.geo)[sl]) { // 刹车墙可能缩短距离：祖先距离场不再是可采纳启发，完整 BFS
      const nf = this.cache.get(s);
      dOpp = nf[op][s.sid(op)]; dMe = nf[me][s.sid(me)];
    } else {
      dOpp = A.quickD(s.geo, s.block, s.sid(op), f[op], s.geo.target[op]);
      // 第八代提速（着法不变）：经典玩法里普通墙只删边；没切到我方最短路 DAG（cutMe = 0）时我方距离必然不变，省掉第二次 A*
      if (dOpp === E.INF) dMe = E.INF;
      else if (m.cutMe === 0 && !s.geo.adv) dMe = f[me][s.sid(me)];
      else dMe = A.quickD(s.geo, s.block, s.sid(me), f[me], s.geo.target[me]);
    }
    E.setWall(s, sl, false);
    m.lazy = false; m.fields = null;
    if (dOpp === E.INF || dMe === E.INF) return false;
    if (dOpp - f[op][s.sid(op)] < this.o.minDOpp) return false;
    if (me === 0) { m.d0 = dMe; m.d1 = dOpp; } else { m.d0 = dOpp; m.d1 = dMe; }
    return true;
  }

  make(m) {
    const s = this.s, p = s.turn, a = m.a;
    const u = { p, a, pos: s.pos[p], lock: s.lock[p] };
    if (a >= E.A_WALL) { E.setWall(s, a - E.A_WALL, true); s.left[p]--; }
    else { const to = a >> 1; if (a & 1) { s.pos[p] = s.geo.portal[to]; s.lock[p] = -1; } else { s.pos[p] = to; s.lock[p] = m.lock; } }
    s.moves++; s.turn = 1 - p;
    return u;
  }
  unmake(u) {
    const s = this.s;
    s.moves--; s.turn = u.p;
    if (u.a >= E.A_WALL) { E.setWall(s, u.a - E.A_WALL, false); s.left[u.p]++; }
    else { s.pos[u.p] = u.pos; s.lock[u.p] = u.lock; }
  }

  /*
   * 第八代选项 egExact（经典）：追击残局叶子用子博弈精确值（src/endgame.js）。
   * 条件：恰有一方墙已用完（跑者），另一方（攻方）剩 k ≤ egK 堵；值以“拍”计，与普通评估同一尺度：
   *   跑者行棋：v = 100·(D攻 − R_k(x跑)) + 50；攻方行棋：v = 100·(A_k(x跑) − D攻) + 50。
   *   （k = 0 时退化为普通的 100·(D对手 − D自己) + 50。）攻方只许“干净墙”，所以对攻方是保守下界。
   * 表按（地形签名, 墙集合, 跑者, k, slotLimit）缓存在代理实例上，跨着法复用；k=2 用 egSlots 截断控制耗时。
   */
  egLeaf(da, db) {
    const s = this.s;
    if (s.geo.adv) return null;
    const l0 = s.left[0], l1 = s.left[1];
    if ((l0 === 0) === (l1 === 0)) return null;
    const runner = l0 === 0 ? 0 : 1, att = 1 - runner, k = s.left[att];
    if (k > (this.o.egK ?? 2)) return null;
    const me = s.turn, Da = att === me ? da : db;
    if (Da === E.INF) return null;
    const lim = k === 1 ? (this.o.egSlots1 || Infinity) : (this.o.egSlots || 8);
    const cache = this.o._egCache || (this.o._egCache = new Map());
    const key = (s.geo.layoutSig || '') + '|' + s.wallKey() + '|' + runner + '|' + k + '|' + lim;
    let tab = cache.get(key);
    if (!tab) {
      const EG = require('../endgame');
      const S = new EG.EndgameSolver(s, runner, { slotLimit: lim });
      const t = S.table(k);
      tab = { R: t.R, A: t.A };
      if (cache.size > 20000) cache.clear();
      cache.set(key, tab);
      this.egBuilt = (this.egBuilt || 0) + 1;
      if (Date.now() > this.deadline) throw new Abort(); // 建表可能耗时数毫秒：每次建表后都检查时钟
    }
    const x = s.pos[runner], BIG = 1000;
    if (me === runner) { const r = tab.R[x]; return r >= BIG ? null : 100 * (Da - r) + 50; }
    const a = tab.A[x]; return a >= BIG ? null : 100 * (a - Da) + 50;
  }

  /*
   * 第八代选项 e2root（经典）：根节点双墙组合表。对每名受害方 v（攻方还有墙时），用残局子博弈求解器算
   *   T_k[v][x] = R_k(x) − d(x)：攻方 k（=1、2）堵干净墙、受害方从 x 出发最优应对时的净延迟（受害方会绕路），截断到 e2cap。
   * 叶子评估加 e2w·(T[min(2,我的墙)][对手][对手位置] − T[min(2,对手墙)][我][我的位置])。
   * 表覆盖受害方所有位置，所以搜索中的走子是精确查表；攻方在搜索中放墙后墙数下降就改查 k−1 的表（墙用完即为 0），
   * 不会出现“随便放一堵墙就能消掉惩罚”的漏洞（几何是根节点的，属于近似）。
   * 依据：e18 风格 58k 局面校准审计——对手两墙潜力 ≥ 8 的局面评估高估行动方 1.76 拍（占 23%）；拟合系数约 0.3 拍/单位。
   * 表按（地形, 墙集合, 受害方, 攻方墙数, slotLimit）缓存在代理上，墙集合不变的着法之间复用。
   */
  buildE2(s) {
    const EG = require('../endgame'), cap = this.o.e2cap ?? 12, lim = this.o.e2slots || 24, BIG = EG.BIG;
    const cache = this.o._e2cache || (this.o._e2cache = new Map());
    const out = { 1: [null, null], 2: [null, null] };
    for (const v of [0, 1]) {
      const k = Math.min(2, s.left[1 - v]);
      if (!k) continue;
      const key = (s.geo.layoutSig || '') + '|' + s.wallKey() + '|' + v + '|' + k + '|' + lim;
      let t = cache.get(key);
      if (!t) {
        const S = new EG.EndgameSolver(s, v, { slotLimit: lim });
        t = [null, null, null];
        if (S.Da !== E.INF) {
          const d = S.table(0).R;
          for (let kk = 1; kk <= k; kk++) {
            const r = S.table(kk).R, T = new Int8Array(E.N);
            for (let c = 0; c < E.N; c++) if (d[c] < BIG && r[c] < BIG) T[c] = Math.max(0, Math.min(cap, r[c] - d[c]));
            t[kk] = T;
          }
        }
        if (cache.size > 2000) cache.clear();
        cache.set(key, t);
      }
      out[1][v] = t[1]; out[2][v] = t[2];
    }
    return out;
  }

  evaluate(da, db) {
    const s = this.s, me = s.turn;
    if (this.o.egExact) { const v = this.egLeaf(da, db); if (v !== null) return v; }
    if (this.o.evalFn) return this.o.evalFn(this, da, db);
    // 第七代：无威胁项时高级玩法也要用 wallCurveAdv（原来只有威胁评估路径会区分玩法）
    const curve = s.geo.adv && this.o.wallCurveAdv ? this.o.wallCurveAdv : this.o.wallCurve;
    if (curve) {
      /*
       * 第八代选项 wallCurveRunner（经典）/ wallCurveRunnerAdv：对手墙已用完时（追击残局：我是攻方、对手只能跑），
       * 我的墙只值它能造成的实际延迟，没有威慑价值。e18 风格 58k 局面校准：ab7 曲线在该体制下对攻方高估约 2.4–2.9 拍（k=1,2）。
       */
      const rc = s.geo.adv ? this.o.wallCurveRunnerAdv : this.o.wallCurveRunner;
      const lm = s.left[me], lo = s.left[1 - me];
      /*
       * 第八代选项 wallTable / wallTableAdv：二维墙价值表 T[我的墙][对手墙]（反对称），取代可分离的 R(我) − R(对手)。
       * 依据：二维校准审计——双方都有墙时墙数领先的价值超过 R 之差，对手墙用完后则相反（威慑是相互的）。
       */
      const wt = s.geo.adv ? this.o.wallTableAdv : this.o.wallTable;
      let v;
      if (wt) v = 100 * (db - da) + 50 + wt[lm][lo];
      else { const vm = rc && lo === 0 ? rc[lm] : curve[lm], vo = rc && lm === 0 ? rc[lo] : curve[lo]; v = 100 * (db - da) + 50 + vm - vo; }
      if (this.e2t) { // 第八代 e2root：根节点双墙表（见 buildE2）
        const T = this.e2t, km = Math.min(2, lm), ko = Math.min(2, lo);
        const tm = km ? T[km][1 - me] : null, to = ko ? T[ko][me] : null;
        v += this.o.e2w * ((tm ? tm[s.pos[1 - me]] : 0) - (to ? to[s.pos[me]] : 0));
      }
      return v;
    }
    return 100 * (db - da) + 50 + this.o.wallValue * (s.left[me] - s.left[1 - me]);
  }

  exact(da, db, ply) {
    const s = this.s, me = s.turn, la = s.left[me], lb = s.left[1 - me];
    if (this.o.infExact) {
      // 经典玩法墙只增不减：一旦到不了目标就永远到不了（只能由自己传送进死胡同造成）。
      if (da === E.INF) return db === E.INF ? 0 : (s.moves + 2 * db <= E.MAX_PLIES ? -(WIN - ply - 2 * db) : 0);
      if (db === E.INF) return s.moves + 2 * da - 1 <= E.MAX_PLIES ? WIN - ply - (2 * da - 1) : 0;
    }
    if (da === 1) return WIN - ply - 1;
    if (da <= db && lb === 0) return s.moves + 2 * da - 1 <= E.MAX_PLIES ? WIN - ply - (2 * da - 1) : 0;
    if (da > db && la === 0) return s.moves + 2 * db <= E.MAX_PLIES ? -(WIN - ply - 2 * db) : 0;
    return null;
  }

  /*
   * 第六代选项 wallExt（选择性延伸）：一堵墙让对手距离增加 ≥ wallExtMin 时，对这一应着多搜一层；
   * 每条路线最多延伸 wallExt 次。动机：多数败局是“视界外的多墙陷阱”（tools/losses.js），大伤害墙之后的局面最需要看深。
   * 返回本次延伸量（0/1），并累计 extUsed（调用方在回溯时扣回）。
   */
  extFor(m, me, d0, d1) {
    if (!this.o.wallExt || m.a < E.A_WALL || this.extUsed >= this.o.wallExt) return 0;
    const op = 1 - me, before = op === 0 ? d0 : d1, after = op === 0 ? m.d0 : m.d1;
    if (after - before < (this.o.wallExtMin || 3)) return 0;
    this.extUsed++;
    return 1;
  }

  negamax(depth, alpha, beta, ply, d0, d1) {
    if ((++this.nodes & this.clockMask) === 0 && Date.now() > this.deadline) throw new Abort();
    if (this.nodes > this.maxNodes) throw new Abort();
    const s = this.s;
    if (s.moves >= E.MAX_PLIES) return 0;
    const me = s.turn, da = me === 0 ? d0 : d1, db = me === 0 ? d1 : d0;
    const ex = this.exact(da, db, ply);
    if (ex !== null) return ex;
    const key = s.key();
    if (this.path.includes(key) || this.histZ.has(key)) return 0;
    if (depth <= 0) return this.evaluate(da, db);

    const alpha0 = alpha;
    const te = this.tt.get(key);
    let ttMove = -1;
    if (te) {
      ttMove = te.move;
      if (te.depth >= depth) {
        let sc = te.score; if (sc > MATE_EDGE) sc -= ply; else if (sc < -MATE_EDGE) sc += ply;
        if (te.flag === 0) return sc;
        if (te.flag === 1 && sc >= beta) return sc;
        if (te.flag === 2 && sc <= alpha) return sc;
      }
    }
    const moves = this.gen(ply, false);
    if (ttMove >= 0) { const i = moves.findIndex(m => m.a === ttMove); if (i > 0) moves.unshift(moves.splice(i, 1)[0]); }
    this.path.push(key);
    let best = -Infinity, bestMove = -1, first = true;
    for (const m of moves) {
      if (m.lazy && !this.resolveLazy(m, me)) continue;
      const ext = this.extFor(m, me, d0, d1);
      const u = this.make(m);
      let sc;
      const nd = depth - 1 + ext;
      if (u.a < E.A_WALL && s.geo.target[me][s.pos[me]]) sc = WIN - ply - 1;
      else if (first) sc = -this.negamax(nd, -beta, -alpha, ply + 1, m.d0, m.d1);
      else {
        sc = -this.negamax(nd, -alpha - 1, -alpha, ply + 1, m.d0, m.d1);
        if (sc > alpha && sc < beta) sc = -this.negamax(nd, -beta, -alpha, ply + 1, m.d0, m.d1);
      }
      this.extUsed -= ext;
      this.unmake(u);
      first = false;
      if (sc > best) { best = sc; bestMove = m.a; }
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) { this.killers[ply] = m.a; break; }
    }
    this.path.pop();
    if (bestMove < 0) return this.evaluate(da, db);
    let sv = best; if (sv > MATE_EDGE) sv += ply; else if (sv < -MATE_EDGE) sv -= ply;
    this.tt.set(key, { depth, score: sv, flag: best <= alpha0 ? 2 : best >= beta ? 1 : 0, move: bestMove });
    if (this.tt.size > 600000) this.tt.clear();
    return best;
  }

  run() {
    const s = this.s, fallback = A.bestRunMove(s, this.cache);
    let bestA = fallback, bestScore = null, depthDone = 0;
    if (this.o.routeThreat && !s.geo.adv) this.rt = T.routeTables(s, this.cache.get(s), this.o.threatK || 6); // 第五代：根节点路线威胁表
    if (this.o.e2root && !s.geo.adv && this.o.e2w) this.e2t = this.buildE2(s);
    const rootMoves = this.gen(0, true);
    const me = s.turn;
    { const f = this.cache.get(s); rootMoves.D0 = f[0][s.sid(0)]; rootMoves.D1 = f[1][s.sid(1)]; rootMoves.dist = new Map(rootMoves.map(m => [m.a, me === 0 ? m.d0 : m.d1])); }
    try {
      for (let depth = 1; depth <= this.o.maxDepth; depth++) {
        let alpha = -Infinity, beta = Infinity, iterBest = null, iterScore = -Infinity;
        const i = rootMoves.findIndex(m => m.a === bestA); if (i > 0) rootMoves.unshift(rootMoves.splice(i, 1)[0]);
        if (this.o.tieRun) { // 最佳走子永远第一个搜：其余着法（尤其是墙）必须严格更好才能取代它
          const j = rootMoves.findIndex(m => m.a < E.A_WALL); if (j > 0) rootMoves.unshift(rootMoves.splice(j, 1)[0]);
        }
        const scores = new Map();
        this.path.push(s.key());
        for (const m of rootMoves) {
          const ext = this.extFor(m, me, rootMoves.D0, rootMoves.D1);
          const u = this.make(m);
          let sc;
          const nd = depth - 1 + ext;
          if (u.a < E.A_WALL && s.geo.target[me][s.pos[me]]) sc = WIN - 1;
          else if (iterBest === null) sc = -this.negamax(nd, -beta, -alpha, 1, m.d0, m.d1);
          else {
            sc = -this.negamax(nd, -alpha - 1, -alpha, 1, m.d0, m.d1);
            if (sc > alpha) sc = -this.negamax(nd, -beta, -alpha, 1, m.d0, m.d1);
          }
          this.extUsed -= ext;
          this.unmake(u);
          scores.set(m.a, sc);
          if (sc > iterScore) { iterScore = sc; iterBest = m.a; }
          if (sc > alpha) alpha = sc;
        }
        this.path.pop();
        // 根节点防拖延：不前进的走子只有在分数显著更高（≥ rootRetreatGuard）时才允许
        if (this.o.rootRetreatGuard !== undefined) {
          const da0 = me === 0 ? rootMoves.D0 : rootMoves.D1;
          const isRetreat = a => a < E.A_WALL && rootMoves.dist.get(a) >= da0;
          if (isRetreat(iterBest)) {
            let bp = null, bps = -Infinity;
            for (const [a, sc] of scores) if (!isRetreat(a) && sc > bps) { bps = sc; bp = a; }
            if (bp !== null && iterScore - bps < this.o.rootRetreatGuard) { iterBest = bp; iterScore = bps; }
          }
        }
        bestA = iterBest; bestScore = iterScore; depthDone = depth;
        rootMoves.sort((x, y) => scores.get(y.a) - scores.get(x.a));
        if (Math.abs(iterScore) > MATE_EDGE) break;
      }
    } catch (e) { if (!(e instanceof Abort)) throw e; this.path.length = 0; }
    const action = bestA;
    return { action, info: { depth: depthDone, score: bestScore, nodes: this.nodes, bfs: this.cache.bfs, qdBad: A.quickD.bad, eg: this.egBuilt || 0 } };
  }
}

/*
 * 起点选择的小搜索（第四代选项 startSearch）：
 *   金方先选：value(g) = min_w Search(g,w)，取最大；木方后选：取使金方分数最小的 w。
 *   每个子局面用相同的 α-β（金方行动）做短搜索；预算平均分配。平手按距离最短、再按格子序。
 * 选点只发生两次，失败时回退到最短距离规则。
 */
function searchStart(st, o, budget) {
  const who = st.phase === E.PH_PICK0 ? 0 : 1;
  const cache0 = new A.DistCache(st.geo, 64);
  const fallback = pickStart(st, cache0);
  try {
    const total = budget.ms ? budget.ms * 0.9 : null, nodesEach = budget.nodes ? Math.max(500, Math.floor(budget.nodes / 9)) : null;
    const pairs = [];
    const golds = who === 0 ? st.geo.home[0] : [st.pos[0]];
    for (const g of golds) for (const w of st.geo.home[1]) pairs.push([g, w]);
    const each = total ? Math.max(5, Math.floor(total / pairs.length)) : null;
    const val = new Map();
    for (const [g, w] of pairs) {
      const t = st.clone(); t.pos = [g, w]; t.phase = E.PH_PLAY; t.turn = 0;
      const S = new Searcher(t, new A.DistCache(t.geo, 60000), o, each ? { ms: each } : { nodes: nodesEach }, Date.now());
      const r = S.run();
      val.set(g * 1000 + w, r.info.score === null ? 0 : r.info.score); // 金方视角
    }
    const g0 = cache0.get(st);
    const dist = c => g0[who][c * 5];
    let best = null, bv = -Infinity;
    for (const c of st.geo.home[who]) {
      let v;
      if (who === 0) { v = Infinity; for (const w of st.geo.home[1]) v = Math.min(v, val.get(c * 1000 + w)); }
      else v = -val.get(st.pos[0] * 1000 + c);
      if (v > bv || (v === bv && dist(c) < dist(best))) { bv = v; best = c; }
    }
    return best === null ? fallback : E.A_PICK + best;
  } catch (e) { return fallback; }
}

// 返回前再次用完整规则验证；不合法则回退（理论上不会发生）
function verifyOrFallback(st, a, fallback) {
  if (a === null || a === undefined) return fallback;
  if (E.isWall(a)) return E.wallLegal(st, a - E.A_WALL) ? a : fallback;
  const opts = []; E.moveOptions(st.geo, st.block, st.pos[st.turn], st.lock[st.turn], opts);
  const to = a >> 1;
  if (!opts.some(m => m.to === to)) return fallback;
  if ((a & 1) && st.geo.portal[to] < 0) return fallback;
  return a;
}

module.exports = { makeAB, Searcher, WIN, MATE_EDGE, verifyOrFallback };

},
"agents/baselines":function(require,module,exports){
'use strict';
// C 组自建的基线对手（用于研究，不是候选）。
const E = require('../engine');
const A = require('../analysis');
const { rng } = require('../maps');

function pickStart(st, cache) { // 选距离最短的营地格；平手取单墙最大延迟最小者（更稳）
  const who = st.phase === E.PH_PICK0 ? 0 : 1, g = cache.get(st)[who];
  let best = null, bd = 1e9;
  for (const c of st.geo.home[who]) if (g[c * 5] < bd) { bd = g[c * 5]; best = c; }
  return E.A_PICK + best;
}

function makeRandom(seed = 1) {
  const r = rng(seed);
  return { name: 'random', choose(st) {
    const acts = E.legalActions(st), walls = acts.filter(E.isWall), moves = acts.filter(a => !E.isWall(a));
    if (walls.length && r() < 0.2) return walls[Math.floor(r() * walls.length)];
    return moves[Math.floor(r() * moves.length)];
  } };
}

function makeRunner() {
  return { name: 'runner', choose(st) {
    const cache = new A.DistCache(st.geo, 64);
    if (st.phase !== E.PH_PLAY) return pickStart(st, cache);
    return A.bestRunMove(st, cache);
  } };
}

// 积极筑墙：只要能让对手多绕 ≥ minGain 且净收益 ≥1，就放净收益最大的墙
function makeGreedyWall(minGain = 2) {
  return { name: 'greedy-wall', choose(st) {
    const cache = new A.DistCache(st.geo, 4096);
    if (st.phase !== E.PH_PLAY) return pickStart(st, cache);
    if (st.left[st.turn] > 0) {
      const c = A.wallCandidates(st, cache, st.turn, 0);
      if (c.length && c[0].dOpp >= minGain && c[0].net >= 1) return E.A_WALL + c[0].s;
    }
    return A.bestRunMove(st, cache);
  } };
}

// 消极防守：只放“干净墙”（不伤自己、对手 Δ≥2），并且只在竞速落后或持平且对手已过半程时
function makeDefender() {
  return { name: 'defender', choose(st) {
    const cache = new A.DistCache(st.geo, 4096);
    if (st.phase !== E.PH_PLAY) return pickStart(st, cache);
    const me = st.turn, op = 1 - me, e = cache.get(st), dm = e[me][st.sid(me)], dop = e[op][st.sid(op)];
    if (st.left[me] > 0 && dm > dop - 1) {
      const c = A.wallCandidates(st, cache, me, 0).filter(w => w.dMe === 0 && w.dOpp >= 2);
      if (c.length) return E.A_WALL + c[0].s;
    }
    return A.bestRunMove(st, cache);
  } };
}

module.exports = { makeRandom, makeRunner, makeGreedyWall, makeDefender, pickStart };

},
};const cache={};function load(id){if(cache[id])return cache[id].exports;const f=modules[id];if(!f)throw Error("Missing module "+id);const m={exports:{}};cache[id]=m;f(req=>{if(req[0]!==".")throw Error("External require: "+req);const path=id.split("/");path.pop();for(const part of req.split("/")){if(part===".." )path.pop();else if(part!=="."&&part)path.push(part)}return load(path.join("/"));},m,m.exports);return m.exports;}
const P=load("protocol"),AB=load("agents/ab");const policies={"classic":{"label":"ab8-e2rc","kind":"ab","lazyWalls":true,"tieRun":true,"infExact":true,"wallCurve":[0,540,900,1180,1428,1650],"advLazy":true,"wallCurveAdv":[0,674,1074,1386,1676,1812],"e2root":true,"e2w":30,"e2cap":12,"e2slots":24,"wallCurveRunner":[0,265,615,982,1312,1650]},"advanced":{"label":"ab8","kind":"ab","lazyWalls":true,"tieRun":true,"infExact":true,"wallCurve":[0,540,900,1180,1428,1650],"advLazy":true,"wallCurveAdv":[0,674,1074,1386,1676,1812],"wallCurveRunner":[0,265,615,982,1312,1650],"wallCurveRunnerAdv":[0,274,739,1170,1300,1740]}};const agents={classic:AB.makeAB(policies.classic),advanced:AB.makeAB(policies.advanced)};root.MMJJXiaokeEngine=Object.freeze({policy:mode=>policies[mode]||null,decide:req=>{const mode=req?.state?.variant;if(!agents[mode])throw Error("Invalid variant");return P.decide({state:req.state,timeBudgetMs:Math.max(250,Math.min(8000,req.budgetMs||3000))},agents[mode]);}});})(typeof self==="object"?self:globalThis);
