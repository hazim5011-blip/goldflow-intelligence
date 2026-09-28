# GoldFlow Intelligence — Full Auto Update

Permanent user URL:

https://goldflow-intelligence.vercel.app/

## How the full-auto channel works

1. Users always open the permanent master URL above.
2. The master shell loads the stable release from `release.json`.
3. The shell keeps running in the browser and checks `release.json` every 30 seconds.
4. When `version`, `url`, or `releasedAt` changes, the new release is loaded automatically.
5. The current release stays active if the manifest check fails, and the shell retries automatically.
6. Returning to the tab or reconnecting to the internet triggers an immediate update check.
7. `release.json` is served with no-store/no-cache headers.

## Current stable release

- Version: V6.1
- Indicator: 1.05
- Release URL: https://goldflowintelligencev61complete.vercel.app/
- Update mode: `shell-swap`
- Full auto: enabled
- Poll interval: 30 seconds

## Publishing the next version

Deploy and verify the new release first. Then update these fields in `release.json`:

- `version`
- `url`
- `releasedAt`
- `indicator` when applicable
- `notes`

Vercel automatically deploys the master project from the `main` branch. Users do not need to download or reinstall anything.

## Important

Share only the permanent master URL with users. Direct version URLs such as V6.1 are release targets and do not provide the master shell's continuous update watcher when opened directly.
