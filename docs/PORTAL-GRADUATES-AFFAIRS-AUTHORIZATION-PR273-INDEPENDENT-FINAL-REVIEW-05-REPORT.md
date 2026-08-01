# PORTAL-GRADUATES-AFFAIRS-AUTHORIZATION-PR273-INDEPENDENT-FINAL-REVIEW-05

Date: 2026-08-02  
Mode: LONG INDEPENDENT SOURCE-ONLY SECURITY REVIEW  
Repository: `msorori-mh/saba-uni-portal`  
PR: [#273](https://github.com/msorori-mh/saba-uni-portal/pull/273)  
Review branch: `review/graduates-affairs-pr273-independent-final-05`

## Final decision

`HOLD_PORTAL_GRADUATES_AFFAIRS_AUTHORIZATION_PR273_VISIBLE_LIST_RPC_SKIPS_APPROVED_GATE`

This is a source-package security readiness decision. It is **not** authorization
to apply SQL, activate a feature, create accounts, deploy, publish, merge PR
#273, or mark it Ready. The twelve owner decisions in DECISION-PACKAGE-04 were
not implemented by this review.

---

## Fixed baseline

| Item | Value |
|---|---|
| Exact reviewed SHA | `23bb9c8e2e1e1e1a73c235e4f422420a581166e2` |
| Base main | `8729f6d5d61d5a55052fe9f7cda2bd360d9bb421` |
| Merge-base | `8729f6d5d61d5a55052fe9f7cda2bd360d9bb421` |
| PR head branch | `feat/graduates-affairs-authorization-closure-overnight-20260801` |
| PR state at review | OPEN, DRAFT, MERGEABLE |
| Cross-branch PR #271 HEAD | `13cae0ac700713c68458b97f41459ac086e63cbf` |

No production connection. No migrations applied. No deploy/publish. PR #273
source was not modified. Only this report is authored on the review branch.

---

## Changed-file inventory (base…HEAD)

19 paths, +4522 / −83:

| Path | Role |
|---|---|
| `.github/workflows/ci.yml` | Adds disposable `graduates-affairs-authorization` PG 17 chain |
| `docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.sql` | Auth RLS/RPC draft (~1339 lines) |
| `docs/PORTAL-GRADUATES-AFFAIRS-AUTHORIZATION-DECISION-PACKAGE-04.md` | 12 owner decisions (untouched by this review) |
| `docs/PORTAL-GRADUATES-AFFAIRS-AUTHORIZATION-MATRIX-04.md` | Actor/capability matrix |
| `docs/PORTAL-GRADUATES-AFFAIRS-OVERNIGHT-CLOSURE-04-REPORT.md` | Author closure report |
| `docs/PORTAL-GRADUATES-AFFAIRS-PRIVACY-AND-PII-AUDIT-04.md` | PII audit |
| `docs/PORTAL-GRADUATES-AFFAIRS-VISUAL-UX-ACCESSIBILITY-QA-01-REPORT.md` | Visual/privacy QA report |
| `src/components/graduates-affairs/GraduateCommunicationPanel.tsx` | Privacy/UX |
| `src/components/graduates-affairs/GraduateFileCard.tsx` | Privacy/UX |
| `src/components/graduates-affairs/GraduateReportsPanel.tsx` | Privacy/UX |
| `src/components/graduates-affairs/GraduateSurveyCard.tsx` | Privacy/UX |
| `src/components/graduates-affairs/display-format.ts` | Display helper |
| `src/lib/graduates-affairs/authorization.ts` | TS capability mirror (non-boundary) |
| `src/lib/graduates-affairs/import-validation.ts` | Fail-closed import batch validator |
| `tests/graduates-affairs/graduates-affairs-authorization-04-sql.test.ts` | SQL text contracts |
| `tests/graduates-affairs/graduates-affairs-authorization-04.pg-setup.sql` | Disposable fixture schema |
| `tests/graduates-affairs/graduates-affairs-authorization-04.pg-verify.sql` | Executable negative/positive matrix |
| `tests/graduates-affairs/graduates-affairs-authorization-04.test.ts` | TS capability/import tests |
| `tests/graduates-affairs/graduates-affairs-visual-ux-qa-01.test.ts` | Visual/privacy regression |

**Cross-module blast radius:** no B1, Graduation Projects, enrollment-certificate,
or `student_visible` files in the PR diff. **PASS** for item 26.

---

## RPC inventory

### Graduate self-service (13)

1. `graduate_update_own_profile`
2. `graduate_grant_consent`
3. `graduate_withdraw_consent`
4. `graduate_add_contact_point`
5. `graduate_revoke_contact_point`
6. `graduate_my_contact_points`
7. `graduate_report_employment`
8. `graduate_submit_survey_response`
9. `graduate_withdraw_survey_response`
10. `graduate_register_for_event`
11. `graduate_cancel_event_registration`
12. `graduate_list_visible_opportunities`
13. `graduate_list_visible_events`

### Staff (7)

1. `graduate_affairs_get_graduate_file`
2. `graduate_affairs_search_records`
3. `graduate_affairs_create_followup`
4. `graduate_affairs_transition_followup`
5. `graduate_affairs_moderate_opportunity`
6. `graduate_affairs_set_employer_verification`
7. `graduate_affairs_cohort_employment_report`

Internal helpers (not client RPCs): `graduate_affairs_audit`,
`graduate_affairs_is_manager`, `graduate_affairs_is_specialist`,
`graduate_affairs_specialist_department_ids`, `graduate_is_self`,
`graduate_affairs_can_access_record`, `graduate_audience_matches`,
`graduate_self_matches_audience`.

---

## Primary security checklist

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | 13 graduate self RPCs | **PASS** | Declared in AUTHORIZATION-04; pinned by sql.test inventory |
| 2 | 7 staff RPCs | **PASS** | Same |
| 3 | `auth.uid()` only authoritative actor | **PASS** | Every RPC null-checks `auth.uid()`; helpers compare assignments to `auth.uid()`; no `app_role` / `has_role` |
| 4 | Ownership via `student_profiles.user_id` | **PASS** | `graduate_is_self` joins `graduate_records` ⋈ `student_profiles` on `sp.user_id = auth.uid()` |
| 5 | Manager college scope | **PASS** | `graduate_affairs_is_manager`; search/file skip dept filter for manager |
| 6 | Specialist department scope | **PASS** | `graduate_affairs_specialist_department_ids`; out-of-scope raises `GRADUATE_AFFAIRS_OUT_OF_SCOPE` |
| 7 | Direct follow-up assignee scope | **PASS** | `can_access_record` allows `assignee_user_id = auth.uid()` with state `open`/`in_progress` |
| 8 | No admin/registrar/dean bypass | **PASS (code) / GAP (executable fixtures)** | Header + zero `app_role` consult; pg-verify has no named registrar/dean/admin actors |
| 9 | Profile mutable-field allowlist | **PASS** | SQL writes only 4 columns; TS `GRADUATE_PROFILE_MUTABLE_FIELDS` + `validateProfilePatch` |
| 10 | `row_version` concurrency | **PASS** | `FOR UPDATE` + `GRADUATE_PROFILE_VERSION_CONFLICT`; pg-verify B |
| 11 | Employment lifecycle | **PASS** | Self insert forced `graduate_reported`; no staff employment-verify RPC |
| 12 | Survey lifecycle | **PASS** | Active+published gate; withdraw path; duplicate unique `23505` tested |
| 13 | Event lifecycle | **PASS** | Register requires `published` + future start; cancel path |
| 14 | Opportunity audience matching | **PASS** | `graduate_audience_matches` used by list RPC and RLS |
| 15 | Empty audience `{}` matches nothing | **PASS** | Falls through to `RETURN false`; pg-verify H |
| 16 | `protected_value` non-disclosure | **PASS** | Write-only in add-contact; readers omit column; verify F + sql.test |
| 17 | `notes_protected` non-disclosure | **PASS** | Absent from auth SQL code paths; file RPC omits notes |
| 18 | Minimum-cell aggregate suppression | **PASS** | Completion `GREATEST(...,3)`; staff wrapper; suppression proven in completion chain |
| 19 | PUBLIC/anon/authenticated EXECUTE | **PASS** | Helpers revoked from PUBLIC/anon/authenticated; RPCs revoke PUBLIC/anon then GRANT authenticated; verify J |
| 20 | SECURITY DEFINER + `search_path` | **PASS** | All functions: `SECURITY DEFINER` + `SET search_path = public, pg_temp`. No explicit `OWNER TO` (apply-time residual) |
| 21 | RLS default-deny | **PASS** | Auth-04 adds exactly 7 SELECT policies; protected tables stay policy-less |
| 22 | Zero-mutation rejected calls | **PASS (partial)** | Proven in C/D/F paths; not asserted on every denial class |
| 23 | Import validation fails whole batch | **PASS (TS) / GAP (no SQL import RPC)** | `validateOfficialDecisionImportBatch`; no import gate function in AUTHORIZATION-04 despite comment claim |
| 24 | Duplicate source-reference | **PASS** | TS flags later duplicates; foundation `UNIQUE (source_kind, source_reference)` |
| 25 | CI workflow safety | **PASS** | Disposable `postgres:17`; per-leg `createdb chain_verify`; `ON_ERROR_STOP=1`; drafts applied only in CI |
| 26 | No B1 / Graduation Projects change | **PASS** | Diff inventory |

---

## Findings (defect-first)

### [P1] Visibility list RPCs skip the approved-record gate — `docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.sql:758-820`

Mutating self RPCs raise `GRADUATE_RECORD_NOT_APPROVED` when `record_state` is not
`approved`. RLS audience matching via `graduate_self_matches_audience` also
requires `record_state = 'approved'`.

`graduate_list_visible_opportunities` and `graduate_list_visible_events` only
call `graduate_is_self` and then match audience against the record’s program /
department — **without** an approved check. Because these are `SECURITY DEFINER`,
they bypass the RLS approved gate.

**Impact:** A caller who owns a non-approved graduate record can list published
opportunities/events that the RLS path would hide. This weakens the official-
decision fail-closed boundary the package otherwise enforces.

**Required fix (not applied by this review):** Add the same
`GRADUATE_RECORD_NOT_APPROVED` guard used by mutating self RPCs (or otherwise
require approved before returning rows), and extend pg-verify with a
non-approved-self denial assertion.

### [P2] Naming governance mismatch — draft lacks `.NOT_APPLIED.sql` suffix

| | Path |
|---|---|
| Current | `docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.sql` |
| Required by this mission | `docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.NOT_APPLIED.sql` |

The file header correctly says `DRAFT ONLY — SOURCE REVIEW ARTIFACT — DO NOT APPLY`
and lives outside `supabase/migrations/`. Sibling GA drafts
(`FOUNDATION-01`, `COMPLETION-01`) also omit the suffix; the `.NOT_APPLIED.sql`
suffix is used today mainly for B1 fixture/cleanup packages. CI and sql tests
hard-code the current filename.

**Actionable:** Rename to the mission-required name and update CI matrix + test
path references. Do **not** silently rename before review completion (honored).

### [P2] Executable negative matrix incomplete vs required expansion

Code is fail-closed by omission for admin/registrar/dean (`app_role` unused),
but pg-verify lacks named fixtures for several required scenarios (see actor
matrix below). Closure/matrix prose that claims admin-without-assignment denial
is proven by pg-verify overstates executable coverage.

### [P2] Specialist department resolution vs multi-profile staff

`graduate_affairs_specialist_department_ids` unions departments for **any**
`staff_profiles` row with `sp.user_id = auth.uid()`, not only the assigned
`staff_profile_id`. Multi-profile users could widen specialist scope relative
to the assignment row. TS adapter uses per-assignment `departmentIds` (TS is
not the security boundary).

### [P3] Import “SQL gate” documentation mismatch

`import-validation.ts` claims to mirror an AUTHORIZATION-04 SQL import gate.
That draft has **no** import RPC. Contract is TS + foundation UNIQUE only.

### [P3] `graduate_my_contact_points` also skips approved check

Read metadata path allows non-approved self. Lower impact than list RPCs
(contact values never returned; add/revoke still require approved). Align for
consistency.

### P0

None identified.

---

## Grants / RLS / search_path verdict

| Control | Verdict |
|---|---|
| Helpers revoked from PUBLIC/anon/authenticated | **PASS** |
| RPCs revoke PUBLIC/anon before authenticated GRANT | **PASS** |
| Exactly 7 SELECT policies; no write policies | **PASS** |
| Protected tables policy-less (default deny) | **PASS** |
| All functions SECURITY DEFINER + pinned `search_path` | **PASS** |
| Explicit function OWNER | **GAP** (apply-time residual; not a client bypass in this draft) |

---

## Actor matrix (required expansion vs coverage)

| Required actor / scenario | pg-verify / bun coverage | Verdict |
|---|---|---|
| anonymous | D (empty JWT → `NOT_AUTHENTICATED`) | **COVERED** |
| graduate self | B positives | **COVERED** |
| another graduate | C cross-record denials | **COVERED** |
| graduate without linked student profile | — | **MISSING** |
| manager | F | **COVERED** |
| specialist correct department | E (D1) | **COVERED** |
| specialist wrong department | E (D2) | **COVERED** |
| direct follow-up assignee | G | **COVERED** |
| unrelated staff | D (`unrelatedStaffU`) | **COVERED** |
| registrar | — (code DENY by omission) | **MISSING fixture** |
| dean | — | **MISSING fixture** |
| admin | — (TS unit-role deny only) | **MISSING fixture** |
| malformed audience | code handles; not exercised in pg-verify | **MISSING** |
| empty audience | H | **COVERED** |
| stale `row_version` | B | **COVERED** |
| duplicate correlation (survey) | B `23505` | **COVERED** |
| illegal lifecycle transition | E/F employer/opportunity; follow-up illegal transition incomplete in auth-04 verify | **PARTIAL** |
| direct RPC misuse | C/D partial | **PARTIAL** |
| protected PII read attempt | F + I | **COVERED** |
| cross-department search | E | **COVERED** |
| batch with one invalid import row | bun TS only | **TS ONLY** |
| duplicate import reference | bun TS + foundation UNIQUE | **TS / schema** |
| rejected-call zero-mutation proof | C, D, partial F | **PARTIAL** |

---

## PostgreSQL results

Disposable Docker `postgres:17` (server `17.10`), local chain:

```
setup → FOUNDATION-01 → COMPLETION-01 → AUTHORIZATION-04 → pg-verify
```

**Result: CHAIN PASS**  
Verifier NOTICE: `graduates-affairs-authorization-04 pg-verify: PASS`

CI job `PG 17 verifier · graduates-affairs-authorization` on SHA
`23bb9c8e…`: **SUCCESS**
([run 30692620484](https://github.com/msorori-mh/saba-uni-portal/actions/runs/30692620484)).

---

## PII verdict

| Control | Verdict |
|---|---|
| `protected_value` never selected by any RPC | **PASS** |
| `notes_protected` never selected by any RPC | **PASS** |
| Contact/file projections are metadata-only | **PASS** |
| Aggregate reports min-cell suppression | **PASS** (completion + wrapper) |
| UI components: no raw emails/phones/storage internals | **PASS** (visual suite) |
| At-rest plaintext until owner D-3/D-7 | Residual (documented; fail-closed unreadability) |

---

## Import verdict

| Control | Verdict |
|---|---|
| Whole-batch fail-closed on any row error | **PASS** (TS) |
| Duplicate `(sourceKind, sourceReference)` rejected | **PASS** (TS; later index) |
| Foundation UNIQUE constraint | **PASS** (schema) |
| SQL import RPC / gate in AUTHORIZATION-04 | **ABSENT** (docs over-claim) |

---

## Naming-governance verdict

**RENAME_REQUIRED** for mission compliance:

- From: `GRADUATES-AFFAIRS-AUTHORIZATION-04.sql`
- To: `GRADUATES-AFFAIRS-AUTHORIZATION-04.NOT_APPLIED.sql`

Requires coordinated updates to `.github/workflows/ci.yml` and graduates-affairs
authorization tests. Not performed by this review (source left intact).

---

## PR #271 overlap analysis

PR #271 HEAD: `13cae0ac700713c68458b97f41459ac086e63cbf`  
(`feat/graduation-projects-graduates-affairs-overnight-20260801`)

### Duplicates

| File | Relation |
|---|---|
| `GraduateCommunicationPanel.tsx` | Byte-identical |
| `GraduateFileCard.tsx` | Byte-identical |
| `display-format.ts` | Byte-identical |
| `PORTAL-GRADUATES-AFFAIRS-VISUAL-UX-ACCESSIBILITY-QA-01-REPORT.md` | Identical |
| `GraduateReportsPanel.tsx` | Differs — #271 adds `overflow-x-auto` |
| `GraduateSurveyCard.tsx` | Differs — #271 uses `flex-wrap` radiogroup |
| `graduates-affairs-visual-ux-qa-01.test.ts` | Differs — #271 supersets with mobile collapse cases |

### Conflicting UI fixes

Soft conflict on ReportsPanel / SurveyCard / visual tests. Prefer **PR #271**
versions (later mobile hardening).

### Conflicting authorization models

| Aspect | PR #271 | PR #273 |
|---|---|---|
| Foundation/completion SQL | Already on main | Same base |
| Staffing decision | G4 HOLD memo — no option chosen | Fixed assignment-based model implemented |
| Executable auth | Default-deny contracts only | Full AUTHORIZATION-04 + pg-verify |

No same-file SQL clash; process tension between “do not choose” and “chosen model”.

### Files for PR #271 integration

- UI/privacy components + visual suite (keep #271 versions)
- G4 default-deny tests / HOLD memo already on #271
- Mixed GP+GA overnight docs already on #271

### Files that should remain a separate PR (#273)

- `GRADUATES-AFFAIRS-AUTHORIZATION-04.sql` (+ rename when fixed)
- `authorization.ts`, `import-validation.ts`
- All `graduates-affairs-authorization-04*` tests/setup/verify
- Auth decision package / matrix / privacy audit / overnight closure-04
- CI `graduates-affairs-authorization` chain entry

### Recommended merge order

1. **Merge PR #271 first** (graduation-projects overnight + GA UI/privacy + G4 default-deny).
2. **Then land PR #273** after fixing HOLD blockers, resolving UI overlap by
   taking #271’s ReportsPanel / SurveyCard / visual tests.
3. After #273 lands, supersede the G4 HOLD memo with the authorization-04
   decision package so docs do not claim “no option chosen” while SQL implements one.
4. If product rejects unit/role naming (D-1), hold #273 independently; #271 UI
   can still ship.

Do not merge branches in this review.

---

## Tests

| Command | Result |
|---|---|
| Disposable PG17 auth chain | **PASS** |
| `bun test tests/graduates-affairs` | **110 pass / 0 fail** |
| `bun test tests/student-requests` | **1060 pass / 0 fail** |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | **183 pass / 0 fail** |
| `bunx tsc --noEmit` | **PASS** |
| `bun run build` | **PASS** |
| `git diff --check` (base…HEAD) | **PASS** |
| `bun test` (full local) | **2463–2464 pass; 1–2 fail** — unrelated timeout flakes in `tests/imports/import-templates.test.ts` (HIGH-3 workbook). **Not in PR #273 diff.** CI `Bun tests (tests/)` on the same SHA: **SUCCESS**. |

---

## CI

Workflow run [`30692620484`](https://github.com/msorori-mh/saba-uni-portal/actions/runs/30692620484)  
HEAD SHA `23bb9c8e2e1e1e1a73c235e4f422420a581166e2` — **completed SUCCESS**:

- Install · Lint · Typecheck · Build — pass
- Bun tests (tests/) — pass
- PG 17 verifier · graduates-affairs-foundation — pass
- PG 17 verifier · graduates-affairs-completion — pass
- PG 17 verifier · graduates-affairs-authorization — pass
- Remaining PG verifier matrix legs — pass

No failing checks on the reviewed SHA.

---

## Exact blockers

1. **VISIBLE_LIST_RPC_SKIPS_APPROVED_GATE** — `graduate_list_visible_opportunities` / `graduate_list_visible_events` omit `record_state = 'approved'` while mutating self RPCs and RLS audience matching require it (`SECURITY DEFINER` bypass).
2. **NAMING_NOT_APPLIED_SUFFIX** — draft must be renamed to `GRADUATES-AFFAIRS-AUTHORIZATION-04.NOT_APPLIED.sql` with CI/test path updates.
3. **NEGATIVE_MATRIX_NAMED_ACTOR_GAPS** — expand pg-verify to include registrar, dean, admin, graduate-without-linked-profile, malformed audience, illegal follow-up transition, and import-batch cases (or stop claiming those proofs).
4. **IMPORT_SQL_GATE_DOC_MISMATCH** — remove or correct the claim that AUTHORIZATION-04 contains a SQL import gate.
5. **PR271_UI_OVERLAP** — on merge, take #271 mobile UI for ReportsPanel / SurveyCard / visual tests (process blocker, not a code defect in isolation).

---

## Assumptions

- Review is source-only against exact SHAs stated above.
- TS `authorization.ts` / `import-validation.ts` are planning helpers, not the security boundary (SQL RPCs are).
- Owner decisions D-1…D-12 remain undecided; this review does not select them.
- Local full-suite import-template timeouts are environmental flakes; CI success on the same SHA is authoritative for that surface.
- GA sibling drafts also omit `.NOT_APPLIED.sql`; mission naming still requires the suffix for AUTHORIZATION-04.

## Risks

- Applying AUTHORIZATION-04 before fixing the list-RPC approved gate would expose published engagement listings to non-approved owned records via DEFINER RPCs.
- Direct follow-up assignment remains an intentional college-scope override (by design A4).
- Opportunity/employer moderation is college-wide for any specialist (matches matrix; broad staff power).
- No routes exist yet; future wiring must call only audited RPCs.

## Production impact

**None from this review.** No migrations applied, no deploy, no data changes, no PR #273 source edits. PR remains draft.

## Obstacles

- Local full `bun test` flaked on unrelated import workbook timeouts; CI green used as arbiter for that suite.
- Required negative-matrix expansion could not be implemented without modifying PR #273 source (forbidden); gaps recorded as blockers instead.

---

## Final decision (repeated)

`HOLD_PORTAL_GRADUATES_AFFAIRS_AUTHORIZATION_PR273_VISIBLE_LIST_RPC_SKIPS_APPROVED_GATE`

Clear the P1 approved-gate defect, complete naming rename + CI path updates,
close the named negative-matrix gaps (or retract over-claims), and reconcile
PR #271 UI overlap before re-review.
