# Supabase 线路故障恢复提示 — 设计

## 目标
为木木金金棋 Supabase 好友房间的真实不可达故障提供准确诊断、可执行的恢复提示和回归测试；保留现有游戏协议与 Cloudflare 线路。

## 已核验背景
- 2026-11-07：木木金金棋 `supabase-config.js` 与鼠哥学院 `ndshuge/ndshuge-academy/design/python3-build/cloud.js` 使用相同项目 `yycokuphczoxfntcwizi.supabase.co`。
- 多家 DNS 返回该子域 NXDOMAIN；无法仅凭浏览器的 `Load failed` 区分项目暂停、删除、URL 配错还是网络解析异常。
- 现有代码在创建/加入失败时直接展示英文 Realtime 原始异常，诊断则倾向认为是用户当前网络问题。
- Supabase 账户未连接，不能安全执行项目恢复、重建、换密钥或迁移学院数据。

## 方案权衡
1. **恢复原 Supabase 项目（首选恢复服务）**：在 Supabase Dashboard 核验 Active/Paused、项目 URL、Realtime 状态；需账户权限，现在阻断。
2. **另建项目并迁移**：风险涉及学院登录/数据，禁止未经核验擅自替换。
3. **当前可落地：客户端恢复提示**：提供中文错误分类；双链路失败时提示检查项目状态/URL，而非只归因手机网络；保留原始响应可追踪性。此项可独立测试、等待账户恢复后自动复用原线路。

## 界限与验收
- 不写入 secret/service-role，不改变现有 URL 或数据库；不动 Cloudflare 和游戏规则。
- Supabase 真实服务恢复必须由 Supabase 项目控制台状态和两台无 VPN 设备完成创建→加入→准备→走棋验证，单元测试不能代替。
- 项目不可达时不能伪造房间或提示“已上线”。
- 新的错误翻译应覆盖 Realtime unreachable、HTTP 401/403、房主离线与未知业务异常。
- 新文件优先最少：扩展现有 `supabase-network-check.mjs` 的纯函数，在 `friends-hub.js` 的 Supabase 错误路径使用；相应添加 Node 测试。
