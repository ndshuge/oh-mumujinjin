# 《哦，木木金金棋》AI 进化实验室 · G4 新对话施工交接

快照：2026-10-14 10:30（北京时间）。以下运行数值会变化，接管者必须先核查最新输出与进程，不能把快照当成最终成绩。

## 项目与目标

本地 Git 项目：E:\CHATGPT\projects\oh-mumujinjin
GitHub：https://github.com/ndshuge/oh-mumujinjin
公开游戏：https://ndshuge.github.io/oh-mumujinjin/

核心目标：用搜索、PUCT、神经网络和混合 AI 的进化斗兽场，实证提升地狱难度棋力。赛事只保留胜负、地图分类、耗时、淘汰与继承关系，不需要逐手棋谱。独立的训练数据采集有状态和动作样本，绝不能混同赛事结果或上传 Pages。**正式网页版地狱 AI 尚未替换**；本地提交不等于远端已更新。

## 必读文件与程序

- docs/G4_EVOLUTION_AND_CHALLENGES.md：G4 总体路线、晋级门槛。
- docs/G4_RESULTS_SNAPSHOT.md：旧快照，不能代替实时 JSON。
- docs/G4_HALL_AND_64.md：历史冠军库、64 AI、守擂。
- docs/G3_EVOLUTION_RESULTS.md、docs/AI_EVOLUTION_LEAGUE.md：32 AI 两代历史。
- training/league/agent.cjs：搜索 / PUCT / 神经网络 / 混合 AI 决策统一接口。
- training/league/population-strange.json：Odd-Hawks 等奇怪变异候选。
- training/g4/population-g0-64.json：64 AI，搜索/规则 PUCT/神经/混合各16人。
- training/g4/run64.cjs、matchday64.cjs、select64.cjs、verify64.cjs、status64.cjs。
- training/g4/hall-of-fame.json、hall-fingerprints.json、hall-verify.cjs：候选与 SHA-256 指纹。
- training/g4/generate-novel-maps.cjs、challenge-newmaps.cjs、novel-live.cjs：500 张新封存地图正式候选考试。
- training/g4/fresh-map-bank.cjs、challenge-fresh.cjs、fresh-results.cjs：另一条 120 张全新地图的辅助复测。
- training/output/lab/g4/：G4 对局结果及进度；原始数据不进 GitHub Pages。
- training/lab-batch.cjs、lab-selfplay.cjs、lab-audit.cjs、lab-replay.cjs：V1.1 自对弈训练数据。

## 已完成的可信结果

1. G3 32 人首代 96 局：G0-H02 混合 AI 6 胜 0 负；生存16、淘汰16、出生16。
2. G3 下一代 96 局：G1-SV15、G1-SV02 各 5 胜 1 负，多名新生混合 AI 4 胜 2 负。两代合计192局，为探索性初筛。
3. 四名变异 AI 对冻结 V1.1 的扩展测试：每人50张旧保留地图换手、100局、350ms/步软预算、非法落子0，共400局：
   - Odd-Hawks：79胜21负，得分率79%，成对地图 Bootstrap 95% [72%,86%]，实际单步p95约416ms。
   - Odd-Dreamer：75胜25负，75%，区间[66%,83%]，p95约400ms。
   - Odd-Tortoise：65胜35负，65%，区间[57%,73%]，p95约401ms。
   - Odd-Tunnel：53胜47负，53%，区间[44%,62%]，p95约374ms。
   - 报告：training/output/lab/g4/V11_CHALLENGE_100_RESULTS.json/.md。
   - 这些 heldOut 地图在历史研究中被反复使用，不是最后封闭盲测。不可据此上线，且软时间预算可能被超过。
4. 历史冠军库有6位候选策略、基因 SHA-256、搜索器/网络权重文件指纹。执行 node training/g4/hall-verify.cjs 曾返回 okay:true；候选均未正式晋级。

## 接管时正在执行的实验（10:30 快照）

### A. 64 AI 第一代 384 局联赛

- 64名：搜索、纯PUCT、神经PUCT、混合AI各16。
- 6张稀疏/中密/密集分层地图，每张64局；每AI总12局，换手公平。
- 计划完成后各家族保留8、淘汰8、产8后代 → 总计32生存、32淘汰、32新生。
- 10:30 结果：267/384；完成轮次4/6，state=running。
- 进度路径：training/output/lab/g4/g4-run-0-6r-b260-s20261014.progress.json
- 进程已查到：run64.cjs 与 matchday64.cjs 同时存在。
- 查看：node training/g4/status64.cjs population-g0-64.json 6 260 20261014
- 审计：node training/g4/verify64.cjs population-g0-64.json 6 260 20261014
- **禁止重复启动相同写入任务**。若停止，先核查已有轮次 report、JSONL 与程序本身续跑逻辑。

### B. Odd-Hawks 500张封存新图 × 换手1000局（重点）

- 地图：training/output/lab/g4/novel-sealed-20261030-500.jsonl
- manifest：novel-sealed-20261030-500.manifest.json，地图哈希与冻结基因指纹锁定。
- 运行命令：
  node training/g4/challenge-newmaps.cjs population-strange.json odd-hawks novel-sealed-20261030-500.jsonl 350
- 进度：training/output/lab/g4/exam-odd-hawks-novel-sealed-20261030-500-b350.progress.json
- 10:30：110/1000，85胜25负，非法0；进程确实存在。中间结果不能当最终胜率。
- 单局结果持续写入 .results.jsonl；完成后生成 .report.json。程序有原始结果一致性检查、可安全续跑，但**只有确认旧进程已结束后**才能恢复。
- 就算完成1000局且显著高于50%，仍需确认地图真正独立、零非法、性能、Web Worker / iOS / Android / 回退，才能考虑晋级。

### C. Odd-Hawks / Odd-Dreamer 的辅助新图各120局

- 另一套 fresh-map-bank-20261015-120.json：120张唯一地图，稀疏/中等/密集各40，与8947张旧布局交集0，有 lock SHA-256。
- 两个候选各跑60张图×换手 = 120局，600ms/步；两份进程在10:30仍存在。
- 输入命令：
  node training/g4/challenge-fresh.cjs population-strange.json odd-hawks 1 60 600 fresh-map-bank-20261015-120.json
  node training/g4/challenge-fresh.cjs population-strange.json odd-dreamer 1 60 600 fresh-map-bank-20261015-120.json
- 结果：training/output/lab/g4/FRESH_CHALLENGE_RESULTS.json/.md；10:30还没完成，程序 fresh-finalize-wait.cjs 在等待自动汇总。
- 注意和上面的封存1000局是两套试验，同时跑可能争夺CPU。优先封存考试。

### D. V1.1 自对弈数据采集存在中断风险

- 训练 9000局进度：batch-train-3000-9000-w5-b90-s20261018，5700/9000，392270个合法动作、142731条样本、非法0（**进度快照**）。
- 验证 1000局：batch-heldOut-0-1000-w2-b90-s20261019，已完成1000/1000，非法0。
- **重要：10:30 Windows 进程扫描未发现 lab-batch.cjs 或 lab-selfplay.cjs 进程，但训练 progress 仍写 running。非常可能已中断或状态过期。**
- 续跑前核实 training/lab-batch.cjs 的分片恢复与已有输出，避免覆盖或重复样本；不要向用户声称它仍在训练。
- V1.1 自对弈样本不会令神经网络权重自动变强；必须另做模型训练和对战验收。

## Git 与工程边界

交接时近期 HEAD 025c729（之后可能变化）。曾存在未提交修改：game.js、strong-search.js、terminal-regression.cjs、training/lab-batch.cjs、training/strong-arena.cjs、docs/S0_S3_ACCEPTANCE.md、docs/HELL_AI_SEVEN_DAY_PLAN.md及部分 arena 脚本。先看 git status / diff，**禁止 git reset --hard、git clean -fd、覆盖正在运行的文件、强推远端或一股脑提交所有改动**。

当前正式网页仍使用旧地狱 AI。不要把进化研究模型未经批准地替换 game.js。

## 工具、权限与安全

优先使用实际可连接的 Mice Hole / Hanako Bridge 直达本机。HanaAgent CLI 配过 DeepSeek V4.1 Flash（Coding Plan），曾成功作只读算法评审；当下连接状态需实测。不要读或展示任何 API Key、环境密钥、私人档案，不把机密写入日志。DS 用于审查与分析，不代替 game.js 判断合法与胜负。

用户明确要求长期持续施工，不接受只有计划书就退出。遵循马斯克五步法，但要保留工程可靠性、明确验收、续跑安全与数据诚实。

## 新对话第一轮应执行

在 E:\CHATGPT\projects\oh-mumujinjin：

1. Get-Date -Format o；git status --short；git log -5 --oneline。
2. 查 node.exe 进程命令行：challenge-newmaps / challenge-fresh / run64 / matchday64 / lab-batch / lab-selfplay。
3. 读取上述 G4 进度 JSON、100局 V1.1 结果 JSON、training 自对弈进度。
4. 跑 node training/g4/verify64.cjs population-g0-64.json 6 260 20261014 和 node training/g4/hall-verify.cjs。
5. 等待现有实验完成或安全恢复，不另开相同数据写入进程；先生成实战排行榜、地图分层分析、置信区间。
6. 继续训练强者与新一代神经网络时，要真写权重、真做留出集与同预算对战，不能凭模拟结果编造 Elo 或胜率。
7. 只在正式千局新地图+手机 Web Worker 等验收通过后，才建议晋级地狱 AI。

汇报面向用户：当前进化第几代、已赛局数、前五名胜-负-和、淘汰和出生、与冻结 V1.1 比赛成绩/区间、非法数与实际耗时、下一阶段具体断点。
