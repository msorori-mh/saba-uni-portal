# PORTAL-PR338-GA-FINAL-RC-AND-DETERMINISTIC-SPECIALIST-RESOLUTION-01

**Date:** 2026-08-10 (Asia/Riyadh)
**Branch:** `ops/ga-final-rc-specialist-plan-01` (PR #338 head → `ops/24h-graduates-source-final-rc-02`)
**PR:** #338
**Production project:** `wpmicqriltrowwonknox` (Lovable `90f4dcde-07fb-4441-b86a-6ad5510833b8`)
**Main tip at GA3 evidence capture:** `845f3501c8ccdec7d411811c565e62a8bb93ba25` (Lovable “Applied GA3 (AUTH-04) policy”)  
**Reconciled onto main tip:** `5570753236e134c71dfc4351c9cdc42e9255a021`  
**Mode:** GA FINAL SOURCE + DATA-REMEDIATION PLAN. Zero production writes.

---

## Decision

```text
PASS_PORTAL_PR338_GA_FINAL_RC_AND_SPECIALIST_PLAN_CLOSED
```

---

## Production reconcile (READ-ONLY, current)

| Key | Value |
|---|---|
| GA1_CURRENT | `VERIFIED_PRESENT` |
| GA2_CURRENT | `VERIFIED_PRESENT` |
| GA3_CURRENT | `VERIFIED_PRESENT` |
| NEXT_WRITE | `NONE_SCHEMA` |
| NEXT_OPTIONAL_WRITE | `SPECIALIST_TESTONLY_FIXTURE_OWNER_GATED` |
| GA3_READY | `YES` |

Evidence summary:

- Managed ledger aliases present: `20260810124407` (GA1), `20260810124539` (GA2), `20260810162735` (GA3).
- GA1 object set present (`graduate_records`, `graduate_profiles`, `graduate_official_decisions`, …).
- GA2 object set present (`graduate_followups`, `graduate_communication_events`, `graduate_account_continuity_policies`, completion functions).
- GA3/AUTH04 markers present: `graduate_affairs_specialist_department_ids`, `graduate_affairs_search_records`, `graduate_affairs_is_manager` / `is_specialist`, exactly **7** AUTH04 SELECT policies; `graduate_records` RLS ON with **0** policies (default-deny by design).
- Logical versions `20260808210000`–`20260808210200` still unmapped in `schema_migrations` (alias lineage; do **not** re-apply GA1/GA2/GA3).
- Prior packet wording `GA3_CURRENT=ABSENT` / `NEXT_WRITE=GA3_ONLY` is **stale** after main tip `845f3501`.

---

## Deterministic specialist resolution

| Key | Value |
|---|---|
| AMBIGUOUS_SPECIALIST | `aa4f5c16-c993-4af6-a6d4-59d9542c1a7f` |
| Status | `AMBIGUOUS_SPECIALIST_DO_NOT_SCOPE` |
| SAFE_SPECIALIST_CANDIDATE | `a6e30100-0000-4000-a300-000000000001` |
| SAFE_SPECIALIST_DEPARTMENT | `11111111-1111-4111-8111-111111111111` |
| Candidate kind | `TEST_ONLY_GA_SPECIALIST_E2E_01` |
| Real staff unique-dept candidates | `NONE` |

College-wide probes (reconfirmed after GA3 apply):

- `staff_profile_departments` row count = **0**
- Active staff with non-NULL `department_id` = **0 / 9**
- All active staff `department_scope='all'` (non-authoritative for AUTH-04)
- No staff↔faculty department link; org positions lack `department_id`

Therefore: do not invent scope for صالح علي; do not assign all departments; prepare TEST_ONLY single-department fixture only (dry-run default, not executed).

AUTH-04 live function confirms scope is **only** `staff_profile_departments` of the authorizing specialist profile. Zero SPD ⇒ empty department set ⇒ specialist record access DENY (fail-closed), even if the assignment remains active.

---

## AUTH-04 matrix (manager / specialist / outside-scope)

| Actor | Expected under AUTH-04 | Production note |
|---|---|---|
| admin / app_role alone | DENY | No app_role bypass in AUTH04 |
| GA manager assigned (`f463a79b-…`) | ALLOW manager scope | Active assignment present; managers are not SPD-scoped |
| Specialist with exactly one SPD | ALLOW in that department only | No such real staff today |
| Specialist `aa4f5c16-…` (0 SPD) | Empty scope → DENY records | Active assignment but unscoped |
| Outside-scope / wrong department | DENY | Covered by SPD membership check |
| TEST_ONLY candidate (planned) | ALLOW only CS dept `11111111-…` | Dry-run package; zero writes this mission |

Local PG17 suite + promotion E2E matrix remain the executable positive/negative proof for AUTH-04.

---

## Finding severity

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 0 |

Residual operational work (not defects in this RC): ledger managed→logical mapping packet; optional TEST_ONLY fixture execute under runtime grant/lease; flags remain OFF.

---

## Files

```text
docs/migration-drafts/GA-PRODUCTION-SPECIALIST-SCOPE-OWNER-DECISION-01.md
docs/migration-drafts/GA-PRODUCTION-SPECIALIST-SCOPE-REMEDIATION-DRY-RUN-01.sql
docs/production-test-fixtures/GA-SPECIALIST-SINGLE-DEPT-TESTONLY-FIXTURE-01.sql
docs/go-live/operator-packets/GA-PRODUCTION-STATUS.txt
docs/go-live/operator-packets/GA3-LOVABLE-APPLY-ONE.txt
docs/go-live/operator-packets/LOVABLE-C5V2-THROUGH-GA3-MASTER-SEQUENTIAL-EXECUTION.txt
docs/reviews/PORTAL-PR338-GA-FINAL-RC-AND-DETERMINISTIC-SPECIALIST-RESOLUTION-01.md
docs/reviews/PORTAL-24H-GRADUATES-AFFAIRS-SOURCE-AND-SPECIALIST-SCOPE-FINAL-RC-02-REPORT.md
tests/graduates-affairs/ga-source-final-rc-02.test.ts
tests/graduates-affairs/ga-deterministic-specialist-resolution-01.test.ts
```

---

## Assumptions

- Lovable project `90f4dcde-…` remains production for `wpmicqriltrowwonknox`.
- Object presence + managed alias rows + AUTH04 policy/function set are sufficient for `VERIFIED_PRESENT` even when logical timestamps are unmapped and alias FULL hashes differ from canonical.
- `department_scope='all'` never substitutes for `staff_profile_departments`.

## Risks

- Alias/canonical hash divergence means ledger reconciliation must record managed→logical mapping carefully.
- Ambiguous live specialist remains assigned but fail-closed under AUTH04 until revoked or separately owner-remediated; E2E uses TEST_ONLY actor only.

## Production impact

Zero from this agent. No migrations applied. No fixture execute. No flags flipped. No deploy.

## Verification (this worktree)

See CI/local evidence after suite run in PR #338.
