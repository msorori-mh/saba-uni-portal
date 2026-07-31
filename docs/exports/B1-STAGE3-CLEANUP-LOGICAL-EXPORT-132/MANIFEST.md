# B1 Stage 3 — Pre-cleanup logical export manifest

Mission: `B1_STAGE3_EXECUTE_LOGICAL_EXPORT_BEFORE_CLEANUP_MIGRATION_APPLY-132`
Mode: OWNER-APPROVED LOGICAL EXPORT ONLY — `SELECT`/`COPY` only.
Input plan: `docs/B1-STAGE3-CLEANUP-MIGRATION-128-PRE-APPLY-RISK-CLOSURE-131.md` §3 (R-e).

## Provenance

| Item | Value |
|---|---|
| Export timestamp (UTC) | 2026-07-31 19:39 |
| Source | Lovable Cloud production database (read-only `sandbox_exec` role) |
| Project ref | `wpmicqriltrowwonknox` |
| Migration head | `20260730175527` (199 applied) — unchanged before and after export |
| Mechanism | `\copy (SELECT … WHERE …) TO … WITH (FORMAT csv, HEADER)` — no `pg_dump`, no full dump |
| Candidate set | the 37 explicit request IDs from `docs/migration-drafts/B1-STAGE3-TESTONLY-LIMITED-CLEANUP-FORWARD-ONLY-128.NOT_APPLIED.sql` (`INSERT INTO cand_request`), referenced below as `:cand` |

## Pre-export verification (all PASS, no drift vs. plan 131)

| Check | Expected | Measured |
|---|---|---|
| migration head | `20260730175527` | `20260730175527` |
| candidate count / present in DB | 37 / 37 | 37 / 37 |
| candidates owned by `TEST_ONLY_B1_%` | 37 | 37 |
| candidates in non-terminal status | 0 | 0 |
| drift (`updated_at > 2026-07-31 04:00:00+00`) | 0 | 0 |
| intersection with evidence/HOLD/legacy numbers | 0 | 0 |
| evidence + HOLD + protected legacy present | 11 | 11 |
| `student_requests` total | 70 | 70 |
| five B1 services `student_visible` | all `false` | all `false` |
| `enrollment_certificate` `student_visible` | `true` | `true` |
| EC baseline: requests / doc_details / official_documents | 4 / 2 / 2 | 4 / 2 / 2 |
| EC latest `updated_at` | `2026-07-16 04:44:29.338193+00` | identical |

## Files

| # | File | Table | WHERE filter | Rows (plan 131) | Rows exported | SHA256 |
|---|---|---|---|---|---|---|
| 1 | `01_student_requests.csv` | `student_requests` | `id IN (:cand)` | 37 | 37 | `1a10d81cb8c4d64395bac5ec361dca06c0b1db471860694ce9c82628e64bb0de` |
| 2 | `02_student_request_attachment_uploads.csv` | `student_request_attachment_uploads` | `student_request_id IN (:cand)` | 20 | 20 | `34f88971c0999df9421839d89afc5927ba47f7ee1f36c30786b35fe38e6621ac` |
| 3 | `03_student_request_workflow_steps.csv` | `student_request_workflow_steps` | `student_request_id IN (:cand)` | 135 | 135 | `d754a18928ee6129a6074fb25178b412404ecb1dd9ba2c15933a7c0e8e761919` |
| 4 | `04_student_request_workflow_events.csv` | `student_request_workflow_events` | `student_request_id IN (:cand)` | 157 | 157 | `ab6ee2eabc2e40b674ccb3dc288e7ffaf0ff3da4e381400d9da92b3ba5303fa9` |
| 5 | `05_b1_draft_mutation_idempotency.csv` | `b1_draft_mutation_idempotency` | `student_profile_id IN ('7020e51d-19e3-4acb-9597-5145b65d117e','b1e20002-0000-4000-8000-000000000002','65f55997-6fd0-40d0-9235-70ac65afeac2')` | 53 | 53 | `3a1c2f5a6b49caa0dd37b4546394b3c4ea1b1d9d8703d54b4aba418d5a7f2a6a` |
| 6 | `06_student_excused_absences.csv` | `student_excused_absences` | `absence_excuse_request_id IN (:cand)` | 1 | 1 | `810abf77dbadc8c5d250922bb512792d15dc72e218c2a0347eb06dcf0e1b04a3` |
| 7 | `07_student_extra_chances.csv` | `student_extra_chances` | `request_id IN (:cand)` | 1 | 1 | `634e085552e6c636607e6d85acf9bb7a4a6e6a23cee1361c4d21edbcb07b8284` |
| 8 | `08_file_withdrawal_details.csv` | `file_withdrawal_details` | `request_id IN (:cand)` | 10 | 10 | `8c893cc8ae9525640cc457f0a654cbfadf8d5b21c527d9f987efb8d3e66f2f76` |
| 9 | `09_absence_excuse_details.csv` | `absence_excuse_details` | `request_id IN (:cand)` | 6 | 6 | `25902a26d1d73436bf943ee8858383e565c042ce702902ef2ee243ed7ad41ba3` |
| 10 | `10_enrollment_suspension_details.csv` | `enrollment_suspension_details` | `request_id IN (:cand)` | 6 | 6 | `f7bb9195eca42594e2684e38ad3f742f1d24f3ffad76513c841e696aac75d78c` |
| 11 | `11_extra_chance_details.csv` | `extra_chance_details` | `request_id IN (:cand)` | 9 | 9 | `08405dbcbf79e42d52d3c0508a6d2c8adb9b8d2412442bf5a4e86aa0c3b8b3ba` |
| 12 | `12_transfer_request_details.csv` | `transfer_request_details` | `request_id IN (:cand)` | 6 | 6 | `c447365d5300ad9022573c10cdb28c0d9d876ef827d8db4372254b493188f3f2` |
| 13 | `13_student_profiles.csv` | `student_profiles` | `id = '7020e51d-19e3-4acb-9597-5145b65d117e'` | 1 | 1 | `fd151b1de524edffbaf5677159c31a0c6dae116c319211f95708ab29178bd3c3` |
| 14 | `14_student_academic_status.csv` | `student_academic_status` | `id = 'f864d89a-0017-4051-b627-61e587e946af'` | 1 | 1 | `8a8283a396da0ff4fd9ae22d70fbf8e92060dfab0022d9fafdb834224b25c0f9` |
| 15 | `15_student_enrollments.csv` | `student_enrollments` | `id = 'fb71eb0c-2f44-4deb-99ee-ac79ffdcbc2b'` | 1 | 1 | `246a6bc97813367db6e3a6bb6691c12441ac4b77b1445ab92a27dc5623edcdfc` |

Total: 15 files, 433 rows, ~196 KB. Every file includes a CSV header row; row
counts are the `COPY n` counts reported by the server, not line counts (some
text columns contain embedded newlines).

## Not exported (by mission scope)

- **Storage bytes.** The 20 objects in the private bucket
  `student-request-secure-attachments` are NOT exported. Only their metadata
  rows (file 2) are captured. Object paths are listed in plan 131 §4.
- **Auth accounts.** No `auth.users` row is exported (including
  `2e3ca4d6-603c-4f06-a23e-462bf92fcfd3`). No auth data is touched or deleted.
- **Evidence / HOLD / legacy / real data.** Out of the candidate filter by
  construction; nothing outside the 37 IDs and the three fixture identifiers
  was read into any file.
- **enrollment_certificate.** No EC table or row is exported or modified; only
  read-only baseline counters were re-measured.

## Restore limitations (must be accepted before any apply)

1. Re-insert must run in the reverse of the delete order: parents
   (`student_profiles` → `student_academic_status`/`student_enrollments` →
   `student_requests`) before children (workflow steps/events, attachment
   metadata, per-service detail tables). FKs are `RESTRICT`/`NO ACTION`.
2. `guard_b1_runtime_mutation_boundary()` blocks re-inserting workflow rows
   unless `b1.atomic_init` is set transaction-locally, and the sandbox role has
   no write privilege at all — restore requires a privileged forward-only
   migration, exactly like the cleanup itself.
3. Restore reproduces **rows only** — not the auth account and not storage
   bytes. Attachment metadata restored without objects points at paths that may
   no longer resolve.
4. Triggers and `updated_at` values may be rewritten on re-insert; the restored
   data is evidence-grade for inspection, **not byte-identical**.
5. Sequences and derived aggregates are not covered (none in scope here).
6. This is a logical snapshot at the timestamp above. Any DB change after that
   moment is not represented; re-run the plan-131 revalidation immediately
   before any apply.

## Post-export verification

| Check | Result |
|---|---|
| export files created | 15/15 |
| row counts vs. plan 131 | exact match on all 15 |
| SHA256 generated per CSV | yes (table above) |
| DB writes performed | none — `SELECT`/`COPY` only (one session-local TEMP id list) |
| migration applied / deployed / published | none |
| `student_visible` changed | no — five B1 services `false`, EC `true` |
| `enrollment_certificate` touched | no — baseline identical before and after |
| migration head after export | `20260730175527` (unchanged) |
| migration 128 status | still `NOT_APPLIED`, still outside `supabase/migrations/` |
