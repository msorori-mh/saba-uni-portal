# ENROLLMENT-CERTIFICATE-HIDDEN-E2E-ADMIN-CREATE-RPC-01S-B1 — Report

## Decision

**BLOCKED_HIDDEN_E2E_DRAFT_RPC_SUBMIT_STILL_REQUIRES_VISIBILITY**

No migration, no RPC, no server function, no draft creation, no DB writes, no deploy, no merge.

## Exact blocker

Current production `public.submit_student_request(uuid)` (latest definition in
`supabase/migrations/20260710190000_student_request_workflow_runtime.sql`) re-checks:

```sql
IF NOT FOUND OR v_type.is_active IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'نوع الطلب غير مفعل' USING ERRCODE = '42501';
END IF;
```

For `enrollment_certificate` the production request type must remain:

- `is_active = false`
- `student_visible = false`

Therefore:

1. An admin-created draft for that type **cannot** be submitted by the target student through the official submit RPC.
2. Phase instructions forbid creating an admin RPC that bypasses or replaces `submit_student_request` in this stage.
3. Implementing draft-only creation would produce an unusable E2E path and invite unsafe workarounds.

Note: `submit_student_request` does **not** currently re-check `student_visible`. The hard blocker is **`is_active`**, not visibility alone. The decision code name from the phase brief is retained; the precise gate is `request_types.is_active`.

## Contract audit (read-only)

### `create_student_request`

Source of truth: `supabase/migrations/20260710140000_student_request_types_rpc_rls.sql`

Signature:

```text
create_student_request(
  p_request_type text,
  p_title text,
  p_form_data jsonb DEFAULT '{}',
  p_student_notes text DEFAULT NULL
) RETURNS uuid
```

Behavior:

| Topic | Actual |
|---|---|
| Owner link | `student_profile_id` from `current_student_profile_for_auth()` (auth.uid → profile) |
| Initial status | `draft` |
| Required fields | request type code, title; form_data defaults `{}` |
| Type gates | `is_active = true` **and** `student_visible = true` |
| Eligibility | `assert_student_can_use_request_type(profile_status, request_audience)` |
| Open-request duplicate | **Not enforced in this RPC** for enrollment_certificate |
| Audit | **None** inside create |
| Notifications | **None** inside create |
| Runtime / fee / docs | **None** on create |

Insert columns used: `request_number`, `student_profile_id`, `request_type`, `title`, `description`, `status`, `form_data`, `student_notes`.

### `submit_student_request`

Source of truth: `supabase/migrations/20260710190000_student_request_workflow_runtime.sql`

| Topic | Actual |
|---|---|
| Ownership | request must belong to current student’s `student_profile_id` |
| Allowed prior statuses | `draft`, `returned`, `returned_for_completion` |
| Type gate | **`is_active = true` required**; `student_visible` **not** re-checked |
| Eligibility | `assert_student_can_use_request_type` again |
| Status after submit | `submitted` (+ `submitted_at`) |
| Workflow | calls `initialize_student_request_workflow` |
| Audit / notifications | not in submit body itself; initializer may create runtime steps |

### Catalog / listing

`get_available_request_types_for_current_student` filters:

- `rt.is_active = true`
- `rt.student_visible = true`

So a hidden inactive type stays out of the student catalog (good for this scenario).

`get_my_student_requests` returns the student’s own requests by profile ownership; it does not filter out drafts by type visibility. A draft could be listed even if the type is hidden — but submit would still fail on `is_active`.

### Workflow helpers

- `get_active_workflow_for_request_type(request_type_id)` → active workflow (`status=active`, `is_active=true`)
- `initialize_student_request_workflow(request_id)` → creates runtime steps on submit when active workflow exists

Production reference from phase brief (not written in this phase):

- request_type_id `da670e75-2ce3-4a60-a41e-7eb89fa9dfdc`
- active workflow_id `7e06dfe1-ac07-432b-bb56-229c5c2de00c` (v2, 7 steps, 9 transitions)

## Allowed difference that would have been implemented (blocked)

The draft RPC would have reused create-student-request eligibility/audience/open-request rules and **only** skipped:

- `request_type.is_active = true`
- `request_type.student_visible = true`

That alone is insufficient because submit still requires `is_active = true`.

## What was not done (in B1)

- No `admin_create_enrollment_certificate_e2e_draft` migration in B1
- No server function in B1
- No UI route/button
- No Migration apply
- No Supabase CLI / DB writes
- No request created
- No Deploy / merge

## Recommended next phase (not executed in B1)

Choose one explicitly approved approach:

1. **Controlled submit exception** for already-owned drafts of inactive+hidden `enrollment_certificate` only (narrow SECURITY DEFINER change to submit, with admin/system_admin-created marker checks), **or**
2. Temporary activate-without-student_visible for E2E window, **or**
3. Separate staff-driven test harness that does not use student submit.

Until one of those is approved, hidden E2E create+student-submit cannot be completed safely under current contracts.

## Verification performed (B1)

- Read-only code/schema audit of create/submit/listing/workflow RPCs
- Confirmed blocker in latest `submit_student_request` body
- No typecheck/build/test suite required for a blocked no-code outcome beyond this report

---

## Transition to B2 (ACTIVE_HIDDEN_SUBMIT_WINDOW)

B1 remains historically blocked as documented above.

Phase **ENROLLMENT-CERTIFICATE-HIDDEN-DRAFT-AND-SUBMIT-WINDOW-01S-B2** adopts option 2 with a guarded temporary window:

- Keep `student_visible = false` at all times (catalog + create stay closed).
- Temporarily set `is_active = true` only long enough for the marked E2E draft owner to call the **unmodified** `submit_student_request`.
- Close the window immediately afterward (`is_active = false`, `student_visible = false`).
- Do **not** modify `submit_student_request` / `create_student_request`.

Full B2 implementation details:
`docs/ENROLLMENT-CERTIFICATE-HIDDEN-DRAFT-AND-SUBMIT-WINDOW-01S-B2-REPORT.md`
