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
