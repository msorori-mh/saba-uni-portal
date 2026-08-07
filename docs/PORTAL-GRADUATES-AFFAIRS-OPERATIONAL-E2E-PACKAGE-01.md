# PORTAL-GRADUATES-AFFAIRS-OPERATIONAL-E2E-PACKAGE-01

Date: 2026-08-07  
Mission: `PORTAL-GRADUATES-AFFAIRS-OWNER-GATE-AND-RUNTIME-WIRE-01` §G9  
Integration baseline: `feat/graduates-affairs-single-sha-integration-01`  
Status: **PREPARED_NOT_EXECUTED**  
Do not execute against production. Do not unfreeze or mutate staging unless separately authorized.

## Actor matrix (positive + negative)

| Actor | Expected alumni-ops result |
|---|---|
| Graduate self (approved fact + continuity + own record) | ALLOW self RPCs only |
| Other graduate | DENY (zero mutation) |
| Manager assigned (`graduate_affairs_manager`) | ALLOW college-scoped staff RPCs |
| Manager wrong scope / inactive / expired | DENY |
| Specialist assigned (in-department) | ALLOW in-scope |
| Specialist unassigned (empty departments) | DENY |
| Specialist wrong department | DENY |
| Student affairs actor (`student_affairs*`) without GA assignment | DENY |
| Registrar (academic authority only) | DENY alumni ops; academic intake stays separate |
| Dean | DENY |
| Admin / system_admin | DENY |
| Anonymous | DENY |

Every DENY: assert byte-identical domain row counts / checksums for target tables (zero side effects), including `graduate_domain_events` not gaining unauthorized mutation payloads.

## Direct RPC calls

Positive and negative calls must target AUTH-04 names only (see `GRADUATES_AFFAIRS_AUTH04_RPCS`). Include:

- Self: `graduate_update_own_profile`, consent/contact/employment/survey/event/list RPCs
- Staff: `graduate_affairs_get_graduate_file`, `graduate_affairs_search_records`, follow-up, moderate, employer verify, cohort report
- Visibility: `graduate_list_visible_opportunities` / `events` after corrected/revoked → `GRADUATE_RECORD_NOT_CURRENT`
- Privilege analogues: registrar/dean/admin JWT without GA assignment → DENY

## Journey script (staging / disposable only)

1. Registrar/academic authority inserts **approved** official graduation decision (intake owned outside GA).
2. Governed operator creates authoritative graduate fact via `create_graduate_record_from_official_decision` (not client EXECUTE).
3. Insert approved account-continuity policy listing explicit capabilities (OWNER_D2).
4. Graduate logs in with the **same** auth identity.
5. Self profile / consent / contact flows where continuity + consent allow.
6. Graduates-affairs scoped staff processing (manager/specialist/assignee).
7. Cohort/survey aggregate report: cells below threshold suppressed (`محجوب` / NULL), never row-level export.

## Preconditions before any execution

- Promotion package applied on the target environment.
- Assignment seed complete for test staff only.
- Application feature flags may be ON **only** in that authorized test environment.
- No production writes.

## Stop conditions

- Any DENY that mutates data → abort and remediate.
- Any path using direct table writes from portal adapters → abort.
- Any admin/dean/registrar bypass into alumni ops → abort.
