# 腾讯国内联机 CloudBase 配置（无需购买域名）

## 现状
- 腾讯即时通信应用已经开通，公开 SDKAppID：`1600171481`，区域：中国。
- 目前 GitHub Pages 仍使用现有 Cloudflare Worker 作为唯一已上线的联机服务。
- 国内 IM 通道已完成规则、模拟多人消息、浏览器 SDK 载入测试；**尚未在真实腾讯 IM+CloudBase 上验收**。
- CloudBase 控制台尚无环境；创建时需要微信 MFA。没有完成环境搭建之前，`cn-config.js` 保持 `enabled:false`。
- 腾讯 IM SecretKey 不得写入 Git 仓库、网页或聊天。

## 平台配置
1. 在腾讯云 CloudBase 新建环境。先明确价格和限额，优先免费试用；若有付费订阅，必须确认后再开通。
2. 在环境的「身份认证 → 登录方式」启用**匿名登录**；设置函数调用权限仅为已登录身份（包括匿名账户），不要使用 `true` 放开整个环境函数。建议针对 `mmjj-cn-auth` 使用 `"auth != null"`，其他函数默认禁止匿名调用。
3. 在 CloudBase「云函数」创建事件函数：`mmjj-cn-auth`。代码来源于本仓库 `cn-auth/`，Node.js 运行时，入口 `index.main`。
4. 将环境变量放在云端函数配置中：
   - `IM_APP_ID=1600171481`（公开）
   - `IM_SECRET_KEY` = 腾讯 IM 控制台对应的 SDKSecretKey（**私密**）。
   - `IM_SESSION_SECRET` = 随机至少 32 字节的独立会话密钥（**私密**）。
   - `ALLOWED_ORIGINS=https://ndshuge.github.io`（目前仅用于直连 HTTP 兼容；SDK callFunction 接口自身不依赖 HTTP Origin）。
5. 按 CloudBase 文档用 Web SDK 匿名登录调用函数。此方式**无需自定义域名和单独的 HTTP URL**。前端公共配置：
   - `cn-config.js` 的 `sdkAppID:1600171481`
   - `envId:'你的云环境 ID'`
   - `functionName:'mmjj-cn-auth'`
   - `enabled:true` 仅在真实联机测试通过后开启。无需填 `authEndpoint`。

## 安全注意
- CloudBase 函数调用鉴权必须设置为 `auth != null`。这是低门槛公众娱乐游戏的匿名鉴权，并不意味着每名访客可信。生产运营应增加反刷和配额，避免免费体验名额耗尽。
- `cn-auth` 的 `CloudBase` 入口专供 SDK `callFunction`，前端仅获得短期 UserSig 和签名过的恢复票据；签名密钥始终保留在云函数。
- 房主客户端是本地规则权威，适合朋友娱乐局，不适合作为奖金比赛的强防作弊服务器。房主离线后，双方应暂停等待恢复。
- 腾讯 IM 体验版的群组、同时在线人数、消息量和试用期限应在腾讯控制台核实，禁止默认开启自动续费。

## 验收门槛
- 真实 CloudBase 匿名登录 -> 返回正式 UserSig -> IM SDK 登录。
- 两台不同的大陆网络手机，不开 VPN：创建房间、邀请码、双方准备、出生点、走棋、筑墙、传送门、认输、再战、刷新恢复。
- 验证群组回收避免体验版群组上限，以及网络断连后的错误文案。
- 只有真实双设备 E2E PASS 才修改 `cn-config.js` 的 `enabled:true` 并合并主分支。
