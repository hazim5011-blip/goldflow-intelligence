# GoldFlow Intelligence V7.2

Production website: https://goldflow-intelligence.vercel.app/

## Architecture

Vantage MT5 -> GoldFlow Vantage Bridge -> Cloudflare HTTPS Tunnel -> Vercel API -> Indicator 1.05 dynamic multi-asset engine -> Web UI.

## V7.2

- Dynamic symbol catalog from the connected Vantage MT5 server.
- Categories: Forex, Metals, Crypto, Indices, Energy, Stocks, Other.
- User-selectable signal TF: M1, M5, M15, M30, H1, H4, D1.
- Automatic MTF setup/bias mapping.
- Broker-native candles and chart.
- Indicator 1.05-style market structure, BOS/CHoCH, supply/demand/order-block zones, signal scoring and history.
- History: WIN = TP + trailing + BE. LOSE = SL only.
- No GC=F/Yahoo execution-price substitution in the V7.2 engine.

## Required Vercel environment variables

- BROKER_BRIDGE_URL
- BROKER_BRIDGE_KEY

Never commit the real bridge key to GitHub.
