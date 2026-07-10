# PORTAL-G9-PRE-APPLY-SECURITY-ELIGIBILITY-REMEDIATION-01 — Report

## 1. Scope

- Repo: `msorori-mh/saba-uni-portal`
- File: `supabase/migrations/20260711020000_student_requests_p1_foundations.sql`
- Design doc: `docs/STUDENT-REQUESTS-P1-FOUNDATIONS-01-REPORT.md`
- No G9 application, no SQL executed, no re-application of G7/G8, no seed, no
  default privileges changed, no Publish/Deploy, no production data touched.

## 2. Source state

| Item | Value |
|---|---|
| commit before remediation | `a527463` (initial G9 landing, PR #100) |
| Git blob before remediation | `6af9b56a0dea25a2ecf4c3fdc48cc4bbfe3308f7` |
| commit after remediation | `6ace3c5` (`security: harden G9 eligibility foundations`) |
| Git blob after remediation (current) | `b8c5cdd0435eb4c5fd3716f797037372c70f0b1d` |
| Working-tree SHA256 (current) | `0be3b067c3f2ccfb2177d755c736b83c655526f813bcfb3eda9b5560dbd27943` |
| Line endings | LF only, no CRLF |
| `git diff` | clean (all remediation already committed) |

Result: the security remediation is already committed to `main`
(`6ace3c5`). The current source file matches the required specification;
no further source edits are needed in this pass.

## 3. ACL matrix (post-remediation)

| Function | PUBLIC | anon | authenticated |
|---|---|---|---|
| `assert_can_read_student_eligibility_context(uuid)` | REVOKE | REVOKE | REVOKE (helper only) |
| `get_student_request_eligibility_context(uuid)` | REVOKE | REVOKE | GRANT EXECUTE |
| `check_student_request_basic_eligibility(text, uuid)` | REVOKE | REVOKE | GRANT EXECUTE |

Matches file lines 688–701 verbatim. The internal helper is intentionally
NOT granted to `authenticated`; it is invoked via the two `SECURITY DEFINER`
public RPCs using the owner's privileges. `REVOKE FROM PUBLIC` alone is
insufficient because Supabase default privileges may auto-grant `anon` and
`authenticated` on new functions — explicit `REVOKE ... FROM anon` (and
`authenticated` for the helper) is required.

## 4. NULL eligibility logic (post-remediation)

Before: `IF v_study_status IS NOT NULL AND v_study_status <> 'new' THEN`
After: `IF v_study_status IS DISTINCT FROM 'new' THEN`

Reason text updated to:
`وقف القيد متاح للطلاب المستجدين فقط، ويجب استكمال student_study_status بقيمة new.`

Resulting matrix (`enrollment_suspension`):

| `student_study_status` | Eligible? |
|---|---|
| `new` | continues to remaining checks |
| `repeat` | `is_eligible = false` |
| `NULL` | `is_eligible = false` (default-deny) |

## 5. Static verification

- Three functions total, signatures exactly as specified. ✔
- All three are `SECURITY DEFINER`. ✔
- All three set `search_path = public, pg_temp`. ✔
- Auth gate present; returns `28000` on missing `auth.uid()`. ✔
- Non-owner / non-role callers rejected with `42501`. ✔
- Helper has no client GRANT. ✔
- `anon` explicitly revoked on all three. ✔
- `authenticated` granted EXECUTE on the two read RPCs only. ✔
- Suspension eligibility gate uses `IS DISTINCT FROM 'new'`. ✔
- No new policies, no seed rows, no data statements. ✔
- Four columns, five tables, indexes, constraints, comments — unchanged. ✔
- Suspension thresholds unchanged (`>= 2` consecutive years,
  `>= 4` scattered semesters, transfer-year check intact). ✔
- Role list unchanged (`system_admin`, `admin`, `student_affairs`,
  `registrar`). ✔
- RLS enabled with no policies on all five new tables. ✔
- No wiring to `create_student_request` / `submit_student_request`. ✔

## 6. Expected security scenarios (post future apply)

| Scenario | Expected |
|---|---|
| anon → `assert_can_read_student_eligibility_context` | ACL reject |
| anon → `get_student_request_eligibility_context` | ACL reject |
| anon → `check_student_request_basic_eligibility` | ACL reject |
| authenticated → helper directly | ACL reject |
| student → own context | allowed |
| student → another student's context | `42501` |
| admin / student_affairs / registrar → any student | allowed |
| `enrollment_suspension`, `student_study_status = NULL` | `is_eligible = false` |
| `enrollment_suspension`, `student_study_status = 'repeat'` | `is_eligible = false` |
| `enrollment_suspension`, `student_study_status = 'new'` | proceeds to further checks |

## 7. Design report update

`docs/STUDENT-REQUESTS-P1-FOUNDATIONS-01-REPORT.md` already reflects:

- Internal helper is not granted to `authenticated`.
- `anon` is explicitly revoked from all three functions.
- Rationale for why `REVOKE FROM PUBLIC` alone is insufficient in this
  project (default privileges may auto-grant `anon` / `authenticated`).
- `NULL` `student_study_status` blocks suspension eligibility.
- The four transitional columns require import completion before
  operational eligibility is enabled.

Working-tree SHA256:
`deffa86772cceee06eff827687af872f5cc04ebb108d12e75852cb88eab66ecb`.

No further edits needed in this pass.

## 8. Confirmations

- G9 migration NOT applied.
- No SQL executed against any database.
- G7 and G8 NOT re-applied.
- No seed created, no default privileges changed.
- No Publish, no Deploy.
- No production tables or data modified.

## 9. Git handoff

The remediation commit is already on `main` as `6ace3c5`
(`security: harden G9 eligibility foundations`). No new branch or PR is
required from this pass; the previously-opened PR that landed `6ace3c5`
is the authoritative source of the ACL and NULL-guard changes.

If a fresh branch is still desired for review packaging, run locally:

```powershell
git switch main
git pull --ff-only origin main
git switch -c security/g9-foundations-hardening-repackage
git add -- `
  supabase/migrations/20260711020000_student_requests_p1_foundations.sql `
  docs/STUDENT-REQUESTS-P1-FOUNDATIONS-01-REPORT.md `
  docs/PORTAL-G9-PRE-APPLY-SECURITY-ELIGIBILITY-REMEDIATION-01-REPORT.md
git diff --cached --check
git commit -m "security: harden G9 eligibility foundations (report)"
git push -u origin security/g9-foundations-hardening-repackage
```

Only the report file above is new in this pass; the SQL and design doc
are unchanged from `6ace3c5`.

## 10. Decision

**PASS_G9_SOURCE_REMEDIATED_PUSHED_READY_FOR_REVIEW**

- commit SHA (remediation): `6ace3c5`
- current HEAD (this workspace): `01665940cd3e1a5f0defd4fd66fb50288bd799b9`
- Migration blob SHA (new): `b8c5cdd0435eb4c5fd3716f797037372c70f0b1d`
- Migration SHA256 (new): `0be3b067c3f2ccfb2177d755c736b83c655526f813bcfb3eda9b5560dbd27943`
- G9 NOT applied; Publish/Deploy NOT executed.
