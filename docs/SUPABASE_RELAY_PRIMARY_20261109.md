# Supabase 中转默认线路发布记录（2026-11-09）

## 授权及目标

用户在 iPhone 5G 上打开 `relay-test.html`，实测两条 Supabase Realtime WebSocket 均订阅成功并完成实时广播，耗时 2950 毫秒，要求将这条中转设置为木木金金棋的默认联机线路。**只有一部真实手机通过；另一部真实手机与双机全流程尚未验收。**

## 设计

- 保留 `MMJJ_SB_CONFIG.url` 为原项目 `https://yycokuphczoxfntcwizi.supabase.co`，保留原匿名公钥与 Supabase Realtime 项目，零数据库迁移。
- 显式设置 `MMJJ_SB_CONFIG.preferRelay=true`，以 `MMJJ_SB_CONFIG.relayUrl`（`https://mmjj-supabase-relay-canary.pages.dev`）为默认传输入口。
- `supabase-room-transport.mjs` 在建房、加房和刷新恢复时先连接中转；中转失败再连接原项目 URL。两条线路使用相同房间频道、项目与公钥。
- `MumuSupabaseRooms.checkConnection` 优先检测中转，仅中转失败时检测原地址，以免给手机用户展示和建房行为矛盾的结论。
- 国际 Cloudflare Durable Objects 仍为用户手动选择的另一种房间协议，未改变。
- 缓存版本同时更新 Supabase config、bridge、transport 与好友大厅。
- 由于中转连接偶尔比直连更慢，双浏览器 E2E 里连接后的等待上限从 12 秒调整至 45 秒；生产传输原有 30 秒保护上限不变。

## 验收

- TDD：新建 `supabase-relay-primary.test.mjs`，在修改实现前确认它失败；实现后 5/5 通过。
- Node 自动化：131/131 通过。
- 本地真实 Supabase 双浏览器端到端流程通过：创建、分享邀请、双方准备、起点、移动、刷新恢复、认输、再战、退出。
- 浏览器大厅/移动布局 smoke 通过。
- 仍需上线后核查：网页 HTML、config、bridge、transport 的资源版本，以及正式页面默认信息。
- 仍需实机：两部中国大陆手机无 VPN 创建、加入与同步棋局。单手机中转 WebSocket 成功不等于跨设备全部完成。

## 回滚

若中转严重故障，可在配置中将 `preferRelay` 调回 `false`，恢复原 Supabase 优先、中转备用；无需删除或修改数据库。应由发布负责人核验正式 Pages 生效与回滚版本。
