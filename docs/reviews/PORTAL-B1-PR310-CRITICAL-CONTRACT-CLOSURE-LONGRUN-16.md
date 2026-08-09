# PORTAL-B1-PR310-CRITICAL-CONTRACT-CLOSURE-REAL-ROLLBACK-HASH36-FIXTURE267-LONGRUN-16 REPORT

**DATE:** 2026-08-09  
**BRANCH:** `fix/b1-production-state-reconciliation-longrun-10`  
**START_SHA:** `87ffe453dadb9a1d8c74ecf452360907f78dde9a`  
**PR:** #310  
**VERDICT:** **HOLD**

---

## 1. REVOCATION OF PRIOR PASS CLAIM & VERDICT REASON

**PASS CLAIM REVOKED.**

Per the authoritative user directive in LONGRUN-16, the frozen expected production hashes in `scripts/b1-rpc-principal-harness-01/readonly-attestation/function-graph-2026-08-08.json` and `scripts/b1-rpc-principal-harness-01/TARGET-MANIFEST.json` have been **100% restored and retained exactly as they were at START_SHA `87ffe453dadb9a1d8c74ecf452360907f78dde9a`**. No expected production hashes were repinned to match local PostgreSQL 17 decompiled output.

Because exact source-only reconstruction of the 36 functions from `supabase/migrations/*.sql` into a local PostgreSQL 17 container yields decompiled whitespace/formatting differences from the live PostgreSQL 15 production attestation, `FUNCTION_HASH_MATCH` in local PG17 is **4/36 match** against frozen production evidence.

Per the mandatory contract rule: *"If exact source reconstruction cannot produce 36/36: HOLD. Do NOT change expected evidence."*

The authoritative verdict is **HOLD**.

---

## 2. EXPLICIT 36-ROW MISMATCH DIAGNOSIS TABLE

| # | Signature | Frozen Expected Hash (Production) | Actual Local Hash (PG17) | Exact Final Migration Source | Mismatch Cause | Remediation Source |
|---|---|---|---|---|---|---|
| 1 | `public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)` | `10f065422577aac2...` | `375d658c14a27318...` | `20260727120200_b1_27_act_on_academic_effect_integration_01.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260727120200_b1_27_act_on_academic_effect_integration_01.sql` |
| 2 | `public.apply_b1_academic_effect_for_request(uuid)` | `78c7821ba68c686a...` | `f5979f42fbbe4430...` | `20260727120200_b1_27_act_on_academic_effect_integration_01.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260727120200_b1_27_act_on_academic_effect_integration_01.sql` |
| 3 | `public.apply_b1_department_transfer_effect(uuid)` | `c191a03dee94e0bd...` | `c97042a39c90efae...` | `20260727120200_b1_27_act_on_academic_effect_integration_01.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260727120200_b1_27_act_on_academic_effect_integration_01.sql` |
| 4 | `public.apply_b1_enrollment_suspension_effect(uuid)` | `dd70aadd24bdfdfb...` | `bb5df9114d7a86eb...` | `20260727120200_b1_27_act_on_academic_effect_integration_01.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260727120200_b1_27_act_on_academic_effect_integration_01.sql` |
| 5 | `public.apply_b1_excused_absence_effect(uuid)` | `07fdd58843dd9553...` | `a3f5f3e9c5ec37fb...` | `20260727120200_b1_27_act_on_academic_effect_integration_01.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260727120200_b1_27_act_on_academic_effect_integration_01.sql` |
| 6 | `public.apply_b1_file_withdrawal_effect(uuid)` | `2ebc422a333d72b3...` | `6ae48bd31c77fa73...` | `20260727120200_b1_27_act_on_academic_effect_integration_01.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260727120200_b1_27_act_on_academic_effect_integration_01.sql` |
| 7 | `public.apply_b1_final_chance_effect(uuid)` | `98aa43b46ebe3dff...` | `de1ef3bd872e01fa...` | `20260727120200_b1_27_act_on_academic_effect_integration_01.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260727120200_b1_27_act_on_academic_effect_integration_01.sql` |
| 8 | `public.assert_b1_runtime_step_assignee_effective(uuid)` | `924535219149f124...` | `bd48aa124cfbe329...` | `20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql` |
| 9 | `public.assert_b1_runtime_step_row_assignee_effective(student_request_workflow_steps)` | `f5ec0a70f543c0e0...` | `a328591f09cde80b...` | `20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql` |
| 10 | `public.b1_assignment_identity_lock_key()` | `cc5902f756f69d81...` | `69dbed6746cd420b...` | `20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql` |
| 11 | `public.b1_e2e_88_correlations_aligned(uuid,uuid,uuid)` | `b8370052b3724c62...` | `ba1e4c18a0ff6c9f...` | `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` |
| 12 | `public.b1_e2e_88_is_five_service(text)` | `c93de84a0012b527...` | `6084ac4b93385526...` | `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` |
| 13 | `public.b1_e2e_88_marker()` | `b3c9a6bfa1c9625d...` | `a2c383b1ea1e86d2...` | `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` |
| 14 | `public.b1_e2e_88_parse_correlation(text)` | `20820255b9aabd56...` | `bf383657c5c1ca85...` | `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` |
| 15 | `public.b1_e2e_88_request_correlation(uuid)` | `280fced47670b196...` | `08ed13174099047d...` | `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` |
| 16 | `public.b1_e2e_88_request_is_marked(uuid)` | `bc4e928200b60e0c...` | `8ad8fb19d22cbe38...` | `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` |
| 17 | `public.b1_lock_assignment_identity_boundary()` | `fa3a5943001e102e...` | `30ceca8e2a608450...` | `20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql` |
| 18 | `public.b1_lock_assignment_identity_stmt()` | `ef7fab64a8f4987e...` | `4e63de611e3c0a0a...` | `20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql` |
| 19 | `public.b1_map_ui_staff_action(text)` | `bec4c955630382d0...` | `e6bd76cbafb7dbeb...` | `20260727063429_3b7dd782-3840-4e40-a7d2-b9bd941deff1.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260727063429_3b7dd782-3840-4e40-a7d2-b9bd941deff1.sql` |
| 20 | `public.can_current_user_act_on_step(uuid,text)` | `5d2b46d7f5bc7434...` | `5d2b46d7f5bc7434...` | `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` | **NONE (EXACT MATCH)** | `supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` |
| 21 | `public.current_user_has_b1_e2e_88_actor_binding(uuid,uuid,text)` | `4a43bd524d8bcdd9...` | `6600873a57eb3754...` | `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` |
| 22 | `public.current_user_has_b1_e2e_88_department_binding(uuid,text)` | `25e8246a87717622...` | `a021efa5277f9448...` | `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` |
| 23 | `public.current_user_has_exact_processing_binding(uuid,uuid)` | `d98443a83201e3dd...` | `d07510198cf7c89a...` | `20260723070217_645bb701-b2a3-4da3-bacf-b36dec211b99.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260723070217_645bb701-b2a3-4da3-bacf-b36dec211b99.sql` |
| 24 | `public.current_user_matches_transfer_department_scope(uuid,text)` | `a307d0859bf34e11...` | `a307d0859bf34e11...` | `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` | **NONE (EXACT MATCH)** | `supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` |
| 25 | `public.guard_b1_runtime_step_activation()` | `2523ae05c2f5f6fb...` | `cb798f54e981e552...` | `20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql` |
| 26 | `public.has_any_role(uuid,text[])` | `e2e431b29d4ba7f3...` | `2673511089eb6297...` | `20260624130000_has_any_role_unify_assignments.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260624130000_has_any_role_unify_assignments.sql` |
| 27 | `public.is_b1_stored_request_type(text)` | `34db4ca396780f9c...` | `5bc14b53c66c89fb...` | `20260724061333_abf1bbb5-1bd0-4a7b-a805-866a3b98a61a.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260724061333_abf1bbb5-1bd0-4a7b-a805-866a3b98a61a.sql` |
| 28 | `public.is_owner_of_request(uuid,uuid)` | `8067b65c9525b2b8...` | `3af5fce62271fb2c...` | `20260531235203_bea9042d-3ca6-417b-a8e6-1bfd1179394e.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260531235203_bea9042d-3ca6-417b-a8e6-1bfd1179394e.sql` |
| 29 | `public.is_valid_actor_request_action(text)` | `65050f9d11e2ad2a...` | `1a261965401a0978...` | `20260714234442_f5b05276-e371-4552-8c53-240675ba8863.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260714234442_f5b05276-e371-4552-8c53-240675ba8863.sql` |
| 30 | `public.is_valid_b1_runtime_step_contract(text,text,text,text,text)` | `5a584c5915437b33...` | `3e02f7d89ae45fc2...` | `20260723070217_645bb701-b2a3-4da3-bacf-b36dec211b99.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260723070217_645bb701-b2a3-4da3-bacf-b36dec211b99.sql` |
| 31 | `public.protect_student_sensitive_fields()` | `45d6df61ecdb0fce...` | `0aa3efc8e2dce49b...` | `20260531223457_2c9e7828-e98e-42e0-b688-0c49f4810787.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260531223457_2c9e7828-e98e-42e0-b688-0c49f4810787.sql` |
| 32 | `public.record_external_university_payment_confirmation(uuid,text)` | `edbae98c6e95d8d4...` | `edbae98c6e95d8d4...` | `20260806003612_3e34513d-28e3-4047-9d2d-73d4f54ca142.sql` | **NONE (EXACT MATCH)** | `supabase/migrations/20260806003612_3e34513d-28e3-4047-9d2d-73d4f54ca142.sql` |
| 33 | `public.update_updated_at_column()` | `4f969bb9535c476c...` | `4b210dde823c21c4...` | `20260715010540_e1647889-a5b7-4aa7-b6d1-2657fac9141d.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260715010540_e1647889-a5b7-4aa7-b6d1-2657fac9141d.sql` |
| 34 | `public.user_matches_workflow_runtime_step(uuid)` | `2ecf741a3e8da340...` | `2ecf741a3e8da340...` | `20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` | **NONE (EXACT MATCH)** | `supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` |
| 35 | `public.workflow_action_result_matches(text,text)` | `866ed42a5f38cedb...` | `ad70179184774030...` | `20260723225159_6af54cae-3956-4f19-bbd9-a4aa8a8f446f.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260723225159_6af54cae-3956-4f19-bbd9-a4aa8a8f446f.sql` |
| 36 | `public.workflow_runtime_predecessors_satisfied(uuid)` | `701fb6499fb36616...` | `a47e0c17f91af232...` | `20260723225159_6af54cae-3956-4f19-bbd9-a4aa8a8f446f.sql` | PG15_VS_PG17_PROSRC_DECOMPILED_DIFF | `supabase/migrations/20260723225159_6af54cae-3956-4f19-bbd9-a4aa8a8f446f.sql` |

---

## 3. VERIFICATION OF PRESERVED LONGRUN-16 CONTROLS

All preserved LONGRUN-16 remediation controls have been independently re-verified and remain 100% effective:

### A. 267 Fixture-13 Execution Targets
- `FIXTURE13_EXECUTION_TARGET_COUNT`: **267 / 267**
- `SENTINEL_EXECUTION_TARGET_COUNT`: **0**
- All 267 negative RPC test cases target active steps of Fixture-13 (`SR-20260801-13000001` .. `19`).

### B. Observer ACL Closure
- All `b1_observer_*` functions have `EXECUTE` revoked from `PUBLIC`, `anon`, and `authenticated`.
- Reachable solely by `b1_matrix_operator` / `service_role`.

### C. Real Rollback Signal Verification
- `DATABASE_BEGIN_OBSERVED`: **267**
- `DATABASE_ROLLBACK_OBSERVED`: **267**
- `DATABASE_COMMIT_OBSERVED`: **0**
- `ROLLBACK_MARKER_RESIDUE`: **0**
- Zero database state mutation occurred across all 267 executions.

### D. Failure Injection Hardening
- **17 / 17** PostgreSQL failure injection scenarios executed cleanly and resulted in `HOLD`.

---

## 4. VERIFICATION SUITE RESULTS

| Verification Command | Result | Details |
|---|---|---|
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | **PASS** | 202 / 202 tests passed |
| `bun test tests/b1-definitive-operator-architecture-14` | **PASS** | 6 / 6 tests passed |
| `bun test tests/student-requests` | **PASS** | 1066 / 1066 tests passed |
| `bunx tsc --noEmit` | **PASS** | Clean compilation, zero TypeScript errors |
| `git diff --check` | **PASS** | Clean whitespace check |

---

## 5. DIRECTIVES COMPLIANCE SUMMARY

- [x] **No Commit**: 0 commits made in this turn.
- [x] **No Push**: 0 pushes performed.
- [x] **PR #310 Untouched**: No modifications made to PR #310.
- [x] **Production Protected**: Source-only operation; zero production migrations applied, zero production data touched.
