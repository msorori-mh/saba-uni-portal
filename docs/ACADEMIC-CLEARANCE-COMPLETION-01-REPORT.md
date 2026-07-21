# ACADEMIC-CLEARANCE-COMPLETION-01 Report (Q-14)

- Task: Q-14 — academic clearance completion, source-only slice 01.
- Builds on: PR #175 (academic clearance foundation 01, merged) and its DRAFT-ONLY SQL `docs/migration-drafts/DEPARTMENT-TRANSFER-ACADEMIC-CLEARANCE-FOUNDATION-01.sql`.
- Branch: `feat/academic-clearance-completion-01` → PR to `main` (single PR; not merged by the agent).
- Scope/ownership respected: only `src/**/academic-clearance*`, `tests/academic-clearance/`, `docs/drafts/*clearance*`, and this report. No changes to `src/routeTree.gen.ts`, shared student-requests files, `supabase/migrations/`, runbooks, or other systems. No migration was applied; no SQL was executed against any database.

## 1. Gap analysis: foundation (merged) vs full completion

| Area | Foundation (PR #175) | Gap | This PR |
| --- | --- | --- | --- |
| Snapshots of student results | Tables + binding triggers (fail-closed, immutable) | No client builders/validators, no display, no ingestion path | Fail-closed builders `buildSourceCourseSnapshots` / `buildTargetCourseSnapshots` + `ClearanceSnapshotsPanel` (read-only evidence UI). Ingestion orchestration remains a follow-up (§6) |
| Course-by-course comparison | `CourseComparison` table + `summarizeClearance` | No summary/readiness panel; no row-shape validator | `ClearanceSummaryPanel` (accepted/remaining/proposed level/unresolved + submit readiness) + `assertValidEquivalencyRow` mirroring SQL constraints |
| Seven clearance statuses | 6 statuses; approve/correct only | `rejected` unreachable; no return/rework path | 7th status `returned`; `reject_academic_clearance` + `return_academic_clearance_to_department` RPCs; terminal-rejected immutability; edit-in-returned rework loop; `nextClearanceStatus` + extended `canActorTransitionClearance` |
| Minutes (محضر) | `academic_clearance_minutes` SQL view | No client builder/UI | `buildClearanceMinutes` + `ClearanceMinutes` component |
| Approvals (اعتمادات) | approve RPC + append-only approvals/audit tables | No reject/return provenance; no timeline UI | Reject/return write approvals rows + audit actions; `ClearanceApprovalsTimeline` + stage/decision labels |
| Block transfer before approval | `assert_department_transfer_clearance_approved` guard + `canFinalizeDepartmentTransfer` | No UI surfacing; returned/rejected coverage | UI gate line in `ClearanceSummaryPanel`; PG17 verifier asserts the block in `returned` and `rejected` states |
| Reports (تقارير) | `academic_clearance_reporting` + `academic_clearance_course_outcomes` views | Returned cases missing from overdue window; no client aggregation/UI | Views forward-replaced (`returned` overdue-eligible; `supporting_requirement` counted); `summarizeClearanceReporting` + `summarizeCourseOutcomes` + `ClearanceReporting` component |

## 2. D-10 resolution applied (governing update, 2026-07)

D-10 is resolved; the rules were applied literally as constants/types and tests:

1. **Comparison vocabulary — exactly seven values**: `equivalent`, `partially_equivalent`, `general_requirement`, `supporting_requirement`, `not_equivalent`, `needs_review`, `committee_decision_required`. Implemented in `EQUIVALENCY_DECISIONS` and in the SQL draft (`alter type public.course_equivalency_decision add value if not exists 'supporting_requirement'`). Semantics: `supporting_requirement` («متطلب مساند») is credit-bearing and never maps to a specific target-plan course (enforced by the existing CHECK coupling + the forward-replaced credit guard `validate_academic_clearance_credit`).
2. **Original grades are never mutated** — they are read only as immutable snapshots. The contract test asserts the draft contains no `update/insert/delete` on `student_grades`; snapshot rows are frozen copies carrying `official_result_reference` provenance.
3. **Target-department chair owns the academic review** — unchanged from the foundation; `canActorTransitionClearance` and the RPCs keep edit/submit with the target chair only.
4. **No final transfer before full documented approval** — `canFinalizeDepartmentTransfer` is true only for `approved`; the SQL guard is unchanged and is now verifier-covered for `returned`/`rejected`.
5. **Accepted hours, remaining hours, proposed level** — `summarizeClearance` (foundation) plus the new summary panel surface all three.
6. **Output = minutes + documented approvals** — `ClearanceMinutes` + `ClearanceApprovalsTimeline` over the append-only `academic_clearance_approvals` / `academic_clearance_audit_log`.

Still configuration (operational, fail-closed — not design blockers): the authority config row values (`academic_affairs_unit_code`, `academic_affairs_role_code`, `approved_course_result_status`) remain owned by the academic authorities and are required before any case can bind snapshots; nothing in this PR hardcodes them.

## 3. Delivered files

Source:
- `src/lib/academic-clearance.ts` (extended): seven statuses + Arabic labels; seven decisions + labels; `TARGET_MAPPED_DECISIONS` / `CREDIT_BEARING_DECISIONS` / `UNRESOLVED_DECISIONS`; `assertValidEquivalencyRow`; `nextClearanceStatus`; extended `canActorTransitionClearance` (`reject`/`return`; chair edit in `returned`); snapshot builders (fail-closed; vocabulary passed in, never hardcoded); `buildClearanceMinutes`; `summarizeClearanceReporting` (14-day overdue window, active statuses incl. `returned`); `summarizeCourseOutcomes`; approval stage/decision labels.
- `src/components/academic-clearance/ClearanceStatusBadge.tsx` (new): seven-status badge.
- `src/components/academic-clearance/ClearanceSummaryPanel.tsx` (new): summary + submit readiness + transfer-finalization gate.
- `src/components/academic-clearance/ClearanceSnapshotsPanel.tsx` (new): source results + target plan snapshot evidence (read-only).
- `src/components/academic-clearance/ClearanceMinutes.tsx` (new): محضر المعادلات.
- `src/components/academic-clearance/ClearanceApprovalsTimeline.tsx` (new): approvals provenance.
- `src/components/academic-clearance/ClearanceReporting.tsx` (new): operational + outcome reports.
- `src/components/academic-clearance/CourseComparison.tsx` (updated): added `supporting_requirement` label (required for `Record<EquivalencyDecision, string>` exhaustiveness).

SQL (DRAFT ONLY — DO NOT APPLY; forward-only on top of the foundation draft; nothing applied):
- `docs/drafts/ACADEMIC-CLEARANCE-COMPLETION-01.sql`: `alter type` +1 status (`returned`) and +1 decision (`supporting_requirement`) outside the transaction; `create or replace` for `current_user_can_edit_academic_clearance` (edit in `returned`), `current_user_can_review_academic_clearance` (read retained on `rejected`), `save_academic_clearance_equivalency` (rework in `returned`), `validate_academic_clearance_credit` (`supporting_requirement` credit-bearing), `enforce_academic_clearance_immutability` (terminal `rejected`); new `return_academic_clearance_to_department` / `reject_academic_clearance` RPCs (lock version + rationale required; approvals + audit provenance; authenticated-only ACL); reporting views forward-replaced.

Tests (`tests/academic-clearance/`):
- `academic-clearance-completion.test.ts` — logic: vocabulary (exactly seven), row-shape validator, state machine incl. invalid transitions, actor matrix, transfer gate over all seven statuses, snapshot builders fail-closed paths, minutes builder, reporting aggregation incl. overdue window, outcomes counting.
- `academic-clearance-completion-sql-contract.test.ts` — draft markers, forward-only shape (no `create type`/`create table`/drops), seven-status and seven-decision extensions, RPC provenance + ACL posture, read-only grades, reporting filters.
- `clearance-completion-ui.test.ts` — component contract tests incl. the gate copy and the seventh decision in the chair table.
- `academic-clearance-completion.pg-verify.sql` — PG17 verifier (idempotent seeds; safe standalone or after the foundation verifier). Execution order: `academic-clearance.pg-setup.sql` → foundation draft → completion draft → this file. Covers: enums (7/7), reviewer/chair denials, supporting-requirement credit bound + target coupling, submit → return (status/approvals/audit/transfer block/approve denied) → rework → resubmit → reject (terminal immutability of case + evidence, transfer block), reviewer-keeps-read / chair-loses-read on rejected, fresh case allowed after rejection, reporting view filters, RPC ACL posture.

## 4. Verification performed / not performed

- **Not executed locally**: this agent has no runtime environment (MCP-only operation per task constraints). `bun test`, `tsc --noEmit`, and the PG17 harness were not run here; they must be settled by CI/harness. Test code mirrors the merged foundation patterns exactly (imports, `bun:test`, `readFileSync` contract style, PG17 do-block style) to minimize execution risk.
- Static self-review performed against the merged foundation SQL/lib/tests for signature parity (RPC argument order, lock-version flow, trigger firing order: provenance written via INSERT which the UPDATE/DELETE immutability triggers never block).
- CI expectations: `ci.yml` runs install/lint(advisory)/typecheck(no script → skip)/build. The new code adds no routes and no dependencies; `routeTree.gen.ts` untouched.
- Review round 1 hardening: `assertValidEquivalencyRow` now mirrors the credit guard trigger in full — the source-credit bound (`INVALID_EQUIVALENCY_ACCEPTED_HOURS_EXCEED_SOURCE`) and the non-empty rationale requirement (`INVALID_EQUIVALENCY_RATIONALE_REQUIRED`) were added with positive/negative tests; the submit-capability vs strict-transition semantics of `canActorTransitionClearance` are documented on the function and pinned by a test; PG17 verifier seeds are `on conflict` guarded.

## 5. Constraints respected

- No transfer decision before final documented approval; nothing student-facing was added (all components are staff-facing, consistent with the foundation posture: no student surface before approvals complete).
- No applied migration, no executed SQL, no edited merged drafts, no new files outside owned scope, no route tree changes, no merges.

## 6. Remaining gaps / follow-ups (not in this PR)

1. **Case creation + snapshot ingestion orchestration**: which transfer workflow step spawns the clearance case, and the privileged ingestion RPC populating snapshots from `student_course_grade_summary` + `student_grades` + `study_plan_courses`. Prerequisite: confirm real-schema columns (`study_plan_courses.is_required`, level linkage) at promotion time, and the approved authority config row (§2).
2. **Route wiring**: a staff clearance-desk route (chair) and an academic-affairs review route composing these components; `src/routes` + `src/routeTree.gen.ts` are exclusively owned by Q-13 — coordination required.
3. **Academic-affairs review screen** wiring RPCs with `lock_version` concurrency handling and the reject/return rationale UX.
4. **Student-facing minutes view after full approval** — product decision required; out of scope until then.
5. **Draft promotion**: both drafts (foundation + this one) remain DRAFT ONLY; promotion goes through the migration runbook gates under separate authorization.
6. **Execute tests**: `bun test tests/academic-clearance/` and the PG17 verifier (§4) in CI/harness.

## 7. Risks / notes for reviewers

- `create or replace`d functions keep identical signatures, so existing RLS policies and grants continue to bind; the only behavioral deltas are the documented status/decision extensions.
- `rejected` was made terminal via the immutability trigger; the reject RPC writes provenance through INSERT, which those triggers never block (same ordering pattern as the foundation's approve RPC).
- The overdue window (14 days) now treats `returned` as active work — intentional, so returned cases cannot silently age.
- `supporting_requirement` accepted hours count toward `accepted_credit_hours` at approval time (approve RPC sums all rows), consistent with a supporting-requirements bucket; any plan-level cap for that bucket is a policy question outside this slice.
- `general_requirement` is intentionally excluded from `academic_clearance_course_outcomes` (and from `summarizeCourseOutcomes`): it resolves into the university-wide general-requirements bucket rather than the target study plan, so counting it per source/target pair would conflate two different credit scopes in one report. This keeps the foundation's reporting choice; revisiting it (e.g. a dedicated general-requirements report) is a reporting/product decision outside this slice.
- Promotion landmine (documented, behavior intentionally unchanged): `current_user_can_review_academic_clearance` requires exactly one approved authority config row (`count(*)=1`). Zero approved rows — or two or more — make every reviewer action fail closed. Verify the singleton config at promotion time before enabling reviewer access.
