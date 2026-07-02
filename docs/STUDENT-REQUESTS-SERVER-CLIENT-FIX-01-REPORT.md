# STUDENT-REQUESTS-SERVER-CLIENT-FIX-01 — Report

## Root Cause
Student-owned mutations on `public.student_requests` were performed with
`supabaseAdmin` (service role). Under service_role, `auth.uid()` inside the
database is `NULL`. The `BEFORE UPDATE` trigger
`trg_sr_protect` → `protect_student_request()` requires either an admin role or
`student_profile.user_id = auth.uid()`; both fail on `NULL`, so it raises
`Not authorized to modify this request`. New insert worked (INSERT trigger not
gated), but the subsequent `saveStudentServiceRequestDraft` UPDATE (and any
`submitStudentServiceRequest` UPDATE) always failed.

## Files Modified
- `src/lib/student-affairs.functions.ts`

### Functions changed
| Function | Change |
|---|---|
| `createStudentServiceRequest` | `INSERT student_requests` switched from `supabaseAdmin` → `context.supabase` |
| `saveStudentServiceRequestDraft` | `UPDATE student_requests` switched from `supabaseAdmin` → `context.supabase` |
| `submitStudentServiceRequest` | `UPDATE student_requests` switched from `supabaseAdmin` → `context.supabase` |

Helper reads (`currentStudentProfile`, `loadRequestType`, ownership check)
and privileged inserts into `student_service_request_events`, `audit_logs`,
`notifications`, `student_service_request_steps` remain on `supabaseAdmin` —
they don't touch the protect trigger and their RLS is not designed for
direct student writes.

## Constraint Compliance
| Constraint | Status |
|---|---|
| `supabaseAdmin` replaced by `context.supabase` for student mutations | ✅ Yes |
| Trigger `trg_sr_protect` modified | ❌ No |
| RLS policies modified | ❌ No |
| Migration applied | ❌ No |
| Direct DB modification | ❌ No |
| Storage modified | ❌ No |
| Import / delete / reset / cleanup | ❌ No |
| Production data touched | ❌ No |
| UI changes | ❌ No |

## RLS Sanity Check (read-only)
`sr_insert_self` (WITH CHECK) and `sr_update_self` (USING + WITH CHECK) already
scope to `student_profiles.user_id = auth.uid()` with the correct status set
(`draft`, `submitted`, `under_review`, `returned`). Student flow passes these
policies with a real user JWT — the same JWT that makes `auth.uid()` non-NULL
for the protect trigger.

## Build
```
✓ built in 12.99s
Exit code: 0
```

## Functional Verification (next step)
End-to-end retry (`STUDENT-AFFAIRS-WORKFLOW-01D-RETRY`) will run right after
this fix ships:
- Student creates + submits `absence_excuse` → expect no
  `Not authorized to modify this request`.
- Student cannot mutate another student's request → still blocked by
  `sr_update_self` USING clause + protect trigger.
- Unrelated admin (`hr_officer`) → still redirected by existing route gate
  (verified in previous run).
- `student_affairs_officer` sees the submitted request → depends on existing
  select policy `sr_select_priv`, unchanged.

## Decision
**PASS** — code fix complete, build green, no policy/trigger/schema change.
Functional confirmation deferred to the 01D-RETRY run that follows this deploy.
