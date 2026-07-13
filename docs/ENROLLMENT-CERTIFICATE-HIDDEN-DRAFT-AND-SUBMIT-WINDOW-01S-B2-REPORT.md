# ENROLLMENT-CERTIFICATE-HIDDEN-DRAFT-AND-SUBMIT-WINDOW-01S-B2 — Report

## Decision

**PASS_ENROLLMENT_CERTIFICATE_HIDDEN_E2E_SUBMIT_WINDOW_PR_READY_FOR_REVIEW** (code/PR only)

Adopted strategy: **ACTIVE_HIDDEN_SUBMIT_WINDOW**

- Draft created while `is_active=false` and `student_visible=false`
- Temporary window: `is_active=true`, `student_visible=false`
- Student submits via unmodified `public.submit_student_request`
- Window closed immediately back to inactive+hidden

B1 historical result preserved:
`BLOCKED_HIDDEN_E2E_DRAFT_RPC_SUBMIT_STILL_REQUIRES_VISIBILITY`
(see `docs/ENROLLMENT-CERTIFICATE-HIDDEN-E2E-ADMIN-CREATE-RPC-01S-B1-REPORT.md`)

## 1. Why this RPC pair is needed

Hidden E2E cannot use student `create_student_request` (requires active+visible).
Student submit requires `is_active=true` but must not expose the type publicly.
Therefore:

1. Admin-only draft create bypasses visibility/activity for **create only**
2. Admin-only temporary `is_active` flip enables official submit
3. `student_visible` stays false so catalog/create remain closed

## 2. Original create_student_request contract

Source: `supabase/migrations/20260710140000_student_request_types_rpc_rls.sql`

```text
create_student_request(
  p_request_type text,
  p_title text,
  p_form_data jsonb DEFAULT '{}',
  p_student_notes text DEFAULT NULL
) RETURNS uuid
```

Requires: auth, student profile, `is_active=true`, `student_visible=true`,
`assert_student_can_use_request_type`, inserts `status='draft'`.
No audit/notification/runtime/fee on create.

## 3. Allowed difference for the new draft RPC

Only difference vs create:

- Skips `request_type.is_active=true`
- Skips `request_type.student_visible=true`

Does **not** skip student role/profile/audience/open-request/workflow readiness gates.
Does **not** modify submit.

## 4. Final RPC signatures

```text
admin_create_enrollment_certificate_e2e_draft(
  p_student_user_id uuid,
  p_e2e_marker text,
  p_student_notes text DEFAULT NULL
) RETURNS jsonb

admin_set_enrollment_certificate_e2e_submit_window(
  p_open boolean,
  p_e2e_marker text
) RETURNS jsonb
```

## 5. Privileges

Both RPCs:

- `SECURITY DEFINER`
- `SET search_path = public`
- Guard: `assert_can_admin_enrollment_certificate_e2e()` → `admin` / `system_admin` only
- `REVOKE ALL` from `PUBLIC`, `anon`
- `GRANT EXECUTE` to `authenticated` (app-role check inside)
- Internal helpers revoked from `PUBLIC`, `anon`, `authenticated`

## 6. Student / eligibility checks (draft)

- `auth.users` exists; reject if `banned_until > now()`
- Exactly one `student_profiles` row for `user_id`
- `has_any_role(..., student)`
- `assert_student_can_use_request_type(profile_status, request_audience)`
- No open enrollment_certificate request with a different marker
- Type must be inactive+hidden; workflow active v2 with 7 steps / 9 transitions; 6 active assignments

## 7. Idempotency

- Advisory lock: `enrollment_cert_e2e_draft:{student}:{marker}`
- Same student + type + marker → return existing `request_id`, `reused_existing=true`
- No new audit on idempotent reuse
- Different marker with open request → error

Window close is idempotent (`is_active=false` even if already false).

## 8. Audit behavior

| Event | action | entity |
|---|---|---|
| Draft create | `admin_e2e_request_draft_created` | `student_request` |
| Window open | `enrollment_certificate_e2e_submit_window_opened` | `request_type` |
| Window close | `enrollment_certificate_e2e_submit_window_closed` | `request_type` |

## 9. Submit compatibility result

| Gate | Result |
|---|---|
| `submit_student_request` requires `is_active=true` | Yes |
| Re-checks `student_visible` | **No** |
| Catalog (`get_available...`) requires both active+visible | Yes → hidden while window open |
| `create_student_request` requires both | Yes → public create stays blocked |
| `get_my_student_requests` ownership listing | Yes → owner can see draft |

Therefore active+hidden window is sufficient for owned-draft submit without public exposure.

## 10. Files modified

- `supabase/migrations/20260713020000_enrollment_certificate_hidden_e2e_draft_and_submit_window.sql`
- `src/lib/enrollment-certificate-e2e-auth.ts`
- `src/lib/admin-enrollment-certificate-e2e.functions.ts`
- `src/integrations/supabase/types.ts`
- `tests/admin/enrollment-certificate-hidden-e2e-submit-window-01s-b2.test.ts`
- `docs/ENROLLMENT-CERTIFICATE-HIDDEN-E2E-ADMIN-CREATE-RPC-01S-B1-REPORT.md` (B2 transition section)
- `docs/ENROLLMENT-CERTIFICATE-HIDDEN-DRAFT-AND-SUBMIT-WINDOW-01S-B2-REPORT.md`

## 11. Migration name

`20260713020000_enrollment_certificate_hidden_e2e_draft_and_submit_window.sql`

Apply does **not** create requests, flip `is_active`, flip `student_visible`, or alter workflow/assignments.

## 12. Verification results

| Check | Result |
|---|---|
| `bunx tsc --noEmit` | pass |
| `bun run build` | pass (prior run in phase) |
| `bun test tests/admin` | pass |
| `bun test tests/student-requests` | pass |
| `bun test` | pass |
| `git diff --check` | pass |

## 13–16. Safety confirmations

- Migration **not** applied
- **0** DB writes
- No Deploy
- No request created
- No PR merge

## 17. Future execution protocol (not run now)

1. Admin creates E2E draft (`adminCreateEnrollmentCertificateE2EDraft`)
2. Verify `request_id` + marker
3. Admin opens window (`open: true`)
4. Verify `is_active=true`, `student_visible=false`
5. Target student calls `submit_student_request(request_id)`
6. Verify submit + runtime init (workflow v2 / `initial_review`)
7. Admin closes window immediately (`open: false`) — even if submit failed
8. Verify `is_active=false`, `student_visible=false`
9. Staff continues at `initial_review` (Haitham via existing resolver)

## Server functions

- `adminCreateEnrollmentCertificateE2EDraft`
- `adminSetEnrollmentCertificateE2ESubmitWindow`

No public route/button; user-session RPC only (no service-role bypass).

## Authorization matrix

| Role | Allowed |
|---|---|
| admin | yes |
| system_admin | yes |
| registrar | no |
| student_affairs | no |
| finance_officer | no |
| dean | no |
| faculty_member | no |
| student | no |
| graduate | no |
| authenticated (no role) | no |
| anonymous | no |

## Disable / retire plan (later phase)

Drop or revoke EXECUTE on both RPCs and remove server functions after E2E completes.
Do not leave the submit window open.
