# Production Release Operator — 04F Preflight

**Status:** `PASS_04F_SOURCE_PREFLIGHT / HOLD_PRODUCTION_ACTIONS`

## Authoritative baseline

- Source baseline entering 04F: `main@da71d95d22c3cbccc879ca80b012d28627ac644b`
- Production writer: `LOVABLE_ONLY`
- Production origin: `https://quboolye.com`
- Production Supabase origin: `https://wpmicqriltrowwonknox.supabase.co`
- Staging channel: dedicated Cloudflare Worker; it is not a production promotion path

The exact deploy candidate is intentionally not hard-coded before merge. After 04F merges, it is
the full SHA at `origin/main`, and the operator packet requires that value to be supplied as
`VITE_BUILD_SHA`. This avoids a self-referential release stamp whose commit changes when updated.

Historical go-live freezes, release candidates, and war-room documents retain audit evidence but
contain older SHAs. They are not current production authorization.

## Source-only controls added

1. A pure production release contract validates the full SHA, canonical origin, exact protected
   Supabase origin, public key shape, deployed JSON, HTML meta proof, cache policy, rollback ID,
   and two independent approval tokens.
2. A read-only verifier checks the two live provenance surfaces and the `www` host after an
   separately authorized publish. It performs `GET` requests only and owns no credential.
3. The current Lovable operator packet fixes the single-writer channel, environment profile,
   candidate-SHA procedure, rollback target, fail-closed decisions, and database-free rollback.
4. The 04F GitHub workflow uses repository read permission, fake public-format build input, focused
   tests, TypeScript, a production-profile build, output scans, and a clean-tree check. It has no
   environment, secret read, deploy tool, production API call, DNS action, or Supabase command.

## Required evidence inherited from 04E

- Source merge: `main@da71d95d22c3cbccc879ca80b012d28627ac644b`
- Web CI run `33220579598`: `21/21 PASS`
- Bun: `3779 PASS / 0 FAIL`, `39,893` assertions across `339` files
- Production Runtime Preflight 04E run `33220579612`: `PASS`
- Cloudflare staging dry-run `33220579542`: `PASS`, with no staging deploy
- Android run `33220579558`: Debug/Release APK and AAB `PASS`

## Production gate remains closed

This source stage does not authorize a production action. The next operator must first prove the
final merged `main` SHA and required checks, record the previous healthy Lovable deployment ID,
and confirm Lovable source synchronization.

Two separate exact approvals are then required:

1. `APPROVED_PRODUCTION_DEPLOY_04F` — build/deploy the frozen candidate to the Lovable release slot.
2. `APPROVED_PRODUCTION_PUBLISH_04F` — publish/cut over that already verified candidate.

No production database write, migration, backend activation, DNS mutation, Publish, Deploy, secret
read, secret rotation, or test-data creation was performed in 04F preflight.
