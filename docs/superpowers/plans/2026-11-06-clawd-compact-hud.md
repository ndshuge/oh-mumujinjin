# Clawd 像素螃蟹与角色浮层清理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** 以真实 Claude Code 的 Clawd 像素特征替换小克头像，删除遮住棋盘的角色对话浮层及冗长说明条。
**Architecture:** 自绘轻量 SVG 为唯一角色图片源；原有 game.js 逻辑不变，仅清理状态提示字段；ui-mascot-v8.js 将头像点击改为更新顶部 inline 文本而不打开浮层；隐藏原有 AI banter 的独立布局，保留程序数据。
**Tech Stack:** SVG、HTML、CSS、vanilla JS、Node 自带测试、headless Chrome。
**Spec:** docs/superpowers/specs/2026-11-06-clawd-compact-hud.md

## Steps
- [ ] 新增失败测试：所有头像路径、像素 SVG 特征、无角色展开浮层、无下方说明条、头像点击只更新 inline 气泡。
- [ ] 自绘 120×120 像素螃蟹 SVG；替换 3 个 UI 头像；更新文案及 cache key。
- [ ] 删除 `mascotExpanded` 和常驻状态条，重构 mascot 点击逻辑，保留其他 AI 的顶部消息和原生选项。
- [ ] 运行 Node + 历史回归；修复失败直至通过。
- [ ] 390×844 浏览器端检查首屏、点击头像、布局与棋盘。
- [ ] 检查 origin/main 的发布竞态，安全快进推送并实测 Pages。
