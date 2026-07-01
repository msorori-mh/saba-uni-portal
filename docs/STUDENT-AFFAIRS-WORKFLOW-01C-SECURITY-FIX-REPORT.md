# STUDENT-AFFAIRS-WORKFLOW-01C — Security Fix Report

Project: بوابة كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ  
Scope: Security hardening only for blockers reported by `STUDENT-AFFAIRS-WORKFLOW-01B`.  
Mode: No production data changes, no imports, no deletes, no cleanup/reset, no grade changes, no student transfer, and no automatic student status changes.

## 1. Executive Summary

**Proposed decision: `PASS WITH NOTES`**

The 01B blockers were addressed with a limited code + RLS hardening change:

- Server functions now use scoped request access checks instead of broad administrative role checks.
- Attachment signed URLs now use the same request access rule.
- Workflow action authorization is tightened to the current role/step.
- `complete` is restricted to a final step or explicit `can_complete` workflow setting.
- UI action buttons are rendered from server-returned `allowed_actions`.
- RLS for workflow steps/events no longer grants broad authenticated insert/update access.

`bun run build` succeeds. `bun run lint` still fails due to existing repository-wide Prettier issues unrelated to this PR.

## 2. Files Changed

| File | Reason |
|---|---|
| `src/lib/student-affairs.functions.ts` | Tighten request detail access, signed URL authorization, workflow action validation, and allowed actions. |
| `src/routes/admin/student-requests.lazy.tsx` | Render only actions allowed by the server for the current workflow step. |
| `supabase/migrations/20260707120000_student_affairs_workflow_security_hardening.sql` | Add SQL access helpers and tighten RLS/storage policies. |

## 3. Migration

Migration added:

`supabase/migrations/20260707120000_student_affairs_workflow_security_hardening.sql`

Purpose:

- Add helper functions:
  - `public.can_access_student_service_request(uuid, uuid)`
  - `public.can_act_on_student_service_request(uuid, uuid)`
- Replace broad RLS policies on:
  - `student_service_request_steps`
  - `student_service_request_events`
- Remove broad authenticated insert/update policies for workflow steps/events.
- Tighten `student-request-attachments` storage select policy for privileged users.

No previous migration is reapplied, and `schema_migrations` is not touched.

## 4. 01B Risks and Fixes

| 01B Risk | Fix |
|---|---|
| Broad request details access via `ADMIN_ROLES` | `getStudentServiceRequestDetails` now allows owner, `admin`, `system_admin`, or a user whose actual DB role matches the request `current_role_key`. |
| Broad attachment signed URL access | `getStudentRequestAttachmentSignedUrl` now uses the same request access helper logic. |
| Broad RLS SELECT/UPDATE on workflow steps | RLS now uses `can_access_student_service_request`; authenticated INSERT/UPDATE policies are intentionally not recreated. |
| Broad RLS SELECT/INSERT on workflow events | RLS now uses `can_access_student_service_request`; authenticated INSERT policy is intentionally not recreated. |
| `complete` from any step | `complete` is allowed only on the final step, or when a workflow step explicitly has `can_complete: true`. |
| UI showed all actions | Admin UI now renders only `request.allowed_actions` returned by `getPendingStudentRequestsForRole`. |

## 5. RLS Before / After

| Object | Before | After |
|---|---|---|
| `student_service_request_steps` SELECT | Owner OR broad admin roles | `can_access_student_service_request(auth.uid(), request_id)` |
| `student_service_request_steps` INSERT | Broad privileged roles | No authenticated insert policy; server-side only. |
| `student_service_request_steps` UPDATE | Broad privileged roles | No authenticated update policy; server-side only. |
| `student_service_request_events` SELECT | Owner OR broad admin roles | `can_access_student_service_request(auth.uid(), request_id)` |
| `student_service_request_events` INSERT | Broad privileged roles | No authenticated insert policy; server-side only. |
| storage `sra_storage_select_priv` | Broad privileged roles for bucket | Only if attachment maps to a request accessible by current user. |

## 6. Server Functions Before / After

| Function | Before | After |
|---|---|---|
| `getStudentServiceRequestDetails` | Owner OR any `ADMIN_ROLES` role | Owner OR admin/system_admin OR current workflow role. |
| `getPendingStudentRequestsForRole` | Scoped list for non-admin roles | Also returns `allowed_actions` computed from workflow step. |
| `actOnStudentServiceRequest` | Current role check; `complete` broadly possible | Current role check + allowed actions + final-step complete restriction. |
| `returnStudentServiceRequestForCompletion` | Delegated to workflow action | Still delegated, with tightened shared logic. |
| `getStudentRequestAttachmentSignedUrl` | Owner OR any `ADMIN_ROLES` role | Owner OR admin/system_admin OR current workflow role. |

## 7. Signed URL Before / After

| Scenario | Before | After |
|---|---|---|
| Student opens own attachment | Allowed | Allowed |
| Student opens another student's attachment | Denied | Denied |
| Current-role staff opens attachment | Allowed via broad role | Allowed via scoped current-role access |
| Unrelated staff opens attachment | Potentially allowed if in `ADMIN_ROLES` | Denied |
| Admin/system_admin opens attachment | Allowed | Allowed by design |
| Public permanent links | Not used | Not used |

## 8. Workflow Action Authorization Before / After

| Action | Before | After |
|---|---|---|
| `approve` | Current role or admin/system_admin | Current role or admin/system_admin and allowed on current step |
| `forward` | Current role or admin/system_admin | Requires next step and allowed on current step |
| `return_for_completion` | Current role or admin/system_admin, note required | Same, with allowed-action enforcement |
| `reject` | Current role or admin/system_admin, note required | Same, with allowed-action enforcement |
| `complete` | Current role or admin/system_admin on any step | Only final step or explicit `can_complete: true` |

## 9. Verification Results

| Check | Result |
---|---|
| `bun run build` | PASS |
| `bun run lint` | FAIL — existing repository-wide Prettier issues unrelated to this PR |
| Static check: broad detail access removed | PASS |
| Static check: broad signed URL access removed | PASS |
| Static check: broad workflow steps/events RLS removed | PASS |
| Static check: UI no longer shows all actions blindly | PASS |

## 10. Remaining Notes / Risks

- This fix is scoped to authorization hardening only.
- The workflow UI still does not implement a new upload widget in `/student/requests/new`; existing attachment infrastructure remains available through older request UI paths.
- Existing legacy `updateStudentRequestStatus` remains for legacy request flows. This PR does not remove or refactor legacy request handling.
- Runtime role-matrix testing with real QA accounts is still recommended after deployment.

## 11. Final Proposed Decision

`PASS WITH NOTES`

The 01B blockers addressed by this PR are mitigated in code/RLS. The remaining notes are follow-up hardening/usability items, not blockers for the specific 01C security fix scope.
