# B1 STAGE 3 — TEST_ONLY FORWARD-ONLY CLEANUP — PRODUCTION APPLY REPORT

**Mission:** `PORTAL-B1-STAGE3-TESTONLY-FORWARD-ONLY-CLEANUP-PRODUCTION-APPLY-136`
**Authorization:** EXPLICIT PRODUCTION MIGRATION APPLY APPROVAL (owner, this mission)
**Mode:** single reviewed forward-only migration apply + read-only verification. No deploy, no publish, no RPC.

---

## 1. Authorization reference

- Reviewed source: `docs/migration-drafts/B1-STAGE3-TESTONLY-LIMITED-CLEANUP-FORWARD-ONLY-128.NOT_APPLIED.sql`
- Supporting: notes 128, preflight 133, remediation 134, reconciliation 135, export 132.
- Authoritative delete total: **444** rows across **15** statements, **37** candidate requests.

## 2. G0 — Source and repository gate

| Item | Value |
| --- | --- |
| Branch | `edit/edt-6afbd04e-1a5e-43cc-ae71-8679cc77ae54` |
| HEAD before apply | `ac1f2331c7337b584e5fec27ddf9e03aa6653b91` |
| Working tree | clean |
| Draft SHA256 | `b851e40ab0f52147ea53339621a6baacb0cb3c92649a1255bf029e0c8b89cb6b` |
| DELETE statements | 15 |
| Per-DELETE ROW_COUNT assertions | 15 (`GET DIAGNOSTICS` immediately after each DELETE) |
| Expected total | 444 |
| BEGIN / COMMIT in draft | 1 / 1 |
| Exception swallowing | none (`RAISE EXCEPTION` only; no `EXCEPTION WHEN` handler) |
| `storage.` references | none |
| `auth.` references | none |
| `request_types` UPDATE | none (read-only SELECT invariants only) |
| `student_visible` modification | none |
| Dynamic SQL / CASCADE | none |

Result: **G0 PASS**.

## 3. G1 — Tracked migration source

| Item | Value |
| --- | --- |
| Migration file | `supabase/migrations/20260731203030_8e3ed620-f5d3-4f20-a326-e4f6366f44fd.sql` |
| Version | `20260731203030` (unique, later than `20260730175527`) |
| SHA256 | `2de945188a9b744c3e6b607337c44d824d81c8f1ff1eef1e98c025a2c082910a` |
| DELETE statements | 15 |
| Per-DELETE assertions | 15 |
| Previously applied migrations modified | none |
| Additional migrations created | none |

### Draft → migration diff (comment- and whitespace-normalised)

Nine normalised lines differ, all transaction-framing / channel-adaptation. **No delete
predicate, no ID, no expected count, no precondition on data, and no postcondition on data
was changed.**

1. `BEGIN;` / `COMMIT;` removed — mandated by the draft's own promotion note
   (lines 34–38): the migration runner supplies the enclosing transaction, so the
   explicit pair is redundant inside `supabase/migrations/`.
2. The `PRECHECK_MIGRATION_HEAD_MOVED` block (and its `v_head_version` declaration)
   removed — it asserts `max(schema_migrations.version) = 20260730175527`, which is
   unsatisfiable/unreliable from inside the migration channel itself, since the runner
   owns that bookkeeping row for the very migration being executed. The same invariant
   was instead verified **externally, read-only, immediately before and immediately
   after apply** (§4 and §9). This is disclosed rather than silently absorbed.

All 15 DELETE statements, all 15 ROW_COUNT assertions, both ID temp tables (37 candidates,
11 hold numbers), every data precondition and every data postcondition are byte-identical
in substance to the reviewed draft.

## 4. G2 — Immediate pre-apply revalidation (read-only)

Production timestamp before apply: **2026-07-31 20:26:22+00**
Migration head before apply: **20260730175527** (verified; exactly one migration later after apply)

| Predicate | Expected | Actual | OK |
| --- | ---: | ---: | :-: |
| candidate `student_requests` | 37 | 37 | ✅ |
| candidates owned by `TEST_ONLY_B1_%` profiles | 37 | 37 | ✅ |
| candidates in non-terminal status (`NOT IN draft/completed/cancelled`) | 0 | 0 | ✅ |
| candidate status split | — | completed 20 / cancelled 11 / draft 6 | ✅ |
| updated since 2026-07-31 04:00Z (drift guard) | 0 | 0 | ✅ |
| attachment upload rows | 20 | 20 | ✅ |
| workflow steps | 135 | 135 | ✅ |
| workflow events | 157 | 157 | ✅ |
| idempotency rows (3 fixture profiles) | 53 | 53 | ✅ |
| `student_excused_absences` effect | 1 | 1 | ✅ |
| `student_extra_chances` effect | 1 | 1 | ✅ |
| `file_withdrawal_details` | 10 | 10 | ✅ |
| `absence_excuse_details` | 6 | 6 | ✅ |
| `enrollment_suspension_details` | 6 | 6 | ✅ |
| `extra_chance_details` | 9 | 9 | ✅ |
| `transfer_request_details` | 6 | 6 | ✅ |
| fixture profile / academic status / enrollment | 1 / 1 / 1 | 1 / 1 / 1 | ✅ |
| **total persistent rows in scope** | **444** | **444** | ✅ |
| candidate IDs missing in production | 0 | 0 | ✅ |
| extra IDs beyond Export 132 | 0 | 0 | ✅ |
| HOLD / evidence / legacy intersection with candidates | 0 | 0 | ✅ |
| `enrollment_certificate` intersection with candidates | 0 | 0 | ✅ |
| `official_documents` referencing fixture/candidates | 0 | 0 | ✅ |

### Export 132 integrity

All 15 CSV files re-hashed: **15/15 SHA256 match `MANIFEST.md`**.
Physical rows (RFC-4180 parse, headers excluded): **444**, matching the per-table matrix
above exactly (37/20/135/157/53/1/1/10/6/6/9/6/1/1/1).

Result: **G2 PASS — zero drift.**

## 5. G3 — Protected baseline before apply

| Item | Expected | Actual |
| --- | --- | --- |
| `enrollment_certificate.student_visible` | true | true |
| EC requests | 4 | 4 |
| `enrollment_certificate_document_details` | 2 | 2 |
| `official_documents` | 2 | 2 |
| `max(official_documents.updated_at)` | 2026-07-16 04:44:29.338193+00 | identical |
| `enrollment_suspension` / `excused_absence` / `department_transfer` / `final_chance` / `file_withdrawal` visibility | false ×5 | false ×5 |
| migration head | 20260730175527 | 20260730175527 |
| storage objects (whole bucket set) | 29 | 29 |
| evidence + HOLD + legacy request numbers present | 11 | 11 |
| `SR-20260727-3C550070` / `SR-20260727-F67CF366` status | in_review / submitted | in_review / submitted |
| auth fixture `2e3ca4d6-…fcfd3` | exists, out of scope | exists, out of scope |

Result: **G3 PASS.**

## 6. G4 — Apply

Exactly one migration applied through the managed migration channel. The transaction ran
`set_config('b1.atomic_init','1', true)` (transaction-local), the precondition block, the
15 ordered DELETEs with their 15 assertions, and the postcondition block. No statement was
issued manually before, between, or after the DELETEs. No timeout was altered, no error
suppressed, no retry performed.

Apply output: success — `set_config = 1`; all `RAISE NOTICE` checkpoints reached
(`ALL PRECONDITIONS PASSED`, `ALL 15 PER-DELETE ASSERTIONS PASSED (444 rows)`,
`ALL POSTCONDITIONS PASSED`). Committed.

## 7. G5 — Deleted rows (each assertion enforced its exact count in-transaction)

| # | Table | Deleted |
| --: | --- | ---: |
| D01 | `student_request_attachment_uploads` | 20 |
| D02 | `student_excused_absences` | 1 |
| D03 | `student_extra_chances` | 1 |
| D04 | `file_withdrawal_details` | 10 |
| D05 | `absence_excuse_details` | 6 |
| D06 | `enrollment_suspension_details` | 6 |
| D07 | `extra_chance_details` | 9 |
| D08 | `transfer_request_details` | 6 |
| D09 | `student_request_workflow_events` | 157 |
| D10 | `student_request_workflow_steps` | 135 |
| D11 | `b1_draft_mutation_idempotency` | 53 |
| D12 | `student_requests` | 37 |
| D13 | `student_academic_status` (fixture) | 1 |
| D14 | `student_enrollments` (fixture) | 1 |
| D15 | `student_profiles` (fixture) | 1 |
| | **TOTAL** | **444** |

Any deviation on any line would have raised `*_DELETE_COUNT_MISMATCH` and rolled the whole
transaction back; the commit itself is proof each count was exact.

### Post-apply remaining counts (read-only, 2026-07-31 20:31:10+00)

| Table | Expected | Actual | OK |
| --- | ---: | ---: | :-: |
| `student_requests` | 33 | 33 | ✅ |
| `student_request_workflow_steps` | 56 | 56 | ✅ |
| `student_request_workflow_events` | 83 | 83 | ✅ |
| `b1_draft_mutation_idempotency` | 0 | 0 | ✅ |
| `student_request_attachment_uploads` | 8 | 8 | ✅ |
| `student_profiles` | 848 | 848 | ✅ |
| `student_academic_status` | 850 | 850 | ✅ |
| remaining `TEST_ONLY_B1_%` profiles | 2 | 2 | ✅ |
| deleted candidate requests | 37 | 37 | ✅ |
| exported target IDs still present | 0 | 0 | ✅ |
| unexpected deletions | 0 | 0 | ✅ |

Fixture profile / academic status / enrollment: 0 / 0 / 0 (removed as planned).

## 8. G6 — Protected baseline after apply

| Item | Value | OK |
| --- | --- | :-: |
| `enrollment_certificate.student_visible` | true | ✅ |
| EC requests | 4 | ✅ |
| `enrollment_certificate_document_details` | 2 | ✅ |
| `official_documents` | 2 | ✅ |
| `max(official_documents.updated_at)` | 2026-07-16 04:44:29.338193+00 | ✅ |
| five B1 services `student_visible` | false ×5 | ✅ |
| storage objects | 29 (unchanged, 0 bytes deleted) | ✅ |
| storage buckets / policies | untouched (no `storage.` statement in migration) | ✅ |
| auth fixture `2e3ca4d6-603c-4f06-a23e-462bf92fcfd3` | still exists; `auth.users` total 911 | ✅ |
| evidence + HOLD + legacy requests | 11 | ✅ |
| `SR-20260727-3C550070` / `SR-20260727-F67CF366` | in_review / submitted | ✅ |
| protected profiles `…0002`, `…eac2` + their 4 academic-status rows | intact | ✅ |
| evidence effect rows (2 excused, 1 extra chance) | intact | ✅ |
| workflow RPCs called | 0 | ✅ |
| deploy / publish | none | ✅ |

## 9. G7 — Migration history

| Item | Value |
| --- | --- |
| Head before | `20260730175527` |
| Head after | `20260731203030` |
| Migrations with version > previous head | 1 |
| New version occurrences in history | exactly 1 |
| Other pending migrations applied | none |
| History rows edited manually | none |
| Previously applied migrations changed | none |

## 10. G8 — Source control

- Committed: the tracked migration `supabase/migrations/20260731203030_8e3ed620-f5d3-4f20-a326-e4f6366f44fd.sql` and this report.
- `docs/exports/B1-STAGE3-CLEANUP-LOGICAL-EXPORT-132/` unchanged (all 15 SHA256 re-verified).
- No secrets, dumps, temporary files, or credentials committed.
- `git diff --check`: clean.
- No deploy, no publish.

## 11. Success flags

`EXPLICIT_PRODUCTION_APPLY_AUTHORIZATION` · `SINGLE_MIGRATION_APPLIED` ·
`DELETE_STATEMENTS_15` · `PER_DELETE_ASSERTIONS_15` · `EXPECTED_DELETED_ROWS_444` ·
`ACTUAL_DELETED_ROWS_444` · `MISSING_EXPORTED_TARGETS_0` · `UNEXPECTED_DELETIONS_0` ·
`ENROLLMENT_CERTIFICATE_BASELINE_UNCHANGED` · `FIVE_B1_SERVICES_REMAIN_HIDDEN` ·
`STORAGE_BYTES_UNCHANGED` · `AUTH_ACCOUNT_UNCHANGED` · `ZERO_RPC_CALLS` ·
`NO_OTHER_MIGRATION` · `NO_DEPLOY` · `NO_PUBLISH`

## 12. Final decision

**PASS_B1_STAGE3_TESTONLY_FORWARD_ONLY_CLEANUP_PRODUCTION_APPLIED_AND_VERIFIED**

Disclosure: the two transaction-framing adaptations in §3 (removal of the redundant
`BEGIN`/`COMMIT`, and removal of the self-referential migration-head precheck, whose
invariant was verified externally instead) are the only differences from the reviewed
draft. No data predicate, ID, or expected count was altered.
