# B1 Function Provenance Notes

Generated: 2026-08-10T05:13:19.303Z
HEAD: 9833269998a68f4ff1b86a57faf897f9b825f654

## Scope
This file documents known drift between the evidence artifacts `FUNCTION-PROVENANCE-36.json` and
`FUNCTION-SOURCE-PRODUCTION-RECONCILIATION-36.json` and the canonical B1 migration graph.
It is a companion note only; the evidence artifacts themselves are not modified.

## Stale final_source_migration references

The following functions have `final_source_migration` values that are superseded by the canonical current source migrations:

- `public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)`
  - reconciliation final_source_migration: `20260730175527_89e2a6a3-4e9f-48d7-9371-8e996ae1c00a.sql`
  - expected canonical current source: `20260727120200_b1_27_act_on_academic_effect_integration_01.sql`
  - reason: Reconciliation artifact predates the canonical semantic B1 migrations; final_source_migration is superseded.
- `public.b1_e2e_88_correlations_aligned(uuid,uuid,uuid)`
  - reconciliation final_source_migration: `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql`
  - expected canonical current source: `20260804120000_b1_88_request_scoped_e2e_support.sql`
  - reason: Reconciliation artifact predates the canonical semantic B1 migrations; final_source_migration is superseded.
- `public.b1_e2e_88_is_five_service(text)`
  - reconciliation final_source_migration: `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql`
  - expected canonical current source: `20260804120000_b1_88_request_scoped_e2e_support.sql`
  - reason: Reconciliation artifact predates the canonical semantic B1 migrations; final_source_migration is superseded.
- `public.b1_e2e_88_marker()`
  - reconciliation final_source_migration: `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql`
  - expected canonical current source: `20260804120000_b1_88_request_scoped_e2e_support.sql`
  - reason: Reconciliation artifact predates the canonical semantic B1 migrations; final_source_migration is superseded.
- `public.b1_e2e_88_parse_correlation(text)`
  - reconciliation final_source_migration: `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql`
  - expected canonical current source: `20260804120000_b1_88_request_scoped_e2e_support.sql`
  - reason: Reconciliation artifact predates the canonical semantic B1 migrations; final_source_migration is superseded.
- `public.b1_e2e_88_request_correlation(uuid)`
  - reconciliation final_source_migration: `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql`
  - expected canonical current source: `20260804120000_b1_88_request_scoped_e2e_support.sql`
  - reason: Reconciliation artifact predates the canonical semantic B1 migrations; final_source_migration is superseded.
- `public.b1_e2e_88_request_is_marked(uuid)`
  - reconciliation final_source_migration: `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql`
  - expected canonical current source: `20260804120000_b1_88_request_scoped_e2e_support.sql`
  - reason: Reconciliation artifact predates the canonical semantic B1 migrations; final_source_migration is superseded.
- `public.b1_map_ui_staff_action(text)`
  - reconciliation final_source_migration: `20260727063429_3b7dd782-3840-4e40-a7d2-b9bd941deff1.sql`
  - expected canonical current source: `20260725130000_b1_21_secure_read_contracts_01.sql`
  - reason: Reconciliation artifact predates the canonical semantic B1 migrations; final_source_migration is superseded.
- `public.can_current_user_act_on_step(uuid,text)`
  - reconciliation final_source_migration: `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql`
  - expected canonical current source: `20260723070217_645bb701-b2a3-4da3-bacf-b36dec211b99.sql`
  - reason: Reconciliation artifact predates the canonical semantic B1 migrations; final_source_migration is superseded.
- `public.current_user_has_b1_e2e_88_actor_binding(uuid,uuid,text)`
  - reconciliation final_source_migration: `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql`
  - expected canonical current source: `20260804120000_b1_88_request_scoped_e2e_support.sql`
  - reason: Reconciliation artifact predates the canonical semantic B1 migrations; final_source_migration is superseded.
- `public.current_user_has_b1_e2e_88_department_binding(uuid,text)`
  - reconciliation final_source_migration: `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql`
  - expected canonical current source: `20260804120000_b1_88_request_scoped_e2e_support.sql`
  - reason: Reconciliation artifact predates the canonical semantic B1 migrations; final_source_migration is superseded.
- `public.current_user_matches_transfer_department_scope(uuid,text)`
  - reconciliation final_source_migration: `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql`
  - expected canonical current source: `20260725150000_b1_23_transfer_department_scope_position_assignment_01.sql`
  - reason: Reconciliation artifact predates the canonical semantic B1 migrations; final_source_migration is superseded.
- `public.record_external_university_payment_confirmation(uuid,text)`
  - reconciliation final_source_migration: `20260806003612_3e34513d-28e3-4047-9d2d-73d4f54ca142.sql`
  - expected canonical current source: `20260725120000_b1_confirm_payment_predecessor_guard_01.sql`
  - reason: Reconciliation artifact predates the canonical semantic B1 migrations; final_source_migration is superseded.
- `public.user_matches_workflow_runtime_step(uuid)`
  - reconciliation final_source_migration: `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql`
  - expected canonical current source: `20260723070217_645bb701-b2a3-4da3-bacf-b36dec211b99.sql`
  - reason: Reconciliation artifact predates the canonical semantic B1 migrations; final_source_migration is superseded.

## General drift findings

- Total migrations classified: 298
- Canonical current B1 migrations: 27
- Migrations with body drift from canonical draft: 0
- TEST_ONLY-bearing migrations: 5
- test_only_release_graph_safe: YES

The canonical current source for each promoted migration is the migration file itself in
`supabase/migrations`. Canonical drafts are promotion artifacts and may retain a
`DRAFT ONLY — DO NOT APPLY` header or other drafting metadata that is intentionally removed during
promotion; therefore the canonical current SHA is the SHA-256 of the promoted migration body
(LF-normalized) and no body drift is reported.

## Archived superseded test-only aliases

The previous graph builder moved two managed test-only aliases to
`docs/migration-drafts/test-only-archive/`:

- `20260804004546_17b78d6d-3a17-41d9-ba7b-d0c19c6459cc.sql` — managed alias of Fixture-15 reissue;
  SUPERSEDED/ARCHIVED; excluded from the production path.
- `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` — managed duplicate of
  `b1_88_request_scoped_e2e_support`; SUPERSEDED/ARCHIVED; excluded from the production path.

Both are recorded in the `archive` section of `B1-CANONICAL-MIGRATION-GRAPH-01.json` with their
LF-normalized SHA-256 hashes and `release_decision: EXCLUDE_FROM_GO_LIVE`.

## Decision

PASS — the authoritative graph is consistent and the manifests/runbooks reflect current source truth.
