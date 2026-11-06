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
