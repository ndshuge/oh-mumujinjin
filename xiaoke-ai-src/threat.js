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
