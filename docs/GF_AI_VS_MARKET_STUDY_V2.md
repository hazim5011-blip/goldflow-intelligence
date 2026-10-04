# GF-AI Live versus GF-Market Study — Independent engines v2

## Why
Both options previously called the same legacy evaluateStudy function. Switching the dropdown was not sufficient to change calculated entry, stop and targets. They now use separate decision engines with only shared authenticated Vantage candle/quote input validation.

## Separate methodology
| Component | GF-AI Live / _aiLiveEngine.js | GF-Market Study / _marketStudyEngine.js |
|---|---|---|
| Direction | H1/H4 consensus and verified closed pattern; Gold Macro only when available/complete, with transparent TECHNICAL_ONLY fallback if unavailable | Pivot and continuation structure; H1/H4 must not oppose |
| Confirmation | Closed impulse breakout / engulfing aligned to macro and HTF | Closed supply/demand rejection or support/resistance break and retest |
| Entry | Independent impulse Fibonacci 38.2%-61.8% retracement | Structural pivot reaction zone / retest of broken support or resistance |
| Stop | Pre-impulse structural swing with ATR buffer | Invalidation on swing/zone reclaim |
| Targets | Scenario risk-scaled derivatives | Next swing-liquidity prices; explicit ATR projection where necessary |
| Macro | Verified Gold data raises evidence tier and may veto a contradictory setup; missing data transparently downgrades to technical-only rather than blocking every pair | Contextual explanation only; never determines technical zone |
| News | Official macro observation, impact category; NO made-up release timestamp, forecast or surprise | Optional macro/yields context, never substitute for candle confirmation |
| BTC | Technical-only research using broker data, no invented BTC fundamentals, macro points or price guarantee | Independent technical scenario still available |
| Ready | H1/H4 + closed pattern + quote in independent AI Fib band; verified Gold macro applied only when complete and non-contradictory | Closed structure confirmation + quote within pivot reaction/retest band |

## Operational checks
- The independent engines do NOT call legacy evaluateStudy or call one another.
- API dispatches mode=ai to GF_AI_LIVE_MACRO_MTF_V2 and mode=study to GF_MARKET_STRUCTURE_SCENARIO_V2.
- Same symbol/TF can produce different Entry/SL/TP; they are separately calculated, never duplicated by shared legacy formulas.
- During WAIT, Market Study displays labelled provisional reaction zone, support/resistance, invalidation condition and next-level target projections, NOT a READY instruction.
- Mode switching clears old confirmation/entry/target/marker before the fresh response.
- No broker orders or claims of trained/calibrated ML. Data period is NOT a verified news publication timestamp.
- User must test in Cloudflare TEST before any main branch/Production migration.

## Verification
Run npm test, npm run test:cloudflare, npm run build:cloudflare.
Tests/gf-separate-engines.test.mjs checks independent geometry on identical closed candle inputs, stale ticks fail closed, incomplete Gold macro downgrades AI to documented technical-only research, unverified BTC fundamentals never create full AI READY, and no invented news surprise.
