# B1 First Delivery Cleanup Verification Package 27

> **Mode**: SOURCE-ONLY Review & Plan (No SQL Application)  
> **Baseline Commit**: `87449f85b95d927436e7607ae3c2b6a73245eb0d`  
> **Cleanup Source Migration**: `docs/B1-STAGE3-CLEANUP-DRY-RUN-SQL-125.sql`  
> **Verification Status**: PASS_CLEANUP_VERIFICATION_READY

---

## 1. Overview & Operational Mandate

This document details the cleanup package review for post-E2E fixture deletion. 
Under rule `<RULE[AGENTS.md]>`, cleanup SQL MUST NOT be applied during source preparation. This package provides the authoritative audit, pre/post-verifiers, dependency ordering, and zero-touch proofs for production and non-fixture data.

### Protected Five B1 Services:
1. `enrollment_suspension`
2. `excused_absence`
3. `department_transfer`
4. `final_chance`
5. `file_withdrawal`

---

## 2. Fixture Deletion Inventory & Dependency Ordering

The cleanup script (`docs/B1-STAGE3-CLEANUP-DRY-RUN-SQL-125.sql`) targets **EXCLUSIVELY** the 19 B1 test fixture requests and their child records.

### Deletion Dependency Order:
1. **Mock Secure Attachments**: Records in `student_request_attachments` associated with the 19 fixture request IDs.
2. **Notifications**: Records in `student_request_notifications` linked to fixture requests.
3. **Workflow Events**: Audit log entries in `student_request_events` linked to fixture requests.
4. **Runtime Steps**: Records in `student_request_steps` linked to fixture requests (`104` total steps).
5. **Fixture Requests**: Parent records in `student_requests` (`19` total requests across 5 services).

---

## 3. Row Reconciliation Table

| Target Entity / Table | Fixture Target Count | Non-Fixture Target Count | Protected Count | Deletion Action |
|---|---|---|---|---|
| `student_requests` | 19 | 0 | 4 (`enrollment_certificate`) | DELETE (Fixture only) |
| `student_request_steps` | 104 | 0 | 0 | DELETE (Fixture only) |
| `student_request_events` | Variable (Fixture steps) | 0 | Protected events | DELETE (Fixture only) |
| `student_request_notifications` | Variable (Fixture steps) | 0 | Protected notifications | DELETE (Fixture only) |
| `official_documents` | 0 | 0 | 2 (`enrollment_certificate`) | **EXCLUDED / ZERO TOUCH** |
| `document_details` | 0 | 0 | 2 (`enrollment_certificate`) | **EXCLUDED / ZERO TOUCH** |

---

## 4. Protected Record Exclusions

The cleanup queries explicitly filter out all non-fixture records using strict `WHERE request_id IN (...)` clauses matching only fixture IDs.

The following records are explicitly verified as excluded:
- `SR-20260716-26BAD4C8`
- `SR-20260715-FEDCB3E1`
- `SR-20260713-2DE64041`
- `USR-2026-000001`
- `USR-2026-000002`
- All `enrollment_certificate` rows and assets.

---

## 5. Pre-Cleanup and Post-Cleanup Verifiers

### Pre-Cleanup Verifier
Confirms that fixture request count equals 19, active steps count equals 19, and protected records are intact before cleanup begins.

### Post-Cleanup Verifier
Confirms that fixture request count equals 0, active steps count on B1 services equals 0, non-fixture requests remain at exact pre-cleanup counts, and `enrollment_certificate` remains 100% intact.

---

## 6. Stop / Rollback Conditions

- If `pre-cleanup` verifier detects modified non-fixture records, cleanup aborts immediately (`HOLD_CLEANUP_PRECHECK_FAILED`).
- If `post-cleanup` verifier detects any deletion of `enrollment_certificate` or non-fixture data, the system flags `HOLD_CLEANUP_UNAUTHORIZED_DELETION`.

---

## 7. Verification Document Reference

- Cleanup SQL draft: `docs/B1-STAGE3-CLEANUP-DRY-RUN-SQL-125.sql`
- Cleanup inventory report: `docs/B1-STAGE3-CLEANUP-INVENTORY-122.md`
- Cleanup manifest report: `docs/B1-STAGE3-CLEANUP-ID-MANIFEST-123.md`

---

## 8. Final Cleanup Verification Decision

```
PASS_CLEANUP_VERIFICATION_READY
```
