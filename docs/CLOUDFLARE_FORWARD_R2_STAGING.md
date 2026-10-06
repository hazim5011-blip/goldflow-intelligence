# Cloudflare R2 Forward Evidence — staging adapter

## Status
Code support is present on the staging branch only. It is **fail-closed** and remains disabled unless both:
- an R2 binding named `GF_FORWARD_R2` exists in the Cloudflare Pages environment; and
- `FORWARD_INGEST_SECRET` is configured as an encrypted secret with at least 32 characters.

Public proof additionally requires `FORWARD_PUBLIC_READ=true`.

No bucket, secret, Production deployment, billing change or broker order execution is created by this code change.

## Why R2
GoldFlow needs durable server-side storage before it can truthfully call a record `FORWARD_LOGGED`. Browser localStorage and temporary function filesystems are not sufficient. The R2 adapter keeps the existing GoldFlow schema and hashes while replacing the Cloudflare build's old unconditional `forward-disabled.js` shim.

## Integrity / write rules
- Published signal: `goldflow-forward/v1/YYYY-MM-DD/<signalId>/published.json`
- Outcome event: `goldflow-forward/v1/YYYY-MM-DD/<signalId>/outcome.json`
- Both use conditional R2 writes with `If-None-Match: *`; an existing object is not overwritten.
- Readback recomputes `recordHash` / `eventHash` before returning evidence.
- Pattern132 and SND107 remain validation-only engines with no fabricated outcome model.
- A forward server receipt is evidence of GoldFlow archive timing/integrity, **not** proof of broker execution or fill quality.

## TEST activation procedure (not performed automatically)
1. Create a dedicated TEST R2 bucket in the user's Cloudflare account.
2. Bind that bucket to the TEST Pages project as `GF_FORWARD_R2`.
3. Add `FORWARD_INGEST_SECRET` as an encrypted secret. Never commit or paste it into source.
4. Keep `FORWARD_PUBLIC_READ` unset/false during private ingest validation.
5. Redeploy TEST, then verify:
   - GET `/api/forward-ingest` => enabled true.
   - unauthorized POST => 401.
   - one valid contemporaneous publication => 201.
   - exact duplicate => 409.
   - outcome before publication => rejected.
   - valid final outcome => 201.
6. Only after audit, set `FORWARD_PUBLIC_READ=true` and verify a known date/id through `/api/forward-proof`.
7. Production remains out of scope until explicit user approval.

## Rollback
Remove/unbind `GF_FORWARD_R2` or remove the ingest secret. The API immediately returns to NOT_CONFIGURED without fabricating forward evidence.
