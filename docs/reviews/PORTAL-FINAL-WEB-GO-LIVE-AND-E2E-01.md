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
