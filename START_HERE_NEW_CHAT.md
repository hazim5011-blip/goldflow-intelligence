# START HERE — GoldFlow Intelligence V8.1.4 Handoff

> **WAJIB untuk chat baru:** Jangan mula semula projek. Baca fail ini dahulu, kemudian sambung daripada state ini sahaja.

## 1) Source of truth

- Repository: `hazim5011-blip/goldflow-intelligence`
- Production branch: `main`
- Production merge commit: `338c3ac212814c94586e728a1799aa2e024890c0`
- Release / handoff branch: `release/v8-1-4-mq5-bridge-recovery`
- Release name: **GoldFlow Intelligence V8.1.4**
- PR merged: **#28 — GoldFlow V8.1.4 — user MQ5 indicators + bridge recovery**
- CI: **PASS** on final feature head `a8c35011d274c99161e9925ac12d33cd4ae6ac54`
- Production deployment: `dpl_9ZP4kmipXDGEBgsSLSNJhEd7Eg8q`
- Production alias: `goldflow-intelligence.vercel.app`
- Vercel state after merge: **READY**

Do not replace the project with a fresh scaffold. Reuse the existing architecture, APIs, UI pages, indicator engines, History Pro and GF-AI modules.

## 2) Core project rules that must not regress

1. **Vantage MT5 broker data is the trading source of truth.**
2. Prefer the exact selected Vantage broker symbol; for Gold the user's preferred reference is **XAUUSD247** when that symbol exists on the connected broker account.
3. Never substitute Yahoo/public spot/TradingView prices as a signal source when the broker source is unavailable. TradingView is reference-only.
4. All trading studies remain **read-only research**. No broker order execution.
5. No fabricated ML probability, no fabricated news surprise, no invented forward publication proof.
6. Closed-candle logic must remain auditable. If TP and SL can both be touched inside one historical candle and intrabar order is unknown, mark it **AMBIGUOUS** rather than inventing the sequence.
7. **A++ / high-conviction does not mean full margin.** Current UI rule is normal-risk only. No martingale/full-margin automation.
8. Do not modify the six protected legacy indicator engine files unless there is an explicit migration plan and tests:
   - `api/_indicator105.js`
   - `api/_indicator103.js`
   - `api/_indicatorPVT102.js`
   - `api/_indicatorPattern132.js`
   - `api/_indicatorSND107.js`
   - `api/_indicatorOWL101.js`

## 3) Current indicators / study modes

Current selectors include:

- MTF Research v1.05
- MTF Research v1.03
- PVT v1.02
- **PVT Chart Confluence XAU v1.01 • MQ5 Source**
- **Pattern Zone Tutor v1.32 • MQ5 core verified**
- SND / SNR / SBR / RBS v1.07
- OWL Style Research v1.01
- Fund Structure A v1.04 — Web Study
- GF-AI Live Analyst v1.60 • Adaptive Entry Intelligence
- GF-News Impact Pro
- GF-Market Study Pro

### 3.1 PVT Chart Confluence XAU v1.01 — source audit

Uploaded source used for audit:

- File: `PVT_Chart_Confluence_XAU_v1.01(1).mq5`
- Lines: **932**
- SHA-256: `3b5da1134a2d7233933b3dfcd74a578d1c23daba2bd2152ca24732de341b362d`

MQ5 source rules that matter to decision/outcome logic:

- Current chart timeframe only.
- SMA 20 / 50 / 100.
- Ichimoku 9 / 26 / 52.
- RSI 14.
- MACD 12 / 26 / 9.
- Momentum 12.
- ATR 14.
- Minimum confluence = 72/100; **not a win probability**.
- Breakout lookback 8.
- Swing lookback 12.
- Cooldown 5 bars.
- Minimum body = 0.18 ATR.
- Maximum distance = 1.80 ATR.
- Stop geometry: minimum 1.35 ATR, maximum 3.50 ATR.
- Default entry mode = **next-bar continuation**, not blind entry on signal close.
- Entry buffer = 0.10 ATR.
- Maximum next-bar gap = 0.60 ATR.
- TP1 = 1.0R.
- TP2 = 1.8R.
- TP3 = 3.0R.
- BE begins at 50% of TP1 distance; lock = +0.05R gross.
- Trailing begins after close beyond TP1; distance = 0.50 TP1, step = 0.10 TP1.
- Maximum holding = 96 bars.
- Historical logic uses closed candles.

Web engine:
- `api/_indicatorPVTChart101.js`
- Mode id: `pvtchart101`
- Routed by `api/analyze.js`
- Included in V8 History/Performance.
- History preserves the PVT v1.01 native management/outcome model instead of replacing it with the generic normalized 1R study replay.
- Tests verify forming candle changes do not alter closed-candle history.

Important limitation:
- The web port focuses on **decision + trade-plan + outcome semantics**. MT5-only visual rendering features such as every original dashboard/drawing object are not automatically equivalent to the MQ5 chart UI.

### 3.2 XAU Pattern Zone Tutor v1.32 — source audit

Uploaded source used for audit:

- File: `XAU_Pattern_Zone_Tutor_v1.32(3).mq5`
- Lines: **2250**
- SHA-256: `8d9c133985da46aec8b02e6387a1dd1f5835b61b459af968e72117209bfd8e10`

Verified source components include:

- Closed-candle signals.
- Bullish/Bearish Engulfing.
- Hammer / Shooting Star.
- Double Top / Double Bottom.
- RBS / SBR.
- Bull/Bear Flags.
- Support/resistance location checks.
- Liquidity sweep checks.
- ATR validation buffers.
- Buy/sell pressure meter using candle/tick-volume context.
- Supply/Demand zones.
- Auto timeframe / higher-timeframe trend context.
- Auto Fibonacci module and MT5 chart drawing/display controls.

Existing protected web engine:
- `api/_indicatorPattern132.js`

Current audit conclusion:
- The existing web engine already contains the **core pattern + RBS/SBR + pressure + Supply/Demand decision logic**.
- **Do not claim full visual source parity yet.** The MQ5 file also has Auto Fibonacci and several MT5 chart/display behaviours that are not fully represented in the protected web engine.
- Next chat should continue the source-parity audit before any modification of the protected Pattern engine.

## 4) History Pro / performance rules already implemented

History Pro currently includes:

- Explicit History Indicator selector.
- Win Rate Setiap Indicator comparison.
- Daily totals in Asia/Kuala_Lumpur.
- WIN PIP.
- SL PIP.
- NET PIP.
- NET POINT.
- Total R.
- Gross USD estimate only when broker contract metadata supports the 0.01-lot calculation.
- PROFIT DAY / LOSS DAY based on net result, not just win count.

Strict WR:
- Positive = TP / trailing / BE positive.
- Negative = SL.
- BE0 and AMBIGUOUS excluded from Strict WR denominator.

Generic History trade-plan rule:
- Every evaluable signal must have Entry + SL.
- If an older native indicator did not define TP, History may use an explicitly-labelled **NORMALIZED STUDY PLAN** with 1R/2R/3R targets. It must never be presented as the native indicator's published TP.

PVT Chart v1.01 is different:
- Its TP/BE/trailing/time-exit logic comes from its MQ5 source semantics and is preserved as native-model history.

GF-AI / GF-News / GF-Market Study:
- Do **not** substitute legacy indicator history to fabricate their win rate.
- If no separate historical/forward outcome archive exists, keep their history WR as N/A.

## 5) GF-AI Live Analyst v1.60 objective

The user does not want an AI that only uses Fibonacci or only H1/H4.

GF-AI direction remains:

- Read all available broker timeframes M1, M5, M15, M30, H1, H4, D1.
- Use market structure, HH/HL/LH/LL, BOS, CHoCH.
- SND / SNR / SBR / RBS.
- Liquidity sweeps.
- Rejection and displacement.
- Breakout / retest / reclaim.
- Momentum and wick behaviour.
- Volatility / ATR.
- Pattern context.
- Multi-timeframe consensus and conflicts.
- Anti-chase entry logic.
- Entry lifecycle: WAIT → WATCH → ENTRY READY → HOLD / PROTECT / CUT / RECOVERY.
- News/macro context is supportive context only when verified; do not fabricate asset fundamentals.
- A++ means high-quality confluence, **not 90% guaranteed**, and remains normal-risk only.

## 6) Red error / bridge diagnosis at V8.1.4 release

The screenshots showed:

- `The origin web server returned an invalid or incomplete response to Cloudflare`
- `This operation was aborted`
- BRIDGE ERROR.

The code-side error handling has been improved:

- `api/_broker.js` classifies timeout as `BRIDGE_TIMEOUT`.
- Tunnel/origin failures are classified as `BRIDGE_TUNNEL_ORIGIN_UNAVAILABLE`.
- Browser UI converts raw abort/Cloudflare messages into readable fail-closed messages.
- Heavy History indicator comparison is serialized to reduce simultaneous broker pressure.
- Health/study/analyze timeouts are bounded to avoid retry storms.

**Important current runtime state at release:**
- Production deployment is READY.
- The local broker transport was still returning **BRIDGE_TIMEOUT** in Vercel runtime logs after deployment.
- Therefore the website code is deployed correctly, but the **actual local MT5 bridge / Cloudflare named tunnel still needs to be alive on the user's PC** before live broker values/signals can return.

Useful recovery files already in repository:
- `bridge/RECOVER_GOLDFLOW_BRIDGE.bat`
- `bridge/START_NAMED_TUNNEL.bat`
- `bridge/START_TUNNEL_HTTP2.bat`
- `bridge/TEST_LOCAL.bat`
- `bridge/SHOW_BRIDGE_KEY.bat`
- `bridge/UPDATE_BRIDGE_V3.bat`
- `bridge/mt5_bridge.py`

Do not mask an offline bridge by showing a public-price fallback as a broker signal.

## 7) V8.1.4 release verification

Final production merge:

`338c3ac212814c94586e728a1799aa2e024890c0`

Final feature head tested:

`a8c35011d274c99161e9925ac12d33cd4ae6ac54`

Final CI job:
- JavaScript syntax: PASS
- Python bridge syntax: PASS
- Macro unit tests: PASS
- V8 unit/policy tests: PASS
- Cloudflare adapter tests/build: PASS
- Protected legacy engines unchanged: PASS
- Vercel Hobby deployable function limit: PASS

Production Vercel:
- Deployment id: `dpl_9ZP4kmipXDGEBgsSLSNJhEd7Eg8q`
- State: READY
- Main production alias: `goldflow-intelligence.vercel.app`

## 8) What to do first in the new chat

1. Read this file completely.
2. Verify repository `hazim5011-blip/goldflow-intelligence`.
3. Start from branch `release/v8-1-4-mq5-bridge-recovery` / production main commit above.
4. **Do not restart the project.**
5. Confirm the user's local MT5 bridge/tunnel is online before judging live signals.
6. Continue the full source-parity audit of `XAU_Pattern_Zone_Tutor_v1.32(3).mq5`, especially Auto Fibonacci/chart-only behaviours, before touching the protected Pattern engine.
7. Validate `PVT Chart Confluence XAU v1.01` against fresh real Vantage candles after the bridge is live.
8. Continue GF-AI intelligence work only after source/data integrity is confirmed.

## 9) User priorities carried forward

- Wants a professional AI market researcher/trader-style analyst, not a simplistic rule that only uses Fibo.
- Wants strong entry quality: structure + liquidity + retest/rejection + MTF context, not blind zone touch.
- Wants every trade-plan to have Entry, SL, TP and lifecycle management.
- Wants daily performance to reflect actual net pip/R, so high win rate cannot hide oversized losses.
- Wants the system to learn/research Gold behaviour from real broker history, not synthetic history.
- Wants XAUUSD247/Vantage as primary Gold reference when available.
- Wants the project preserved and continued, not repeatedly rebuilt from zero.

---
**Canonical handoff:** GoldFlow Intelligence V8.1.4 • generated after PR #28 production merge.
