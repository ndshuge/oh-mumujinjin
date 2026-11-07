# 木木金金棋：V1.0 好友联机与统一大厅发布检查（2026-11-07）

## 2026-11-08 当前发布门槛

- 默认线路已调整为国内 Supabase Realtime；Cloudflare 是显式国际备用选项，不再作为默认。
- 当前发布工作树不包含 Tencent IM / CloudBase 联机实现，仅保留现有 Supabase 与 Cloudflare 两条路径。
- Supabase 加入确认竞态已修复，并新增可稳定复现早到快照的回归测试。
- 最新验收：103/103 Node 测试通过；真实 Supabase 双 WebSocket 广播探针通过；完整双浏览器对局连续 3 次通过；大厅/移动布局 smoke 通过；关键脚本语法检查通过。
- 双浏览器测试使用不同匿名身份，但尚未覆盖两台物理设备。中国大陆无 VPN 实测仍是最终网络验收门槛。
- Pages 尚未发布本次工作树；合并到 \`main\` 并确认 Actions / Pages 完成后，仍需进行线上脚本版本核验。


## 2026-11-07 21:00 后：新体验改造进度（最新）

- 邀请链接 `?room=XXXXXX&net=sb|cf` 已在真实 Chrome + Supabase 双客户端环境确认自动加入，直接显示房间准备界面；准备状态会同步到房主，失败可重试。无邀请码时默认选择 Supabase；显式 `net=cf` 不会被默认值覆盖。
- 地图中心新增可见 `＋ 创建地图` 入口，复用工坊的空白草稿与保存功能；浏览器验证新建、保存后出现在「我的地图」，原有地图不会被清空。
- 棋盘使用原创立体圆润金/木棋子，保留原始规则与点击坐标；约 240ms 短动效与 Reduced Motion 尊重设置，390×844 视口真实棋盘截图已检查。
- 既有房主浏览器权威限制仍然存在：房主下线无法继续棋局，后续需服务端验证与持久化；中国大陆真实两机免 VPN 验收仍待朋友实际配合。
- 发布变更及测试详情见 `docs/ROOM_INVITE_CHESSBOARD_RELEASE_20261107.md`；早期状态以下文为历史记录。



## 当日状态补正（以后续证据为准）

- **Cloudflare**：Worker 已部署，但 Windows 非代理网络仍有超时/重置记录；没有中国大陆免 VPN 双机验收，不能标为「国内稳定」。
- **Supabase**：原 `python-academy` 项目已由用户从暂停状态恢复。当前 DNS 正常，HTTPS 健康检查 HTTP 200，Realtime WebSocket 已成功订阅。
- **好友房间**：两个独立真实 Supabase 客户端已完成创建、加入、双方准备、开局及首步走棋同步；这是同一主机的双客户端网络 E2E，不等同于两台物理手机实测。
- **客户端**：中文故障提示与缓存版本修复在 PR #6；准备合并后由 GitHub Pages 自动部署，并确认线上脚本版本。
- **最终验收**：Pages 部署后，使用 iPhone Safari 和朋友设备，在中国大陆不开 VPN 的网络中完整走一局。未完成该项前，不把 Supabase 标记为「国内网络已验收」。



## 目标与当前代码
- 开局先进入统一大厅：挑战小克、好友联机、本地双人、地图中心。
- 知序 AI 学院 V5 风格（克制的卡片、分组表单、设备响应式），保留既有小克和棋盘引擎。
- 个人地图收藏、命名、缩略预览、重命名、删除、编辑入口，以及房间内双方同一地图快照。
- 好友房间：私人六码、邀请链接、选玩法与地图、选边与先后手、准备、服务端走棋验证、重连、认输、双人同意再战并交换阵营。
- 正式 GitHub Pages 的来源是 `main` 根目录。本功能在 `feature/friends-zhixu-ui-20261106` 开发分支中，**未经生产验收，不应覆盖 main**。

## 已跑通的本地真实浏览器闭环
`node online/browser-live-e2e.mjs` 在独立的 Chrome 调试端口和临时浏览器目录中验证：
1. A 创建真实本地 Cloudflare Durable Object 房间，B 用邀请链接加入。
2. A、B 均可查看相同预设地图及模式，双方准备后开局。
3. 两人在实际棋盘点击出生点并走棋，另一端状态同步。
4. A 认输，双方收到比赛结束状态与胜负。
5. A、B 分别申请再来一局，交换阵营并重新选择出生点。
6. 退出房间返回大厅。
7. 额外回归：编号为 `0` 的第一对传送门能提交“留在原地”选择。

`node online/realtime-e2e.mjs` 则验证两个独立的 **WebSocket** 实际连接（非模拟）：非法动作拒绝、版本号与服务端权威状态、断线重连、认输与双人再战。
`node --test online/maturity.test.mjs` 验证：认输结局、双方投票才能再战、交换阵营、进行中不能申请再战、结束后不能通过“准备”篡改房间状态。

## 本地复验
启动两个独立终端：
```powershell
# 在本项目根目录
python -m http.server 8898 --bind 127.0.0.1

# 在 online/ 目录
npx --yes wrangler@4.158.0 dev --ip 127.0.0.1 --port 8787 --local
```
再在项目根目录运行：
```powershell
node --test map-collection.test.cjs friend-rooms.test.cjs friend-reconnect.test.cjs online-rules.test.mjs online/worker.test.mjs online/maturity.test.mjs tests/xiaoke-seat-order.test.cjs
node browser-smoke.mjs
node online/realtime-e2e.mjs
node online/browser-live-e2e.mjs
node rps-regression.cjs
node map-v2-regression.cjs
node map-v2-online-rps-regression.cjs
node map-v2-persistence-regression.cjs
node workshop-regression.cjs
```

## 严格的正式发布门槛（仍未全部通过）
1. **Cloudflare 正式账户**：需要由用户登录或认领 Cloudflare 账户，取得长期 Workers 与 Durable Objects 项目。当前电脑 `wrangler whoami` 未登录，仓库没有部署令牌。
2. **公网可用**：已成功临时部署 `mmjj-friends.mixolydian-ragdoll.workers.dev`，但公网请求曾遇 Cloudflare challenge（HTTP 403、`cf-mitigated: challenge`），**不能将临时部署视为已通过生产验收**。认领后必须确认 API、预检 CORS 和 WSS 不再触发挑战，且可跨运营商网络访问。
3. **固定 endpoint**：取得正式 `https://<worker>.workers.dev` 后，修改 `online-config.js` 的 `window.MMJJ_ROOM_SERVER_URL`，只填写公开 API 地址，**切勿提交任何账户密钥**。
4. **手机真机验收**：至少两台不同设备，覆盖 iPhone Safari / Android Chrome 或电脑 Chrome，确认选边、房间准备、地图卡片、落子、筑墙、传送、短线重连、认输和再战。重点检查低宽度与中文输入、键盘遮挡。
5. **正式发布**：从经过验证的开发分支合入 `main` 后 GitHub Pages 会自动更新；发布前记录 commit，发布后复测。若异常，立即回退到发布前 commit，并核查 Worker 与前端版本兼容。

## 部署自动化
提供 `.github/workflows/deploy-room-server.yml` 的手动 GitHub Actions 部署。设置仓库 Secrets：
- `CLOUDFLARE_API_TOKEN`：仅具 Workers 脚本部署和 Durable Objects 所需最小权限。
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账户 ID，不是授权密钥，但同样通过仓库 Secrets 注入。

随后可以手动启动 Workflow。鉴于当前尚未授权，**不要运行正式部署工作流，也不要把临时预览地址写入正式前端配置**。

## 后续 V1.1 候选
- 匿名观战与对局回放。
- 地图云端同步、JSON 导入与用户地图分享。
- 自定义娱乐地图（对称或不平衡）的单独房间标签；竞技局继续强制公平性检查。
- 断线 12 小时内恢复对局、AI 填位/超时判负的产品规则说明与测试。
- 多手机、弱网条件下的持续稳定性与用户体验监测。

**最终状态判定：本地可复测；公网预览被 challenge 拦截；正式 Cloudflare 账户及真实手机双端验收未完成；未在 GitHub Pages main 发布。**
