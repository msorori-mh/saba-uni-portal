# REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01 — Report

**Phase mode:** SOURCE-ONLY (no migration applied, no SQL written to production,
no data touched, no publish/deploy).

## 1. What was done

| Deliverable | Path |
|---|---|
| Migration draft (idempotent, additive) | `docs/migration-drafts/REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql` |
| Contract updates | `docs/request-services/file_withdrawal.md`, `department_transfer.md`, `academic_record.md`, `grade_statement.md`, `graduation_certificate.md` |
| Contract left unchanged (student_affairs still correct) | `docs/request-services/grade_statement_non_graduate.md` |
| Source-only guards | `tests/student-requests/request-processing-domains-expansion-source-01.test.ts` |

No production code was modified, no runtime UI touched, no fees or forms altered,
no `student_visible` flag flipped, no `enrollment_certificate` workflow touched.

## 2. New units (draft)

| code | name_ar | portal_scope | is_academic_unit |
|---|---|---|---|
| `library` | المكتبة | staff | false |
| `labs` | المعامل | staff | false |
| `graduate_affairs` | شؤون الدراسات العليا | staff | false |
| `department` | الأقسام العلمية | staff | true |

## 3. New roles (draft)

| unit | role code | name_ar | is_managerial |
|---|---|---|---|
| `library` | `library_officer` | أمين المكتبة | false |
| `labs` | `labs_manager` | مسؤول المعامل | true |
| `graduate_affairs` | `graduate_affairs_manager` | مدير الدراسات العليا | true |
| `graduate_affairs` | `graduate_affairs_specialist` | أخصائي الدراسات العليا | false |
| `department` | `department_head` | رئيس القسم | true |

`student_activities` unit/role **NOT** created. Activities clearance in
`file_withdrawal` rides on `student_affairs_manager` (ياسمين الولص) under the
existing `student_affairs` unit until an activities office with real staff is
provisioned.

## 4. Proposed staff-profile assignments (all `is_active=true`)

| Staff | staff_profile_id | unit | role |
|---|---|---|---|
| ناجي الروقي | `4a838311-0ab7-4033-8e0c-69327d522bc7` | `library` | `library_officer` |
| محمد حيدر | `b59e6e45-260d-4af6-b312-85381d354104` | `labs` | `labs_manager` |
| محمد شوقي | `f463a79b-65be-4a94-8003-1c9a2727b88f` | `graduate_affairs` | `graduate_affairs_manager` |
| صالح علي | `aa4f5c16-c993-4af6-a6d4-59d9542c1a7f` | `graduate_affairs` | `graduate_affairs_specialist` |

## 5. Proposed department-head assignments

`assignment_type='faculty_profile'`, `department_id` copied verbatim from
`faculty_profiles.department_id` — no cross-department leakage possible in the
data itself.

| Chair | faculty_profile_id | department_id | department |
|---|---|---|---|
| د. اسامه عبدالجليل احمد سيف | `d08a8509-4c04-472e-885f-053a80be12ec` | `ce485c67-…-4b1130a86ae8` | قسم تكنولوجيا المعلومات (linked as the student's home in prod for CS) |
| د. خالد قاسم محمد البراحي | `6f9f004d-c5f6-4dfe-b212-7f79ce8658e3` | `ce485c67-…-4b1130a86ae8` | قسم تكنولوجيا المعلومات |
| د. رمزي حميد الجابري | `c1fe6084-e594-482e-a178-ac8eaffed376` | `22222222-…-222222222222` | قسم نظم المعلومات الحاسوبية |

**Runtime scoping requirement:** because
`user_matches_workflow_runtime_step` allows ANY row in
`request_processing_assignments` that matches unit+role to act when a step
carries no direct assignee, Batch B **must** set
`student_request_workflow_steps.assigned_faculty_profile_id` on
`source_department_head_approval` and `target_department_head_approval` to the
exact chair for the student's source/target department. That forces the
`assigned_faculty_profile_id` short-circuit branch and prevents one chair from
touching another chair's step.

Dean: `faculty_profile` assignment on the `dean` unit is preserved.
`position_assignments` for `organizational_positions.dean` remains empty —
recorded as a non-blocking note, not addressed in this phase.

## 6. user_roles audit

`user_roles` currently disagrees with reality for two staff (محمد حيدر
`registrar`, ناجي الروقي `registrar`, صالح علي & محمد شوقي `student_affairs`).
Source-level review of the two gates that authorize every staff action on a
request step:

- `public.user_matches_workflow_runtime_step(uuid)`
- `public.can_current_user_act_on_step(uuid, text)`

Neither reads `user_roles`, `has_role(...)`, or `has_any_role(...)`. Both
require an active `request_processing_assignments` row (or a direct
`assigned_*` column match) AND a non-null `auth.uid()`. Result: a stale
`user_roles` value **cannot** grant workflow step actions it is not
otherwise entitled to.

`user_roles` still gates other admin UIs / RLS reads outside the workflow
engine — those are out of scope for this phase and are **not** modified.

**Because the source-level check passes, this phase does NOT trigger the
HOLD_PROCESSING_DOMAIN_AUTHORIZATION_RISK branch** that would have been
required had `user_roles` been in the step-authorization path.

## 7. Deny/allow matrix (encoded as source-only tests)

| Test | Result |
|---|---|
| Draft adds exactly the 4 new units | pass |
| Draft adds exactly the 5 new roles | pass |
| Draft never introduces `student_activities` | pass |
| Draft never mutates `user_roles` | pass |
| Draft never touches `enrollment_certificate` / requests / documents / fees / no DROP/DELETE/UPDATE | pass |
| Staff assignments idempotent (NOT EXISTS) with the 4 exact staff_profile_ids | pass |
| Chair assignments carry the 3 exact faculty_profile_ids and copy department_id | pass |
| `user_matches_workflow_runtime_step` never references `user_roles` | pass |
| `can_current_user_act_on_step` never references `user_roles` | pass |
| Neither gate has admin/registrar/dean bypass | pass |
| Both gates early-return false on `auth.uid() = null` | pass |

The deny scenarios (محمد حيدر cannot act as registrar/archive/library/graduate_affairs;
ناجي الروقي cannot act as registrar/labs/archive; graduate_affairs staff cannot
act as student_affairs/registrar/dean; chair cannot act on other chair's step;
admin/registrar have no bypass; `auth.uid() null` rejected) are **structurally
guaranteed** by the fact that:

1. The gates only read `request_processing_assignments` (unit_id + role_id + user match)
   and direct `assigned_*` columns.
2. The draft never inserts an assignment mapping a staff member to a role/unit
   outside their real function.
3. Direct `assigned_faculty_profile_id` on chair steps (required by Batch B)
   pins each step to one chair, blocking cross-chair action.

## 8. Verification results

| Check | Result |
|---|---|
| Typecheck (`bunx tsgo --noEmit`) | pass (exit 0) |
| `bun test tests/student-requests/` | **272 pass / 0 fail** (17 files, incl. this phase's 11 new tests) |
| Build | skipped — no production source files were modified in this phase; typecheck already green |

## 9. Production impact

**Zero at this moment** — nothing was applied. When the migration is executed
later (sequential apply phase), the expected impact is:

- +4 rows in `request_processing_units`
- +5 rows in `request_processing_roles`
- +4 rows in `request_processing_assignments` (staff)
- +3 rows in `request_processing_assignments` (chairs)
- No changes to existing units, roles, assignments, workflows, requests,
  documents, fees, forms, RLS or UI.
- No user account, `user_roles` row, or session mutation.
- No effect on `enrollment_certificate` v2 workflow or any in-flight request.

## 10. Decision

**PASS_READY_FOR_SEQUENTIAL_PROCESSING_DOMAINS_MIGRATION_APPLY**

- Migration draft is complete, idempotent, additive, and touches only the
  approved surfaces.
- Source-level authorization audit confirms `user_roles` is not a bypass for
  step actions, so applying the migration cannot widen access beyond
  `request_processing_assignments`.
- All 6 targeted contract docs updated to reference real units/roles/staff.
- Tests + typecheck green.

Next human step: run the sequential apply phase (create a Supabase migration
from the draft SQL, review, approve).
