# 木木金金棋 G4 / G0 完整联赛验收收据

日期：2026-10-14，北京时间。参照 docs/G4_TAKEOVER_VERIFIED_20261014.md 的接管实测与原始 JSONL / report。本文不自动部署任何研究 AI。

## G0 赛季正式完成

- 状态：complete；文件：training/output/lab/g4/g4-run-0-6r-b260-s20261014.final.json。
- 完成 6/6 轮，384/384 局，六张开发地图；稀疏128、中密128、密集128。
- 完整审计：node training/g4/verify64.cjs population-g0-64.json 6 260 20261014 返回 complete=true, acceptedRounds=6, playerGamesMin=12, playerGamesMax=12, allMirroredPairsValid=true, illegalActions=0，目标局数和实际局数一致。
- 终局：goal=367，draw=17，noMovement=0。只保存比赛结果和基础指标，不保存具体每手棋谱。
- 260ms/步是请求软件预算，不是强制耗时截止；这不是网页正式晋级的性能认证。

## 正式选育榜前五

此表以 training/output/lab/g4/selection-g0-6r-b260.md 的**选育程序最终排名**为准，同分按对手成绩排序：

| 名次 | ID | 家族 | 胜-负-和 | 对局数 | 得分率 |
|---:|---|---|---|---:|---:|
| 1 | g4-h05 | hybrid | 12-0-0 | 12 | 100.0% |
| 2 | g4-h09 | hybrid | 11-1-0 | 12 | 91.7% |
| 3 | g4-p10 | rule-puct | 10-2-0 | 12 | 83.3% |
| 4 | g4-h13 | hybrid | 10-2-0 | 12 | 83.3% |
| 5 | g4-h01 | hybrid | 10-2-0 | 12 | 83.3% |

同代积分只作初筛，不跨代比较不同对手池的胜率，也不等于打败冻结 V1.1。

## G1 自然选择验收

- 选育已实际执行：生存32，淘汰32，新生32，四家族各16个席位。
- 输出：training/g4/population-g1-64.json；training/output/lab/g4/selection-g0-6r-b260.json / .md。
- 独立使用 training/league/agent.cjs 的 check() 校验 G1全部64名，generation=1，distinctIds=64，survivor=32，crossover=32，search/rule-puct/neural/hybrid各16；验证通过。
- 5个有界怪异变异：
  1. g1-nch07，high-simulation，父母g4-n06+g4-n13。
  2. g1-hch02，model-switch，父母g4-h01+g4-h02。
  3. g1-hch03，neural-obsession，父母g4-h10+g4-h15。
  4. g1-hch06，high-simulation，父母g4-h05+g4-s01。
  5. g1-hch08，maximal-exploration，父母g4-h10+g4-n05。
- 这些只对推理超参数和模型输出集成执行杂交，没有剪切或拼接神经网络权重；G1尚未举行正式联赛，不能宣称新生选手更强。

## 各项后续实验状态（本次完成G0验收时）

- Odd-Hawks 新封存地图对V1.1已记录200/1000局、155胜45负、0和、非法0；仍在运行，初步结果不能宣布千局通过，更不能晋级线上。
- Odd-Hawks、Odd-Dreamer 辅助全新地图复试相互独立，已查真实进程与输出；汇总前须逐一确认最终report。
- 9000局训练自对弈本次从5700个完整纪录安全恢复，已真实增长到6100/9000、完成305/450个分片、非法0；进程持续运行；另1000局heldOut已经完整验收，不得把此工作当神经权重已训练完成。
- 冻结V1.1旧开发图成绩：Odd-Hawks 79-21，Odd-Dreamer 75-25，Odd-Tortoise 65-35，Odd-Tunnel 53-47。旧图结果只能作为开发集。
- 历史冠军库指纹/基因核验通过（6候选、10依赖文件）；smoke.cjs 与 ai-regression.cjs 通过。未修改正式游戏或线上AI。

## 下一道非重复验收

- 已生成 S5.2 的 16 强共同 V1.1 基准名单，见 training/output/lab/g4/STAGED_SELECTION_ADVICE_G0.md（4家族各4个）。名单为候选提议，不是正式晋级；应使用相同开发地图、相同预算、交换先后手和结果-only记录。
- 优先等待已运行的封存地图考试与D0采集推进，避免重复启动它们造成同一数据文件冲突。
- 若要启动下一代G1比赛，必须新设不与G0冲突的输出键/检查点并确认对局环境；不能只根据12局平均胜率决定新一代真正棋力增长。
- 任何线上晋级必须经过500全新图×双方换手1000局、配对95%区间下界>50%、零非法、三地图密度核验、实际单步耗时和 Web Worker / iOS / Android / 超时回退实测。

这个阶段的**验收已完成的是 G0 384场 + G1繁殖结构 + 9000局安全恢复**，不是全部研究最终上线验收。
