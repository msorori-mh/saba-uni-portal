# Production Runtime Profile — 04E Preflight

**Status:** `PASS_04E_SOURCE_PREFLIGHT / HOLD_PRODUCTION_DEPLOY`

## Fixed baseline

- Authoritative source: `main@47c9e613039d89d9c237afa17a4ca158668350c4`
- Staging evidence: Cloudflare staging workflow run `33214617702`
- Staging route: `https://saba-uni-portal-staging.msorori201201.workers.dev`
- Production hosts: `quboolye.com` and `www.quboolye.com`
- Production Supabase origin: `https://wpmicqriltrowwonknox.supabase.co`

The older go-live and release-freeze documents retain historical evidence, but their recorded
source and deployment SHAs predate this baseline. They must not be used as current deployment
authorization.

## Scope completed

04E adds an explicit, fail-closed runtime target with two accepted values only:

| Target       | Allowed host                         | Allowed Supabase origin                | Fallback                                 |
| ------------ | ------------------------------------ | -------------------------------------- | ---------------------------------------- |
| `staging`    | Any non-production host              | Isolated staging project only          | Existing guarded staging public fallback |
| `production` | `quboolye.com` or `www.quboolye.com` | Exact protected production origin only | None                                     |

The production build also requires an explicit public `sb_publishable_...` key. JWT-shaped keys,
secret keys, unknown targets, missing production inputs, path/query variants of the origin, and
cross-environment project references fail before build or client construction.

All five Supabase client construction paths use the same target-aware URL and host contract.
The Cloudflare staging workflow pins `VITE_PORTAL_DEPLOY_TARGET=staging` and remains the only
deployment workflow in this source package.

## Automated evidence

The `Production Runtime Preflight 04E` workflow is deliberately source-only:

- read-only repository permission;
- no GitHub environment;
- no production secret lookup;
- no Cloudflare, Lovable, Supabase, DNS, migration, publish, or deploy command;
- focused `03U`, `03W`, `04D`, and `04E` isolation tests;
- production-profile build with a clearly fake public-format key;
- exact production origin and secret-shape scan in generated output;
- Route Tree and clean-tree verification.

The shared staging fallback constants are public and may remain in a shared generated chunk, but
the production target cannot select them: a missing production URL or key fails closed before the
runtime client is created.

## Local preflight evidence

- TypeScript: `PASS`
- Production-profile build: `PASS`
- Staging-profile build: `PASS`
- TanStack generated Register footer: `PASS`
- Production with staging URL: rejected as designed
- Production without public key: rejected as designed
- Staging with production URL: rejected as designed
- Unknown deployment target: rejected as designed

## Production gate remains closed

This stage does **not** authorize production deployment. Production remains `HOLD` until a separate
operator stage fixes and approves all of the following:

1. Authoritative production channel and writer ownership. Current historical governance names
   Lovable as the single production writer; no Cloudflare production workflow is introduced here.
2. Exact candidate SHA and independent deployed-SHA readback.
3. Protected production public key injection without recording its value in source or logs.
4. Domain and DNS plan for both production hosts.
5. Rollback target and tested rollback procedure.
6. Explicit production Publish/Deploy approval under `AGENTS.md`.

No production database write, migration, backend activation, DNS mutation, Publish, or Deploy was
performed in 04E.
