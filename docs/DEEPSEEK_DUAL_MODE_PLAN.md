# 哦，木木金金棋：DeepSeek 双模式接入设计 V1.0

日期：2026-10-14
状态：设计文档；云端功能未部署、未调用 DeepSeek API、未配置或写入任何 API Key。
与现有 docs/DEEPSEEK_EXPERIMENTAL_DESIGN.md 配套：本文件是聊天＋对手的完整产品和费用方案；后者是实验对手的动作接口细化。两者冲突时以本文件的公开限额与安全要求为准。
GitHub Pages 公网入口：https://ndshuge.github.io/oh-mumujinjin/

## 一、目标与边界

1. 玩家免登录打开 GitHub Pages 即可玩旧版本地双人、四档本地 AI 和地图工坊；云端能力显式选择，断网保留游戏。
2. DeepSeek 双模式：聊天（自由文字互动），实验对手（DeepSeek 参与战略决策）；不声称云端模型棋力强于专用搜索 AI。
3. 不允许在静态网页、GitHub 仓库、浏览器储存或链接参数内放入项目所有者的 API Key。
4. 训练地狱 AI 的 S0–S3 离线管线与本设计独立；玩家无需本地 GPU、Python、安装程序和个人 DeepSeek 账户。

## 二、系统架构

GitHub Pages：现有 game.js 保有唯一棋盘规则引擎；新增 ai-client.js/UI 显示聊天窗口、发送快照与候选走法、同步回合 nonce、执行本地 fallback。
Cloudflare Worker：独立后端 API，DeepSeek Secret；精简请求上下文；模式和模型白名单；限流、预算、签名会话及输出格式校验。
Turnstile：首次使用云端功能时对匿名用户进行人机验证，Worker 服务端调用 Siteverify 验证，验证一次有效后颁发短期签名 token。
Rate Limit + Durable Object：细粒度请求节流、全站预算与每会话计数。原子预留上游调用的最大费用，按 usage 和生效价格结算；发生并发也不得穿透硬限额。
DeepSeek：固定官方接口和模型。首版优先 flash 类轻量模型；后续高强度对手先经成本和延迟验证。
Worker Secret：DEEPSEEK_API_KEY、TURNSTILE_SECRET、SESSION_SIGNING_KEY；不进入源码。

## 三、模式 A：自由聊天

玩家选择人格（温和、嘴硬、适度毒舌）；在旧版 AI 对话框上叠加自由输入与对话历史。
每次请求只发送：玩家当前消息、最近最多六条对话，以及有限的当前棋局结构化信息。
初始建议：单消息最多 300 汉字，模型回应不超过约 160–220 汉字；超时 6 秒，可中止并恢复本地固定台词。
API 输出：reply、emotion；由前端按纯文本渲染，不允许 HTML 脚本。
模型只描述引擎实际提供的分析；不得冒充规则引擎证明必胜或无路可走。
界面设置：自由聊天显式 opt-in；玩家可关闭云端、关闭台词、清除对话历史；首次提示棋局与最近消息会发送到 DeepSeek 服务。

## 四、模式 B：实验 AI 对手

推荐首版为 DeepSeek 参谋混合模式：本地搜索引擎正常落子，DeepSeek 在关键转折回合（封路、传送、局势逆转）从本地提供的合法候选中作决策，每盘最多 8–12 次云端调用。
若启用全程 DeepSeek 实验模式，需要更高预算且明确向玩家展示“达到次数上限后自动切回本地对手”，不得谎称全程均由 DeepSeek 控制。
GameSnapshotV1 字段：version, variant, mapRocks, specialTiles, players, turn, slideDirs, placedWalls, wallsLeft, gameId, turnId, stateHash。
候选集：规则引擎产生全部合法行动，专用搜索器筛选多样化的最多 8–16 个候选，保留明显直接获胜或紧急防守行动。每个候选附 ActionId 和有限的可解释特征。
DeepSeek JSON 返回：selectedActionId、taunt、briefReason；不能自行增造未提供的行动。
收到建议后客户端必须再次确认 turnId、stateHash 和本地合法性；取消、超时、非法动作、空 JSON、网络故障或额度用尽时由原本地 AI 选取行动。模型输出文字不能影响规则判定。
单机网页的棋局输入可被开发者工具篡改，所以严格限制请求费用应靠 Worker 自己的独立计数和校验；若日后建设联网排名，再引入服务端权威规则引擎。

## 五、接口草案

POST /v1/session
请求：turnstileToken。
响应：sessionToken、expiresAt、quota。
必须 Worker 端 Siteverify，签发短期签名会话 token，推荐存于浏览器内存；不依赖跨站 Cookie。

POST /v1/chat
请求：sessionToken、personality、messages、boardSnapshot、requestId。
响应：reply、emotion、remainingQuota。
服务端不接受前端自行指定系统提示、模型名和上游地址；限制输入和输出 token。

POST /v1/opponent/move
请求：sessionToken、gameId、turnId、stateHash、boardSnapshot、legalCandidates、requestId。
响应：selectedActionId、taunt、remainingQuota。
调用 DeepSeek JSON 输出模式；解析异常不重新无限请求；客户端本地校验后才落子。

GET /v1/status
只返回云端功能状态、展示用限额信息，不返回 Secret、原始余额和内部风控配置。

错误码：RATE_LIMITED / DAILY_QUOTA_EXCEEDED / BUDGET_EXCEEDED / CLOUD_UNAVAILABLE / INVALID_ACTION / INVALID_STATE / TIMEOUT。

## 六、安全、匿名访问、隐私

Cloudflare Worker CORS 仅允许 https://ndshuge.github.io 来源；注意 CORS 不是认证和防刷手段。
Turnstile token 必须服务端 Siteverify，令牌单次使用且短有效期；人机验证也无法杜绝所有滥用。
请求签名会话令牌 + 路由限流 + 全站预算独立实施。会话令牌不代表长期真实身份，不能仅靠 IP 或 localStorage 识别唯一玩家。
前端状态均为非可信，所有请求限制长度，默认不存储原文，日志记录聚合用量/状态码/延迟/预算，不记录私人对话。
固定系统规则不可让用户提示词更改；DeepSeek 输出和玩家输入都作为不可信文本渲染。
跨站时推荐 Authorization bearer 短期签名 token，不依赖可能被 Safari 限制的第三方 Cookie。
管理员一键停用 chat、opponent 或所有云端功能；停用不会影响本地游戏。

## 七、费用控制初始配置（待用户审批）

匿名每会话每天：聊天 12 次、每盘实验决策 10 次、实验模式每日最多 2 盘。
短期频率：聊天不超过 3 次/分钟；实验决策每局只准一个在途请求。
请求上限：聊天输入预算约 1200 tokens、输出最多 256 tokens；实验行动输入约 2500 tokens、输出最多 350 tokens；超限前端应截断，服务端重新校验。
公开试运行全站 DeepSeek 费用示例：1 美元/日、15 美元/月；必须实际配置 Durable Object 原子硬预算以及 DeepSeek 预付余额限制，不能仅在 JS 中展示额度。
成本预留按照高峰单价、cache-miss、max output tokens 和并发最大值估计，结算使用真实 usage。按价格表变更及时校正；Worker 自身的计费也需监控。
面向访客展示“今日云端次数已用完，可继续本地对战”，不把密钥、内部成本上限或风控标识暴露给客户端。
离线游戏和规则查询无 DeepSeek 成本；若要随用随离线打开网站，还须单独做 Service Worker 缓存。

## 八、故障回退矩阵

DeepSeek 5xx、超时、网络断开：聊天用本地台词，实验落子改由原地狱 AI；不冻结棋盘。
JSON 为空、截断、解析失败、非法动作：丢弃并使用本地合法走法；云端返回不触发悔棋或非法落子。
浏览器切换地图、悔棋、重开局：丢弃迟到响应；AbortController 仅取消等待，不保证上游费用可以退回。
额度用尽、管理员关停、Turnstile 验证失败：停止收费请求；玩家继续使用全部本地功能。
Cloudflare Worker 不可达：AI 两模式自动降级，不影响 GitHub Pages 访问。

## 九、阶段计划与硬性验收

D0 契约/安全设计：统一 GameSnapshotV1、ActionId、会话和预算规范，密钥扫描零泄漏，旧游戏回归全通过。
D1 Cloudflare Worker：密钥 Secret、CORS、Turnstile Siteverify、短令牌、频率和原子预算。用 Mock API 执行并发滥用测试，过额零放行。
D2 自由聊天：输入框、历史、角色、隐私提示；移动端不遮挡棋盘，错误回退可靠。
D3 实验对手：正确序列化自定义障碍及冰面传送状态，500 回合零非法动作，输入/输出缺省均可回退。
D4 灰度：真实访客、小样本公开试用，统计成本、失败率、P50/P95 响应，24 小时观察无超预算或账户密钥泄漏。
D5 正式开放：iPhone Safari、Android Chrome、桌面浏览器；明示云端使用和收费额度；GitHub Pages 主游戏不迁移、离线本地模式不回归。

## 十、官方文档

DeepSeek JSON：https://api-docs.deepseek.com/zh-cn/guides/json_mode/
DeepSeek Tool Calling：https://api-docs.deepseek.com/zh-cn/guides/tool_calls/
DeepSeek Pricing：https://api-docs.deepseek.com/quick_start/pricing
Cloudflare Worker Secrets：https://developers.cloudflare.com/workers/configuration/secrets/
Cloudflare Rate Limiting：https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
Cloudflare Turnstile Server Verify：https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
