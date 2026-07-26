# 01 — Production baseline (read-only)

| Field | Value |
|---|---|
| Project ref | `wpmicqriltrowwonknox` |
| Marker | `TEST_ONLY_FIRST_DELIVERY_5_SERVICES` |
| Protected | SR-20260716-26BAD4C8, SR-20260715-FEDCB3E1, SR-20260713-2DE64041, USR-2026-000001, USR-2026-000002 |
| Five services | enrollment_suspension, excused_absence, department_transfer, final_chance, file_withdrawal — must remain hidden until Gate 25 |
| Protected live service | `enrollment_certificate` |

## Required RO proofs before any apply

- Original SEQ07 (`66ba4c96c23c44bbcca62de28360d806ee6ff5dbd358a20f2e181b9a8fd6bca8`) not applied / not falsely APPLIED
- SEQ07-B (`a49d615b11949f3c8594b282d2241e9dbd2d7be42d37bb5ac4b1d1952ddd4eec`) not applied
- Bucket `student-request-secure-attachments` absent (or exact private contract only after B0)
- No partial attachment objects/functions/policies
- SEQ08→24 absent
- Five-service requests = 0
- Digests of protected records stable

PASS code: `PASS_FIRST_DELIVERY_PRODUCTION_BASELINE_RO`
HOLD prefix: `HOLD_FIRST_DELIVERY_BASELINE_`
