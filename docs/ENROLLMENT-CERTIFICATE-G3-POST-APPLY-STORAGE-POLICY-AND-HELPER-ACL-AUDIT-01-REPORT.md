# ENROLLMENT_CERTIFICATE_G3_POST_APPLY_STORAGE_POLICY_AND_HELPER_ACL_AUDIT_01 — Report

## Final Decision

**HOLD_ENROLLMENT_CERTIFICATE_G3_STORAGE_POLICY_AND_HELPER_ACL_VULNERABILITIES**

Both risks tracked by this audit are confirmed. No remediation was performed — this stage is read-only.

## Environment
- Repo: `msorori-mh/saba-uni-portal`
- Lovable Project: `4b291119-790f-4484-9285-c2b774e1ba6f`
- Supabase Production: `wpmicqriltrowwonknox`
- Prior stage: `PASS_ENROLLMENT_CERTIFICATE_PR124_G3_REAPPLIED_AND_VERIFIED_NO_WORKER_NO_E2E_NO_DEPLOY`
- Audited at: 2026-07-15 (UTC)

## G0 — Baseline (read-only) — PASS
- G3 applied: `enrollment_certificate_document_generation_attempts` present.
- Bucket `official-documents`: EXISTS, `public=false`, 0 files.
- Pilot request `93807768-a281-42de-bfb4-0c0c03786b20`: `status=in_review`, `updated_at=2026-07-13 17:59:19.782271+00`, 0 documents, 0 details, 0 generation attempts.

## G1 — storage.objects policies

Target policy inspection:

| policyname | permissive | roles | cmd | qual | with_check |
|---|---|---|---|---|---|
| `official_documents_deny_client_select` | **PERMISSIVE** | `{anon, authenticated}` | SELECT | `(bucket_id <> 'official-documents')` | — |

Full storage.objects SELECT policy inventory (relevant subset):
- `Public can view {news,events,faculty,department}-images` — PERMISSIVE, roles `{public}`, `bucket_id = '<bucket>'`.
- `Public can view research pdfs` — PERMISSIVE, roles `{public}`, `bucket_id='research-pdfs'`.
- `Authenticated can list research pdfs` — PERMISSIVE, roles `{authenticated}`, `bucket_id='research-pdfs'`.
- `payment_receipts_select_own` / `sra_storage_select_self` / `sra_storage_select_admin` / `database_export_admin_select` / `acta_storage_select_*` — bucket-scoped self/admin PERMISSIVE policies.
- `official_documents_deny_client_select` — PERMISSIVE (see above).

## G2 — Table privileges and ACL

```
anon.SELECT(storage.objects)          = t
authenticated.SELECT(storage.objects) = t
service_role.SELECT(storage.objects)  = t
```

`storage.objects` ACL (relevant):
`{anon=arwdDxtm/..., authenticated=arwdDxtm/..., service_role=arwdDxtm/...}`, `relrowsecurity=t`, `relforcerowsecurity=f`.

Bucket / object inventory (counts only, no file contents read):

| bucket | public | objects |
|---|---|---|
| council-topic-attachments | f | 0 |
| database_export_09_07_26 | f | 1 |
| department-images | t | 0 |
| events-images | t | 0 |
| faculty-images | t | 3 |
| news-images | t | 0 |
| official-documents | f | 0 |
| payment-receipts | f | 0 |
| research-pdfs | t | 0 |
| student-request-attachments | f | 3 |

### Storage policy risk assessment — CONFIRMED

- The policy `official_documents_deny_client_select` is declared **PERMISSIVE**, not RESTRICTIVE.
- PostgreSQL combines PERMISSIVE policies with **OR**. A PERMISSIVE policy can only widen access; it cannot deny.
- With `USING (bucket_id <> 'official-documents')` applied PERMISSIVELY to roles `{anon, authenticated}`, the policy **allows** anon and authenticated to SELECT every row in `storage.objects` whose bucket is not `official-documents` — regardless of whether any bucket-specific SELECT policy exists.
- Table-level `SELECT` privilege is granted to both `anon` and `authenticated`, so the RLS layer is the only gate; nothing else restrains it.
- Concrete impact: rows in private buckets `student-request-attachments`, `payment-receipts`, `council-topic-attachments`, and `database_export_09_07_26` become listable/readable at the object metadata level by anon/authenticated even without an owning bucket-specific policy. This is broader than the state before G3.
- The `official-documents` bucket itself is still protected — the qual explicitly excludes it — so PDF privacy for enrollment certificates is intact. The vulnerability is scope-creep against other private buckets, not against `official-documents`.

Verdict: **HOLD_ENROLLMENT_CERTIFICATE_G3_STORAGE_POLICY_SCOPE_VULNERABILITY** (component 1 of 2). Not remediated here.

## G3 — Helper function ACLs

`pg_proc` snapshot:

| function | args | security definer | owner |
|---|---|---|---|
| `public._ec_new_verification_token` | — | `f` (SECURITY INVOKER) | postgres |
| `public._ec_sha256_hex` | `p_text text` | `f` (SECURITY INVOKER) | postgres |

Effective ACL (via `aclexplode(coalesce(proacl, acldefault('f', proowner)))`):

| function | grantee | privilege |
|---|---|---|
| `_ec_new_verification_token` | PUBLIC | EXECUTE |
| `_ec_new_verification_token` | anon | EXECUTE |
| `_ec_new_verification_token` | authenticated | EXECUTE |
| `_ec_new_verification_token` | service_role | EXECUTE |
| `_ec_sha256_hex` | PUBLIC | EXECUTE |
| `_ec_sha256_hex` | anon | EXECUTE |
| `_ec_sha256_hex` | authenticated | EXECUTE |
| `_ec_sha256_hex` | service_role | EXECUTE |

Direct privilege checks:

```
anon.EXECUTE(_ec_new_verification_token())          = t
authenticated.EXECUTE(_ec_new_verification_token()) = t
anon.EXECUTE(_ec_sha256_hex(text))                  = t
authenticated.EXECUTE(_ec_sha256_hex(text))         = t
```

### Helper function risk assessment — CONFIRMED

- G3 source file did not include explicit `REVOKE ALL ... FROM PUBLIC, anon, authenticated` for these two helpers.
- Result: both helpers hold the default `GRANT EXECUTE TO PUBLIC`, so anon and authenticated can call them directly.
- `_ec_sha256_hex(text)`: exposes a general-purpose SHA-256 hex primitive to anon. Low intrinsic risk, but it lets any anon caller compute the exact hash format the verification pipeline stores, which weakens the "opaque token" assumption.
- `_ec_new_verification_token()`: mints a fresh verification token on every call. While the token is only meaningful once persisted alongside an issued document, exposing the minting primitive to anon is unnecessary attack surface and violates least-privilege for internal-only saga helpers.
- Both functions are SECURITY INVOKER, so they cannot bypass RLS; the risk is exposure of internals, not privilege escalation. Still, they were meant to be internal helpers to SECURITY DEFINER saga RPCs and should not be reachable from `anon`/`authenticated`.

Verdict: **HOLD_ENROLLMENT_CERTIFICATE_G3_HELPER_FUNCTION_PUBLIC_EXECUTE** (component 2 of 2). Not remediated here.

## G4 — Readiness assert

```
anon.EXECUTE(assert_enrollment_certificate_pdf_generation_ready())          = f
authenticated.EXECUTE(assert_enrollment_certificate_pdf_generation_ready()) = f
```

Function ACL is intentionally locked down (as documented in the G3 reapply report). The audit role cannot execute the body without altering ACL, so:

`ASSERT_BODY_NOT_EXECUTED_DUE_TO_INTENDED_ACL`

No ACL was changed. The lockdown itself is the intended posture; readiness is invoked internally by SECURITY DEFINER saga RPCs.

## G5 — Post-audit invariance (no writes)

Re-checked after all read-only queries:
- `official-documents`: `public=false`, 0 files.
- Pilot request `93807768-a281-42de-bfb4-0c0c03786b20`: `status=in_review`, `updated_at=2026-07-13 17:59:19.782271+00`, 0 documents, 0 details, 0 attempts.

All audit statements were `SELECT` / `has_*_privilege` / `pg_get_functiondef` reads. No DDL, no DML, no storage writes.

## Combined risk decision

| Risk | Status |
|---|---|
| Storage policy scope | CONFIRMED |
| Helper function EXECUTE to PUBLIC/anon/authenticated | CONFIRMED |

Both confirmed → **HOLD_ENROLLMENT_CERTIFICATE_G3_STORAGE_POLICY_AND_HELPER_ACL_VULNERABILITIES**.

## Prohibitions respected
- No migration created or applied.
- No policy created, altered, or dropped.
- No GRANT/REVOKE issued.
- No function altered.
- No bucket change; no upload; no delete.
- No Worker run; no PDF generated.
- Pilot request untouched.
- No Publish/Deploy.
- No cleanup/reset.

## Next Phase (do not auto-start)
On this HOLD: `ENROLLMENT_CERTIFICATE_G3_STORAGE_POLICY_AND_HELPER_ACL_REMEDIATION_01`.

Remediation shape (for the next stage, not executed here):
1. Recreate `official_documents_deny_client_select` as `AS RESTRICTIVE` (or drop it and rely on the absence of a permissive SELECT policy for `official-documents`), and re-verify no permissive policy grants anon/authenticated SELECT on that bucket.
2. `REVOKE EXECUTE ON FUNCTION public._ec_new_verification_token(), public._ec_sha256_hex(text) FROM PUBLIC, anon, authenticated` and confirm only SECURITY DEFINER saga RPCs (owned by a privileged role) can invoke them via `SET search_path`.
3. Re-run this audit stage to confirm both risks clear.

## Remaining Phases to Launch
1. Storage policy + helper ACL remediation (this HOLD).
2. Worker/Storage readiness verification.
3. Enrollment certificate E2E completion.
4. Shared foundation for 8 student services.
5. Forms & workflows.
6. E2E per service + gradual activation.
7. Course materials feature: sync to GitHub, review, merge.
8. Security, data, and UI audit.
9. Single final Publish/Deploy.
10. Post-launch validation & handover.

## Blockers
- Storage policy scope vulnerability (this stage).
- Helper function PUBLIC EXECUTE (this stage).
- Worker not yet ready/approved.
- No real PDF generated yet.
- Enrollment certificate E2E incomplete.
- Eight student services still hidden.
- Course materials feature not yet on GitHub.

## Readiness
- G3 code fix: **100%**
- G3 runtime apply: **100%**
- G3 post-apply security posture: **~40%** (2 confirmed risks pending remediation)
- Worker/Storage readiness: **not approved**
- Enrollment certificate E2E: **incomplete**
- Overall final launch readiness: **~35%**

## Publish/Deploy
**PUBLISH_DEPLOY_FORBIDDEN** — respected. No deployment triggered.
