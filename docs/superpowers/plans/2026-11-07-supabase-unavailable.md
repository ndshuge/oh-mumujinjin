# Supabase Unavailable Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Supabase connectivity failures actionable in Chinese without masking unavailable service.

**Architecture:** Reuse existing network diagnostics module for typed, testable user-facing error text, dynamically import only on Supabase create/join errors. Keep Cloudflare, room protocol, and Supabase config unchanged.

**Tech Stack:** Vanilla JavaScript, Node 24 native test runner.

**Spec:** docs/superpowers/specs/2026-11-07-supabase-unavailable-design.md

## Global Constraints
- Production `main` stays untouched pending account verification / mobile E2E.
- Never alter academy data or expose service_role credentials.
- Never conflate local simulated room tests with successful public Supabase connectivity.

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

- [ ] Write failing tests for provider unreachable, missing host, HTTP unauthorized and unknown errors, and dual-path failure recovery hint.
- [ ] Verify RED: `node --test supabase-network-check.test.mjs`.
- [ ] Implement the exported error formatter + append precise recovery guidance to dual-path failure.
- [ ] In `friends-hub.js`, use formatter only on Supabase create/join error catches; ensure non-Supabase remains unchanged.
- [ ] Verify GREEN and existing Supabase, lobby, room and release regressions.
- [ ] Update beta doc with latest project DNS blocker, how to restore and honest test boundary.
- [ ] Commit on isolated feature branch and offer PR; do not merge/deploy until service credentials/access verified.
