# 木木金金棋 · G4 AI 进化阶段验收快照（2026-10-14）

## V1.1 固定参考守擂赛：4 种 AI × 100 局

双方都在 50 张来自已有 S0 保留池的地图上交换先后手，每步给相同的 **350ms 请求预算**。注意这是**已经使用过的地图池**，不构成最终新地图盲测。

| 实验 AI | 胜 | 负 | 和 | 得分率 | 按地图成对 Bootstrap 95% 区间 |
| --- | ---: | ---: | ---: | ---: | --- |
| Odd-Hawks 激进混合搜索 | 79 | 21 | 0 | 79% | [72%,86%] |
| Odd-Dreamer 双网络混合 | 75 | 25 | 0 | 75% | [66%,83%] |
| Odd-Tortoise 搜索优先混合 | 65 | 35 | 0 | 65% | [57%,73%] |
| Odd-Tunnel 极低探索 PUCT | 53 | 47 | 0 | 53% | [44%,62%] |

与旧8局试验相比，Odd-Tunnel 的优异成绩明显回落；Odd-Hawks、Odd-Dreamer 是当前优先晋级候选。不能把某次 8/8 或 79/100 直接当成地狱 AI 正式通过。

## G4 64 AI 种群

- 初始搜索 16、纯 PUCT 16、神经辅助 PUCT 16、混合 16，共64名。
- 6 个比赛日 × 每日 64 局 = 384局，每名 AI 12局。地图类型按稀疏/中等/密集分层。
- 每代结束后，四个家族各8名生存者和8名后代，总计保留32、淘汰32、新生32。约25%后代可能获得极端探索系数、较深搜索、混合比例极端值或神经网络切换。
- 全程保留结果、排名、亲缘、淘汰列表，**不保存具体落子轨迹**。
- 生成脚本、选育单测、规则引擎回归已通过。进度随本机训练过程继续推进。
- 结果文件：training/output/lab/g4/LIVE_RESULTS.md（阅读）与 g4-run-0-6r-b260-s20261014.progress.json（进度）。

## 名人堂

保存冻结参考 V1.1 和六份实验候选完整策略基因。每份基因附 SHA256 指纹，并封存12个依赖源文件/模型权重哈希，便于追溯。所有新冠军仍标记为候选，不可自动替换线上。

## 全新地图考试已准备并开始

为了避免同一套地图反复训练导致虚假胜率，已在 **Odd-Hawks 参数锁定之后**生成500张新的合法地图：

- 随机种子 20261030、地图数 500；稀疏 167、中密 167、密集 166。
- 与已收集的8947种 S0 布局重叠数0。
- 500张地图已经固定并打包 manifest SHA256，也绑定 Odd-Hawks 的完整基因 SHA256。
- 先独立用3张未见地图做6局冒烟验证：Odd-Hawks 4胜2负，非法行动0。这仍不是正式胜率。
- 开始对 Odd-Hawks 运行500地图换手 1000局的真实考试：它是可恢复的按局写出结果，不存每步棋谱。
- 输出：training/output/lab/g4/novel-sealed-20261030-500.manifest.json，以及 exam-odd-hawks-novel-sealed-20261030-500-b350.progress.json。
- 只有配对 Bootstrap 95%区间下界大于50%、零非法动作、全部1000局完结，才有资格进入**浏览器 Web Worker 和真机性能验收**。完成这个实验前不能宣布取得正式胜利。

注意：研究和竞赛中的 350ms/步不是玩家地狱 AI 最终的时间预算；玩家模式计划普通回合约1秒，关键回合3–5秒，以实际移动端性能为准。

## 运行

- 自查冠军基因：node training/g4/verify-hall.cjs
- 当前成绩：node training/g4/status.cjs
- 核对64 AI比赛是否双方换手、合法：node training/g4/validate-results.cjs population-g0-64.json 6 260 20261014
- 验证64个参数基因杂交：node training/g4/test64.cjs
- 生成全新地图：node training/g4/generate-novel-maps.cjs SEED 500 sealed FROZEN_GENOME_SHA256
- 在已封存全新地图上考试：node training/g4/challenge-newmaps.cjs population-strange.json odd-hawks novel-sealed-20261030-500.jsonl 350

GitHub Pages 正式地狱 AI 没有替换。已经存在的 game.js、strong-search.js 等其他未提交修改保留原样。
