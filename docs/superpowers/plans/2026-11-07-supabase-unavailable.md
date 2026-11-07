# Supabase Unavailable Recovery Implementation Plan

## Execution update 鈥?2026-11-07

Completed on isolated branch. The original project was resumed by the owner. The formal diagnostic reports HTTPS and WebSocket healthy; two independent Realtime clients completed room creation, join, ready, start, and first-move synchronization. Remaining acceptance: physical devices, mainland no-VPN network, and production Pages cache/version check after merge.



> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make Supabase connectivity failures actionable in Chinese without masking unavailable service.

**Architecture:** Reuse existing network diagnostics module for typed, testable user-facing error text, dynamically import only on Supabase create/join errors. Keep Cloudflare, room protocol, and Supabase config unchanged.

**Tech Stack:** Vanilla JavaScript, Node 24 native test runner.

**Spec:** docs/superpowers/specs/2026-11-07-supabase-unavailable-design.md

## Global Constraints
- Keep academy data untouched; never expose service_role credentials.
- Distinguish same-host two-client public Realtime E2E from physical-device / mainland no-VPN acceptance.
- Merge and deploy the user-facing diagnostics only after live backend checks pass.

## Review Focus
- Unknown error messages retain meaning and are not swallowed.
- Cloudflare errors are not mislabeled Supabase.
- Missing/paused project is a possibility, not a proven browser-side diagnosis.
- A working websocket and failing HTTPS are not reported as fully working.
- Room not found / host offline remains distinguishable from provider unavailability.

### Task 1: User-facing Supabase failure diagnostics
**Files:**
- Modify: `supabase-network-check.mjs`
- Modify: `supabase-network-check.test.mjs`
- Modify: `friends-hub.js`
- Modify: `docs/SUPABASE_FRIENDS_BETA_20261107.md`

**Interfaces:**
- Export `describeSupabaseRoomError(error)` as a synchronous pure function returning a Chinese string.
- `diagnoseSupabase()` retains shape `{ok,httpsOk,websocketOk,detail}`.

- [x] Write failing tests for provider unreachable, missing host, HTTP unauthorized and unknown errors, and dual-path failure recovery hint.
- [x] Verify RED: `node --test supabase-network-check.test.mjs`.
- [x] Implement the exported error formatter + append precise recovery guidance to dual-path failure.
- [x] In `friends-hub.js`, use formatter only on Supabase create/join error catches; ensure non-Supabase remains unchanged.
- [x] Verify GREEN and existing Supabase, lobby, room and release regressions.
- [x] Update beta doc with latest project DNS blocker, how to restore and honest test boundary.
- [x] Commit on isolated feature branch and offer PR; do not merge/deploy until service credentials/access verified.
