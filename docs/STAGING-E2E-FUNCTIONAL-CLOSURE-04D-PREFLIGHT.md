# STAGING-E2E-FUNCTIONAL-CLOSURE-04D — DEPLOY PREFLIGHT

**Date (UTC):** 2026-08-27  
**Mode:** source-only, read-only deployment preflight  
**Repository:** `msorori-mh/saba-uni-portal`

## Decision

`PASS_04D_PREFLIGHT_SOURCE / 04D_APPLY_CHANNEL_SELECTED`

The release candidate is proven at source and CI level, and its isolated staging
Supabase identity is guarded fail-closed. Cloudflare Workers is now selected as
the dedicated Lovable-free staging channel. The apply workflow is manual,
environment-protected, SHA-pinned, and cannot target a custom or production
domain.

## Frozen source baseline

| Item                          | Value                                           |
| ----------------------------- | ----------------------------------------------- |
| Source branch                 | `main`                                          |
| Source SHA                    | `13e23637c14be587c4fe0e4fbcf640b842bd2a83`      |
| Promotion PR                  | #390                                            |
| Web CI push run               | #1548 — 21/21 jobs PASS                         |
| Bun                           | 3756 PASS / 0 FAIL, 39796 assertions, 337 files |
| TypeScript / production build | PASS                                            |
| Android push run              | #642 — Debug/Release APK + AAB PASS             |

No source drift is accepted after this SHA without repeating the preflight.

## Staging/backend isolation

- Isolated staging project ref: `ldjhuutywqhjxabdotmn`.
- The client accepts only HTTPS `*.supabase.co` or localhost.
- The protected production project identity is denied before every client is
  constructed.
- `quboolye.com` and `www.quboolye.com` explicitly reject the staging
  fallback.
- Five Supabase client-construction paths use the isolation guard.
- The committed fallback is a public `sb_publishable_` key only.
- No service-role or `sb_secret_` fallback exists.
- The 03W contract covers 21 staging publish/isolation assertions and passed as
  part of the promoted suite.

This candidate is a staging-only build. It must not be published to either
production hostname.

## Deployment-channel inventory

| Gate                                 | Current evidence                                                                | Status   |
| ------------------------------------ | ------------------------------------------------------------------------------- | -------- |
| GitHub deployment workflow           | Manual `.github/workflows/cloudflare-staging-04d.yml` with PR/push dry-run      | SELECTED |
| GitHub deployment target/environment | `saba-uni-portal-staging` / GitHub Environment `staging`                        | SELECTED |
| Root provider configuration          | Nitro-generated Wrangler config is validated and rewritten only in build output | SELECTED |
| Runtime target capability            | Nitro Cloudflare output + Wrangler 4 frozen by the lockfile                     | SELECTED |
| Live staging URL                     | Not frozen or proven for this SHA                                               | HOLD     |
| Provider rollback/version            | Not defined for 04D                                                             | HOLD     |
| External backend health probe        | Not proven from the current restricted network                                  | HOLD     |

## Build provenance gate

GitHub-based builds can inject the exact candidate through `GITHUB_SHA`, so
`/version.json` and `<meta name="build-sha">` can prove the deployed commit.

The legacy git-less publish path instead falls back to
`build-sha.generated.json`, which currently contains
`72546eab9855f94647d84d52c8caaa02f281f8f7`, not the 04D candidate. Updating a
committed stamp is self-referential because the update creates a new commit.
Therefore the legacy path must not be treated as SHA-proven for this stage.

Required provenance result after deployment:

```
GET <staging-url>/version.json
{"sha":"13e23637c14be587c4fe0e4fbcf640b842bd2a83"}
```

Any `unknown` or mismatch is a deployment `HOLD`.

## Recommended Lovable-free channel

The smallest source-aligned option is a dedicated Cloudflare staging
Worker/Pages target invoked from GitHub Actions, because:

1. the application build target is already Cloudflare-compatible;
2. GitHub supplies the exact `GITHUB_SHA`;
3. staging can use a hostname distinct from the protected production hosts;
4. provider versions can supply deterministic rollback.

This channel is selected for `04D`. Source now includes the manual workflow,
generated-bundle validator, exact SHA/public-route verifier, dry-run gate, and
staging-only rollback. Cloudflare credentials remain outside source in the
protected GitHub Environment.

## Required apply authority and inputs

Before `04D_APPLY`, all of the following must be frozen:

1. Provider and target name.
2. Dedicated staging hostname that is not `quboolye.com` or
   `www.quboolye.com`.
3. GitHub Environment named `staging` with protected deployment credentials.
4. Exact public staging URL/key inputs; no server-role key in client/build
   variables.
5. Provider version/rollback command and previous healthy version ID.
6. Manual-dispatch workflow pinned to the authorized source SHA.
7. Post-deploy checks:
   - exact `/version.json` SHA;
   - production-host denial;
   - staging backend identity;
   - public route smoke;
   - targeted authenticated E2E for admin, employee, faculty, department head,
     and student;
   - zero production DB writes and zero production migrations.

## Rollback contract

On any provenance, route, authentication, authorization, or backend-isolation
failure:

1. stop E2E immediately;
2. roll the staging provider back to the recorded prior healthy version;
3. verify its version endpoint and public smoke;
4. do not touch production, migrations, or database records;
5. retain the failed deployment logs and mark the stage `HOLD`.

## Production invariants

- Production database writes: **0**
- Migrations applied: **0**
- Production Publish/Deploy: **0**
- `request_types.student_visible` changes: **0**
- Test/real account creation: **0**
- Existing request/document mutations: **0**
- Lovable writes/actions: **0**

## Exit gate

The preflight is complete and the provider/target authority is selected for one
exact staging Worker only. Live apply remains fail-closed until the `staging`
environment contains the Cloudflare account/token and public Supabase staging
key, the source changes pass CI, and the manual workflow is dispatched with the
current full `main` SHA.
