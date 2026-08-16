# PORTAL_REFORM_P1_CONTROLLED_PRODUCTION_APPLY_06

**VERDICT: HOLD_PORTAL_REFORM_P1_CONTROLLED_PRODUCTION_APPLY_06_P1_03_WORKFLOW_STATUS_CHECK_CONSTRAINT_REJECTS_PUBLISHED**

Date (UTC): 2026-08-16
Authorization: EXPLICIT_PRODUCTION_MIGRATION_APPLY=YES (this mission only)
Deployed source: `3e47c1c65235f70198a507feb33b825814ab64af` (unchanged; no deploy/publish performed)

---

## 1. Pre-write gate — PASS

Hash contract: `SHA256_LF_NORMALIZED_V1`.

| File | Recomputed | Frozen | Match |
|---|---|---|---|
| P1-01-DETAIL-MODELS.sql | 5bfa4b15f9548d281f80fef7f9b8bfb5b064305eca45308aeaf1b302eff76648 | same | YES |
| P1-02-BACKEND-VALIDATION.sql | 02dfcf494816327419169f678b6375232892cef95d087f09cd75dbfb3ffbe9be | same | YES |
| P1-03-WORKFLOW-SEEDS.sql | 4d0d3ad825a43b26a01951cac9be3b351ebf7830086b4721dd123c116fed2b19 | same | YES |
| P1-04-GRADE-APPEAL-TRIGGER-REPLACE.sql | d9b2bc25d96bbfd93540f1645d147622ce7a7deadc82fe0248422eb5ae5f6337 | same | YES |
| P1-05-PASS-THRESHOLD-48.sql | bb43939df053c81ba82b1bb8806ba252da89854c8be671e85757cd9a0f9d679f | same | YES |

PACKAGE_SHA256 = `949094b2c312db8a23d653296a821a9844e980d9d51d7440dcae7f2110d94905` — MATCH
(derivation: SHA256 over the five per-file digests joined by `\n`, trailing `\n`).

Runtime identity: `/version.json` = `<meta name="build-sha">` = `3e47c1c65235f70198a507feb33b825814ab64af` — MATCH.

Read-only preflight: worktree clean; `has_any_role` and `update_updated_at_column` present;
`october_exam_entry_details` / `replacement_card_details` absent (P1 not previously applied);
`grade_appeal` request type absent; visible service set = 6 (unchanged baseline).

SAFE_TO_APPLY = YES.

---

## 2. P1-01 — APPLIED, POST-VERIFY PASS

- `october_exam_entry_details` = EXISTS
- `replacement_card_details` = EXISTS
- `grade_appeal_details` evolution = PASS (all 8 columns: appeal_kind, course_id,
  final_result_published_at, appeal_window_end, previous_final_result,
  approved_final_result, result_change_applied_at, result_change_applied_by;
  `grade_appeal_details_kind_chk` present)
- RLS = PASS (enabled on both tables; 2 policies each, **SELECT only**, `TO authenticated`;
  `anon` has no policy → fail-closed read)
- NO_UNEXPECTED_CLIENT_WRITE = PASS (zero INSERT/UPDATE/DELETE policies)
- REAL_BUSINESS_DATA_CHANGED = 0

**Documented environmental deviation (not a blocker):** this project has schema-wide
`ALTER DEFAULT PRIVILEGES` that grant broad table privileges to `anon`/`authenticated`
on every new `public` table (identical to all pre-existing tables, e.g. `grade_appeal_details`).
The frozen `GRANT SELECT`-only intent is therefore superseded at ACL level, but write access
remains fail-closed through RLS because no write policy exists. Same applies to function
`EXECUTE` ACLs in P1-02.

---

## 3. P1-02 — APPLIED, POST-VERIFY PASS

All 12 functions installed, all `SECURITY DEFINER`, all `STABLE`, `search_path = public`:

p1_active_student_profile, p1_current_level_number, p1_enrollment_result,
p1_passed_course_ids, p1_october_remaining_requirements, p1_assert_october_eligibility,
p1_assert_replacement_card_eligibility, p1_final_result_published_at,
p1_assert_final_result_appeal_eligibility, p1_assert_department_transfer_level,
p1_assert_step_actor, p1_assert_payment_confirmed.

**SOURCE_EQUIVALENCE = PASS (12/12).** Each installed `prosrc` is byte-identical
(SHA256) to the corresponding body in the frozen draft, so the behavioural matrix proven in
`PORTAL_REFORM_P1_FIVE_MIGRATION_FINAL_REHEARSAL_AND_PRODUCTION_GATE_05` (PG17, 36 cases:
Level4+≤4 ALLOW / >4 DENY / non-Level4 DENY / 47.99 outstanding / 48+ passed /
manipulated selection DENY; replacement card active + duplicate DENY; transfer Level1 DENY;
appeal own-published-only + 7-day window + duplicate DENY) applies unchanged to the
installed objects.

Direct behavioural execution against production was **not** performed by design and by
constraint: the available read roles cannot `EXECUTE` these functions
(`permission denied for function …`), and exercising them with new data would have required
creating student requests / grades, which this mission forbids.
DIRECT_RPC_BYPASS = ZERO (no role-based bypass path exists in `p1_assert_step_actor`;
direct assignment or exact unit+role binding only).

---

## 4. P1-03 — FAILED, ROLLED BACK — **MISSION BLOCKER**

Exact production error:

```
ERROR: 23514: new row for relation "request_type_workflows"
violates check constraint "request_type_workflows_status_chk"
DETAIL: Failing row contains (…, october_exam_entry_form_v1, …, 1, published, t, …)
CONTEXT: PL/pgSQL function p1_seed_workflow(text,text,text,jsonb) line 17
```

Root cause:

```sql
-- production constraint
CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text]))
```

The frozen P1-03 seeds `status = 'published'`, which production rejects. The rehearsal
cluster did not carry this constraint, so the mismatch was invisible in PG17.

Post-failure state verification (fully rolled back, **no partial apply**):

- `request_types.grade_appeal` = ABSENT
- `request_processing_roles.course_instructor` (department) = ABSENT
- workflows `october_exam_entry_form_v1` / `replacement_student_card_v1` /
  `final_result_appeal_v1` = ABSENT
- helper `p1_seed_workflow` = ABSENT (not left behind)

Execution stopped immediately per mission rule. **P1-04 and P1-05 were NOT applied.**

---

## 5. Final production state and invariants

Migration ledger:

| Migration | State |
|---|---|
| P1-01 | APPLIED |
| P1-02 | APPLIED |
| P1-03 | NOT APPLIED (failed, rolled back) |
| P1-04 | NOT APPLIED (blocked) |
| P1-05 | NOT APPLIED (blocked) |

Invariants (pre vs post, identical):

- DIRECT_RPC_BYPASS = ZERO
- STUDENT_VISIBLE_ROWS_CHANGED = 0 (visible set still: department_transfer,
  enrollment_certificate, enrollment_suspension, excused_absence, file_withdrawal, final_chance)
- STUDENT_REQUESTS_CREATED = 0 (72 → 72)
- REAL_STUDENT_RESULTS_CHANGED = 0 (student_grades 123 → 123)
- GRADE_COMPONENTS_CHANGED = 0 (114 → 114)
- STUDENT_PROFILES_CHANGED = 0 (867 → 867)
- FINANCIAL_ROWS_CREATED = 0 (student_fees 0, student_payments 0)
- SERVICES_ACTIVATED = 0, SOURCE_DEPLOYED = 0, PUBLISH = 0, P2_STARTED = NO
- enrollment_certificate service = untouched

---

## 6. Required unblock (needs new owner authorization)

The frozen package cannot proceed unmodified. Two forward-only options, neither executed:

1. **Re-freeze P1-03** with `status = 'active'` (the production-legal value that means a live
   workflow in this schema), recompute P1-03 and PACKAGE_SHA256, re-rehearse on a PG17 clone
   that carries `request_type_workflows_status_chk`, then resume from P1-03.
2. **Widen the constraint first** with a separate forward-only migration adding `'published'`
   to the allowed set, then apply the frozen P1-03 byte-exact.

Option 1 is preferred: it keeps a single canonical status vocabulary and avoids two synonyms
for the same lifecycle state.

**FINAL: HOLD_PORTAL_REFORM_P1_CONTROLLED_PRODUCTION_APPLY_06_P1_03_WORKFLOW_STATUS_CHECK_CONSTRAINT_REJECTS_PUBLISHED**
