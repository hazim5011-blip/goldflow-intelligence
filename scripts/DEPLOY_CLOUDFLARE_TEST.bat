@echo off
setlocal EnableExtensions
cd /d "%~dp0.."
echo ==========================================================
echo GoldFlow V8.1.1 + GF Study - Cloudflare TEST (NOT Vercel)
echo ==========================================================
echo Source must be the staging/v8-1-ai-confirmation-market-online branch.
where node >nul 2>nul || (echo ERROR: Node.js 20+ required. & pause & exit /b 1)
if not exist cloudflare\worker.js (echo ERROR: Missing staging Cloudflare source. & pause & exit /b 1)
echo [1/5] Install test/build dependencies.
call npm install --no-audit --no-fund
if errorlevel 1 goto fail
echo [2/5] Run original and new tests.
call npm test
if errorlevel 1 goto fail
call npm run test:cloudflare
if errorlevel 1 goto fail
echo [3/5] Bundle static files and public Worker code. No secrets in dist.
call npm run build:cloudflare
if errorlevel 1 goto fail
echo [4/5] Sign in to YOUR Cloudflare account (official browser OAuth).
call npx wrangler login
if errorlevel 1 goto fail
echo [5/5] Prepare separate Cloudflare TEST project, if not already created.
call npx wrangler pages project create goldflow-intelligence-cf-test --production-branch main
if errorlevel 1 echo Project may already exist. Continuing to the safe test-only upload.
call npx wrangler pages deploy dist --project-name goldflow-intelligence-cf-test --branch main
if errorlevel 1 goto fail
echo SUCCESS: Save the returned *.pages.dev URL.
echo BEFORE TESTING MT5: configure BROKER_BRIDGE_URL, encrypted BROKER_BRIDGE_KEY,
echo and VANTAGE_TICK_UTC_OFFSET_SECONDS in Cloudflare Pages project variables.
echo DO NOT SHARE BRIDGE KEY. Do NOT cancel Vercel until CF smoke tests pass.
pause
exit /b 0
:fail
echo BUILD/TEST/DEPLOY FAILED. Production Vercel was not touched.
pause
exit /b 1
