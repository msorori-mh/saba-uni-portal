# G5 — Payment blockers (TEST_ONLY plan, NOT executed)

## Payment steps in scope (exactly two)

| Service | Request | Step | Order | Unit / Role | RPC | Runtime step id |
|---|---|---|---|---|---|---|
| `final_chance` | SR-20260727-3C550070 | `payment_confirmation` | 4 of 5 | `finance` / `revenue_finance_officer` | `record_external_university_payment_confirmation(p_step_id, p_note)` | `55c927de-6b10-4e48-ad56-df3b406a10dd` |
| `department_transfer` | SR-20260727-88D885F0 | `payment_confirmation` | 5 of 6 | `finance` / `revenue_finance_officer` | `record_external_university_payment_confirmation(p_step_id, p_note)` | `4b55d00e-1827-4347-8a61-ed4658f63fa5` |

Directly assigned revenue officer (single, active, no duplicate):
**فارس اليوسفي** — user `79783c0f-8d95-4110-8239-0ac504d63a24`, staff profile `233c9c36-29de-4352-9db3-938a89efe897`.

## Current production state

`student_request_fee_assessments` holds **3 rows, all `enrollment_certificate`** (SR-20260713-2DE64041, SR-20260715-FEDCB3E1, SR-20260716-26BAD4C8 — protected, untouched).
**Zero** fee assessment rows exist for either B1 request. No fee was created by this preflight.

## Blocker

Both payment steps require a prior `pending_payment` assessment before the assigned revenue officer can confirm. Creating it is a DML write and is out of scope for a read-only preflight.

## Prepared TEST_ONLY plan (write approval required)

Per request, exactly once:

- `assess_student_request_fee(p_request_id, 20.00, p_notes)` — **20.00 YER**, one assessment only, resulting `payment_status = pending_payment`.
- `payment_reference` (test-only, distinct per request, no gateway, no receipt, no revenue):
  - `final_chance` → `TEST_ONLY_B1_FC_3C550070`
  - `department_transfer` → `TEST_ONLY_B1_DT_88D885F0`
- Confirmation only by the directly assigned revenue officer above, via the step RPC. No admin, no finance-role-without-assignment.
- No payment gateway, no collection, no real revenue, no receipt document, no `payment_receipts` row.
- No change to the 3 protected `enrollment_certificate` assessments.

## Classification

`READY_AFTER_SEPARATE_WRITE_APPROVAL` — for both cases.
