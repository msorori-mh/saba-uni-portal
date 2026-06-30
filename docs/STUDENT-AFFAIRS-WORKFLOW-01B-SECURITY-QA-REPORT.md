# STUDENT-AFFAIRS-WORKFLOW-01B — Security + QA + Role Matrix Verification

Project: بوابة كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ  
Repository: `msorori-mh/saba-uni-portal`  
Production: `quboolye.com`  
Mode: Read-only QA report. No production data, schema, imports, deletes, cleanup, reset, grade changes, student transfers, or student status changes were performed.

## 1. Executive Summary

**Decision: `BLOCKED`**

The workflow foundation from PR #69 is present on `main` (`8fd447b`, including merge commit `b070e1e`), and `bun run build` succeeds. However, static security review found authorization and RLS gaps that should be fixed before this workflow is considered ready for the next phase or broad production use.

The most important blockers are:

1. `getStudentServiceRequestDetails` grants broad detail visibility to all roles listed in `ADMIN_ROLES`, regardless of the request's `current_role_key`.
2. `getStudentRequestAttachmentSignedUrl` allows all roles in `ADMIN_ROLES` to generate signed URLs for any attachment, not only roles currently assigned to that request step.
3. RLS policies on `student_service_request_steps` and `student_service_request_events` allow broad privileged-role read access and, for steps, broad update access, instead of scoping by `current_role_key` or assignment.
4. `actOnStudentServiceRequest` permits `complete` from any active step for an authorized current role, rather than restricting completion to a final/implementation step.
5. Admin UI renders workflow action buttons for all pending workflow rows it receives. Server-side checks mitigate forged actions, but the UI does not hide unavailable actions by state/step/action.
6. The UI currently has no actual upload control for new workflow attachments; signed URL verification is therefore limited to static review.

Because the task instructions say to stop if a role bypass or unauthorized signed URL risk is found, no fix was implemented in this QA phase.

## 2. Sync / Build / Tooling Results

| Check | Result |
|---|---|
| `main` synced | PASS |
| Latest local `main` | `8fd447b Applied migration & deployed` |
| PR #69 merge commit present | PASS — `b070e1e` |
| `bun run build` | PASS |
| `bun run lint` | FAIL — existing repository-wide Prettier/lint errors unrelated to this QA report |
| Standalone typecheck script | Not available in `package.json` |
| Production data modified | No |
| Imports executed | No |
| Delete / cleanup / reset | No |
| Migrations applied | No |

### Lint note

`bun run lint` fails with repository-wide formatting issues across many pre-existing files (`public/sw.js`, `src/components/...`, tests, etc.). This was not fixed because this phase is verification only.

## 3. Existing System Inventory

The implementation is built on existing request/document infrastructure:

| Area | Existing object / file |
|---|---|
| Request types | `request_types` |
| Student requests | `student_requests` |
| Request attachments | `student_request_attachments` |
| Official documents | `official_documents` |
| Official transcript details | `official_transcript_request_details` |
| Notifications | `notifications` |
| Audit | `audit_logs`, `student-request-timeline.ts` |
| Storage bucket | `student-request-attachments` |
| Student portal existing requests UI | `components/portal/StudentRequestsSection.tsx`, mobile requests route |
| Admin requests UI | `src/routes/admin/student-requests.lazy.tsx` |
| New workflow server functions | `src/lib/student-affairs.functions.ts` |
| New workflow UI routes | `/student/requests`, `/student/requests/new`, `/student/requests/$id` |

The PR #69 migration adds:

- `student_service_request_steps`
- `student_service_request_events`
- workflow columns on `request_types`
- workflow columns on `student_requests`

## 4. Role Matrix

| Role | Expected access | Observed/static review result | Status |
|---|---|---|---|
| Student | Own requests only; can draft/submit/cancel allowed requests; cannot act administratively | Ownership checks are present in student create/save/submit/list/details. Admin action function is not available to student because user role check fails. | PASS |
| Student Affairs | Should see/act only when request current step requires `student_affairs` | `getPendingStudentRequestsForRole` scopes non-admin roles by `current_role_key`, but `getStudentServiceRequestDetails`, attachment signed URL, RLS steps/events are broader. | BLOCKED |
| Academic Affairs / Registrar | Should see/act only when current role is `registrar` or equivalent | Action path checks current role, but details and attachments are broadly visible to all admin roles. | BLOCKED |
| Department Head | Should see/act when current role is `department_head` | Pending list and action checks are scoped; details/attachments/steps RLS are broad for all admin roles. | BLOCKED |
| Dean | Should see/act when current role is `dean` | Pending list and action checks are scoped; details/attachments/steps RLS are broad. | BLOCKED |
| Admin | May have higher exception by design | `admin` can view/act globally. This appears intentional. | PASS WITH DESIGN NOTE |
| System Admin | May have higher exception by design | `system_admin` can view/act globally. This appears intentional. | PASS WITH DESIGN NOTE |
| Finance Officer | Should not broadly access student affairs workflows unless current step requires finance | Included in `ADMIN_ROLES`, RLS steps/events, and attachment signed URL broad privileged access. | BLOCKED |

## 5. RLS Verification

| Object | Policy / behavior reviewed | Result | Notes |
|---|---|---|---|
| `student_requests` | Existing owner/admin RLS + trigger protection | PASS WITH NOTES | Existing `sr_update_priv` permits admin roles to update request rows directly through authenticated client; legacy design predates workflow. |
| `student_service_request_steps` SELECT | Owner OR broad admin roles | BLOCKED | Not scoped to `current_role_key`; `finance_officer` can read steps/events. |
| `student_service_request_steps` INSERT | admin/system/registrar/student_affairs | PASS WITH NOTES | Insert is privileged; server functions use service-side insert. |
| `student_service_request_steps` UPDATE | broad admin roles including finance/department/faculty | BLOCKED | Direct client update of workflow step rows is allowed by RLS for these roles. Actions should go through server functions/RPC only. |
| `student_service_request_events` SELECT | Owner OR broad admin roles | BLOCKED | Not scoped to current role/assignment. |
| `student_service_request_events` INSERT | broad admin roles | PASS WITH NOTES | Event insert from client should ideally be denied and only done server-side. |
| Storage bucket `student-request-attachments` | Existing bucket and RLS from older migrations | PASS WITH NOTES | Existing bucket is private; direct upload is supported by older UI. New workflow UI has no upload control yet. |

## 6. Server Functions Verification

| Function | Verification | Result |
|---|---|---|
| `getStudentRequestTypesForStudent` | Reads only active/student-visible request types. | PASS |
| `createStudentServiceRequest` | Uses current authenticated student's `student_profiles.user_id`; rejects non-students. | PASS |
| `saveStudentServiceRequestDraft` | Confirms request belongs to current student and status is draft/returned. | PASS |
| `submitStudentServiceRequest` | Confirms ownership and status, initializes workflow steps and current role. | PASS |
| `getMyStudentServiceRequests` | Filters by current student's profile id. | PASS |
| `getStudentServiceRequestDetails` | Owner check works for student, but any role in `ADMIN_ROLES` can view full details regardless of current step. | BLOCKED |
| `getPendingStudentRequestsForRole` | Non-admin roles filtered by `current_role_key`; admin/system_admin global. | PASS |
| `actOnStudentServiceRequest` | Checks current role or admin/system_admin; rejects wrong status. | PASS WITH NOTES |
| `actOnStudentServiceRequest` — `complete` | Allows completion by current role from any active step. | BLOCKED |
| `returnStudentServiceRequestForCompletion` | Requires note and delegates to same role check. | PASS |
| `cancelStudentServiceRequest` | Student ownership check and blocks approved/completed cancellation. | PASS |
| `getStudentRequestAttachmentSignedUrl` | Owner check works for students, but any `ADMIN_ROLES` role can sign any attachment. | BLOCKED |

## 7. Attachment / Signed URL Verification

| Scenario | Result | Notes |
|---|---|---|
| Owner opens own attachment | PASS by static review | Checks request owner via `student_profiles.user_id`. |
| Non-owner student opens another attachment | PASS by static review | Throws if not owner and not privileged. |
| Authorized admin/current role opens attachment | PARTIAL | Any `ADMIN_ROLES` user can open, not only current role/assigned staff. |
| Unauthorized admin role opens attachment | BLOCKED | `finance_officer` and other broad roles can sign URL even if not related to request. |
| Permanent public URLs | PASS | Uses private storage signed URL with 300-second expiry. |
| Service role in browser | PASS | Server-side only for signed URL generation. |
| Upload in new workflow UI | NOT IMPLEMENTED | Existing old portal section supports upload; new `/student/requests/new` does not yet expose upload. |

## 8. Legacy Regression Verification

| Legacy area | Static/build result | Status |
|---|---|---|
| `official_documents` | No changes in QA phase. | PASS |
| `official_transcript_request_details` | Existing flow untouched. | PASS |
| Old student request components | Existing files still present. | PASS WITH NOTES |
| `/admin/reports` | Build succeeds. | PASS |
| `/admin/students` | Build succeeds; no QA code changes. | PASS |
| `/admin/imports` | Build succeeds; no QA code changes. | PASS |
| `/admin/student-requests` | Existing page now includes workflow pending box from PR #69; static review found UI action visibility issue. | BLOCKED |

## 9. Manual Runtime QA Status

The requested end-to-end runtime tests require configured student/admin role test accounts and browser interaction against `quboolye.com`. In this environment, no test credentials were provided, and the phase constraints disallow modifying production data manually. Therefore:

- No student draft was created.
- No request was submitted.
- No admin approval/rejection/return action was executed.
- No attachment was uploaded.
- No production data changed.

Runtime E2E should be performed only after the security blockers below are fixed or explicitly risk-accepted in a controlled QA account set.

## 10. Risks / Blockers

| ID | Risk | Severity | Evidence | Required action |
|---|---|---:|---|---|
| R1 | Full request details visible to broad admin roles, not current workflow role | High | `getStudentServiceRequestDetails` grants all `ADMIN_ROLES` | Scope non-admin/system users by current role, assignment, ownership, or explicit privileged read roles. |
| R2 | Attachment signed URLs available to broad admin roles | High | `getStudentRequestAttachmentSignedUrl` uses `ADMIN_ROLES` as blanket privilege | Require current role/assigned role or admin/system_admin; optionally dean/registrar only when in workflow. |
| R3 | Workflow steps can be directly updated by broad roles through RLS | High | `ssrs_update_priv` includes dean/registrar/student_affairs/department_head/faculty_member/finance_officer | Deny direct client update; restrict mutation to server RPC/function path. |
| R4 | Workflow events can be directly inserted by broad roles through RLS | Medium | `ssre_insert_priv` includes broad roles | Prefer server-only insert or a stricter RPC path. |
| R5 | `complete` allowed at any current step | High | `actOnStudentServiceRequest` permits `complete` if role matches current step | Restrict `complete` to final execution steps, or explicit `can_complete` in workflow schema. |
| R6 | UI renders all workflow action buttons for all pending rows returned | Medium | `/admin/student-requests` pending workflow card shows all action buttons | Compute allowed actions from server or hide unavailable actions by current step/status/role. |
| R7 | New workflow UI lacks actual attachment upload | Medium | `/student/requests/new` only contains subject/details | Add upload control and attachment insert path before claiming attachment lifecycle support. |
| R8 | Existing legacy direct status update path remains | Medium | `updateStudentRequestStatus` and existing RLS can update old request statuses | Plan consolidation to avoid parallel state machines. |

## 11. Need for Fix PR

**Yes.** A corrective PR is required before declaring the workflow ready for the next phase.

Recommended minimum fix scope:

1. Restrict `getStudentServiceRequestDetails` for non-owner/non-admin/system users to requests where:
   - `current_role_key` matches one of the user's roles, or
   - a step assigned to that role/user exists, or
   - legacy admin request read permission is explicitly intended.
2. Restrict `getStudentRequestAttachmentSignedUrl` similarly.
3. Tighten RLS:
   - steps/events SELECT scoped to owner/current-role/admin/system_admin.
   - steps UPDATE and events INSERT should not be generally available from browser clients.
4. Restrict `complete` to explicit final execution steps.
5. Return allowed actions from a server function and render only those buttons.

## 12. Final Decision

`BLOCKED`

The foundation builds successfully, but security QA identified role-scope and signed URL authorization issues. No production data was modified, and no corrective migration/code change was performed in this QA phase.
