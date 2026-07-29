# PORTAL-B1-NAJI-LIBRARY-PROCESSING-INBOX-ACCESS-READONLY-PREFLIGHT-23

MODE: PRODUCTION READ-ONLY AUTHORIZATION DIAGNOSIS
DECISION: **PASS_B1_NAJI_LIBRARY_INBOX_ROOT_CAUSE_IDENTIFIED**

ZERO_PRODUCTION_WRITE / ZERO_RPC_ACTIONS / NO_MIGRATION / NO_DEPLOY

## G0 — USER IDENTITY

| Field | Value |
|---|---|
| auth user_id | `e7a93314-bb06-4525-b412-5315198c668a` |
| staff_profile_id | `4a838311-0ab7-4033-8e0c-69327d522bc7` |
| employee_number | S2026009 |
| email | naji@usr.edu.ye |
| status | `active`, must_change_password = false |
| role_type (staff_profiles) | `library_officer` |
| department_scope | `all` |
| app roles (`user_roles`) | `registrar` only (no admin / system_admin) |

## G1 — ROLE AND ASSIGNMENT CONTRACT

Exactly one row in `request_processing_assignments`:

- id `3f93b060-bf2f-43db-b0de-ca9b365649f7`
- unit = `library` (المكتبة), role = `library_officer` (أمين المكتبة)
- `assignment_type = 'staff_profile'`, `staff_profile_id = 4a838311…`, **`user_id = NULL`**
- `is_active = true`, `starts_at = NULL`, `ends_at = NULL`
- no duplicates, no conflicting rows; staff_profile.user_id matches the auth user

Population shape (all assignments): `user` 8 (user_id set), `staff_profile` 9,
`position_assignment` 5, `faculty_profile` 4 — **18 of 26 rows have `user_id IS NULL` by design.**

## G2 — BACKEND ACCESS GUARD

Database contract **accepts** Naji:

- `current_user_has_exact_processing_binding` resolves `assignment_type='staff_profile'`
  through `staff_profiles.user_id = auth.uid()` → TRUE for library/library_officer.
- `user_matches_workflow_runtime_step` / `get_my_request_actor_inbox` /
  `can_current_user_act_on_step` are all identity-closure aware.
- No SQLSTATE denial originates from the database for inbox reads.

The denial happens **before** any RPC, in the server-function gate.

## G3 — FRONTEND / SERVER-FN ROUTE GUARD (defect)

- Route: `/faculty-portal/processing-requests` (also `/staff` card), rendering `StaffInboxShell`.
- Message `ليس لديك صلاحية للوصول إلى صندوق معالجة الطلبات.` =
  `STAFF_INBOX_UNAVAILABLE_MSG.unauthorized` thrown by
  `assertStaffInboxAccess` in `src/lib/student-requests/staff-inbox.functions.ts`.
- Both gates query assignments with **`.eq("user_id", userId)` only**:
  - `src/lib/student-requests/staff-inbox.functions.ts` → `assertStaffInboxAccess`
  - `src/lib/faculty-portal/processing-access.functions.ts` → `hasActiveProcessingAssignment`
- Naji's row has `user_id = NULL` (staff_profile binding) → 0 rows → denied,
  and he is not admin/system_admin.

**Backend allows, application layer denies.** `library_officer` is not excluded
by role anywhere; the gate is assignment-shaped, not role-shaped.

## G4 — CURRENT TEST REQUEST RELEVANCE

Library step exists only in `SR-20260727-42393846` (file_withdrawal), step_order 2,
unit `library`, role `library_officer`, `assigned_staff_profile_id = 4a838311…` (Naji, correct direct assignee),
**status = `pending`** — not active. All five TEST_ONLY requests are still at step 1 (student_affairs).

Therefore, once the gate is corrected, Naji must reach the inbox page and see an
**empty** inbox (the inbox RPC is pinned to `status=['active']`), not a permission error.
Blocking the page entirely is wrong: it hides a legitimate future actor and is
inconsistent with the DB contract.

## ROOT CAUSE

**Source defect (not a data defect).** Application-level inbox gates resolve the
processing assignment only via `request_processing_assignments.user_id`, while
production binds staff through `assignment_type='staff_profile'` (and
`faculty_profile` / `position_assignment`), leaving `user_id` NULL. The database
authorization closure already handles all four binding types.

## MINIMAL REQUIRED FIX

Align the two application gates with the DB identity closure used by
`current_user_has_exact_processing_binding`:

1. `assertStaffInboxAccess` (`staff-inbox.functions.ts`)
2. `hasActiveProcessingAssignment` (`faculty-portal/processing-access.functions.ts`)

Match an ACTIVE assignment when any of:
`user_id = uid`, or `staff_profile_id ∈ (staff_profiles where user_id = uid)`,
or `faculty_profile_id ∈ (faculty_profiles where user_id = uid)`,
or `position_assignment_id ∈ (active position_assignments where user_id = uid)`,
plus the `starts_at`/`ends_at` window. No role allow-list, no broad bypass.

- Production write required: **NO** (no data change, no assignment mutation).
- Migration required: **NO**.
- Deploy required: **YES** — source-only change must be deployed to take effect.
- Regression guard: extend `tests/student-requests/staff-inbox-assignment-based-access.test.ts`
  and `tests/faculty-portal/processing-requests-visibility.test.ts` to assert the
  four binding types are honoured.
