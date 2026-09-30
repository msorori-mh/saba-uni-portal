# B1 First Delivery Positive Authorization Matrix 27

> **Mode**: SOURCE-ONLY Positive Matrix Plan & Specification
> **Baseline Commit**: `d35612906b2d3ad4d059623b02e5862aa42ab9db`
> **Migration Head**: `20260801021541`
> **Fixtures Scope**: 19 Active Fixture Steps across 5 B1 Services (TEST_ONLY_B1_FIXTURE_13)
> **Matrix Status**: PASS_POSITIVE_AUTHORIZATION_MATRIX_READY

---

## 1. Overview & Authorized Roles

The **Positive Authorization Matrix (Pack 27)** defines the exact, positive authorization pathways for all active fixture steps in `tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json`. Every active step permits **exactly ONE actor** with **exactly ONE configured action code**.

### Designated Schema Processing Roles & Principal User IDs

| Unit | Processing Role (`role`) | Authoritative Principal User ID | Role Scope |
|---|---|---|---|
| `student_affairs` | `student_affairs_specialist` | `c8a94548-4782-4252-86f9-23559d3b95bd` | Academic intake & record application |
| `student_affairs` | `student_affairs_manager` | `aac0e62d-4e8b-4440-b649-caa388d34837` | Managerial review & clearance |
| `department` | `department_head` (source) | `d4aaa5c9-72d1-4996-b0e8-d30c6327da6e` | Source department approval |
| `department` | `department_head` (target) | `97acbe02-c59c-409c-8d51-7d4ef72e6db7` | Target department approval |
| `dean` | `dean` | `b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0` | Faculty dean decision |
| `library` | `library_officer` | `e7a93314-bb06-4525-b412-5315198c668a` | Library clearance |
| `labs` | `labs_manager` | `67b39ee4-4918-4b00-b4cc-0d5046ac8a5a` | Labs clearance |
| `finance` | `revenue_finance_officer` | `79783c0f-8d95-4110-8239-0ac504d63a24` | External payment confirmation / clearance |
| `registrar` | `registrar_general` | `4c261c1c-97fb-42da-a544-e8a59853ebe3` | Final registrar decision application |
| `archive` | `archive_officer` | `aec1303e-de6a-4580-94cf-7205c17b5535` | File archiving |

---

## 2. Service-by-Service Positive Step Matrix (Authoritative Identities)

### A. Department Transfer (`department_transfer`)
- **Request Number**: `SR-20260727-88D885F0`

| Step # | Step Key | Runtime Step UUID | Unit | Allowed Role | Configured Action | Target RPC | Authoritative Principal User ID |
|---|---|---|---|---|---|---|---|
| 1 | `student_affairs_intake` | `6ae588d1-b8e4-4686-b4a4-78857ce04e22` | `student_affairs` | `student_affairs_specialist` | `review` | `act_on_b1_student_request_step_atomic` | `c8a94548-4782-4252-86f9-23559d3b95bd` |
| 2 | `source_department_head_approval` | `6b224eb7-7720-42e4-bb08-ad3c2bd1c0f3` | `department` | `department_head` | `approve` | `act_on_b1_student_request_step_atomic` | `d4aaa5c9-72d1-4996-b0e8-d30c6327da6e` |
| 3 | `target_department_head_approval` | `dd1360de-d3a1-49e8-9a67-876506b27150` | `department` | `department_head` | `approve` | `act_on_b1_student_request_step_atomic` | `97acbe02-c59c-409c-8d51-7d4ef72e6db7` |
| 4 | `dean_approval` | `b75dff6d-f8ba-4654-b4ce-f8986d90dbcc` | `dean` | `dean` | `approve` | `act_on_b1_student_request_step_atomic` | `b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0` |
| 5 | `payment_confirmation` | `4b55d00e-1827-4347-8a61-ed4658f63fa5` | `finance` | `revenue_finance_officer` | `confirm_payment` | `record_external_university_payment_confirmation` | `79783c0f-8d95-4110-8239-0ac504d63a24` |
| 6 | `registrar_apply` | `ab2ee336-a6c0-4c86-a9b1-a8a31aa476c4` | `registrar` | `registrar_general` | `apply_decision` | `act_on_b1_student_request_step_atomic` | `4c261c1c-97fb-42da-a544-e8a59853ebe3` |

---

### B. Enrollment Suspension (`enrollment_suspension`)
- **Request Number**: `SR-20260727-50BEDCE2`

| Step # | Step Key | Runtime Step UUID | Unit | Allowed Role | Configured Action | Target RPC | Authoritative Principal User ID |
|---|---|---|---|---|---|---|---|
| 1 | `initial_review` | `6e7855cb-ed60-4c24-8f82-7fe9c69b4216` | `student_affairs` | `student_affairs_specialist` | `review` | `act_on_b1_student_request_step_atomic` | `c8a94548-4782-4252-86f9-23559d3b95bd` |
| 2 | `manager_approval` | `70614d9a-d916-4b33-a7e0-b3ceae082705` | `student_affairs` | `student_affairs_manager` | `approve` | `act_on_b1_student_request_step_atomic` | `aac0e62d-4e8b-4440-b649-caa388d34837` |
| 3 | `registrar_apply` | `53f1aeb6-0475-4753-8c44-3495962cbe3a` | `registrar` | `registrar_general` | `apply_decision` | `act_on_b1_student_request_step_atomic` | `4c261c1c-97fb-42da-a544-e8a59853ebe3` |

---

### C. Excused Absence (`excused_absence`)
- **Request Number**: `SR-20260727-695EC35B`

| Step # | Step Key | Runtime Step UUID | Unit | Allowed Role | Configured Action | Target RPC | Authoritative Principal User ID |
|---|---|---|---|---|---|---|---|
| 1 | `student_affairs_intake` | `44b1d694-2015-412e-86e3-235116a710b2` | `student_affairs` | `student_affairs_specialist` | `review` | `act_on_b1_student_request_step_atomic` | `c8a94548-4782-4252-86f9-23559d3b95bd` |
| 2 | `manager_review` | `7db4eacc-d542-459b-a066-46a54c2e325b` | `student_affairs` | `student_affairs_manager` | `approve` | `act_on_b1_student_request_step_atomic` | `aac0e62d-4e8b-4440-b649-caa388d34837` |
| 3 | `record_apply` | `b7c0f4d2-1565-4af7-9196-45bf87a1baed` | `student_affairs` | `student_affairs_specialist` | `apply_decision` | `act_on_b1_student_request_step_atomic` | `c8a94548-4782-4252-86f9-23559d3b95bd` |

---

### D. File Withdrawal (`file_withdrawal`)
- **Request Number**: `SR-20260727-42393846`

| Step # | Step Key | Runtime Step UUID | Unit | Allowed Role | Configured Action | Target RPC | Authoritative Principal User ID |
|---|---|---|---|---|---|---|---|
| 1 | `student_affairs_intake` | `38fffaa0-6240-4d67-a47a-6cf1f450a46c` | `student_affairs` | `student_affairs_specialist` | `review` | `act_on_b1_student_request_step_atomic` | `c8a94548-4782-4252-86f9-23559d3b95bd` |
| 2 | `library_clearance` | `1830c0f2-3503-4cf8-af49-246623b2be33` | `library` | `library_officer` | `clear` | `act_on_b1_student_request_step_atomic` | `e7a93314-bb06-4525-b412-5315198c668a` |
| 3 | `labs_clearance` | `c00ce6ba-9c3f-440d-9664-f18341bc52e5` | `labs` | `labs_manager` | `clear` | `act_on_b1_student_request_step_atomic` | `67b39ee4-4918-4b00-b4cc-0d5046ac8a5a` |
| 4 | `activities_clearance` | `884ec9d9-4b55-49af-bc12-478b53ae5e2a` | `student_affairs` | `student_affairs_manager` | `clear` | `act_on_b1_student_request_step_atomic` | `aac0e62d-4e8b-4440-b649-caa388d34837` |
| 5 | `finance_clearance` | `80f23452-2505-4a0d-9a0c-53469645ed4d` | `finance` | `revenue_finance_officer` | `clear` | `act_on_b1_student_request_step_atomic` | `79783c0f-8d95-4110-8239-0ac504d63a24` |
| 6 | `registrar_apply` | `0111b914-4783-4418-b6ac-587cab06fed1` | `registrar` | `registrar_general` | `apply_decision` | `act_on_b1_student_request_step_atomic` | `4c261c1c-97fb-42da-a544-e8a59853ebe3` |
| 7 | `archive` | `39daa476-4014-4403-a925-41da710180ee` | `archive` | `archive_officer` | `archive` | `act_on_b1_student_request_step_atomic` | `aec1303e-de6a-4580-94cf-7205c17b5535` |

---

### E. Final Chance (`final_chance`)
- **Request Number**: `SR-20260727-3C550070`

| Step # | Step Key | Runtime Step UUID | Unit | Allowed Role | Configured Action | Target RPC | Authoritative Principal User ID |
|---|---|---|---|---|---|---|---|
| 1 | `student_affairs_intake` | `39931cd9-c0ca-4a0c-bdba-16dde7ae1145` | `student_affairs` | `student_affairs_specialist` | `review` | `act_on_b1_student_request_step_atomic` | `c8a94548-4782-4252-86f9-23559d3b95bd` |
| 2 | `manager_review` | `12d31b1b-c84a-47ac-ac0b-ce4027d4fa4e` | `student_affairs` | `student_affairs_manager` | `approve` | `act_on_b1_student_request_step_atomic` | `aac0e62d-4e8b-4440-b649-caa388d34837` |
| 3 | `dean_decision` | `4a9bfb3f-18f2-4cf8-bcf1-7051420c8dcc` | `dean` | `dean` | `approve` | `act_on_b1_student_request_step_atomic` | `b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0` |
| 4 | `payment_confirmation` | `55c927de-6b10-4e48-ad56-df3b406a10dd` | `finance` | `revenue_finance_officer` | `confirm_payment` | `record_external_university_payment_confirmation` | `79783c0f-8d95-4110-8239-0ac504d63a24` |
| 5 | `registrar_apply` | `6761a1c5-eb21-4e7a-9cc0-a9c1e011d5b4` | `registrar` | `registrar_general` | `apply_decision` | `act_on_b1_student_request_step_atomic` | `4c261c1c-97fb-42da-a544-e8a59853ebe3` |

---

## 3. Alternative Action Denial Proof

To guarantee authorization tightness, every valid actor must be tested against ALL other configured actions.

For example, when `department_head` (source) `d4aaa5c9-72d1-4996-b0e8-d30c6327da6e` is caller on step `6b224eb7-7720-42e4-bb08-ad3c2bd1c0f3`:
- Calling `approve` $\rightarrow$ **ALLOWED (200 OK)**
- Calling `review` $\rightarrow$ **DENIED (`STEP_ACTION_NOT_ALLOWED`)**
- Calling `clear` $\rightarrow$ **DENIED (`STEP_ACTION_NOT_ALLOWED`)**
- Calling `confirm_payment` $\rightarrow$ **DENIED (`STEP_ACTION_NOT_ALLOWED`)**
- Calling `apply_decision` $\rightarrow$ **DENIED (`STEP_ACTION_NOT_ALLOWED`)**

Every single positive step has an accompanying negative isolation test in `MATRIX.json` asserting that non-matching action codes fail-closed.
