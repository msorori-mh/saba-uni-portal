# STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION — Impact Audit 01

Read-only audit of `student_request_workflow_steps.completed_by` and
`official_documents.issued_by` against the actual assignees for each
completed workflow step. **No data was modified.**

## Root cause (recap)

`public.user_matches_workflow_runtime_step` currently short-circuits to
`true` for any user for whom `is_current_user_registrar()` or
`is_current_user_admin_actor()` returns true, before checking any
per-step assignment. Combined with a `has_any_role('dean')` shortcut in
`is_current_user_dean_for_student`, this lets any registrar, admin, or
"dean"-tagged user act on any workflow step — including `dean_signature`,
`document_issuance`, and `archive` — regardless of the runtime step's
`assigned_*` columns or `request_processing_assignments` rows.

## Audit method

For every row in `public.student_request_workflow_steps` with
`status = 'completed'` and non-null `completed_by`, the audit computed:

1. `direct_user_match`  — `assigned_user_id = completed_by`
2. `staff_match`        — `staff_profiles.user_id  = completed_by` for `assigned_staff_profile_id`
3. `faculty_match`      — `faculty_profiles.user_id = completed_by` for `assigned_faculty_profile_id`
4. `assignment_match`   — active `request_processing_assignments` row matching BOTH `processing_unit_id` and `processing_role_id` for the completed_by user (via `user_id`, `staff_profile_id`, `faculty_profile_id`, or `position_assignment_id`).

A step is flagged **unauthorized** when none of (1)–(4) is true.

## Findings

### Request `SR-20260716-26BAD4C8` (id `ec85cca4-…`)  — TEST REQUEST, FROZEN

Executor `4c261c1c-97fb-42da-a544-e8a59853ebe3` (registrar) completed
three steps he was NOT assigned to:

| step_key            | assignment_match | verdict         |
|---------------------|------------------|-----------------|
| initial_review      | true             | authorized      |
| fee_assessment      | true             | authorized      |
| payment_confirmation| true             | authorized      |
| registrar_signature | true             | authorized      |
| **dean_signature**      | **false**    | **UNAUTHORIZED** |
| **document_issuance**   | **false**    | **UNAUTHORIZED** |
| **archive**             | **false**    | **UNAUTHORIZED** |

Related document `USR-2026-000002` was `issued_by = 4c261c1c-…` — same
registrar, not the assigned document-issuance actor.

### Request `SR-20260715-FEDCB3E1` (id `9cfd55a4-…`)  — FROZEN

All seven completed steps produced `assignment_match = true`. No
unauthorized executions detected. Document `USR-2026-000001` was
`issued_by = c8a94548-…`, which matches the document_issuance assignee
for that run. **Clean.**

### Request `SR-20260713-2DE64041` (id `93807768-…`)  — FROZEN

Executor `b522b4c7-…` completed `initial_review` and `fee_assessment`
without a matching active `request_processing_assignments` row. This
predates the current assignment population; treat as historical
pilot-era data rather than a live exploit, but include in the
follow-up remediation ticket.

### Documents

| document_number | issued_by                              | status   | issuer_matches_assignee |
|-----------------|-----------------------------------------|----------|-------------------------|
| USR-2026-000001 | c8a94548-4782-4252-86f9-23559d3b95bd    | archived | yes                     |
| USR-2026-000002 | 4c261c1c-97fb-42da-a544-e8a59853ebe3    | archived | **no**                  |

Neither document was modified during the audit.

## Scope of the vulnerability

`GLOBAL_ROLE_OVERRIDE_TOO_BROAD` — the bypass in
`user_matches_workflow_runtime_step` affects **every workflow type**,
not only enrollment certificates. Any request type that reaches
`can_current_user_act_on_step` → `user_matches_workflow_runtime_step`
inherits the bypass, including future signature, payment-confirmation,
issuance, and archive flows.

Severity: **critical (privilege escalation across all workflows).**

## Proposed hardening (SOURCE-ONLY draft)

See `docs/migration-drafts/STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql`.
Summary:

1. `user_matches_workflow_runtime_step` — remove the registrar/admin
   universal `true`; enforce the strict 5-step ordered check
   (direct user → staff → faculty → position → active
   unit+role assignment).
2. `is_current_user_dean_for_student` — remove `has_any_role('dean')`
   fast path; require an active `position_assignments` row whose
   organizational position (`op.code='dean'`) is scoped to the
   student's department or its parent college.
3. `get_my_request_actor_inbox` — drop the
   `is_current_user_registrar() OR is_current_user_admin_actor()`
   inclusion; `is_actionable` reuses the strict check.
4. `can_current_user_act_on_step` — remove the admin-only `skip`
   shortcut; if admin oversight is needed later, add a **separate**
   audited RPC (`admin_force_workflow_step_transition`) rather than
   embedding it in the normal actor path.
5. Issuance / archive functions are transitively covered because they
   both gate on `can_current_user_act_on_step` at entry.

## Required security tests (delivered)

`tests/security/workflow-actor-authorization-hardening-01.test.ts`
verifies the draft SQL removes each bypass and encodes the strict
assignee-match ordering. The DB has not been migrated; the test asserts
against the draft file text (source-only phase).

Follow-up runtime tests (post-approval) MUST cover:

- registrar can sign only `registrar_signature` assigned to them
- registrar rejected from `dean_signature`, `document_issuance`, `archive`
- admin rejected from all normal workflow steps
- role-only holder without an assignment rejected
- staff not in the assignment rejected even inside the same unit
- faculty not in the assignment rejected
- dean without a scoped position assignment rejected
- correct assignee succeeds
- direct PostgREST call by unauthorized user returns `42501`
- `get_my_request_actor_inbox` never marks other actors' steps as
  `is_actionable`
- idempotency, step ordering, and `workflow_events` behavior unchanged

## Status

- **Completed:** read-only audit, root-cause report, hardening SQL
  draft, source-only test file. Test requests / documents / signatures
  untouched.
- **Next action:** human review of the draft SQL, then a separate phase
  to open a real migration under `supabase/migrations/`, followed by a
  data-remediation ticket for `SR-20260716-26BAD4C8` and
  `USR-2026-000002`.
- **Blockers:** none for the source phase; runtime tests and data
  remediation require the approved migration to be applied first.
- **Readiness:** SOURCE-ONLY deliverables ready for review.
- **Production impact of THIS phase:** none — nothing was applied,
  deployed, or published.
