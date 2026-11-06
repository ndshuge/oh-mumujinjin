# 小克正式角色和首屏稳定性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** 把小克接进游戏角色与默认选择，保留待接模型状态，并修复双指缩放/错误默认头像/空白棋盘。
**Architecture:** 保持现有 vanillajs 游戏，引擎独立；旧存档校验落在 game.js 的 load 入口，等待模型用特殊 phase 和明显说明，人物外观复用 ui-mascot-v8.js，并在 viewport-guard.js 隔离手势处理。
**Tech Stack:** HTML/CSS/JS + Node24 tests + Chrome DevTools Protocol; no external dependencies.
**Spec:** docs/superpowers/specs/2026-11-06-xiaoke-integration.md

## Tasks
- [ ] Task 1: 写首屏/损坏存档/角色接入/视口保护失败测试，运行确认失败（浏览器 CDP）。
- [ ] Task 2: 校验旧存档，备份异常内容，恢复有效的新状态；验证空棋盘恢复。
- [ ] Task 3: 给小克添加 AI selector、默认引导/待接锁定流程；保证中迪小迪有正常路径。
- [ ] Task 4: 整合小克头像、符号台词到游戏角色 HUD，删除首次木木闪现；验证。
- [ ] Task 5: 禁止双指缩放但允许单指滚动，测试移动端小屏截图。
- [ ] Task 6: 完整复查并独立提交；检查并行发布工作树/remote main，若不安全则保留分支，绝不覆盖其他工作。

## Review focus
- 旧存档应保留真正进行中的对局；破损存档转安全首屏。
- 未加载 XiaoKe 引擎时不得调用 zhongdiChooseAction 替代小克，也不可让用户开始无法完成的对局。
- 首屏 HTML、脚本初始化、CSS 必须一致，不出现小白/木木错误头像闪现。
- 不阻止一指滚动、游戏正常按钮点击或浏览器辅助功能。
- 多个并行分支中必须保留当前远端 main 的更改。