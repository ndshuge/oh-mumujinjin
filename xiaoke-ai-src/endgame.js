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
