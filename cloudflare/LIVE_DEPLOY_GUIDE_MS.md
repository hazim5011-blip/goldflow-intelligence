# GoldFlow V8.1.1 GF Study — Cloudflare LIVE TEST

**Tujuan**: Gunakan branch staging pada Pages test tanpa menaikkan caj Vercel Pro.

### PENTING: Macro BLS 13/16 / FRED HTTP 520 di Cloudflare

Apabila kedua-dua domain BLS dan FRED menyekat sambungan dari Cloudflare, deploy Pages sahaja TIDAK menyelesaikan masalah. Kod baharu menggunakan laluan PC MT5 Bridge yang sedia ada (named tunnel, key sama). Di PC, selepas download ZIP terbaru:

1. Double-click `scripts\\INSTALL_MACRO_ON_LOCAL_BRIDGE.bat`. Script cuba kesan folder Bridge yang sedang berjalan; jika tidak berjaya, paste folder sebenar yang mengandungi `mt5_bridge.py` (bukan folder ZIP baharu).
2. Taip `YES` untuk pengesahan. Script backup fail Bridge lama dan salin HANYA `mt5_bridge.py` + `macro_sources.py`; `.env`, key, MT5 terminal, positions, named tunnel dan config asal tidak diubah.
3. **Restart proses Bridge sedia ada menggunakan launcher asal apabila selamat**, supaya endpoint `/macro/bls` baharu dimuatkan. Tunnel sedia ada boleh kekal; elakkan mencipta dua proses port 8787. Pastikan halaman `/api/bridge-health` kekal `MT5 LIVE`.
4. Jalankan `scripts\\DEPLOY_CLOUDFLARE_TEST.bat` dalam ZIP BARU untuk upload API Cloudflare yang boleh meminta `/macro/bls` dengan `BROKER_BRIDGE_KEY` sedia ada.
5. Buka Cloudflare `/api/macro`. Semak `quality.available`, `quality.primarySourceHealth`, `quality.secondaryMirror`, `quality.errors`, `quality.edgeSourceErrors` dan timeline. Jika BLS direct melalui PC berjaya: direct official via local authenticated bridge, bukan rekaan nombor. Jika hanya FRED melalui PC berjaya: `SECONDARY_MIRROR` + `PRIMARY DEGRADED` dan GF-AI Gold masih fail-closed. Jika kedua-dua PC routes gagal: `UNAVAILABLE`; jangan sembunyikan ralat.
6. JANGAN akses `https://bridge.hazim5011.com/macro/bls` secara terus dalam browser atau kongsi key. Panggilan ini memerlukan header X-Bridge-Key; Cloudflare memanggilnya melalui secret sedia ada.



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
