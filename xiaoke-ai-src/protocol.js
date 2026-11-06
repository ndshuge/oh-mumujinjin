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
