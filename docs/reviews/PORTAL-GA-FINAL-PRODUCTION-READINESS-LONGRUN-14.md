# PORTAL-GA-FINAL-PRODUCTION-READINESS-LONGRUN-14

## Mission Report — Final Graduates Affairs Production Readiness Package

**Repository:** `msorori-mh/saba-uni-portal`
**Canonical Source PR:** `#291` — `f799608a5d5fb167d66e5615d3f7b50692295f30`
**Promotion Package PR:** `#299` — `5ae9b53ce7e69bd8b98fd06c8e3736f040514c92`
**Promotion Package Baseline SHA:** `5ae9b53ce7e69bd8b98fd06c8e3736f040514c92`
**Final SHA:** see branch tip returned in final mission output below
**Branch:** `prep/ga-production-promotion-longrun-01`
**Stacked PR:** [#299](https://github.com/msorori-mh/saba-uni-portal/pull/299)
**Base:** `fix/graduates-affairs-multimodel-remediation-01`
**Status:** `PASS_PORTAL_GA_FINAL_PRODUCTION_READINESS_PACKAGE_READY`
**Read-Only Preflight:** `LIVE_READONLY_BLOCKED_CREDENTIALS` — no authenticated production channel was available in this local worktree.

---

## ⚠️ Hash-Contract Exception

| Artifact | Canonical Hash Supplied by Mission | Actual LF-Normalized SHA256 of Promoted File at PR #299 |
|---|---|---|
| `20260808210200_ga_authorization_04.sql` | `3a85f54dbe5bcf249349d16cdcef5a921e4d8be28a5099965691e65ce4c3dffd` | `212865fb7c4077ce313a9b4707700520be275360b54470fd62fc08edd539060c` |

The supplied AUTH04 body hash does **not** match the promoted migration file at the stated promotion-package SHA (`5ae9b53c`). The current file includes the follow-up authority-loss concurrency locks (`graduate_affairs_lock_authorized_staff_profile_id` / `graduate_affairs_lock_caller_authorized_staff_profile`) that were merged into the canonical source via PR #291 (`f799608a`) and then promoted into the migration via PR #299 (`5ae9b53c`). The supplied hash appears to pre-date that semantic sync.

**Decision:** The promotion package SHA is treated as authoritative. No source code was modified to force-match the stale hash, because doing so would remove the authority-lock follow-up and regress the security posture. This exception is recorded as a HOLD/risk item for human review before final approval.

Actual LF-normalized hashes of the three promoted migrations:

| Sequence | Migration | SHA256_LF_NORMALIZED_V1 |
|---|---|---|
| `20260808210000` | `supabase/migrations/20260808210000_ga_mvp_foundation_01.sql` | `3248cf641add2dde7f249eb366f5b7b9668ef028130d6f0caffb0936969e2f43` |
| `20260808210100` | `supabase/migrations/20260808210100_ga_mvp_completion_01.sql` | `3e37afbadd9b4c2ca4ec593ad47fae77b4333e62770f926598fcbf51336806fa` |
| `20260808210200` | `supabase/migrations/20260808210200_ga_authorization_04.sql` | `212865fb7c4077ce313a9b4707700520be275360b54470fd62fc08edd539060c` |

---

## A — Freeze Release Contract

Frozen artifacts:

- PR #291 SHA: `f799608a5d5fb167d66e5615d3f7b50692295f30` ✅
- PR #299 SHA: `5ae9b53ce7e69bd8b98fd06c8e3736f040514c92` ✅
- Foundation body hash: `3248cf641add2dde7f249eb366f5b7b9668ef028130d6f0caffb0936969e2f43` (actual)
- Completion body hash: `3e37afbadd9b4c2ca4ec593ad47fae77b4333e62770f926598fcbf51336806fa` (actual)
- AUTH04 body hash: `212865fb7c4077ce313a9b4707700520be275360b54470fd62fc08edd539060c` (actual; exception noted above)

Source drift relative to the promotion-package commit: **none** (working tree matches `5ae9b53c`).

---

## B — Exact Migration Order

| Order | Timestamp | Migration |
|---|---|---|
| 1 | `20260808210000` | `supabase/migrations/20260808210000_ga_mvp_foundation_01.sql` |
| 2 | `20260808210100` | `supabase/migrations/20260808210100_ga_mvp_completion_01.sql` |
| 3 | `20260808210200` | `supabase/migrations/20260808210200_ga_authorization_04.sql` |

No batch apply. One migration → post-verifier → STOP gate.

---

## C — Production Read-Only Preflight

**File:** `docs/migration-drafts/GA-PRODUCTION-PROMOTION-PREFLIGHT-01.sql`

Deterministic read-only runbook that checks:

- Migration ledger ordering and absence/presence of the three GA migrations
- Canonical `graduate_affairs` unit exists and is active
- Canonical roles exist and are active
- Required upstream schema objects exist
- Profile ambiguity
- Manager/specialist assignment readiness
- Department scope integrity
- Continuity policy readiness
- No mixed state between old/new authorization paths
- Feature flags source state (documented manual check)

**Execution:** Not executed against production because no safe authenticated production channel was available in this local worktree.

**Result:** `LIVE_READONLY_BLOCKED_CREDENTIALS`

---

## D — Local Exact Apply Rehearsal

**Script:** `scripts/ga-local-exact-rehearsal.sh`

Disposable PostgreSQL 17 chain:

```
required predecessor schema
→ Foundation
→ post-verifier
→ Completion
→ post-verifier
→ AUTH04
→ post-verifier
```

**Result:** `LOCAL_EXACT_APPLY_REHEARSAL_PASS`

All three post-verifiers emit their pass tokens:

- `FOUNDATION_POST_VERIFIER_PASS`
- `COMPLETION_POST_VERIFIER_PASS`
- `AUTH04_POST_VERIFIER_PASS`

---

## E — Failure / Partial State Rehearsal

**Script:** `scripts/ga-failure-matrix-rehearsal.sh`

| # | Scenario | Expected | Result |
|---|---|---|---|
| 1 | Foundation already applied | fail closed | ✅ PASS |
| 2 | Foundation absent but Completion attempted | fail closed | ✅ PASS |
| 3 | Completion absent but AUTH04 attempted | fail closed | ✅ PASS |
| 4 | Foundation applied then Completion failure (partial apply) | fail closed / HOLD | ✅ PASS |
| 5 | Foundation+Completion then AUTH04 failure (partial apply) | fail closed / HOLD | ✅ PASS |
| 6 | Full schema but config absent | CONFIG HOLD | ✅ PASS |
| 7 | Unit/role conflict | fail closed | ✅ PASS |
| 8 | Duplicate current continuity | CONFIG HOLD | ✅ PASS |
| 9 | Ambiguous staff identity | CONFIG HOLD | ✅ PASS |
| 10 | Wrong department scope | CONFIG HOLD | ✅ PASS |

**Result:** `LOCAL_FAILURE_MATRIX_REHEARSAL_PASS` (10/10)

Partial-state safety is also covered by `docs/migration-drafts/GA-PRODUCTION-PROMOTION-ROLLBACK-BY-FORWARD-01.sql` for scenarios A, B, and C.

---

## F — Operational Config Dry Run

**File:** `docs/migration-drafts/GA-PRODUCTION-PROMOTION-CONFIG-01.sql`

Controlled configuration scripts with `DRY RUN` defaults for:

- Manager assignment (exactly one active staff profile, revocable)
- Specialist assignment (exact authorizing profile/department pair)
- Department scope
- Continuity policy (exactly one current approved policy)

**Execution:** Not executed against production. Local dry-run rehearsal against disposable PG17 confirms `CONFIG_PACKAGE_DRY_RUN_COMPLETE`.

---

## G — Full Production-Later E2E Package

**File:** `tests/graduates-affairs/ga-production-promotion-e2e-matrix.test.ts`

Deterministic E2E actor matrix:

- manager
- specialist
- graduate self
- other graduate
- revoked graduate
- corrected graduate
- wrong-department specialist
- expired assignment
- inactive staff
- ambiguous profile
- admin
- dean
- registrar
- anonymous

Every denial is verified to produce zero mutation. Coverage includes authority revocation concurrency (forward/reverse race).

**Result:** 7/7 Docker-based PG17 matrix legs pass (see section K).

---

## H — Flags / Release Package

**File:** `docs/migration-drafts/GA-PRODUCTION-PROMOTION-FLAGS-01.md`

Flags remain OFF in `src/lib/portal-features.ts`:

- `staffGraduatesAffairs: false`
- `studentGraduatesAffairs: false`

Later activation sequence:

1. Set `staffGraduatesAffairs: true`
2. Build
3. Staff smoke / E2E
4. Set `studentGraduatesAffairs: true`
5. Build / deploy
6. Student smoke

Rollback artifact to previous flags-off state is included.

---

## I — Observability

**File:** `docs/migration-drafts/GA-PRODUCTION-PROMOTION-OBSERVABILITY-01.sql`

Read-only post-apply checks covering:

- Graduate record count (aggregate)
- Continuity currentness
- Active manager/specialist assignments
- Unscoped specialists
- Active follow-ups
- Pending moderation opportunities
- Graduate domain event count
- Continuity policy state distribution
- Feature flags source reminder

**Result:** `OBSERVABILITY_PACKAGE_PASS` against disposable PG17.

---

## J — Merge Order Simulation

Simulated locally:

1. `main` + PR #291 (`f799608a`) → `tmp/main-with-291` — **no conflicts**
2. Rebase PR #299 (`5ae9b53c`) onto `tmp/main-with-291` → `tmp/prep-ga-rebased` — **no conflicts**

**Result:** `MERGE_SIMULATION_PASS`

Planned merge order:

1. Merge PR #291 into `main`
2. Rebase/retarget PR #299 onto `main`
3. Merge PR #299 into `main`

---

## K — Full Regression

| Check | Command | Result |
|---|---|---|
| GA tests | `bun test tests/graduates-affairs` | **161 pass, 0 fail** |
| GP regression | `bun test tests/graduation-projects` | **115 pass, 0 fail** |
| Student request regression | `bun test tests/student-requests` | **1066 pass, 0 fail** |
| TypeScript | `bunx tsc --noEmit` | **clean** |
| Build | `bun run build` | **clean** |
| Diff check | `git diff --check` | **clean** |

---

## L — Stacked PR

- **PR #299:** https://github.com/msorori-mh/saba-uni-portal/pull/299
- **Title:** `prep(ga): final production readiness and operator package`
- **Base:** `fix/graduates-affairs-multimodel-remediation-01`
- **NOT merged.**

This mission adds the following source-only artifacts to the promotion package branch:

- `docs/reviews/PORTAL-GA-FINAL-PRODUCTION-READINESS-LONGRUN-14.md`
- `docs/migration-drafts/GA-PRODUCTION-PROMOTION-OBSERVABILITY-01.sql`
- `scripts/ga-local-exact-rehearsal.sh`
- `scripts/ga-failure-matrix-rehearsal.sh`

**CI Run:** https://github.com/msorori-mh/saba-uni-portal/actions/runs/31277429566
- Conclusion: `success`
- All jobs passed, including the three promoted GA migration post-verifier legs and the follow-up authority-race verifier.
- Only annotations are non-blocking Node.js 20 deprecation warnings from `actions/checkout@v4`.

---

## Safety Attestations

| Item | Value |
|---|---|
| `PRODUCTION_READS` | 0 — no production catalog/ledger verification was performed |
| `PRODUCTION_WRITES` | 0 |
| `MIGRATION_APPLIED` | NO — all migrations remain source-only candidates |
| `FLAGS_ENABLED` | NO — both `staffGraduatesAffairs` and `studentGraduatesAffairs` remain OFF |
| `DEPLOY` | NO |
| `PUBLISH` | NO |
| `MERGE` | NO — PR #299 remains open and unmerged |

---

## Files Changed by This Mission

```
docs/reviews/PORTAL-GA-FINAL-PRODUCTION-READINESS-LONGRUN-14.md
docs/migration-drafts/GA-PRODUCTION-PROMOTION-OBSERVABILITY-01.sql
scripts/ga-local-exact-rehearsal.sh
scripts/ga-failure-matrix-rehearsal.sh
```

## Decision

`PASS` — the Graduates Affairs final production-readiness package is prepared. The stacked PR is open, all local verifiers pass, and no production mutation has occurred. The AUTH04 hash exception must be explicitly acknowledged by the approving reviewer before merge.
