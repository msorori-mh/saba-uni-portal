# PORTAL-FINAL-WEB-GO-LIVE-AND-E2E-01 — Execution Record

SOURCE_HEAD: `735513114445165fbf169576c3f2bd6c7c07ebe0`
Production migration ledger head: `20260813213024` (unchanged — no migration applied in this mission)

## Phase 0 — Freeze + Release Preflight — PASS
- ACTIVE_SECTIONS_WITH_NULL_STUDY_SYSTEM = 0
- `course_materials_derive_scope_trg` enabled
- `cdp_instantiate_from_syllabus(uuid)` EXECUTE revoked from PUBLIC/anon/authenticated, granted to service_role
- Release regressions: 2281 pass / 2 fail (both recorded Medium non-blocking: stale PWA expectation, D02 harness missing doc SQL)
- Typecheck PASS · Security scan: 0 critical/high

## Phase 1 — Final Web Deploy — PASS
Published to https://quboolye.com. Smoke: `/`, `/portal-login`, `/student`, `/faculty`, `/admin`, `/mobile/student-login` → 200.

## Phase 2 — DEMO tuple
- Section: `b4f00f2e-aec2-404a-8ac6-a3aae3737791` (DEMO-FITCS03 — برمجة الحاسوب (1)), study_system = general
- Faculty: `demo.faculty@testonly.invalid` (`7ec21400-…`)
- Student: `demo.student.active@testonly.invalid` (`e5d8757c-…`, نورة عبدالله — DEMO-2026-0001)
- Admin: `demo.admin@testonly.invalid`

## Phase 3 — Academic production E2E (real UI on quboolye.com) — PASS
| Step | Evidence |
|---|---|
| Syllabus import (Import Center → توصيف المقررات) | 6 rows / 1 course validated, draft version 1 created |
| Duplicate protection | Re-import of identical file created no second version (1 row in `course_syllabi`) |
| Approval | Version 1 → معتمد (الحالي) |
| Auto plan instantiation | Plan `203461ef-…` published with **6** sessions — NOT 14; no hardcoded session count |
| Faculty execution | Session 1 = executed (2026-08-10), session 2 = postponed + reason; `recorded_by` = demo faculty |
| Material (lecture scope) | Title/week/lecture derived from plan session; `study_system = general` derived from section |
| Material (general scope) | Manual title, `plan_session_id = NULL`, `study_system = general` |
| Publish | Both published after file attachment (attachment required before publish enforced) |

## Phase 4/5 — Student + Mobile — PASS
- `/student/materials`: FITCS03 shows 2 published materials; drill-down shows plan progress (1/6), lecture-linked material with week/lecture labels, and general materials section.
- No internal notes and no postponement reason rendered on the student surface.
- `/mobile/student` (390px): student-only shell, no faculty/staff/admin links, no public-site chrome.

## Phase 6 — Authorization matrix
| Check | Result |
|---|---|
| anon SELECT `course_materials` | 401 / 42501 — DENY (PASS) |
| anon SELECT plan sessions | empty (PASS) |
| anon / student / faculty / admin → `cdp_instantiate_from_syllabus` | 401–403 permission denied for all (PASS) |
| student / faculty → `syllabus_approve_version` | `SYL_NOT_AUTHORIZED` (PASS) |
| student → `cdp_record_session_execution` | `CDP_NOT_AUTHORIZED` (PASS) |
| faculty → `cdp_record_session_execution` (own section) | 200 (PASS) |
| **student direct REST read of `course_session_executions.notes`** | **200 — internal note returned (FAIL)** |

## BLOCKER — INTERNAL_NOTES_EXPOSED_TO_STUDENT
`public.course_session_executions` grants table-level SELECT to `authenticated`, and RLS policy
`cdp_exec_select` admits any section viewer (students included). A student can therefore read the
faculty-only `notes` column directly through the Data API, contradicting the contract
"ملاحظات داخلية (لا تظهر للطالب)". The UI does not render it; UI hiding is not an authorization boundary.

Forward-only fix prepared but **NOT applied** (this mission authorizes no migrations):
`docs/migration-drafts/COURSE-SESSION-EXECUTION-INTERNAL-NOTES-PRIVACY-01.sql`

## Phase 7 — Cleanup
- Ephemeral probe note on plan session 3 removed via `cdp_clear_session_execution` (verified 0 rows).
- Retained DEMO_ONLY artefacts (intended, permanent demo dataset): FITCS03 syllabus v1, delivery plan
  `203461ef-…` with 6 sessions, execution records for sessions 1–2, 2 published materials + `demo.pdf`.
- No real student data touched; no protected record modified; no migration applied.

## Phase 8 — Decision
**HOLD_PORTAL_FINAL_WEB_GO_LIVE_AND_E2E_01_INTERNAL_NOTES_EXPOSED_TO_STUDENT_VIA_DATA_API**

Web deploy, academic E2E, student/mobile E2E and 11 of 12 authorization checks passed. The single
failing gate is the internal-notes exposure above; Android build preparation is therefore not triggered.

---

# ADDENDUM — COURSE-SESSION-EXECUTION-INTERNAL-PRIVACY-01 (2026-08-13)

Mission: `APPROVED_PRODUCTION_FIX_AND_CLOSE_COURSE_SESSION_EXECUTION_PRIVACY_01`.
All earlier PASS evidence above is preserved unchanged; only the failed privacy gate was re-run.

## 1. Consumer preflight (read-only)
Repository-wide search shows **no direct PostgREST client query** against
`public.course_session_executions` — the only occurrence outside migrations/docs is the generated
`src/integrations/supabase/types.ts`. Every browser/mobile read and write goes through the
`cdp_*` SECURITY DEFINER RPCs (all owned by `postgres`, `prosecdef = true`), which are unaffected
by table/column grants.

- `DIRECT_CLIENT_REQUIRED_COLUMNS` = none (no direct client query exists)
- `STUDENT_SAFE_COLUMNS` = id, plan_session_id, status, execution_date, compensation_date, recorded_at
  (mirrors the `cdp_get_section_plan` non-manager projection, which forces `reason = NULL`, `notes = NULL`)
- `INTERNAL_COLUMNS` = reason, notes, recorded_by, previous_status, created_at, updated_at, compensation_recorded_at

## 2. Draft correction
`docs/migration-drafts/COURSE-SESSION-EXECUTION-INTERNAL-NOTES-PRIVACY-01.sql` rewritten: scope renamed to
execution internal-data privacy, `reason` removed from the grant list along with the other internal columns.
No application-code edit.

## 3. Pre-apply production snapshot
- Table ACL: `authenticated=arwdDxtm`, `anon=arwdDxtm`, `service_role=arwdDxtm`, no column ACL.
- RLS: single policy `cdp_exec_select` (SELECT, role `authenticated`, `cdp_can_view_section(...)`).
- Rows = 12 · notes NOT NULL = 0 · reason NOT NULL = 5
- Internal-data fingerprint (md5 of id+notes+reason ordered by id) = `62e8987d445de77cc0984f7afd325395`
- Migration ledger head = `20260813213024`

## 4. Migration
- `PRODUCTION_MIGRATION_VERSION = 20260813222046`
- `MIGRATION_FILE = supabase/migrations/20260813222046_78aff251-ebb7-42bd-8ff9-de107bf68505.sql`
- `PROMOTED_VS_CORRECTED_DRAFT = ZERO_SEMANTIC_DIFF` (statement-for-statement identical body)
- ACL-only; applied once; no reset, no cleanup, no ledger edit. Post-apply ledger head = `20260813222046`.

## 5. Post-apply security matrix
`has_column_privilege('authenticated', 'public.course_session_executions', <col>, 'SELECT')`:

| Column | Class | Result |
|---|---|---|
| notes | INTERNAL | **false — DENY** |
| reason | INTERNAL | **false — DENY** |
| recorded_by | INTERNAL | false — DENY |
| previous_status | INTERNAL | false — DENY |
| created_at | INTERNAL | false — DENY |
| updated_at | INTERNAL | false — DENY |
| compensation_recorded_at | INTERNAL | false — DENY |
| id / plan_session_id / status / execution_date / compensation_date / recorded_at | STUDENT-SAFE | true (still subject to `cdp_exec_select` RLS) |

- ANON live REST (`/rest/v1/course_session_executions?select=notes|reason|recorded_by|previous_status|created_at|status`):
  `[]` for every column — no new access, no rows (RLS default-deny for anon).
- `service_role` table SELECT = true (required access retained).
- FACULTY / ADMIN authorized paths: all `cdp_*` RPCs are SECURITY DEFINER owned by `postgres`, so the
  execution state load, internal `reason`/`notes` visibility for managers, execution record/update and the
  admin monitoring overview are structurally unaffected by the column grant; contract suites re-run green.
- Column-level denial is enforced by PostgREST at the `authenticated` role, which is the exact role a student
  session assumes — catalog privilege, not UI hiding, is the evidence.

## 6. Data integrity
- `EXECUTION_ROWS_UNCHANGED = PASS` (12 → 12, fingerprint `62e8987d445de77cc0984f7afd325395` unchanged)
- `NOTES_VALUES_REWRITTEN = 0` · `REASON_VALUES_REWRITTEN = 0`
- `COURSE_SECTIONS_WRITES = 0` · `COURSE_MATERIAL_WRITES = 0` · `SYLLABUS_WRITES = 0`
- `UNRELATED_PRODUCTION_WRITES = 0` (migration is ACL-only)

## 7. Targeted regression
`bun test tests/lecture-execution tests/faculty-materials tests/materials tests/mobile tests/student-portal`
→ **211 pass / 0 fail** (student plan & material view, faculty lecture execution view/write, admin
academic monitoring contracts, mobile student projection/isolation).

## 8. Decision
`PASS_COURSE_SESSION_EXECUTION_INTERNAL_PRIVACY_01`
`PASS_PORTAL_FINAL_WEB_GO_LIVE_AND_E2E_01` (release decision upgraded from HOLD)
