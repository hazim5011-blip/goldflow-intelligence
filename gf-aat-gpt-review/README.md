# GF-AAT GPT-6 Professional Trader Mentor — isolated staging adapter

**This is NOT yet installed in GF-AAT stable release.** The canonical stable manifest currently shows `1.6.3-r5.17.2`. The owner must use `GF_AAT_UPDATE.cmd` for official updates. Do not manually copy this experimental folder into live GF-AAT or update `stable.json`.

## Purpose

This is an independent AI research mentor that analyses a GF-AAT immutable T0 event snapshot, optional POST_OUTCOME, and sample maturity data. Output includes:
- BUY/SELL/WAIT thesis critique, market structure and liquidity context (if present in evidence);
- entry quality, SL invalidation, TP feasibility, ATR and technical contradictions;
- fundamental/news uncertainty (never fabricate missing feeds);
- per-profile post-SL forensic lesson and next-setup checklist;
- `KEEP_CURRENT`, `COLLECT_DATA`, `RECOMMEND_TEST`, `BLOCK_SETUP`, always **research-only**.

**No automatic signal replacement, SL/TP edits, GF-AAT canonical database writes, or MT5 trading calls.**

## Hard isolation

| Resource | GF-AAT Mentor | GoldFlow Professional Review |
|---|---|---|
| AI API project | Dedicated GF-AAT OpenAI project | Separate GoldFlow project |
| Key name | `AAT_OPENAI_API_KEY` | Cloudflare `OPENAI_API_KEY` |
| Research memory | Dedicated `aat_gpt_*.sqlite3` | GoldFlow-only R2 `GF_GPT_REVIEW_R2` |
| Provenance | GF-AAT canonical event and HMAC signed T0 evidence | GoldFlow Recommended AI exact-indicator archive |
| Permissions | Offline local snapshot reader | Cloudflare owner Access JWT |
| Update/release | Future GF-AAT stable updater only | Separate GoldFlow PR and Cloudflare preview |

### Standalone staging contract

`aat_gpt_review.py` accepts only signed snapshots from a future GF-AAT internal read-only adapter. Required fields:
- `project="GF-AAT"`, `source="LOCAL_MT5_ARCHIVE"`, `sourceIntegrity="VERIFIED_CLOSED_CANDLE"`
- `profile` SCALPING, DAY, SWING or POSITION
- `canonicalEventId`, `publishedAtUTC` (timezone explicit), `brokerServer`, `symbol`
- `snapshotKind` T0_DECISION or POST_OUTCOME; outcome, if present, must have valid closedAtUTC and supported status
- `t0Evidence` structure, timeframe, original invalidation; `maturity.completed` and `validationCompleted`
- `signatureHmac` SHA256 HMAC computed over canonical sorted JSON **excluding** the signature, using a 32+ byte independent secret `AAT_GPT_EVIDENCE_KEY`.

This signature must be created **inside the local GF-AAT read-only export service**, not in a public browser. For production, use a deliberately provisioned dedicated secret, protect local app loopback authorization, and consider limiting snapshot event IDs to the actual canonical database.

A free-form screenshot, unsourced user input or GoldFlow recommendation cannot be used as signed GF-AAT evidence.

### Safety controls

1. `AAT_GPT_ENABLED` defaults off; no API call unless `1`.
2. `AAT_OPENAI_API_KEY` must exist, separate from GoldFlow's key.
3. `AAT_GPT_EVIDENCE_KEY` is required and independent; no unsigned evidence.
4. Model is allowlisted; default `gpt-6-sol` and must be supported by owner's API project.
5. SHA256 of source evidence prevents duplicate charges on identical snapshots.
6. The SQLite audit is append-only; no writes to old GF-AAT canonical event, market data, learning databases, or logs.
7. Fewer than 40 completed outcomes OR fewer than 10 out-of-sample validation outcomes => any model `RECOMMEND_TEST` is forced to `COLLECT_DATA`.
8. No EA/MT5 order execution, no parameter self-promotion, no code rewrite; proposed changes need out-of-sample/shadow/forward evaluation and versioned manual release.

### Offline developer acceptance

```bash
python -m unittest discover -s gf-aat-gpt-review/tests -p 'test_*.py' -v
```

`--dry-run` validates an existing verified JSON snapshot, but does not call OpenAI or change a DB. No live evidence snapshot is included in the repo because generated examples would not establish genuine broker provenance.

### Remaining GF-AAT production integration work

- Obtain/inspect the exact **R5.17.2 stable ZIP and local source**. The GitHub stable ZIP is a binary and was not downloaded as part of this review.
- Build an internal read-only export endpoint from canonical `T0` and appended outcomes with event-level hash and HMAC signing. Never rewrite T0 using later candles.
- Add distinct local Windows service/supervisor config with its own health checks, timeouts and dollar-denominated API spend controls. No automatic GPT calls per tick.
- Introduce a GF-AAT `Professional Mentor Recommendations` tab with per-profile saved reviews and timestamps.
- Run broker-data, multi-asset, disconnected/closed-market and fault-injection testing against the installed local instance without touching positions.
- Publish **only after tests pass** via original `GF_AAT_UPDATE.cmd` stable channel (backup/preflight/SHA256/health/rollback). Keep the user's `.env`, `.venv`, `data/`, `logs/`, old learning SQLite and the updater untouched. Do not release this experimental folder as a stable package by itself.
