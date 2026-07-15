# FACULTY_PUBLIC_PII_EXPOSURE_REMEDIATION_01 — Report

## 1. Decision
`PASS_FACULTY_PUBLIC_PII_EXPOSURE_REMEDIATED_AND_SECURITY_SCAN_CLEARED_NO_DEPLOY`

## 2. Environment
- Repository: msorori-mh/saba-uni-portal
- Baseline main HEAD: `741a65cf00779a1efdbd6ede6189444e9929af9d`
- Lovable project: `4b291119-790f-4484-9285-c2b774e1ba6f`
- Supabase project: `wpmicqriltrowwonknox`
- Design reference: `docs/FACULTY-PUBLIC-PII-EXPOSURE-AUDIT-AND-REMEDIATION-DESIGN-01-REPORT.md`
  (decision `PASS_FACULTY_PUBLIC_PII_EXPOSURE_AUDITED_REMEDIATION_DESIGN_READY_NO_CHANGES_NO_DEPLOY`)

## 3. Migration
- File: new migration `<timestamp>_faculty_public_pii_column_privileges_01`
  applied through the managed migration tool (single transaction).
- Functional body:
  ```sql
  BEGIN;
  REVOKE SELECT ON TABLE public.faculty FROM PUBLIC;
  REVOKE SELECT ON TABLE public.faculty FROM anon;
  REVOKE SELECT ON TABLE public.faculty FROM authenticated;
  GRANT SELECT (
    id, employee_id, full_name_ar, full_name_en, degree, specialization,
    program_id, rank, photo, bio_ar, bio_en, sort_order, is_active,
    category, start_year, admin_position, admin_position_order
  ) ON TABLE public.faculty TO anon, authenticated;
  COMMENT ON COLUMN public.faculty.email      IS 'SENSITIVE — server-only…';
  COMMENT ON COLUMN public.faculty.phone      IS 'SENSITIVE — server-only…';
  COMMENT ON COLUMN public.faculty.created_at IS 'INTERNAL — no SELECT grant…';
  COMMENT ON COLUMN public.faculty.updated_at IS 'INTERNAL — no SELECT grant…';
  COMMIT;
  ```
- Scope review (G3): matches audited design exactly. No DROP/CREATE POLICY,
  no DML, no service_role change, no other objects touched.
- Apply result: single transaction COMMIT successful, no partial apply.

## 4. Baseline (G1) vs Post-apply (G14)
| Metric | Before | After |
|---|---|---|
| total rows | 35 | 35 |
| active rows | 34 | 34 |
| rows with email non-empty | 1 | 1 |
| rows with phone non-empty | 1 | 1 |

No data mutation — invariants preserved.

## 5. Table-level SELECT (G5)
| Role | Before | After |
|---|---|---|
| anon          | false | false |
| authenticated | **true**  | **false** |
| service_role  | true  | true  |
| PUBLIC        | (none) | (none) |

## 6. Column-level SELECT after apply (G6/G7)
Public columns (anon/authenticated both `true`):
`id, employee_id, full_name_ar, full_name_en, degree, specialization,
program_id, rank, photo, bio_ar, bio_en, sort_order, is_active, category,
start_year, admin_position, admin_position_order` (17 columns).

Sensitive / internal (anon/authenticated both `false`):
`email, phone, created_at, updated_at`.

`service_role` retains full column access.
`information_schema.column_privileges` confirms no grant to anon/authenticated/PUBLIC on
`email`, `phone`, `created_at`, `updated_at`.

## 7. RLS policies (G8)
Unchanged (5 policies):
1. `Public can view active faculty` — PERMISSIVE, SELECT, TO {anon,authenticated}, USING `(is_active = true)`
2. `Admins can view all faculty` — SELECT, TO authenticated, `has_role(auth.uid(),'admin')`
3. `Admins can insert faculty` — INSERT, TO authenticated
4. `Admins can update faculty` — UPDATE, TO authenticated, `has_role(...)`
5. `Admins can delete faculty` — DELETE, TO authenticated, `has_role(...)`

Row filter (is_active=true) combines with column privileges to permit only
public columns for public/active rows.

## 8. Safe read test (G9)
- `has_column_privilege` evidence recorded above.
- `SET LOCAL ROLE anon` is not permitted on Lovable Cloud connections
  (non-superuser); privilege proof relies on ACL introspection only, as
  allowed by G9 fallback ("otherwise rely on has_column_privilege and ACL
  evidence"). No sensitive values displayed.

## 9. Code / consumer review (G10, G11)
- `facultyQuery` (browser directory) already projects explicit safe columns;
  no `email`/`phone` requested → no client regression.
- No `select("*")` from `public.faculty` on any browser path.
- Admin surfaces (`admin-faculty`, `admin-people`, `admin-councils`,
  `admin-users`, HR/council notification helpers) call `supabaseAdmin`
  server-side; unaffected by anon/authenticated column privileges.
- `supabaseAdmin` remains server-only (`client.server.ts` guarded by import
  protection); no service-role key in client bundle.

## 10. Programmatic checks (G12)
- `bunx tsgo --noEmit` — passed (no output).
- `bun run build` — passed (`preset=cloudflare-module`, no client-side
  service role, no font/logo/SITE_URL leak).
- No production code touched; only new migration + this report.

## 11. Security scan (G13)
Persisted finding cleared:
- `EXPOSED_SENSITIVE_DATA / faculty_public_email_phone_exposure` →
  marked_as_fixed with column-privilege remediation evidence. Result:
  **"No security findings remain active."**
- No new critical/error finding introduced by the remediation.
- No `ignore` used; no severity downgrade.
- `FACULTY_PUBLIC_EMAIL_PHONE_EXPOSURE_CLEARED = true`.

## 12. Enrollment-certificate baseline unchanged (G15)
- Bucket `official-documents`: `public=false`, files=0.
- Restrictive policy `official_documents_deny_client_select` intact.
- Helper functions `_ec_new_verification_token` / `_ec_sha256_hex`: no
  anon/authenticated EXECUTE.
- Blocked trial request `93807768-a281-42de-bfb4-0c0c03786b20`:
  `status=in_review`, `updated_at=2026-07-13 17:59:19.782271+00`,
  0 documents / 0 details / 0 attempts.
- No Saga run, no PDF generation, no upload, no Worker deploy, no E2E,
  no Publish/Deploy in this phase.

## 13. Remaining blockers
None for Faculty PII. Enrollment-certificate deployment blockers already
tracked in prior report; require a new explicit publish authorization.

## 14. Next phase
`ENROLLMENT_CERTIFICATE_WORKER_CONTROLLED_DEPLOYMENT_01_RETRY_AFTER_FACULTY_PII_REMEDIATION`
— requires a fresh, explicit owner authorization. Do NOT start automatically.

## 15. Readiness
- Faculty PII audit: 100%
- Faculty PII remediation design: 100%
- Faculty PII remediation applied: 100%
- Faculty PII security scan: 100% (cleared, zero active findings)
- Worker implementation: 100%
- Worker readiness: 100%
- Worker deployment: 0% (pending new authorization)
- Enrollment certificate E2E: 0%
- Overall final launch readiness: ~78% (deployment + E2E + B4 hardening remain)
