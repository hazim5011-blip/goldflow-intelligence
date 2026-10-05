# GoldFlow Smart Quant Trading Website — Architecture Blueprint

Status: R&D blueprint only. No production trading behavior is changed by this document.

## 1. Objective

Evolve GoldFlow from a signal/research dashboard into a smart market-research system that can:

1. ingest broker-native MT5 data and external macro/market context,
2. classify the current market regime,
3. estimate a calibrated directional probability / fair-value edge,
4. pass candidates through a transparent decision funnel,
5. size risk conservatively using capped fractional / risk-constrained Kelly logic,
6. simulate drawdown and ruin risk with Monte Carlo,
7. publish evidence for every BUY / SELL / WAIT / INVALID decision,
8. learn from forward outcomes only after validation, without self-modifying live rules blindly.

The system remains research/education-first. It must never present historical reconstruction as a live executed trade.

---

## 2. Existing GoldFlow foundation to preserve

Current production repository already contains:

- Vantage MT5 -> bridge -> Cloudflare -> Vercel data path.
- Broker-native symbol catalog and candles.
- MTF research engines including 1.05, 1.03, PVT, Pattern132, SND107, OWL and Fund104 web-study subset.
- History Pro and strict outcome accounting.
- Evidence reconstruction and authenticated forward-ledger foundation.
- Performance analytics.
- Macro & News Study.
- TradingView reference widgets.
- 22 locale packs.
- Broker timestamp normalization and provenance checks.
- Unit tests protecting outcome, history, evidence and time-normalization behavior.

These are the base layer. New intelligence must be additive and must not bypass current provenance rules.

---

## 3. Target architecture

```
VANTAGE MT5 / XAUUSD247
        |
        v
Broker Data Integrity Layer
        |
        +--------------------+
        |                    |
        v                    v
Technical / MTF Engine   Macro / Flow Engine
        |                    |
        +---------+----------+
                  v
          Market Regime Engine
                  |
                  v
          Fair Value / Edge Engine
                  |
                  v
       Probability Calibration Layer
                  |
                  v
            Decision Funnel
                  |
        +---------+----------+
        |                    |
      WAIT              EXECUTION-READY
                             |
                             v
                    Risk & Sizing Engine
                             |
                             v
                  Monte Carlo / Ruin Engine
                             |
                             v
                     Evidence Publisher
                             |
                             v
                       Forward Ledger
                             |
                             v
                   Learning / Review Layer
```

---

## 4. Market Regime Engine

Do not rely on a branded label such as "Harvey" unless the exact method is implemented and documented.

GoldFlow regime classes:

- TREND_BULL
- TREND_BEAR
- RANGE
- HIGH_VOLATILITY
- LOW_LIQUIDITY
- LIQUIDITY_SWEEP
- BREAKOUT_EXPANSION
- NEWS_SHOCK
- RISK_OFF_SAFE_HAVEN
- USD_YIELD_DOMINANT
- MIXED_CONFLICT

Suggested inputs:

- ATR percentile / realized volatility
- ADX / EMA slope / structure
- BOS / CHoCH state
- distance from rolling VWAP / value area where available
- DXY direction
- US2Y / US10Y direction
- real-yield direction
- event/news impact state
- session and liquidity window
- broker spread / quote freshness

Output must include:

- regime
- confidence
- supporting factors
- opposing factors
- data freshness
- regime change timestamp

---

## 5. Fair Value / Edge Engine

Purpose: move from "indicator says BUY" to "market evidence implies a measurable directional edge."

For XAUUSD, fair value should be a research score, not a fake exact dollar valuation.

Inputs can include:

- XAUUSD247 broker price behavior
- DXY
- US2Y
- US10Y
- real yields
- gold futures context where licensed/available
- volatility
- positioning / COT at the appropriate weekly frequency
- ETF / demand context at the appropriate low frequency
- geopolitical / macro event state
- technical structure and liquidity

Example normalized model:

```
macroScore      [-1, +1]
structureScore  [-1, +1]
liquidityScore  [-1, +1]
momentumScore   [-1, +1]
regimeFit       [ 0,  1]
executionScore  [ 0,  1]
```

A directional edge is then estimated with weights that are learned only from validated historical/forward samples.

No fixed weight is considered "truth" until validated out-of-sample.

---

## 6. Probability Calibration

Raw indicator scores such as 85/100 must NOT be shown as "85% win probability."

Required process:

1. produce raw model score,
2. map score to predicted probability,
3. calibrate on out-of-sample / forward data,
4. maintain reliability bins,
5. report sample size and calibration error.

Dashboard should show:

- Model confidence: 82/100
- Calibrated probability: 64%
- Historical sample: 1,240 comparable setups
- Reliability status: GOOD / WEAK / INSUFFICIENT
- Brier / log-loss trend where applicable

If sample size is insufficient, show "UNVERIFIED PROBABILITY" instead of a precise percentage.

---

## 7. Decision Funnel

Every candidate must pass explicit gates.

Example:

```
100 observations
 -> 34 structural candidates
 -> 18 MTF-valid
 -> 10 regime-compatible
 -> 7 macro-compatible
 -> 4 liquidity-valid
 -> 3 execution-quality pass
 -> 1 execution-ready
```

Primary gates:

1. DATA_VALID
2. STRUCTURE_VALID
3. MTF_VALID
4. REGIME_VALID
5. MACRO_VALID
6. LIQUIDITY_VALID
7. NEWS_RISK_VALID
8. ENTRY_QUALITY_VALID
9. RISK_VALID
10. EXECUTION_READY

A rejected candidate must carry a machine-readable reason code such as:

- WAIT_HTF_CONFLICT
- WAIT_MACRO_CONFLICT
- WAIT_NEWS_RISK
- WAIT_SPREAD_ABNORMAL
- WAIT_LOW_SAMPLE_CONFIDENCE
- WAIT_REGIME_MISMATCH
- INVALID_LIQUIDITY_SWEEP_FAILED
- INVALID_STRUCTURE_BREAK

---

## 8. Risk & Position Sizing

Do not use full Kelly for retail leveraged gold trading.

Use a conservative risk budget:

- hard max risk per setup,
- fractional Kelly or risk-constrained Kelly as a secondary limiter,
- drawdown-based risk reduction,
- news-event risk reduction,
- correlation/exposure cap,
- max daily loss / max consecutive-loss lock.

Conceptual sizing:

```
riskBudget = min(
  hardRiskCap,
  fractionalKellyCap,
  drawdownAdjustedCap,
  eventAdjustedCap
)
```

The website should report the risk suggestion separately from any broker order function.

---

## 9. Monte Carlo / Ruin Engine

Inputs:

- calibrated win probability
- payoff distribution in R
- spread/slippage model
- loss-tail assumptions
- regime-specific variance
- current risk fraction
- sample uncertainty

Outputs:

- expected 100-trade range
- probability of 5%, 10%, 20% drawdown
- probability of N consecutive losses
- expected max drawdown
- risk-of-ruin proxy
- percentile equity paths
- stress scenario under degraded edge

Simulation must use distributions derived from validated data, not invented fixed win/loss numbers.

---

## 10. Progressive Confidence / Exposure

Borrow the useful concept from high-frequency probability systems without copying prediction-market mechanics.

GoldFlow behavior:

- early evidence -> OBSERVE
- partial confluence -> WATCH
- valid setup -> READY
- entry zone reached + confirmation -> LIVE RESEARCH SETUP
- confidence deteriorates -> DOWNGRADE / INVALID

Do not automatically increase real-money lot size simply because confidence rises.

For future broker-execution modules, require separate opt-in risk controls and independent safety limits.

---

## 11. Macro & Flow Layer for Gold

Short-horizon drivers:

- DXY
- US2Y
- US10Y
- real yield
- volatility / risk sentiment
- scheduled high-impact events
- broker-native price reaction

Medium/slow drivers:

- CME gold futures context
- CFTC COT positioning
- ETF flows
- central-bank / demand context
- World Gold Council demand research

Frequency must be respected. Weekly COT data must not be presented as a live tick signal.

GoldFlow should distinguish:

- LIVE
- INTRADAY
- DAILY
- WEEKLY
- PERIODIC

for every external data source.

---

## 12. Evidence Engine

Every BUY / SELL / WAIT decision should be reproducible.

Evidence object:

```
{
  signalId,
  publishedAtUTC,
  brokerSource,
  symbolResolved,
  triggerTF,
  setupTF,
  biasTF,
  priceSnapshot,
  regime,
  macroSnapshot,
  structureSnapshot,
  liquiditySnapshot,
  probability,
  calibrationSample,
  decisionFunnel,
  riskSnapshot,
  reasons[],
  invalidation,
  engineBuildHash
}
```

Historical reconstruction must continue to be labelled separately from forward-published proof.

---

## 13. Self-Learning / Review

No uncontrolled live self-modification.

Safe workflow:

```
forward decision
 -> outcome
 -> error classification
 -> append immutable training sample
 -> periodic offline training
 -> walk-forward validation
 -> shadow deployment
 -> approval gate
 -> production model
```

Learning targets:

- probability calibration
- regime-specific weights
- false breakout rate
- sweep quality
- setup expectancy
- session quality
- macro sensitivity

Never learn from a result whose original decision was not contemporaneously stored.

---

## 14. Smart Website Pages

### A. Command Center
- XAUUSD247 live state
- regime
- calibrated probability
- BUY / SELL / WAIT
- decision funnel
- risk state
- latest news impact
- data health

### B. Multi-Timeframe Matrix
- M1/M5/M15/M30/H1/H4/D1
- trend
- structure
- liquidity
- momentum
- signal
- confidence
- conflict reason

### C. Macro Flow
- DXY
- US2Y
- US10Y
- real yield
- WTI / Brent
- risk sentiment
- macro regime
- directional contribution to gold

### D. Fair Value & Probability Lab
- raw score
- calibrated probability
- reliability chart
- comparable historical setups
- edge by regime

### E. Risk Lab
- fractional / risk-constrained Kelly reference
- Monte Carlo
- drawdown cone
- loss-streak probability
- exposure caps

### F. Decision Funnel
- candidates
- pass/fail per gate
- reason codes
- selected setup

### G. Evidence & History
- forward proof
- historical simulation
- chart snapshot
- pips / points / R
- TP / BE / trailing / SL
- monthly/weekly/yearly analytics

### H. AI Analyst
- natural-language explanation generated from structured evidence
- must cite underlying measured factors
- cannot overwrite numeric engine output

---

## 15. UI language

Visual style can borrow the dense "quant command-center" idea:

- dark professional interface
- compact cards
- green / amber / red state hierarchy
- confidence bands
- matrix views
- funnel visualization
- Monte Carlo cone
- flow / contribution chart

But every attractive chart must correspond to a real measured field.

No decorative "whale", "smart money", "AI confidence" or "Sharpe" values without a defined source and formula.

---

## 16. Engineering modules to add

Proposed server modules:

- api/_sqRegime.js
- api/_sqFeatures.js
- api/_sqFairValue.js
- api/_sqCalibration.js
- api/_sqDecisionFunnel.js
- api/_sqRisk.js
- api/_sqMonteCarlo.js
- api/_sqEvidence.js
- api/_sqLearning.js
- api/smart-quant.js

Client modules:

- smart-quant.js
- smart-quant.css

Tests:

- tests/smart-quant-regime.test.mjs
- tests/smart-quant-calibration.test.mjs
- tests/smart-quant-funnel.test.mjs
- tests/smart-quant-risk.test.mjs
- tests/smart-quant-evidence.test.mjs

---

## 17. Release gates

A new smart-quant feature cannot enter production unless:

- all existing V8 tests remain green,
- no historical simulation is relabelled as live proof,
- probability is calibrated or explicitly marked unverified,
- every external source includes freshness metadata,
- no missing data is silently replaced with synthetic values,
- broker-native XAUUSD247 remains the primary price reference,
- MTF conflict handling is preserved,
- Monte Carlo assumptions are visible,
- risk sizing has hard caps,
- forward evidence can reproduce the decision,
- mobile layout is usable.

---

## 18. Build order

Phase 1 — Foundation
- structured feature schema
- data-health layer
- regime engine
- decision funnel

Phase 2 — Probability
- fair-value / edge score
- calibration store
- reliability dashboard

Phase 3 — Risk
- capped fractional/risk-constrained Kelly reference
- Monte Carlo / drawdown cone
- risk dashboard

Phase 4 — Evidence
- unified forward evidence payload
- AI explanation from evidence
- comparable-setup retrieval

Phase 5 — Learning
- immutable dataset builder
- walk-forward validation
- shadow model
- controlled promotion

Phase 6 — UX
- command-center dashboard
- MTF matrix
- macro-flow contribution
- funnel visualization
- risk cone
- mobile optimization

---

## 19. Non-negotiable rules

1. XAUUSD247 broker feed is primary for Gold trading research.
2. Public spot/reference prices must be labelled as substitutes/references.
3. No synthetic history to fill missing broker data.
4. No fake probabilities.
5. No unverified performance claims.
6. No look-ahead leakage.
7. No live self-modifying rules.
8. No auto-execution in this research phase.
9. All decisions must be explainable and auditable.
10. WAIT is a valid outcome and should be preferred when evidence conflicts.

