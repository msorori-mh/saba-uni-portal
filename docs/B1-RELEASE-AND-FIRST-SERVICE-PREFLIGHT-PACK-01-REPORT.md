# B1-RELEASE-AND-FIRST-SERVICE-PREFLIGHT-PACK-01

Updated: 2026-07-19 (Asia/Riyadh)
Mode: SOURCE-ONLY / READ-ONLY PREFLIGHT

## Decision

```text
PASS_SOURCE_PREFLIGHT_PACK_COMPLETE
HOLD_RELEASE_NOT_DEPLOYED
HOLD_MIGRATIONS_NOT_AUTHORIZED
HOLD_ENROLLMENT_SUSPENSION_NOT_ACTIVATED
CRITICAL=0 HIGH=0
```

This pack documents release and first-service preflight only. No deploy,
publish, Supabase link, production query/write, migration dry-run/apply,
workflow activation, `student_visible` change, account/assignment creation, or
production record access occurred. The six deferred services were not touched.

## Release candidate manifest

| Field                         | Pinned value / gate                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| Source base                   | `origin/main@b50979a8d8ccf07d0c8339f31e589441e44bd8bf`                                                    |
| Expected deploy candidate SHA | `b50979a8d8ccf07d0c8339f31e589441e44bd8bf`                                                                |
| Actual deployed SHA           | `DEPLOYED_SHA=UNKNOWN`                                                                                    |
| Deployment evidence           | **MISSING — this SHA is an expected source candidate, not a claimed deployed SHA**                        |
| Release stamp                 | `REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql`; placeholder remains fail-closed                 |
| Services at release boundary  | all five B1 services remain `runtimeAvailable:false`, workflows inactive, and `student_visible` unchanged |

The deploy candidate must contain the reviewed B1 runtime boundary already in
this source tip: form/adapter registry, atomic submit/action caller, service
detail dispatcher contract, staff inbox/action path, secure attachment caller,
authorization helpers, and five-service tests. The release artifact must be
built from the exact candidate SHA with a clean lockfile and CI PASS. If the
actually deployed immutable artifact has any other commit SHA, that actual SHA
must be independently reviewed and used in the future release-evidence stamp;
the expected candidate above must never be copied as evidence by assumption.

### Pre-migration release smoke (safe environment only)

1. Verify artifact metadata reports the exact reviewed commit and no dirty tree.
2. With all five services unavailable/inactive, confirm student create routes
   fail closed and perform no legacy detail-table write.
3. Confirm staff action routes reject anonymous, unassigned, wrong unit/role,
   admin, registrar and dean bypass without workflow/event/detail mutation.
4. Confirm existing non-B1 requests and `enrollment_certificate` reads/actions
   behave exactly as the approved baseline.
5. Confirm no B1 workflow activation, visibility, payment record, public storage
   URL or notification backfill is introduced by the release.
6. Confirm the source calls the explicit seven-argument `log_audit` overload and
   no six/seven-argument ambiguity remains in any coordinated RPC.

### Release rollback plan

Before any migration, rollback is an immutable artifact redeploy to the last
known-good reviewed release. Do not rewrite Git or database state. Keep all five
B1 services unavailable/inactive during rollback and re-run the baseline smoke.
After any future migration begins, application rollback is **not** a database
rollback: stop the chain on failure/partial apply, preserve evidence, keep flags
off, and use only a separately reviewed forward remediation. Never reset,
repair, delete, clean up, or continue the sequence.

## Why first-service preflight uses the coordinated B1 order

`enrollment_suspension` is the first service promoted, but its atomic dispatcher,
workflow actor contract and final ACL cutover are five-service coordinated
boundaries. There is no approved safe extraction that applies only part of the
dispatcher/cutover. Therefore orders 1–20 below must pass sequentially while
**all five services stay fail-closed**. Only afterward may the separately gated
`enrollment_suspension` workflow/RPC/E2E/visibility sequence begin. This does not
activate or implement any of the other four services.

## Exact coordinated migration order and LF/git-blob SHA-256

|   # | Draft                                                        | SHA-256                                                            | Enrollment-suspension gate                                           |
| --: | ------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
|   1 | `REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql`     | `893a2979bad443b059bf3c0ce2f2b6ad2714dbd9333dd5b332c8c4acc64cf357` | Replace placeholder only with independently proven actual deploy SHA |
|   2 | `REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql`            | `3b8e2cfd90ea4301ba65b86b628d9e39dfe24c355d84f94eca27b3415cd32dab` | Explicit typed audit-call contract before dependent RPCs             |
|   3 | `STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql` | `0627b142b10307e72ba0c9ffd09dc4db5c02059791273f101b71463704e4f6c0` | Exact actor tuples; no bypass                                        |
|   4 | `B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02.sql`            | `54c1544296374f83bfda9637cfdbd3d3f5f9a9420cb9395daf30034aa4876216` | M3-02: B1-scoped predecessor/action guard; `-01` is NEVER-PROMOTE    |
|   5 | `REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql`         | `e5b5ee1cba7a39864ff07b3d95daed31b1f1a513613566b052ca3f62661a8edf` | Fresh read-only verification of every embedded identity/department   |
|   6 | `REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql`                     | `473528c5c49c14a486e5ca34afca1cda7a678dc86373555580fadc04e03080fd` | Atomic chair runtime pins position assignments                       |
|   7 | `EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql`            | `aae12fefe62eebeed98d808aa1f3fa91eedcd94fb18f74e47bd063a0174f8993` | Coupled vocabulary only; suspension remains FREE_NO_PAYMENT          |
|   8 | `STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql`           | `6034c0de0a7a347f576ef8839b730d5c1f1d281ebe74a7ac312266ac92ee2356` | Private bucket/policy approval still required; no public URLs        |
|   9 | `REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql`            | `529366401a8a57124211e1efb21c88ee9acf4ea0395c0daff93573e82b44897c` | Exact year/semester references                                       |
|  10 | `REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql`              | `e2d1cbe1ff09749583f66bf7e32a3f7570bf190ea77dffe113910bb397ba4205` | Coupled compile order; no activation/backfill                        |
|  11 | `REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql`                  | `1bdbc6f747dda43c4a2d8d91648ac99d2c5984f7fb00213412754096f754cdbe` | Coupled five-service dispatcher/cutover prerequisite                 |
|  12 | `REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql`                 | `1a2bba070d81b072faf61fe87b62fb8fe114b3fe3611ecb45ba18173cebf9ee9` | Coupled five-service dispatcher/cutover prerequisite                 |
|  13 | `REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql`              | `d80f691c0fd2dd2e403d241f45bc96608f1d3dec74dd6286762732e4632aa284` | Coupled five-service dispatcher/cutover prerequisite                 |
|  14 | `FINAL-CHANCE-CANONICAL-WRITE-03.sql`                        | `9a01392415fcd97e21adc4e8c2af9490afe759b35452bf43b70bc74013c9f704` | Coupled prerequisite; no historical scan/backfill                    |
|  15 | `REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql`             | `85fdd4f4e34bba7859e61e52009c385cd74747f14bcaa74bc6d3f6db41892495` | Install primitive; do not invoke cutover yet                         |
|  16 | `REQUEST-B1-SERVICE-DETAILS-05A.sql`                         | `d8eec185033818b6612d6ada94e6be95264ed34ac4647fe1f712bb385674600c` | Exact dispatcher including suspension details                        |
|  17 | `B1-FREE-SERVICE-WORKFLOWS-08.sql`                           | `1e8b6437ce71aab4c60ad122dd1a405841d1dcca1fda09ab45df1ca4907db44c` | Three inactive suspension steps; no payment step                     |
|  18 | `EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql`               | `64e3436cda5e485fdea5144bb0668eec62b5098c62e444342d18411ea7cd8250` | Other paid workflows stay inactive                                   |
|  19 | `REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql`                       | `55f008fa7f516af5da33ea75bb9cfc9cf3b78f6240345c3466fbdbc42cd38383` | Requires release stamp; verifies all five boundaries atomically      |
|  20 | `B1-FIVE-SERVICES-ACTOR-ACTION-ASSIGNMENT-HARDENING-01.sql`  | `5cd98b77f8f6cce1229f91e86fdf8d4b029b0bb8fa1c6826c9cd10370101b462` | Final hardening (R-1): B1-scoped exact binding; last entry           |

Hashes are authoritative only for LF-normalized Git blob bytes at the pinned
source. Before each future promotion, recompute from the reviewed commit and
reject any mismatch. Documentary/superseded drafts remain forbidden.

**Re-pin addendum (owner decision, 2026-07-23):** the coordinated pack is now
**20** drafts: M3-02 is row 4, ACL cutover is row 19, and final actor-action
hardening is row 20. Payment/attachments rows were re-pinned after R-3/R-2
(`aae12fefe62eebeed98d808aa1f3fa91eedcd94fb18f74e47bd063a0174f8993` /
`6034c0de0a7a347f576ef8839b730d5c1f1d281ebe74a7ac312266ac92ee2356`). The
sequential-apply manifest apply-set remains the first 19 runtime drafts;
final hardening is the last coordinated entry (harness/order 20).

## Read-only before queries (future approved target only)

These query intents must be implemented/captured by an approved operator in a
safe preflight session; they were **not executed here**:

```sql
-- migration history: prove none of the 20 promoted versions exists
select version, name from supabase_migrations.schema_migrations order by version;

-- capture both audit overload signatures before order 2; calls must bind 7 args
select p.oid::regprocedure::text from pg_proc p
where p.pronamespace='public'::regnamespace and p.proname='log_audit'
order by 1;

-- five services remain unavailable and hidden
select code, is_active, student_visible
from public.request_types
where code in ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
order by code;

-- no active workflow version for any B1 service
select rt.code, count(*) filter (where w.is_active) as active_workflows
from public.request_types rt
left join public.request_type_workflows w on w.request_type_id = rt.id
where rt.code in ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
group by rt.code order by rt.code;

-- snapshot exact existing requests/details without mutation
select request_type, status, count(*) from public.student_requests
where request_type in ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
group by request_type, status order by request_type, status;

-- verify processing identities are active/user-linked and assignments unique
select a.id, a.user_id, a.staff_profile_id, a.faculty_profile_id,
       a.is_active, u.code as processing_unit_code,
       r.code as processing_role_code
from public.request_processing_assignments a
join public.request_processing_units u on u.id = a.unit_id
join public.request_processing_roles r on r.id = a.role_id
where u.code in ('student_affairs','registrar','dean','finance')
order by u.code, r.code, a.id;
```

The operator must additionally capture function definitions/owners/search paths,
grants/revokes, RLS policies, storage bucket/policies, audit/event counts and the
absence of protected IDs from every proposed mutation set. Read-only query
failure is a HOLD; it never justifies inferred identity mappings.

## Read-only after queries (after each separately approved single apply)

```sql
-- exactly one newly approved migration history row; compare to before snapshot
select version, name from supabase_migrations.schema_migrations order by version;

-- order 2 must leave an unambiguous explicit seven-argument callable signature
select to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)') is not null
  as seven_argument_log_audit_present;

-- visibility and activation must remain byte-for-byte equivalent to before
select code, is_active, student_visible
from public.request_types
where code in ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
order by code;

-- workflows remain inactive through all migration orders
select rt.code, w.version, w.is_active, count(s.id) as step_count
from public.request_types rt
left join public.request_type_workflows w on w.request_type_id = rt.id
left join public.request_type_workflow_steps s on s.workflow_id = w.id
where rt.code in ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
group by rt.code, w.version, w.is_active order by rt.code, w.version;

-- protected records remain present and unchanged (approved identifiers only)
select id, request_number, status, updated_at from public.student_requests
where id = '93807768-a281-42de-bfb4-0c0c03786b20'
   or request_number in ('SR-20260713-2DE64041','SR-20260715-FEDCB3E1');

-- no historical notification backfill for the preserved user/request
select n.user_id, n.notification_type, n.reference_type, n.reference_id,
       n.created_at
from public.notifications n
left join public.student_profiles sp on sp.user_id = n.user_id
where sp.academic_number = 'USR-2026-000001'
   or n.reference_id = '93807768-a281-42de-bfb4-0c0c03786b20'
order by n.created_at;
```

Also compare before/after object signatures, ACL/RLS, counts and audit evidence.
Any unexpected delta or partial state stops the entire migration chain while
preserving evidence; do not run rollback SQL.

## Five-service fail-closed proof required before migrations

PASS requires all of the following read-only evidence together:

- candidate runtime reports `runtimeAvailable:false` for all five adapters;
- all five `student_visible` values are unchanged/false and no active workflow
  exists;
- student create/submit cannot fall back to legacy client DML;
- no B1 workflow can start or advance through an unassigned actor;
- release smoke proves no B1 detail/event/notification/storage mutation;
- the release-evidence stamp still fails on its placeholder until an actual
  deployed SHA is independently captured.

Current result: **HOLD_RUNTIME_RELEASE_EVIDENCE_MISSING**. Source tests are not
production evidence and do not satisfy this gate.

## Future apply command envelope — DOCUMENTED, NEVER EXECUTED

For each independently promoted timestamped migration, and only after a new
explicit approval names its path and SHA, the operator would use:

```powershell
$expectedSha = '<SEPARATELY_APPROVED_LF_GIT_BLOB_SHA256>'
$migrationPath = '<SEPARATELY_APPROVED_SINGLE_SUPABASE_MIGRATION_PATH>'
$actualSha = git cat-file blob ("HEAD:" + ($migrationPath -replace '\\','/')) |
  python -c "import sys,hashlib; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())"
if ($actualSha -ne $expectedSha) { throw 'MIGRATION_SHA_MISMATCH' }
supabase migration list --linked
supabase db push --linked --dry-run
if ($LASTEXITCODE -ne 0) { throw 'MIGRATION_DRY_RUN_FAILED' }
$actualSha = git cat-file blob ("HEAD:" + ($migrationPath -replace '\\','/')) |
  python -c "import sys,hashlib; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())"
if ($actualSha -ne $expectedSha) { throw 'MIGRATION_SHA_CHANGED_AFTER_DRY_RUN' }
supabase db push --linked
supabase migration list --linked
```

This command was not run. Fail closed unless the dry-run proposes exactly the
one approved migration. Never use `--include-all`, repair, raw history writes,
reset, cleanup, or `psql -f` as a substitute.

## Enrollment-suspension promotion after all migrations PASS

Separate gates, each still HOLD: activate only its three-step free workflow;
run the full direct-assignee RPC ALLOW/DENY matrix in a safe synthetic
environment; perform create/resubmit/action/E2E and academic-status outcome
checks; obtain separate `student_visible` approval; obtain separate deploy/
publish approval; run service smoke. The other four B1 services remain inactive
and hidden throughout. `enrollment_suspension` creates no payment confirmation,
amount, currency, invoice, gateway transaction, balance or `fee_type.code`.

## Final verdict

The source-only manifest, checksums, query pack, smoke plan, rollback plan and
future command envelope are complete: **PASS_SOURCE_PREFLIGHT_PACK_COMPLETE**.
Release, migration apply, workflow activation, visibility and production remain
HOLD. Production impact: zero.
