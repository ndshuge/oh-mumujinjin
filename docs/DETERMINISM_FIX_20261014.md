# 搜索确定性修复（2026-10-14）

## 问题

`training/output/lab/g5/STATUS.json` 的 `gates.replayDeterminism` 长期是 `FAIL_3_OF_6`：
同一张图、同一座位重放，胜负会翻转（地图 3 两个座位、地图 4 的 seat1）。

在这条不修好之前，**所有**对抗胜率都带非确定性噪声，包括那份 73.8% 的 odd-hawks 封存考试。

## 根因（两处，互相独立）

### 1. 搜索用墙钟做停止条件

| 文件 | 位置 | 原实现 |
|---|---|---|
| `strong-search-v1.1.js` | negamax 第 112 行 / 根循环第 145 行 | `if(visited%16===0&&Date.now()>=deadline)throw Error("SEARCH_TIMEOUT")` |
| `strong-search-v2.js` | 同上 | 同上 |
| `strong-search-v3.js` | 同上 | 同上 |
| `training/puct.cjs` | 主循环第 58 行 | `if(iter>0 && Date.now()>=deadline)break;` |

机器一忙，迭代加深就少走一层、MCTS 就少跑几次模拟，落子随之改变。
两个候选都是 hybrid（`g4-h13`: v1.1 深度 2 + n64；`odd-hawks`: v3 深度 2 + v3），
所以两条路径都受影响。

已核对：这些文件里**没有** `Math.random`，也没有其它随机源。不确定性 100% 来自墙钟。

### 2. 旧的验收脚本本身就不可能通过

`training/g4/g5-replay-acceptance.cjs` 拿 `TOP5_VS_ODD_HAWKS_20261014.jsonl` 里
**用 260ms 墙钟预算跑出来的**纪录，去比对另一个**同样用墙钟跑出来的**重放。
两边都是非确定性的，不一致是构造性的必然结果，与规则正确性无关。

也就是说：`FAIL_3_OF_6` 这个数字**从来就不携带任何信号**。

## 修复

新增一个**默认关闭**的确定性模式，只在显式传入时生效。默认路径逐字节不变。

### `strong-search-v1.1.js` / `v2` / `v3`

```js
const maxNodes=Number.isFinite(options.maxNodes)&&options.maxNodes>0?Math.floor(options.maxNodes):null;
const timeCapped=!options.deterministic&&maxNodes===null;
const deadline=timeCapped?start+timeLimitMs:Infinity;
const overBudget=()=>maxNodes!==null?visited>maxNodes:timeCapped&&Date.now()>=deadline;
```

- `options.deterministic:true` → 去掉时间上限，只受 `depth` 限制。
- `options.maxNodes:N` → 改用**固定节点预算**。节点数只取决于搜索树，与机器速度无关，
  既能复现又能控制耗时。

### `training/puct.cjs`

```js
const deadline=opt.deterministic?Infinity:Date.now()+Math.max(1,opt.timeMs||60000);
```

`opt.deterministic:true` → 严格跑满 `simulations` 次模拟。`Date.now()>=Infinity` 恒为 false，
所以主循环第 58 行无需改动。

### `training/league/agent.cjs`

`move()` 增加第 7 个可选参数 `searchOptions`，把确定性开关**透传**给 search 与 puct 两条分支，
包括 hybrid 里的递归调用。不传时为 `{}`，展开后不产生任何字段。

## 验收证据

新脚本 `training/g4/g5-determinism-gate.cjs`：对 3 图 × 2 座位 = 6 个配置，
在**两个独立进程**里各跑一遍完整对局，比对决策摘要（SHA-256）。

```
DETERMINISM map3-seat0 REPRODUCIBLE 09cba122e377 17686ms/17285ms
DETERMINISM map3-seat1 REPRODUCIBLE d20fc4d40096 17599ms/17989ms
DETERMINISM map4-seat0 REPRODUCIBLE 7c6b40e00af3 20563ms/21080ms
DETERMINISM map4-seat1 REPRODUCIBLE 41b0d90c2797 22961ms/22830ms
DETERMINISM map8-seat0 REPRODUCIBLE e76ee6db7ab1 19828ms/19625ms
DETERMINISM map8-seat1 REPRODUCIBLE 4cf10cda44be 18718ms/18225ms
{"pass":true,"configs":6,"reproducible":6}
```

报告：`training/output/lab/g5/determinism-gate.json`
摘要只覆盖 `{winner, ending, steps[].action}`，**排除**耗时字段——时间仍然会变，但决策不会。

`training/g4/g5-status.cjs` 已改为从 `determinism-gate.json` 派生
`gates.replayDeterminism` = `PASS_6_OF_6`，并把旧的 `replay-acceptance.json`
保留为 `determinism.legacyDeprecated`，注明其已被取代及原因。

## 回归

`smoke` / `portal-regression` / `ice-regression` / `ai-regression` /
`terminal-regression` / `workshop-regression` 六个测试全部 PASS。

默认路径不变的推导：`maxNodes===null` 且 `options.deterministic` 为假 →
`timeCapped=true` → `deadline=start+timeLimitMs`（与原式同值）；
第 112 行的 `(maxNodes!==null||visited%16===0)` 退化为 `visited%16===0`。
即所有默认分支的表达式与修改前等价。

## 还没解决的（重要，别当成已完成）

1. **冻结冠军的历史成绩是墙钟下测的。** `g4-h13` 的 68.3% 均值、odd-hawks 的 73.8%
   都来自墙钟竞场，严格来说不可复现。晋级任何候选之前，需要用确定性模式**重测一遍基线**，
   否则拿旧数字和新数字比较是不合法的。
2. 确定性模式明显更慢（单局约 18–23 秒）。正式评测需要先定一个统一节点预算
   （`maxNodes`），使双方公平且耗时可控。
