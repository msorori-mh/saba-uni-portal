# B1-D02-READONLY-PRODUCTION-PREFLIGHT-PACKAGE-01

| field | value |
|---|---|
| status | `READY_FOR_AUTHORIZED_EXECUTION` — read-only package (not executed in this stage) |
| program | `PORTAL-FRESH-RELEASE-BASELINE-AND-D02-REFRESH-01` |
| updated | 2026-07-21 |
| `SOURCE_SHA` / `expected_release_sha` | `0e2d25c9a2d7923ce74cfae079b99691d61eb1b6` |
| `DEPLOYED_SHA` | `UNKNOWN` — no deploy claim |
| Supabase project | `wpmicqriltrowwonknox` |
| B1 legal ref | `docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md` |
| release candidate | `docs/PORTAL-FRESH-RELEASE-CANDIDATE-01.md` |
| cancelled prior baselines | `8f229d09…`, `427b7eb4…` |

## 0. Why refresh

Prior package pinned `origin/main@8f229d09` (B1-18 only). After #194/#195, `main` is `0e2d25c9…`. This refresh pins current `SOURCE_SHA`, expands `docs/migration-drafts/*.sql` matching, adds RO probes, and checks `student_accounts` as source-only — ممنوع إنشاء حسابات.

## 0b. State dimensions

| dimension | value |
|---|---|
| `SOURCE_SHA` | `0e2d25c9a2d7923ce74cfae079b99691d61eb1b6` |
| `DEPLOYED_SHA` | `UNKNOWN` |
| `PRODUCTION_DB_STATE` | fill after SELECT on production |
| `MIGRATION_READINESS` | from Q1-Q3; no apply |
| `USER_APPROVAL_REQUIRED` | yes for production execution |

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

### Q3d DEPARTMENT-CHAIRS

```sql
select d.id, d.code, count(a.id) filter (where a.is_active) as active_chair_assignments
from public.departments d
left join public.request_processing_assignments a on a.department_id=d.id and a.is_active=true
left join public.request_processing_roles r on r.id=a.role_id and r.code ilike '%chair%'
where d.id in (
  '11111111-1111-4111-8111-111111111111',
  'ce485c67-5f7c-498d-b120-4b1130a86ae8',
  '22222222-2222-4222-8222-222222222222'
)
group by d.id, d.code order by d.code;
```

### Q3e student_visible

```sql
select code, student_visible, is_active
from public.student_request_types
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

## 7. Q4 provenance

Record `DEPLOYED_SHA_PROVEN` only if evidence matches `0e2d25c9a2d7923ce74cfae079b99691d61eb1b6` (or later approved published SHA). Else `HOLD_RELEASE_SHA_UNPROVEN`. Do not treat `427b7eb4…` as current baseline proof.

## 8. Stop conditions

- `SCHEMA_MIGRATIONS_UNREADABLE`
- `log_audit` signatures != 2 -> `D02_HOLD_LOG_AUDIT_SIGNATURE_MISMATCH`
- any `ambiguous` or `partial`
- `D02_HOLD_PROTECTED_RECORD_DRIFT`
- write/activate/إنشاء حسابات -> ممنوع; SELECT only

## 9. Final verdicts

- `D02_COMPLETE_CLEAN`
- `D02_HOLD_<reason>`
- `D02_NOT_EXECUTED` — package ready, not run in this refresh program

## 10. Execution log

- date/operator/channel: ____
- `SOURCE_SHA`: ____
- `DEPLOYED_SHA`: ____
- Q1..Q4 outputs: ____
- `student_accounts` source check: ____
- final: ____
