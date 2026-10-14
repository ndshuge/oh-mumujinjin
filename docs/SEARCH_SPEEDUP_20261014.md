# 搜索提速：computerDistance 记忆化（2026-10-14）

## 目标

让 G6 自对弈吞吐可行，**且不改变任何一个决策**。
若提速会改变落子，那它就不是提速，而是换了一个 AI——所有历史基线都会作废。

## 剖析（`training/profile-puct.cjs`）

对 96 个真实局面 × 64 次模拟（6144 次节点展开）做逐函数计数与计时：

| 函数 | 调用次数 | 总耗时 | 单次 | 占搜索耗时 |
|---|---|---|---|---|
| `computerDistance` | 457,632 | 62,921 ms | 137.5 µs | **71%** |
| `hellCandidates` | 6,144 | 25,447 ms | 4,142 µs | 29%（含内部调用） |
| `hellApply` | 111,432 | 70 ms | 0.6 µs | ~0% |

合计搜索 88.8 秒，`msPerSim` = 14.45。

### 一次更正

先前记录里写的"`hellCandidates` 每次展开要验证最多 **192** 个筑墙位置"是**错的**。
`game.js:487` 的实际循环是 `for(dx=-2;dx<=1) for(dy=-2;dy<=1)`，
即 4×4×2 = **32 个**候选位置，且只围绕对手棋子。

### 调用来源

71% 的耗时来自 `puct.cjs` 的 `heuristic()`：它每条边调用两次 `computerDistance`
（我方到对方营地的距离、对方到我方营地的距离）。
每次节点展开约 36 条合法边 → (36+1)×2 ≈ 74 次调用/展开。

## 改法：记忆化，而不是改算法

`computerDistance(start, goal, walls, lock)` 是**纯函数**：
返回值只取决于这四个参数加上 `ROCKS` 静态地形。因此缓存它的返回值**不可能改变任何结果**。

新增 `training/fast-distance.cjs`：在**训练层**把 `engine.computerDistance` 替换为带缓存的版本。

- **不改 `game.js`。** 线上正式文件一个字节都没动，缓存只在训练脚本里安装。
- 键包含 `start / lock / 目标营地 / walls`；`setRocks()` 被包装并在换图时清空缓存，
  避免跨地图取值泄漏。
- 缓存上限 400,000 条，超限整体清空。清空只影响速度，不影响正确性。
- `stats()` 暴露命中数/未命中数/清空次数，写进产物里便于审计。

### 记忆化的收益原理

同一局面在搜索中被反复求值：某条边算出的"子节点到营地的距离"，
在子节点自己被展开时又会以 `heuristic(child, 1-p)` 的形式**再算一遍**。
缓存把这类重复计算直接吃掉。

## 证据一：A/B 基准（`training/bench-puct.cjs`）

同一份确定性负载跑两遍——一遍不装缓存，一遍装——并**要求落子序列完全一致**：

```json
{
  "decisions": 48,
  "identicalDecisions": true,
  "baselineMs": 47250.8,
  "cachedMs": 23627.6,
  "speedup": 2.00,
  "distanceCalls": 222560,
  "cacheHits": 164450,
  "cacheMisses": 58110,
  "hitRate": "73.9%",
  "msPerDecisionBaseline": 984.4,
  "msPerDecisionCached": 492.2
}
```

命中率 73.9%，**加速 2.00 倍**，48 步决策逐一相同。

## 证据二：确定性门 + 跨版本摘要比对

`training/g4/g5-determinism-gate.cjs` 现在内嵌了**优化前**记录的六个摘要，
要求优化后逐字节一致。任何决策漂移都会让门失败。

```
DETERMINISM map3-seat0 REPRODUCIBLE 09cba122e377   9838ms  (优化前 17686ms)
DETERMINISM map3-seat1 REPRODUCIBLE d20fc4d40096   8454ms  (优化前 17599ms)
DETERMINISM map4-seat0 REPRODUCIBLE 7c6b40e00af3  10526ms  (优化前 20563ms)
DETERMINISM map4-seat1 REPRODUCIBLE 41b0d90c2797  12351ms  (优化前 22961ms)
DETERMINISM map8-seat0 REPRODUCIBLE e76ee6db7ab1   8598ms  (优化前 19828ms)
DETERMINISM map8-seat1 REPRODUCIBLE 4cf10cda44be   8753ms  (优化前 18718ms)
{"pass":true,"configs":6,"reproducible":6,"equivalentToPreOptimisation":true}
```

六个摘要与优化前**完全相同**，耗时约减半。门本身从 3 分 54 秒降到 1 分 57 秒。

## 仍未解决的余量

剩余耗时的大头是 `hellWallAllowed → findPath`：每个节点 32 个候选 × 2 次寻路。
这两个函数是 `game.js` 内部的闭包引用，**没有从训练边界拦截的入口**，
所以无法在不动线上文件的前提下缓存。

要再往上提速，只有两条路：

1. 动 `game.js`（会改变线上正式游戏）——**本次明确不做**。
2. 改搜索算法本身（例如限制墙候选、跳步剪枝）——会改变落子语义，
   使全部历史基线与摘要作废，必须重建基线后才行。

所以当前结论：**在不动线上文件的前提下，2 倍是本次能拿到的全部**。

## 对规模的影响

| 配置 | 优化前 | 优化后 | 10000 局预计（优化后） |
|---|---|---|---|
| 64 次模拟 | 32.9 s/局 | ~16.5 s/局 | 约 45 小时 |
| 32 次模拟 | 18.1 s/局 | ~9.1 s/局 | 约 25 小时 |

即使提速一倍，10000 局仍然不是一次能等的量级。
因此 G6.1 采用**可续跑的增量批量**，而不是一次性跑满。
