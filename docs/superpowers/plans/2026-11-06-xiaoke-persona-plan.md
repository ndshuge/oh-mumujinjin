# 小克角色 UI 预览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有对手设置中建立不会影响棋力的“小克”角色预览。
**Architecture:** 独立的 persona 台词纯逻辑模块 + UI 弹层，保留现有 game.js、ui-ai-presets-v9.js 与中迪引擎不动。头像为仓库本地 SVG。
**Tech Stack:** HTML/CSS/vanilla JS, Node 24 node:test。
**Spec:** docs/superpowers/specs/2026-11-06-xiaoke-persona-design.md

## Global Constraints
- 不修改现有 AI 回合、棋盘规则及难度选择。
- 小克对白不得包含汉字和 ASCII 英文字母。
- 对手为不可玩预览，不可伪装强模型；不发布正式 Pages。

## Review Focus
- 连续点击前后切换的台词不应原地重复。
- 任意 event 输入应该返回非空的合法符号台词。
- 点击预览不应使中迪/小迪 selected 状态发生变化。
- modal 关闭/键盘 Escape 在窄屏也可操作。
- reduced-motion 模式应禁用关键帧动画。

### Task 1: 语音接口
**Files:** Create: `tests/xiaoke-persona.test.cjs`, `xiaoke-persona.js`
**Interfaces:** `window.MMJJXiaokePersona` 和 Node 模块导出 `createPersona`、`QUOTE_POOL`。
- [ ] 写不包含汉字/英文字母、event 回退、隔轮表情多样性测试。
- [ ] 运行 `node --test tests/xiaoke-persona.test.cjs`，确认因为缺少接口而失败。
- [ ] 实现只做 view 的 persona 模块。
- [ ] 运行测试确认通过。

### Task 2: 角色预览和头像
**Files:** Create: `xiaoke-preview.js`, `xiaoke-preview.css`, `claude-avatar.svg`; Modify: `index.html`; Test: `tests/xiaoke-preview.test.cjs`
**Interfaces:** `#xiaokePreviewBtn`、`#xiaokePreviewDialog`；纯 UI 只对文本、弹层做写入。
- [ ] 写静态 DOM 与视图安全测试，验证预览入口独立于 AI difficulty。
- [ ] 跑测试确认缺少 DOM 时失败。
- [ ] 加弹层、头像、无障碍及响应式 CSS。
- [ ] 运行 `node --test tests/xiaoke-*.test.cjs`，手工浏览器核查动画和点击。
- [ ] 检查 `git diff --check`；不 push、不 merge。
