# PORTAL-PR240-INDEPENDENT-DASHBOARD-TRUTHFULNESS-REVIEW-01

## Baseline

- Repository: `msorori-mh/saba-uni-portal`
- PR: `#240`
- Head: `3319c907fda090a74668b16d8a8006d2f5e4878d`
- Base: `main`
- Base OID: `92d51faa9bcdc9fd99e89579f6a498b463264246`
- Review branch: `review/pr240-dashboard-truthfulness-codex-01`

GitHub reported the PR OPEN and MERGEABLE. `mergeStateStatus=BLOCKED` is an
external branch/check gate, not a source merge conflict.

## Reviewed metrics and states

The student, faculty, and administration dashboards were reviewed for:

- student enrollments, grades, academic status, and schedule;
- faculty teaching schedule and section students;
- administration academic counts, operations, schedules, documents, active
  users, communications, automation, pilot metrics, and readiness cards;
- unavailable system-health and pending-event figures.

The metric helper preserves a genuine numeric zero and maps pending, error,
null, and undefined values to unavailable. Unavailable metrics render `—` with
the accessible label `القيمة غير متاحة`. No fabricated health, backup,
recovery, or pending-event number remains.

## Findings and remediation

### HIGH — stale identity-scoped dashboard data could survive logout

Student and faculty profile query keys are stable (`me`) and have non-zero
stale time. Logout did not clear React Query, so a subsequent user in the same
browser session could briefly receive cached data from the prior identity.

Remediation: both dashboard logout handlers clear the query client immediately
after successful sign-out and before navigation.

### MEDIUM — loading lists rendered false empty states

Student enrollments and the faculty teaching schedule defaulted query data to
an empty array without checking loading. The UI could therefore state that no
records exist while the query was still pending.

Remediation: both sections now render explicit `aria-busy` loading states
before evaluating error or empty state.

### MEDIUM — successful null profile caused an infinite skeleton

A resolved profile query returning null was grouped with loading. Missing or
unauthorized profiles therefore left the dashboard skeleton visible forever.

Remediation: `isFetched && !profile` is handled as a safe retryable profile
error. No broader role or fallback dashboard is opened.

### MEDIUM — student schedule did not expose four truthful states

The schedule section returned nothing for an empty result and did not surface
academic-status or schedule query failures.

Remediation: the section now distinguishes loading, error, empty, and success.
Retry targets the failed academic-status query or schedule query only.

### MEDIUM — readiness and recent documents could misclassify pending data

Administrative account readiness used zero fallbacks while its query was
pending, which could display a false FAIL. Recent documents interpreted
pending undefined data as an empty successful list.

Remediation: pending readiness is WARNING with `جارٍ التحقق`; pending recent
documents has an explicit loading state. Errors remain WARNING/error, never
false FAIL/empty.

### LOW — error and metric accessibility lacked focus/live semantics

Remediation: shared errors now receive focus, `role=alert`,
`aria-live=assertive`, RTL, and an accessible retry label. Dynamic metrics use
`aria-live=polite`; unavailable punctuation has a meaningful accessible name.

All HIGH/MEDIUM findings are closed.

## Loading / empty / error / success matrix

| Section | Loading | Empty | Error | Success |
| --- | --- | --- | --- | --- |
| Student profile | skeleton | treated as safe profile error | retryable safe error | profile cards |
| Registered courses | busy skeleton | explicit genuine-empty copy | retryable safe error | enrollment cards |
| Grades | spinner | explicit genuine-empty copy | retryable safe error | grade rows |
| Student schedule | busy skeleton | explicit no-schedule copy | targeted retry | schedule by day |
| Faculty profile | skeleton | treated as safe profile error | retryable safe error | profile cards |
| Teaching schedule | busy spinner | explicit genuine-empty copy | targeted retry | section cards |
| Section students | spinner | explicit genuine-empty copy | targeted retry | authorized student rows |
| Recent documents | loading copy | explicit genuine-empty copy | safe error | document table |
| Admin metrics | `—` | real numeric zero | `—` plus partial-error banner | numeric value |
| Readiness | WARNING | not inferred from missing data | WARNING | authoritative PASS/WARNING/FAIL |

## Privacy and role isolation

- No raw `error.message`, SQL/RPC error, table/function name, UUID, `user_id`,
  or `profile_id` is rendered by the new shared presentation components.
- The `sb.from` typo is absent; grade reads use the configured client.
- Student reads remain filtered by the authoritative student profile.
- Faculty teaching and section reads remain filtered by the faculty profile
  and assigned section; no cross-department or admin fallback was added.
- Disabled queries are not interpreted as successful empty results.
- No direct Supabase import was added to either shared presentation component.
- Cached identity-scoped data is cleared on logout.
- Retry handlers refetch only the failed query or, in the admin aggregate
  banner, only entries whose query state is error.

No Backend, RPC, SQL, RLS, migration, B1, or enrollment-certificate file was
changed.

## RTL, accessibility, and responsive review

- Student and faculty dashboard roots remain `dir=rtl`.
- Error blocks use semantic alerts, focus, live announcement, and accessible
  retry controls.
- Metrics communicate unavailable state to screen readers and do not rely on
  color.
- Readiness cards include textual PASS/WARNING/FAIL status.
- Existing single-column mobile grids, wrapping controls, minimum 44px retry
  target, truncation, and horizontal document-table containment remain
  suitable for a 360px viewport.

## Verification

- `bun install --frozen-lockfile`: PASS; no dependency changes.
- `bun test tests/dashboards`: 25 pass, 0 fail, 72 expectations.
- `bun test tests`: 1,567 pass, 0 fail, 13,794 expectations.
- `bunx tsc --noEmit`: PASS; zero errors, therefore no increase over base.
- ESLint on all dashboard files modified by this review: PASS.
- `bun run build`: PASS (`BUILD_EXIT=0`).
- `git diff --check`: PASS.

The build-generated `routeTree.gen.ts` footer was removed from the review diff;
the generated route tree is not part of this dashboard remediation.

## Files modified by the independent review

- `src/components/portal/DashboardStates.tsx`
- `src/routes/admin/index.lazy.tsx`
- `src/routes/faculty-portal.index.tsx`
- `src/routes/student.index.tsx`
- `tests/dashboards/dashboards-truthfulness-qa-01.test.ts`
- `docs/PORTAL-PR240-INDEPENDENT-DASHBOARD-TRUTHFULNESS-REVIEW-01-REPORT.md`

The three dashboard route files were normalized only as required for scoped
Prettier/ESLint; the semantic changes are limited to the findings above.

## Assumptions, risks, blockers, and production impact

- Assumption: RLS and existing server functions remain the authoritative
  enforcement boundary; this source-only review did not alter them.
- Remaining risk: no browser screenshot suite is configured, so 360px behavior
  is verified from responsive classes and overflow containment rather than a
  visual browser artifact.
- Blockers: none in source or local verification.
- Production impact: none. No Production or Staging access, migration apply,
  deploy, publish, Backend/SQL change, or data mutation occurred.

## Decision

`PASS_PR240_INDEPENDENT_DASHBOARD_TRUTHFULNESS_REVIEW`
