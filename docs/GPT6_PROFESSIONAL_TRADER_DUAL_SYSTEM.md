# GPT-6 Professional Trading Review — strict dual-project isolation (staging)

## Baselines verified

- GoldFlow Intelligence: PR #37 / `feature/gpt6-safe-research-gateway`, codebase V8.1.4. **Draft / not merged / production unchanged**.
- GF-AAT: `gf-aat-update/stable.json` currently publishes **V1.6.3 R5.17.2**. Do **not** overwrite this manifest/ZIP or update the running GF-AAT source during GoldFlow integration.
- Both use a provider-family AI model, but separate operating identities, data, memory and release gates.

## GoldFlow Professional Review

**Code**: `cloudflare/gpt-professional-review.js`, `gpt-professional-review-ui.js`, Recommended AI page.

1. GPT reads the same per-indicator evidence currently shown by GoldFlow's `recommended-ai/latest.json` archive. It never borrows outcomes from other indicators.
2. GoldFlow model reviews loss frequency, rapid SL, fallback TP frequency, sample coverage and candidate experimental results. **Archive values are historical reconstruction / paper simulation**, not broker fill P/L or proof of causality.
3. GPT returns a structured, timestamped explanation, prioritised next hypothesis and validation requirements.
4. Hard deterministic gate enforces at least **40 completed** and **10 validation** observations before any test recommendation can progress beyond `COLLECT_DATA`. This does **not** grant permission for production changes.
5. Every model review must be written as an immutable private entry under `GF_GPT_REVIEW_R2`. Without R2 the endpoint fails closed **before** paid OpenAI. Existing `GF_FORWARD_R2` and `FORWARD_INGEST_SECRET` are NOT reused.
6. `GET /api/gpt-professional-review?indicator=105` returns that indicator's last reviews for an authenticated owner only. `POST` accepts `{"indicator":"105","tf":"M15"}`, reads the fixed asset and writes R2. Currently the GoldFlow reviewer scope is **XAUUSD247 / M15** because the archived evidence does not yet cover other symbols/TF with verified per-indicator histories.
7. `reviewLevel=INDICATOR_STATISTICAL` and `entryEvidenceAvailable=false` are explicit. Until individual canonical T0 entry / outcome evidence is bound, GPT cannot assert the SL of a specific trade was wrong. This is the next planned extension.
8. `changesApplied=false`, `permissionToChange=false`, `canEnter=false`, `isExecutedTrade=false` are enforced by the server. No auto-editing protected signal engines, trade management params, broker orders or published history.

### GoldFlow deployment prerequisites (Cloudflare PREVIEW ONLY)

- Dedicated OpenAI project **GoldFlow**, `OPENAI_API_KEY` as encrypted Secret, model access/budget verified.
- `GF_GPT_ENABLED=1`, `GF_GPT_REVIEW_ENABLED=1` **only on owner-locked preview after acceptance**. Defaults off.
- `GF_GPT_RATE_KV` dedicated KV for limited requests (not an exact spend ceiling; use Cloudflare WAF and OpenAI billing limits too).
- `GF_GPT_REVIEW_R2` **new private R2 bucket**, never the signal history R2.
- `GF_GPT_ACCESS_TEAM`, `GF_GPT_ACCESS_AUD`, `GF_GPT_OWNER_EMAIL` for validated signed Access JWT owner identity, or optional long admin bearer **server-to-server only**. Never expose key/token via frontend, PR or chat.
- Existing broker named tunnel read-only inputs and vetted source freshness. Do not rotate/modify existing `BROKER_BRIDGE_KEY`.
- Test `node --test tests/gpt-professional-review.test.mjs`, `npm run test:cloudflare`, `npm run build:cloudflare` and private preview. No browser API invocation while status disabled.
- Block production merge until GoldFlow V8 existing regressions and function-count release gate are resolved (tracked in #38).

## GF-AAT Professional Mentor

**Code**: `gf-aat-gpt-review/aat_gpt_review.py` and dedicated Python tests.

- This is **an integration adapter staged outside the current GF-AAT ZIP**, not a released/live GF-AAT feature.
- It refuses GoldFlow sources; requires `project=GF-AAT`, signed local `LOCAL_MT5_ARCHIVE` T0 evidence, profile-specific maturity and verified outcome chronology.
- HMAC `AAT_GPT_EVIDENCE_KEY` is a new *GF-AAT-only* secret; the future local read-only exporter must sign canonical payloads.
- The model uses a separate `AAT_OPENAI_API_KEY` and writes only to an explicitly named `aat_gpt_*.sqlite3` database. It cannot mutate GF-AAT's existing SQLite, canonical T0, learner, SL/TP or trading runtime.
- Reviews post-SL causes, invalidation, entry quality and next-setup checks, but T0 evidence remains unchanged. Identical evidence SHA256 is not re-billed and cannot be stored twice.
- Reviews may suggest `RECOMMEND_TEST` only when enough examples exist, and **never** auto-promote. The exact signal-level evidence, simulation vs broker execution record and uncertainty must remain clear.
- Staged developer test: `python -m unittest discover -s gf-aat-gpt-review/tests -p 'test_*.py' -v`.
- Mandatory before GF-AAT release: audit the actual R5.17.2 stable code, build a local signed snapshot exporter and isolated supervisor, exercise paper/read-only tests, then release using the **existing** `GF_AAT_UPDATE.cmd` with manifest/SHA256/preflight/backup/rollback. Keep `.env`, `.venv`, `data/`, `logs/`, database and current uptime intact.

## Cross-project hard denials

- GoldFlow GPT credentials MUST NOT authenticate GF-AAT; GF-AAT GPT credentials MUST NOT authenticate GoldFlow.
- Never reuse the same SQLite file, R2 binding or vector-memory store.
- Never use GoldFlow's indicator votes as GF-AAT signal/evidence. GF-AAT may use only independent raw MT5 input.
- Never update production, original protected indicators, GF-AAT stable updater, order execution or keys from a model recommendation.
- No performance promises. Evaluate each hypothesis by strict P/L-weighted metrics, worst losses, sample size, realistic spread/slippage and held-out forward evidence.

## Operational status

- Github staged implementation can be audited via PR #37.
- Isolated GPT tests and Cloudflare bundle must pass at the **newest head commit**. Prior green CI does not certify later commits.
- Real paid GPT inference, Cloudflare authenticated preview, signed GF-AAT source exporter and 24/7 production scheduling are **NOT activated**.
- If owner secrets, quotas, Access, data source or archive fail, return `WAIT` / `UNAVAILABLE` / `COLLECT_DATA` with original trading system intact.
