# Room Invite + Board Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Direct invitation joining, animated original playing pieces, a visible new-map action, and default domestic Supabase.
**Architecture:** Reuse current friends-hub DOM / game Canvas, preserve transport and rules. Add short-lived RAF only during piece transitions.
**Tech Stack:** Vanilla JS/Canvas, Node native test, browser smoke test.
**Spec:** docs/superpowers/specs/2026-11-07-room-invite-board-polish-design.md

## Global constraints
- Isolated worktree; don't touch user main's dirty files.
- Keep game mechanics, map validation and Cloudflare unchanged.
- Don't use Duolingo proprietary image assets.
- Reduced-motion stops movement animation.
- Mobile and URL network overrides must behave deterministically.

### Task 1: Invitation flow
**Files:** friends-hub.js, index.html, tests/invite-room-ux.test.cjs
- [ ] Write failing tests for valid invite auto-join, error retry, network default, explicit Cloudflare link.
- [ ] Run tests RED.
- [ ] Implement pending room view, safe asynchronous join, failed join retry, and correct state preservation.
- [ ] Run tests GREEN and browser checks.

### Task 2: Canvas piece art and motion
**Files:** game.js, tests/board-motion-ui.test.cjs, index.html
- [ ] Write tests for layered pieces, elapsed-time animation and reduced-motion.
- [ ] Run RED.
- [ ] Implement original illustrated pawn Canvas rendering, spring interpolation with bounded RAF.
- [ ] Run GREEN and game regression tests.

### Task 3: Map center creation entry
**Files:** friends-hub.js, friends-hub.css, tests/map-create-entry.test.cjs, index.html
- [ ] Write failing test for accessible creation button and editor path.
- [ ] Run RED.
- [ ] Implement button opening existing editor with a cleared *draft*, preserving saved maps.
- [ ] Run GREEN + maps test + desktop/mobile smoke.

### Task 4: Release
**Files:** docs/RELEASE_GATE_FRIENDS_20261107.md, index.html
- [ ] Confirm focused tests, full nontraining regression, rendered viewport and Git diff check.
- [ ] Update script version + document test boundaries.
- [ ] Commit changes, push feature branch, create PR, merge/deploy after verification.
- [ ] Confirm GitHub Pages source and script versions.
