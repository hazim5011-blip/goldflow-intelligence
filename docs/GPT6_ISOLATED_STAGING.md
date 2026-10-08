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
- Fundamental feed is **UNAVAILABLE by default**; set `GF_GPT_INCLUDE_MACRO=1` on verified preview to use the existing GoldFlow official macro pipeline. Only dated, sourced, non-stale OFFICIAL or explicitly flagged SECONDARY_MIRROR observations reach GPT; derived scores remain labelled derived.
- Recent publisher headlines are also **UNAVAILABLE by default**. Set `GF_GPT_INCLUDE_NEWS=1` on preview to use the existing GoldFlow news pipeline: source-linked, dated RSS headlines (<=48 hours), explicitly **headline-only** and never claimed as confirmed article content. No synthetic news.
- The result is `WATCH_BUY`/`WATCH_SELL`/`WAIT` **research only**; `canEnter=false`, `isExecutedTrade=false`. There are no executable entry/SL/TP fields or order pathways.
- A separate **GPT Research** dashboard tab and `gpt-ui.js` are present. The browser uses only the signed Cloudflare Access session; it never reads OpenAI/admin/bridge keys.
- No broker operations, signal archive writes, legacy trading logic modifications, or changes to other websites/robots. The only new writes are cost-quota counters in a dedicated KV binding.

## Safe secret setup — Cloudflare Pages preview only

Use Pages dashboard > Settings > Variables and Secrets. Never commit/paste secrets into GitHub, frontend code, the browser console, or ChatGPT.

1. `OPENAI_API_KEY`: *new dedicated OpenAI Platform API key*, stored as encrypted **Secret** with restrictive project budget.
2. `GF_GPT_ADMIN_TOKEN`: *optional new random >= 32-character* private token, stored as encrypted **Secret** for server-to-server diagnostics only; **never embed it in frontend JavaScript**. Browser sign-in must instead use signed Cloudflare Access.
3. `BROKER_BRIDGE_KEY`: existing encrypted Cloudflare Vantage bridge secret. Do not change/rotate this as part of GPT setup.
4. `VANTAGE_TICK_UTC_OFFSET_SECONDS`: only use the verified Vantage server offset; never guess if broker server clock changes.
5. `GF_GPT_MODEL`: `gpt-6-sol` or another audited GPT-6 model allowed in code. If model is not available, the route fails closed.
6. `GF_GPT_ACCESS_TEAM`: Cloudflare Zero Trust team subdomain **slug** (example `myteam` for `https://myteam.cloudflareaccess.com`), **not** the full URL.
7. `GF_GPT_ACCESS_AUD`: exact Cloudflare Access application AUD (Audience Tag). Configure an Access application/policy restricted to owner identity for `/api/gpt-research` on the exact preview hostname. The Worker independently verifies RS256 JWT signature, issuer, audience and expiry.
8. `GF_GPT_RATE_KV`: bind a **new isolated Cloudflare KV namespace**. This is required; without it POST fails closed and incurs no OpenAI charge.
9. `GF_GPT_DAILY_LIMIT`: e.g. `12`; bounded to 1–30. KV applies approximately 90-second cooldown plus per-identity daily quota. **KV is eventually consistent**; also configure WAF rate limits, OpenAI project spend alerts/limits and authenticated Access policy for production-hard enforcement.
10. `GF_GPT_INCLUDE_MACRO`: optional `1` only after provider freshness and official sourcing verification. Default disabled/unavailable.
11. `GF_GPT_INCLUDE_NEWS`: optional `1` to include timestamp-checked live publisher RSS headlines only; missing/stale feed is disclosed. Default off.
12. `GF_GPT_ENABLED`: keep absent / `0` until secrets, project budget, Access, KV and broker clock have been verified. Then set `1` on **isolated preview** only.

The owner browser must use a valid **signed Cloudflare Access JWT**, verified on the Worker against the team JWK URL and configured AUD. The public static tab does not grant API access. An owner service bearer token is an alternate **server-to-server only** mechanism. The `GF_GPT_RATE_KV` counters are approximate, not hard economic guarantees; enforce Access, WAF and API project budget limits outside the Worker before rollout. If Access/team/AUD is absent, normal browser POST is always denied.

## Verify without live mutation

- `node --test tests/gpt-research.test.mjs tests/gpt-access.test.mjs tests/gpt-dashboard.test.mjs tests/gpt-news.test.mjs` — isolated security, browser and protocol tests; synthetic fixtures are test-only. Run `npm test` separately; its existing failing legacy assertions must be audited without weakening existing guards.
- `npm run test:cloudflare`
- `npm install --no-audit --no-fund && npm run build:cloudflare`
- Confirm existing Cloudflare API routes still work and old indicator files have not changed.
- `GET /api/gpt-research` should return `enabled:false` before activation and must incur no API calls.
- `POST /api/gpt-research` without verified signed Access JWT / service token returns `503` while disabled, or `401` when enabled. No browser token in code.
- With owner authentication and valid live Vantage data, check source, quote freshness, closed MTF timestamps, model response validity, and that no orders or legacy signal updates occur.
- Fail closed on weekends, missing data, tunnel outage, stale tick, model error, budget exhaustion or permission failure.
- Observe cost, rate-limit and latency in the dedicated OpenAI project before permitting sustained use.

## Example admin-only request (do not use from frontend)

```powershell
# Set GF_GPT_ADMIN_TOKEN privately in your terminal, never in the website JS.
$body = @{ symbol = 'XAUUSD247'; tf = 'M15'; question = 'Kaji struktur dan risiko Gold.' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'https://YOUR-PREVIEW-HOST/api/gpt-research' -Headers @{Authorization = 'Bearer ' + $env:GF_GPT_ADMIN_TOKEN} -ContentType 'application/json' -Body $body
```

## Deployment policy

**DO NOT MERGE or deploy production by default.** Use draft PR, CI and private preview inspection. Do not activate API billing without owner’s private key setup. Roll back by removing `GF_GPT_ENABLED` from the preview Worker; existing signal engines are unaffected.

## Remaining live activation blockers (user-owned accounts)

- The connected GitHub account cannot create or inspect Cloudflare Access policies, KV namespaces or encrypted Cloudflare secrets; these must be configured privately by the site owner.
- ChatGPT Plus is not an OpenAI API subscription. An owner must finish the dedicated OpenAI Platform key setup and set spend controls. No key is committed, collected or exposed in this PR.
- No live GPT inference or signed owner browser session has been verified yet; local mocked calls are not evidence of a working paid API integration.
- Base V8 legacy regression failures and the existing Vercel function-count guard must be resolved/audited separately. Do not tamper with native indicator trade logic to make GPT pass.
- If a preview fails, disable by setting `GF_GPT_ENABLED=0`. Existing signal features continue untouched.
