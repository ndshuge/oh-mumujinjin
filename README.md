# 哦，木木金金棋

源自手绘地图的双人路线争夺策略棋，可直接在 GitHub Pages 上游玩。

**在线游戏**：https://ndshuge.github.io/oh-mumujinjin/

## 已实现

- 本地双人（默认）和单机人机对战（玩家金方，电脑木方）
- 三档本地规则 AI：入门、策略、挑战
- 9×13 棋盘、5 堵墙、传送门、胜负判定与悔棋
- 手机单屏棋盘＋固定底部操作条
- 进阶跑道（测试版）：冰面方向惯性与加速带
- 筑墙合法性考虑传送门以及冰面滑行方向

**切换玩法**：游戏右侧「GAME MODE / OPPONENT」，手机点击右上角齿轮。切换对手与难度会重新开始对局。

## 技术

纯 HTML / CSS / JavaScript，不需要账号、后端、游戏服务器或云端 AI API。打开网页后，规则计算在浏览器本地进行。

## 本地测试

在项目目录执行：

```bash
node smoke.cjs
node portal-regression.cjs
node ice-regression.cjs
node ai-regression.cjs
```

## 下一阶段

[开发计划和验收标准](docs/ROADMAP.md)

其中地图工坊仍在规划阶段：首先开放 **障碍物布置编辑器**，再逐步实现可分享地图。当前并未上线完整地图编辑器。