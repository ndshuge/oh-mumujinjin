# Supabase Realtime relay canary

This is a narrow, opt-in reverse proxy that preserves the original hosted Supabase project. It is not a new database or an alternate game backend.

## Exposed routes

- GET /health: checks whether the alternate hostname itself is reachable.
- GET /probe/upstream: checks whether Cloudflare Pages can reach the existing Supabase project's health endpoint; a 401 response without an API key counts as *reachable*.
- GET /auth/v1/health: forwards the public health request.
- GET /realtime/v1/websocket: forwards a WebSocket upgrade to the existing hosted Realtime API.
- OPTIONS (preflight) only for the two proxy routes.

Every other path returns 404. Only the GitHub Pages origin is accepted for browser requests. **Origin is not authentication; this canary must not be used with service-role keys.** Public anonymous traffic may consume Supabase and Cloudflare usage quota, so do not expose it as a general-purpose API gateway.

## Deploy

The existing GitHub repository Cloudflare API token is used by the manual GitHub Actions workflow \`.github/workflows/deploy-supabase-relay-canary.yml\`. It creates a separate Pages project (if needed) and publishes \`relay/_worker.js\` as Advanced Mode, with no change to the existing \`mmjj-friends\` Durable Objects Worker.

Expected hostname when deployed:

\`https://mmjj-supabase-relay-canary.pages.dev/health\`

This hostname is **only a candidate**. The old \`workers.dev\` route timed out from a mainland network; \`pages.dev\` might also be unreachable. The goal is to get **real two-device evidence**, not to claim Cloudflare is a mainland service.

Before using this relay for games:
1. Verify /health from both physical mobile networks without VPN.
2. Verify /probe/upstream returns \`upstreamReachable: true\`.
3. Connect two Realtime clients using the relay origin (the public anonymous API key remains unchanged); subscribe and exchange an actual Broadcast.
4. Verify invite, ready, origin, turn, refresh and rematch on two phones.
5. Only after this acceptance should \`MMJJ_SB_CONFIG.url\` point to the relay; the original project URL must remain documented for fallback.

If /health is unreachable from the phones, **do not enable** this relay as default. A domestic reachable hostname or a different regional host is necessary.

## Local tests

\`node --test relay/worker.test.mjs\`

No private Supabase credentials are needed. Never set \`service_role\` or server secrets in browser JavaScript.
