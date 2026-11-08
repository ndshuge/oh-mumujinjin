# 2026-11-08 Supabase 大陆手机访问不稳定诊断

## 本次证据

- 2026-11-07：原 Python Academy 共用 Supabase 项目恢复后，电脑 DNS 从 NXDOMAIN 重新解析到有效 A 记录；该项目不是新建数据库。
- 2026-11-08：Windows DNS 返回 `104.18.38.10`、`172.64.149.246`。阿里 DNS 返回同样的两条地址。
- 同一 Windows 网络访问 `/auth/v1/health`（未携带 apikey）返回 HTTP 401，证明远程服务器可达；携带项目现有公开 anon Key 的健康检查此前返回过 HTTP 200。
- 本次再次运行 `node supabase-realtime-probe.mjs`：两个独立 Realtime 客户端订阅成功，消息成功从 A 发送到 B。
- 用户提供的两部真实手机 5G 截图：项目 GitHub Pages 可加载，Supabase HTTPS `Load failed` 和 Realtime WebSocket `transport failure`，手机 Safari 直接访问 API 地址显示失去网络连接。
- 证据能支持“不同网络的可达性不一致”，不能仅据此确证是运营商封锁、DNS 污染、Cloudflare WAF、网络切换或 Supabase 平台区域故障。当前不能宣布两台大陆手机无 VPN 联机验收通过。

## 解决策略

保留既有 Supabase URL、anon 公钥、Realtime Broadcast 和默认 `net=sb`；`net=cf` 为手动备用。**不要**修改学院数据库或把未验证的 CloudBase 服务上线。

新增 `network-test.html`：在使用者自己的网络和浏览器里连续运行 3 次 HTTPS + WebSocket 探针，另测 Cloudflare Worker HTTPS；只复制时间、用户自选网络类型、各轮结果与耗时。报告中不包含 API Key、token 或 URL。地图/棋局不受影响。

此页面是 **诊断工具，不是网络代理**。如果移动网络连 Supabase 的 HTTPS 都访问不了，单改前端不会让已断开的网络路径恢复。进一步修复必须提供可在中国大陆手机稳定访问的 HTTPS+WebSocket 中转域名，或使用已验证的大陆云端房间后端。

## 验收边界

- Node 非训练测试已通过 111/111（本次添加 8 项）；页面内联模块语法检查、JS 语法和 `git diff --check` 已通过。
- 手机宽 390px 的静态截图已检查；远程只读浏览器不允许代替用户点击正式页面，因此新检测按钮的真手机操作仍待用户测试。
- Windows 的 Supabase 广播探针通过，但不代表两台 5G 手机能直连。
- 当前 Windows 环境没有已安装的 `tcb/tccli`，也没有已加载的 CloudBase 项目环境变量。新增大陆服务需要先验证已有环境或让用户开通/授权，不能假设云端已就绪。

## 真实双手机操作

1. 手机 A、手机 B 使用各自的 5G 网络，关闭 VPN，打开 `/oh-mumujinjin/network-test.html`，选择“手机流量”，连续检测并复制报告。
2. 至少一台保持同一手机、改用普通 Wi-Fi（VPN 仍关闭）再测一轮。
3. 对比 `HTTPS`、`WebSocket` 是否同时成功，以及仅有移动网络失败或均失败。
4. 只有两机 5G/Wi-Fi 实际创建、加入、准备、落子、刷新恢复全部通过，才将国内直连标记为完成。
