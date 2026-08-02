# PORTAL-GRADUATES-AFFAIRS-PR273-APPROVED-GATE-REMEDIATION-INDEPENDENT-FINAL-REVIEW-07

Date: 2026-08-02  
Mode: LONG INDEPENDENT SOURCE-ONLY SECURITY REVIEW  
Repository: `msorori-mh/saba-uni-portal`  
PR: [#273](https://github.com/msorori-mh/saba-uni-portal/pull/273)  
Review branch: `review/graduates-affairs-pr273-remediation-final-07`

## Final decision

`PASS_PORTAL_GRADUATES_AFFAIRS_PR273_APPROVED_GATE_REMEDIATION_INDEPENDENT_FINAL_REVIEW`

This clears the prior HOLD token
`HOLD_PORTAL_GRADUATES_AFFAIRS_AUTHORIZATION_PR273_VISIBLE_LIST_RPC_SKIPS_APPROVED_GATE`
(05B). It is a source-package readiness decision only. It is **not**
authorization to apply SQL, activate the feature, create accounts, deploy,
publish, merge PR #273, or mark it Ready. The twelve owner decisions were not
implemented.

---

## Phase A — Source gate

| Check | Result |
|---|---|
| Local HEAD | `eddad8d2c510b955f92f9f6fa08adeb31e0aef66` — **PASS** |
| Remote PR #273 head (`gh` + `refs/pull/273/head`) | `eddad8d2c510b955f92f9f6fa08adeb31e0aef66` — **PASS** |
| Working tree clean at review start / end (before report commit) | **PASS** |
| Full diff `23bb9c8e…` → `eddad8d2…` available | **PASS** (8 paths) |
| Main merge `e9714110` | Normal merge; parents `23bb9c8e` + `0bc2e27f` — **PASS** |
| Graduation Projects source changed | **none** — **PASS** |
| B1 entrypoint repin intact | `scripts/b1-rpc-principal-harness-01/TARGET-MANIFEST.json` byte-identical to `main@0bc2e27f` — **PASS** |

| SHA role | Value |
|---|---|
| Original reviewed SHA (pre-remediation / HOLD target) | `23bb9c8e2e1e1e1a73c235e4f422420a581166e2` |
| Remediated SHA (current PR head) | `eddad8d2c510b955f92f9f6fa08adeb31e0aef66` |
| Main at remediation sync | `0bc2e27f8c3985b8a35c2f1a19ed39955cb5007e` |
| Main→feature merge | `e971411087915145a5ab31e4d49932e221281bbf` |
| Remediation fix commit | `0866146234c8867b1fb29139bdb8722a228e3550` |
| PR #271 HEAD (overlap recheck) | `b735aa05c71228627635f22b6aa5193cf656fce7` |

### Changed-file inventory (`23bb9c8e` → `eddad8d2`)

| Path | Origin | Role |
|---|---|---|
| `docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.sql` | remediation fix | `graduate_is_current_self` + list-RPC gates + helper REVOKE |
| `tests/graduates-affairs/graduates-affairs-authorization-04.pg-verify.sql` | remediation fix | Section J1–J7 + helper privilege pin |
| `tests/graduates-affairs/graduates-affairs-authorization-04.pg-setup.sql` | remediation fix | registrar/dean/admin analogue fixtures |
| `tests/graduates-affairs/graduates-affairs-authorization-04-sql.test.ts` | remediation fix | 29-function count + approved-gate parity contracts |
| `docs/PORTAL-GRADUATES-AFFAIRS-PR273-APPROVED-VISIBILITY-GATE-REMEDIATION-06-REPORT.md` | remediation docs | author remediation report |
| `docs/B1-FUNCTION-GRAPH-ENTRYPOINT-READONLY-REATTESTATION-AND-SOURCE-REPIN-23-REPORT.md` | main merge only | B1 re-attestation report |
| `docs/PORTAL-GRADUATES-AFFAIRS-AUTHORIZATION-PR273-INDEPENDENT-FINAL-REVIEW-05-REPORT.md` | main merge only | prior environmental HOLD report |
| `scripts/b1-rpc-principal-harness-01/TARGET-MANIFEST.json` | main merge only | B1 function-graph entrypoint repin |

Remediation-only delta (`e9714110` → `eddad8d2`): the five GA auth/docs files above. No Graduation Projects runtime/SQL/UI change at any point.

---

## Phase B — Original bypass reproduction

Disposable `postgres:17` chain on the **pre-fix** draft
(`23bb9c8e:…/GRADUATES-AFFAIRS-AUTHORIZATION-04.sql`, which contains **zero**
references to `graduate_is_current_self`):

`setup → foundation → completion → pre-fix AUTH-04 → focused repro`

Observed:

| Step | Result |
|---|---|
| approved + published + matching audience via list RPCs | `opps=1 events=1` |
| after `approved → corrected` | RPC still `opps=1 events=1`; direct RLS `opps=0 events=0` |
| after `approved → revoked` (record B) | RPC still `opps=1 events=1`; direct RLS `opps=0 events=0` |

Terminal notice: `PRE-FIX BYPASS REPRODUCED`.

### Exact affected RPCs

1. `graduate_list_visible_opportunities`
2. `graduate_list_visible_events`

### Missing predicate (pre-fix)

Both RPCs checked only `graduate_is_self` (ownership via `student_profiles.user_id = auth.uid()`), then publication + `graduate_audience_matches`. They omitted the canonical approved/current-state gate that RLS already enforces through `graduate_self_matches_audience` (`record_state = 'approved'`). Mutating self RPCs already raised `GRADUATE_RECORD_NOT_APPROVED`; the list RPCs did not.

---

## Phase C — Helper review (`graduate_is_current_self`)

| Requirement | Verdict |
|---|---|
| Identity from `auth.uid()` | **PASS** (`sp.user_id = auth.uid()`) |
| Graduate ownership via `student_profiles` join | **PASS** |
| `record_state = 'approved'` enforced | **PASS** |
| Predicate matches canonical RLS helper | **PASS** (same approved + self join as `graduate_self_matches_audience`) |
| Malformed / absent linkage fails closed | **PASS** (`EXISTS` → false) |
| Not callable by PUBLIC | **PASS** (`has_function_privilege(...'public'...) = f`) |
| Not callable by anon | **PASS** |
| Not callable directly by authenticated | **PASS** |
| No SECURITY DEFINER escalation path for clients | **PASS** (internal-only; revoked from all client roles; usable only inside DEFINER owner context) |
| `search_path` pinned | **PASS** (`search_path=public, pg_temp`) |
| No broad `app_role` check | **PASS** (bundle text contract + helper body) |
| No registrar/dean/admin bypass | **PASS** |
| No PII returned | **PASS** (boolean only) |
| Used consistently by both affected list RPCs | **PASS** (both raise `GRADUATE_RECORD_NOT_CURRENT`) |
| Owner | **PASS** (`postgres` in disposable chain) |
| `SECURITY DEFINER` | **PASS** |

---

## Phase D — RLS / RPC parity

Executable proof: remediated chain verifier section J (+ prior sections for actor negatives).

| Scenario | RPC | Direct RLS | Verdict |
|---|---|---|---|
| approved + published + matching audience | exactly 1, once | exactly 1 | **PASS** |
| approved + unpublished / closed | hidden immediately | hidden immediately | **PASS** |
| corrected | `GRADUATE_RECORD_NOT_CURRENT` | 0 rows | **PASS** |
| revoked | `GRADUATE_RECORD_NOT_CURRENT` | 0 rows | **PASS** |
| draft engagement | hidden | hidden | **PASS** |
| pending / unapproved decision | no graduate record creatable (foundation gate) | — | **PASS** |
| malformed audience | hidden | hidden | **PASS** |
| empty audience (`{}` / empty arrays) | hidden | hidden | **PASS** |
| wrong department | hidden | hidden | **PASS** |
| wrong program | hidden | hidden | **PASS** |
| wrong cohort/year | N/A as distinct audience key (D-4 contract is program/department/`all_graduates` only); wrong-program/department covered | — | **PASS / out-of-contract** |
| unrelated graduate | `GRADUATE_AFFAIRS_ACCESS_DENIED` | 0 for non-matching self | **PASS** |
| unlinked graduate | denied (non-self) | 0 | **PASS** |
| anonymous | `GRADUATE_AFFAIRS_NOT_AUTHENTICATED` / denied | 0 | **PASS** |

---

## Phase E — Transition matrix

| Transition | Visibility / mutation | Verdict |
|---|---|---|
| approved → corrected | list RPC denied immediately; RLS 0 | **PASS** |
| approved → revoked | list RPC denied immediately; RLS 0 | **PASS** |
| approved → unpublished (close/cancel) | row gone on both paths immediately | **PASS** |
| corrected → approved | `INVALID_OFFICIAL_GRADUATION_DECISION_TRANSITION`; zero mutation (decision + domain events) | **PASS** |
| revoked → approved | same illegal reverse denial; zero mutation | **PASS** |

No parallel helper path remains that serves listings without the approved gate. No stale list cache exists in this source package (RPCs are live queries).

---

## Phase F — Complete actor matrix

Verified across authorization-04 pg-verify sections C–J7 (remediated):

| Actor | Broader visibility via remediated helper? |
|---|---|
| graduate self (approved) | intended listing only |
| other graduate | denied |
| unlinked graduate | denied |
| manager | staff paths unchanged; no list-RPC broadening via helper |
| correct-department specialist | unchanged scoped staff access |
| wrong-department specialist | denied |
| direct follow-up assignee | assigned-record staff access only |
| unrelated staff | denied |
| registrar analogue | denied (no `app_role` consult) |
| dean analogue | denied |
| admin analogue | denied |
| anonymous | denied |

`graduate_is_current_self` is not client-executable, so no actor can invoke it to expand visibility.

---

## Phase G — PostgreSQL 17

Disposable `postgres:17` Docker cluster, chain identical to CI leg
`graduates-affairs-authorization`:

`setup → foundation → completion → authorization-04 → verifier`

| Gate | Result |
|---|---|
| Full original authorization matrix | **PASS** (`graduates-affairs-authorization-04 pg-verify: PASS`) |
| J1–J7 approved-gate regressions | **PASS** |
| corrected visible rows | **0** (RPC denied + RLS 0) |
| revoked visible rows | **0** |
| unpublished visible rows | **0** on both paths |
| approved intended rows | visible **exactly once** |
| RLS/RPC parity | **PASS** |
| Rejected calls mutate zero rows | **PASS** (illegal reverse transitions + privileged-role denials) |
| `protected_value` never returned | **PASS** |
| `notes_protected` never returned | **PASS** |
| PUBLIC/anon grants denied | **PASS** (incl. new helper) |
| `search_path` exact | **PASS** (`public, pg_temp`) |
| SECURITY DEFINER ownership exact | **PASS** (`postgres` / `prosecdef=t`) |

Pre-fix isolated chain independently reproduced the bypass (Phase B).

---

## Phase H — Application tests + CI

| Command | Result |
|---|---|
| `bun test tests/graduates-affairs` | **113 / 0** |
| `bun test tests/student-requests` | **1060 / 0** |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | **183 / 0** |
| `bun test` (full) | **2468 / 0** |
| `bunx tsc --noEmit` | **PASS** |
| `bun run build` | **PASS** (client + SSR) |
| `git diff --check` (remediation range + worktree) | **PASS** |

### CI

Run [`30723904177`](https://github.com/msorori-mh/saba-uni-portal/actions/runs/30723904177)

| Field | Value |
|---|---|
| `headSha` | `eddad8d2c510b955f92f9f6fa08adeb31e0aef66` (exact remediated SHA) |
| `conclusion` | `success` |
| `status` | `completed` |
| Workflow | Web CI |

All quality + bun + PG 17 verifier legs SUCCESS, including
`graduates-affairs-authorization`.

---

## Phase I — Overlap and merge order

Rechecked against PR #271 HEAD `b735aa05` (moved since 05B’s `13cae0ac`;
recommendation structure unchanged):

| Item | Status |
|---|---|
| PR #273 authorization source separate from PR #271 | **CONFIRMED** — AUTH-04 SQL/setup/verify/tests absent from #271 |
| Merge #273 before #271 | **RECONFIRMED** |
| Three UI conflicts retain #271 versions | **RECONFIRMED** — still differ: `GraduateReportsPanel.tsx`, `GraduateSurveyCard.tsx`, `graduates-affairs-visual-ux-qa-01.test.ts` |
| Do not silently fold authorization source into #271 | **RECONFIRMED** |

No change to the prior merge-order recommendation.

---

## Remaining owner decisions

D-1 … D-12 in
`docs/PORTAL-GRADUATES-AFFAIRS-AUTHORIZATION-DECISION-PACKAGE-04.md` remain
open. Fail-closed defaults stay in force. This review did not implement any of
them.

### Non-blocking residuals (not this HOLD; not reopened as blockers)

- `graduate_my_contact_points` still gates on self only (metadata read; add/revoke still require approved) — accepted residual from 05B/REMEDIATION-06 inventory.
- Specialist multi-profile department union behavior unchanged.
- Import SQL-gate documentation mismatch unchanged (TS validator only).
- Naming remains the accepted GA-family `.sql` draft exception (not `.NOT_APPLIED.sql`).

---

## Assumptions

- Review is source-only against the SHAs above; disposable Postgres only.
- TS capability adapters are not the security boundary.
- Audience cohort/year filters are intentionally out of the current D-4 contract.
- Owner decisions remain product decisions, not merge blockers for this remediation.

## Risks

- Draft remains `NOT_APPLIED`; production still default-denies the domain until a future governed apply.
- Future UI wiring must call only the audited RPCs; hiding buttons is not authorization.
- After merge, PR #271 rebase must keep AUTH-04 on the #273 lineage and take #271 on the three UI conflicts.

## Obstacles

- Docker Desktop had to be started locally before disposable `postgres:17` chains could run; once up, both pre-fix reproduction and post-fix verification completed.

## Production impact

**None from this review.** No production connection, no migration apply, no
deploy/publish, no merge, no PR #273 source modification. Report-only commit on
the review branch.

## Constraint compliance

- SOURCE-ONLY
- No production access
- No migrations applied
- No deploy / publish
- PR #273 not merged / not marked Ready
- Twelve owner decisions not implemented
- Reviewed PR source unmodified before/during review

---

## Exact final decision (repeated)

`PASS_PORTAL_GRADUATES_AFFAIRS_PR273_APPROVED_GATE_REMEDIATION_INDEPENDENT_FINAL_REVIEW`
