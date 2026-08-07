# GP-STUDENT-LEVEL4-ONLY-ELIGIBILITY-GUARD-01 — Report

**Decision:** `PASS_GP_STUDENT_LEVEL4_ONLY_GUARD_CODEX_CI_REMEDIATED_REVIEW_SHA_READY`

**Mission:** `GP-STUDENT-LEVEL4-ONLY-GUARD-CODEX-CI-REMEDIATION-02`  
**Worktree:** `C:/projects/saba-uni-portal-gp-l4-eligibility-20260807`  
**Branch:** `fix/gp-student-level4-only-eligibility-guard-01`  
**PR:** `#290`  
**Base:** `origin/main` @ `4a6e16b9`  
**Old review SHA:** `b17b6cebc939cbb814d7b3d23dadfe4fa72e3e3d`  
**Mode:** TARGETED REMEDIATION + TESTS — no production apply / deploy / publish

---

## Codex findings and remediation

| Finding | Defect | Remediation | Status |
|---|---|---|---|
| FINDING_001 | Tied top academic-status rows (incl. L4/L4) accepted via distinct-level count | Require `v_top_rows = 1`; orphan/null/missing deny | FIXED |
| FINDING_002 | Global staff/coordinator exemption unlocked all student projects | Per-project list/detail filtering; dual-role isolation | FIXED |
| FINDING_003 | Signed-download replay returned payload before authz | Authz first; bind replay to `actor_user_id` | FIXED |
| FINDING_004 | Pending storage intent remained uploadable after demotion | `can_upload` re-checks student L4; staff path unchanged | FIXED |
| FINDING_005 | Dashboard used `created_at`-only status order | Shared canonical resolver (`updated_at`, `created_at`, uniqueness) | FIXED |
| FINDING_006 | CI GP foundation/lifecycle used superseded drafts → A3 RPCs missing | CI chains now apply Package A1/A2/A3 + storage fix | FIXED |

## CI failures and root causes

1. **PG 17 graduation-projects-foundation / lifecycle**  
   Root cause: workflow applied superseded `GRADUATION-PROJECTS-MVP-FOUNDATION-01` (+ lifecycle completion) which never creates `create_graduation_project_team`. Verifier correctly raised `A3 lifecycle RPCs missing`.  
   Fix: point both chains at Package A migrations + storage insert fix.

2. **Bun tests — storage insert remediation**  
   - Shallow clone could not `git rev-parse fe4da88a:...` → pin reviewed blob hash.  
   - Race: `pg_isready` alone before schema apply → wait for `select 1` probe; use `postgres:17`.

3. **Whitespace**  
   Report rewritten without trailing whitespace; `git diff --check` must pass.

## AUTHORITATIVE_LEVEL_SOURCE

`public.student_academic_status.level_id` → `public.academic_levels.level_number`

Ordering: `updated_at DESC NULLS LAST, created_at DESC`.  
Exactly one top-rank row required; any tie/ambiguity denies.

## LEVEL4_PREDICATE

`public.student_is_current_fourth_academic_level(p_student_profile_id uuid) returns boolean`

Fail-closed when profile null, no status row, null `level_id`, orphan level row, `v_top_rows <> 1`, or `level_number <> 4`.

## NAV / ROUTE / BACKEND PARITY

- Dashboard + route guard use `resolveCanonicalCurrentFourthLevelEligibility` with the same ordering/uniqueness semantics.
- GP nav hidden while loading / ambiguous / non-L4 (no transient link).
- Backend SQL remains authoritative.

## DUAL_ROLE

Staff role on project B never unlocks student project A. List filters per assignment; detail uses per-project `require_student_actor_gp_fourth_level`.

## SIGNED_DOWNLOAD_REPLAY

All auth checks run before any replayed storage coordinates. Replay requires matching `actor_user_id`. Demotion / ended assignment / unknown level invalidate replay.

## STORAGE_INSERT

`can_upload_graduation_project_object` re-checks current L4 for student upload assignments at INSERT time. Staff/faculty assignments unchanged. Bucket remains private.

## Migration plan (NOT APPLIED)

1. Pre-req: Package A1/A2/A3 (+ storage insert fix) already present.
2. Apply single draft:  
   `docs/migration-drafts/GRADUATION-PROJECTS-STUDENT-LEVEL4-ONLY-ELIGIBILITY-GUARD-01.sql`
3. Suggested future migration name (when explicitly approved):  
   `supabase/migrations/20260807210000_gp_student_level4_only_eligibility_guard_01.sql`
4. Re-run disposable PG17 L4 verifier + Package A verifier.

## FILES_CHANGED (remediation-02)

- `.github/workflows/ci.yml`
- `docs/migration-drafts/GRADUATION-PROJECTS-STUDENT-LEVEL4-ONLY-ELIGIBILITY-GUARD-01.sql`
- `docs/PORTAL-GP-STUDENT-LEVEL4-ONLY-ELIGIBILITY-GUARD-01-REPORT.md`
- `src/lib/graduation-projects/eligibility.ts`
- `src/routes/student.index.tsx`
- `src/routes/student.graduation-projects.tsx`
- `tests/graduation-projects/postgres-student-level4-eligibility-guard-verifier.sql`
- `tests/graduation-projects/graduation-projects-student-level4-eligibility-guard.test.ts`
- `tests/graduation-projects/gp-storage-insert-policy-remediation.test.ts`

## TEST_RESULTS

- L4 guard Bun + disposable PG17 verifier — PASS
- Package A foundation verifier — `PACKAGE_A_FOUNDATION_VERIFIER_PASS`
- Package A lifecycle verifier — `PACKAGE_A_VERIFIER_PASS`
- Storage insert remediation PG17 — PASS
- RPC contract drift / Package A SQL draft tests — PASS
- `bunx tsc --noEmit` — PASS
- `bun run build` — PASS
- `git diff --check` — PASS

## Matrix

| Case | Result |
|---|---|
| LEVEL1/2/3/UNKNOWN | DENY |
| AMBIGUOUS / DUPLICATE L4/L4 / CONFLICTING L4/L3 | DENY |
| CREATED_AT vs UPDATED_AT conflict | Canonical updated_at wins |
| LEVEL4_POSITIVE | ALLOW |
| FORGED_CLIENT_L4 | IGNORED |
| DUAL_ROLE_CROSS_PROJECT | ISOLATED |
| L4 leader + lower member | DENY member add |
| SIGNED_DOWNLOAD replay negatives | DENY |
| STORAGE intent then demotion | DENY |
| STAFF / COORDINATOR / SUPERVISOR / COMMITTEE | UNCHANGED |
| ARCHIVED_IMMUTABILITY | UNCHANGED |
| ZERO_SIDE_EFFECT_DENIAL | PASS |

## Assumptions

- One authoritative current academic-status snapshot per student; ties deny.
- Dual-role actors are evaluated per project assignment.
- Historical non-L4 membership rows are not rewritten; student-facing RPCs deny.

## Risks

- Draft not yet applied to production; UI guards alone are insufficient until SQL apply.
- Students who drop below L4 mid-project lose student-facing GP capability while evidence remains for staff.

## Production impact

- None in this mission (source-only).

## Controls

```
PRODUCTION_RPC_CALLS: 0
PRODUCTION_WRITES: 0
MIGRATION_APPLIED: NO
DEPLOY: NO
PUBLISH: NO
```
