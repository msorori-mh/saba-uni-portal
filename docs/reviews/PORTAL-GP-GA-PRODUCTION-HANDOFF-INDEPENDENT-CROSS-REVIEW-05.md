.# PORTAL-GP-GA-PRODUCTION-HANDOFF-INDEPENDENT-CROSS-REVIEW-05

**Mission:** مراجعة مستقلة صارمة لحزمتي Production Go-Live (GP + GA) قبل أمر Lovable بالتطبيق الإنتاجي.  
**Mode:** READ-ONLY cross-review. لا source modification، لا migration modification، لا production write، لا apply، لا merge، لا deploy.  
**Worktree:** `C:/projects/saba-uni-portal-ga`  
**GA branch:** `feat/ga-final-closure-20260811`  
**GP branch:** `feat/gp-final-closure-20260811`

---

## Review Inputs (R0)

| Item | SHA / value |
|---|---|
| MAIN_ACTUAL | `92f717f53eaed8ca3a0f7d291a676666732e8ad8` |
| GP_HEAD_ACTUAL | `1d482b6484583b4a90119e0b09316bbd4aa2cecb` |
| GA_HEAD_ACTUAL | `0ac7efd10336e1d90fb79f7b221c90b15781c862` |
| GA merge-base with main | `2f8d8a16c038f400bff2a21cbf30dfdf405a1397` |
| GP merge-base with main | `140ca4ab3462e3d2a6a19551e6d5fa19d29d1cde` |

`origin/main` تقدم عن `dbfb1997ddd8c1fecc3c7ffbfa196358737b0beb` → `92f717f5…`.

---

## Handoff Documents Reviewed

| Project | Path | Branch |
|---|---|---|
| GP | `docs/reviews/PORTAL-GP-PRODUCTION-APPLY-AND-E2E-HANDOFF-04.md` | `origin/feat/gp-final-closure-20260811` |
| GA | `docs/reviews/PORTAL-GA-PRODUCTION-APPLY-AND-E2E-HANDOFF-04.md` | `origin/feat/ga-final-closure-20260811` |

---

## GP Migration Inventory (R2)

| Migration | Claimed status | Verified status | SHA256_LF FULL | Notes |
|---|---|---|---|---|
| `20260806235348_…` (SET U A1) | ALREADY_APPLIED | `NEEDS_PRODUCTION_VERIFY` / assumed applied | — | No hash in handoff; ledger-dependent. |
| `20260807000230_…` (SET U A2) | ALREADY_APPLIED | `NEEDS_PRODUCTION_VERIFY` / assumed applied | — | — |
| `20260807001114_…` (SET U A3) | ALREADY_APPLIED | `NEEDS_PRODUCTION_VERIFY` / assumed applied | — | — |
| `20260807023229_…` (SET U A4) | ALREADY_APPLIED | `NEEDS_PRODUCTION_VERIFY` / assumed applied | — | — |
| `20260808010000_gp_student_level4_only_eligibility_guard_01.sql` | ALREADY_APPLIED | `OBJECTS_CONFIRMED` via handoff preflight | `5815d99f…` | BODY hash matches handoff (`9e0422f8…`). |
| `20260811010000_gp_identity_options_and_revision_notes_01.sql` | PENDING_REQUIRED_GP | `PENDING_REQUIRED_GP` | `1af08a71…` | Hash matches handoff. Forward-only function replace. |
| `20260811020000_gp_independent_security_audit_remediation_02.sql` | PENDING_REQUIRED_GP | `PENDING_REQUIRED_GP` | `cb9efc49…` | Hash matches handoff. Adds `evaluation_round` columns, replaces lifecycle RPCs. |
| SET N duplicates | DO_NOT_APPLY | `DO_NOT_APPLY` | — | Confirmed quarantined under `docs/migration-evidence/graduation-projects/duplicate-predecessor-set/`. |

**Key issue:** Handoff §A asserts `origin/main = 140ca4ab3462e3d2a6e19551e6d5fa19d29d1cde` (= old merge-base). Actual `origin/main = 92f717f5…` has advanced and contains additional migrations relevant to GP.

---

## GA Migration Inventory (R3)

| Migration | Claimed status | Verified status | SHA256_LF FULL | Notes |
|---|---|---|---|---|
| `20260808210000_ga_mvp_foundation_01.sql` | ALREADY_APPLIED_PRODUCTION | `OBJECTS_CONFIRMED / LEDGER_ALIAS_NOT_CANONICAL` | `3248cf64…` | Hash matches manifest. Production has objects via managed alias `20260810124407:2802e1fa-…`; canonical ledger entry ABSENT. |
| `20260808210100_ga_mvp_completion_01.sql` | ALREADY_APPLIED_PRODUCTION | `OBJECTS_CONFIRMED / LEDGER_ALIAS_NOT_CANONICAL` | `3e37afba…` | Production alias `20260810124539:7c7f84cf-…`; canonical ledger entry ABSENT. |
| `20260808210200_ga_authorization_04.sql` | ALREADY_APPLIED_PRODUCTION | `OBJECTS_CONFIRMED / LEDGER_ALIAS_NOT_CANONICAL` | `212865fb…` | Production alias `20260810162735:d239a40c-…`; canonical ledger entry ABSENT. |
| `20260811230000_ga_independent_security_audit_remediation_02.sql` | PENDING_REQUIRED_GA | `PENDING_REQUIRED_GA` | `46f0974a…` | Hash matches handoff. |

**Evidence source:** `docs/go-live/operator-packets/GA-PRODUCTION-STATUS.txt` (captured 2026-08-10 via Lovable read-only query). Alias files exist in both `origin/main` and GA branch (`supabase/migrations/20260810124407_…`, `20260810124539_…`, `20260810162735_…`).

**Important:** The canonical filenames must **not** be re-applied. The handoff’s `VERIFY foundation → APPLY if missing` path would fail the precheck because `graduate_records` already exists, and re-applying would raise `GA_FOUNDATION_PREFLIGHT_ALREADY_APPLIED`. A ledger-reconciliation step is required first.

---

## Latest Main Relevant Migrations (R4)

`origin/main = 92f717f5…` contains migrations not on GP branch and not fully accounted for in either handoff.

| Migration | Classification | Relevance |
|---|---|---|
| `20260809183940_e3eff340-d709-46e7-911b-1728767e4f41.sql` | `ALREADY_IN_SOURCE_MAIN`, `DEPENDENCY_FOR_GP`, `NEEDS_PRODUCTION_VERIFY` | Hardens `search_path` on 4 GP security helpers: `gp_proposal_complete`, `guard_graduation_project_assignment`, `is_safe_graduation_project_object_key`, `reject_graduation_project_event_mutation`. Also changes `site_settings` RLS policies (admin/system_admin `has_any_role`). GP handoff does not mention this migration. |
| `20260811002641_59092f2b-950b-4fbd-85bd-b8d248851ae7.sql` | `ALREADY_IN_SOURCE_MAIN`, `NO_DEPENDENCY` (functional), `MERGE_BLOCKER` (source) | Creates `create_council_notification(...)` for council `decision_issued` events. Functionally independent of GP/GA, but missing from both GP and GA branches. Timestamp falls **between** GP Step 1 (`20260811010000`) and Step 2 (`20260811020000`). |
| `20260810124407_2802e1fa-…` | `ALREADY_IN_SOURCE_MAIN`, `DEPENDENCY_FOR_GA`, `LEDGER_CONFIRMED` | Managed alias of GA1 foundation. |
| `20260810124539_7c7f84cf-…` | `ALREADY_IN_SOURCE_MAIN`, `DEPENDENCY_FOR_GA`, `LEDGER_CONFIRMED` | Managed alias of GA2 completion. |
| `20260810162735_d239a40c-…` | `ALREADY_IN_SOURCE_MAIN`, `DEPENDENCY_FOR_GA`, `LEDGER_CONFIRMED` | Managed alias of GA3 AUTH04. |
| Councils C1–C9 re-promotions (`20260810003111…20260810180000…`) | `ALREADY_IN_SOURCE_MAIN`, `NO_DEPENDENCY` | Academic-councils only; no GP/GA table overlap. |

---

## Cross-Migration Dependency DAG (R5)

```
[main baseline: SET U A1-A4]
           │
           ▼
[main: 20260808010000 L4 guard] ──► [GP Step 1: 20260811010000 identity+notes]
           │                                              │
           │                                              ▼
           │                         [GP Step 2: 20260811020000 remediation-02]
           │
           ▼
[main: GA alias foundation 20260810124407]
           │
           ▼
[main: GA alias completion 20260810124539]
           │
           ▼
[main: GA alias auth04 20260810162735]
           │
           ▼
[GA: 20260811230000 remediation-02]

[main: 20260809183940 GP search_path hardening] ──depends on──► [SET U + L4 functions]

[main: 20260811002641 council notification] ──independent──► [GP Step1/Step2, GA remediation]
```

**Rule:** Functional dependencies are few; ledger ordering is the real constraint. `20260811002641` has a timestamp between GP Step1 and Step2 but is functionally independent.

---

## Canonical Production Apply Order (R6)

Assuming production follows `origin/main` (`92f717f5…`):

| Step | Migration / Action | Why now | Precheck | Postcheck | Stop condition |
|---|---|---|---|---|---|
| 0 | Ledger snapshot | Baseline | `SELECT * FROM supabase_migrations.schema_migrations ORDER BY version;` | Recorded | N/A |
| 1 | Verify main migrations up to `20260809183940` | GP hardening must be present before GP lifecycle | `to_regprocedure('public.gp_proposal_complete(graduation_projects)')` has `search_path = public, pg_temp` | Confirmed | Missing / wrong search_path |
| 2 | Verify `20260811002641` council notification | Main ledger completeness | `to_regprocedure('public.create_council_notification(uuid,text,uuid,uuid,text,uuid,text,text,jsonb)')` is not null | Confirmed | Missing |
| 3 | Verify GA alias foundation objects | Ensure GA1 already applied via alias | `to_regclass('public.graduate_records')` not null + alias ledger row exists | Confirmed | Missing objects or missing alias row |
| 4 | Verify GA alias completion objects | Ensure GA2 already applied via alias | `to_regclass('public.graduate_followups')` not null + alias ledger row exists | Confirmed | Missing |
| 5 | Verify GA alias auth04 objects | Ensure GA3 already applied via alias | `graduate_affairs_is_manager()` exists + alias ledger row exists | Confirmed | Missing |
| 6 | Verify GP SET U + L4 | Foundation for GP steps | Ledger rows for SET U A1-A4 and L4; `student_is_current_fourth_academic_level(uuid)` exists | Confirmed | Missing |
| 7 | Apply GP Step1 `20260811010000` | Pending GP identity/notes | 4-arg conclude present, 5-arg absent, ledger row absent | 5-arg present, 4-arg gone, ledger row present | Precheck fail / hash mismatch |
| 8 | Apply GP Step2 `20260811020000` | Pending GP remediation | Step1 postcheck pass, `evaluation_round` columns absent, ledger row absent | Columns present, round unique constraint present, `gp_current_revision_final_ready` exists, ledger row present | Precheck fail / hash mismatch / partial apply |
| 9 | Apply GA remediation-02 `20260811230000` | Pending GA security fix | AUTH04 objects present, `graduate_validate_survey_answers` absent | New logic present in replaced functions, validator revoked | Precheck fail / signature mismatch |
| 10 | Ledger reconciliation | Map alias versions to canonical logical versions | Alias rows present | Document mapping; do NOT insert duplicate canonical rows without Lovable approval | N/A |

If production does **not** follow `origin/main`, Steps 1–6 must be executed (apply or verify) in timestamp order before GP/GA pending steps.

---

## Precheck Quality Review (R7)

| # | Issue | Severity | Project | Evidence |
|---|---|---|---|---|
| 1 | Handoffs written against stale `origin/main`; do not account for `20260809183940` GP hardening or `20260811002641` council notification. | CRITICAL | GP/GA | GP handoff §A line 6; GA handoff §A |
| 2 | GA foundation precheck assumes `graduate_records` does not exist; does not handle alias-applied state. Could confuse operator. | HIGH | GA | `PORTAL-GA-…HANDOFF-04.md:99-117` |
| 3 | GP Step2 performs `UPDATE … SET status='active' WHERE status IS NULL` on `student_profiles`/`faculty_profiles` with no row-count precheck. | HIGH | GP | `20260811020000…` lines 91–92 |
| 4 | GP Step2 drops old unique constraint and adds round-aware unique without checking existing duplicate `(discussion_id, panel_member_id)` pairs. | MEDIUM | GP | `20260811020000…` lines 40–74 |
| 5 | GP Step2 precheck does not verify `gp_current_revision_final_ready` is absent. | LOW | GP | Handoff §C lines 109–116 |
| 6 | GA remediation postcheck uses `prosrc LIKE '%...%'` which can be satisfied by comments. | MEDIUM | GA | `PORTAL-GA-…HANDOFF-04.md:301-331` |
| 7 | GA AUTH04 postcheck counts policies/RPCs but does not assert exact `USING` expressions or internal-helper grants. | MEDIUM | GA | `PORTAL-GA-…HANDOFF-04.md:231-273` |
| 8 | GA duplicate approved-record check is post-apply drift query, not a precheck. | HIGH | GA | `PORTAL-GA-…HANDOFF-04.md:401-411` |

---

## Postcheck Quality Review (R8)

| # | Issue | Severity | Project | Evidence |
|---|---|---|---|---|
| 1 | GA foundation postcheck counts tables/RLS but does not verify column sets, FKs, partial unique index, or revoke on `create_graduate_record_from_official_decision`. | MEDIUM | GA | `PORTAL-GA-…HANDOFF-04.md:123-159` |
| 2 | GP postchecks use `position('archive' in pg_get_functiondef(...)) > 0`; brittle (matches comments/variables). | LOW | GP | `PORTAL-GP-…HANDOFF-04.md:163-175` |
| 3 | GP postcheck does not verify `evaluation_round` default value or `viewer_is_leader` key. | LOW | GP | `PORTAL-GP-…HANDOFF-04.md:163-175` |
| 4 | GA internal-revoke check is complex; simpler `has_function_privilege('authenticated', …, 'EXECUTE') = false` would be clearer. | LOW | GA | `PORTAL-GA-…HANDOFF-04.md:257-268` |

---

## GP Actor Matrix (R9)

| Role | Candidate | SAFE_FOR_E2E | Reason |
|---|---|---|---|
| L4 student leader | `gp-e2e01-leader@…` | NO | Banned TEST_ONLY actor. |
| L4 team member | `gp-e2e01-member_a/b@…` | NO | Banned. |
| Supervisor | `gp-e2e01-supervisor@…` | NO | Banned; referenced on archived projects. |
| Dept coordinator | `gp-e2e01-coordinator@…` | NO | Banned; sole live coordinator row. |
| Committee | `gp-e2e01-committee_1/2@…` | NO | Banned. |
| L1 TEST students | 3 listed | YES — DENY-only | Usable for negative eligibility probes only. |
| Real L4 students (~59) | — | NO | Operational records; not for mutation E2E. |

**Verdict:**
- `GP_POSITIVE_E2E_READY` = **NO**
- `GP_NEGATIVE_E2E_READY` = **PARTIAL** (L1 TEST students can run eligibility/route-guard denials)
- `GP_ACTOR_BLOCKER` = No authorized, non-banned, TEST_ONLY GP lifecycle principals exist.

The GP handoff correctly blocks all banned principals and does not propose reactivation. ✅

---

## GA Actor Matrix (R10)

| Role | Candidate | SAFE_FOR_E2E | Reason |
|---|---|---|---|
| Graduate self-service | Any with exactly one approved record + approved continuity policy | YES (if exists) | Self-service positive path. |
| Manager | `f463a79b-…` (محمد شوقي) | YES | Active GA manager assignment. |
| Specialist real | `aa4f5c16-c993-4af6-a6d4-59d9542c1a7f` | NO | Unscoped; zero `staff_profile_departments` rows. `AMBIGUOUS_SPECIALIST_DO_NOT_SCOPE`. |
| Specialist TEST_ONLY | `a6e30100-0000-4000-a300-000000000001` | YES — after authorized write | Fixture at `docs/production-test-fixtures/GA-SPECIALIST-SINGLE-DEPT-TESTONLY-FIXTURE-01.sql`. |

**Fixture analysis:**
- Default mode: dry-run / ROLLBACK.
- Execute mode requires `SET ga.specialist_fixture.execute = 'true'` and pre-provisioned auth user.
- Performs DML into `staff_profiles`, `staff_profile_departments`, `request_processing_assignments`.
- Refuses to mutate the ambiguous real specialist.

**Verdict:**
- `GA_ACTOR_FIXTURE_REQUIRES_SEPARATE_AUTHORIZED_WRITE` = **YES**
- `GA_POSITIVE_E2E_READY` = **PARTIAL** (graduate + manager possible; specialist blocked without fixture)
- `GA_NEGATIVE_E2E_READY` = **PARTIAL** (role/scope denials documented)
- `GA_ACTOR_BLOCKER` = No safe real specialist; E2E depends on owner-gated TEST_ONLY fixture write.

---

## Actor Isolation Policy (R11)

**Decision:** `SEPARATE_E2E_ACTOR_SETS` remains the correct policy.

Rationale:
- GP and GA have distinct lifecycle identities (student vs. graduate).
- Reusing the same user as both an L4 student and a graduate could create `student_profile` / `graduate_record` ambiguity.
- Department-scope contamination risk: a staff member bound to GA `staff_profile_departments` should not be reused for GP coordinator roles.
- Historical workflow contamination: banned `gp-e2e01-*` actors must not be reused for GA.

**E2E_ACTOR_POLICY:** GP actors and GA actors must be provisioned in separate namespaces; no shared principals across the two go-live E2E suites.

---

## GP E2E Completeness (R12)

| Journey | Covered | Note |
|---|---|---|
| L4 eligibility / route guard | ✓ | Negative with L1 TEST students. |
| Team creation / membership | ✓ | `create_graduation_project_team`, `add_graduation_project_team_member`. |
| Proposal / files | ✓ | `upsert…proposal`, `register/finalize file`, `submit…proposal`. |
| Supervisor assignment / acceptance | ✓ | `assign…supervisor`, `respond…supervision`. |
| Progress / review | ✓ | `submit…progress`, `review…progress`. |
| Department decisions | ✓ | `review…proposal`, `conclude…result`. |
| Defense scheduling / committee | ✓ | `schedule…defense`, `assign…committee_member`. |
| Evaluation / evaluation_round | ✓ | Step 2 columns + current-round binding. |
| Revisions_required / resubmission / new round | ✓ | Handoff §H.18-20. |
| Archive / archived detail | ✓ | `archive_graduation_project` deny/allow logic. |
| Signed download authorization | ✓ | `create_graduation_project_signed_download`. |
| Stale evidence denial | ✓ | `gp_current_revision_final_ready`. |

**Gaps:**
- Handoff references `tests/graduation-projects/graduation-projects-revisions-loop-e2e.test.ts` and `tests/graduation-projects/gp-independent-security-audit-remediation-02.test.ts`; neither file exists on the branch. Logic is covered by SQL verifiers, but test inventory is inconsistent. **MEDIUM**.
- `add_graduation_project_team_member` does not enforce program/department match; contradicts E2E claim “wrong department / program DENY”. **MEDIUM**.

**Overall:** `GP_E2E_COMPLETENESS` = **PARTIAL** — lifecycle journeys documented, but positive execution blocked by actor matrix.

---

## GA E2E Completeness (R13)

| Journey | Covered | Note |
|---|---|---|
| Self-context / graduate record | ✓ | `graduate_affairs_resolve_self_context`. |
| Opportunities / events / audience filtering | ✓ | `graduate_list_visible_opportunities`, `graduate_list_visible_events`. |
| Event registration | ✓ | H02 negative cases included. |
| Survey visibility / validation / response | ✓ | M04 negative cases included. |
| Follow-ups (manager) | ✓ | Create + transition. |
| Manager / specialist workspace | ✓ | Search, file open, scope denial. |
| Negative security matrix | ✓ | N1-N8. |

**Missing / incomplete:**
- **Official intake / creation of `graduate_official_decisions`**: the entire GA domain depends on approved official decisions, but no E2E step creates them. **HIGH**.
- **Account continuity policy approval**: self-service requires approved policy; no staff RPC/E2E step creates/supersedes it. **HIGH**.
- **Communication events**: table exists with consent/contact guards, but no staff mutation path in AUTH04 or E2E packet. **MEDIUM**.
- **Cancel event registration / withdraw survey response / update own profile / cohort report**: RPCs exist but not exercised. **MEDIUM**.
- **Feature-flag-off negative path**: not covered. **LOW**.
- **Protected-value leakage check**: no explicit assertion that `protected_value` / `notes_protected` never appear in responses. **MEDIUM**.

**Overall:** `GA_E2E_COMPLETENESS` = **PARTIAL** — core self/staff journeys covered, but source-fact creation and continuity policy are missing.

---

## Cross-Domain Security Review (R14)

- **GP authority → GA:** No shared functions or role assignments. GP uses `graduation_project_*` RPCs and L4 eligibility; GA uses `graduate_affairs_*` assignment-based roles. No cross-over found.
- **GA authority → GP:** No cross-over found.
- **Admin/dean bypass:** Both projects rely on assignment-based roles, not app-role. The main migration `20260809183940` adds `has_any_role(admin, system_admin)` on `site_settings` SELECT only; this does not grant GP/GA operational authority.
- **Department-head unintended bypass:** Councils migrations add department-head memberships, but these are separate from GA specialist scope or GP coordinator scope.
- **Shared service-role server function misuse:** No evidence of shared mutating server functions.
- **Client direct mutation:** Both projects use RLS default-deny and RPC-only mutation paths.

**Verdict:** No CRITICAL/HIGH cross-domain security finding. The main risk is **source divergence** (missing main migration in branches), not privilege escalation.

---

## Production Test-Data Governance (R15)

| Fixture / actor set | CREATE_NEEDED | RETIREMENT_PLAN | SAFE |
|---|---|---|---|
| GP `gp-e2e01-*` | Already exist but **banned** | Do not reactivate; historical archived projects retained for audit | NO for reuse |
| GP L1 TEST students (negative probes) | Already exist | No mutation; read-only eligibility denials | YES — DENY-only |
| GA `GA-SPECIALIST-SINGLE-DEPT-TESTONLY-FIXTURE-01.sql` | YES — requires owner-gated write + pre-provisioned auth user | Fixture default is ROLLBACK; execute only under explicit lease; retirement via deactivation/deletion outside this packet | YES **only** under authorized single-writer lease |
| GA real manager | Already exists | Operational HR lifecycle | YES |
| GA real graduate | Data-dependent | Operational academic lifecycle | YES if exactly one approved record |

**Concerns:**
- GP handoff correctly refuses to unban `gp-e2e01-*` actors. ✅
- GA fixture requires explicit owner runtime grant and single-writer lease; this is documented. ✅
- No cleanup strategy is given for the TEST_ONLY specialist after E2E; recommend deactivation (not hard-delete) to preserve audit history.

---

## Lovable Executability (R16)

**Verdict:** `LOVABLE_EXECUTABILITY = HOLD`

Reasons:
1. Both handoffs are stale against current `origin/main` (`92f717f5…`).
2. GA handoff misclassifies alias-applied state as `ALREADY_APPLIED_PRODUCTION` for canonical filenames; could mislead operator.
3. GP handoff omits main-only GP hardening migration and timestamp-interleaved council migration.
4. Actor blockers are real: GP has no safe positive principals; GA specialist requires authorized fixture write.
5. E2E packets have gaps (official intake, continuity policy, communication events, etc.).

Lovable **cannot** execute the handoffs sequentially without first reconciling branch drift and ledger aliases.

---

## Main Drift Reconciliation (R17)

`MAIN_DRIFT_REQUIRES_POST_REVIEW_RECONCILIATION = YES`

- GA branch is 21 commits behind `origin/main`.
- GP branch is 57 commits behind `origin/main`.
- Both branches are missing `20260811002641_59092f2b-…` (council notification) and council-related source changes.
- GP branch is additionally missing `20260809183940_…` (GP search_path hardening).
- The drift is **not** a source conflict, but it is a **merge/source-consistency blocker** that must be resolved by Cursor’s parallel mission before either handoff can be declared executable.

---

## Findings Classification (R18)

### CRITICAL (2)

1. **GP/GA handoffs stale vs. `origin/main`.** Both handoffs were written against older main states and do not account for `20260809183940` (GP hardening) or `20260811002641` (council notification). The GA branch is missing these source changes entirely.
2. **GA branch divergence is a merge blocker.** Missing `20260811002641` and council source changes means merging GA as-is would drop production-ready code.

### HIGH (5)

3. **GA ledger alias mismatch.** Production has GA1/GA2/GA3 objects via managed aliases, but canonical ledger entries are absent. Handoff labels canonical files `ALREADY_APPLIED_PRODUCTION`, risking re-application or precheck confusion.
4. **GA actor blocker — no safe real specialist.** Specialist E2E depends on owner-gated TEST_ONLY fixture write.
5. **GA missing source-fact E2E journeys.** No official-decision intake or continuity-policy approval steps; full go-live sign-off impossible without them.
6. **GP Step2 backfills `status='active'` without row-count precheck.** Production data mutation with no scope verification.
7. **GA foundation precheck does not support alias-applied state.** It assumes `graduate_records` does not exist.

### MEDIUM (5)

8. GP `add_graduation_project_team_member` program/department scoping gap vs. E2E claim.
9. GP Step2 unique-constraint change without duplicate-pair precheck.
10. GA remediation postcheck uses brittle `prosrc LIKE` assertions.
11. GA AUTH04 postcheck does not assert exact policy `USING` expressions.
12. GA/GP handoffs reference non-existent test files.

### LOW (3)

13. GP postchecks use `position()` in function source.
14. GP Step2 precheck does not verify `gp_current_revision_final_ready` absence.
15. GA internal-revoke check is overly complex; could be simplified.

---

## Report Summary

| Field | Value |
|---|---|
| MAIN_ACTUAL | `92f717f53eaed8ca3a0f7d291a676666732e8ad8` |
| GP_HEAD | `1d482b6484583b4a90119e0b09316bbd4aa2cecb` |
| GA_HEAD | `0ac7efd10336e1d90fb79f7b221c90b15781c862` |
| GP_HANDOFF | `docs/reviews/PORTAL-GP-PRODUCTION-APPLY-AND-E2E-HANDOFF-04.md` |
| GA_HANDOFF | `docs/reviews/PORTAL-GA-PRODUCTION-APPLY-AND-E2E-HANDOFF-04.md` |
| GP_MIGRATION_INVENTORY | Verified; hashes match; 2 pending; main-only hardening missing from handoff |
| GA_MIGRATION_INVENTORY | Verified; hashes match; canonical files are alias-applied, not ledger-applied |
| LATEST_MAIN_RELEVANT_MIGRATIONS | `20260809183940_e3eff340-…` (GP hardening), `20260811002641_59092f2b-…` (council notification), GA alias migrations |
| CROSS_MIGRATION_DAG | See §R5 |
| CANONICAL_PRODUCTION_APPLY_ORDER | See §R6 |
| GP_PRECHECK_QUALITY | Has gaps; see §R7 |
| GA_PRECHECK_QUALITY | Has gaps; see §R7 |
| GP_POSTCHECK_QUALITY | Brittle `position()` checks; see §R8 |
| GA_POSTCHECK_QUALITY | Incomplete object/grant assertions; see §R8 |
| GP_POSITIVE_E2E_READY | NO |
| GP_NEGATIVE_E2E_READY | PARTIAL (L1 TEST deny-only) |
| GP_ACTOR_BLOCKER | No safe L4 lifecycle principals |
| GA_POSITIVE_E2E_READY | PARTIAL (specialist blocked) |
| GA_NEGATIVE_E2E_READY | PARTIAL |
| GA_ACTOR_BLOCKER | No safe real specialist; fixture requires authorized write |
| E2E_ACTOR_POLICY | SEPARATE_E2E_ACTOR_SETS |
| GP_E2E_COMPLETENESS | PARTIAL (lifecycle documented, actor-blocked, minor gaps) |
| GA_E2E_COMPLETENESS | PARTIAL (core covered, missing official-intake/continuity/communication) |
| CROSS_SECURITY | No privilege-escalation finding; risk is source divergence |
| TEST_DATA_GOVERNANCE | GP banned actors respected; GA fixture requires owner lease |
| LOVABLE_EXECUTABILITY | HOLD |
| MAIN_DRIFT_REQUIRES_POST_REVIEW_RECONCILIATION | YES |
| CRITICAL_COUNT | 2 |
| HIGH_COUNT | 5 |
| MEDIUM_COUNT | 5 |
| LOW_COUNT | 3 |

---

## Final Decision (R20)

```text
HOLD_PORTAL_GP_GA_PRODUCTION_HANDOFF_CROSS_REVIEW_MAIN_DRIFT_AND_LEDGER_ALIAS
```

**Rationale:**
- There are CRITICAL findings (stale handoffs vs. current `origin/main`, GA branch merge blocker).
- There are HIGH findings (ledger alias mismatch, actor blockers, missing E2E source-fact journeys, unscoped production data backfill).
- Migration order itself is sound once drift is reconciled, but prechecks/postchecks need strengthening.
- Actor blockers are correctly documented, but they block positive Production E2E.

**Required before PASS:**
1. Reconcile `feat/ga-final-closure-20260811` and `feat/gp-final-closure-20260811` with current `origin/main` (`92f717f5…`).
2. Update handoffs to reflect alias-applied GA state and include main-only migrations in drift/apply order.
3. Strengthen prechecks for alias state, duplicate records, and backfill row counts.
4. Close actor blockers via owner-gated TEST_ONLY fixture provisioning (or real scoped specialist for GA; authorized GP actor set for GP).
5. Expand GA E2E packet to cover official-decision intake and continuity-policy approval.

**Commitments preserved:**
- PRODUCTION_WRITE = 0
- PRODUCTION_RPC_MUTATIONS = 0
- MIGRATION_APPLY = 0
- MERGE = NO
- DEPLOY = NO
