# PORTAL-GRADUATES-AFFAIRS-AUTHORIZATION-PR273-INDEPENDENT-FINAL-REVIEW-05B

Date: 2026-08-02  
Mode: LONG INDEPENDENT SOURCE-ONLY SECURITY REVIEW  
Repository: `msorori-mh/saba-uni-portal`  
PR: [#273](https://github.com/msorori-mh/saba-uni-portal/pull/273)  
Review branch: `review/graduates-affairs-pr273-independent-final-05b`

## Final decision

`HOLD_PORTAL_GRADUATES_AFFAIRS_AUTHORIZATION_PR273_VISIBLE_LIST_RPC_SKIPS_APPROVED_GATE`

This is a source-package security readiness decision. It is **not** authorization
to apply SQL, activate a feature, create accounts, deploy, publish, merge PR
#273, or mark it Ready. The twelve owner decisions were not implemented.

**Supersedes the Lovable 05 report on `main@993ce0ec`:** that HOLD
(`REVIEWED_SHA_UNREACHABLE` / mirror without PR objects) is **environmental
only** and is **not** a source finding. This 05B review obtained the exact SHA,
full PR diff, executable PG chain, and CI evidence.

---

## Source gate

| Check | Result |
|---|---|
| Local HEAD at review start | `23bb9c8e2e1e1e1a73c235e4f422420a581166e2` — **PASS** |
| Remote PR #273 head (`gh` / `pr-273-head`) | `23bb9c8e2e1e1e1a73c235e4f422420a581166e2` — **PASS** |
| Full PR diff vs base | 19 files, +4522/−83 — **PASS** |
| Working tree clean | **PASS** |
| Current main after PR base | `993ce0ec` — only report docs (`PORTAL-GRADUATES-AFFAIRS-AUTHORIZATION-PR273-INDEPENDENT-FINAL-REVIEW-05-REPORT.md` + Lovable commit metadata). **No Graduates Affairs runtime / SQL / test / CI contract changes.** — **PASS** |

| SHA role | Value |
|---|---|
| Exact reviewed SHA | `23bb9c8e2e1e1e1a73c235e4f422420a581166e2` |
| Base main at PR creation | `8729f6d5d61d5a55052fe9f7cda2bd360d9bb421` |
| Current main | `993ce0ec5cb45524759831de488940a4f25d00b0` |
| PR #271 HEAD (overlap) | `13cae0ac700713c68458b97f41459ac086e63cbf` |

---

## Changed-file inventory (base…reviewed SHA)

| Path | Role |
|---|---|
| `.github/workflows/ci.yml` | Adds `graduates-affairs-authorization` PG 17 chain |
| `docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.sql` | Auth RLS/RPC draft |
| `docs/PORTAL-GRADUATES-AFFAIRS-AUTHORIZATION-DECISION-PACKAGE-04.md` | 12 owner decisions |
| `docs/PORTAL-GRADUATES-AFFAIRS-AUTHORIZATION-MATRIX-04.md` | Actor/capability matrix |
| `docs/PORTAL-GRADUATES-AFFAIRS-OVERNIGHT-CLOSURE-04-REPORT.md` | Author closure |
| `docs/PORTAL-GRADUATES-AFFAIRS-PRIVACY-AND-PII-AUDIT-04.md` | PII audit |
| `docs/PORTAL-GRADUATES-AFFAIRS-VISUAL-UX-ACCESSIBILITY-QA-01-REPORT.md` | Visual/privacy QA |
| `src/components/graduates-affairs/*` (4 panels + `display-format.ts`) | UI/privacy |
| `src/lib/graduates-affairs/authorization.ts` | TS capability mirror (non-boundary) |
| `src/lib/graduates-affairs/import-validation.ts` | Fail-closed import batch |
| `tests/graduates-affairs/graduates-affairs-authorization-04*` | SQL text + bun + pg-setup/verify |
| `tests/graduates-affairs/graduates-affairs-visual-ux-qa-01.test.ts` | Visual regression |

**No B1 / Graduation Projects / enrollment-certificate / `student_visible` files.** — **PASS**

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

---

## Primary verification checklist

| Item | Verdict |
|---|---|
| `auth.uid()` only authoritative actor | **PASS** |
| Ownership via `student_profiles.user_id` | **PASS** (`graduate_is_self`) |
| Manager college scope only | **PASS** |
| Specialist department-scoped | **PASS** (empty scope fail-closed) |
| Direct follow-up assignee = assigned record only | **PASS** (`open`/`in_progress`) |
| No admin/registrar/dean general bypass | **PASS (code)** — no `app_role`/`has_role`; **GAP** in named pg fixtures |
| Profile mutable allowlist | **PASS** (4 fields SQL + TS) |
| `row_version` stale update prevention | **PASS** |
| Employment / survey / event transitions | **PASS** |
| Opportunity audience fail-closed | **PASS** |
| Empty `{}` matches nothing | **PASS** |
| Malformed audience matches nothing | **PASS (code)** — `jsonb_typeof` object gate; **GAP** in pg-verify fixture |
| `protected_value` never returned | **PASS** |
| `notes_protected` never returned | **PASS** |
| Small aggregate cells suppressed | **PASS** (completion + staff wrapper) |
| PUBLIC EXECUTE revoked | **PASS** |
| anon EXECUTE denied | **PASS** |
| authenticated grants exact (20 RPCs + 3 policy helpers) | **PASS** |
| SECURITY DEFINER + pinned `search_path` | **PASS** (no explicit `OWNER TO`; apply-time residual) |
| RLS default-deny | **PASS** (exactly 7 SELECT policies) |
| Rejected calls zero mutation | **PASS (partial)** — proven on C/D/F paths |
| Import batch fails on one invalid row | **PASS (TS)** |
| Duplicate import references fail safely | **PASS (TS + foundation UNIQUE)** |
| No B1 / Graduation Projects change | **PASS** |

---

## Exact blockers / findings

### [P1] BLOCKER — Visibility list RPCs skip approved-record gate

`docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.sql` — 
`graduate_list_visible_opportunities` / `graduate_list_visible_events`
(approx. L758–820).

- Mutating self RPCs raise `GRADUATE_RECORD_NOT_APPROVED` when not `approved`.
- RLS path uses `graduate_self_matches_audience`, which requires
  `record_state = 'approved'`.
- List RPCs only call `graduate_is_self` + audience match.

Foundation constraint: records are **inserted only as `approved`**, but may later
become `corrected` / `revoked` via official-decision propagation. For those
states, DEFINER list RPCs still return published opportunities/events that RLS
would hide. Fail-closed engagement after revocation/correction is weakened.

**Required remediation (not applied here):** add the same approved gate used by
mutating self RPCs; add pg-verify for corrected/revoked self denial.

### [P2] Residual — negative matrix named-actor gaps

pg-verify covers anonymous, self, other graduate, manager, in-/out-of-department
specialist, direct assignee, unrelated/inactive/expired staff, empty audience,
stale `row_version`, survey duplicate correlation, protected PII read,
cross-department search, partial zero-mutation and illegal employer/opportunity
transitions.

**Missing named fixtures:** unlinked graduate, registrar, dean, admin, malformed
audience, illegal follow-up transition, import invalid/duplicate batch
(import covered in bun TS only). Code remains fail-closed by omission for
`app_role` holders; coverage claims in matrix prose overstate executable proof.

### [P2] Residual — multi-profile specialist department union

`graduate_affairs_specialist_department_ids` unions departments across any
`staff_profiles` row for `auth.uid()`, not only the assignment’s
`staff_profile_id`.

### [P3] Residual — import “SQL gate” doc mismatch

`import-validation.ts` claims to mirror an AUTHORIZATION-04 SQL import gate;
no import RPC exists in that draft.

### [P3] Residual — `graduate_my_contact_points` also skips approved

Metadata-only; add/revoke still require approved. Align for consistency.

---

## Grants / RLS / search_path verdict

| Control | Verdict |
|---|---|
| Helpers revoked from PUBLIC/anon/authenticated | **PASS** |
| Policy helpers: PUBLIC/anon revoke, authenticated GRANT | **PASS** |
| 20 RPCs: PUBLIC/anon revoke → authenticated GRANT | **PASS** |
| 7 SELECT policies only; no write policies | **PASS** |
| Protected tables policy-less | **PASS** |
| SECURITY DEFINER + `search_path = public, pg_temp` | **PASS** |
| Explicit OWNER | **GAP** (apply-time) |

---

## Actor matrix (required expansion)

| Actor / scenario | Coverage | Verdict |
|---|---|---|
| anonymous | pg-verify D | **COVERED** |
| graduate self | B | **COVERED** |
| another graduate | C | **COVERED** |
| unlinked graduate | — | **MISSING** |
| manager | F | **COVERED** |
| correct-department specialist | E | **COVERED** |
| wrong-department specialist | E | **COVERED** |
| direct assignee | G | **COVERED** |
| unrelated staff | D | **COVERED** |
| registrar / dean / admin | code DENY by omission | **MISSING fixtures** |
| stale `row_version` | B | **COVERED** |
| malformed audience | code only | **MISSING** |
| empty audience | H | **COVERED** |
| illegal transition | E/F partial | **PARTIAL** |
| protected PII read | F + I | **COVERED** |
| direct RPC misuse | C/D partial | **PARTIAL** |
| cross-department search | E | **COVERED** |
| invalid import row / duplicate ref | bun TS | **TS ONLY** |
| zero-mutation proof | C/D/partial F | **PARTIAL** |

---

## PostgreSQL results

Disposable Docker `postgres:17` (server `17.10`):

```
setup → FOUNDATION-01 → COMPLETION-01 → AUTHORIZATION-04 → pg-verify
```

**CHAIN PASS** — NOTICE `graduates-affairs-authorization-04 pg-verify: PASS`

CI job `PG 17 verifier · graduates-affairs-authorization` on the exact SHA:
**SUCCESS** ([run 30692620484](https://github.com/msorori-mh/saba-uni-portal/actions/runs/30692620484)).

---

## PII verdict

| Control | Verdict |
|---|---|
| `protected_value` never returned | **PASS** |
| `notes_protected` never returned | **PASS** |
| Aggregate min-cell suppression | **PASS** |
| UI: no raw contact/storage internals | **PASS** (visual suite) |
| At-rest plaintext until owner D-3/D-7 | Residual (documented unreadability) |

---

## Import verdict

| Control | Verdict |
|---|---|
| Whole-batch fail-closed | **PASS** (TS) |
| Duplicate `(sourceKind, sourceReference)` | **PASS** (TS + UNIQUE) |
| SQL import RPC in AUTHORIZATION-04 | **ABSENT** (docs over-claim) |

---

## Naming-governance verdict

| | Path |
|---|---|
| Present | `docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.sql` |
| Mission-required name | `…/GRADUATES-AFFAIRS-AUTHORIZATION-04.NOT_APPLIED.sql` |

**Classification: accepted repository-wide exception** for the Graduates Affairs
draft family.

Evidence:

- Sibling drafts `GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql` and
  `GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql` use the same plain `.sql` pattern
  with header `DRAFT ONLY — SOURCE REVIEW ARTIFACT — DO NOT APPLY`, outside
  `supabase/migrations/`.
- `.NOT_APPLIED.sql` is the B1 fixture/cleanup naming pattern, not the GA
  review-chain pattern.
- CI and tests hard-code the current GA filenames.

Not a merge blocker for PR #273 alone. Optional future repo-wide alignment may
rename the whole GA family; do **not** silently rename during review (honored).

---

## PR #271 overlap

| Bucket | Finding |
|---|---|
| Duplicates (7 paths) | CommPanel, FileCard, display-format, UX report, ReportsPanel, SurveyCard, visual-ux test |
| Byte-identical | CommPanel, FileCard, display-format, UX report |
| Conflicts (prefer #271) | ReportsPanel (`overflow-x-auto`), SurveyCard (`flex-wrap`), visual-ux test (+ mobile collapse) |
| Authorization-model overlap | #273 implements closed assignment model + AUTH-04; #271 keeps G4 HOLD + default-deny tests — complementary code, narrative tension |
| UI overlap | Same presentational panels; #271 is mobile-strict superset on 2 files |
| Tests overlap | Shared visual suite (prefer #271); auth-04 exclusive to #273; g4-default-deny exclusive to #271 |

### Merge-order recommendation

1. **Merge PR #273 into main first** (after clearing the P1 blocker) — it is the
   authoritative Graduates Affairs authorization deliverable.
2. **Do not** fold AUTHORIZATION-04 into PR #271 (GP mega-branch; buries auth review).
3. Rebase #271 onto post-#273 main; on the three GA conflicts take **#271**.
4. Soft-update #271 G4 “undecided” docs to point at AUTH-04 after #273 lands.

---

## CI evidence

Run [`30692620484`](https://github.com/msorori-mh/saba-uni-portal/actions/runs/30692620484)  
HEAD = exact reviewed SHA `23bb9c8e…` — **completed SUCCESS** for quality, bun
tests, and all PG 17 verifier legs including `graduates-affairs-authorization`.

---

## Tests

| Command | Result |
|---|---|
| PG17 auth chain | **PASS** |
| `bun test tests/graduates-affairs` | **110 / 0** |
| `bun test tests/student-requests` | **1060 / 0** |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | **183 / 0** |
| `bun test` (full) | **2465 / 0** |
| `bunx tsc --noEmit` | **PASS** |
| `bun run build` | **PASS** |
| `git diff --check` (base…SHA) | **PASS** |

---

## Exact blockers (summary)

1. **VISIBLE_LIST_RPC_SKIPS_APPROVED_GATE** — P1 fail-closed gap for
   `corrected`/`revoked` (and any non-approved) self via DEFINER list RPCs.
2. Negative-matrix named-actor expansion remains incomplete (residual; not the
   primary HOLD token).
3. Soft process: after fix, merge #273 before #271; keep #271 UI on conflicts.

Naming suffix absence is **not** a blocker (accepted GA-family exception).
Lovable environmental HOLD is **not** a source blocker.

---

## Assumptions

- Review is source-only against the SHAs above; no apply/deploy/merge.
- TS adapters are not the security boundary.
- Owner decisions D-1…D-12 remain open.
- Published opportunity/event listings are non-PII but still subject to the
  approved-record engagement gate.

## Risks

- Applying AUTH-04 before fixing list RPCs would allow corrected/revoked
  graduates to list published engagement via DEFINER while RLS denies it.
- Direct assignment remains an intentional scope override (A4).
- No routes exist yet; future wiring must call only audited RPCs.

## Production impact

**None from this review.** PR #273 source unmodified. Report-only commit on the
review branch.

## Obstacles

- Prior Lovable 05 HOLD on main was environmental (unreachable SHA in that
  workspace); ignored as a source finding per mission brief.

---

## Final decision (repeated)

`HOLD_PORTAL_GRADUATES_AFFAIRS_AUTHORIZATION_PR273_VISIBLE_LIST_RPC_SKIPS_APPROVED_GATE`

Clear the P1 approved-gate defect (and preferably expand named negative
fixtures) before re-review. Naming is an accepted GA-family exception, not a
blocker. Merge order after fix: **#273 → main, then #271**.
