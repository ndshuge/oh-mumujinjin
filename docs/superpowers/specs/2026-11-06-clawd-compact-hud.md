# Clawd 像素螃蟹与紧凑角色栏设计 — 2026-11-06

## 背景及用户录屏证据
iPhone 录屏 18:53 显示点击顶部“小克”头像后，从头像下方展开“角色对话”浮卡（覆盖棋盘上方数行）；头像下方另有常驻模型说明条，挤压棋盘。当前头像错误地引用了 Claude 放射状品牌标志。
Claude Code 的 Clawd 是暖橙、方形像素体、黑方眼、左右侧短臂、四短腿的独特形象。网页图片检索来源：ClaudeDevs 公开活动截图与 Claude Code 官方项目 issue #8536/#42415；检索图片仅作为形态参考，实施使用项目自绘、可编辑的 SVG，而非未经核实授权的外站图片资产。

## 行为与 UI
- 删除 `#mascotExpanded` 角色对话遮挡浮层，点击顶部头像只轮换现有顶部小气泡的符号台词，不创建新层、不滚动到棋盘外。
- 删除头像下方常驻 `#xiaokeStatusNotice` 说明条，模型未接入的文字状态仍在 `#mascotEmotion` 小标签及设置里的 `#xiaokePendingHint`。
- 用项目原创 `xiaoke-clawd.svg`（120×120 crispEdges 像素造型）替换页面所有小克图片，保持官方 Clawd 视觉特点而不冒称官网原图。
- 其他 AI 角色仍在顶部小气泡显示简短文字；引擎继续通过原有 DOM `#aiBanter` 接收状态，但它不再独立占据棋盘。
- 独立预览对话框 `#xiaokePreviewDialog` 是用户主动点击设置中的“角色预览”打开，保留，用于查看小克各种符号表达。
- 不变：AI 引擎/随机地图/猜拳/触控缩放机制、默认选中小克、存档兼容。
- 缓存版本号更新，兼容 GitHub Pages CDN。

## 验收
- 首屏和点击头像后不出现 `#mascotExpanded`、`#xiaokeStatusNotice`；点击头像可更新 `#mascotMessage`；头像为像素 Clawd；画布渲染正常。
- Node 测试、旧地图/RPS 回归和 390×844 移动端浏览器截图。
