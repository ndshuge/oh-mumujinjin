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
