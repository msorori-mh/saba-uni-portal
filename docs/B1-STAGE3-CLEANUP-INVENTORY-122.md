# B1-STAGE3 — TEST_ONLY CLEANUP INVENTORY (122)

**Mode:** INVENTORY ONLY — NO CLEANUP EXECUTED, NO DML/DDL PROPOSED FOR THIS MISSION
**Companion:** `docs/B1-STAGE3-EVIDENCE-BUNDLE-122.md`
**Snapshot:** 2026-07-31 (UTC), production read-only

---

## A. Population counts (read-only)

| Item | Count |
|---|---|
| TEST_ONLY student profiles (`academic_number LIKE 'TEST_ONLY_B1_%'`) | 3 |
| TEST_ONLY student requests (all statuses) | 45 |
| — of which `draft` | 6 |
| — of which evidence (completed five + fail-closed) | 6 |
| — remaining non-evidence TEST_ONLY requests | 33 |
| TEST_ONLY `student_academic_status` rows | 5 (0002: 2, 0003: 2, 0001: 1) |

---

## B. DO NOT DELETE — evidence records (protected)

### B.1 Completed five-service E2E requests (and their full step/event/effect chains)

| Service | Request number | request_id |
|---|---|---|
| excused_absence | SR-20260727-78427CC5 | `ee24e59d-a05f-454e-b4bd-de8023eb6835` |
| enrollment_suspension | SR-20260727-50BEDCE2 | `85edca41-6bf8-4cec-b3bf-f9c5130fd771` |
| department_transfer | SR-20260727-88D885F0 | `d8aba0e3-ae3b-4fab-ab49-1697b1e94a3a` |
| final_chance | SR-20260727-40E3E66B | `66908bb6-7b38-4488-b4d2-75a4243f7a2b` |
| file_withdrawal | SR-20260727-42393846 | `7d600a3b-8d17-4a6b-a27a-7a98625d06c4` |

Includes, for each: `student_request_workflow_steps`, `student_request_workflow_events`, attachments referenced by the request, and the produced effect rows.

### B.2 Fail-closed evidence

- SR-20260727-3C550070 (`b9193b39-e30c-401c-9729-1836b6555843`) — `in_review`, must remain exactly as-is.

### B.3 Effect rows produced by the completed requests

- `student_excused_absences` row for `absence_excuse_request_id = ee24e59d-…`
- `student_extra_chances` row for `request_id = 66908bb6-…`
- `student_academic_status` rows for TEST_ONLY_B1_0002 and TEST_ONLY_B1_0003 (suspension → withdrawal history, Option B `active` fixture for 0002)
- `department_transfer` program/department assignment result for TEST_ONLY_B1_0003
- `file_withdrawal_details` (`effect_applied_at`, `records_transferred_at`) for SR-20260727-42393846

### B.4 Protected legacy records (project-wide rule, unrelated to B1)

- SR-20260713-2DE64041, SR-20260715-FEDCB3E1, SR-20260716-26BAD4C8
- USR-2026-000001, USR-2026-000002

### B.5 Student profiles referenced by evidence

- TEST_ONLY_B1_0002, TEST_ONLY_B1_0003 — **must not be deleted** while B.1–B.3 exist (FK parents of the evidence chain).

---

## C. Cleanup candidates (eligible for a LATER, separately approved mission)

| # | Candidate | Approx. count | Notes |
|---|---|---|---|
| C1 | Abandoned TEST_ONLY requests that are not evidence (drafts and non-completed exploratory rows) | ~33 (incl. 6 `draft`) | Must exclude every ID in section B |
| C2 | Attachments belonging only to C1 requests | tbd at execution time | Private storage objects; delete via the secure RPC path only |
| C3 | TEST_ONLY_B1_0001 profile and its rows, if unreferenced by any evidence | 1 profile + 1 academic status row | Verify zero FK references first |
| C4 | Orphan draft form-data rows for C1 | tbd | Only after C1 |

**Not eligible for cleanup:** anything in section B, any non-TEST_ONLY record, `enrollment_certificate` data, and all workflow configuration.

---

## D. Preconditions for any future cleanup mission

1. Explicit, separate owner approval naming the exact record classes to delete.
2. Re-verify the section B ID list immediately before execution (fail closed on any mismatch).
3. Deletion by explicit ID list only — no `LIKE`-pattern mass delete, no `TRUNCATE`, no cascade from profiles.
4. Preserve migration head `20260730175527`; no schema change for cleanup.
5. Do not delete storage objects directly; use the approved secure removal path.
6. Post-cleanup re-verification that all section B evidence is byte-identical (status, counts, timestamps).

---

## E. Mission invariants

- No DML, DDL, migration, deploy, publish, or workflow RPC executed.
- No TEST_ONLY record deleted or modified.
- `student_visible` unchanged; `enrollment_certificate` untouched.
- This mission produced documentation only.
