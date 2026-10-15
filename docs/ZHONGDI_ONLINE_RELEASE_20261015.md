# 中迪上线与强基线交付（2026-10-15）

## 目标与实现
- 线上保留原有“小白”和“小迪”，新增“中迪”第三个高等级AI。
- 默认打开进入人机对战，选中中迪；用户手工选定其他档位时保持选择并保存。
- 中迪沿用小迪的`xiaodi-faces-v9.webp`、表情轮播、对话池及其相关 CSS；角色名与棋局左上角标签根据AI档位显示“小迪”或“中迪”，不会共用错误的名字。
- 中迪运行来自G5 `phase-defense` 的真实算法，而非给G4更换显示标签；浏览器端独立的`zhongdi-engine.js`已包含冻结搜索、PUCT、策略、N64权重，运行不需服务端。
- 冻结子目录 `training/zhongdi-freeze/` 提供可重复生成浏览器包的历史确定性算法版本，**不能使用线上最新的已删去确定性搜索模式的 G4 代码随意替换**。
- `training/zhongdi-baseline.json` 注册“实验强基线”。10张开放开发地图，对 G4-h13/h05/h09分别为16胜4负；不代表未见地图正式冠军认证。

## 验证
- `node training/build-zhongdi-browser-20261015.cjs`
- `node training/zhongdi-browser-regression-20261015.cjs`：网页决策与冻结训练策略12/12相同。
- `node training/zhongdi-ui-regression-20261015.cjs`：默认 CPU/中迪、实际电脑行动、切换小迪/中迪、本地双人隐藏身份。
- `node ai-regression.cjs`、`node portal-regression.cjs`、`node ice-regression.cjs`、`node terminal-regression.cjs`，以及既有小迪回归。
- 实际本地浏览器：默认显示“中迪 · AI 对手”，点击小迪后变为“小迪 · AI 对手”；切回中迪后名称再次更新，两种档位共享原版图片和角色类名。

## 安全发布
在单独 worktree `E:\CHATGPT\projects\oh-mumujinjin-publish-current` 从当时线上最新 `origin/main` 开始，只提交中迪相关文件，未纳入本机其他 Agent 的未提交大量UI/训练改动。未来调整原版小迪不应影响本次冻结的中迪。
