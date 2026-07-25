# PORTAL-B1-FIVE-SERVICES-BACKEND-IMPLEMENTATION-01 — Report

Branch: `feat/b1-five-services-backend-01`  
Base: `origin/main@7e499dd`  
Policy: SOURCE-ONLY. No production apply. No Deploy/Publish. No `student_visible`.

## Decision

```text
SOURCE_READY_FOR_REVIEW
PRODUCTION_APPLY_BLOCKED
```

Contract Freeze is locked. Runbook orders 7–18 are promoted with paired
preflight/post-verifier companions. Revenue confirmation remains an ordinary
`confirm_payment` step with actor/time/optional note only.

## Delivered

1. **Contract Freeze** — `docs/B1-FIVE-SERVICES-BACKEND-CONTRACT-FREEZE-01.md`
2. **confirm_payment simplification** — already on base (`20260725002135_*` + draft);
   adapter contract now uses `stepId`, drops `payment_not_confirmed` / ledger fields
3. **Secure attachments** — promoted order 7
4. **Trusted references** — promoted order 8
5. **Five-service details foundations** — orders 9–14
6. **Actual dispatcher** — order 15 (`REQUEST-B1-SERVICE-DETAILS-05A`)
7. **Workflows draft/inactive** — orders 16–17
8. **ACL cutover** — order 18
9. **Preflight/post-verifier** — `docs/migration-drafts/b1-backend-verifiers/` (12+12)
10. **Generated types** — attachment uploads, file withdrawal details, attachment RPCs

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

## Explicit non-goals

- Production Migration apply / `db push`
- Deploy / Publish
- Workflow activation / `student_visible=true`
- Student UI form work beyond adapter contract alignment
- Manual `routeTree.gen.ts` edits

## Verification

| Gate | Result |
|---|---|
| Contract Freeze doc | PASS |
| Local PG17 compile (`scripts/b1-local-pg-compile`) | `PASS_LOCAL_PG17_COMPILE` (18/18) |
| `bunx tsc --noEmit` | PASS |
| `bun test tests/student-requests` | **587 PASS / 0 FAIL** |
| `bun run build` | PASS |
| Production apply / Deploy / Publish | **NOT RUN** (blocked by policy) |

## Production impact

**Zero** until a separate per-migration approval applies these files. Adapters remain
`runtimeAvailable: false`.
