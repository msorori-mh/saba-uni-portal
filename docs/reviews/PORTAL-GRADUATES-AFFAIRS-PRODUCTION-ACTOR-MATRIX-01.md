# PORTAL-GRADUATES-AFFAIRS-PRODUCTION-ACTOR-MATRIX-01

**Branch:** `feat/ga-final-closure-20260811`  
**Purpose:** Define the canonical actor matrix for Lovable Production E2E of Graduates Affairs.  
**Rule:** No actor below is created by this mission; Lovable owns production identity lifecycle.

---

## Actors

| Actor | Identity contract | Authority source | Scope |
|---|---|---|---|
| `graduate` | Same `auth.users` account used while a student. No second account is created on graduation. | Approved `graduate_records` row + in-force `graduate_account_continuity_policies` capability. | Own record only. |
| `graduate_affairs_manager` | Active `staff_profiles` row with one active `request_processing_assignments` row for unit `graduate_affairs` + role `graduate_affairs_manager`. | Active GA manager assignment (college-wide). | All graduate records; can create/assign follow-ups; can moderate opportunities; can verify employers. |
| `graduate_affairs_specialist` | Active `staff_profiles` row with one active `request_processing_assignments` row for unit `graduate_affairs` + role `graduate_affairs_specialist`, plus one or more `staff_profile_departments` rows. | Active GA specialist assignment + department scope. | Records whose `department_id` is in the specialist's `staff_profile_departments` set only. |

---

## Negative actors (must be denied for GA operations)

| Actor | Denial reason |
|---|---|
| `admin` / `system_admin` | GA authority is assignment-based, not app-role-based. |
| `dean` | Same as above. |
| `registrar` | Same as above. |
| `student_affairs` / `student_affairs_manager` / `student_affairs_specialist` | Same as above. |
| Anonymous / unauthenticated | `GRADUATE_AFFAIRS_NOT_AUTHENTICATED`. |
| Specialist without department binding | `GRADUATE_AFFAIRS_ACCESS_DENIED` / `GRADUATE_AFFAIRS_OUT_OF_SCOPE`. |
| Specialist with `staff_profiles.department_scope = 'all'` but no `staff_profile_departments` | Still denied; `department_scope` is non-authoritative. |

---

## Positive path scenarios (Lovable E2E)

| # | Actor | Scenario | Expected result |
|---|---|---|---|
| P1 | `graduate` | Sign in with continuity-approved account, visit `/student/graduates-affairs`. | Dashboard loads; GraduateFileCard shown; contact points, opportunities, events visible. |
| P2 | `graduate` | Add a contact point. | `graduate_add_contact_point` succeeds; list refreshes; value never shown in UI. |
| P3 | `graduate` | Grant consent for `communications` purpose. | `graduate_grant_consent` succeeds. |
| P4 | `graduate` | Report employment status. | `graduate_report_employment` succeeds with append-only event. |
| P5 | `graduate` | Register for a published event matching audience scope. | `graduate_register_for_event` succeeds. |
| P6 | `graduate` | Submit survey response with valid consent. | `graduate_submit_survey_response` succeeds. |
| P7 | `graduate_affairs_manager` | Sign in, visit `/staff/graduates-affairs`. | Workspace loads; records from all departments visible. |
| P8 | `graduate_affairs_manager` | Open a graduate file. | File panel loads with follow-ups, counts, and metrics. |
| P9 | `graduate_affairs_manager` | Create a follow-up assigned to a staff member. | `graduate_affairs_create_followup` succeeds. |
| P10 | `graduate_affairs_manager` | Transition a followup `open → in_progress → completed`. | `graduate_affairs_transition_followup` succeeds; outcome required on complete. |
| P11 | `graduate_affairs_specialist` | Sign in with department-scoped binding. | Workspace loads; only records in scoped departments visible. |
| P12 | `graduate_affairs_specialist` | Open a record inside scope. | File panel loads. |
| P13 | `graduate_affairs_specialist` | Attempt to create follow-up for out-of-scope record. | Denied by RPC. |

---

## Negative path scenarios (Lovable E2E)

| # | Actor | Scenario | Expected result |
|---|---|---|---|
| N1 | `admin` | Visit `/staff/graduates-affairs`. | Feature flag ON allows route mount, but RPCs deny every operational call. |
| N2 | `dean` | Attempt `graduate_affairs_search_records`. | `GRADUATE_AFFAIRS_ACCESS_DENIED`. |
| N3 | `registrar` | Attempt `graduate_affairs_get_graduate_file`. | `GRADUATE_AFFAIRS_ACCESS_DENIED`. |
| N4 | `student_affairs_manager` | Attempt staff GA RPC. | `GRADUATE_AFFAIRS_ACCESS_DENIED`. |
| N5 | `graduate_affairs_specialist` (unscoped) | Visit workspace. | Empty results or access denied on record open. |
| N6 | `graduate_affairs_specialist` (unscoped) | Attempt `graduate_affairs_create_followup`. | `GRADUATE_AFFAIRS_ACCESS_DENIED`. |
| N7 | Active student (no approved graduate record) | Visit `/student/graduates-affairs`. | Self-context denies with `graduate_record_not_owned` or `graduate_record_absent`. |
| N8 | Graduate with corrected/revoked record | Visit self-service. | Denied with `graduate_record_corrected` / `graduate_record_revoked`. |
| N9 | Graduate without continuity policy | Visit self-service. | Denied with `account_continuity_policy_undecided`. |
| N10 | Graduate trying to view another graduate's record | Call `graduate_affairs_get_graduate_file` with another id. | `GRADUATE_AFFAIRS_ACCESS_DENIED`. |

---

## Specialist scope decision

- Real specialist `aa4f5c16-c993-4af6-a6d4-59d9542c1a7f` remains unscoped per owner decision `AMBIGUOUS_SPECIALIST_DO_NOT_SCOPE`.
- Production E2E must use the TEST_ONLY single-department fixture if a scoped specialist is required:
  - `SAFE_SPECIALIST_CANDIDATE=a6e30100-0000-4000-a300-000000000001`
  - `SAFE_SPECIALIST_DEPARTMENT=11111111-1111-4111-8111-111111111111`
  - Fixture: `docs/production-test-fixtures/GA-SPECIALIST-SINGLE-DEPT-TESTONLY-FIXTURE-01.sql`
- Do not invent department bindings for the ambiguous real specialist.
