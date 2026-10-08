# Recommended AI — Mandatory Pre-Update Gate

GoldFlow V8.1.4 treats the **Recommended AI** archive as the first review point before changing an indicator or its managed trade profile.

## Mandatory rule

Before any future GoldFlow indicator / Dynamic ATR + Structure update:

1. Read `/recommended-ai/latest.json`.
2. Review the target indicator's most recent loss diagnosis, P/L-weighted Strict WR, NET PIP, quick-stop rate, target-fallback rate and shadow candidates.
3. Check whether Recommended AI says `COLLECT_DATA`, `KEEP_CURRENT`, `RECOMMEND`, `AUTO_PROMOTE_READY`, or `ROLLBACK_READY`.
4. Preserve the indicator's native/protected signal engine unless a separate source-parity change is explicitly justified and tested.
5. Never use another indicator's outcomes as a substitute for the target indicator.

## Autonomous scope

Recommended AI may autonomously promote **only symbol-scoped Dynamic ATR + Structure management parameters** after its minimum-sample and out-of-sample gates pass. It does not auto-edit protected/native indicator signal code.

Current automatic gate:
- minimum 40 completed positive/negative signals in the available study window;
- minimum 10 validation signals;
- validation P/L Strict WR >= 52%;
- at least +4 percentage-point P/L Strict WR improvement;
- NET PIP improvement of at least max(10 pip, 10% of baseline magnitude);
- loss magnitude may not worsen by more than 5%;
- validation and full-window evaluated-signal coverage must remain at least 95% of baseline;
- 72-hour promotion cooldown;
- rollback eligibility after at least 12 post-promotion signals if Strict WR < 42% and NET PIP is negative.

## 24H scheduler

The GitHub Actions learning heartbeat runs hourly. Indicator groups rotate so every configured indicator is revisited within about four hours. XAUUSD247 / M15 is the first persistent learning stream. Other symbol/TF/indicator combinations can be studied on demand from the Recommended AI page without borrowing XAU results.

No broker orders are placed by Recommended AI.


## Internet Research Brain

Recommended AI now has a separate Internet Knowledge Scout.

Rules:
- public internet evidence is research input, never a broker price substitute;
- XAUUSD247/Vantage candles remain the trading and validation source of truth;
- official/primary feeds are preferred and each feed records OK/error status;
- discovery/news items retain source URLs and timestamps;
- internet evidence may not directly change protected/native indicator code;
- model-generated internet hypotheses may only propose bounded Dynamic ATR + Structure parameters;
- every internet-derived candidate must pass the same Vantage shadow replay, held-out validation, NET PIP, loss magnitude and >=95% coverage gates before promotion;
- research memory is persisted under `/recommended-ai/research/`.

The free evidence scout works without an AI API key. A reasoning model with built-in web search is optional and activates only when `OPENAI_API_KEY` is configured. `RECOMMENDED_AI_MODEL` can override the configured model. Without a key, the UI must report `OFFLINE_NO_OPENAI_API_KEY` rather than pretending model reasoning is active.

The Internet Brain runs every four hours while the existing outcome-learning brain continues hourly.
