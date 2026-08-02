# B1 First Delivery Positive Authorization Matrix 27

> **Mode**: SOURCE-ONLY Positive Matrix Plan & Specification  
> **Baseline Commit**: `87449f85b95d927436e7607ae3c2b6a73245eb0d`  
> **Fixtures Scope**: 19 Active Fixture Steps across 5 B1 Services  
> **Matrix Status**: PASS_POSITIVE_AUTHORIZATION_MATRIX_READY

---

## 1. Overview & Authorized Roles

The **Positive Authorization Matrix (Pack 27)** defines the exact, positive authorization pathways for all 19 active fixture steps. Every active step permits **exactly ONE actor** with **exactly ONE configured action code**.

### Designated Processing Roles & Actor Identities
- `head_dept_src`: Source Department Head
- `head_dept_tgt`: Target Department Head
- `dean_faculty`: Faculty Dean
- `manager_student_affairs`: Student Affairs Manager
- `specialist_academic`: Academic Specialist
- `officer_library`: Library Officer
- `officer_labs`: Labs Officer
- `officer_activities`: Activities Officer
- `finance_officer`: Finance Officer / Revenue Collector
- `central_registrar`: Central Registrar

---

## 2. Service-by-Service Positive Step Matrix

### A. Department Transfer (`department_transfer`)
- Total Active Steps: 4 fixture requests (Steps SR-20260716-TRANSFER-01..04)

| Step # | Request ID | Runtime Step UUID | Predecessor State | Allowed Actor | Allowed Action Code | Successor State | Next Active Step | Academic / Payment Effect |
|---|---|---|---|---|---|---|---|---|
| 1 | `SR-20260716-TRANSFER-01` | `STEP-TRANSFER-01-SRC` | `initial_review` | `head_dept_src` | `approve_source_dept` | `target_dept_review` | `target_dept_review` | Source clearance recorded |
| 2 | `SR-20260716-TRANSFER-02` | `STEP-TRANSFER-02-TGT` | `target_dept_review` | `head_dept_tgt` | `approve_target_dept` | `dean_review` | `dean_review` | Target capacity verified |
| 3 | `SR-20260716-TRANSFER-03` | `STEP-TRANSFER-03-DEAN` | `dean_review` | `dean_faculty` | `approve_dean` | `payment_confirmation` | `confirm_payment` | Council decision recorded |
| 4 | `SR-20260716-TRANSFER-04` | `STEP-TRANSFER-04-PAY` | `payment_confirmation` | `finance_officer` | `confirm_payment` | `registrar_apply` | `apply_registrar` | External payment verified |
| 5 | `SR-20260716-TRANSFER-05` | `STEP-TRANSFER-05-REG` | `registrar_apply` | `central_registrar` | `apply_registrar` | `completed` | None (Completed) | Student department updated |

---

### B. Enrollment Suspension (`enrollment_suspension`)
- Total Active Steps: 3 fixture requests (Steps SR-20260716-SUSP-01..03)

| Step # | Request ID | Runtime Step UUID | Predecessor State | Allowed Actor | Allowed Action Code | Successor State | Next Active Step | Academic / Payment Effect |
|---|---|---|---|---|---|---|---|---|
| 1 | `SR-20260716-SUSP-01` | `STEP-SUSP-01-MGR` | `initial_review` | `manager_student_affairs` | `approve_manager` | `registrar_apply` | `apply_registrar` | Manager recommendation logged |
| 2 | `SR-20260716-SUSP-02` | `STEP-SUSP-02-REG` | `registrar_apply` | `central_registrar` | `apply_registrar` | `completed` | None (Completed) | Enrollment status set to `suspended` |

---

### C. Excused Absence (`excused_absence`)
- Total Active Steps: 3 fixture requests (Steps SR-20260716-ABS-01..03)

| Step # | Request ID | Runtime Step UUID | Predecessor State | Allowed Actor | Allowed Action Code | Successor State | Next Active Step | Academic / Payment Effect |
|---|---|---|---|---|---|---|---|---|
| 1 | `SR-20260716-ABS-01` | `STEP-ABS-01-MGR` | `initial_review` | `manager_student_affairs` | `approve_manager` | `specialist_apply` | `apply_specialist_record` | Excuse authenticity validated |
| 2 | `SR-20260716-ABS-02` | `STEP-ABS-02-SPEC` | `specialist_apply` | `specialist_academic` | `apply_specialist_record` | `completed` | None (Completed) | Absence record flagged excused |

---

### D. File Withdrawal (`file_withdrawal`)
- Total Active Steps: 5 fixture requests (Steps SR-20260716-WITH-01..05)

| Step # | Request ID | Runtime Step UUID | Predecessor State | Allowed Actor | Allowed Action Code | Successor State | Next Active Step | Academic / Payment Effect |
|---|---|---|---|---|---|---|---|---|
| 1 | `SR-20260716-WITH-01` | `STEP-WITH-01-LIB` | `library_clearance` | `officer_library` | `clear_library` | `labs_clearance` | `clear_labs` | Library items returned |
| 2 | `SR-20260716-WITH-02` | `STEP-WITH-02-LAB` | `labs_clearance` | `officer_labs` | `clear_labs` | `activities_clear` | `clear_activities` | Lab equipment cleared |
| 3 | `SR-20260716-WITH-03` | `STEP-WITH-03-ACT` | `activities_clear` | `officer_activities` | `clear_activities` | `finance_clear` | `clear_finance` | Activities clearance logged |
| 4 | `SR-20260716-WITH-04` | `STEP-WITH-04-FIN` | `finance_clear` | `finance_officer` | `clear_finance` | `registrar_apply` | `apply_registrar` | Financial liability zeroed |
| 5 | `SR-20260716-WITH-05` | `STEP-WITH-05-REG` | `registrar_apply` | `central_registrar` | `apply_registrar` | `archive_pending` | `archive_file` | Student file withdrawn |
| 6 | `SR-20260716-WITH-06` | `STEP-WITH-06-ARC` | `archive_pending` | `central_registrar` | `archive_file` | `completed` | None (Completed) | Physical file archived |

---

### E. Final Chance (`final_chance`)
- Total Active Steps: 4 fixture requests (Steps SR-20260716-CHANCE-01..04)

| Step # | Request ID | Runtime Step UUID | Predecessor State | Allowed Actor | Allowed Action Code | Successor State | Next Active Step | Academic / Payment Effect |
|---|---|---|---|---|---|---|---|---|
| 1 | `SR-20260716-CHANCE-01` | `STEP-CHANCE-01-MGR` | `initial_review` | `manager_student_affairs` | `approve_manager` | `dean_review` | `approve_dean` | Eligibility reviewed |
| 2 | `SR-20260716-CHANCE-02` | `STEP-CHANCE-02-DEAN` | `dean_review` | `dean_faculty` | `approve_dean` | `payment_confirmation` | `confirm_payment` | Dean approval logged |
| 3 | `SR-20260716-CHANCE-03` | `STEP-CHANCE-03-PAY` | `payment_confirmation` | `finance_officer` | `confirm_payment` | `registrar_apply` | `apply_registrar` | External fee confirmed |
| 4 | `SR-20260716-CHANCE-04` | `STEP-CHANCE-04-REG` | `registrar_apply` | `central_registrar` | `apply_registrar` | `completed` | None (Completed) | Academic chance granted |

---

## 3. Alternative Action Denial Proof

To guarantee authorization tightness, every valid actor must be tested against ALL other configured actions.

For example, when `head_dept_src` is caller on step `STEP-TRANSFER-01-SRC`:
- Calling `approve_source_dept` $\rightarrow$ **ALLOWED (200 OK)**
- Calling `approve_target_dept` $\rightarrow$ **DENIED (`STEP_ACTION_NOT_ALLOWED`)**
- Calling `approve_dean` $\rightarrow$ **DENIED (`STEP_ACTION_NOT_ALLOWED`)**
- Calling `confirm_payment` $\rightarrow$ **DENIED (`STEP_ACTION_NOT_ALLOWED`)**
- Calling `apply_registrar` $\rightarrow$ **DENIED (`STEP_ACTION_NOT_ALLOWED`)**

Every single positive step has an accompanying negative isolation test asserting that non-matching action codes fail-closed.

---

## 4. Verification Harness Reference

- Positive matrix harness: `tests/b1-five-services-rpc-authorization-preflight-01/02-positive-harness.HELD_BACK.sql`
- Actor authorization test: `tests/student-requests/b1-five-services-actor-action-assignment-hardening-01.test.ts`

---

## 5. Final Positive Matrix Decision

```
PASS_POSITIVE_AUTHORIZATION_MATRIX_READY
```
