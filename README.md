# GoldFlow Intelligence V8.2 — Smart Quant Core R2

GoldFlow is now targeted at **Cloudflare Workers + Static Assets**. Vercel is no longer the production runtime.

## Production architecture

```
Vantage MT5
  -> GoldFlow MT5 Bridge (local PC)
  -> Cloudflare Named Tunnel
  -> bridge.hazim5011.com
  -> Cloudflare Worker API
  -> GoldFlow Smart Quant engines
  -> Cloudflare Static Assets UI
```

Optional forward-proof storage:

```
Cloudflare Worker -> R2 bucket (goldflow-forward-ledger)
```

## Why Cloudflare

- Static asset requests are served by Cloudflare Static Assets.
- API requests run through Cloudflare Workers.
- Broker traffic continues to use the permanent named Cloudflare Tunnel.
- Forward evidence/calibration storage uses R2 instead of Vercel Blob.
- No Vercel runtime or Vercel Blob dependency remains in the Cloudflare target.

## Cloudflare files

- `wrangler.jsonc` — Worker, static assets, R2 and non-secret variables.
- `cloudflare/worker.js` — API router + Vercel-style handler compatibility shim.
- `scripts/build-cloudflare.mjs` — builds safe public assets into `dist/`.
- `api/_storage.js` — R2 immutable-object adapter.
- `api/_runtime.js` — Cloudflare runtime binding context.

## One-time Cloudflare setup

1. Login:
   ```
   npx wrangler login
   ```

2. Create the R2 bucket used by forward proof/calibration:
   ```
   npx wrangler r2 bucket create goldflow-forward-ledger
   ```

3. Add secrets. Never commit their real values:
   ```
   npx wrangler secret put BROKER_BRIDGE_KEY
   npx wrangler secret put FORWARD_INGEST_SECRET
   ```

4. Build and deploy:
   ```
   npm run deploy:cloudflare
   ```

The non-secret bridge URL is configured as `https://bridge.hazim5011.com`.

## Local test

```
npm test
npm run build:cloudflare
npm run dev:cloudflare
```

For local secrets use `.dev.vars`; do not commit it.

## Smart Quant Core R2

Current research modules include:

- broker data-health checks
- market-regime classification
- independent M1/M5/M15/M30/H1/H4/D1 states
- Asia/London/New York session + liquidity radar
- PDH/PDL and session highs/lows
- macro contribution map
- official BLS/BEA/Fed news timing gate
- directional edge index
- forward-only probability calibration
- no-chase trade plan
- capped fractional Kelly research reference
- Monte Carlo drawdown/loss-streak analysis
- Smart Analyst explanation layer
- forward learning/drift monitor
- Telegram-ready alert preview

## Safety rules

- XAUUSD247/Vantage remains the primary broker price reference.
- Missing broker data is never replaced with synthetic values.
- Forming/future candles are excluded from research-state calculations.
- Historical reconstruction is not labelled as forward proof.
- Probability remains unpublished until forward holdout validation passes.
- Smart Quant does not place broker orders.
- WAIT/WATCH is a valid result.
- Model promotion is manual review only.
