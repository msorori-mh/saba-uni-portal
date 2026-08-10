# B1-D02-READONLY-PRODUCTION-PREFLIGHT-PACKAGE-02

| field | value |
|---|---|
| status | `READY_FOR_AUTHORIZED_EXECUTION` — read-only package (not executed in this stage) |
| program | `PORTAL-B1-GO-LIVE-MIGRATION-DRIFT-TESTONLY-D02-FINAL-CLOSURE-LONGRUN-01` |
| version | `V2` |
| updated | 2026-08-10 |
| `SOURCE_SHA` | `9833269998a68f4ff1b86a57faf897f9b825f654` (current branch tip; **not** deployed proof) |
| `expected_release_sha` | `<fill only after independent deploy read-back>` |
| `DEPLOYED_SHA` | `UNKNOWN` — no deploy claim; never assume `SOURCE_SHA == DEPLOYED_SHA` |
| Supabase project | `wpmicqriltrowwonknox` |
| B1 legal ref | `docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md` |
| release candidate | `docs/PORTAL-FRESH-RELEASE-CANDIDATE-01.md` |
| cancelled prior baselines | `8f229d09…`, `427b7eb4…`, `0e2d25c9…` are **HISTORICAL** |

## 0. Why V2

This refresh closes the final Go-Live blockers reported by the independent review:
B1 migration-source drift, TEST_ONLY migrations in the production path, and the
broken D-02 department-chair sensor. It does NOT pin a release SHA; `expected_release_sha`
is filled only after an independent deploy read-back proves `DEPLOYED_SHA`.
`student_accounts` remains source-only — ممنوع إنشاء حسابات.

V1 (`docs/B1-D02-READONLY-PRODUCTION-PREFLIGHT-PACKAGE-01.md`) is retained as
historical context but must not be used as the current Go-Live gate.

## 0b. State dimensions (separated)

| dimension | value | how determined |
|---|---|---|
| `SOURCE_SHA` | `9833269998a68f4ff1b86a57faf897f9b825f654` | `git rev-parse HEAD` on this branch |
| `DEPLOYED_SHA` | `UNKNOWN` until independent deploy read-back | publish/deployment log or authorized endpoint probe |
| `PRODUCTION_DB_STATE` | fill after SELECT on production | Q1–Q3j below |
| `SERVICE_VISIBILITY` | fill from `request_types` + workflow evidence | Q3e |
| `FUNCTION_GRAPH` | fill from `pg_proc` / `obj_description` | Q3a, Q3c |
| `FIXTURE_STATE` | fill from `student_requests` + fixture tables | Q3g, fixture audit |
| `ASSIGNMENT_STATE` | fill from `request_processing_assignments` | Q3d |
| `MIGRATION_READINESS` | from Q1–Q3j; no apply | this package |
| `TEST_ONLY_IN_PRODUCTION_PATH` | must be 0 after archive/exclusion | Q3j + `docs/migration-drafts/B1-TESTONLY-EXCLUSION-MANIFEST-01.json` |
| `USER_APPROVAL_REQUIRED` | yes for production execution | runbook |

There is **no assumption** that `SOURCE_SHA == DEPLOYED_SHA`.

## 1. Allowed channels

- Supabase Dashboard SQL Editor (service)
- temporary read-only psql

**ممنوع:** GRANT, write SQL, DDL/DML, production RPC, إنشاء حسابات, mutate `student_visible`. بدون إنشاء حسابات.

## 2. Session guard

```sql
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
```

## 3. Q1 — schema_migrations

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

## 4. Q2 — ambiguity / partial across current drafts

```sql
select version, name
from supabase_migrations.schema_migrations
where name ilike any(array[
  '%LOG-AUDIT-CALL-DISAMBIGUATION%','%WORKFLOW-ACTOR-AUTHORIZATION%',
  '%PROCESSING-DOMAINS-EXPANSION%','%ATOMIC-SUBMIT-ACTION%',
  '%RELEASE-EVIDENCE-STAMP%','%EXTERNAL-UNIVERSITY-PAYMENT%',
  '%SECURE-ATTACHMENTS%','%TRUSTED-REFERENCE-VALIDATORS%',
  '%EXCUSED-ABSENCE%','%FILE-WITHDRAWAL%','%TRANSFER-SECURE%',
  '%FINAL-CHANCE%','%RPC-WRITE-BOUNDARIES%','%SERVICE-DETAILS%',
  '%FREE-SERVICE-WORKFLOWS%','%ACL-CUTOVER%',
  '%DEPARTMENT-CHAIRS%','%ACADEMIC-CLEARANCE%',
  '%GRADUATION-PROJECTS%','%GRADUATES-AFFAIRS%',
  '%LECTURE-EXECUTION%','%MATERIALS%','%MATERIAL%',
  '%RUNTIME-PREDECESSOR%','%TIMETABLE-ANON%',
  '%SUSPENSION-ABSENCE%','%SHARED-FOUNDATION%',
  '%ENROLLMENT-CERTIFICATE%'
])
order by version;
```

Partial name match without exact file -> `ambiguous`.

## 5. Current draft matrix (fill from Q1/Q2/Q3)

For every `docs/migration-drafts/*.sql` record: `applied` / `not_applied` / `ambiguous` / `partial`.
Authoritative classification is in `docs/b1/B1-CANONICAL-MIGRATION-GRAPH-01.json`.

### 5a B1-18

| # | file | verdict | evidence |
|---:|---|---|---|
| 1 | REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql | | |
| 2 | STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql | | |
| 3 | REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql | | |
| 4 | REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql | | |
| 5 | REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql | | |
| 6 | EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql | | |
| 7 | STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql | | |
| 8 | REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql | | |
| 9 | REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql | | |
| 10 | REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql | | |
| 11 | REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql | | |
| 12 | REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql | | |
| 13 | FINAL-CHANCE-CANONICAL-WRITE-03.sql | | |
| 14 | REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql | | |
| 15 | REQUEST-B1-SERVICE-DETAILS-05A.sql | | |
| 16 | B1-FREE-SERVICE-WORKFLOWS-08.sql | | |
| 17 | EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql | | |
| 18 | REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql | | |

### 5b expansion drafts

| file | verdict | evidence |
|---|---|---|
| DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01.sql | | |
| DEPARTMENT-TRANSFER-ACADEMIC-CLEARANCE-FOUNDATION-01.sql | | |
| GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql | | |
| GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql | | |
| GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql | | |
| GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql | | |
| B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-01.sql | | |
| TIMETABLE-ANON-READ-HARDENING-01.sql | | |
| SUSPENSION-ABSENCE-SOURCE-01.sql | | |
| FILE-WITHDRAWAL-SOURCE-01.sql | | |
| REQUEST-B1-SHARED-FOUNDATION-SOURCE-01.sql | | |
| ENROLLMENT-CERTIFICATE-COMPLETION-NOTIFICATION-CORRECTION.sql | | |
| 20260718000000_materials_atomic_authorization_mutation.sql | | |

## 6. Q3 catalog probes

### Q3a log_audit

```sql
select p.oid::regprocedure as signature
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='log_audit'
order by 1;
```

### Q3b B1 objects

```sql
select
  to_regclass('public.student_request_service_details') as service_details,
  to_regclass('public.student_request_secure_attachments') as secure_attachments,
  to_regclass('public.external_university_payment_confirmations') as ext_payment;
```

### Q3c RPCs

```sql
select p.oid::regprocedure as signature
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
  'submit_student_request_atomic','confirm_external_university_payment',
  'write_final_chance_request','cancel_official_document'
)
order by 1;
```

### Q3d DEPARTMENT-CHAIRS (semantic sensor)

Semantic definition of a department chair (D-01 contract):
- `request_processing_units.code = 'department'` and `is_active`
- `request_processing_roles.code = 'department_head'` and `is_active`
- `request_processing_assignments.assignment_type = 'faculty_profile'`
- assignment is active and currently effective (`starts_at`/`ends_at` window)
- counted per audited department

No substring matching (`%chair%`) is used: the schema has no role code containing
`chair`, so the legacy sensor falsely reported zero chairs everywhere.

Expected departments are discovered from the documented D-01 expected-chairs
contract rather than scanning all departments. The three UUIDs below are
immutable fixtures referenced by every D-01/D-02 artifact; if they drift, the
whole chair-semantic audit stops before any write.

```sql
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

with expected_chairs(dept_id, expected_employee_number) as (
  values
    ('11111111-1111-4111-8111-111111111111'::uuid, 'F2025006'),
    ('ce485c67-5f7c-498d-b120-4b1130a86ae8'::uuid, 'F2025005'),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'F2025004')
),
chair_scope as (
  -- exact unit + exact role; no ilike '%chair%'
  select u.id as unit_id, r.id as role_id
  from public.request_processing_units u
  join public.request_processing_roles r on r.unit_id = u.id
  where u.code = 'department' and u.is_active
    and r.code = 'department_head' and r.is_active
),
chair_assignments as (
  select
    a.id,
    a.department_id,
    a.faculty_profile_id,
    a.is_active
      and (a.starts_at is null or a.starts_at <= now())
      and (a.ends_at   is null or a.ends_at   >  now()) as is_current
  from public.request_processing_assignments a
  join chair_scope cs on cs.unit_id = a.unit_id and cs.role_id = a.role_id
  where a.assignment_type = 'faculty_profile'
)
select
  d.id,
  d.code,
  count(a.id) filter (where a.is_current) as active_chair_assignments,
  count(a.id) filter (where a.is_active and not a.is_current) as window_inactive_chair_assignments,
  count(a.id) filter (where not a.is_active) as historical_chair_assignments,
  string_agg(
    distinct fp.employee_number,
    ',' order by fp.employee_number
  ) filter (where a.is_current) as current_holder_employee_numbers
from expected_chairs e
join public.departments d on d.id = e.dept_id
left join chair_assignments a on a.department_id = d.id
left join public.faculty_profiles fp on fp.id = a.faculty_profile_id
group by d.id, d.code
order by d.code;

rollback;
```

Expected verdicts:
- `active_chair_assignments` = 1 for CS, IT, IS
- `current_holder_employee_numbers` = `F2025006` (CS), `F2025005` (IT), `F2025004` (IS)
- any other value ⇒ `D02_HOLD_CHAIR_SEMANTIC_DRIFT`

### Q3e student_visible

```sql
select code, student_visible, is_active
from public.request_types
where code in ('enrollment_suspension','excused_absence','file_withdrawal','department_transfer','final_chance')
order by code;
```

### Q3f storage.buckets

```sql
select id, name, public, file_size_limit
from storage.buckets
where id in ('student-request-attachments','sra','enrollment-certificates')
   or name ilike '%student%request%' or name ilike '%attachment%'
order by id;
```

### Q3g protected records

```sql
select id, request_number, status
from public.student_requests
where request_number in ('USR-2026-000001','USR-2026-000002')
order by request_number;
```

### Q3h expansion entities

```sql
select
  to_regclass('public.academic_clearance_cases') as academic_clearance_cases,
  to_regclass('public.graduation_projects') as graduation_projects,
  to_regclass('public.lecture_execution_sessions') as lecture_execution_sessions,
  to_regclass('public.course_materials') as course_materials;
```

Object present without matching Q1 row -> `partial`.

### Q3i student_accounts source-only

| check | path |
|---|---|
| Validator | `src/lib/imports/student-accounts.ts` |
| Engine | `importStudentAccounts` in `src/lib/imports/engine.server.ts` |
| Roles | `imports.functions.ts` -> admin / system_admin |
| Tests | `tests/imports/student-existing-accounts-importer.test.ts` |
| Report | `docs/STUDENT-EXISTING-ACCOUNTS-IMPORTER-01-REPORT.md` |

**ممنوع during D-02:** live import, Auth user creation, production student linking, file-566. بدون إنشاء حسابات. no account creation.

Record: `STUDENT_ACCOUNTS_SOURCE_PRESENT` or `STUDENT_ACCOUNTS_SOURCE_MISSING`.

### Q3j TEST_ONLY migration path check

Run locally against the source tree (no production access required). The release
graph is unsafe while any `supabase/migrations/*.sql` file contains a
`TEST_ONLY` marker that is not classified `HISTORICAL_APPLIED` or
`EXCLUDE_FROM_NEW_RELEASE_PATH`.

```bash
# List all TEST_ONLY-bearing migrations still in the production path
grep -RilE 'TEST_ONLY|test_only|TESTONLY|testonly' supabase/migrations/ || true
```

Expected: empty list, OR entries already present in
`docs/migration-drafts/B1-TESTONLY-EXCLUSION-MANIFEST-01.json` with an
`EXCLUDE_FROM_NEW_RELEASE_PATH` / `HISTORICAL_APPLIED` decision.

Known archived duplicates (historical evidence, excluded from new release path):
- `docs/migration-drafts/test-only-archive/20260804004546_17b78d6d-3a17-41d9-ba7b-d0c19c6459cc.sql`
- `docs/migration-drafts/test-only-archive/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql`

## 7. SERVICE_VISIBILITY probe

For each of the five B1 services, confirm the source expectation matches
catalog state. Do **not** mutate `student_visible`.

```sql
select code, student_visible, is_active
from public.request_types
where code in (
  'enrollment_suspension',
  'excused_absence',
  'department_transfer',
  'final_chance',
  'file_withdrawal'
)
order by code;
```

Expected (source contract): all five rows have `is_active = true`;
`student_visible` is intentionally controlled by the UI/feature flags layer
and must not be changed by this package.

## 8. FUNCTION_GRAPH probe

Confirm the current B1 RPC surface. This is read-only evidence only; source
provenance is in `docs/b1/B1-CANONICAL-MIGRATION-GRAPH-01.json` and
`docs/b1/B1-FUNCTION-PROVENANCE-NOTES-01.md`.

```sql
select p.oid::regprocedure as signature,
       obj_description(p.oid, 'pg_proc') as description
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'submit_student_request_atomic',
    'act_on_b1_student_request_step_atomic',
    'apply_b1_academic_effect_for_request',
    'apply_b1_enrollment_suspension_effect',
    'apply_b1_excused_absence_effect',
    'apply_b1_department_transfer_effect',
    'apply_b1_final_chance_effect',
    'apply_b1_file_withdrawal_effect',
    'confirm_external_university_payment',
    'record_external_university_payment_confirmation',
    'assert_b1_runtime_step_assignee_effective',
    'assert_b1_runtime_step_row_assignee_effective'
  )
order by 1;
```

## 9. FIXTURE_STATE probe

```sql
select request_number, request_type, status, form_data->>'authoritative_fixture' as authoritative_fixture
from public.student_requests
where request_number like 'SR-20260801-13%'
   or form_data->>'authoritative_fixture' = 'true'
order by request_number;
```

Expected: fixture requests present only if the fixture package was applied;
no backfill, no rewrite, no delete.

## 10. ASSIGNMENT_STATE probe

```sql
select
  d.code as department_code,
  u.code as unit_code,
  r.code as role_code,
  count(a.id) filter (where a.is_active
    and (a.starts_at is null or a.starts_at <= now())
    and (a.ends_at is null or a.ends_at > now())) as active_now,
  count(a.id) filter (where not a.is_active) as inactive
from public.request_processing_assignments a
join public.departments d on d.id = a.department_id
join public.request_processing_units u on u.id = a.unit_id
join public.request_processing_roles r on r.id = a.role_id
where u.code in ('student_affairs','registrar','dean','department','library','labs','archive')
group by d.code, u.code, r.code
order by d.code, u.code, r.code;
```

Expected: no duplicate active `department_head` per department; no expired
assignment counted as active.

## 11. Q4 provenance

`DEPLOYED_SHA` is proven ONLY by an independent read-back from the deployed
environment (e.g., deployment log, published artifact, or authorized endpoint
probing) that returns a 40-character lowercase commit SHA. The current source
branch tip SHA is recorded for traceability but is **never** treated as deployed
proof. Any document that still pins `0e2d25c9…`, `427b7eb4…`, or `8f229d09…`
as the deployed baseline is stale and must not be used as a release gate.

| evidence | verdict |
|---|---|
| independent deploy read-back SHA matches expected published SHA | `DEPLOYED_SHA_PROVEN` |
| no deploy read-back or SHA mismatch | `HOLD_RELEASE_SHA_UNPROVEN` |
| any document treats source SHA as deployed proof | `HOLD_STALE_SHA_REFERENCE` |

## 12. Stop conditions

- `SCHEMA_MIGRATIONS_UNREADABLE`
- `log_audit` signatures != 2 -> `D02_HOLD_LOG_AUDIT_SIGNATURE_MISMATCH`
- any `ambiguous` or `partial`
- `D02_HOLD_PROTECTED_RECORD_DRIFT`
- `D02_HOLD_CHAIR_SEMANTIC_DRIFT`
- `TEST_ONLY_IN_PRODUCTION_PATH` != 0 -> `D02_HOLD_TEST_ONLY_MIGRATION_IN_RELEASE_GRAPH`
- stale SHA reference (`0e2d25c9…` / `427b7eb4…` / `8f229d09…` treated as deployed proof)
- write/activate/إنشاء حسابات -> ممنوع; SELECT only

## 13. Final verdicts

- `D02_COMPLETE_CLEAN`
- `D02_HOLD_<reason>`
- `D02_NOT_EXECUTED` — package ready, not run in this refresh program

## 14. Execution log

- date/operator/channel: ____
- `SOURCE_SHA`: `9833269998a68f4ff1b86a57faf897f9b825f654` (current branch tip, not deployed proof)
- `DEPLOYED_SHA`: ____ (from independent deploy read-back only)
- Q1..Q3j outputs: ____
- `SERVICE_VISIBILITY`: ____
- `FUNCTION_GRAPH`: ____
- `FIXTURE_STATE`: ____
- `ASSIGNMENT_STATE`: ____
- `student_accounts` source check: ____
- `TEST_ONLY_IN_PRODUCTION_PATH`: ____
- chair semantic sensor result: ____
- final: ____
