# SEQ07-B — Lovable Production Prompt (DOCUMENTATION ONLY — DO NOT RUN FROM THIS TRACK)

**NOT AUTHORIZED BY THE OVERNIGHT SOURCE TRACK.** Requires separate human approvals.

Production ref: `wpmicqriltrowwonknox`
TEST marker: `TEST_ONLY_FIRST_DELIVERY_5_SERVICES`

## Binding identity

| Field | Value |
|---|---|
| Order | 7B |
| File | `supabase/migrations/20260725110050_b1_07b_secure_attachments_sql_only_01.sql` |
| LF SHA-256 | `a49d615b11949f3c8594b282d2241e9dbd2d7be42d37bb5ac4b1d1952ddd4eec` |
| Preflight | `docs/migration-drafts/b1-backend-verifiers/07B-B1_07B_SECURE_ATTACHMENTS_SQL_ONLY_01-PREFLIGHT.sql` |
| Post-verifier | `docs/migration-drafts/b1-backend-verifiers/07B-B1_07B_SECURE_ATTACHMENTS_SQL_ONLY_01-POST-VERIFIER.sql` |

## Prerequisite (non-migration)

B0 Lovable Storage tool: create private bucket student-request-secure-attachments (public=false, 5MiB, pdf/jpeg/png) BEFORE applying 7B

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

1. Apply **exactly one** file: `20260725110050_b1_07b_secure_attachments_sql_only_01.sql`
2. Forbid: `--include-all`, batch, next migration, Gate 25, activation, `student_visible`, Deploy/Publish, repair, manual history insert.
3. History must gain this version once (for SQL migrations).

## Step C — Post-verifier + stop

1. Run post-verifier (READ ONLY / ROLLBACK).
2. Re-check protected records + hidden services.
3. **STOP.** Do not apply the next migration in the same session.

## Notes

Forward-only alternate for Lovable Cloud. Equivalent SQL objects to order 7 minus bucket upsert. History version is 20260725110050 only — never reuse 20260725110000 for different bytes. SEQ08 predecessor becomes object-level (uploads table + private bucket) satisfied by 7B.
