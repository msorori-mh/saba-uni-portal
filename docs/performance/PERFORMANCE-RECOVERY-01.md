# PERFORMANCE_RECOVERY_01

Status: `HOLD_PRODUCTION / PASS_SOURCE_FIX`

## Acceptance targets

- Public-route response target: approximately `<= 1.0 s` after edge warm-up.
- Primary content visible target: `<= 2.5 s` on a representative mobile connection.
- Portal data loading must not block or replace the whole application shell.
- Route changes must retain visible feedback and recover after an interrupted connection.

## Production baseline — 2026-09-07 UTC

Read-only probes against `https://quboolye.com` found:

- Root HTML: HTTP `200`; observed TTFB/total approximately `10.9–12.5 s` from the probe environment.
- Canonical `www` redirect: HTTP `200` after one redirect to `https://quboolye.com/`.
- All 19 JavaScript files referenced by the root document: HTTP `200`; each observed at approximately `10.8–11.3 s` from the probe environment.
- Static JavaScript is immutable-cached and gzip-compressed.
- `/version.json`: HTTP `200`, stamped SHA `72546eab985f4...`.
- Production bundle runtime profile: **staging**, with the isolated staging Supabase project.

The fixed delay seen by the remote probe may include its network/proxy path and is not, by itself,
a valid end-user Web Vital. The runtime-profile mismatch is deterministic and independently proven.

## Root cause

The artifact currently served on the production hosts was compiled with:

```text
VITE_PORTAL_DEPLOY_TARGET=staging
```

The fail-closed runtime contract correctly rejects staging configuration on `quboolye.com`. When a
public Supabase query initializes, it throws `PORTAL_DEPLOYMENT_PROFILE_REQUIRED`, which reaches the
root error boundary and produces the Arabic “تعذّر تحميل الصفحة” surface.

The public home route amplified this outage by suspending the whole page on five Supabase-backed
queries. A slow or rejected data dependency therefore replaced even the static identity and portal
entry links with the global error page.

## Source correction

- The public home no longer has a blocking data loader.
- Public programs, counts, settings, news, and events use non-suspending queries with safe render
  defaults.
- University identity, navigation, and portal login links render independently of Supabase latency.
- Production/staging isolation remains fail-closed and unchanged.

## Required production profile

The next Lovable production candidate must use the existing protected values and the exact contract
already frozen in `docs/go-live/operator-packets/LOVABLE-PRODUCTION-RELEASE-04F.txt`:

```text
VITE_PORTAL_DEPLOY_TARGET=production
PORTAL_DEPLOY_TARGET=production
VITE_SUPABASE_URL=https://wpmicqriltrowwonknox.supabase.co
SUPABASE_URL=https://wpmicqriltrowwonknox.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<existing protected production public key>
SUPABASE_PUBLISHABLE_KEY=<same protected production public key>
VITE_USE_MOCK_DATA=false
```

No database migration or production-data write is required.

## Verification gates

1. Candidate source is clean and equals the exact approved `origin/main` SHA.
2. Production build contains target `production`, the production project origin, and no selected
   staging fallback.
3. `/version.json` and HTML `meta[name="build-sha"]` equal the candidate SHA.
4. Root, portal login, admin, student, faculty, and staff shells return the expected response.
5. Browser test captures LCP/CLS/INP under normal mobile and throttled mobile profiles.
6. A blocked/slow Supabase request does not remove the public header, hero, or portal entry links.
7. If any gate fails, restore the previously recorded healthy Lovable deployment; no database
   rollback applies.

