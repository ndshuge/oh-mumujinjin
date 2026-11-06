# 木木金金棋好友对战：上线说明

## 已实现
GitHub Pages 静态前端 + Cloudflare Workers SQLite Durable Objects。房间提供邀请码、双方准备、模式与地图配置、先后手、服务器合法走棋验证、重连和棋盘权威状态同步。地图存于浏览器本地。

## 本地验收
在仓库根目录运行 `python -m http.server 8899 --bind 127.0.0.1`；在 `online/` 运行 `npx wrangler@4.158.0 dev --ip 127.0.0.1 --port 8787 --local`。
测试命令：
```
node online/realtime-e2e.mjs
node online/browser-live-e2e.mjs
node browser-smoke.mjs
node --test map-collection.test.cjs friend-rooms.test.cjs friend-reconnect.test.cjs online-rules.test.mjs online/worker.test.mjs
```

## 正式部署的授权步骤
此电脑当前未登录 Cloudflare，仓库也没有 Worker 部署密钥。账户所有者需在本机 PowerShell 执行 `npx wrangler@4.158.0 login` 并在浏览器授权。随后在 `online/` 目录执行 `npx wrangler@4.158.0 deploy`，取 Wrangler 输出的实际 HTTPS workers.dev 地址，填写到根目录 `online-config.js` 中的 `window.MMJJ_ROOM_SERVER_URL`。

再从两台设备测试邀请、准备、走棋、重连和退出；确认通过后才能把前端合并到 GitHub Pages 的正式 `main` 分支。**未授权前不得宣称正式跨设备联机已上线。**

注意：不要将 Cloudflare Token 写进代码或提交到 GitHub。开发存储 `online/.wrangler/` 必须忽略。房间为 12 小时有效的临时对局，不保存长期排行榜。
