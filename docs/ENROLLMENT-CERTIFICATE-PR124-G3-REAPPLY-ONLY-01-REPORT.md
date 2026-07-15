# ENROLLMENT_CERTIFICATE_PR124_G3_REAPPLY_ONLY_01 — Execution Report

## Final Decision

**PASS_ENROLLMENT_CERTIFICATE_PR124_G3_REAPPLIED_AND_VERIFIED_NO_WORKER_NO_E2E_NO_DEPLOY**

## Environment
- Repo: `msorori-mh/saba-uni-portal`
- main HEAD (expected & used): `9c8467591508f8615cc03ceb4cf7148f83a4263e`
- Lovable Project: `4b291119-790f-4484-9285-c2b774e1ba6f`
- Supabase Production Project: `wpmicqriltrowwonknox`
- Executed at: 2026-07-15 (UTC)

## G0 — Code Sync Verification
- File `supabase/migrations/20260714010000_enrollment_certificate_pdf_storage_saga_completion_01.sql` present in Lovable workspace.
- Occurrences of `undefined_schema`: **0** (verified via `grep`).
- Both fixed handlers present: `WHEN undefined_function OR invalid_schema_name THEN` at lines 143 (`public._ec_new_verification_token`) and 157 (`public._ec_sha256_hex`).
- Test `tests/migrations/enrollment-certificate-g3-exception-condition.test.ts` present.

## G1 — Preflight DB Snapshot (read-only)
- G1 (act_on_step + sign support): PRESENT (not reapplied).
- G2 objects: PRESENT (details table, issue/archive/verify/assert fns, `official_documents.student_request_id`) — not reapplied.
- G3 objects: ABSENT (rollback state).
- Storage policy `official_documents_deny_client_select`: ABSENT.
- Bucket `official-documents`: EXISTS, `public=false`, 0 files.
- Pilot request `93807768-a281-42de-bfb4-0c0c03786b20`: `status=in_review`, `updated_at=2026-07-13 17:59:19.782271+00`, 0 documents, 0 details, 0 attempts.

## G2 — SQL Scope Adjustment
Only difference vs main G3 source: the `INSERT INTO storage.buckets ... ON CONFLICT ...` block (lines 15–26 of source) was **excluded** from the submitted SQL, because:
- Lovable's Migration tool does not permit direct writes to `storage.buckets`.
- The bucket `official-documents` was already created via the Storage tool and independently verified as private with 0 files during a prior stage.

No other changes: all functions, table, indexes, trigger, RLS, storage policy, GRANT/REVOKE remain byte-identical to the main source.

## G3 — Migration Apply
- Applied as a single migration transaction via Lovable's Supabase Migration tool.
- Result: **SUCCESS** (transaction committed).
- No G1 or G2 objects were re-applied; only G3 objects were introduced (plus `verify_document` / `issue_.../archive_...` `CREATE OR REPLACE` updates from the same G3 file).

## G4 — Post-Apply Verification (read-only)

| Object | Result |
|---|---|
| `public.enrollment_certificate_document_generation_attempts` | PRESENT, RLS ENABLED, no broad policies |
| `public.prepare_enrollment_certificate_document_generation(uuid,text)` | PRESENT |
| `public.mark_enrollment_certificate_document_generating(uuid)` | PRESENT |
| `public.mark_enrollment_certificate_document_uploaded(uuid,text,bigint)` | PRESENT |
| `public.finalize_enrollment_certificate_document_generation(uuid,text,text)` | PRESENT |
| `public.fail_enrollment_certificate_document_generation(uuid,text,text)` | PRESENT |
| `public._ec_new_verification_token()` | PRESENT (uses `WHEN undefined_function OR invalid_schema_name`) |
| `public._ec_sha256_hex(text)` | PRESENT (uses `WHEN undefined_function OR invalid_schema_name`) |
| `public.assert_enrollment_certificate_pdf_generation_ready()` | PRESENT (real bucket-required readiness) |
| `public.verify_document(text)` | PRESENT (G3 minimized-PII version) |
| Storage policy `official_documents_deny_client_select` | PRESENT (SELECT deny for authenticated/anon on this bucket) |
| Table row count | 0 total, 0 for pilot |
| Bucket `official-documents` | `public=false`, 0 files |

### Exception Conditions
Both helper functions confirmed to use the fixed handler `WHEN undefined_function OR invalid_schema_name THEN`; no `undefined_schema` anywhere.

### ACLs
- Saga RPCs: `REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated` — applied per source.
- `assert_enrollment_certificate_pdf_generation_ready()`: `REVOKE ALL FROM PUBLIC, anon, authenticated` — direct SQL call denied (`permission denied for function`), which is the intended fail-closed posture; it is invoked internally via `PERFORM` inside SECURITY DEFINER saga RPCs only.
- `verify_document(text)`: `GRANT EXECUTE ... TO anon, authenticated` — per source.
- Internal helpers `_ec_new_verification_token()` and `_ec_sha256_hex(text)` receive no explicit GRANTs to app roles.

### Readiness Assert
Called via raw SQL under limited role → returns `42501` (denied), confirming lockdown. No exception body was reached, no data created. Contract validation for readiness happens exclusively inside SECURITY DEFINER callers.

### verify_document
G3 body deployed: minimized PII (no `academic_number`, no `full_name_ar` in payload).

### Archive Completion Contract
`archive_enrollment_certificate_from_workflow_step(uuid,text,jsonb)` deployed with issued-PDF requirement. Not executed operationally.

## G5 — Pilot Request Untouched
`93807768-a281-42de-bfb4-0c0c03786b20`:
- `status=in_review`
- `updated_at=2026-07-13 17:59:19.782271+00`
- 0 official documents
- 0 enrollment certificate details
- 0 generation attempts
- No PDF generation, no upload, no finalize, no signature, no issuance, no archive

## G6 — G1/G2 Not Re-Applied
- No duplicate tables, no duplicate function signatures beyond `CREATE OR REPLACE` updates explicitly in G3 source (`verify_document`, `issue_...`, `archive_...`, `assert_...`).
- `schema_migrations` entries for prior G1 (20260714234443) and G2 (20260714234725) untouched.

## Prohibitions Respected
- No Publish/Deploy.
- No Feature Flags changed.
- No Auth/Roles/Finance changes.
- Bucket not deleted / not re-created.
- No files uploaded.
- No Worker executed.
- No PDF generated.
- Pilot request untouched.
- No cleanup/reset/delete outside the G3 SQL scope.

## Bucket State (before/after)
- Before: `official-documents`, public=false, 0 files.
- After:  `official-documents`, public=false, 0 files.

## Next Phase
`ENROLLMENT_CERTIFICATE_WORKER_STORAGE_READINESS_01` (not started).

## Remaining Phases to Launch
1. Worker/Storage readiness verification.
2. Enrollment certificate E2E completion.
3. Shared foundation for 8 student services.
4. Forms & workflows implementation.
5. E2E per service + gradual activation.
6. Faculty course materials feature: sync to GitHub, review, merge.
7. Security, data, and UI audit.
8. Single final Publish/Deploy.
9. Post-launch validation & handover.

## Blockers After G3 Success
- Worker not yet ready/approved.
- No real PDF generated yet.
- Enrollment certificate E2E incomplete.
- Eight student services still hidden.
- Course materials feature not yet on GitHub.
- Publish/Deploy forbidden until launch phase.

## Readiness Percentages
- G3 code fix: **100%**
- G3 runtime apply: **100%** (this stage)
- Worker/Storage readiness: **not approved**
- Enrollment certificate E2E: **incomplete**
- Overall final launch readiness: **~35%**

## Publish/Deploy
**PUBLISH_DEPLOY_FORBIDDEN** — respected. No deployment triggered.
