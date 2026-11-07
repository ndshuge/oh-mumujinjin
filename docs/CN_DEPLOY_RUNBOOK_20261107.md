# 国内好友联机：服务配置与发布门槛（2026-11-07）

## 当前状态
- 腾讯云 IM 体验版应用已创建。SDKAppID：`1600171481`（公开应用编号）。
- 已实现网页版 Tencent Chat 自定义消息转发，双人玩法由房主验证合法棋步；Cloudflare 仍为正式生产通道。
- **尚未创建和部署中国大陆可直连的正式身份签发函数**。没有 UserSig 后端不允许打开国内模式。
- 腾讯云 SCF 控制台已经触发云函数资源角色授权，要求绑定微信的 MFA；该步骤必须由账号持有人完成。

## 最简单的云端部署方式
1. 在腾讯云 SCF 创建名为 `mmjj-im-auth` 的 **事件函数**，建议地域广州，Node.js 20 或可用的稳定版。腾讯云也可提供函数 URL，免自购域名。
2. 使用此仓库 `cn-auth` 目录中的 `index.js`、`package.json`、`package-lock.json` 和安装好的依赖创建部署包；处理函数为 `index.main`。
3. **仅在腾讯云函数环境变量中设置**：
   - `IM_APP_ID=1600171481`
   - `IM_SECRET_KEY=<IM 控制台 SecretKey>`
   - `IM_SESSION_SECRET=<至少32字节的强随机字符>`
   - `ALLOWED_ORIGINS=https://ndshuge.github.io`
4. 为该版本开启函数 URL 的公网访问及 POST、OPTIONS 的 CORS 访问。请确认函数 URL 的实际请求事件是否包含 `httpMethod`、`headers` 和 `body`；生产部署用 POST、OPTIONS 测试，而不是仅看控制台测试。
5. 新 URL 成功部署且不开 VPN 实测可用后，修改 `cn-config.js` 里的 `enabled` 为 `true`、`authEndpoint` 为函数 URL；SDKAppID 已为公开 ID。
6. 先用两台不开 VPN 的不同浏览器/手机完成「建房 → 加入 → 准备 → 出生点 → 走棋 → 认输 → 再来一局 → 刷新恢复」，然后再合并 GitHub 主分支。

## 隐私与成本
- IM SecretKey、云函数签名 Session Key **绝不可**保存在 GitHub 仓库、网站 JS 或聊天中。
- SCF 对新用户通常前三个月提供免费试用额度，试用期结束或超额后可能自动按量收费；没有明确费用许可不要购买套餐或启用付费升级。控制台可配置使用额度、调用频率、并发上限和费用提醒。
- 当前浏览器获取匿名 UserSig 的公开入口只能按 Origin 做基础浏览器限制；恶意脚本可以伪造 Origin。若提供给大量非熟人，必须加一层可靠限流和身份控制。建议仅用于小范围好友娱乐局。
- IM 体验版限制用户数、群组数、历史保留时长。房主主动退出会尝试解散群，异常退出仍可能留有历史群。

## 回滚
前端继续使用 Cloudflare 时不受国内服务影响。国内联机入口未验证前保持关闭。线上异常时关闭 `cn-config.js` 的 enabled 即可回退。
