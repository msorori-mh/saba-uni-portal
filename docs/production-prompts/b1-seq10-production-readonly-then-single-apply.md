# SEQ10 — Lovable Production Prompt (DOCUMENTATION ONLY — DO NOT RUN FROM THIS TRACK)

**NOT AUTHORIZED BY THE OVERNIGHT SOURCE TRACK.** Requires separate human approvals.

Production ref: `wpmicqriltrowwonknox`
TEST marker: `TEST_ONLY_FIRST_DELIVERY_5_SERVICES`

## Binding identity

| Field | Value |
|---|---|
| Order | 10 |
| File | `supabase/migrations/20260725110300_b1_10_excused_absence_detail_05a.sql` |
| LF SHA-256 | `ff61ae4a400b2b7d9dfbbec03212d04032103d5343f54a4ad42e274cbb9ab505` |
| Preflight | `docs/migration-drafts/b1-backend-verifiers/10-B1_10_EXCUSED_ABSENCE_DETAIL_05A-PREFLIGHT.sql` |
| Post-verifier | `docs/migration-drafts/b1-backend-verifiers/10-B1_10_EXCUSED_ABSENCE_DETAIL_05A-POST-VERIFIER.sql` |

## ACL note (sandbox_exec)

Production may show `sandbox_exec` table privileges on `absence_excuse_details` before SEQ10.
That state is **remediable** by this migration (explicit `REVOKE ALL ... FROM sandbox_exec` when the role exists).
`sandbox_exec` is **never** in the final allowlist. Any other unexpected grantee remains fail-closed.

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
   - ACL: only owner / authenticated SELECT / service_role SELECT / remediable `sandbox_exec` (no other grantees)
4. STOP if any check fails.

## Step B — Single migration apply (separate approval)

1. Apply **exactly one** file: `20260725110300_b1_10_excused_absence_detail_05a.sql`
2. Forbid: `--include-all`, batch, next migration, Gate 25, activation, `student_visible`, Deploy/Publish, repair, manual history insert.
3. History must gain this version once (for SQL migrations).

## Step C — Post-verifier + stop

1. Run post-verifier (READ ONLY / ROLLBACK).
2. Re-check protected records + hidden services.
3. **STOP.** Do not apply the next migration in the same session.

## Notes

Forward-only. Remediation by reviewed forward package only.
