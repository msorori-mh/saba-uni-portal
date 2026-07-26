# PORTAL-B1-SEQ07-PRODUCTION-READONLY-G4-01

## Mode

**SELECT / catalog only.**  
Forbidden: DDL, DML, `CALL`/`SELECT` of any write RPC, migration apply, history repair, Deploy/Publish, activation, `student_visible` changes.

Target: Supabase Production `wpmicqriltrowwonknox` (PostgreSQL 17).

## Binding identity

| Field | Value |
|---|---|
| Sequence | **SEQ07 only** (PROMOTION-MAP `order` 7) |
| Promoted migration | `supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql` |
| LF SHA-256 | `66ba4c96c23c44bbcca62de28360d806ee6ff5dbd358a20f2e181b9a8fd6bca8` |
| Preflight companion | `docs/migration-drafts/b1-backend-verifiers/07-B1_07_SECURE_ATTACHMENTS_SOURCE_01-PREFLIGHT.sql` (ends `ROLLBACK`) |
| Post-verifier companion | `docs/migration-drafts/b1-backend-verifiers/07-B1_07_SECURE_ATTACHMENTS_SOURCE_01-POST-VERIFIER.sql` (ends `ROLLBACK`) |

Do **not** inspect or apply SEQ08→SEQ24 in this prompt.

## Required checks (return PASS/FAIL + raw evidence rows)

### A — Migration history

1. Confirm version `20260725110000` is **absent** from `supabase_migrations.schema_migrations`.
2. Confirm latest applied version remains `20260725002136` (or document if moved; do not repair).
3. Confirm no rows matching `%b1_07_secure_attachments%`.

### B — No partial SEQ07 creation

For each object, expect **ABSENT** (or document unexpected presence):

- Relation `public.student_request_attachment_uploads`
- Trigger `protect_student_request_attachment_identity`
- Functions:
  - `create_student_request_attachment_upload_intent(uuid,text,text,text,bigint,text)`
  - `complete_student_request_attachment_upload(uuid)`
  - `assert_required_student_request_attachments(uuid,uuid[])`
  - `submit_student_request_with_secure_attachments(uuid,uuid[])`
  - `list_my_student_request_attachments(uuid)`
  - `get_owned_student_request_attachment_upload(uuid)`
  - `reject_student_request_attachment(uuid,text)`
  - `authorize_student_request_attachment_download(uuid)`
  - `protect_student_request_attachment_identity()`
- Storage policy `secure_attachment_insert` on `storage.objects`
- Conflicting table with same name but different columns/constraints

Also report whether bucket `student-request-secure-attachments` exists and if present: `public`, `file_size_limit`, `allowed_mime_types`. Expected pre-SEQ07: **absent** (or document drift).

### C — Prior dependencies present (SEQ07 preflight)

- `public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])` exists
- `public.record_external_university_payment_confirmation(uuid,text)` exists
- `storage.buckets` / `storage.objects` exist
- `public.student_requests`, `public.student_profiles` exist
- `public.log_audit` callable shape used by SEQ07 remains available (presence only)

### D — Grants / policies conflicts

- No unexpected `GRANT` on `student_request_attachment_uploads` (table should not exist)
- No anon EXECUTE on the eight SEQ07 RPCs (should not exist)
- No public Storage URLs / public=true on a bucket named `student-request-secure-attachments` if the bucket unexpectedly exists

### E — Five B1 services still hidden + zero requests

For codes: `enrollment_suspension`, `excused_absence`, `department_transfer`, `final_chance`, `file_withdrawal`:

- `student_visible = false`
- active workflow count = 0 (or inactive/draft only)
- `student_requests` count = 0

### F — Protected records (non-sensitive digests only)

Exactly one row each; return `status`, `updated_at`, `md5(status||updated_at)`:

- `SR-20260716-26BAD4C8`
- `SR-20260715-FEDCB3E1`
- `SR-20260713-2DE64041`
- `USR-2026-000001`
- `USR-2026-000002`

Compare to prior SEQ21 G4 baseline digests if available; flag any delta.

### G — Non-write attestation

Explicitly confirm: no DDL/DML, no migration apply, no Deploy, no activation.

## Output format

Return a short Markdown report titled `PORTAL-B1-SEQ07-PRODUCTION-READONLY-G4-01-RESULT` with tables for A–F and a final line:

`DECISION=PASS_SEQ07_PROD_RO` or `DECISION=FAIL_SEQ07_PROD_RO:<reason>`.
