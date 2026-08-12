# PORTAL-ZERO-OMISSION-MASTER-E2E-PHASE1-TO-FINAL-03 — Evidence Ledger

MODE: AUTONOMOUS PRODUCTION (DEMO_ONLY + TEST_ONLY)
Deployed SHA at capture time: `5ec7f90a` (parity verified)

## GATE 1A — STUDENT_REQUESTS DIRECT-MUTATION SECURITY

Actor: `demo.student.active@testonly.invalid` (real authenticated session, REST/PostgREST direct).
Target: TEST_ONLY ephemeral request `82378829-fc34-4d92-aa92-4c046935f1ea` (owned by the actor).

### Defect discovered and fixed (forward-only)
`public.protect_student_request()` pinned `submitted_at`, `reviewed_by`, `reviewed_at`,
`rejection_reason` on the `draft -> draft` path but did **not** pin `cancelled_at` /
`completed_at`, and the `returned -> returned` path pinned almost nothing.
A student could therefore fabricate lifecycle timestamps on a draft/returned request.

Remediation migration: `protect_student_request` hardened — `cancelled_at`, `completed_at`,
`submitted_at`, `reviewed_by`, `reviewed_at`, `rejection_reason` are now forced to `OLD`
values on every student-editable path; the cancel path still stamps `cancelled_at := now()`.
Student-editable fields (`title`, `description`, `form_data`, student notes) unchanged.

### Post-fix matrix — DRAFT state
| Attempt | HTTP | Lifecycle fields changed | Result |
|---|---|---|---|
| fabricate `submitted_at` | 200 | none | DENY (neutralized) |
| fabricate `cancelled_at` | 200 | none | DENY (neutralized) |
| fabricate `rejection_reason` | 200 | none | DENY (neutralized) |
| mutate `request_type` | 200 | none | DENY (neutralized) |
| `draft -> submitted` | 403 | none | DENY |
| `draft -> in_review` | 400 | none | DENY |
| `draft -> approved` | 400 | none | DENY |
| `draft -> completed` | 400 | none | DENY |
| `draft -> rejected` | 400 | none | DENY |
| `draft -> archived` | 400 | none | DENY |
| legitimate title edit | 200 | none (title updated) | ALLOW (expected) |

### Post-fix matrix — SUBMITTED state
Request submitted through the authoritative path
(`save_b1_request_draft_for_student` → `submit_b1_student_request_atomic`, HTTP 200,
workflow initialized, active step `a1a57a64-…`).

| Attempt | HTTP | Changed | Result |
|---|---|---|---|
| `submitted -> draft` | 400 | none | DENY |
| `submitted -> completed` | 400 | none | DENY |
| `submitted -> approved` | 400 | none | DENY |
| `submitted -> rejected` | 400 | none | DENY |
| `submitted -> archived` | 400 | none | DENY |
| `submitted -> in_review` | 400 | none | DENY |
| fabricate `submitted_at` | 400 | none | DENY |
| fabricate `rejection_reason` | 400 | none | DENY |
| fabricate `cancelled_at` | 400 | none | DENY |
| mutate `request_type` | 400 | none | DENY |
| mutate `form_data` after submit | 400 | none | DENY |
| read own workflow steps via REST | 200 | `[]` (no direct exposure) | scoped |

`BYPASS_COUNT = 0` in both states.

**GATE_1A_STUDENT_REQUESTS_DIRECT_MUTATION = PASS**

## CAMPAIGN-S — STUDENT PORTAL DISCOVERY (live production, authenticated)

| Route | HTTP/Render | Buttons | Inputs | Tables/Rows | Console errors |
|---|---|---|---|---|---|
| /student | render | 3 | 0 | 0 | 0 |
| /student/study-plan | render | 5 | 0 | 0 | 0 |
| /student/schedule | render (timetable populated) | 4 | 0 | 1 | 1 → fixed |
| /student/materials | render (FITCS01, 4 published sessions) | 4 | 0 | 0 | 0 |
| /student/progress | render | 4 | 0 | 4/41 | 0 |
| /student/requests | render | 4 | 0 | 1/2 | 0 |
| /student/requests/new | render (service picker + eligibility) | 4 | 0 | 0 | 0 |
| /student/notifications | render | 4 | 1 | 0 | 0 |
| /student/reports | render | 6 | 4 | 0 | 0 |
| /student/graduation-projects | redirect → /student (gated, expected) | — | — | — | 0 |
| /student/graduates-affairs | render (deny screen: no graduate record — expected) | 4 | 0 | 0 | 0 |
| /student/change-password | render | 5 | 2 | 0 | 0 |

`STUDENT_ROUTE_404 = 0`.

### Defect S-01 — audit logging silently failing from the browser
`public.log_audit` is executable only by `postgres` / `service_role`; three client modules
called it directly and always received **403** (`/student/schedule` produced a visible
console error, and admin progress/at-risk/graduation-candidates export audits were lost).

Remediation (source, forward-only):
- new `src/lib/schedule-audit.functions.ts` (`logScheduleEvent`, `requireSupabaseAuth` + service-role write)
- new `src/lib/academic-audit.functions.ts` (`logAcademicEvent`, same pattern)
- `src/lib/schedule-export.ts` and `src/lib/academic-status.ts` now route through the
  server functions instead of the client RPC; unused client imports removed.

No database grant was widened — `log_audit` remains non-executable for `authenticated`.

`CLIENT_AUDIT_403 = 0 (source-fixed, pending redeploy)`
