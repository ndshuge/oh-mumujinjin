# 国内好友实时联机 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为现有木木金金棋添加免 VPN 的国内实时联机通道，保持国际版正常。

**Architecture:** 浏览器腾讯云 Chat Meeting 群信令，房主本地权威处理规则并广播完整状态。CloudBase 云函数签发匿名 IM 登录凭证，服务端密钥不入 Git。新通道独立插件，国际 Cloudflare 保持完整。

**Tech Stack:** JavaScript, TencentCloudChat 3.6.7, Node.js crypto, tls-sig-api-v2, GitHub Pages.

**Spec:** docs/CN_REALTIME_DESIGN_20261107.md

## Global Constraints
- 不允许前端保存 IM SecretKey。
- 必须保留国际房间、个人地图、小克 AI。
- 腾讯服务未验证前不得发布为默认中国通道。

## Review Focus
- 未登录、UserSig 失效，提示清晰不自动创建假房间。
- 两人同时发送行动，重复/旧版本必须拒绝。
- 房主刷新重连后能恢复权威快照；好友刷新不丢失对局。
- 过多群组须清理，体验版限制须写明。
- Safari 上第三方 cookies 禁用时依旧通过凭证票据登录。

### Task 1: Chat Provider
- [ ] Write failing tests for create/join, ready, action, reconnect and replay.
- [ ] Implement IM adapter and event bridge.
- [ ] Run green tests and review message-source verification.

### Task 2: Identity API
- [ ] Write failing tests for UserSig credential lifecycle and origin policy.
- [ ] Implement CloudBase signer with stable, authenticated resume ticket.
- [ ] Run auth tests and inspect output for private data.

### Task 3: Integration and SDK bundle
- [ ] Implement dynamic SDK loading and runtime selection.
- [ ] Test existing international room and launcher regression.

### Task 4: Real-service Deployment
- [ ] Open/authorize Tencent IM and CloudBase services.
- [ ] Deploy backend with secrets outside repository.
- [ ] Two-network browser and phone E2E, publish main only on PASS.
