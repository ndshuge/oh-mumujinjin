# DeepSeek 实验对手：GitHub Pages 安全接入设计 V1

状态：**设计完成，尚未部署 API、创建 Cloudflare Worker 或启用付费请求**。
更新：2026-10-14。
前端仓库：https://github.com/ndshuge/oh-mumujinjin
公开游戏：https://ndshuge.github.io/oh-mumujinjin/

## 1. 目标与边界

- 新增可选择的 **DeepSeek 实验对战**：本地玩家执金，DeepSeek 执木。
- 原 **本地双人 / 入门 / 策略 / 挑战 / 地狱** 全部保留，实验模式不替换现有棋力 AI。
- 支持地图工坊自定义的固定障碍（map schema v1）；传送、冰面、加速规则完全由现有游戏引擎负责。
- DeepSeek 只推荐行动编号与可选聊天台词；**浏览器本地规则引擎**生成候选、校验动作、执行移动、决定胜负。
- 网页仍静态部署在 GitHub Pages；Cloudflare Worker 仅负责安全代理，不托管游戏网页。
- 无网络、付费额度耗尽、非法动作、超时或 API 维护，均自动回退本地现有地狱 AI。

不在首版实现：联网双人裁判、排行榜反作弊、玩家自由任意提示词、带密钥前端直连 DeepSeek、自动充值。

## 2. 现有代码复用位置

| 作用 | 现有游戏引擎接口 / 结构 | 设计动作 |
|---|---|---|
| 玩家普通移动 | `availableMoves()`, `movementOptions()` | 只从返回值构建候选 |
| 传送门 | `portal()`, `playerMove()`, `choosePortal(warp)` | 候选必须包含 stay / warp，执行按既有流程自动完成 |
| 筑墙 | `validWall(w)`, `placeWall(w)` | 全棋盘 8×12×2 墙位逐个检查，不得只用现有 AI 的局部墙位枚举 |
| 地图 | `mapCurrent()`, `cleanMap()`, `ROCKS` | 只发送经过地图校验的标准化障碍数组 |
| 本地回退 | `computerTakeTurn()` 及现有地狱 AI | 抽出纯 `chooseLocalAction()`，避免因调用回退又触发 DeepSeek 的递归 |
| 棋谱/回合 | `state.turn`, `state.moves`, `state.walls`, `state.players`, `state.slideDir` | 构建状态指纹，过期请求不可执行 |

目前 `game.js` 是一个较大的浏览器 IIFE。施工时应先增加小型适配层 `experimental-opponent.js`，**不复制另一份不一致的规则**。后续把合法动作生成抽到共享纯模块，供离线训练器与浏览器共同使用。

## 3. 运行架构

```text
GitHub Pages (玩家浏览器)
  ├─ 棋盘 + 原有本地双人/人机逻辑
  ├─ 统一合法动作清单（含墙/传送/冰面）
  ├─ 状态指纹、请求超时、本地最终校验
  └─ POST https://<worker-domain>/api/move
                  │
Cloudflare Worker ├─ 精确的 Origin CORS 白名单（非鉴权手段）
                  ├─ Turnstile 的后端 Siteverify → 短时会话
                  ├─ 每会话、每小时速率限制
                  ├─ Durable Object 原子预算/并发/熔断
                  ├─ 输入上限、schema 校验、固定提示词
                  └─ DeepSeek Chat Completions API
                       模型 deepseek-flash / thinking disabled
                       结构化 JSON，只返回 action_id 和 comment
                  │
浏览器验证 stateFingerprint 和 action_id ∈ 当前合法集
  ├─ 合法：只调用 playerMove / choosePortal / placeWall
  └─ 非法/超时/断网/预算耗尽：chooseLocalAction() 接管
```

注意：浏览器本地合法性验证确保**正常玩家的游戏规则**正确，但公开网页的客户端状态可以被人为篡改，不能据此做有经济价值的排名/奖品结算。Worker 也不能信任前端提交的任意游戏状态或候选列表作为费用授权依据。如未来做排位与排行榜，需要引入可信服务端对局状态验证。

## 4. 协议设计

### POST /api/session

请求：`{"turnstileToken":"..."}`。

Worker 将令牌提交 Cloudflare Turnstile **Siteverify** 验证（必须验证 `success`、预期 `hostname` / `action` 等信息）。通过后，签发仅具备 `ai:move` 权限、30 分钟有效的 HMAC 签名会话令牌。令牌保存在页面**内存**，不依赖跨站 Cookie、不写 localStorage。

响应：`{"sessionToken":"...","expiresIn":1800,"maxMoves":30}`。

Turnstile Token 有 5 分钟有效期且只能使用一次；不是拿一次 Turnstile Token 每步复用。每局新建有配额的会话，服务端保留消费状态。

### POST /api/move

Header：`Authorization: Bearer <sessionToken>`。

请求示例（示意，不是现成接口）：

```json
{
  "protocol": 1,
  "gameId": "8b4e...",
  "ply": 13,
  "stateFingerprint": "sha256:...",
  "variant": "classic",
  "map": {"version": 1, "rocks": [{"x": 4, "y": 5}]},
  "state": {
    "players": [{"x": 7, "y": 9}, {"x": 1, "y": 3}],
    "turn": 1,
    "walls": [{"x": 3, "y": 5, "o": "h"}],
    "wallsLeft": [3, 4],
    "slideDir": [null, null]
  },
  "legalActions": [
    {"id": "A01", "type": "move", "path": [[1, 3], [1, 4]], "portal": "stay"},
    {"id": "A02", "type": "wall", "x": 4, "y": 4, "o": "v"}
  ]
}
```

注意：上面的路径和候选坐标只是协议示例，实际只能填本地当前局面生成的合法动作。实际候选须带**唯一且确定**的 ID；多段加速移动要编码完整经过路径，不能仅按终点去重；传送门应有 stay/warp 两个独立动作。

考虑成本，发给 DeepSeek 的候选清单可压缩；首版推荐先生成全部合法行动，再用本地启发式保留前 8–24 个有代表性的候选（保留即时胜利/关键防守候选），并进行策略对照。不要让 DeepSeek 创造未列入候选集的坐标。

Worker 内部固定系统消息：只能在当前棋局、合法候选中选择一项，并生成一个简短、适宜公开网页的对话句子；输入的地图名称、玩家对话均不提升为系统指令。Worker 不接受客户端提交的任意 prompt、model、max_tokens、目标 URL。

DeepSeek 调用推荐：
- API：`POST https://api.deepseek.com/chat/completions`
- `model: "deepseek-flash"`
- `thinking: {"type":"disabled"}`（低时延首版）
- `response_format: {"type":"json_object"}`
- `max_tokens: 120` 起步，按实测调整。
- 系统提示明确包含 `json` 和输出示例；必要时使用严格 function calling，但**仍然必须本地再次检查**。

Worker 仅返回最小必要字段：

```json
{
  "protocol": 1,
  "ply": 13,
  "stateFingerprint": "sha256:...",
  "actionId": "A02",
  "comment": "我先堵住这条近路。",
  "source": "deepseek"
}
```

处理限制：
- comment 纯文本，长度 ≤80 字，`textContent` 渲染，不拼接 HTML；
- 绝不返回 DeepSeek 的密钥、原始推理日志或任意工具调用；
- `actionId` 必须在当前 `legalActions` 中，而且动作**再次通过当前浏览器真实 state 的原生规则函数**；
- `ply` / `stateFingerprint` / 游戏 ID 不匹配直接丢弃；不能让上一回合的 API 回复在新回合落子；
- `playerMove(move)` 触发 `pending` 传送窗口时，实验模式必须以候选的 portal 选择调用 `choosePortal(warp)`，且整回合只能提交一次；
- 6 秒为默认实验超时目标。超时回退本地 AI，旧 API 响应到达后不再执行；不自动重试付费请求。

## 5. GitHub Pages 公开安全

- **密钥**：只放 Cloudflare Worker Secret `DEEPSEEK_API_KEY`；另设 `TURNSTILE_SECRET` 与 `SESSION_SIGNING_KEY`。不放在 GitHub、HTML、JS、URL、日志或浏览器存储。
- **域名**：生产 CORS Origin 只允许 `https://ndshuge.github.io`（CORS 只能限制 Origin，不能指定该域名下某个路径）。不支持 Origin 的请求默认拒绝，但 Origin 可以被非浏览器客户端伪造，**不能作为鉴权**。
- **会话**：Turnstile 服务器验证 + 短效令牌；一局/一个会话消耗额度。所有身份和用量在服务端核查，不能依赖用户提交的 `gameId` 自报身份。
- **限流**：每会话最大 30 次 DS 决策，连续请求间隔例如 ≥3 秒，限制同时在途请求；匿名 IP 只做辅助保护，不作为唯一识别依据。
- **准确费用闸**：Cloudflare Worker rate-limit 绑定适合粗粒度保护，其计数是地域局部且最终一致的，不适合作为精确计费器。使用 Durable Object 或等效串行事务管理**全站每日预算、并发限额、调用前的最坏情况费用预留**，并依照响应 usage 结算差额。失败时按保守原则保留预留额、可对账后释放。
- **默认额度**：正式启用前，用户明确指定每天全站最多付费多少，以及每名玩家的日配额；超过立即拒绝 DS 请求，自动转成本地地狱 AI。禁用自动充值。
- **请求限制**：大小建议 ≤12 KB；严格校验 JSON 结构、坐标、数组长度、文本长度；无任意代理 URL、无开放式 chat completion 转发；上游超时和失败采用熔断。
- **审计**：日志只记状态码、耗时、输入/输出 token、估算费用、模型、无敏感信息的请求编号；不记录密钥、会话 Bearer 或自由聊天原文。
- **暂停开关**：Worker `AI_ENABLED=false` 可立即停止所有外部调用；前端同时保留用户可见的“关闭 DeepSeek”选项。

Turnstile Token 必须后端验证，5 分钟过期、单次使用。Worker 的 Rate Limit 绑定是渐进一致的，不能当全局财务限额；二者都不足以单独防止付费额度被滥用。

## 6. 交互与部署

手机设置页新增：

```text
对战对象
◯ 本地双人
◯ 本地 AI（入门/策略/挑战/地狱）
◯ DeepSeek 实验对手 [联网 / 可能有等待]

DeepSeek 对战
  每轮思考中...（可取消 / 本地接管）
  AI 说：……
  本局剩余实验回合：X
```

切换模式会重置对局；自定义地图不重置为官方障碍布局。用户可以关掉嘲讽，不影响合法动作。

Cloudflare Worker 独立部署于 `workers.dev` 或自定义域名，GitHub Pages 继续托管已有 HTML/CSS/JS。用户只需配置 Cloudflare 帐号、域名/Turnstile 和 DeepSeek Secret；**不要将 DeepSeek API Key 发送到聊天或提交仓库**。

## 7. 施工里程碑与验收

| 阶段 | 交付 | 必须通过 |
|---|---|---|
| D0 | 适配器：本地候选生成、动作 ID、状态指纹、自动传送 | 1000 组随机/自定义地图：发出的动作全部合法；含冰面/加速/传送 |
| D1 | 模拟 Worker / 假 DeepSeek 输出 | 过期状态、无效 ID、重复回复、超时与取消测试全部正确回退 |
| D2 | Cloudflare Worker + Turnstile + Secrets + Durable Object 额度闸 | 前端没有密钥、服务端验票、限流、全站预算硬停、异常返回不扣额外费 |
| D3 | DeepSeek 实际联调（低预算内测） | >=100 个真实回合，无非法动作；p50/p95 时延、失败率、单局花费统计 |
| D4 | 公开测试 | 手机 Safari/Android Chrome/电脑浏览器通过，GitHub Pages 可访问；无 API 时仍能正常单机对战 |

**上线原则**：先本地模拟和 Worker 测试，再低预算内测；不得未经安全验证就在公开 GitHub Pages 上直接启用付费 Key。DS 模式是实验角色，不宣称能击败经过专门训练的地狱 AI。

## 8. 官方资料

- DeepSeek Models & Pricing: https://api-docs.deepseek.com/quick_start/pricing
- DeepSeek Chat Completions: https://api-docs.deepseek.com/api/create-chat-completion/
- DeepSeek JSON Output: https://api-docs.deepseek.com/guides/json_mode/
- Cloudflare Workers Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare Workers Rate Limits: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Cloudflare Turnstile server verification: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
