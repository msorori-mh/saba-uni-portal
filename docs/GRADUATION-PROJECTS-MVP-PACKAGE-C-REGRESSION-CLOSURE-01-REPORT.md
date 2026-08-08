# GRADUATION-PROJECTS-MVP-PACKAGE-C-REGRESSION-CLOSURE-01 — Report

Mode: **IMPLEMENT AND VERIFY** — test/baseline/report scope only  
No production connection · No migration edit · No deploy · No publish · No GP runtime/UI redesign

## Decision

`PASS_GRADUATION_PROJECTS_MVP_PACKAGE_C_REGRESSION_CLOSED`

## Base Package C SHA

`7a031f71a315d5e63b36412b8756fd95a2d4bdf7`

## Frozen contract SHA

`7b67539aeb21bd223287de39d480cb1e6c0332b0`

## Branch and final SHA

| Item | Value |
|---|---|
| Branch | `fix/gp-mvp-package-c-regression-closure-01` |
| Test-baseline commit | `d24e37f3658e799d1a79b916c701b7c8c013daad` |
| Report commit | `40d11e43eec06a89a9e1dc244693592f6ae9d9ec` |
| Branch tip at delivery | recorded by `git rev-parse HEAD` after the final push (agent return) |

## Released visibility evidence used

| Evidence | Detail |
|---|---|
| Release merge commit | `b71016d6f706cfe01dd1f402338e5d56a83184d8` — message **Released B1 five services** |
| Authoritative migration | `supabase/migrations/20260806005924_4229a88b-abae-40c9-b3cc-054b5b011240.sql` |
| Precondition | five codes must already be `is_active=true` and `student_visible=false` (`B1_RELEASE_PRECONDITION_MISMATCH`) |
| Terminal write | `UPDATE … SET student_visible = true, updated_at = now()` for exactly the five codes |
| Post-check | all five must remain `student_visible=true` **and** `is_active=true` (`B1_RELEASE_POST_HIDDEN`) |
| Certificate guard | `enrollment_certificate` must remain `(is_active AND student_visible)` (`B1_RELEASE_EC_STATE_CHANGED`) |
| Non-target guard | no other `request_types` row touched (`B1_RELEASE_NON_TARGET_TOUCHED`) |

Intentional released terminal state for:

- `enrollment_suspension`
- `excused_absence`
- `department_transfer`
- `final_chance`
- `file_withdrawal`

is **`is_active=true`** and **`student_visible=true`**.

`enrollment_certificate` remains **active and visible** (asserted by the release migration; not mutated).

## Old and new visibility expectation

| | Expectation |
|---|---|
| **Old** | After ordered migration replay, terminal `student_visible` polarity for each of the five = `false` (B1-34 as last writer; later migrations must not re-expose) |
| **New** | After ordered migration replay, terminal `student_visible` polarity for each of the five = `true`, with terminal writer `20260806005924_…`. B1-34 remains the fail-closed hide step before release. No later migration may rewrite the five. `enrollment_certificate` stays active + visible. |

Migration SQL and production data were **not** edited.

## Old and new route-tree hash

| | `ROUTE_SEMANTIC_SHA256` |
|---|---|
| **Old** | `9398af9135d6d5c31c0de48e02dce3a9325c1cc0cc7f7a439be5a529ad9262e7` |
| **New** | `b143b0faf8753617bffa64019cb0ecab4b23a6b44065e8a6eb04fd0724b9a5dd` |

`bun run build` regenerated/validated the TanStack route tree; working tree left `src/routeTree.gen.ts` unchanged (already matched build output). Semantic hash after build: `b143b0fa…` (stable).

## Exact five routes verified

Frozen GP fullPaths asserted present:

1. `/student/graduation-projects`
2. `/student/graduation-projects/$projectId`
3. `/faculty-portal/graduation-projects`
4. `/faculty-portal/graduation-projects/$projectId`
5. `/admin/graduation-projects`

Semantic `fullPath` delta vs frozen contract `7b67539a` (`src/routeTree.gen.ts`):

| Change | Paths |
|---|---|
| Added | the five frozen GP routes above, plus generated layout index children `/student/graduation-projects/` and `/faculty-portal/graduation-projects/` |
| Removed | _(none)_ |
| Renamed | _(none)_ |

No unrelated non-GP route was added, removed, or renamed.

## Changed files

| File | Change |
|---|---|
| `tests/student-requests/b1-five-services-terminal-visibility-34.test.ts` | Align terminal polarity + explanations to released `student_visible=true`; preserve EC |
| `tests/student-requests/tanstack-register-stable-augmentation-01.test.ts` | Pin new semantic hash; assert five frozen GP routes (+ index children) |
| `docs/GRADUATION-PROJECTS-MVP-PACKAGE-C-REGRESSION-CLOSURE-01-REPORT.md` | This closure report |

No GP runtime/component/route behavior files changed. No migrations changed.

## Focused test results

```
bun test tests/student-requests/b1-five-services-terminal-visibility-34.test.ts \
         tests/student-requests/tanstack-register-stable-augmentation-01.test.ts
```

- **15 pass / 0 fail** across 2 files (111 expect calls)

## Full student-request test count

```
bun test tests/student-requests
```

- **1066 pass / 0 fail** across 98 files (7906 expect calls)

## GP test count

```
bun test tests/graduation-projects
```

- **56 pass / 0 fail** across 5 files (487 expect calls)

## Typecheck / build / diff results

| Command | Result |
|---|---|
| `bunx tsc --noEmit` | **PASS** |
| `bun run build` | **PASS** (`✓ built in 12.21s`; Register footer present; route tree clean) |
| `git diff --check` | **PASS** |

## Explicit zero production impact

- No production Supabase connection
- No migration apply or SQL edit
- No deploy / publish
- No change to production `request_types` rows or any live data
- No GP runtime, component, adapter, or route-module behavior change
- Source-only alignment of stale regression baselines to already-released / already-landed Package C state

## Assumptions

- Commit `b71016d6` + migration `20260806005924_…` are the authoritative completed five-services release writers already present on the Package C base ancestry.
- Generated student/faculty GP index routes are normal TanStack file-route children of the five frozen surfaces, not unrelated product routes.

## Risks

- Low: future layout-only route generation churn could retouch the semantic hash; the stability test remains fail-closed and must be re-pinned deliberately.

## Barriers

- None. Dependencies were installed locally to run UI/GP suites; install artifacts were not committed.

## Decision banner

# PASS_GRADUATION_PROJECTS_MVP_PACKAGE_C_REGRESSION_CLOSED
