# ENROLLMENT_CERTIFICATE_PR124_PRODUCTION_MIGRATION_APPLY_01 — Report

## Decision

**HOLD_ENROLLMENT_CERTIFICATE_PR124_PRODUCTION_MIGRATION_PREREQUISITE_MIGRATIONS_NOT_APPLIED**

## Environment

- Lovable Project: `4b291119-790f-4484-9285-c2b774e1ba6f`
- Supabase Project: `wpmicqriltrowwonknox`
- Repo: `msorori-mh/saba-uni-portal`
- Requested main HEAD: `cbaa28d6dbb088be8722dc6fea3495ecd2a0021d`
- Target migration: `supabase/migrations/20260714010000_enrollment_certificate_pdf_storage_saga_completion_01.sql`
- Apply time: **not applied** (blocked at G0 Preflight)

## G0 Preflight — Result: FAIL

Queried `supabase_migrations.schema_migrations` on production. Only these
`2026071*` versions are recorded as applied:

```
20260710003638
20260711195112
20260711195209
20260712234802
20260713001046
20260713025905
```

### Findings

| Check | Status | Detail |
|---|---|---|
| Target migration not yet applied | ✅ | `20260714010000` absent from `schema_migrations` |
| Target file present in repo | ✅ | 1017 lines, PR #124 canonical file |
| Prior migration `20260713100000_..._remediation_01` applied | ❌ | **Not present in `schema_migrations`** (file exists in repo only) |
| Prior migration `20260713210000_..._document_issuance_and_archive_contract_01` applied | ❌ | **Not present in `schema_migrations`** (file exists in repo only) |
| No partial apply of target migration | ✅ | Target absent from history; no partial state observed |
| Pilot request untouched | ✅ | No writes attempted this run against `93807768-a281-42de-bfb4-0c0c03786b20` |
| No Publish/Deploy | ✅ | None triggered |

### Dependency evidence (why target cannot be applied alone)

Static scan of `20260714010000_..._pdf_storage_saga_completion_01.sql`
references the following objects that are **defined in the two unapplied
prior migrations**:

- `public.issue_enrollment_certificate_from_workflow_step` — defined in `20260713210000`
- `public.archive_enrollment_certificate_from_workflow_step` — defined in `20260713210000`
- `public.assert_enrollment_certificate_pdf_generation_ready` — defined in `20260713210000`
- `public.verify_document` — defined in `20260713210000`
- `public.act_on_student_request_step` — updated in `20260713100000` and `20260713210000`

Applying `20260714010000` on a database that has not run
`20260713100000` and `20260713210000` would either fail immediately
(missing `CREATE OR REPLACE` targets whose bodies reference undefined
sibling functions) or, worse, install a `CREATE OR REPLACE` wrapper on
top of a *stale/absent* base — the exact "partial apply" state the
preflight rule forbids.

The task charter explicitly forbids applying any migration in this stage
other than `20260714010000`. Therefore the correct action is to HOLD.

## G1 Verification

Not executed — Preflight blocked apply.

## Objects created / modified

None. No DDL/DML executed this run.

## Confirmations

- **Private bucket `official-documents`**: not created this run (no
  apply). Cannot be confirmed until saga migration is legitimately
  applied on top of its prerequisites.
- **Pilot request `93807768-a281-42de-bfb4-0c0c03786b20`**: not touched.
  No status change, no document row, no attempt row created by this
  stage.
- **No Publish / No Deploy**: confirmed.
- **No saga execution / sign / issue / archive / upload / download**:
  confirmed.

## Remaining blocker

The owner must either:

1. Authorize a stage that applies the two prior PR #124 migrations
   first, in order:
   - `20260713100000_enrollment_certificate_post_zero_fee_execution_contract_remediation_01.sql`
   - `20260713210000_enrollment_certificate_document_issuance_and_archive_contract_01.sql`

   …and only then apply
   `20260714010000_enrollment_certificate_pdf_storage_saga_completion_01.sql`
   as a single, correctly-ordered PR #124 apply.

2. Or confirm the prior migrations were applied out-of-band and the
   `supabase_migrations.schema_migrations` history is inconsistent with
   the actual DB state — in which case a reconciliation stage is
   required before any further apply.

Until one of these paths is authorized, this stage remains:

**HOLD_ENROLLMENT_CERTIFICATE_PR124_PRODUCTION_MIGRATION_PREREQUISITE_MIGRATIONS_NOT_APPLIED**
