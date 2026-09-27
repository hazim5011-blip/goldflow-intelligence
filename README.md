# GoldFlow Intelligence — Evergreen Auto Update

This repository is the permanent launcher for the latest stable GoldFlow Intelligence release.

## How it works

- `release.json` identifies the current stable version and production URL.
- `index.html` checks `release.json` every 30 seconds and switches to the latest release automatically.
- Vercel is configured to disable caching for `release.json`.
- `.github/workflows/release-check.yml` validates every release manifest update.

## Current release

- GoldFlow Intelligence V6.1
- Indicator 1.05
- https://goldflowintelligencev61complete.vercel.app/

For future releases, update `release.json` and append the release to `releases/history.json`.
