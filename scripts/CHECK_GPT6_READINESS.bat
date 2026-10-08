@echo off
setlocal EnableExtensions
title GoldFlow GPT-6 - SAFE READINESS CHECK
cd /d "%~dp0\.."
echo =========================================
echo GOLDFLOW GPT-6 - PREVIEW READINESS CHECK
echo =========================================
echo Read-only tests. DOES NOT deploy, change MT5, rotate keys or enable paid GPT.
where node >nul 2>&1
if errorlevel 1 (echo ERROR: Node.js 20+ required.& exit /b 1)
where npm >nul 2>&1
if errorlevel 1 (echo ERROR: npm required.& exit /b 1)
echo [1/5] Install pinned dependencies...
if exist package-lock.json (
  call npm ci --no-audit --no-fund
) else (
  echo ERROR: package-lock.json missing, refusing unpinned install.
  exit /b 1
)
if errorlevel 1 goto fail
echo [2/5] Isolated GPT-6 safety tests...
call node --test tests\gpt-research.test.mjs tests\gpt-access.test.mjs tests\gpt-dashboard.test.mjs tests\gpt-news.test.mjs
if errorlevel 1 goto fail
echo [3/5] Cloudflare compatibility tests...
call npm run test:cloudflare
if errorlevel 1 goto fail
echo [4/5] Build Cloudflare preview assets (NOT deploy)...
call npm run build:cloudflare
if errorlevel 1 goto fail
if not exist dist\_worker.js goto fail
if not exist dist\gpt-ui.js goto fail
echo [5/5] Full GoldFlow legacy gate...
call npm test
if errorlevel 1 (
 echo.
 echo BLOCKED: Existing GoldFlow regressions failed. NO DEPLOYMENT permitted.
 echo GPT isolated tests and build above may still have passed.
 exit /b 2
)
echo.
echo PASS: Local tests and build passed. NO DEPLOYMENT was performed.
echo Owner must still configure secret, Cloudflare Access, dedicated KV and perform actual preview smoke.
exit /b 0
:fail
echo.
echo FAILED: Safe readiness check blocked. NO DEPLOYMENT was performed.
exit /b 1
