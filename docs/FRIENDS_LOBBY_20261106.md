# 木木金金棋｜统一大厅、地图收藏与好友联机

## 当前实现范围

前端采用知序 AI 学院 V5 的轻量设计系统：浅色分组背景、白色卡片、紧凑分段选择器、清晰的中文标签、iPhone 底部安全区与深色模式适配。保留原木木金金棋的棋盘和原生 AI 引擎，不直接替换游戏的规则和模型。

首次进入先显示大厅。支持：
- 挑战小克（默认）、本地双人、好友联机、地图中心。
- 经典/进阶两种模式；公平随机地图、随机障碍、官方预设、用户收藏地图。
- 收藏当前地图：命名、地图卡片缩略图、点卡片看详情、重命名、删除、JSON 导出、复用编辑器。
- 首页关闭时无需再先猜拳；进入小克游戏时继续使用现有猜拳规则。
- 返回大厅与已有对局恢复；联机游戏离开前二次确认。

好友房间支持 6 位房间码、链接分享、模式选择、房主选边、房主/好友/随机先手、房主可选地图、两人准备后开始。服务端保存唯一权威棋盘，校验出生点、走棋、筑墙、传送门、回合、重复局面和版本号。WebSocket 支持短暂断线后带身份令牌自动重连，并从服务器重新同步。

**当前状态：前端与服务端代码已开发、在本机通过测试，但公网实时房间尚未启用。** Cloudflare 尚无本机授权，未做真实互联网双机验收。网页中的“创建房间”在服务未配置时会明确提示，而不会生成假房间。

## 本地验证

在仓库根目录执行：

```powershell
node --test .\map-collection.test.cjs .\friend-rooms.test.cjs .\friend-reconnect.test.cjs .\online-rules.test.mjs .\online\worker.test.mjs
node .\browser-smoke.mjs
node .\rps-regression.cjs
node .\map-v2-regression.cjs
node .\map-v2-online-rps-regression.cjs
node .\map-v2-persistence-regression.cjs
node .\workshop-regression.cjs
```

浏览器测试使用 Windows Chrome 与本地静态文件服务，需先在仓库根目录执行 `python -m http.server 8899 --bind 127.0.0.1`。

## 公网联机部署

Cloudflare 的 Durable Objects 和 Workers 支持 SQLite 持久化对象及 WebSocket Hibernation。当前配置使用 `new_sqlite_classes`、Wrangler 的 Durable Object binding。部署账号应由项目所有者自行登录或授权，**不要把 API Token 写进 GitHub 或对话中**。

1. 在项目目录打开 PowerShell，进入 `online`。
2. 安装 Wrangler（例如 `npm install -g wrangler`），再执行 `wrangler login`（需要登录 Cloudflare）。
3. 执行 `wrangler deploy`，记录生成的 `https://<worker>.<account>.workers.dev` 地址。
4. 修改仓库根目录 `online-config.js`：`window.MMJJ_ROOM_SERVER_URL = "https://...workers.dev";`。
5. 将经过验收的静态资源发布至原 GitHub Pages 项目，并通过不同设备的真实网络进行房主和好友两边验证：创建、加入、准备、开局、选出生点、走棋、筑墙、传送、刷新恢复、退出。
6. 每次部署后分别检查 Chrome、iPhone Safari 与弱网场景。不得在完成双机验证之前标记为“公网联机已完成”。

### 数据与安全边界

- 无登录：会话身份保存在浏览器的 `sessionStorage`，共享链接只包含房间编号；有效身份令牌不会放在分享链接中。
- 房间最长保存 12 小时；两个席位，不接受第三名玩家冒名顶替。
- 服务端校验落子，客户端只渲染确认后的权威状态。
- 地图收藏存储在当前浏览器 `localStorage`；不会跨浏览器或设备自动同步。可导出 JSON。
- 自定义地图必须通过当前游戏的合法性和竞技公平性检测才能开始标准好友对战。
- 生产端点允许的 Origin 当前为 `https://ndshuge.github.io`；换域名需要更新 `online/wrangler.toml` 的 `ALLOWED_ORIGINS`。
- 当前版本不含观战、账号、云端地图同步及赛后录像；这些均属于后续功能。

## 关键文件

| 组件 | 位置 |
|---|---|
| 首屏大厅 | `home-lobby.js`, `home-lobby.css` |
| 知序 V5 视觉适配 | `zhixu-v5-bridge.css` |
| 好友房间与地图 UI | `friends-hub.js`, `friends-hub.css` |
| 地图本地持久化 | `map-collection.js` |
| 房间客户端 | `friend-rooms.js`, `online-config.js` |
| 服务端规则 | `online-rules.mjs` |
| Worker 及配置 | `online/worker.mjs`, `online/wrangler.toml` |
| 集成点 | `game.js`, `index.html` |
| 无依赖浏览器测试 | `browser-smoke.mjs` |
