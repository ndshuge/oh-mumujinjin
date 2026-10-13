
## 可复用架构与新增对照实验（2026-10-13）

### 上游参考

- AlphaZero General: https://github.com/suragnair/alpha-zero-general — 采用 Game / MCTS / Coach / Arena 分层，需重写本棋规则适配层，不直接拿围棋网络权重。
- Quoridor AlphaZero: https://github.com/andreiconst/quoridor-ai — 借鉴固定动作索引、合法性掩码、筑墙状态平面、PUCT、self-play / arena。
- Stockfish NNUE: https://official-stockfish.github.io/docs/nnue-pytorch-wiki/docs/nnue.html — 棋局评估网络可以相对轻量；原版模型权重不适用于本游戏。

### 已接入的部件

- `training/arena.cjs`：同一自定义障碍地图下，搜索 AI 与贪心 AI 双方交换金/木位置各下一局；统计胜负、结束原因、用时。
- `training/train.cjs`：导出可复用的规则/评估/选择函数；原自对弈命令仍能运行。
- `training/replay.cjs`：校验生成棋谱全部走法和终局结果。
- 首轮 4 对、8 局：搜索 AI 5 胜 3 负，贪心 AI 3 胜 5 负，0 和；全部抵达终点。此样本太小，不代表达到统计显著棋力优势。
- 延伸 2 局训练及 158 步棋谱回放测试通过。

### 下一验收门槛

1. 至少 100 对（200 局）并交换执方，跨训练未见地图；记录 P50/P95 思考耗时。
2. 加入三重重复和有效终局的前端统一判定；训练器不得单独发明另一套获胜规则。
3. 独立抽取局面特征与固定动作索引，适配 Quoridor 式策略/价值网络。
4. 对比搜索基线后才训练模型；新版本必须过竞技场晋级测试。
5. 浏览器采用 Web Worker 运行高成本搜索，保证手机端无卡顿。

**当前是搜索和数据管线迭代，没有得到受训神经网络权重，也没有发布新的浏览器棋力引擎。**
