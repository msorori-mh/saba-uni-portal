# SEQ23 — Lovable Production Prompt (DOCUMENTATION ONLY — DO NOT RUN FROM THIS TRACK)

**NOT AUTHORIZED BY THE OVERNIGHT SOURCE TRACK.** Requires separate human approvals.

Production ref: `wpmicqriltrowwonknox`
TEST marker: `TEST_ONLY_FIRST_DELIVERY_5_SERVICES`

## Binding identity

| Field | Value |
|---|---|
| Order | 23 |
| File | `supabase/migrations/20260725150000_b1_23_transfer_department_scope_position_assignment_01.sql` |
| LF SHA-256 | `4bc35f9b1e17c9dc6155b6b7c26d4ba6b8cf203297e66bcf9c8771e358130c85` |
| Preflight | `docs/migration-drafts/b1-backend-verifiers/23-B1_23_TRANSFER_DEPARTMENT_SCOPE_POSITION_ASSIGNMENT_01-PREFLIGHT.sql` |
| Post-verifier | `docs/migration-drafts/b1-backend-verifiers/23-B1_23_TRANSFER_DEPARTMENT_SCOPE_POSITION_ASSIGNMENT_01-POST-VERIFIER.sql` |


## Step A — Read-only preflight (ROLLBACK)

1. Confirm Production project ref = `wpmicqriltrowwonknox`.
2. Run ONLY the preflight SQL (READ ONLY / ends with ROLLBACK).
3. Confirm:
   - predecessor objects present
   - this version not already applied with different bytes
   - five services still hidden (`draft` / inactive / not student_visible)
   - five-service request counts = 0
   - protected records unchanged: SR-20260716-26BAD4C8, SR-20260715-FEDCB3E1, SR-20260713-2DE64041, USR-2026-000001, USR-2026-000002
   - no anon privileges / no public bucket / no broad bypass
4. STOP if any check fails.

## Step B — Single migration apply (separate approval)

1. Apply **exactly one** file: `20260725150000_b1_23_transfer_department_scope_position_assignment_01.sql`
2. Forbid: `--include-all`, batch, next migration, Gate 25, activation, `student_visible`, Deploy/Publish, repair, manual history insert.
3. History must gain this version once (for SQL migrations).

## Step C — Post-verifier + stop

1. Run post-verifier (READ ONLY / ROLLBACK).
2. Re-check protected records + hidden services.
3. **STOP.** Do not apply the next migration in the same session.

## Notes

Aligns transfer department scope with position_assignment assignees required by submit/init. Activation gate remains 25.
