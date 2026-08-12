# PORTAL-ZERO-OMISSION-MASTER-E2E-PHASE1-TO-FINAL-03

Phase 0 is closed and will not be repeated. Baseline accepted: SOURCE_SHA = DEPLOYED_SHA = 5ec7f90a, official runtime quboolye.com, required-route 404 count 0, UNINTENDED_REAL_DATA_WRITES = 0, CORRECTIVE_REAL_DATA_WRITES = 2.

Execution is continuous: Gate 1A, then discovery, then S → F → W → GP → GA → Councils → Documents/Notifications → Reports → Cross-portal → rediscovery → rehearsal → ephemeral cleanup → final package. No intermediate owner request.

## Gate 1A — student_requests direct-mutation security (runs first, blocks the rest)

Current verified state of the production table (read-only checks already done, not yet proven at runtime):

- `authenticated` holds `ardDxtm` — no table-wide UPDATE (`w`); update rights are column-scoped as per the last migration.
- RLS `sr_update_self` USING allows rows in draft/returned/returned_for_completion/submitted/under_review/in_review; WITH CHECK restricts the resulting status to draft/returned/returned_for_completion/cancelled.
- `BEFORE UPDATE` trigger `protect_student_request` forces `student_profile_id`, `request_type`, `submitted_at`, `reviewed_by`, `reviewed_at`, `rejection_reason`, `completed_at` back to OLD on the student cancel path, and only allows draft→submitted when the RPC session flag `student_request.submit_via_rpc` is set.
- `guard_b1_request_submit_boundary` rejects B1 draft→submitted unless `b1.atomic_submit = '1'`.

These are the defences on paper. The gate proves them at runtime, from a real authenticated student session over REST/PostgREST (not psql, not a service role):

1. Determine the actual business contract for `request_type` mutability after submission and for student-initiated cancellation from each status; record it before testing.
2. Status bypass matrix on an owned TEST_ONLY request: from `draft` attempt each discovered runtime status; from `submitted` attempt draft/completed/approved/rejected/cancelled/archived; from each terminal status attempt reopening. Every attempt logs the HTTP code AND a re-read of the row — a 204 with an unchanged row is a silent no-op, not a pass; a 204 with a changed lifecycle field is a defect.
3. Field bypass: fabricated `submitted_at`, `cancelled_at`, `rejection_reason`, and post-submission `request_type` change, each verified by row re-read.
4. Confirm no workflow step, event, effect, or document was produced by any direct write.

Any confirmed bypass is treated as HIGH/CRITICAL and fixed forward-only with the smallest safe contract: student direct updates narrowed to genuinely student-editable draft fields (`title`, `description`, `form_data`, `student_notes`), lifecycle fields moved behind the authoritative RPC paths. The workflow is never weakened to preserve a 204.

Required: STUDENT_REQUEST_DIRECT_STATUS_BYPASS = 0, STUDENT_REQUEST_DIRECT_WORKFLOW_FIELD_BYPASS = 0, STUDENT_REQUEST_COLUMN_AUTHZ = PASS.

## Phase 1 — fresh full discovery (start of execution, not a separate round)

Two independent inventories, then their union:

- Source: routeTree, every route file, dashboard and navigation config, feature flags, server functions, RPCs, action codes, report catalog and report functions, role-aware components.
- Deployed runtime: authenticated browser crawl of every reachable page for all 20 retained DEMO roles (Student, L4 Student, Graduate, Faculty, Secondary Faculty, Dept Head, Academic Affairs, Dean, Student Affairs, Registrar, Finance, GA Manager, GA Specialist, GP Coordinator, GP Supervisor, GP Committee, Council Chair, Council Secretary, Council Member, Admin).

Per page, every card, KPI, tab, link, button, form, field, dialog, dropdown, search box, filter, pagination control, upload, download, action menu, workflow action, drilldown and export becomes its own ledger row, initial state NOT_TESTED. No sampling, no "covered indirectly", no "route opened successfully".

Discovery output feeds directly into Campaign-S in the same run.

## Campaigns

- S — Student: dashboard KPIs verified against DB truth, profile/plan/courses, full published timetable row-by-row (course, المجموعة الدراسية, day, time, room, faculty, lecture/practical), materials 4/4 with hash regression, lecture plan 6/6 sessions with private notes hidden, and every LIVE service end to end: visibility, eligibility allow/deny, every field and validation, attachment, draft, update, submit, pinned workflow version, each step with its exact processing actor, returns, correction/resubmit, approval/rejection, fee path, completion, effect, document, notification, student readback, relogin, wrong-actor RPC, stale action, terminal-action denial.
- F — Faculty: dashboard, profile, schedule, assigned courses, materials full publish→student download→edit→archive cycle, lecture execution across executed/hindered/postponed/cancelled/compensated with dates, reasons and notes, lecture monitoring, student progress, GP, councils, processing requests, reports, account/password. Assigned faculty ALLOW, everyone else DENY. Ephemeral plans used for destructive paths so the polished DEMO plan stays intact.
- W — Staff: real queues driven by real submissions — student submits, correct staff opens, filters, acts, next actor continues, final state, student verifies outcome. Student Affairs, Registrar, Finance, Academic Affairs, GA roles and any other discovered processing role, plus audit log, fee board, diagnostics, account/password.
- GP: complete deployed-UI lifecycle from team through proposal, review/return/correction, supervisor assignment and acceptance, progress, approval, defense, committee, evaluation, revisions and archive — one ledger row per transition, separate TEST_ONLY projects for incompatible branches.
- GA: graduate-side profile, contacts, consent, employment, opportunities, events, surveys, responses, followups, communications, employers, history, notifications; staff authoring lifecycles for opportunity, event and survey including question authoring, reorder, options, required flags, preview, publish, response, close.
- Councils: visibility, membership, topics, agenda, meeting, attendance, voting, minutes, decisions, archive, reports, authorization audit, plus negatives (non-member, wrong council, wrong role, stale phase, unauthorized direct RPC).
- Documents + Notifications: generation, visibility, download, signed authorization, status, wrong-user denial, notification creation, read/unread, recipient correctness, privacy. No real email/SMS/push.
- R — Reports: every report code from catalog, traceability, beneficiary coverage, route tree, runtime and report RPCs gets a ledger entry; every LIVE report gets route, correct/wrong role, scope, every KPI, table, filter, meaningful filter combination, period control, drilldown, sorting, pagination, empty state, export, privacy, refresh, relogin. Numbers validated against controlled TEST_ONLY data with EXPECTED/ACTUAL/DELTA and DELTA = 0; tables matched on row identity, not counts. Every export button must produce a real file that is parsed and checked for headers, row count, applied filters, scope and absence of extra PII.
- X — Cross-portal: service, materials, lecture, GP, GA and council journeys end to end across roles into the corresponding report.

Security matrix runs alongside: every discovered write RPC gets correct-actor ALLOW plus the full negative set (anonymous, wrong student/faculty/department/course/section/offering/unit/request/step/project/supervisor/coordinator/committee/council/role, revoked and expired assignment, stale state, terminal state). Required UNEXPECTED_ALLOW = 0.

## Data policy

Retain all DEMO_ONLY_UNIVERSITY_PRESENTATION_01 data and enrich it so core pages are visually meaningful. Clean only TEST_ONLY_EPHEMERAL_<RUN>. Protected records remain untouched. Each core page is classified PRESENTATION_READY or EXPECTED_EMPTY_BY_DESIGN; CORE_DEMO_PAGES_EMPTY = 0.

## Closure

Post-execution rediscovery compares PRE / POST / LEDGER component sets with PRE_MINUS_LEDGER = 0 and POST_MINUS_LEDGER = 0. Then a fresh-context rehearsal for Student, Faculty, Dept Head, Academic Affairs, Dean, Staff, GA and Admin with zero login failures, route crashes, JS errors, unexplained 5xx or missing required data.

Reports written/updated: student, faculty, staff and reports acceptance files, component/lifecycle/report ledgers, the demo data manifest, and the master acceptance file. Detailed per-page component evidence with EVIDENCE_IDs, no summary-only PASS. Safety counters reported separately and honestly, keeping CORRECTIVE_REAL_DATA_WRITES = 2. Passwords delivered in the final chat response only, never committed.

Final token: PASS_PORTAL_ZERO_OMISSION_FULL_E2E_GO_LIVE_ACCEPTANCE_01 with UNIVERSITY_COUNCIL_PRESENTATION_READINESS = READY only if all gates pass; otherwise HOLD_PORTAL_ZERO_OMISSION_FULL_E2E_<EXACT_BLOCKER>.
