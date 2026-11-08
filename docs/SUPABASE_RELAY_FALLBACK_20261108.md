# 2026-11-08 Supabase Realtime 中转候选与失败自动恢复

## 背景与可验证事实

- 现有正式项目仍是 \`yycokuphczoxfntcwizi.supabase.co\`，无需重建数据库、修改学院数据或更换公开匿名 key。
- 原先两台手机使用 5G：Supabase HTTPS 和 WebSocket 失败，另一个 \`workers.dev\` 好友线路也未通过健康检查。电脑端项目 API 正常，官方 Supabase 状态页显示相关组件运行正常，因此没有证据宣布 Supabase 全站停机。
- Cloudflare Pages 新测试域名 \`https://mmjj-supabase-relay-canary.pages.dev\` 的 \`/health\` 返回 HTTP 200；\`/probe/upstream\` 返回 \`upstreamReachable:true\`，HTTP 401 是未携带 API key 的预期上游回应。
- 在 Windows 上使用该 Pages 域名，两条独立 Supabase Realtime WebSocket 曾成功完成广播。之后还观察到：一次 SDK 订阅约 10 秒时报告 \`TIMED_OUT\`，但约 11 秒才收到 \`SUBSCRIBED\`。最初短超时的中转测试偶发失败，不应因此直接判定上游死机。
- 延长 **仅中转** 的订阅等待到 30 秒，并允许 SDK 在中转短暂超时后继续订阅。一端走原 Supabase、另一端走 Pages 中转的实时消息往返测试随后成功。
- 这些都来自电脑测试网络，不能代替中国大陆真实双手机网络验收，也不保证 \`pages.dev\` 在移动运营商上能打开。

## 上线行为

- 游戏默认仍是现有 Supabase 原地址。房间创建/加入会先直连原地址，只有订阅失败才尝试新中转；双方最终仍连接同一个 Supabase Realtime 项目和同一个房间频道。
- 国际 Cloudflare Durable Objects 好友线路未修改，仍保留手动备用选项。
- 不改变 Supabase 项目设置、Postgres 表、授权、公开 anon key、房间协议、棋盘 UI、房间码。
- 新增独立手机 WebSocket 实测页 \`/oh-mumujinjin/relay-test.html\`；两条连接通过 Pages 中转发出和收到消息后才标记此设备成功。
- \`relay/worker.mjs\` 仅允许 \`/auth/v1/health\` 与 \`/realtime/v1/websocket\`；不是通用代理。无需服务端私钥，开发者不应在浏览器放入 service_role。
- Cloudflare Pages 和 Supabase 可能有免费额度与限制；测试中转前应监控异常流量，不能认定无限免费。

## 验收/剩余任务

1. Node 全套非训练测试通过，包括原默认线路优先、原线路失败时自动切换、两条线路都不可用时不伪造成功、SDK \`TIMED_OUT\` 后的迟到 \`SUBSCRIBED\`。
2. 本地 Chrome 双浏览器 E2E 原 Supabase 线路通过：建房、邀请、准备、出生点、真实走棋、刷新恢复、认输、再战。
3. 需使用正式 GitHub Pages 上的 \`relay-test.html\` 验证网页原点是 \`https://ndshuge.github.io\` 时，确实能使用中转收发。
4. 用户与朋友分别在两台中国大陆手机关闭 VPN，用 5G 打开 \`relay-test.html\` 测试；然后在正式游戏通过创建/加入/准备/落子测试。
5. 如果手机仍打不开 \`pages.dev\`，这条中转也不能解决实际网络限制：必须改用已验证的大陆可达域名或合规部署的国内服务器。**不要把 GH Actions 部署成功当成手机无 VPN 验收通过。**

## 回滚

游戏只需移除公开配置的 \`relayUrl\` 并恢复上一版前端；Supabase 项目数据不受影响。Pages 中转是独立项目，不修改原 \`mmjj-friends\` Durable Objects Worker。
