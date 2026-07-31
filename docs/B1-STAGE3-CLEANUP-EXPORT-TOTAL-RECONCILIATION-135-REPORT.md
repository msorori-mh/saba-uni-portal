# B1 Stage 3 — Export total reconciliation (433 → 444)

Mission: `PORTAL-B1-STAGE3-CLEANUP-EXPORT-TOTAL-RECONCILIATION-135`
Mode: **SOURCE/DOCUMENTATION CORRECTION + PRODUCTION READ-ONLY VERIFICATION ONLY**
Verification window: `2026-07-31 20:15:52+00` → `2026-07-31 20:18:36+00` (server `now()`).

## 0. Result in one line

`433` was **only** an arithmetic/reporting error in two summary lines. No CSV byte, no SHA256,
no per-table count, and no production row is affected. The authoritative total across
Export 132, Reports 133/134 and Migration 128 is now **444** everywhere.

## 1. G1 — physical CSV recount vs manifest vs production vs DELETE assertions

Physical rows were counted with an RFC-4180 CSV parser (not `wc -l`), header excluded, so
embedded newlines inside text columns are handled correctly.

| # | File | Table / entity | Physical CSV rows | Manifest count | Production read-only | Migration 128 DELETE assertion | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | `01_student_requests.csv` | `student_requests` | 37 | 37 | 37 | 37 | EQUAL |
| 2 | `02_student_request_attachment_uploads.csv` | `student_request_attachment_uploads` | 20 | 20 | 20 | 20 | EQUAL |
| 3 | `03_student_request_workflow_steps.csv` | `student_request_workflow_steps` | 135 | 135 | 135 | 135 | EQUAL |
| 4 | `04_student_request_workflow_events.csv` | `student_request_workflow_events` | 157 | 157 | 157 | 157 | EQUAL |
| 5 | `05_b1_draft_mutation_idempotency.csv` | `b1_draft_mutation_idempotency` | 53 | 53 | 53 | 53 | EQUAL |
| 6 | `06_student_excused_absences.csv` | `student_excused_absences` | 1 | 1 | 1 | 1 | EQUAL |
| 7 | `07_student_extra_chances.csv` | `student_extra_chances` | 1 | 1 | 1 | 1 | EQUAL |
| 8 | `08_file_withdrawal_details.csv` | `file_withdrawal_details` | 10 | 10 | 10 | 10 | EQUAL |
| 9 | `09_absence_excuse_details.csv` | `absence_excuse_details` | 6 | 6 | 6 | 6 | EQUAL |
| 10 | `10_enrollment_suspension_details.csv` | `enrollment_suspension_details` | 6 | 6 | 6 | 6 | EQUAL |
| 11 | `11_extra_chance_details.csv` | `extra_chance_details` | 9 | 9 | 9 | 9 | EQUAL |
| 12 | `12_transfer_request_details.csv` | `transfer_request_details` | 6 | 6 | 6 | 6 | EQUAL |
| 13 | `13_student_profiles.csv` | `student_profiles` (fixture) | 1 | 1 | 1 | 1 | EQUAL |
| 14 | `14_student_academic_status.csv` | `student_academic_status` (fixture) | 1 | 1 | 1 | 1 | EQUAL |
| 15 | `15_student_enrollments.csv` | `student_enrollments` (fixture) | 1 | 1 | 1 | 1 | EQUAL |
| | **TOTAL** | | **444** | **444** (after correction) | **444** | **444** | **EQUAL** |

All four columns match on every file. `37+20+135+157+53+1+1+10+6+6+9+6+1+1+1 = 444`.

## 2. G2 — ID-level coverage (exact set equality, not just counts)

For each file the stable identifier set was extracted from the CSV and fingerprinted as
`md5(join(sorted(ids), "\n"))`. The identical fingerprint was computed in production with
`md5(string_agg(k, E'\n' ORDER BY k COLLATE "C"))` over the **migration-128 predicate**
(candidate-join for request children, the three literal profile UUIDs for idempotency, the
three literal fixture UUIDs for profile/status/enrollment). Identical fingerprints prove exact
set equality — same cardinality *and* same members.

| # | Key used | Rows | Export fingerprint | Production fingerprint | Set equality |
|---|---|---|---|---|---|
| 1 | `id` | 37 | `b66fa77919da6f53bd879f1e271eebd0` | `b66fa77919da6f53bd879f1e271eebd0` | EQUAL |
| 2 | `id` | 20 | `2317d370b4eaf51f613e7ff552670f66` | `2317d370b4eaf51f613e7ff552670f66` | EQUAL |
| 3 | `id` | 135 | `ae94e1ade828a4485fb3671bf6ea26d4` | `ae94e1ade828a4485fb3671bf6ea26d4` | EQUAL |
| 4 | `id` | 157 | `63643340cd8c5e1879f29421c16283ae` | `63643340cd8c5e1879f29421c16283ae` | EQUAL |
| 5 | `student_profile_id\|operation\|idempotency_key` | 53 | `911d4a93c79dae27d90009ef04d9edb9` | `911d4a93c79dae27d90009ef04d9edb9` | EQUAL |
| 6 | `id` | 1 | `571f196b88d6ca8dbdef4d4035083d1d` | `571f196b88d6ca8dbdef4d4035083d1d` | EQUAL |
| 7 | `id` | 1 | `69bfcea5be3a3662fb49f2e172ff3916` | `69bfcea5be3a3662fb49f2e172ff3916` | EQUAL |
| 8 | `request_id` (PK) | 10 | `353feadfcbda0e26dda4ac3a20913583` | `353feadfcbda0e26dda4ac3a20913583` | EQUAL |
| 9 | `id` | 6 | `1db38b402efb755da5fb1142cdaf3b88` | `1db38b402efb755da5fb1142cdaf3b88` | EQUAL |
| 10 | `id` | 6 | `3bc90ad1fb0b1ff7abeab52139d58c5e` | `3bc90ad1fb0b1ff7abeab52139d58c5e` | EQUAL |
| 11 | `id` | 9 | `a0b4b1e2f0df6a7b9d78d43692a8bb3a` | `a0b4b1e2f0df6a7b9d78d43692a8bb3a` | EQUAL |
| 12 | `id` | 6 | `474ffc9f942d4d7e3c3d7370bb779c01` | `474ffc9f942d4d7e3c3d7370bb779c01` | EQUAL |
| 13 | `id` | 1 | `bfaf02c75aafe5228f86c64f9ed28a2b` | `bfaf02c75aafe5228f86c64f9ed28a2b` | EQUAL |
| 14 | `id` | 1 | `16b4aba8a5b6b87c52d2f52516b7a979` | `16b4aba8a5b6b87c52d2f52516b7a979` | EQUAL |
| 15 | `id` | 1 | `dc1fe89ba508cc14c7db4f62e4ed2007` | `dc1fe89ba508cc14c7db4f62e4ed2007` | EQUAL |

Every persistent row expected to be deleted therefore carries its primary key (or, for
`b1_draft_mutation_idempotency`, its full stable composite key) inside Export 132.

- persistent production rows to delete: **444**
- exported persistent rows: **444**
- missing from export: **0**
- extra in export: **0**
- outside migration predicates: **0**

No `HOLD_B1_STAGE3_CLEANUP_EXPORT_COVERAGE_MISSING_11_ROWS` condition: the alleged 11-row
difference never existed as data. `444 − 433 = 11` was purely the size of the addition mistake
in the two summary lines.

## 3. G3 — where 433 came from, and what was corrected

**Origin.** Export 132's manifest listed the 15 per-file counts correctly, then hand-summed the
"Total:" line as 433. Report 133's count-matrix total row copied that number. Nothing else in
the chain used 433: the CSVs, the SHA256 list, plan 131 predicates and migration 128 predicates
were always derived from the per-table counts.

```
PREVIOUS_TOTAL_433 = ARITHMETIC_REPORTING_ERROR
AUTHORITATIVE_EXPORTED_AND_DELETE_TOTAL = 444
```

**CSV bytes: UNCHANGED.** No CSV was regenerated, rewritten, re-exported or touched. All 15
SHA256 values re-verified against `MANIFEST.md` after the documentation edits: **15/15 match,
0 mismatches**.

Documents corrected:

| File | Change |
|---|---|
| `docs/exports/.../MANIFEST.md` | total line `433 rows` → `444 rows` + explicit correction note; per-file table and SHA list untouched |
| `docs/B1-STAGE3-FORWARD-ONLY-CLEANUP-FINAL-APPLY-PREFLIGHT-133-REPORT.md` | matrix total row `433 / 433` → `444 / 444` + correction note; per-table rows untouched |
| `docs/B1-STAGE3-CLEANUP-MIGRATION-D1-D2-SOURCE-REMEDIATION-134-REPORT.md` | §4 note restated in past tense with a status update pointing at this reconciliation |
| `docs/migration-drafts/B1-STAGE3-...-128.NOT_APPLIED.sql` | header comment updated: the manifest slip is now corrected; authoritative total 444 |

Sweep result: no remaining occurrence of `433` as a total anywhere in the cleanup chain. The
other `433` hits in `docs/` are unrelated substrings (`SR-20260727-44334F5D`, a hash fragment,
a row count `4433` in an old G9 report) and were left alone.

### Authoritative SHA256 values (Export 132, unchanged)

| File | SHA256 |
|---|---|
| `01_student_requests.csv` | `1a10d81cb8c4d64395bac5ec361dca06c0b1db471860694ce9c82628e64bb0de` |
| `02_student_request_attachment_uploads.csv` | `34f88971c0999df9421839d89afc5927ba47f7ee1f36c30786b35fe38e6621ac` |
| `03_student_request_workflow_steps.csv` | `d754a18928ee6129a6074fb25178b412404ecb1dd9ba2c15933a7c0e8e761919` |
| `04_student_request_workflow_events.csv` | `ab6ee2eabc2e40b674ccb3dc288e7ffaf0ff3da4e381400d9da92b3ba5303fa9` |
| `05_b1_draft_mutation_idempotency.csv` | `3a1c2f5a6b49caa0dd37b4546394b3c4ea1b1d9d8703d54b4aba418d5a7f2a6a` |
| `06_student_excused_absences.csv` | `810abf77dbadc8c5d250922bb512792d15dc72e218c2a0347eb06dcf0e1b04a3` |
| `07_student_extra_chances.csv` | `634e085552e6c636607e6d85acf9bb7a4a6e6a23cee1361c4d21edbcb07b8284` |
| `08_file_withdrawal_details.csv` | `8c893cc8ae9525640cc457f0a654cbfadf8d5b21c527d9f987efb8d3e66f2f76` |
| `09_absence_excuse_details.csv` | `25902a26d1d73436bf943ee8858383e565c042ce702902ef2ee243ed7ad41ba3` |
| `10_enrollment_suspension_details.csv` | `f7bb9195eca42594e2684e38ad3f742f1d24f3ffad76513c841e696aac75d78c` |
| `11_extra_chance_details.csv` | `08405dbcbf79e42d52d3c0508a6d2c8adb9b8d2412442bf5a4e86aa0c3b8b3ba` |
| `12_transfer_request_details.csv` | `c447365d5300ad9022573c10cdb28c0d9d876ef827d8db4372254b493188f3f2` |
| `13_student_profiles.csv` | `fd151b1de524edffbaf5677159c31a0c6dae116c319211f95708ab29178bd3c3` |
| `14_student_academic_status.csv` | `8a8283a396da0ff4fd9ae22d70fbf8e92060dfab0022d9fafdb834224b25c0f9` |
| `15_student_enrollments.csv` | `246a6bc97813367db6e3a6bb6691c12441ac4b77b1445ab92a27dc5623edcdfc` |

## 4. G4 — corrected static post-cleanup state

Derived from the re-measured production baseline minus the 15 asserted DELETE counts. Nothing
was executed.

| Table | Before (read-only, 20:18:36+00) | Deleted | Remaining (asserted by `$postcheck$`) |
|---|---|---|---|
| `student_requests` | 70 | 37 | **33** |
| `student_request_workflow_steps` | 191 | 135 | **56** |
| `student_request_workflow_events` | 240 | 157 | **83** |
| `student_request_attachment_uploads` | 28 | 20 | **8** |
| `b1_draft_mutation_idempotency` | 53 | 53 | **0** |
| `student_profiles` | 849 | 1 | **848** |
| `student_academic_status` | 851 | 1 | **850** |
| candidate detail/effect rows (files 6–12) | 39 | 39 | **0** |

**The two values must not be interchanged:**
`b1_draft_mutation_idempotency` remaining = **0** (all 53 fixture rows are deleted);
`student_request_attachment_uploads` remaining = **8** (28 − 20, all belonging to
evidence/HOLD requests). Migration 128 asserts exactly these two numbers in `$postcheck$`.

Unchanged by the cleanup: `TEST_ONLY_B1_%` profiles 3 → 2 (`0002`, `0003` retained), protected
academic-status rows 4, the 11 evidence/HOLD/legacy requests, all storage objects, all auth
accounts, all `student_visible` values, and the entire `enrollment_certificate` surface.

## 5. G5 — read-only revalidation (drift check)

| Predicate | Baseline (plan 131 / export 132) | Re-measured 20:17–20:18+00 | Verdict |
|---|---|---|---|
| candidate IDs present / TEST_ONLY / non-terminal / drift | 37 / 37 / 0 / 0 | 37 / 37 / 0 / 0 | PASS |
| exact candidate ID set | fp `b66fa779…` | fp `b66fa779…` | PASS |
| all 15 table counts | 37/20/135/157/53/1/1/10/6/6/9/6/1/1/1 | identical | PASS |
| all 15 ID-set fingerprints | see §2 | identical | PASS |
| Export 132 SHA256 | 15 values | 15/15 match | PASS |
| totals req/steps/events/att/idem/prof/status | 70/191/240/28/53/849/851 | identical | PASS |
| EC baseline: visible / requests / doc_details / official_docs / latest ts | true / 4 / 2 / 2 / `2026-07-16 04:44:29.338193+00` | identical | PASS |
| five B1 services with `student_visible <> false` | 0 | 0 | PASS |
| migration head | `20260730175527` | `20260730175527` | PASS |

Zero drift → no `HOLD_B1_STAGE3_CLEANUP_SOURCE_DRIFT_DURING_TOTAL_RECONCILIATION`.

## 6. Execution boundary

Read-only `SELECT` only: 2 statements, both through the read tool. Zero RPC calls, zero DML,
zero DDL, no storage call, no auth call, no migration applied, no deploy, no publish.
Migration 128 remains **`NOT_APPLIED`** and lives in `docs/migration-drafts/`, outside
`supabase/migrations/` (verified: no cleanup file exists under `supabase/migrations/`).

## 7. Git

Documentation-only changes; `git diff --check` clean.

```
docs/exports/B1-STAGE3-CLEANUP-LOGICAL-EXPORT-132/MANIFEST.md          total line + note
docs/B1-STAGE3-FORWARD-ONLY-CLEANUP-FINAL-APPLY-PREFLIGHT-133-REPORT.md total row + note
docs/B1-STAGE3-CLEANUP-MIGRATION-D1-D2-SOURCE-REMEDIATION-134-REPORT.md status update
docs/migration-drafts/B1-STAGE3-...-128.NOT_APPLIED.sql                 header comment only
docs/B1-STAGE3-CLEANUP-EXPORT-TOTAL-RECONCILIATION-135-REPORT.md        new (this file)
```

No `src/`, `supabase/`, or CSV file was modified. Final commit SHA: the commit created for this
turn (previous head `a5c3bd70`).

## Final decision

**PASS_B1_STAGE3_CLEANUP_EXPORT_TOTAL_444_RECONCILED_READY_FOR_EXPLICIT_APPLY_APPROVAL**

## Final flags

- AUTHORITATIVE_TOTAL_444
- CSV_FILES_15
- EXPORTED_ROWS_444
- EXPECTED_DELETE_ROWS_444
- MISSING_EXPORT_ROWS_0
- EXTRA_EXPORT_ROWS_0
- PRODUCTION_READ_ONLY_ONLY
- ZERO_RPC_CALLS
- ZERO_PRODUCTION_WRITES
- MIGRATION_128_NOT_APPLIED
- MIGRATION_128_OUTSIDE_SUPABASE_MIGRATIONS
- NO_STORAGE_CHANGE
- NO_AUTH_CHANGE
- NO_DEPLOY
- NO_PUBLISH
