# B1 Stage 3 — Forward-only cleanup migration 128, final apply preflight

Mission: `PORTAL-B1-STAGE3-FORWARD-ONLY-CLEANUP-MIGRATION-FINAL-APPLY-PREFLIGHT-133`
Mode: **PRODUCTION READ-ONLY FINAL PREFLIGHT ONLY**

| Item | Value |
|---|---|
| Production read-only timestamp (UTC) | `2026-07-31 19:56:37.193065+00` (server `now()`) |
| Current migration head | `20260730175527` (199 applied) |
| Target draft | `docs/migration-drafts/B1-STAGE3-TESTONLY-LIMITED-CLEANUP-FORWARD-ONLY-128.NOT_APPLIED.sql` (288 lines) |
| Draft location | outside `supabase/migrations/` — confirmed (last real migration on disk: `20260730175527_89e2a6a3-…sql`) |
| Writes performed | none — `SELECT` only, no RPC, no DML/DDL |

---

## G1 — Plan 131 revalidation (production, read-only)

| Predicate | Plan 131 / export 132 | Measured now | Verdict |
|---|---|---|---|
| candidate IDs in draft | 37 | 37 | PASS |
| candidates present in `student_requests` | 37 | 37 | PASS |
| candidates owned by `TEST_ONLY_B1_%` | 37 | 37 | PASS |
| candidates in non-terminal status | 0 | 0 | PASS |
| drift (`updated_at > 2026-07-31 04:00:00+00`) | 0 | 0 | PASS |
| `student_request_attachment_uploads` (candidates) | 20 | 20 | PASS |
| `student_request_workflow_steps` (candidates) | 135 | 135 | PASS |
| `student_request_workflow_events` (candidates) | 157 | 157 | PASS |
| `b1_draft_mutation_idempotency` (3 fixture profiles) | 53 | 53 (= whole table) | PASS |
| `student_excused_absences` (candidates) | 1 | 1 | PASS |
| `student_extra_chances` (candidates) | 1 | 1 | PASS |
| `file_withdrawal_details` | 10 | 10 | PASS |
| `absence_excuse_details` | 6 | 6 | PASS |
| `enrollment_suspension_details` | 6 | 6 | PASS |
| `extra_chance_details` | 9 | 9 | PASS |
| `transfer_request_details` | 6 | 6 | PASS |
| test profile `7020e51d…` | 1 | 1 | PASS |
| academic status `f864d89a…` | 1 | 1 | PASS |
| enrollment `fb71eb0c…` | 1 | 1 | PASS |
| other rows of profile `7020e51d…` (requests / status / enrollments / official docs) | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | PASS |
| evidence + HOLD + protected legacy numbers present | 11 | 11 | PASS |
| candidate ∩ HOLD/evidence numbers | 0 | 0 | PASS |
| evidence effect rows (2 excused + 1 extra chance) | 3 | 3 | PASS |
| protected profiles `b1e20002…`, `65f55997…` | 2 | 2 | PASS |
| protected academic status rows | 4 | 4 | PASS |
| `TEST_ONLY_B1_%` profiles total | 3 | 3 | PASS |

Candidate split by service (read-only): `department_transfer=6`, `enrollment_suspension=6`,
`excused_absence=6`, `file_withdrawal=10`, `final_chance=9` — total 37.

Current whole-table totals: requests 70, steps 191, events 240, attachment uploads 28,
student profiles 849, academic status 851, idempotency 53.

**No additional, missing, or changed row vs. export 132 → no source drift.**

## G2 — Protected `enrollment_certificate` baseline

| Check | Expected | Measured | Verdict |
|---|---|---|---|
| `request_types.student_visible` (`enrollment_certificate`) | `true` | `true` | PASS |
| EC requests | 4 | 4 | PASS |
| `enrollment_certificate_document_details` | 2 | 2 | PASS |
| `official_documents` | 2 | 2 | PASS |
| latest relevant timestamp | `2026-07-16 04:44:29.338193+00` | `2026-07-16 04:44:29.338193+00` (`official_documents.updated_at` = EC request `updated_at`) | PASS |

Note: `enrollment_certificate_document_details.created_at` max is
`2026-07-16 04:43:53.069029+00`; the `04:44:29.338193+00` value is the official-document /
EC-request timestamp referenced by plan 131.

Non-impact proof (structural, read-only):

- `student_requests r JOIN cand WHERE request_type = 'enrollment_certificate'` → **0**. No
  EC request is in the delete list; every workflow/attachment delete is keyed by
  `student_request_id IN (candidates)`, so the 21 EC workflow steps and 35 EC workflow
  events cannot be matched.
- `official_documents o JOIN cand ON c.id = o.student_request_id` → **0**; `official_documents`
  is never named in the draft (no DELETE/UPDATE targets it).
- `enrollment_certificate_document_details` is only **read** (`count(*)` + `RAISE NOTICE`) in
  the postcondition block.
- Profile-scope deletes are three literal-UUID single-row deletes; `7020e51d…` owns 0
  official documents, 0 extra enrollments, 0 extra academic-status rows and 0 non-candidate
  requests, so no unrelated profile/enrollment can be reached.
- Attachment deletes are metadata-only and candidate-scoped → protected attachments (8
  remaining rows, incl. all EC-related ones) untouched.

## G3 — Service visibility

`request_types` rows for `enrollment_suspension`, `excused_absence`, `department_transfer`,
`final_chance`, `file_withdrawal`: rows with `student_visible IS DISTINCT FROM false` = **0**
→ all five remain hidden. The draft contains **no** `UPDATE request_types` and no other write
to visibility; it only asserts visibility in pre/postconditions. PASS.

## G4 — Statement-by-statement static review

Non-destructive statements:

| Line | Statement | Assessment |
|---|---|---|
| 45 | `SELECT set_config('b1.atomic_init','1', true)` | transaction-local (`is_local=true`); required by `guard_b1_runtime_mutation_boundary()`. Scoped, reverts at commit/rollback. OK |
| 47–85 | `CREATE TEMP TABLE cand_request … ON COMMIT DROP` + 37 literal UUIDs | explicit ID list, PK-deduped, no LIKE/name matching. OK |
| 87–92 | `hold_request_number` temp table (11 protected numbers) | OK |
| 103–164 | precondition `DO` block | see defect **D1** below |
| 214–284 | postcondition `DO` block | see defects **D1**, **D2** |

Destructive statements — all `DELETE … USING cand_request` (inner join, non-nullable FK
columns, no `NOT IN`, no subquery, no `CASCADE`, no `TRUNCATE`, no dynamic SQL):

| # | Line | Table | Predicate | Expected rows (measured) | Order rationale | Row-count assertion |
|---|---|---|---|---|---|---|
| 2.1 | 171 | `student_request_attachment_uploads` | `student_request_id = c.id` | 20 (20) | child of request; storage bytes untouched | none per-statement |
| 2.2a | 175 | `student_excused_absences` | `absence_excuse_request_id = c.id` | 1 (1) | RESTRICT parent-of-request effect row | none |
| 2.2b | 177 | `student_extra_chances` | `request_id = c.id` | 1 (1) | same | none |
| 2.2c | 179 | `file_withdrawal_details` | `request_id = c.id` | 10 (10) | same | none |
| 2.3a | 183 | `absence_excuse_details` | `request_id = c.id` | 6 (6) | detail child | none |
| 2.3b | 184 | `enrollment_suspension_details` | `request_id = c.id` | 6 (6) | detail child | none |
| 2.3c | 185 | `extra_chance_details` | `request_id = c.id` | 9 (9) | detail child | none |
| 2.3d | 186 | `transfer_request_details` | `request_id = c.id` | 6 (6) | detail child | none |
| 2.4a | 189 | `student_request_workflow_events` | `student_request_id = c.id` | 157 (157) | events reference steps → before steps | none |
| 2.4b | 190 | `student_request_workflow_steps` | `student_request_id = c.id` | 135 (135) | before requests | none |
| 2.5 | 193 | `b1_draft_mutation_idempotency` | `student_profile_id IN (3 literal UUIDs)` | 53 (53) | NO ACTION FK on request/profile | none |
| 2.6 | 201 | `student_requests` | `id = c.id` | 37 (37) | after all children | none |
| 2.7a | 204 | `student_academic_status` | `id = 'f864d89a…'` | 1 (1) | single literal UUID | none |
| 2.7b | 205 | `student_enrollments` | `id = 'fb71eb0c…'` | 1 (1) | single literal UUID | none |
| 2.7c | 206 | `student_profiles` | `id = '7020e51d…'` | 1 (1) | last, after all its children | none |

Reject-list screening: no name/label-based predicates (only UUIDs), no unbounded delete, no
`NOT IN` over nullable subqueries, no `CASCADE`, no dynamic SQL, no storage deletion, no auth
deletion, no `supabase_migrations` manipulation, no visibility change, no EC impact. Those
checks **pass**.

Two defects block execution:

**D1 — `plpgsql` ambiguous identifier `n` (blocking, both `DO` blocks).**
Both blocks declare `DECLARE n int;` and then run
`… WHERE r.request_number IN (SELECT n FROM hold_request_number)` (line 125) and
`SELECT count(*) INTO n FROM student_requests WHERE request_number IN (SELECT n FROM hold_request_number)`
(line 149). The temp table's column is also named `n`. With PostgreSQL's default
`plpgsql.variable_conflict = error`, the reference resolves ambiguously and the block aborts
with `42702 column reference "n" is ambiguous` — the migration can never reach a successful
commit. Behaviour is fail-safe (it aborts inside the precondition block, before any DELETE),
but the artifact as written is **not executable**. Fix: rename the temp column (e.g.
`request_number`) or the variable, or qualify as `hold_request_number.n`.

**D2 — no per-statement row-count assertions (G8 requirement).**
None of the 15 DELETEs uses `RETURNING`, `GET DIAGNOSTICS ROW_COUNT`, or an inline
`IF ROW_COUNT <> expected THEN RAISE` guard. The draft relies exclusively on aggregate
absolute-total postconditions (`POSTCHECK_TOTAL_*`). Those totals are correct for today's
snapshot (see G9) and would catch an over-delete, but they do not attribute a mismatch to a
statement and do not assert the *exact per-table deleted count* that the mission requires.

**D3 — informational only.** Line 106–108 (`current_setting('vars.storage_export_ack', true)`
+ `NULL;`) is dead code, and line 280–281 only `RAISE NOTICE`s the EC detail count instead of
asserting `= 2`. Neither is unsafe, but the EC assertion should be hardened to an exact
comparison.

## G5 — Exported row coverage

Manifest SHA256 re-verified: **15/15 files match** the hashes recorded in
`docs/exports/B1-STAGE3-CLEANUP-LOGICAL-EXPORT-132/MANIFEST.md` (recomputed this turn).

| Table | Expected deletes | Exported rows | Equality | Missing | Extra |
|---|---|---|---|---|---|
| `student_requests` | 37 | 37 | PASS | 0 | 0 |
| `student_request_attachment_uploads` | 20 | 20 | PASS | 0 | 0 |
| `student_request_workflow_steps` | 135 | 135 | PASS | 0 | 0 |
| `student_request_workflow_events` | 157 | 157 | PASS | 0 | 0 |
| `b1_draft_mutation_idempotency` | 53 | 53 | PASS | 0 | 0 |
| `student_excused_absences` | 1 | 1 | PASS | 0 | 0 |
| `student_extra_chances` | 1 | 1 | PASS | 0 | 0 |
| `file_withdrawal_details` | 10 | 10 | PASS | 0 | 0 |
| `absence_excuse_details` | 6 | 6 | PASS | 0 | 0 |
| `enrollment_suspension_details` | 6 | 6 | PASS | 0 | 0 |
| `extra_chance_details` | 9 | 9 | PASS | 0 | 0 |
| `transfer_request_details` | 6 | 6 | PASS | 0 | 0 |
| `student_profiles` | 1 | 1 | PASS | 0 | 0 |
| `student_academic_status` | 1 | 1 | PASS | 0 | 0 |
| `student_enrollments` | 1 | 1 | PASS | 0 | 0 |
| **Total** | **433** | **433** | **PASS** | 0 | 0 |

ID-level cross-check: the 37 `id` values in `01_student_requests.csv` are exactly the 37
`INSERT INTO cand_request` UUIDs (0 missing, 0 extra); every `student_request_id` in the
attachment/steps/events exports lies inside the candidate set (0 outside).

## G6 — Storage and Auth boundary

- The draft contains **no** reference to `storage.` — the 20 objects in the private bucket
  `student-request-secure-attachments` are **not** deleted; only their 20 metadata rows in
  `student_request_attachment_uploads` are removed (documented, intentional: the objects
  become orphaned and remain physically present).
- `storage.objects` rows: **untouched** by the migration (no statement targets them).
- No `auth.users` / `auth.identities` statement exists; auth account
  `2e3ca4d6-603c-4f06-a23e-462bf92fcfd3` is explicitly left in place (§2.8 comment).
- No bucket, storage policy, grant, role or RLS statement is present. No DDL at all.

Verdict: **storage/auth scope clean — no `HOLD_…_STORAGE_OR_AUTH_SCOPE` condition.**

## G7 — Restore limitation

Export 132 is **`LOGICAL_DATA_SAFETY_EXPORT_ONLY`**. It is **not**:

- a byte-identical database backup,
- a storage-object backup (0 of 20 objects' bytes captured),
- an Auth backup,
- an automatically executable restore package.

Any restoration would require a **separately reviewed, privileged, forward-only migration**
that re-inserts parents before children, sets `b1.atomic_init` transaction-locally to pass
`guard_b1_runtime_mutation_boundary()`, and accepts that trigger-written columns
(`updated_at` etc.) will differ. The `sandbox_exec` role cannot perform it.

## G8 — Transaction and assertion review

| Requirement | Status |
|---|---|
| runs in one explicit transaction | PARTIAL — relies on the runner's implicit single-transaction wrapper; `BEGIN/COMMIT` intentionally omitted and documented (lines 21–25). Acceptable for the migration channel only. |
| fails before destructive statements if preconditions differ | PASS — all 11 precondition checks precede statement 2.1 and `RAISE EXCEPTION` aborts. |
| asserts exact expected counts before deletion | PASS — 37/37/37, 20/135/157, HOLD-intersection 0, drift 0, visibility, migration head. |
| asserts exact deleted counts after each operation | **FAIL (D2)** — no per-statement `ROW_COUNT`/`RETURNING` assertion. |
| asserts protected baselines before commit | PARTIAL — evidence/HOLD/legacy/protected-profile/visibility/total-row assertions present; EC detail count is only a `RAISE NOTICE`, not an assertion (D3). |
| no partial-success path | PASS — single transaction, no savepoints. |
| no exception swallowing | PASS — no `EXCEPTION WHEN` handler anywhere. |
| no COMMIT before final verification | PASS — no `COMMIT` in the file. |
| executable as written | **FAIL (D1)** — ambiguous `n` aborts the precondition block. |

## G9 — Expected post-apply state (static derivation, **not executed**)

Derived arithmetically from the read-only measurements above; **no database write, no
simulation run, no dry-run transaction was performed.**

| Table | Now | Deleted | Expected after |
|---|---|---|---|
| `student_requests` | 70 | 37 | 33 (draft asserts 33 ✓) |
| `student_request_workflow_steps` | 191 | 135 | 56 (asserts 56 ✓) |
| `student_request_workflow_events` | 240 | 157 | 83 (asserts 83 ✓) |
| `student_request_attachment_uploads` | 28 | 20 | 8 (asserts 8 ✓) |
| `b1_draft_mutation_idempotency` | 53 | 53 | 0 |
| `student_profiles` | 849 | 1 | 848 (asserts 848 ✓) |
| `student_academic_status` | 851 | 1 | 850 (asserts 850 ✓) |
| `student_enrollments` (fixture) | 1 | 1 | 0 |
| service detail tables (5) | 37 | 37 | 0 for the candidate scope |
| `student_excused_absences` / `student_extra_chances` | evidence 2 / 1 kept | 1 / 1 | evidence rows intact |

Expected protected EC baseline after apply: visible `true`, requests 4, document_details 2,
official_documents 2, timestamp `2026-07-16 04:44:29.338193+00` — unchanged.
Expected service visibility after apply: all five B1 services `false`.
Expected migration head **before** application: `20260730175527` (application would add one
new version; the draft asserts the pre-state head).
Expected remaining identities: `TEST_ONLY_B1_0002` and `TEST_ONLY_B1_0003` profiles retained
(2 `TEST_ONLY_B1_%` profiles), `TEST_ONLY_B1_0001` profile removed, its auth account retained,
846 non-test profiles unchanged.

## Risks

1. **R1 (blocking).** D1 — ambiguous `n`: the migration aborts at precondition time; an apply
   attempt burns a migration slot / produces a failed apply with zero data change.
2. **R2 (medium).** D2 — absence of per-statement row-count assertions weakens attribution if
   a child volume shifts between preflight and apply.
3. **R3 (medium).** Absolute-total postconditions (`33/56/83/8/848/850`) are snapshot-bound;
   any legitimate production row created between now and apply makes the migration abort
   after the deletes (safe, but a guaranteed rollback). Apply must be scheduled in a quiet
   window and revalidated immediately beforehand.
4. **R4 (accepted).** 20 storage objects become orphaned; bytes remain in the private bucket
   and require a separate, explicitly approved cleanup.
5. **R5 (accepted).** Auth account `2e3ca4d6…` remains without a profile until the separate
   approved account-removal path runs.
6. **R6 (accepted).** Restore is logical-only (G7).

## Final decision

**HOLD_B1_STAGE3_CLEANUP_MIGRATION_PLPGSQL_AMBIGUOUS_COLUMN_N_AND_MISSING_PER_DELETE_ROWCOUNT_ASSERTIONS**

Data-side preflight is fully green (G1, G2, G3, G5, G6, G7, G9 all PASS, zero drift), but the
artifact fails G4/G8: as written it cannot execute (D1) and it lacks the required per-delete
exact-count assertions (D2). A source-only revision of draft 128 (rename the ambiguous
identifier, add `GET DIAGNOSTICS`/`RETURNING` count guards per DELETE, and turn the EC
`RAISE NOTICE` into an exact assertion) followed by a re-run of this preflight is required
before any apply approval.

## Final flags

- PRODUCTION_READ_ONLY_PREFLIGHT_ONLY
- ZERO_RPC_CALLS
- ZERO_PRODUCTION_WRITES
- MIGRATION_128_NOT_APPLIED
- MIGRATION_128_OUTSIDE_SUPABASE_MIGRATIONS
- NO_STORAGE_DELETE
- NO_AUTH_CHANGE
- NO_VISIBILITY_CHANGE
- NO_DEPLOY
- NO_PUBLISH
