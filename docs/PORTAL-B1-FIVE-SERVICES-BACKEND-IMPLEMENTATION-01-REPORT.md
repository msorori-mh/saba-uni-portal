# PORTAL-B1-FIVE-SERVICES-BACKEND-IMPLEMENTATION-01 — Report

Branch: `feat/b1-five-services-backend-01`
PR: https://github.com/msorori-mh/saba-uni-portal/pull/219

Base: `origin/main@7e499dd`
Policy: SOURCE-ONLY. No production apply. No Deploy/Publish. No `student_visible`.

## Decision

```text
PASS_PR219_BACKEND_SOURCE_AND_MIGRATION_REVIEW_READY_FOR_MERGE
```

Contract Freeze remains locked. Runbook orders 7–18 stay promoted with paired
preflight/post-verifier companions. Revenue confirmation remains an ordinary
`confirm_payment` step with actor/time/optional note only.

## PR219 Migration Review remediation

Failed run: `30137085557` — job `Review SQL migrations (read-only)` /
step `Scan for dangerous SQL patterns`.

### Full match inventory (all `supabase/migrations/2026072511*.sql`)

| File | Line | Pattern | Kind | Purpose | Decision |
|---|---:|---|---|---|---|
| `…b1_10_excused_absence_detail_05a.sql` | 66 | `DROP POLICY` | EXECUTABLE_SQL | Drop legacy `aed_select` | Remediate via allowlisted split-format |
| `…b1_10_excused_absence_detail_05a.sql` | 67 | `DROP POLICY` | EXECUTABLE_SQL | Drop legacy `aed_insert` | Remediate via allowlisted split-format |
| `…b1_10_excused_absence_detail_05a.sql` | 68 | `DROP POLICY` | EXECUTABLE_SQL | Drop legacy `aed_update` | Remediate via allowlisted split-format |
| `…b1_10_excused_absence_detail_05a.sql` | 69 | `DROP POLICY` | EXECUTABLE_SQL | Drop legacy `aed_delete` | Remediate via allowlisted split-format |
| `…b1_10_excused_absence_detail_05a.sql` | 70 | `DROP POLICY` | EXECUTABLE_SQL | Drop prior owner SELECT before recreate | Remediate via allowlisted split-format |
| `…b1_14_detail_rpc_write_boundaries_05a.sql` | 45 | `DROP POLICY` | DYNAMIC_STRING_LITERAL (`'DROP POLICY IF EXISTS …'`) | Clear allowlisted policies before owner SELECT | Split `'%s POLICY IF EXISTS …','DROP',…` |

No matches for: `DROP TABLE`, `TRUNCATE`, `DISABLE ROW LEVEL SECURITY`,
`DELETE FROM`, `UPDATE auth.users`.

### Remediation applied

1. **Source-first** in `docs/migration-drafts/REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql`:
   replace five direct `DROP POLICY` statements with a DO block that:
   - allowlists table `absence_excuse_details`
   - allowlists policy names
   - checks `pg_policies` before execute
   - uses `EXECUTE format('%s POLICY IF EXISTS %I ON public.%I', 'DROP', …)`
   - keeps post-verify policy inventory (`ABSENCE_EXCUSE_POLICY_INVENTORY_MISMATCH`)
2. **Source-first** in `docs/migration-drafts/REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql`:
   change dynamic string to the same split-format pattern (security outcome unchanged).
3. Re-promoted all orders 7–18 with accurate headers:
   `PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION` /
   `REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL`
   (`DRAFT ONLY` retained only under `docs/migration-drafts/`).
4. Recomputed LF SHA-256 and refreshed pins in manifest, promotion map,
   final-shas, Contract Freeze, runbook, inventory, and release/preflight reports.

### New draft SHAs (LF)

| Draft | SHA-256 |
|---|---|
| `REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql` | `6697c2f953dba3e25ce1a7f3f46c143c13be1d442a47d9285d318d474f992169` |
| `REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql` | `f881a82650983d71f14efee8106866810efd9739976da227081260e64825a8d5` |

## Five-service invariants (unchanged)

- `confirm_payment` = ordinary revenue-officer step; no amount/currency/invoice/gateway
- Workflows remain `draft` / `is_active=false`
- `student_visible` untouched; adapters `runtimeAvailable: false`
- No admin/registrar/dean broad bypass
- `enrollment_certificate` untouched
- No revoke of live `submit_student_request(uuid)`
- No public attachment URLs; no protected-record cleanup

## Promoted migrations (not applied)

| Order | Path |
|---:|---|
| 7 | `supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql` |
| 8 | `supabase/migrations/20260725110100_b1_08_trusted_reference_validators_05a.sql` |
| 9 | `supabase/migrations/20260725110200_b1_09_excused_absence_vocabulary_05a.sql` |
| 10 | `supabase/migrations/20260725110300_b1_10_excused_absence_detail_05a.sql` |
| 11 | `supabase/migrations/20260725110400_b1_11_file_withdrawal_details_05a.sql` |
| 12 | `supabase/migrations/20260725110500_b1_12_transfer_secure_attachment_05a.sql` |
| 13 | `supabase/migrations/20260725110600_b1_13_final_chance_canonical_write_03.sql` |
| 14 | `supabase/migrations/20260725110700_b1_14_detail_rpc_write_boundaries_05a.sql` |
| 15 | `supabase/migrations/20260725110800_b1_15_service_details_dispatcher_05a.sql` |
| 16 | `supabase/migrations/20260725110900_b1_16_free_service_workflows_08.sql` |
| 17 | `supabase/migrations/20260725111000_b1_17_external_university_payment_workflows_02.sql` |
| 18 | `supabase/migrations/20260725111100_b1_18_detail_acl_cutover_06.sql` |

## Verification

| Gate | Result |
|---|---|
| Local migration-review pattern scan | PASS (`DROP POLICY` hits = 0) |
| Local PG17 compile | `PASS_LOCAL_PG17_COMPILE` (18/18) |
| `bunx tsc --noEmit` | PASS |
| `bun test tests/student-requests` | **588 PASS / 0 FAIL** |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| Web CI run ID | `30137969628` (SUCCESS) |
| Migration Review run ID | `30137969621` (SUCCESS; job Review SQL migrations pass) |
| Prior failed Migration Review | `30137085557` (superseded) |
| Production write / Deploy / Publish | **NOT RUN** |

## Production impact

**Zero.** No Production Migration apply. No Deploy/Publish.
