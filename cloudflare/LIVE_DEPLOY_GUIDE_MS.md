# GoldFlow V8.1.1 GF Study — Cloudflare LIVE TEST

**Tujuan**: Gunakan branch staging pada Pages test tanpa menaikkan caj Vercel Pro.

1. Buka GitHub PR #5 -> Code -> pilih branch \`staging/v8-1-ai-confirmation-market-online\` -> Download ZIP (jangan ambil main lama). Unzip ke folder BARU Windows (bukan direktori MT5/bridge yang sedang berjalan).
2. Pastikan Node.js 20+ tersedia. Di Cloudflare dashboard: Workers & Pages -> Create -> Pages -> Direct Upload; project name **goldflow-intelligence-cf-test**; production branch **main**. Ini perlu dibuat oleh pemilik Cloudflare.
3. Double-click \`scripts\\DEPLOY_CLOUDFLARE_TEST.bat\`. Ia jalankan original & adapter tests, bundle \`dist\`, login rasmi Wrangler melalui browser, kemudian upload ke Pages TEST sahaja. Simpan URL sebenar \`https://goldflow-intelligence-cf-test.pages.dev\` yang dipulangkan jika berjaya — jangan andaikan slug sebelum deploy.
4. Pada Pages project -> Settings -> Variables and Secrets, tetapkan Production **dan Preview**:
   - \`BROKER_BRIDGE_URL\` = \`https://bridge.hazim5011.com\`.
   - \`BROKER_BRIDGE_KEY\` = secret bridge sedia ada, input terus dalam Cloudflare (JANGAN paste dalam chat, GitHub, dist atau README).
   - \`VANTAGE_TICK_UTC_OFFSET_SECONDS\` = \`10800\` hanya setelah semakan offset dengan server Vantage aktif.
   - MarketData token jika anda menggunakan GLD options, disimpan encrypted.
   - Jangan set BLOB/Forward secrets, kerana arkib immutable R2 belum dibangunkan.
   Jika Cloudflare memerlukan deploy semula selepas secret disimpan, klik BAT tadi sekali lagi (hanya Pages TEST).
5. PowerShell: \`powershell -ExecutionPolicy Bypass -File .\\scripts\\SMOKE_CLOUDFLARE_LIVE.ps1 -BaseUrl https://<URL-TEST-SEBENAR>.pages.dev\`.
6. Uji manual **BUY/SELL READY**, invalidation, expired, missed entry, WATCH not LIVE, 6 enjin asal + Fund104, 16/16 Macro, news dan sejarah. Bandingkan harga dan masa XAUUSD247 Vantage, jangan gunakan XAUT atau GC=F sebagai primary XAU quote. Lihat Analytics > Functions CPU Cloudflare Pages. Free CPU 10 ms/request (jika masih berkenaan dengan plan), jangan umumkan migration berjaya sehingga tiada error 1102.
7. 24h soak pada hari bekerja DAN hujung minggu. Hanya selepas semakan lulus, pilih Production Cloudflare dan keputusan akhir downgrade Vercel. Domain \`goldflow-intelligence.vercel.app\` sendiri milik Vercel; anda perlukan domain sendiri atau kongsi \`*.pages.dev\`.

**Nota**: GF-AI v1.00 ialah enjin berasaskan peraturan yang boleh diaudit; bukan model ML terlatih. Fundamental score adalah konteks terbitan, bukan jaminan arah emas. Tiada trade MT5 dihantar melalui fungsi ini.
