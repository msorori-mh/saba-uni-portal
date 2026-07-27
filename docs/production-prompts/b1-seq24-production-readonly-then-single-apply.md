# SEQ24 — Lovable Production Prompt (DOCUMENTATION ONLY — DO NOT RUN FROM THIS TRACK)

**NOT AUTHORIZED BY THE OVERNIGHT SOURCE TRACK.** Requires separate human approvals.

Production ref: `wpmicqriltrowwonknox`
TEST marker: `TEST_ONLY_FIRST_DELIVERY_5_SERVICES`

## Binding identity

| Field | Value |
|---|---|
| Order | 24 |
| File | `supabase/migrations/20260725160000_b1_24_file_withdrawal_impact_ack_null_guard_01.sql` |
| LF SHA-256 | `67257aa9201538b1a4691ec4602e1ae4dcbd7a2f2b511dcac1da8a714ae9d70b` |
| Preflight | `docs/migration-drafts/b1-backend-verifiers/24-B1_24_FILE_WITHDRAWAL_IMPACT_ACK_NULL_GUARD_01-PREFLIGHT.sql` |
| Post-verifier | `docs/migration-drafts/b1-backend-verifiers/24-B1_24_FILE_WITHDRAWAL_IMPACT_ACK_NULL_GUARD_01-POST-VERIFIER.sql` |


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

1. Apply **exactly one** file: `20260725160000_b1_24_file_withdrawal_impact_ack_null_guard_01.sql`
2. Forbid: `--include-all`, batch, next migration, Gate 25, activation, `student_visible`, Deploy/Publish, repair, manual history insert.
3. History must gain this version once (for SQL migrations).

## Step C — Post-verifier + stop

1. Run post-verifier (READ ONLY / ROLLBACK).
2. Re-check protected records + hidden services.
3. **STOP.** Do not apply the next migration in the same session.

## Notes

Null-safe impact_acknowledgment / terms_acknowledgment guards. Activation gate remains 25.
