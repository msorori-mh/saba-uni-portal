# B1-STAGE3 — CLEANUP EXECUTION PREFLIGHT PACKAGE (125)

**Mission:** `B1_STAGE3_PREPARE_CLEANUP_EXECUTION_PREFLIGHT_PACKAGE_NO_EXECUTION-125`
**Mode:** READ-ONLY PREFLIGHT + DOCS/SQL PLAN ONLY — **NO CLEANUP EXECUTED**
**Snapshot:** 2026-07-31 (UTC), production, `SELECT` only
**Inputs:** `docs/B1-STAGE3-CLEANUP-ID-MANIFEST-123.md`, `docs/B1-STAGE3-CLEANUP-RISK-RESOLUTION-124.md`
**Executable script (documentation only, not run):** `docs/B1-STAGE3-CLEANUP-DRY-RUN-SQL-125.sql`

---

## 0. Invariants verified in this snapshot

| Item | Verified value |
|---|---|
| Migration head | `20260730175527` ✅ unchanged |
| Five B1 services `student_visible` | `false` (unchanged) |
| `enrollment_certificate` | untouched; 0 candidate rows in `enrollment_certificate_document_details` / `..._generation_attempts` |
| Database writes this mission | **none** (`SELECT` only) |
| Migration / deploy / publish | **none** |
| Workflow RPC / action execution | **none** |
| Storage objects deleted | **none** |
| Change type | **docs-only** (2 new files) |

---

## 1. R4 resolution — ID drift re-validation (measured now)

| Check | Expected | Measured | Result |
|---|---|---|---|
| Candidate IDs in package | 37 | 37 | ✅ |
| Still present in `student_requests` | 37 | 37 | ✅ no drift |
| Belong to a `TEST_ONLY_B1_%` profile | 37 | 37 | ✅ |
| Intersection with HOLD/evidence/legacy list (11 numbers) | 0 | **0** | ✅ |
| Rows updated after the 123/124 snapshot (`updated_at > 2026-07-31T04:00Z`) | 0 | **0** | ✅ no in-flight change |
| Status breakdown | terminal/draft only | `draft` 6, `completed` 20, `cancelled` 11 — **no `submitted`, no `in_review`** | ✅ |

Manifest 123 listed 38 Batch-B rows; `SR-20260727-F67CF366` was moved to HOLD by mission 124, leaving **37** executable candidates. `SR-20260727-695EC35B` was never in the set and is now permanent evidence.

Drift-detection is also embedded in the script as a hard precondition: the transaction aborts unless the candidate CTE resolves to exactly 37 TEST_ONLY, non-HOLD rows with zero HOLD intersection.

---

## 2. Final candidate counts by table

| # | Table | Filter | Rows |
|---|---|---|---|
| 1 | `student_request_attachment_uploads` | `student_request_id IN (37)` | 20 |
| 2 | `student_excused_absences` | `absence_excuse_request_id IN (37)` | 1 |
| 3 | `student_extra_chances` | `request_id IN (37)` | 1 |
| 4 | `absence_excuse_details` | `request_id IN (37)` | 6 |
| 5 | `enrollment_suspension_details` | `request_id IN (37)` | 6 |
| 6 | `extra_chance_details` | `request_id IN (37)` | 9 |
| 7 | `transfer_request_details` | `request_id IN (37)` | 6 |
| 8 | `file_withdrawal_details` | `request_id IN (37)` | 10 |
| 9 | `student_request_workflow_events` | `student_request_id IN (37)` | 157 |
| 10 | `student_request_workflow_steps` | `student_request_id IN (37)` | 135 |
| 11 | `b1_draft_mutation_idempotency` | 3 TEST_ONLY profiles | 53 |
| 12 | `student_requests` | explicit 37 IDs | 37 |
| 13 | `student_academic_status` | `id = f864d89a-0017-4051-b627-61e587e946af` (0001) | 1 |
| 14 | `student_enrollments` | `id = fb71eb0c-2f44-4deb-99ee-ac79ffdcbc2b` (0001) | 1 |
| 15 | `student_profiles` | `id = 7020e51d-19e3-4acb-9597-5145b65d117e` (TEST_ONLY_B1_0001) | 1 |
| 16 | `auth.users` (0001, `2e3ca4d6-…`) | approved account-removal path only — **outside this SQL package** | 1 |

Measured **zero** candidate rows in: `student_request_parallel_groups`, `student_request_fee_assessments`, `student_service_request_events`, `student_service_request_steps`, `official_documents`, `enrollment_reinstatement_details`, `enrollment_certificate_document_details`, `enrollment_certificate_document_generation_attempts`. For profile 0001 also zero in `payment_receipts`, `student_fees`, `student_discounts`, `notifications`, `user_roles`.

All 53 idempotency rows belong to TEST_ONLY_B1_0001 and every one points at a candidate request (rows referencing a non-candidate or `NULL` request = **0**).

---

## 3. R5 resolution — FK-safe deletion order

FK topology measured from `pg_constraint` (relevant parents: `student_requests`, `student_profiles`, `student_request_workflow_steps`). Cascades exist but the package **never relies on them** — every row is deleted explicitly, children first, so no cascade can reach an evidence row.

```text
 1. student_request_attachment_uploads   (ON DELETE a = NO ACTION -> must precede requests)
 2. student_excused_absences             (r = RESTRICT -> must precede requests)
 3. student_extra_chances                (r = RESTRICT -> must precede requests)
 4. file_withdrawal_details              (r = RESTRICT -> must precede requests)
 5. absence_excuse_details               (no FK to requests; delete with the detail group)
 6. enrollment_suspension_details        (c)
 7. extra_chance_details                 (c)
 8. transfer_request_details             (c)
 9. student_request_workflow_events      (references steps with n = SET NULL and requests with c)
10. student_request_workflow_steps       (c)
11. b1_draft_mutation_idempotency        (a = NO ACTION on both request_id and student_profile_id -> must precede both)
12. student_requests                     (explicit 37-ID list)
13. student_academic_status  (0001, 1 row)
14. student_enrollments      (0001, 1 row)
15. student_profiles         (0001, 1 row)
16. auth account 0001        -- NOT in the SQL package; approved account-removal path only
```

Hard rules carried into the script: explicit ID/`IN` lists only, no `LIKE` mass delete, no `TRUNCATE`, no cascade from `student_profiles`, one transaction, abort on any count mismatch.

---

## 4. Dry-run expected row counts (not executed)

| Table | Before | Expected after | Delta |
|---|---|---|---|
| `student_requests` | 70 | 33 | −37 |
| `student_request_workflow_steps` | 191 | 56 | −135 |
| `student_request_workflow_events` | 240 | 83 | −157 |
| `student_request_attachment_uploads` | 28 | 8 | −20 |
| `b1_draft_mutation_idempotency` | 53 | 0 | −53 |
| `absence_excuse_details` | 8 | 2 | −6 |
| `enrollment_suspension_details` | 9 | 3 | −6 |
| `extra_chance_details` | 12 | 3 | −9 |
| `transfer_request_details` | 8 | 2 | −6 |
| `file_withdrawal_details` | 12 | 2 | −10 |
| `student_excused_absences` | 3 | 2 | −1 |
| `student_extra_chances` | 2 | 1 | −1 |
| `student_academic_status` | 851 | 850 | −1 |
| `student_profiles` | 849 | 848 | −1 |
| `student_enrollments` (0001) | 1 | 0 | −1 |
| Evidence requests (7 incl. 695EC35B) | 7 | 7 | 0 |
| HOLD request F67CF366 | 1 | 1 | 0 |
| Protected legacy records (5) | 5 | 5 | 0 |
| `enrollment_certificate` data | unchanged | unchanged | 0 |
| Storage objects | 28 | 28 | 0 |

Residual after execution: `enrollment_suspension_details` keeps 3 rows (2 evidence + 1 HOLD F67CF366); `absence_excuse_details` keeps the 695EC35B row.

---

## 5. Excluded HOLD / evidence proof

Measured intersection between the 37 candidate IDs and the protected set = **0**.

| Protected record | In candidate set? |
|---|---|
| SR-20260727-78427CC5 / -50BEDCE2 / -88D885F0 / -40E3E66B / -42393846 / -3C550070 | NO |
| SR-20260727-695EC35B (evidence, mission 124) | NO |
| SR-20260727-F67CF366 (HOLD, open `submitted`) | NO |
| SR-20260713-2DE64041 / SR-20260715-FEDCB3E1 / SR-20260716-26BAD4C8 / USR-2026-000001 / USR-2026-000002 | NO (also not TEST_ONLY) |
| TEST_ONLY_B1_0002 / 0003 profiles, accounts, academic-status rows | NO |
| Any non-TEST_ONLY student row | NO — every filter is bound to the 3 TEST_ONLY profile IDs |
| Storage objects (all 28) | NO — storage excluded from the DML package entirely |

The script re-asserts this as a precondition and again as a postcondition before `COMMIT`.

---

## 6. Storage exclusion (task 9)

The executable DML package deletes the 20 **attachment metadata rows** (required for FK correctness) but deletes **no storage object**. Consequence: immediately after execution the 20 private objects listed in `docs/B1-STAGE3-CLEANUP-RISK-RESOLUTION-124.md` §3 become orphaned bytes in `student-request-secure-attachments`. That is intentional and reversible-by-omission; object removal stays a separate, separately approved mission that must follow a byte-level export. The script therefore starts with an explicit `require_storage_export_acknowledged` guard flag that the operator must set deliberately.

---

## 7. Rollback / restore limitations

1. There is **no in-place rollback after `COMMIT`**. The only rollback window is the open transaction (`ROLLBACK` before commit).
2. Deleted request/step/event/detail rows cannot be recreated with their original UUIDs, request numbers, or timestamps.
3. Restoring after commit requires a full point-in-time restore of the database — which would also revert every unrelated change made since; not an acceptable routine remedy.
4. Storage bytes are untouched by this package, so the objects remain recoverable; once the separate storage mission runs, bytes are unrecoverable without an external export.
5. `auth` account removal for 0001 is irreversible and is deliberately excluded from this SQL package.
6. Mitigation required before any approved run: a fresh logical dump of the 15 affected tables restricted to the TEST_ONLY profile IDs, stored outside the database.

---

## 8. Remaining risks

| # | Risk | State |
|---|---|---|
| R1 | SR-20260727-695EC35B | RESOLVED — evidence, excluded |
| R2 | SR-20260727-F67CF366 | RESOLVED to HOLD — excluded from executable set |
| R3 | Storage bytes | RESOLVED to HOLD — no object in the DML package |
| R4 | ID drift | **RESOLVED** — re-validated 37/37 now, plus in-transaction drift precondition |
| R5 | FK cascade order | **RESOLVED** — explicit 15-step child-first order, no reliance on cascade, no cascade from `student_profiles` |
| R6 (new) | Orphaned storage objects between this DML and the later storage mission | Accepted; documented in §6, no data-integrity impact (rows already gone, bucket is private) |

---

**FINAL DECISION: PASS_B1_STAGE3_CLEANUP_PREFLIGHT_PACKAGE_READY_FOR_OWNER_DML_APPROVAL**
