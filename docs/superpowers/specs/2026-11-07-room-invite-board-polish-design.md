# Room invite and polished board — 2026-11-07

## Chosen approach
A staged, compatible frontend release with no rules or backend schema change. Gameplay is kept intact. Original illustrated pieces and elastic transitions are inspired by Duolingo Chess's readability, soft shading and microinteractions; do not copy Duolingo's proprietary sprites/character art.

1. **Invitation** — valid `?room=CODE&net=sb|cf` automatically opens the room waiting view and joins without another tap; while joining, show a pending message, disabled actions, and retry on failure. Explicit `net=cf` overrides default Supabase; malformed codes remain visible with an actionable error. Preserve deep link on refresh. Host readiness/start disabled until server state arrives.
2. **Board** — Canvas retains exact logical coordinates and move handling. Render original layered, rounded gold/wood playing pieces using gradients, highlights, soft cast shadows, facial/symbol details and spring motion. Animate from prior *visible positions* when actual state changes, only for <= 250ms. Support prefers-reduced-motion, don't animate edits, avoid continuous idle loops, respect 720x980 coordinate system, no expensive filters.
3. **Map center** — add prominent “创建地图” above map filters. Starts an isolated draft in existing Map Workshop and clears all editable layers only after editor opens, preserving fixed camps and existing saved maps. Name/save via existing editor, then list via existing shared storage.
4. **Network default** — Supabase selected on regular entry; an explicit valid invite URL's `net` wins. No VPN-free guarantee until real mainland devices tested.

## Non-goals / risk
No server authority migration here. The host remains rules authority; host closing the page still stops the game. Long-term migration to server-authenticated persistent snapshots is a separate backend project (Supabase Edge Functions + database auth/RLS or equivalent) and requires security/reliability review.
Before publishing, verify desktop + iPhone viewport, no broken gameplay, no interference from concurrent training work. Use an isolated worktree; don't overwrite user's uncommitted main changes.
