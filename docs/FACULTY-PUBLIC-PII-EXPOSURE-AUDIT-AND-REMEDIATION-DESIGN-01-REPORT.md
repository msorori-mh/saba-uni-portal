# FACULTY_PUBLIC_PII_EXPOSURE_AUDIT_AND_REMEDIATION_DESIGN_01 — Report

## Final Decision

**PASS_FACULTY_PUBLIC_PII_EXPOSURE_AUDITED_REMEDIATION_DESIGN_READY_NO_CHANGES_NO_DEPLOY**

Exposure to `authenticated` role is confirmed against `public.faculty.email` and `public.faculty.phone`. Exposure to `anon` is **not reproducible at the database layer** (see G3). A concrete, low-risk remediation design is ready. No SQL, policy, ACL, code, publish, or deploy changes were made in this phase.

## Environment
- Repo: `msorori-mh/saba-uni-portal`
- Expected main HEAD: `d8201928806892e0ff586cccc985393aeb990fe6`
- Lovable Project: `4b291119-790f-4484-9285-c2b774e1ba6f`
- Supabase Production: `wpmicqriltrowwonknox`
- Reference report: `docs/ENROLLMENT-CERTIFICATE-WORKER-CONTROLLED-DEPLOYMENT-01-REPORT.md`
- Reference decision: `HOLD_ENROLLMENT_CERTIFICATE_WORKER_CONTROLLED_DEPLOYMENT_FAILED`
- Scanner finding: `EXPOSED_SENSITIVE_DATA / faculty_public_email_phone_exposure` referencing policy `Public can view active faculty` on `public.faculty`.

## G0 — Sync
Lovable main up-to-date; reference report and HOLD decision present. Blocked trial request `93807768-a281-42de-bfb4-0c0c03786b20` untouched (verified in G12).

## G1 — Structure of `public.faculty`

RLS: enabled (`relrowsecurity=t`), not forced (`relforcerowsecurity=f`). Owner: `postgres`.

Columns (21): `id uuid pk`, `employee_id text NOT NULL`, `full_name_ar text NOT NULL`, `full_name_en text`, `email text`, `phone text`, `degree text`, `specialization text`, `program_id uuid`, `rank text`, `photo text`, `bio_ar text`, `bio_en text`, `sort_order int NOT NULL default 0`, `is_active bool NOT NULL default true`, `created_at timestamptz`, `updated_at timestamptz`, `category text NOT NULL default 'faculty'`, `start_year int`, `admin_position text`, `admin_position_order int`.

Row counts (metadata only): total=35, active=34, rows with non-null `email`=1, rows with non-null `phone`=1. No email/phone values read or displayed.

## G2 — Policies & Privileges

| policyname | permissive | roles | cmd | qual |
|---|---|---|---|---|
| Public can view active faculty | PERMISSIVE | anon, authenticated | SELECT | `is_active = true` |
| Admins can view all faculty | PERMISSIVE | authenticated | SELECT | `has_role(auth.uid(),'admin')` |
| Admins can insert faculty | PERMISSIVE | authenticated | INSERT | (with_check: admin) |
| Admins can update faculty | PERMISSIVE | authenticated | UPDATE | admin |
| Admins can delete faculty | PERMISSIVE | authenticated | DELETE | admin |

Table SELECT privilege: `anon = FALSE`, `authenticated = TRUE`, `service_role = TRUE`. No column-level privileges configured (`information_schema.column_privileges` returned zero rows for these grantees on this table).

## G3 — Real Exposure (no values disclosed)

- **anon**: `has_table_privilege('anon','public.faculty','SELECT') = FALSE`. Even though the RLS policy names `anon`, PostgREST cannot return any column because table-level SELECT is not granted to `anon`. The policy is *dormant* for the anon role.
- **authenticated**: `has_table_privilege('authenticated','public.faculty','SELECT') = TRUE` AND the policy `Public can view active faculty` allows every active row. Any signed-in user (student, faculty, staff) can execute `select email, phone from faculty where is_active`. All 21 columns are exposed; there are no column privileges limiting projection.

Classification: **CONFIRMED_AUTHENTICATED_TABLE_PII_EXPOSURE**; **ANON_EXPOSURE_NOT_REPRODUCED_AT_DB_LAYER** (scanner flagged it because the policy text lists `anon`, which is a real hardening gap even if currently blocked by the missing GRANT — an accidental future `GRANT SELECT ON public.faculty TO anon` would immediately open all 21 columns to the public).

## G4/G5 — Consumers

Direct `faculty` table access in the codebase:

| File | Client | Role | Columns requested | Needs email? | Needs phone? |
|---|---|---|---|---|---|
| `src/lib/queries.ts:36` `facultyQuery` | browser `supabase` | anon/authenticated | explicit safe list: id, employee_id, names, degree, specialization, program_id, rank, photo, bio_*, sort_order, is_active, category, start_year, admin_position(_order), programs(...) | **NO** | **NO** |
| `src/lib/queries.ts:122` | browser `supabase` | anon/authenticated | `id` count only | NO | NO |
| `src/lib/admin-faculty.functions.ts` (list/upsert/delete) | `supabaseAdmin` | server | `*` incl. email/phone (admin CMS) | YES (admin) | YES (admin) |
| `src/lib/admin-people.functions.ts` (rows 104,229; join `faculty:faculty_id(email, phone, photo, bio_ar)`) | `supabaseAdmin` | server | email, phone (HR) | YES (HR) | YES (HR) |
| `src/lib/admin-councils.functions.ts` (join `faculty:faculty_id(email)`) | `supabaseAdmin` | server | email (council notifications) | YES | NO |
| `src/lib/admin-users.functions.ts:99,412` | `supabaseAdmin` | server | id, email (account provisioning) | YES | NO |
| `src/lib/admin-research.functions.ts:31` | `supabaseAdmin` | server | non-sensitive | NO | NO |
| `src/lib/imports/engine.server.ts:342` | server (importer) | server | write-side | NO | NO |
| `src/routes/research.tsx`, `src/routes/admin/*` UI | via facultyQuery / admin server fns | mixed | never renders email/phone from `faculty` (except admin CMS forms) | — | — |
| `tests/security/setup-staging-test-accounts.ts` | server test | server | email (setup) | YES (test only) | NO |

**Key finding:** every legitimate consumer of `email`/`phone` runs server-side through `supabaseAdmin`, which bypasses RLS. **No browser-side surface requires `email` or `phone` from `public.faculty`.** The public faculty directory (`facultyQuery`) already omits both fields.

Public directory page (`src/routes/faculty.tsx` / `src/routes/departments.*`) renders: name (ar/en), photo, degree, rank, specialization, bio_ar, program. Neither `email` nor `phone` is shown to the public today. There is no explicit `public_contact_email` / `show_email_publicly` field, so per the phase rules `email` and `phone` remain SENSITIVE.

## G6 — Column Classification

| Column | Class | Rationale | Allowed roles after fix |
|---|---|---|---|
| id, employee_id, full_name_ar, full_name_en, degree, specialization, program_id, rank, photo, bio_ar, bio_en, sort_order, is_active, category, start_year, admin_position, admin_position_order | PUBLIC | Already shown in directory / needed by public queries | anon (read), authenticated (read), admin |
| **email** | **SENSITIVE** | Operational contact; no explicit public-consent field | admin/HR only via `supabaseAdmin` |
| **phone** | **SENSITIVE** | Same | admin/HR only via `supabaseAdmin` |
| created_at, updated_at | INTERNAL | Housekeeping | admin |

No other columns discovered (national_id, address, salary, etc. are not present in this table).

## G7 — Alternatives Assessment

- **A. Column-level privileges** (`REVOKE SELECT ON public.faculty FROM authenticated; GRANT SELECT (<public cols>) TO authenticated`). Lowest surface change; PostgREST honours column privileges; requires all callers to project explicit columns (already true for `facultyQuery`). Admin path is unaffected (uses `supabaseAdmin`). Best fit.
- **B. Public-safe view** with `security_invoker=true`. Works but adds a maintained artifact and duplicates the policy surface; requires new grants and revocations on base table anyway to prevent the direct route.
- **C. SECURITY DEFINER RPC**. Overkill for a simple projection; forces client refactor.
- **D. Split table**. High blast radius, unnecessary given only 2 columns and 1 row currently populated.

## G8 — Recommended Design

**Alternative A — Column-level SELECT privileges + tightened policy scope.**

1. Revoke table-wide SELECT from `authenticated` (and from `anon` for future safety — currently already absent but make it explicit).
2. Grant SELECT only on the PUBLIC column set to `anon` and `authenticated`.
3. Re-scope the `Public can view active faculty` policy so its `roles` list matches only what is actually needed (keep `anon`, `authenticated`; the `USING (is_active = true)` clause stays). With column privileges in place the policy can no longer leak `email`/`phone`.
4. Keep the `Admins can *` policies unchanged; admin path uses `supabaseAdmin` (service role bypasses RLS and column grants).

Why this passes the phase's ten constraints: it blocks `email`/`phone` from both `anon` and `authenticated` at the privilege layer, keeps the public directory working (its query already lists only safe columns), keeps admin/HR/council flows intact (they run through `supabaseAdmin`), avoids any new view/RPC, does not depend on UI hiding, and is trivially covered by a `has_column_privilege` regression test.

## G9 — Proposed SQL (design only — not applied)

```sql
-- forward
REVOKE SELECT ON public.faculty FROM PUBLIC;
REVOKE SELECT ON public.faculty FROM anon;
REVOKE SELECT ON public.faculty FROM authenticated;

GRANT SELECT (
  id, employee_id, full_name_ar, full_name_en, degree, specialization,
  program_id, rank, photo, bio_ar, bio_en, sort_order, is_active,
  category, start_year, admin_position, admin_position_order
) ON public.faculty TO anon, authenticated;

-- service_role keeps ALL implicitly via existing grant; admin RLS policies unchanged.

COMMENT ON COLUMN public.faculty.email IS
  'SENSITIVE — server-only via supabaseAdmin. No SELECT grant to anon/authenticated.';
COMMENT ON COLUMN public.faculty.phone IS
  'SENSITIVE — server-only via supabaseAdmin. No SELECT grant to anon/authenticated.';
```

**Rollback (design only):**

```sql
REVOKE SELECT (id, employee_id, full_name_ar, full_name_en, degree, specialization,
  program_id, rank, photo, bio_ar, bio_en, sort_order, is_active,
  category, start_year, admin_position, admin_position_order)
  ON public.faculty FROM anon, authenticated;
GRANT SELECT ON public.faculty TO authenticated;
```

## G10 — UI/Code Change Plan

Zero source changes required to keep functionality:

- `src/lib/queries.ts` — already projects explicit safe columns; no change.
- All admin/HR/council/import server functions — use `supabaseAdmin`; unaffected by column grants.
- Regenerate `src/integrations/supabase/types.ts` after the migration (automatic post-migration flow) — no manual edits.
- Optional (post-remediation, out of scope here): if a future feature requires publishing a contact, introduce dedicated `public_contact_email` / `show_email_publicly` columns; do not reuse operational `email`/`phone`.

## G11 — Test Plan (for the remediation phase)

1. `has_table_privilege('anon','public.faculty','SELECT')` → FALSE.
2. `has_column_privilege('anon','public.faculty','email','SELECT')` → FALSE.
3. `has_column_privilege('anon','public.faculty','phone','SELECT')` → FALSE.
4. Same three checks for `authenticated` → FALSE / FALSE / FALSE.
5. `has_column_privilege('authenticated','public.faculty','full_name_ar','SELECT')` → TRUE.
6. `facultyQuery` returns ≥1 row without error (integration).
7. Admin CMS list still returns `email`/`phone` (server test using `supabaseAdmin`).
8. Council notification path still resolves faculty email (server test).
9. Course-offering / research pages render.
10. Faculty portal login/change-password unaffected (uses `faculty_profiles`, not `faculty`).
11. Static grep: no `select("*")` from `faculty` in browser paths.
12. Lovable security scan re-run: `faculty_public_email_phone_exposure` no longer reported.
13. `bunx tsgo --noEmit` clean.
14. `bun run build` clean.
15. No row-level mutation to `public.faculty` executed by the migration (diff `count(*)`, `count(email)`, `count(phone)` before/after).

## G12 — Post-Audit Invariance

Verified via read-only queries only:
- `public.faculty` policies unchanged (5 policies as listed).
- ACLs unchanged (`anon.SELECT=f`, `authenticated.SELECT=t`, `service_role.SELECT=t`).
- Row counts unchanged (total=35, active=34, with_email=1, with_phone=1).
- No view/RPC/migration created.
- No publish or deploy attempted.
- Blocked trial request `93807768-a281-42de-bfb4-0c0c03786b20`: still `status=in_review`, `updated_at=2026-07-13 17:59:19.782271+00`, 0 documents / 0 details / 0 attempts.
- `official-documents` bucket still `public=false`, 0 files.

## Impact on Worker Redeployment

The Lovable pre-publish security gate currently blocks any deploy because of this finding. Until the remediation phase closes it, `ENROLLMENT_CERTIFICATE_WORKER_CONTROLLED_DEPLOYMENT_01_RETRY_AFTER_FACULTY_PII_REMEDIATION` cannot execute. All other Worker gates (G0–G6) previously passed, so removing this single finding is the sole remaining unblock.

## Readiness

- Faculty PII audit: **100%**
- Faculty PII remediation design: **100%**
- Faculty PII remediation applied: **0%** (deferred to next phase)
- G3 code/runtime posture: **100%**
- G3 post-apply security posture: **100%**
- Storage policy + helper ACL remediation: **100%**
- Worker implementation: **100%**
- Worker deployment: **0%** (blocked by this finding)
- Enrollment certificate E2E: **0%**
- Overall final launch readiness: **~65%**

## Publish/Deploy

**PUBLISH_DEPLOY_FORBIDDEN** — respected. No deployment, no migration, no policy/ACL change, no Worker retry.

## Next Phase (do not auto-start)

`FACULTY_PUBLIC_PII_EXPOSURE_REMEDIATION_01` — single controlled migration implementing the G9 SQL, regenerating types, running the G11 test set, and re-running the Lovable security scan. Requires explicit owner approval. Only after that passes may `ENROLLMENT_CERTIFICATE_WORKER_CONTROLLED_DEPLOYMENT_01_RETRY_AFTER_FACULTY_PII_REMEDIATION` be re-authorized.
