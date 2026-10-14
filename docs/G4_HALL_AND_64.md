# 《哦，木木金金棋》G4：冠军库、64 AI 进化、V1.1 守擂

日期：2026-10-14。工作区：E:\CHATGPT\projects\oh-mumujinjin

## 当前实现与目标

本轮只记录**每局参赛 AI、地图分类、先后手、胜负、总耗时、非法动作数量**，不保存逐步行动棋谱。

1. **冠军库**：training/g4/hall-of-fame.json，已经冻结 6 位候选及其 SHA-256 策略配置。保存历史记录不意味着已获正式认证；现阶段只有 V1.1 为冻结比较基线。
2. **64 AI 多策略种群**：training/g4/population-g0-64.json，分为搜索系、纯规则 PUCT、神经网络 PUCT、搜索与网络混合系，**每类 16 位**。四类的输入与输出均交给 game.js 规则验证。
3. **自然选择**：每代六个比赛日，地图轮换稀疏、中密、密集，每个比赛日 64 局，每名 AI 正反手各一局；总计 384 局，每名 12 局。每个家族取前八名保留、后八名淘汰，并用生存者生成八名子代，保持下一代仍是 16×4。约 25% 子代有有界的“怪异突变”。
4. **守擂复试**：四名初筛领先候选 Odd-Hawks、Odd-Tunnel、Odd-Tortoise、Odd-Dreamer，在 50 张保留地图上各挑战 V1.1 两局换手，即 100 局/位，350ms/步，共 400 局。四名都完成后自动生成可读排行榜和成对 Bootstrap 95% 置信区间。
5. **晋级闸门**：比赛胜率不代表已经增强线上 AI。守擂数据来自早期已有的 heldOut 地图，不是新封存地图；多个候选被筛选与比较，会有赢家偏差。成为真正的 Hell AI 需要：冻结权重与策略、至少 500 张完全未参与调参的地图×换手 1000 局、所有行动合法、分层地图验收、Web Worker 真机性能验收。

## 主要文件

| 用途 | 本机相对路径 |
|---|---|
| 当前 64 人种群 | training/g4/population-g0-64.json |
| 历史冠军库 | training/g4/hall-of-fame.json |
| 64 人每轮原始比赛结果（不含棋谱） | training/output/lab/g4/gen0-roundX-b260-s20261014.results.jsonl |
| 64 人联赛进度 | training/output/lab/g4/g4-run-0-6r-b260-s20261014.progress.json |
| 实时战绩（便于查看） | training/output/lab/g4/LIVE_64_RESULTS.md |
| 64 人赛事完整性审计 | training/output/lab/g4/VERIFY64_GEN0.json |
| 64 人每代淘汰＋繁殖 | training/g4/select64.cjs |
| 下一代选手配置（该代完成后生成） | training/g4/population-g1-64.json |
| 扩大守擂成绩 | training/output/lab/g4/V11_CHALLENGE_100_RESULTS.md |
| 守擂成绩验证生成器 | training/g4/challenge-results.cjs |
| 守擂完成后自动收口 | training/g4/finalize-wait.cjs |
| 首轮各候选单独成绩 | training/output/lab/challenge-odd-hawks-1310-50-b350.json 等 |

## 常用命令（在项目目录执行）

检查 64 人排行榜：

    node training/g4/status64.cjs population-g0-64.json 6 260 20261014

审计 64 人已完成的结果：

    node training/g4/verify64.cjs population-g0-64.json 6 260 20261014

按四名选手已经完成的实际结果生成守擂榜：

    node training/g4/challenge-results.cjs

执行一代 64 AI 自动联赛（须确认没有同一实验在运行）：

    node training/g4/matchday64.cjs population-g0-64.json 0 260 760 20261014
    node training/g4/run64.cjs population-g0-64.json 6 260 1 20261014 760

第一条单独运行 round0；第二条跑后续各轮并等待 round0 结束。这两条已经属于实际进程，重复启动会导致进程争抢同一结果文件。

## 重要技术边界

- 当前遗传的是搜索引擎版本、搜索深度、PUCT 模拟次数和探索系数、网络策略/价值输出权重、两种网络组合比例和搜索预算分配。**并没有通过交叉重新训练神经元权重。**
- 搜索预算属于软件层面设置；实际耗时可能超过设定，需要单独测量 P95，并在网页 Web Worker 中采用可取消的截止时间。
- 本机已有大量 9000 局 V1.1 自对弈数据采集，和本轮进化联赛是独立实验；不能将采集局数算作 G4 某个候选的胜利。
- 所有当前名次属于研发实验，永远不要在未经独立闸门认证时自动替换 GitHub Pages 的地狱 AI。
