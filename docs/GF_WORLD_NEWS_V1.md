# GF World News Intelligence — V8.1.3 TEST

## Scope
This module is **independent of MT5** and preserves the official Macro/News Study beneath it.
- \`/api/news-live\`: newest source-attributed market headlines (Google News RSS search plus direct BBC, Guardian, Al Jazeera RSS) and dated curated source cross-checks (UKMTO, WSJ, Reuters).
- \`/api/news-context\`: official economic observations, NOT a live geopolitical wire. Its data-period is not a release timestamp.
- The News Study / Blog view independently polls world-news JSON approximately once per **five minutes while the website is open**, and checks again on return to a visible tab.
- Headlines newer than the last browser visit are flagged **NEW** by locally remembered news IDs. This is browser-local; no server-side personalized notification permission is presumed.
- Public feed updates are best-effort. Cloudflare cache \`s-maxage=150\`; origin memo \`TTL=180s\`; manual refresh is rate-gated. A browser sleeping or all unavailable publishers cannot guarantee immediate detection.

## Veracity rules
- \`CURATED_SOURCE_ATTRIBUTED\`: source-reviewed dated development with explicit article link, date-only precision, no invented UTC publication hour.
- \`PUBLISHER_HEADLINE_VIA_GOOGLE_NEWS\`: credible publisher-labelled RSS headline; Google News link is a gateway to the outlet, not proof that GoldFlow has verified the full article.
- \`PUBLISHER_DIRECT_RSS_HEADLINE\`: direct publisher RSS headline, not audited article body.
- Only trusted publisher names, HTTPS links, parsed feed timestamps within the previous 72h and topical headlines qualify.
- Failed providers are counted as **UNAVAILABLE**. Any recorded curated report remains clearly labelled with its date, not reissued as a fake BREAKING headline. As curated stories age beyond 5 days, they move out of the live list but remain in the dated Blog.
- No automatic geopolitical actor attribution, invented casualty/ship counts, implied exact release timestamps, forecasts, profit percentages, live Gold prices or projected gap sizes.
- \`impact\` refers to potential market relevance, **not** a measured XAUUSD response. Each story presents a supporting and opposing mechanism (safe haven versus energy inflation / USD / yields).
- Market-open checklist requires exact fresh tradable Vantage XAUUSD247 quote, spread, news timestamps, DXY, Brent/WTI and actual M15/H1 candle confirmation.

## What the live API does NOT do
This Pages endpoint does not schedule background polling when no one visits, store an immutable news archive or send Telegram/mobile pushes. True 24/7 server-side checks and push require an approved scheduled Cloudflare Worker + KV/D1/R2 + Telegram delivery, with credentials stored as encrypted Cloudflare secrets and a dedicated per-source retention/deduplication policy.

## Safe manual staging check after deploying
Open these URLs; no bridge credentials or login tokens should appear in the responses:
- \`https://goldflow-intelligence-cf-test.pages.dev/api/news-live\`
- \`https://goldflow-intelligence-cf-test.pages.dev/api/news-context\`
- \`https://goldflow-intelligence-cf-test.pages.dev/blog/posts.json\`

The world-news response should contain \`ok:true\`, \`sourceStatus\`, \`sourceChecks\`, \`updatedAtUTC\`, dated editorial entries, \`items\` with source URLs and two-sided \`pathway/opposing\`. If all RSS upstreams fail, show \`LIVE_FEEDS_UNAVAILABLE\` but keep dated curated sources; do not call this fully live.

Open News Study and Blog in the TEST website, check real source links and confirm the UI shows **V8.1.3 TEST**. Test Browser Ctrl+Shift+R after PWA updates. Never change or restart the existing Windows MT5 bridge to install this read-only news feature.
