# G6 自对弈管线修复 v2（2026-10-14）

## 被替换的对象

`training/g6-selfplay-puct-runner.cjs` 在 14:39–14:40 产出了
`training/output/lab/g6/selfplay-puct-g6.jsonl`：10 局、647 条样本、0 非法。
这份产出**保留不动**，作为被否决的证据；v2 写入新的分文件，不覆盖它。

## v1 的五个缺陷（逐条对产物核验）

### 1. policy 分布从未落盘 —— 最致命

```js
// v1
samples.push({state:clone(s),side,map,policy:result.policyVector,value:null,...});
```

`puct.search()` 返回的字段名是 `policy`，不是 `policyVector`。
`result.policyVector` 恒为 `undefined`，`JSON.stringify` 直接丢掉该键。

核验：`grep -c '"policy"' selfplay-puct-g6.jsonl` → **0 / 647**。
而 `selfplay-manifest-g6.json` 要求 `policyTarget: "PUCT_distribution_required"`。
也就是说，AlphaZero 闭环唯一的关键监督信号一条都没写下来。

### 2. 自对弈跑在空棋盘上

```js
function makeMap(){return engine.cleanMap({version:1,name:"g6-map-"+...,rocks:[]});}
```

`rocks` 恒为空数组，而且**全程没有调用 `engine.setRocks(map.rocks)`**。

核验：647 行全部是 `"rocks":[]`；10 张图全叫 `g6-map-*`，无一是真实棋图。
后果不只是"简单"，而是 `engine` 的岩石状态取决于进程里上一次 `setRocks`，
存在串图风险。

### 3. value 回填跨局污染

```js
for(const x of samples.slice(-120))x.value=...;
```

`samples` 是**全局**数组。某一局不足 120 步时，`slice(-120)` 会切到上一局的尾部样本，
用本局胜负覆盖它们的 value。v2 改为按局缓冲、局内回填、整局一次落盘。

### 4. 输出不可重跑

```js
if(fs.existsSync(out))throw Error("immutable selfplay output exists");
```

崩一次就得手工改名才能继续。v2 改为 append-only + 进度文件，可安全续跑。

### 5. 缺少真实规则的终局判定

v1 只判"到达对方营地"，没有重复局面与无路可走。真实规则里有四种终局。

## v2 设计

脚本：`training/g6-selfplay-puct-runner-v2.cjs`

- **确定性**：`puct.search(..., {simulations, deterministic:true})` —— 严格跑满固定模拟次数。
- **真实棋图**：从地图库读图并 `engine.setRocks(map.rocks)`。
- **四种终局**：`goal` / `noMovement` / `repetition`（同局面第 3 次）/ `cap`（120 手）。
- **完整样本**：`gameIndex, ply, side, opening, mapName, mapHash, mapTier, state,
  policy(232 维), policyVersion, policyMass, visits, nodes, value, source`。
- **开局随机**：每局掷币决定先后手，避免数据偏向单侧。
- **前置审计**：启动即比对训练图指纹与 `s0-records-120-10000.jsonl`、
  `novel-sealed-20261030-500.jsonl`、`fresh-map-bank-20261015-120.json`，
  **重叠不为 0 直接抛错**。训练图绝不允许碰到评估图。
- **可续跑**：进度文件记录 `seed / simulations / bankDigest / plyCap`，
  配置不一致时拒绝续跑（而不是静默混数据）。

### 训练地图库

用项目既有的 `training/g4/generate-novel-maps.cjs`（不是新写一套）生成：

```
node training/g4/generate-novel-maps.cjs 20261014 60 pilot
→ training/output/lab/g4/novel-pilot-20261014-60.jsonl
  60 张，sparse/medium/dense 各 20，与 S0 布局重叠 0
```

与两个盲测库的实测重叠：`novel-sealed` **0**，`fresh-map-bank` **0**。

## 验收证据（小样，3 局 190 样本）

```
has policy: 190 / 190，全部长度 232
policy 求和 min/max: 1.0000 / 1.0002   （5 位小数取整误差，≤232×5e-6）
每个样本非零 policy 项均值: 13.5        （合法掩码生效）
distinct maps: 3，取自真实棋图库
value 分布: {1: 96, -1: 94}             （无和棋）
degeneratePolicies: 0   policyLenViolations: 0   illegal: 0
```

对比 v1：policy 字段 0/647、全空棋盘 → v2：190/190、真实棋图。

## 吞吐实测与 10000 局的现实性

| 配置 | 单局耗时 | 10000 局预计 |
|---|---|---|
| 64 次模拟 | 32.9 s | **约 91 小时** |
| 32 次模拟 | 18.1 s | 约 50 小时 |

10000 局在当前实现下**不可行**。因此本次先跑一个能收口的批量：
**200 局 @ 32 次模拟**，约 60 分钟，产出约 1.25 万条带 policy 的样本。

瓶颈位置（实测见 [SEARCH_SPEEDUP_20261014.md](SEARCH_SPEEDUP_20261014.md)）：

- `computerDistance` 占搜索耗时 **71%**（88.8 秒总耗时中 62.9 秒，457,632 次调用，137 µs/次）。
- 每次节点展开约调用它 74 次：`puct.nodeFor` 对每条合法边算 `heuristic(next,p)`，
  每条边两次 BFS，共约 36 条边。
- 一次更正：先前记的"每次展开验证 192 个筑墙位置"是**错的**。
  `hellCandidates` 只扫描 `dx,dy ∈ [-2,1]` 共 4×4×2 = **32 个**候选位置。

## 续跑与扩容命令

```bash
# 续跑 / 扩容（配置必须一致：同一 bank、seed、simulations、plyCap）
node training/g6-selfplay-puct-runner-v2.cjs \
  training/output/lab/g4/novel-pilot-20261014-60.jsonl \
  <目标局数> 32 20261014 120
```

`targetGames` 不参与续跑校验，所以把目标从 200 改大即可继续累积。
换 `simulations` 或换地图库时必须换文件名，脚本会直接拒绝混跑。

输出：

- `training/output/lab/g6/selfplay-puct-g6-v2.jsonl`
- `...progress.json` / `...report.json` / `...run.log`

用 `G6_SELFPLAY_TAG=xxx` 前缀可把试跑与正式产物隔离。

## 明确不做的事

- 不替换 `g4-h13`，不改 `game.js`，不碰 GitHub Pages，不重建 `xiaodi-engine.js`。
- 不把这份自对弈数据当成"棋力提升"。它只是 G6.3 训练所需的输入；
  必须先真训权重、真做留出集与同预算对战，才谈得上候选。
- 不使用任何封存盲测地图，前置审计已强制为 0 重叠。
