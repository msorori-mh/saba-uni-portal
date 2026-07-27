# SEQ07-B Production Read-Only G4 Prompt (Lovable)

**DOCUMENTATION ONLY — DO NOT EXECUTE FROM THE OVERNIGHT SOURCE TRACK.**

Production project ref (binding): `wpmicqriltrowwonknox`

Marker: `TEST_ONLY_FIRST_DELIVERY_5_SERVICES`

## Mission

Read-only Production probe before any B0/B1 apply. Zero DDL/DML. Prefer SQL that ends with `ROLLBACK` or catalog SELECTs only.

## Must prove

1. Ref = `wpmicqriltrowwonknox`.
2. Original SEQ07 version `20260725110000` is **not** applied (and must not be falsely claimed APPLIED).
3. SEQ07-B version `20260725110050` is **not** applied.
4. No partial objects for secure attachments:
   - `public.student_request_attachment_uploads` absent
   - intent/download RPCs absent
   - no attachment identity trigger
   - no storage INSERT policy for the secure bucket
5. Bucket `student-request-secure-attachments` **absent**.
6. No conflicting functions/triggers/policies for the attachment surface.
7. Prior dependencies present (atomic submit + payment confirmation foundations as previously attested).
8. Five services hidden: `enrollment_suspension`, `excused_absence`, `department_transfer`, `final_chance`, `file_withdrawal` — draft/inactive/not student_visible as applicable.
9. Requests for those five codes = 0.
10. Protected records unchanged:
    - SR-20260716-26BAD4C8
    - SR-20260715-FEDCB3E1
    - SR-20260713-2DE64041
    - USR-2026-000001
    - USR-2026-000002
11. SEQ08→SEQ24 not applied.
12. No divergent content registered under version `20260725110050`.
13. No anon EXECUTE on attachment RPCs (objects absent ⇒ deny-by-default).
14. No public bucket named for secure attachments.
15. No broad admin/registrar/dean bypass on student-request actor path.

## Output format

Return a single decision:

- `PASS_B1_SEQ07_B_PRODUCTION_RO_G4` with evidence table, or
- `HOLD_B1_SEQ07_B_PRODUCTION_RO_<EXACT_FAILURE>`

## Forbidden

Any write, bucket create, migration apply, repair, Deploy, Publish, activation, `student_visible` change.
