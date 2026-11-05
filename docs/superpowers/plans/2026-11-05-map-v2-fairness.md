# Map V2 Fairness & AI Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task with red/green tests.

**Goal:** Competitive seed-reproducible map generator with symmetric terrain benefits, rule checks and read-only AI compatibility probe.
**Architecture:** Keep original randomMap algorithm immutable for r1 links. Add generateBalancedMap using rotational symmetry and current validateMap/mapMetrics. Bridge frozen/public AI to authoritative V2 engine for diagnostic games only.
**Tech Stack:** Vanilla JS and Node VM, existing map-v2 regressions.
**Spec:** docs/superpowers/specs/2026-11-05-map-v2-fairness.md

## Global Constraints
- 9×13, camps, wall rules and special movement semantics unchanged.
- Unmodified research workspaces G5/B/C/GPT and no AI training.
- Old map version/links, exact seed replay and fingerprints unchanged.
- Match evaluation swaps seats; do not claim true 50% from finite tests.
## Review Focus
- Odd counts and impossible terrain totals reject without infinite retries.
- Portal pairs must preserve symmetry of connections, not just endpoint positions.
- Gold/wood all three start cells must have real exits in both variants.
- No map cache or inherited engine terrain from older maps.
- User custom maps remain editable, unrestricted by competitive symmetry.
---
### Task 1: Baseline diagnostic
- [ ] Read current authoritative rules + frozen public AI API; run baseline tests.
- [ ] Capture existing fairness metrics and whether 12-step gap passes skewed maps.
### Task 2: Balanced generator
- [ ] Add failing tests for rot180 rock/ice/boost + portal endpoint pair edge set, reproducibility, constraints.
- [ ] Implement generateBalancedMap with deterministic PRNG, bounded attempts and fallback error only.
- [ ] Wire new mode into user-facing random entry without overwriting legacy Map V2 generator.
- [ ] Run targeted + 12 old regressions; commit.
### Task 3: AI bridge and action legality
- [ ] Add zero-write diagnostic VM shim with live terrain and authoritative rules.
- [ ] Test local search and PUCT / frozen available models on 2 maps swapped seats.
- [ ] Report missing adapters for isolated B/C/GPT instead of modifying them.
### Task 4: Quality and delivery
- [ ] Benchmark 1000 balanced maps; track rejection, path parity, startup mobility, terrain utility and replays.
- [ ] Run swapped-seat matches, report win/draw metrics with limitations.
- [ ] Run full regression, commit only isolated fairness branch, leave production/other groups untouched.