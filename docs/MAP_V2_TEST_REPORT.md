# Map V2 本地质量验收（2026-11-05）

## 已执行项目与结果

| 证据 | 命令 | 结果 |
|---|---|---|
| 六组原版回归 | `node smoke.cjs`、`node workshop-regression.cjs`、`node portal-regression.cjs`、`node ice-regression.cjs`、`node ai-regression.cjs`、`node terminal-regression.cjs` | 全部 PASS |
| V1/V2 数据、完整地形、指纹、编辑流程 | `node map-v2-regression.cjs` | PASS：包括两种地图模式独立、传送配对、Pointer 拖动、撤销重做、非法草稿拒绝 |
| V1 分享和 V2 存档绑定 | `node map-v2-persistence-regression.cjs` | PASS：旧链接、SHA 检查、地图冲突拒绝恢复 |
| AI 输入接口 | `node map-v2-ai-contract.cjs` | PASS：两种不同地图的四类地形与 SHA 同步传到 AI 接口，未运行/修改策略 |
| 复杂特殊地形附近的筑墙 | `node map-v2-wall-regression.cjs` | PASS：30 张随机地图 × 双模式，3060 次判定（3000 合法、60 次重复墙拒绝）；60 次实际放墙 |
| 简单测试代理真实调用游戏动作 | `node map-v2-playtest.cjs` | PASS：60 局、1131 手、60 局完成，156 次传送、26 次加速、14 次冰面进入，0 卡死/超时 |
| 数据集多参数生成/去重 | `node map-v2-dataset-profiles-regression.cjs` | PASS：5 组不同地形密度、35 张去重地图、训练/验证/封存拆分 |
| 同种子与 SHA 对照 | `node map-v2-dataset.cjs` | 检查 Node 原生 crypto SHA-256 与 V2 指纹一致；失败会立刻抛出，不会静默跳过 |
| 浏览器静态渲染 | Edge headless 本地 HTTP 截图与 DOM | 页面和移动工坊均能渲染；证据在 `docs/map-v2-previews/` |

> 1000 张最终混合参数生成结果以 `datasets/map-v2-20261105/manifest.json` 为准（必须配合控制台 PASS）。老版单一参数集已弃用。

## UI 工坊专项复核（独立分支 feature/map-v2-ui-20261105）

- 桌面浏览器 1366×900 视口：工坊工具区与完整棋盘并排，页面仍维持原游戏视觉语言。截图 `docs/map-v2-previews/workshop-desktop-review.png`。
- 移动浏览器 390×844 视口：紧凑工具区、完整九列十三行棋盘及底部操作栏在同一画面内；修复初版工坊的棋盘横向裁切。截图 `docs/map-v2-previews/workshop-mobile-compact-review.png`。
- 使用 `map-v2-regression.cjs` 验证快捷工具事件、实际 Pointer 绘制与撤销重做；另验证传送门 ID 不重复和墙参数拒绝规则。
- 在此独立分支重新执行全部 12 组回归：PASS。原正式版和其他训练工作树均未修改。
- 当前屏幕证据来自 Edge 的移动视口模拟，**不等同 iPhone Safari / iPad 真机实测**。

## 均衡生成器 / AI 兼容（独立分支）

- `node map-v2-fairness-regression.cjs`：180°旋转地形与传送配对镜像、经典/进阶路径、同种子与旧版复现；PASS。
- `node map-v2-fair-stress.cjs 1000`：1000张完全去重、全部规则合法、两玩法距离差0；PASS。结果 `docs/MAP_V2_FAIR_STRESS_RESULT.json`。
- `node map-v2-fair-wall-regression.cjs`：均衡地图上3060候选、60次实际筑墙；PASS。
- `node map-v2-ai-integration-smoke.cjs`：五类公开可用推理接口共40动作、0非法；PASS；若缺冻结G5权重显式跳过其8个样本。
- `node map-v2-ai-arena.cjs 3 76`：24局1447手，全部行动合法、0卡死、0超时。
- `node map-v2-g5-compat-arena.cjs 1 76`：冻结 G5 权重推理适配4局227手，0非法，1局策略重复平局。
- `node map-v2-fair-dataset-regression.cjs`：训练/验证/封存15张互不重复、r2种子复现通过；历史数据脚本默认r1保持不变，`--balanced` 启用r2。
- 同策略无筑墙120局金120胜，提示先手优势；**不宣称地图生成可保证50%胜率**。

## 边界与未验收

- **真机 Safari、iPad 触摸/性能**：目前仅有浏览器视口截图与真实 `PointerEvent` 监听器自动模拟，尚未在物理设备验收。
- **地图趣味和竞技公平**：没有真实人类样本，路径指标和简单代理比赛不能证明对局平衡；复杂地形仅做规则合法性和简单使用率判断。
- **其他 AI 研究组**：G5/B/C/GPT 未做策略训练或强度验证；已有浏览器神经输入对传送配对的信息缺口列在 `MAP_V2_AI_COMPATIBILITY.md`。
- **线上状态**：没有合并、推送或发布 GitHub Pages。本次仅提供隔离本地版本。
