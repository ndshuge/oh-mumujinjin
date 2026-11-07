# Supabase Realtime 好友联机试用 — 交付说明

## 2026-11-07：服务不可达，尚未完成公网恢复

- 根目录 `supabase-config.js` 里的 `yycokuphczoxfntcwizi.supabase.co` 与鼠哥学院 `ndshuge/ndshuge-academy/design/python3-build/cloud.js` 的项目 URL 一致。
- 在当前 Windows 连接环境里，普通 DNS、阿里云和 DNSPod 公共 DNS 均返回该项目子域 NXDOMAIN；Supabase HTTPS / Realtime 两条线路不可用。这无法从浏览器错误直接区分**项目暂停、删除、地址失效或 DNS 异常**，不应把全部责任归到用户网络。
- 请先在 Supabase 控制台确认原项目还存在且为 Active；如果是 Paused，按控制台提示恢复；如地址已变动，核实项目 URL 和公开 anon/publishable Key，**不要**将 service_role / 数据库密码提交到公开仓库。
- 恢复后使用「检测联机网络」验证 HTTPS 与 WebSocket，随后实际用两台关闭 VPN 的设备完成创建、加入、准备、开局和走棋。**恢复 DNS 或本地测试通过都不等于国内公网联机验收通过。**
- 这一轮只改善了创建/加入失败的中文指引与诊断提示；没有更换项目、迁移数据、修改数据库，也没有宣称 Supabase 已恢复。



## 目标与隔离
- 复用「鼠哥学院」已在用的 Supabase 项目，只读取其**公开**项目 URL 和 anon/publishable Key。
- **不调用**学院的登录 API、不读取任何学业记录、不创建/更改数据库表，不增加 CloudBase。
- 木木金金棋使用独立 `mmjj:friend:<6位房间码>` Realtime Broadcast 主题。
- 现有 Cloudflare 国内可能无法直连，但仍保留为默认稳定国际线路。
- Supabase 新线路标为 **国内试用（测试中）**，没有真机实测之前不能称为上线稳定国内版。

## 玩家试用（不需要安装、不需要账号）
1. 手机关闭 VPN，打开 https://ndshuge.github.io/oh-mumujinjin/ 。
2. 进入「好友联机」，在「联机线路」中选「国内试用 · 学院 Supabase（测试中）」。
3. **先点击「检测联机网络」**：收到连接成功，再创建房间。
4. 创建房间后复制邀请链接发给朋友；链接包含 `?room=ABC123&net=sb`，对方自动选中相同线路。
5. 双方「点击准备」，房主点击「开始对局」，验证出生点、走棋、筑墙、传送门、认输、双方同意再战。
6. 再关闭 VPN 重试 iPhone Safari + Android 浏览器、移动数据及 Wi-Fi。
7. 若显示 Realtime 连接超时/传输失败，**不要反复新建房间**；说明当前网络或项目实时通道不可用。可以手动切回 Cloudflare（国际）线路。

## 验收现状（2026-11-07）
- ✅ Supabase 消息适配模拟两位玩家的房间加入/准备/开始/走棋/认输/再战。
- ✅ 现有自动化 50 项、游戏大厅浏览器烟测通过。
- ✅ 复用学园公共 key，不触及学园数据库。
- ❌ Windows 当前网络：连接 Realtime WebSocket 显示 `channel error: transport failure`，不通过；经代理也未能在该机通过。
- ⏳ 尚无两台中国大陆手机不开 VPN 的真实 Realtime 端到端成功记录。
- ⏳ 有真实网络结果后，方可决定是否将国内线路改为默认。

## 限制
- Supabase Broadcast **公开主题**是朋友之间轻量娱乐方案。六位码不足以防止有针对性的猜测或伪造消息，且房主浏览器负责验证规则，不应承载排名、奖金、敏感隐私或正式防作弊比赛。
- 房主离线时不能走棋；房主本地快照支持输入原房间码恢复，但两人不能在房主离线时继续推进。
- 不读写数据库，所以无需建表或 RLS 数据表改动。正式对公网开放时，若需要更强安全保障，应采用受认证的 private channel + 授权策略/服务器权威。
- 原有账号学业资料仍由鼠哥学院独立管理，本联机试用不能访问那些数据。
- 如果 Supabase 项目关闭公共 Realtime channel 或供应商调整 anon key，需重新配置此线路。
