# GP-STUDENT-LEVEL4-ONLY-ELIGIBILITY-GUARD-01 — Report

**Decision:** `PASS_GP_STUDENT_LEVEL4_ONLY_GUARD_SOURCE_READY`

**Worktree:** `C:/projects/saba-uni-portal-gp-l4-eligibility-20260807`  
**Branch:** `fix/gp-student-level4-only-eligibility-guard-01`  
**Base:** `origin/main` @ `4a6e16b9`  
**Mode:** SOURCE AUDIT + TARGETED REMEDIATION — no production apply / deploy / publish

---

## AUTHORITATIVE_LEVEL_SOURCE

`public.student_academic_status.level_id` → `public.academic_levels.level_number`

Ordering matches `get_student_request_eligibility_context`:
`updated_at DESC NULLS LAST, created_at DESC`.

Not used for authorization: client level, route params, UI labels, display text alone, browser cache.

## LEVEL4_PREDICATE

`public.student_is_current_fourth_academic_level(p_student_profile_id uuid) returns boolean`

Fail-closed when profile null, no status row, null `level_id`, missing level row, ambiguous top snapshot, or `level_number <> 4`.

Raising wrapper: `public.require_student_gp_fourth_level_eligibility(...)`.

## NAV_GUARD

Student dashboard (`src/routes/student.index.tsx`) hides Graduation Projects service link unless current `level_number === 4` from DB-backed academic status.

Faculty/admin GP nav unchanged.

## ROUTE_GUARD

`src/routes/student.graduation-projects.tsx` `beforeLoad` loads authoritative `student_academic_status` → `academic_levels` and redirects non-L4 / unknown to `/student`.

## RPC_GUARD

Source-only draft wires L4 into:

- `require_graduation_project_leader`
- `gp_team_mutator` (student-leader path)
- `create_graduation_project_team` (leader target, before inserts)
- `add_graduation_project_team_member` (member target, before insert)
- `list_my_graduation_projects`
- `get_graduation_project_detail`
- `create_graduation_project_signed_download`

Leader write RPCs (proposal/progress/final/files) inherit via `require_graduation_project_leader`.

## TEAM_MEMBER_GUARD

Every student member must be current L4 at create/add. L4+L4 allow; L4+L3 deny; L3 leader create deny; unknown deny. Denials occur before mutating inserts.

## STORAGE_VERDICT

No storage redesign. Private bucket + assignment-bound upload predicate retained. Non-L4 cannot gain object access by path alone; student downloads require L4 on student-only actor path.

## Matrix

| Case | Result |
|---|---|
| LEVEL1_NEGATIVE | DENY (nav/route/RPC) |
| LEVEL2_NEGATIVE | DENY |
| LEVEL3_NEGATIVE | DENY |
| UNKNOWN_LEVEL_NEGATIVE | DENY |
| LEVEL4_POSITIVE | ALLOW subject to existing GP auth |
| ZERO_SIDE_EFFECT_DENIAL | PASS (create/add deny before inserts) |
| STAFF_BEHAVIOR_UNCHANGED | PASS (coordinator detail/admin denial unchanged) |
| ARCHIVED_IMMUTABILITY_UNCHANGED | PASS (historical evidence retained; student-facing access denied) |

## Migration plan (NOT APPLIED)

1. Pre-req: Package A1/A2/A3 (+ storage insert fix) already present.
2. Apply single draft:
   `docs/migration-drafts/GRADUATION-PROJECTS-STUDENT-LEVEL4-ONLY-ELIGIBILITY-GUARD-01.sql`
3. Suggested future migration name (when explicitly approved):
   `supabase/migrations/20260807210000_gp_student_level4_only_eligibility_guard_01.sql`
4. Re-run disposable PG17 L4 verifier + Package A verifier.

## FILES_CHANGED

- `docs/migration-drafts/GRADUATION-PROJECTS-STUDENT-LEVEL4-ONLY-ELIGIBILITY-GUARD-01.sql`
- `src/lib/graduation-projects/eligibility.ts`
- `src/lib/graduation-projects/errors.ts`
- `src/lib/graduation-projects/index.ts`
- `src/routes/student.index.tsx`
- `src/routes/student.graduation-projects.tsx`
- `src/routeTree.gen.ts` (build regen)
- `tests/graduation-projects/postgres-minimal-schema.sql`
- `tests/graduation-projects/postgres-student-level4-eligibility-guard-verifier.sql`
- `tests/graduation-projects/graduation-projects-student-level4-eligibility-guard.test.ts`

## TEST_RESULTS

- `bunx tsc --noEmit` — PASS
- `bun test` L4 guard suite — PASS (6/6, includes disposable PG17)
- Package A verifier after L4 draft — `PACKAGE_A_VERIFIER_PASS`
- Storage insert remediation PG17 — PASS (prior chain still green)
- `bun run build` — PASS
- `git diff --check` — PASS

## Assumptions

- One current academic-status snapshot per student is determined by the shared ordering above; ambiguous top snapshots deny.
- Faculty users do not rely on `student_profiles` for GP access.
- Historical non-L4 membership rows are not rewritten; student-facing RPCs deny instead.

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
ENDING_SHA: 4a6e16b9 (base; changes uncommitted)
```
