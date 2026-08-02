# B1 First Delivery Cleanup Verification Package 27

> **Mode**: SOURCE-ONLY Review & Plan (No SQL Application)
> **Baseline Commit**: `d35612906b2d3ad4d059623b02e5862aa42ab9db`
> **Migration Head**: `20260801021541`
> **Cleanup Source Script**: `docs/B1-STAGE3-CLEANUP-DRY-RUN-SQL-125.sql`
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

The cleanup script (`docs/B1-STAGE3-CLEANUP-DRY-RUN-SQL-125.sql`) targets **EXCLUSIVELY** the candidate test fixture requests and their child records specified in candidate set `cand_request` (37 candidate requests).

### Deletion Dependency Order:
1. **Attachment Upload Metadata**: `student_request_attachment_uploads` (20 metadata rows; storage objects strictly preserved).
2. **Academic & Service Effect Rows**: `student_excused_absences` (1), `student_extra_chances` (1), `file_withdrawal_details` (10).
3. **Service Detail Rows**: `absence_excuse_details` (6), `enrollment_suspension_details` (6), `extra_chance_details` (9), `transfer_request_details` (6).
4. **Workflow Events**: `student_request_workflow_events` (157 audit event rows).
5. **Workflow Steps**: `student_request_workflow_steps` (135 runtime step rows).
6. **Idempotency Cache**: `b1_draft_mutation_idempotency` (53 draft idempotency rows).
7. **Candidate Requests**: `student_requests` (37 candidate request rows).
8. **Test-Only Fixture Profile**: `student_academic_status` (1), `student_enrollments` (1), `student_profiles` (1 row: ID `7020e51d-19e3-4acb-9597-5145b65d117e`).

---

## 3. Row Reconciliation Table (Authoritative SQL Inventory)

| Target Entity / Table | Candidate Cleanup Count | Post-Cleanup Remaining Count | Protected Non-Candidate Count | Deletion Action |
|---|---|---|---|---|
| `student_requests` | 37 | 33 | 33 (3 legacy + 8 evidence + 4 cert + others) | DELETE (Candidates only) |
| `student_request_workflow_steps` | 135 | Post-cleanup baseline | Protected steps | DELETE (Candidates only) |
| `student_request_workflow_events` | 157 | Post-cleanup baseline | Protected events | DELETE (Candidates only) |
| `student_request_attachment_uploads` | 20 | Post-cleanup baseline | Protected attachments | DELETE (Candidates only) |
| `b1_draft_mutation_idempotency` | 53 | Post-cleanup baseline | Protected idempotency | DELETE (Candidates only) |
| `file_withdrawal_details` | 10 | Post-cleanup baseline | Protected details | DELETE (Candidates only) |
| `extra_chance_details` | 9 | Post-cleanup baseline | Protected details | DELETE (Candidates only) |
| `absence_excuse_details` | 6 | Post-cleanup baseline | Protected details | DELETE (Candidates only) |
| `enrollment_suspension_details` | 6 | Post-cleanup baseline | Protected details | DELETE (Candidates only) |
| `transfer_request_details` | 6 | Post-cleanup baseline | Protected details | DELETE (Candidates only) |
| `student_excused_absences` | 1 | 2 | 2 (Evidence effect rows) | DELETE (Candidates only) |
| `student_extra_chances` | 1 | 1 | 1 (Evidence effect row) | DELETE (Candidates only) |
| `student_profiles` | 1 | 848 | 848 (848 remaining profiles) | DELETE (Candidate profile only) |
| `official_documents` | 0 | 2 | 2 (`enrollment_certificate`) | **EXCLUDED / ZERO TOUCH** |
| `document_details` | 0 | 2 | 2 (`enrollment_certificate`) | **EXCLUDED / ZERO TOUCH** |

---

## 4. Protected Record Exclusions

The cleanup queries explicitly filter out all non-candidate records using strict explicit candidate tables (`cand_request`) and hold lists (`hold_request_number`).

The following records are explicitly verified as excluded and protected:
- `SR-20260716-26BAD4C8` (Legacy Request 1)
- `SR-20260715-FEDCB3E1` (Legacy Request 2)
- `SR-20260713-2DE64041` (Legacy Request 3)
- `USR-2026-000001` (Official Document 1)
- `USR-2026-000002` (Official Document 2)
- 8 B1 evidence / HOLD requests (`SR-20260727-78427CC5`, `SR-20260727-50BEDCE2`, `SR-20260727-88D885F0`, `SR-20260727-40E3E66B`, `SR-20260727-42393846`, `SR-20260727-3C550070`, `SR-20260727-695EC35B`, `SR-20260727-F67CF366`)
- 2 protected TEST_ONLY profiles (`b1e20002-0000-4000-8000-000000000002`, `65f55997-6fd0-40d0-9235-70ac65afeac2`)
- All `enrollment_certificate` rows, document details, and storage artifacts.

---

## 5. Pre-Cleanup and Post-Cleanup Verifiers

### Pre-Cleanup Verifier
Confirms candidate count equals 37, child steps equal 135, events equal 157, attachments equal 20, and all protected records are present before cleanup begins.

### Post-Cleanup Verifier
Confirms candidate request count equals 0, total remaining requests equal 33, total remaining profiles equal 848, 8 evidence records are intact, 3 legacy requests are intact, and `enrollment_certificate` remains 100% intact.

---

## 6. Stop / Rollback Conditions

- If `pre-cleanup` verifier detects modified non-candidate records or candidate count mismatch, cleanup aborts immediately (`HOLD_CLEANUP_PRECHECK_FAILED`).
- If `post-cleanup` verifier detects any deletion of `enrollment_certificate` or non-candidate data, the system flags `HOLD_CLEANUP_UNAUTHORIZED_DELETION`.

---

## 7. Verification Document Reference

- Cleanup SQL script: `docs/B1-STAGE3-CLEANUP-DRY-RUN-SQL-125.sql`
- Cleanup inventory report: `docs/B1-STAGE3-CLEANUP-EXPORT-TOTAL-RECONCILIATION-135-REPORT.md`
- Cleanup manifest report: `docs/B1-STAGE3-CLEANUP-ID-MANIFEST-123.md`

---

## 8. Final Cleanup Verification Decision

```
PASS_CLEANUP_VERIFICATION_READY
```
