# 木木金金棋 Map V2 本地验收手册

工作树：`E:\CHATGPT\_tmp\oh-mumujinjin-map-v2-20261105`；分支：`feature/map-system-v2`。

## 本地打开（未发布）

在 Windows PowerShell 中进入工作树，运行 `node preview-map-v2.cjs`，再在 **同一台 Windows 电脑** 的浏览器访问 `http://127.0.0.1:49153/`。如果已由 Mice Hole 启动预览，直接打开即可；不占用正式线上域名。停止时只结束此预览进程，不能按名称批量结束所有 Node。

## 工坊使用

电脑点击右侧「地图工坊」；手机点击顶部「图」或设置面板里的地图工坊。选择工具后，单击或拖动棋盘，默认营地不能覆盖。传送门工具点一次放 A，第二次点 B；未完成时不能保存/试玩。选择工具点选元素并拖动到空白格移动。橡皮擦可以删除整对传送门；冰面和加速可连续绘制，`Ctrl/Cmd+Z` 撤销、`Shift+Ctrl/Cmd+Z` 重做；右侧工具按钮可直接操作。

地图与玩法 **独立**：地图布局有「经典地图 / 随机障碍 / 全随机战场 / 自定义」四种选择；玩法有「经典 / 进阶」。切换布局可能放弃当前对局，按提示确认。自定义草稿需通过两种玩法的出生路径规则检查才能试玩、保存、分享。

导出完整 JSON、导入 JSON 或旧 `#map=` 链接、生成 V2 链接、保存在浏览器、选择/重命名/删除地图。V1 旧分享使用原固定传送门、冰面和加速地形；原 V1 localStorage 留存（迁移为只读合并读取）。存档绑定地图快照和 SHA-256，加载指纹不符会丢弃旧局面而不混合地图。

## 地图 API 与批量数据集

`window.MumuMapV2.get()`、`normalize(data)`、`validate(data)`、`fingerprint(data)`、`metrics(data)`、`generate(seed, opts)`、`generateRandomRocks(seed)`、`reproduce(map)`。

`generate` 可接受 `{rocks,portals,ice,boost,iceContinuity,maxFairnessGap,attempts,timeLimitMs}`，受上限保护。记录的地图 `generation.parameters` + `seed` + `generatorVersion` 用于复现；完整地图 SHA-256 忽略名称，但包含传送配对、所有地形、尺寸、规则版本。

运行 `node map-v2-dataset.cjs --train 700 --validation 150 --holdout 150 --seed 20261105 --out datasets/map-v2-20261105`，按 5 组不同障碍/传送门/冰面/加速参数交替生成，输出三个互不重叠的 JSONL 地图集和 manifest；仅做地图划分，不自动训练 AI。相同指纹去重。建议将封存测试地图集单独保管，避免未来训练管线误读。

## 本地测试

`node smoke.cjs`、`node workshop-regression.cjs`、`node portal-regression.cjs`、`node ice-regression.cjs`、`node ai-regression.cjs`、`node terminal-regression.cjs`。

新增 `node map-v2-regression.cjs`、`node map-v2-persistence-regression.cjs`、`node map-v2-wall-regression.cjs`、`node map-v2-playtest.cjs`、`node map-v2-ai-contract.cjs`、`node map-v2-dataset-profiles-regression.cjs`。

## 尚未证明

- 没有直接在真实 iPhone Safari、iPad 上进行实体触摸验收，桌面 Edge headless 的手机视口截图无法替代真机。
- 简单测试代理的对局全部胜出不证明地图竞技公平；路径差值、可用加速格和传送捷径只是可解释的代理指标。
- G5/B/C/GPT 的**随机地图棋力与神经编码兼容性未验收**，详见根目录 `MAP_V2_AI_COMPATIBILITY.md`。
- 未推送、未合并、未发布正式站点。
