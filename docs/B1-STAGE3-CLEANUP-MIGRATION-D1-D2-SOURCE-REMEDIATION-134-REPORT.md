# B1 Stage 3 — Cleanup migration 128, D1/D2 source remediation

Mission: `PORTAL-B1-STAGE3-CLEANUP-MIGRATION-D1-D2-SOURCE-REMEDIATION-134`
Mode: **SOURCE-ONLY SQL REMEDIATION + READ-ONLY PREFLIGHT RE-RUN**
Input decision: `HOLD_B1_STAGE3_CLEANUP_MIGRATION_PLPGSQL_AMBIGUOUS_COLUMN_N_AND_MISSING_PER_DELETE_ROWCOUNT_ASSERTIONS`
(report 133).

## 1. Changed files

| File | Change |
|---|---|
| `docs/migration-drafts/B1-STAGE3-TESTONLY-LIMITED-CLEANUP-FORWARD-ONLY-128.NOT_APPLIED.sql` | rewritten in place: D1 + D2 + D3 fixed; 288 → 720 lines. Still `NOT_APPLIED`, still outside `supabase/migrations/`. |
| `docs/B1-STAGE3-CLEANUP-MIGRATION-D1-D2-SOURCE-REMEDIATION-134-REPORT.md` | new (this file) |
| `docs/B1-STAGE3-FORWARD-ONLY-CLEANUP-FINAL-APPLY-PREFLIGHT-133-REPORT.md` | addendum §134 appended; decision superseded |

No source file outside `docs/` was touched. No `supabase/migrations/` file added or modified
(266 SQL files there, unchanged).

## 2. D1 — PL/pgSQL ambiguity, exact fix

**Cause.** The temp table column `hold_request_number.n` collided with the block-local
`DECLARE n int`. `SELECT n FROM hold_request_number` is then ambiguous under the default
`plpgsql.variable_conflict = error`.

**Empirical proof (throwaway local PostgreSQL 17.9, no production contact):**

```
ERROR:  column reference "n" is ambiguous
DETAIL:  It could refer to either a PL/pgSQL variable or a table column.
CONTEXT: PL/pgSQL function inline_code_block line 2 at SQL statement
```

and the replacement pattern on the same server:

```
NOTICE:  NEW_PATTERN_OK 1
```

**Fix applied.**

1. Temp table column renamed `hold_request_number.n` → `hold_request_number.request_number`.
2. Every `IN (SELECT n FROM hold_request_number)` replaced with an explicit qualified join:
   `JOIN hold_request_number AS h ON h.request_number = r.request_number`.
3. No block declares `n` any more. Locals are `v_actual_count`, `v_deleted_count`,
   `v_head_version`.
4. Every table in every block carries an explicit alias (`AS r`, `AS c`, `AS h`, `AS p`,
   `AS s`, `AS e`, `AS d`, `AS a`, `AS i`, `AS o`, `AS t`, `AS m`) and every column reference
   is qualified.
5. All `RAISE EXCEPTION` calls converted to the `USING ERRCODE/MESSAGE/DETAIL` form with
   `expected=… actual=…`.

## 3. Inventory of the corrected DO blocks

| Block | Dollar tag | Locals | Purpose | Ambiguous refs |
|---|---|---|---|---|
| 1 | `$precheck$` | `v_actual_count integer`, `v_head_version text` | 34 preconditions; aborts before any DELETE | none |
| 2 | `$cleanup$` | `v_deleted_count integer` | the 15 DELETEs + 15 per-delete assertions | none |
| 3 | `$postcheck$` | `v_actual_count integer` | 24 postconditions incl. protected baselines | none |

All three bodies **compile** with `check_function_bodies = on` on local PostgreSQL 17.9
(`PLPGSQL_BODIES_COMPILED`). No `EXCEPTION WHEN` handler exists in any block.

## 4. D2 — the 15 DELETEs, expected counts and assertion method

Every DELETE is followed **immediately** by its own
`GET DIAGNOSTICS v_deleted_count = ROW_COUNT;` and an exact `IF v_deleted_count <> N THEN
RAISE EXCEPTION … '<TABLE>_DELETE_COUNT_MISMATCH' … DETAIL 'expected=N actual=…'`.
No assertion covers more than one DELETE.

| # | Table | Predicate (unchanged) | Expected | Assertion | Order rationale |
|---|---|---|---|---|---|
| D01 | `student_request_attachment_uploads` | `a.student_request_id = c.id` (cand join) | 20 | `ATTACHMENT_UPLOADS_DELETE_COUNT_MISMATCH` | leaf child of request; metadata only |
| D02 | `student_excused_absences` | `e.absence_excuse_request_id = c.id` | 1 | `EXCUSED_ABSENCES_DELETE_COUNT_MISMATCH` | RESTRICT parent-of-request effect row |
| D03 | `student_extra_chances` | `e.request_id = c.id` | 1 | `EXTRA_CHANCES_DELETE_COUNT_MISMATCH` | same |
| D04 | `file_withdrawal_details` | `d.request_id = c.id` | 10 | `FILE_WITHDRAWAL_DETAILS_DELETE_COUNT_MISMATCH` | same |
| D05 | `absence_excuse_details` | `d.request_id = c.id` | 6 | `ABSENCE_EXCUSE_DETAILS_DELETE_COUNT_MISMATCH` | detail child |
| D06 | `enrollment_suspension_details` | `d.request_id = c.id` | 6 | `ENROLLMENT_SUSPENSION_DETAILS_DELETE_COUNT_MISMATCH` | detail child |
| D07 | `extra_chance_details` | `d.request_id = c.id` | 9 | `EXTRA_CHANCE_DETAILS_DELETE_COUNT_MISMATCH` | detail child |
| D08 | `transfer_request_details` | `d.request_id = c.id` | 6 | `TRANSFER_REQUEST_DETAILS_DELETE_COUNT_MISMATCH` | detail child (department_transfer) |
| D09 | `student_request_workflow_events` | `e.student_request_id = c.id` | 157 | `WORKFLOW_EVENTS_DELETE_COUNT_MISMATCH` | events reference steps → before steps |
| D10 | `student_request_workflow_steps` | `s.student_request_id = c.id` | 135 | `WORKFLOW_STEPS_DELETE_COUNT_MISMATCH` | before requests |
| D11 | `b1_draft_mutation_idempotency` | `i.student_profile_id IN (3 literal UUIDs)` | 53 | `IDEMPOTENCY_DELETE_COUNT_MISMATCH` | NO ACTION FK on request + profile |
| D12 | `student_requests` | `r.id = c.id` | 37 | `STUDENT_REQUESTS_DELETE_COUNT_MISMATCH` | after all children |
| D13 | `student_academic_status` | `s.id = 'f864d89a-…'` | 1 | `FIXTURE_ACADEMIC_STATUS_DELETE_COUNT_MISMATCH` | fixture child of profile |
| D14 | `student_enrollments` | `e.id = 'fb71eb0c-…'` | 1 | `FIXTURE_ENROLLMENT_DELETE_COUNT_MISMATCH` | fixture child of profile |
| D15 | `student_profiles` | `p.id = '7020e51d-…'` | 1 | `FIXTURE_PROFILE_DELETE_COUNT_MISMATCH` | last, after everything it owns |
| | | **Sum** | **444** | | |

### Note on the "433" figure

The mission brief and `MANIFEST.md` (export 132) both print a total of **433**, but the 15
per-table counts they list sum to **444**
(`20+1+1+10+6+6+9+6+157+135+53+37+1+1+1 = 444`). The per-table counts are authoritative and
unchanged; **433 is an arithmetic slip in the manifest total**, not a data discrepancy — the
export contains 444 rows across 15 CSVs (verified by counting parsed CSV records this turn:
37/20/135/157/53/1/1/10/6/6/9/6/1/1/1). The draft therefore asserts **444** as the total and
the corrected figure is carried into the flags as
`EXPECTED_DELETE_ROWS_444_CORRECTED_FROM_433`.

## 5. Pre-delete assertions (G4)

The `$precheck$` block runs entirely before D01 and asserts: candidate count 37; all 37
present in DB; all 37 owned by `TEST_ONLY_B1_%`; candidate ∩ HOLD/evidence/legacy = 0;
candidate ∩ `enrollment_certificate` = 0; 0 non-terminal candidates; 0 rows with
`updated_at > 2026-07-31 04:00:00+00`; child volumes 20/135/157; idempotency 53; effect rows
1/1; details 10/6/6/9/6; fixture profile/status/enrollment 1/1/1; fixture owns 0 extra
requests, 0 extra status rows, 0 extra enrollments, 0 official documents (and no official
document references a candidate); 11 HOLD/evidence/legacy records present; pre-delete totals
70/191/240/28/849/851; EC baseline 4/2/2 and timestamp `2026-07-16 04:44:29.338193+00`; the
five B1 services `student_visible = false` and `enrollment_certificate = true`; migration head
`20260730175527`. Any mismatch raises and rolls the whole transaction back before a single row
is deleted.

## 6. Protected postconditions (G6)

`$postcheck$` asserts (all hard `RAISE EXCEPTION`, D3 fixed — the old `RAISE NOTICE` for
`enrollment_certificate_document_details` is now an equality assertion):

- candidates remaining = 0; HOLD/evidence/legacy = 11; `SR-20260727-3C550070` still
  `in_review`; `SR-20260727-F67CF366` still `submitted`; evidence effect rows 2 + 1 intact.
- protected profiles 2; protected academic-status rows 4; `TEST_ONLY_B1_%` profiles 2.
- exact remaining totals: `student_requests` **33**, `student_request_workflow_steps` **56**,
  `student_request_workflow_events` **83**, `student_request_attachment_uploads` **8**,
  `b1_draft_mutation_idempotency` **0**, `student_profiles` **848**,
  `student_academic_status` **850**.
- visibility: five B1 services `false`, `enrollment_certificate` `true`.
- `enrollment_certificate`: requests 4, `enrollment_certificate_document_details` 2,
  `official_documents` 2, latest `official_documents.updated_at` exactly
  `2026-07-16 04:44:29.338193+00`.

Correction vs. the mission brief: the brief lists "idempotency = 8" for the expected remaining
state. 8 is the remaining **attachment_uploads** count (28 − 20); the idempotency table has 53
rows and all 53 are deleted, so its expected remainder is **0**. The draft asserts
`attachments = 8` and `idempotency = 0`.

## 7. Transaction and failure behaviour

- One explicit `BEGIN;` (line 66) and one explicit `COMMIT;` — the last executable statement,
  after every assertion. Verified: exactly 1 `BEGIN;` and 1 `COMMIT;` in the file.
- `SELECT set_config('b1.atomic_init','1', true)` is transaction-local.
- No savepoint, no `EXCEPTION WHEN` handler, no fallback, no `CONTINUE` after mismatch: any
  raise propagates and rolls back the entire transaction, leaving the database unchanged.
- Header notes that if the file is ever promoted into `supabase/migrations/`, the explicit
  `BEGIN`/`COMMIT` must be removed because the runner supplies its own wrapper.

## 8. Offline SQL validation results (G8)

| Check | Result |
|---|---|
| any PL/pgSQL variable named `n` | none — PASS |
| unqualified `SELECT n FROM …` | none — PASS |
| ambiguous references in the DO blocks | none; empirically reproduced on the old pattern and cleared on the new — PASS |
| DELETE statements | **15** — PASS |
| per-delete `GET DIAGNOSTICS … ROW_COUNT` | **15** — PASS |
| `*_DELETE_COUNT_MISMATCH` raises | **15** — PASS |
| each DELETE followed immediately by its assertion | PASS |
| expected-count sum | 444 (see §4) |
| exception swallowing (`EXCEPTION WHEN`) | none — PASS |
| `BEGIN;` / `COMMIT;` | 1 / 1, COMMIT last — PASS |
| `CASCADE` | only in two comment lines (43, 445); no SQL keyword use — PASS |
| `TRUNCATE` | only in comment line 43 — PASS |
| dynamic SQL (`EXECUTE`) | none — PASS |
| `storage.` references | none — PASS |
| `auth.users` / `auth.identities` references | none — PASS |
| `UPDATE request_types` / any `student_visible` write | none — PASS |
| `NOT IN (SELECT …)` | none (replaced by `NOT EXISTS` with a correlated candidate check) — PASS |
| any INSERT/UPDATE outside the two temp tables | none — PASS |
| write to `supabase_migrations` | none (read-only `max(version)`) — PASS |
| plpgsql compile, PostgreSQL 17.9, `check_function_bodies=on` | `PLPGSQL_BODIES_COMPILED` — PASS |
| `git diff --check` | clean |
| migration 128 applied | no — `NOT_APPLIED` |
| file location | `docs/migration-drafts/` — outside `supabase/migrations/` |

## 9. Read-only preflight re-run (G9) — production

Timestamp: **`2026-07-31 20:10:11.663047+00`** (server `now()`), read-only, zero RPC.
Migration head `20260730175527` (199 applied), unchanged.

| Predicate | Export 132 / plan 131 | Re-measured | Verdict |
|---|---|---|---|
| candidates present | 37 | 37 | PASS |
| all TEST_ONLY / non-terminal / drift | 37 / 0 / 0 | 37 / 0 / 0 | PASS |
| candidate ∩ enrollment_certificate | 0 | 0 | PASS |
| attachments / steps / events | 20 / 135 / 157 | 20 / 135 / 157 | PASS |
| idempotency | 53 | 53 | PASS |
| excused / extra chance effect rows | 1 / 1 | 1 / 1 | PASS |
| details fw/ae/es/ec/tr | 10/6/6/9/6 | 10/6/6/9/6 | PASS |
| fixture profile / status / enrollment | 1 / 1 / 1 | 1 / 1 / 1 | PASS |
| fixture official documents | 0 | 0 | PASS |
| totals req/steps/events/att/idem/prof/status | 70/191/240/28/53/849/851 | identical | PASS |
| HOLD + evidence + legacy present | 11 | 11 | PASS |
| five B1 services not-false visibility | 0 | 0 | PASS |
| EC visible / requests / details / docs / timestamp | true / 4 / 2 / 2 / `2026-07-16 04:44:29.338193+00` | identical | PASS |

**Export 132 SHA256: 15/15 files re-verified against `MANIFEST.md` — 0 mismatches.**

No drift → no `HOLD_B1_STAGE3_CLEANUP_MIGRATION_SOURCE_DRIFT_AFTER_REMEDIATION` condition.

## 10. Storage and Auth boundary (G7)

- Zero `storage.` and zero `auth.` references in the draft. The 20 objects in the private
  bucket `student-request-secure-attachments` keep their bytes; only their 20 metadata rows
  are removed (they become orphaned, documented, and require a separate approved cleanup).
- No bucket, storage policy, GRANT, RLS, role or identity-provider statement.
- Auth account `2e3ca4d6-603c-4f06-a23e-462bf92fcfd3` is explicitly left in place.
- Export 132 is **`LOGICAL_DATA_SAFETY_EXPORT_ONLY`** — not a storage backup, not an Auth
  backup, not a byte-identical database backup, and not an executable restore package. Any
  restoration needs a separately reviewed, privileged, forward-only migration.

## 11. Static expected post-state (derivation only, nothing executed)

`student_requests` 70→33 · `student_request_workflow_steps` 191→56 ·
`student_request_workflow_events` 240→83 · `student_request_attachment_uploads` 28→8 ·
`b1_draft_mutation_idempotency` 53→0 · `student_profiles` 849→848 ·
`student_academic_status` 851→850 · candidate detail/effect rows → 0 ·
`TEST_ONLY_B1_%` profiles 3→2 (`0002`, `0003` retained) · EC baseline and all visibility
values unchanged · migration head before application `20260730175527`.

## 12. Git status

- `git diff --check`: clean.
- Working tree at report time: clean (`git status --porcelain` empty).
- Final commit SHA: `3928ff15` (this remediation's snapshot; the platform commits the turn's
  edits, so the SHA visible after this turn's finalization supersedes it).

## Final decision

**PASS_B1_STAGE3_CLEANUP_MIGRATION_D1_D2_FIXED_AND_FINAL_PREFLIGHT_READY_FOR_EXPLICIT_APPLY_APPROVAL**

Two documented figure corrections accompany this PASS (they change no data and no predicate):
the total expected deleted rows is **444**, not 433 (manifest arithmetic slip), and the
expected remaining idempotency count is **0**, not 8 (8 is the remaining attachment count).

## Final flags

- SOURCE_ONLY_REMEDIATION
- PRODUCTION_READ_ONLY_PREFLIGHT_ONLY
- ZERO_RPC_CALLS
- ZERO_PRODUCTION_WRITES
- MIGRATION_128_NOT_APPLIED
- MIGRATION_128_OUTSIDE_SUPABASE_MIGRATIONS
- DELETE_STATEMENTS_15
- PER_DELETE_ASSERTIONS_15
- EXPECTED_DELETE_ROWS_444_CORRECTED_FROM_433
- NO_STORAGE_DELETE
- NO_AUTH_CHANGE
- NO_VISIBILITY_CHANGE
- NO_MIGRATION_APPLY
- NO_DEPLOY
- NO_PUBLISH
