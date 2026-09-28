# GoldFlow Intelligence V7

Broker-first production build.

- XAUUSD live display: OANDA:XAUUSD through TradingView.
- XAUUSD247 live display: THINKMARKETS:XAUUSD247 through TradingView.
- FX live display: matching OANDA TradingView symbols.
- No GC=F / Gold Futures fallback is used for XAUUSD.
- No Yahoo pair-price fallback is used for live trade pairs.
- Indicator/SND/SNR/Entry/SL/TP wait for MT5 Broker Bridge so calculations use the broker's own candles.
- Macro sources remain independent: U.S. Treasury / ECB and DXY reference.

Vercel environment variables for full engine:
- BROKER_BRIDGE_URL
- BROKER_BRIDGE_KEY
- MARKETDATA_TOKEN (optional GLD options)
