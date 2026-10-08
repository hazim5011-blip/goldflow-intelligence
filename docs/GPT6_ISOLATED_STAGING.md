# GoldFlow GPT-6 Isolated Research Gateway (Staging Only)

## Scope / audited baseline

- Source: `main` at GoldFlow V8.1.4 (package.json). `release.json` and README contain older release labels; do not downgrade the source to match them.
- Cloudflare Pages advanced Worker: `cloudflare/worker.js`; build: `cloudflare/build.mjs`.
- MT5 Vantage bridge: `bridge/mt5_bridge.py` exposes `/multi-bars`, `/bars`, `/health` behind its bridge secret and named tunnel.
- Native indicator engines, GF-AI, Market Study, Recommended AI, /api/analyze, /api/macro, /api/status, forward ledger, R2 and other routes are unchanged.

## New isolated surface

- Cloudflare-only `GET /api/gpt-research` (non-billable status) and `POST /api/gpt-research` (owner-only analysis).
- The route is disabled unless `GF_GPT_ENABLED=1`.
- Uses `gpt-6-sol` as the default OpenAI Responses API model. Model availability/usage limits must be verified on the owner's own API project before enabling.
- Inputs: only exact `XAUUSD247` symbol, requested M5/M15/M30/H1/H4 timeframe, broker tick/bid/ask and closed candles from the existing named Vantage bridge. No browser-provided candles or arbitrary URL.
- Refuses unavailable/offline/stale tick, insufficient closed candles, invalid broker UTC offset and invalid model output with `WAIT`/error; never invents a generic spot substitute.
- Fundamental feed is declared **UNAVAILABLE** in V1. GPT cannot claim verified macro data; add a separately vetted and timestamped fundamentals adapter in a later stage.
- The result is `WATCH_BUY`/`WATCH_SELL`/`WAIT` **research only**; `canEnter=false`, `isExecutedTrade=false`. There are no executable entry/SL/TP fields or order pathways.
- No broker operations, persistent storage writes, legacy trading logic modifications, or changes to other websites/robots.

## Safe secret setup — Cloudflare Pages preview only

Use Pages dashboard > Settings > Variables and Secrets. Never commit/paste secrets into GitHub, frontend code, the browser console, or ChatGPT.

1. `OPENAI_API_KEY`: *new dedicated OpenAI Platform API key*, stored as encrypted **Secret** with restrictive project budget.
2. `GF_GPT_ADMIN_TOKEN`: *new random >= 32-character* private token, stored as encrypted **Secret**. This is for server-to-server/admin callers only; **never embed it in frontend JavaScript**.
3. `BROKER_BRIDGE_KEY`: existing encrypted Cloudflare Vantage bridge secret. Do not change/rotate this as part of GPT setup.
4. `VANTAGE_TICK_UTC_OFFSET_SECONDS`: only use the verified Vantage server offset; never guess if broker server clock changes.
5. `GF_GPT_MODEL`: `gpt-6-sol` or another audited GPT-6 model allowed in code. If model is not available, the route fails closed.
6. `GF_GPT_ENABLED`: keep absent / `0` until secrets, spend cap, private access and broker clock have been verified. Then set `1` on **isolated preview** only.

A strong owner token controls who can initiate billable OpenAI requests; a public page must **not** call this private endpoint directly. Before introducing a public-facing GPT panel, add Cloudflare Access or authenticated backend proxy, durable rate limiting, per-user quotas, abuse protection, caching and billing monitoring. The feature must not be deployed public and enabled without these controls.

## Verify without live mutation

- `npm test` — includes `tests/gpt-research.test.mjs`; all fixtures are synthetic for tests only (never displayed as live broker quotes).
- `npm run test:cloudflare`
- `npm install --no-audit --no-fund && npm run build:cloudflare`
- Confirm existing Cloudflare API routes still work and old indicator files have not changed.
- `GET /api/gpt-research` should return `enabled:false` before activation and must incur no API calls.
- `POST /api/gpt-research` without credentials returns `503` while disabled, or `401` when enabled.
- With owner authentication and valid live Vantage data, check source, quote freshness, closed MTF timestamps, model response validity, and that no orders or legacy signal updates occur.
- Fail closed on weekends, missing data, tunnel outage, stale tick, model error, budget exhaustion or permission failure.
- Observe cost, rate-limit and latency in the dedicated OpenAI project before permitting sustained use.

## Example admin-only request (do not use from frontend)

```powershell
# $env:GF_GPT_ADMIN_TOKEN is provided privately in your own terminal
$body = @{ symbol = 'XAUUSD247'; tf = 'M15' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'https://YOUR-PREVIEW-HOST/api/gpt-research' \
  -Headers @{ Authorization = 'Bearer ' + $env:GF_GPT_ADMIN_TOKEN } \
  -ContentType 'application/json' -Body $body
```

## Deployment policy

**DO NOT MERGE or deploy production by default.** Use draft PR, CI and private preview inspection. Do not activate API billing without owner’s private key setup. Roll back by removing `GF_GPT_ENABLED` from the preview Worker; existing signal engines are unaffected.
