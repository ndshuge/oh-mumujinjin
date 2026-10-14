# G4 → G1 实际施工与验收交接（2026-10-14）

## 施工范围
以本机已有结果为准，只使用原有 game.js 规则判断合法性；所有联赛和守擂对局只记录结果，不保存逐手棋谱。未修改线上地狱 AI；未清理已有输出、未重置 Git、未触碰任何密钥或秘密文件。

## 已完成：G0 六轮联赛
- 命令：`node training/g4/verify64.cjs population-g0-64.json 6 260 20261014`
- 实测：**384/384 局；64 人，每人 12 局；全部换手配对；六张地图，稀疏/中密/密集各128局；非法0；367决胜、17和棋。**
- `training/output/lab/g4/g4-run-0-6r-b260-s20261014.final.json` 已存在。
- 自动生成 `training/g4/population-g1-64.json` 和 `training/output/lab/g4/selection-g0-6r-b260.json/.md`。
- **32 生存、32 淘汰、32 新生**，四个家族新代各16人。
- G0 真实前五（均12局；按完整选育报告顺序）：
  1. g4-h05，12–0–0，100.0%；
  2. g4-h09，11–1–0，91.7%；
  3. g4-p10，10–2–0，83.3%；
  4. g4-h13，10–2–0，83.3%；
  5. g4-h01，10–2–0，83.3%。
- 新生有界变异实例：`g1-nch07` high-simulation，`g1-hch02` model-switch，`g1-hch03` neural-obsession，`g1-hch06` high-simulation，`g1-hch08` maximal-exploration。这不是重新训练神经元权重。

## 已完成：全新地图辅赛
- `training/output/lab/g4/FRESH_CHALLENGE_RESULTS.json` 报告完成240局，结果合法0违规。
- Odd-Dreamer：95胜25负，79.2%，按地图配对95%区间[72.5%,85.8%]，耗时p95 651ms。
- Odd-Hawks：85胜35负，70.8%，按地图配对95%区间[62.5%,79.2%]，耗时p95 561ms。
- 同一开发图集，新地图但不足正式1000局；不得用两者百分比差单独断言胜负显著，更不能上线。

## 新施工：S5.2 共同基准复赛
- `training/g4/prepare-stageb.cjs` 新增了安全只创建一次的候选锁定，读取G0已验收结果和选择建议；按搜索、纯PUCT、神经、混合每类4人，合计16人。
- 生成 `training/league/population-g4-stageb.json`（研究候选快照）和 `training/output/lab/g4/STAGEB_G0_LOCK.json`，记录策略/候选/地图 SHA256 等。
- 从历史 S0 heldOut **开发池**取从偏移702起的12张布局，稀疏/中密/密集各4张。它们不属于封存500图；与S0已使用地图同源，明确只用于开发比较。
- 复用已有 `training/g3/champion-series.cjs`、`training/league/challenge.cjs`、`game.js` 裁判，不另写棋规；每个候选同图交换先手对冻结V1.1，260ms软预算，每人24局，合计384局。
- 已启动持续进程：`node training/g3/champion-series.cjs population-g4-stageb.json 12 260 702 1`。
- 进度：`training/output/lab/g3/champions-population-g4-stageb-702-12-b260.progress.json`。每个候选整批结束后才更新已完成局数，中途0不意味着进程未运行。结果文件内没有棋谱。

## 新施工：G1 第二代联赛
- 新种群64位，32继承 + 32新生，已启动：
  `node training/g4/matchday64.cjs population-g1-64.json 0 260 1200 20261016`
  `node training/g4/run64.cjs population-g1-64.json 6 260 1 20261016 1200`
- G1预览六张开发地图与G0六张地图布局互不重叠；依然按稀疏/中密/密集分层与换手对照，计划384局。
- G1 原始结果：`training/output/lab/g4/gen1-roundX-b260-s20261016.results.jsonl`；进度：`training/output/lab/g4/g4-run-1-6r-b260-s20261016.progress.json`。
- 当前进行中，不要再启动以上同名任务。该控制进程将自动等待round0并在384局通过后调用选育，正常产出G2。

## 仍在继续的独立任务
- Odd-Hawks vs V1.1封存500图×换手1000局：`exam-odd-hawks-novel-sealed-20261030-500-b350.progress.json`；不能拿中途胜率当最终结论。
- V1.1自对弈：train 9000局已安全恢复、仍在写分片；heldOut 1000局完成。V1.1自对弈仅产生数据，不等于神经网络学会了新策略。

## 验收与风险
- 已通过 `node smoke.cjs` 和 `node ai-regression.cjs`，并通过 `node training/g4/hall-verify.cjs`；指纹未发现改变。
- G0 已审计；G1 和 S5.2 仍需等待真实结果，不能凭 G1 排名自动声称棋力提升。
- S5.2 是共同V1.1开发比较；真正晋级依然需要事前冻结、未见过的500张封存地图双向1000局、配对区间下界大于50%、零非法、分层表现和浏览器Web Worker/手机性能门槛。
- 当前工作区存在其他既有未提交修改，如game.js、strong-search.js、training/lab-batch.cjs，保持不动；不要重置、覆盖或一次性提交所有工作。
