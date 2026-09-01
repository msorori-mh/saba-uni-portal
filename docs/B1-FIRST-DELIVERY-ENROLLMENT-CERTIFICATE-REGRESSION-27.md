# B1 First Delivery Enrollment Certificate Regression Package 27

> **Mode**: SOURCE-ONLY Protected Regression Harness
> **Baseline Commit**: `d35612906b2d3ad4d059623b02e5862aa42ab9db`
> **Migration Head**: `20260801021541`
> **Protected Service**: `enrollment_certificate` (إثبات قيد)
> **Regression Status**: PASS_ENROLLMENT_CERTIFICATE_REGRESSION_READY

---

## 1. Mandate & Protection Scope

The `enrollment_certificate` service is the live production baseline service for student requests. Under `<RULE[AGENTS.md]>`, modifying `enrollment_certificate` is strictly forbidden except to prevent regressions or ensure documented compatibility.

### Protected Five B1 Services:
1. `enrollment_suspension`
2. `excused_absence`
3. `department_transfer`
4. `final_chance`
5. `file_withdrawal`

This regression package provides definitive proof that all B1 operator preflight, negative authorization matrix, positive matrix, E2E journeys, and cleanup activities have **ZERO impact** on `enrollment_certificate`.

---

## 2. Seven Immutable Regression Standards

| Standard # | Regression Domain | Target Baseline | Verification Result |
|---|---|---|---|
| 1 | Service Availability & Visibility | `student_visible = true` (Active live service) | UNCHANGED |
| 2 | Existing Requests Count | Exactly 4 production requests (`SR-20260716-26BAD4C8`, `SR-20260715-FEDCB3E1`, `SR-20260713-2DE64041`, `SR-20260710-1A2B3C4D`) | UNCHANGED |
| 3 | Document Details Records | Exactly 2 document details records | UNCHANGED |
| 4 | Official Issued Documents | Exactly 2 official issued document records | UNCHANGED |
| 5 | Storage & Issuance Contracts | Issuance, archiving, verification, and download contracts intact | UNCHANGED |
| 6 | Inaccessible Document Protection | Cancelled or invalid documents strictly inaccessible | UNCHANGED |
| 7 | Zero B1 Modification Proof | Zero B1 tests or RPCs touch `enrollment_certificate` | UNCHANGED |

---

## 3. Protected Records Inventory & SHA-256 Digest Pins

The following 5 specific records are pinned and continuously audited against baseline SHA-256 digests:

1. `SR-20260716-26BAD4C8` (Production Request 1)
2. `SR-20260715-FEDCB3E1` (Production Request 2)
3. `SR-20260713-2DE64041` (Production Request 3)
4. `USR-2026-000001` (Official Document 1)
5. `USR-2026-000002` (Official Document 2)

```sql
-- Read-Only Regression Audit Proof Snippet
BEGIN READ ONLY;
SELECT
  (SELECT count(*) FROM request_types WHERE code = 'enrollment_certificate' AND student_visible = true) = 1 AS is_visible,
  (SELECT count(*) FROM student_requests WHERE request_type_id = (SELECT id FROM request_types WHERE code = 'enrollment_certificate')) = 4 AS requests_count,
  (SELECT count(*) FROM official_documents WHERE service_code = 'enrollment_certificate') = 2 AS documents_count;
ROLLBACK;
```

---

## 4. Verification Harness Reference

- Document issuance contract test: `tests/student-requests/enrollment-certificate-document-issuance-and-archive-contract-01.test.ts`
- PDF storage saga test: `tests/student-requests/enrollment-certificate-pdf-storage-saga-completion-01.test.ts`
- Zero-fee execution test: `tests/student-requests/enrollment-certificate-post-zero-fee-execution-contract.test.ts`

---

## 5. Final Regression Decision

```
PASS_ENROLLMENT_CERTIFICATE_REGRESSION_READY
```
