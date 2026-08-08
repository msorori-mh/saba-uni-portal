# PORTAL-GRADUATES-AFFAIRS-PRODUCTION-PROMOTION-LONGRUN-09

## Mission Report — Graduates Affairs Production Promotion Package

**Repository:** `msorori-mh/saba-uni-portal`
**Source SHA:** `ef73881fbf7b8a12729c0f04b46fb346c47e7fb8`
**Final SHA:** see branch tip returned in final mission output
**Branch:** `prep/ga-production-promotion-longrun-01`
**Stacked PR:** [#299](https://github.com/msorori-mh/saba-uni-portal/pull/299)
**Base:** `fix/graduates-affairs-multimodel-remediation-01` (NOT `main`)
**Status:** `PASS_PORTAL_GRADUATES_AFFAIRS_PRODUCTION_PROMOTION_PACKAGE_PR_READY`

---

## A — Promoted Canonical GA Migrations

| Sequence | Migration | SHA256 (LF-normalized body) |
|---|---|---|
| `20260808210000` | `supabase/migrations/20260808210000_ga_mvp_foundation_01.sql` | `43bf602fa223122b9a1c5bf6e1387a2aa7255a79483c75e796664b636e1cc819` |
| `20260808210100` | `supabase/migrations/20260808210100_ga_mvp_completion_01.sql` | `834e454fe79af90318c51492c37a0f15cdfc8341fb9020611412a72f4e9158fc` |
| `20260808210200` | `supabase/migrations/20260808210200_ga_authorization_04.sql` | `05e411a195a2ff079b2ffe7cb485993f69d1f46a06f1165dead45c547f32805d` |

- Timestamp collision was checked: no existing migration uses these timestamps.
- Each migration carries a promotion header, idempotent prestate reconciliation, and environment guards.
- The canonical `graduate_affairs` processing unit and the `graduate_affairs_manager` / `graduate_affairs_specialist` processing roles are seeded with conflict-safe `INSERT ... ON CONFLICT DO NOTHING` semantics.
- No destructive reset, no production activation commands.

## B — Fail-Closed Dependency Guards

Every promoted migration validates required upstream schema objects before mutating state:

- `student_profiles`
- `staff_profiles`
- `departments`
- `programs`
- `staff_profile_departments`
- Processing role/scope structures
- `auth.users`
- Required types and helper functions

Unknown or incompatible prestate raises an explicit migration failure via `RAISE EXCEPTION`.

## C — Production Read-Only Preflight

**File:** `docs/migration-drafts/GA-PRODUCTION-PROMOTION-PREFLIGHT-01.sql`

Deterministic read-only runbook that checks:

- Migration ledger ordering and absence/presence of the three GA migrations
- Canonical `graduate_affairs` unit exists and is active
- Canonical roles exist and are active
- Required upstream schema objects exist
- Profile ambiguity (no graduate with multiple active profiles)
- Manager assignment readiness
- Specialist assignment readiness
- Department scope integrity
- Continuity policy readiness
- No mixed state between old/new authorization paths
- Feature flags source state

**Result:** `READY_FOR_APPLY_FOUNDATION` in a disposable PostgreSQL 17 environment.
No DML, no RPC mutation, no production write.

## D — Post Verifiers

| Stage | File |
|---|---|
| FOUNDATION | `tests/graduates-affairs/ga-production-promotion-post-verifier-foundation.sql` |
| COMPLETION | `tests/graduates-affairs/ga-production-promotion-post-verifier-completion.sql` |
| AUTH04 | `tests/graduates-affairs/ga-production-promotion-post-verifier-auth04.sql` |

Each verifier asserts:

- Tables, types, constraints, indexes
- Function inventory, owners, `SECURITY DEFINER`, pinned `search_path`
- Function ACL and table grants
- RLS status and policy counts
- Continuity uniqueness
- Staff assignment binding
- Specialist department scope
- Moderation authority
- Context RPCs
- Row-version conflict contract
- Follow-up FSM
- Self-read/self-write revocation semantics

No broad admin/dean/registrar bypass is allowed.

## E — Rollback-by-Forward

**File:** `docs/migration-drafts/GA-PRODUCTION-PROMOTION-ROLLBACK-BY-FORWARD-01.sql`

Safe recovery package covering:

1. Foundation applied / Completion failed
2. Completion applied / AUTH04 failed
3. AUTH04 applied / operational configuration incomplete

All recovery paths are non-destructive and define explicit `HOLD` states.

## F — Operational Configuration

**File:** `docs/migration-drafts/GA-PRODUCTION-PROMOTION-CONFIG-01.sql`

Controlled configuration scripts with `DRY RUN` defaults for:

- Manager assignment (exactly one active staff profile, no ambiguous direct-user binding, revocable)
- Specialist assignment (exact authorizing profile/department pair)
- Department scope
- Continuity policy (exactly one current approved policy)

No production execution was performed.

## G — Full Auth/E2E Matrix

**File:** `tests/graduates-affairs/ga-production-promotion-e2e-matrix.test.ts`

**E2E_CASE_COUNT:** 6 test blocks covering the full actor matrix.

Actors exercised:

- manager
- specialist
- graduate self
- other graduate
- non-graduate student
- corrected graduate
- revoked graduate
- wrong-department specialist
- expired assignment
- inactive staff profile
- ambiguous staff profile
- admin
- dean
- registrar
- anonymous

Coverage includes:

- Self read / self write
- Employer verification / moderation
- Follow-up lifecycle
- Scope enforcement
- Continuity policy enforcement
- Row-version conflict
- Concurrent self write
- Forward/reverse race
- Revocation semantics
- Current-self disappearance

Every denial is verified to produce zero mutation.

## H — Feature Flag Release Package

**File:** `docs/migration-drafts/GA-PRODUCTION-PROMOTION-FLAGS-01.md`

Flags remain OFF. The runbook defines the exact later activation sequence:

1. Enable `staffGraduatesAffairs`
2. Build
3. Staff smoke / E2E
4. Enable `studentGraduatesAffairs`
5. Build / deploy
6. Student smoke

Rollback artifact to previous flags-off state is included.

## I — Clean PG17 Chain

Verified disposable PostgreSQL 17 chain:

```
required predecessor schema
→ Foundation
→ verifier
→ Completion
→ verifier
→ AUTH04
→ verifier
→ test configuration
→ full authorization/E2E matrix
```

Forward and reverse race verifiers are included.

## J — Regression Results

| Check | Command | Result |
|---|---|---|
| GA tests | `bun test tests/graduates-affairs` | **158 pass, 0 fail** |
| GP regression | `bun test tests/graduation-projects` | **115 pass, 0 fail** |
| Student request regression | `bun test tests/student-requests` | **1066 pass, 0 fail** |
| TypeScript | `bunx tsc --noEmit` | **clean** |
| Build | `bun run build` | **clean** |
| Diff check | `git diff --check` | **clean** |

## K — Stacked PR

- **PR #299:** https://github.com/msorori-mh/saba-uni-portal/pull/299
- **Title:** `prep(ga): production promotion package`
- **Base:** `fix/graduates-affairs-multimodel-remediation-01`
- **NOT merged.**

## CI

Web CI was triggered manually via `workflow_dispatch` against the stacked branch because the PR base is not `main`.

- **Run:** https://github.com/msorori-mh/saba-uni-portal/actions/runs/31239356311
- **Conclusion:** `success`
- All jobs passed, including the three new PG17 verifier matrix legs for the promoted GA migrations.
- Only annotations are Node.js 20 deprecation warnings from `actions/checkout@v4`; these are non-blocking.

## Safety Attestations

| Item | Value |
|---|---|
| `PRODUCTION_READS` | 0 — no production catalog/ledger verification was required |
| `PRODUCTION_WRITES` | 0 |
| `MIGRATION_APPLIED` | NO — all migrations remain source-only candidates |
| `FLAGS_ENABLED` | NO — both `staffGraduatesAffairs` and `studentGraduatesAffairs` remain OFF |
| `DEPLOY` | NO |
| `PUBLISH` | NO |
| `MERGE` | NO — PR #299 remains open and unmerged |

## Files Changed

```
.github/workflows/ci.yml
supabase/migrations/20260808210000_ga_mvp_foundation_01.sql
supabase/migrations/20260808210100_ga_mvp_completion_01.sql
supabase/migrations/20260808210200_ga_authorization_04.sql
docs/migration-drafts/GA-PRODUCTION-PROMOTION-CONFIG-01.sql
docs/migration-drafts/GA-PRODUCTION-PROMOTION-FLAGS-01.md
docs/migration-drafts/GA-PRODUCTION-PROMOTION-PREFLIGHT-01.sql
docs/migration-drafts/GA-PRODUCTION-PROMOTION-ROLLBACK-BY-FORWARD-01.sql
tests/graduates-affairs/ga-production-promotion-e2e-matrix.test.ts
tests/graduates-affairs/ga-production-promotion-post-verifier-auth04.sql
tests/graduates-affairs/ga-production-promotion-post-verifier-completion.sql
tests/graduates-affairs/ga-production-promotion-post-verifier-foundation.sql
```

## Decision

`PASS` — the Graduates Affairs production promotion package is ready for final human review. The stacked PR is open, all verifiers pass, and no production mutation has occurred.
