# PORTAL-24H-GRADUATES-AFFAIRS-PRODUCTION-FULL-CLOSURE-01

**Date:** 2026-08-10 (Asia/Riyadh)  
**Branch:** `ops/24h-graduates-production-closure-01`  
**Main tip at recon:** `a99f4543c4c49e77588c0ff788fabd4356a4d3b5`  
**Production project:** `wpmicqriltrowwonknox` (Lovable `90f4dcde-07fb-4441-b86a-6ad5510833b8`, PostgreSQL 17.6)  
**Mode:** SOURCE closure + production READ-ONLY preflight. Zero production writes.

---

## Decision

`HOLD_PORTAL_24H_GRADUATES_AFFAIRS_PRODUCTION_CLOSED_PENDING_C9_AND_SPECIALIST_SCOPE`

Graduates Affairs source package is merge-ready and production-apply ready **except**
external write-gate blockers. The target token
`PASS_PORTAL_24H_GRADUATES_AFFAIRS_PRODUCTION_CLOSED` is **not** emitted.

---

## PHASE A — Reconcile (main vs production)

| Dimension | Source (main) | Production | Verdict |
|---|---|---|---|
| Unit `graduate_affairs` | seeded (`20260716172804`) | present, active; AR label still «شؤون الدراسات العليا» | PASS (codes canonical per OWNER_D1; label remediation optional later) |
| Roles manager/specialist | seeded, active | both active | PASS |
| GA1 Foundation `20260808210000` | on main; FULL `3248cf64…` BODY `43bf602f…` | ledger + objects ABSENT | APPLY CANDIDATE |
| GA2 Completion `20260808210100` | on main; FULL `3e37afba…` BODY `834e454f…` | ABSENT | APPLY CANDIDATE |
| GA3 AUTH04 `20260808210200` | on main; FULL `212865fb…` BODY `3a85f54d…` | ABSENT | APPLY CANDIDATE |
| Partial GA objects | none expected | `graduate_%` relations/functions/types = **0** | CLEAN |
| Migration tip | — | advanced during mission; see Phase C | C0–C4 + C5V2 present; C6–C9 not verified |
| Manager assignment | ops config | 1 active `staff_profile` manager | PASS readiness |
| Specialist assignment | ops config | 1 active specialist, **0** `staff_profile_departments` | **HOLD** |
| Ambiguous staff profiles | fail-closed | 0 | PASS |
| OWNER_D1 / OWNER_D2 / intake | frozen in DECISION-PACKAGE-04 | n/a | PASS |
| Continuity policy rows | post-AUTH04 config | table absent (expected) | PASS |
| Official intake → graduate fact | Foundation gate only; no candidate/status proxy | schema absent | PASS design |
| Privacy / protected values | AUTH04; no client read of `protected_value` / `notes_protected` | n/a until apply | PASS source |
| Opportunities/events/surveys/employment | Completion + AUTH04 | absent until apply | PASS source |
| Reports min-cell | SQL `GREATEST(min, 3)` default 5; TS default 5 | n/a | PASS |
| Feature flags | both OFF | n/a | PASS |

Exact GA migrations required (ordered, one-at-a-time):

1. `supabase/migrations/20260808210000_ga_mvp_foundation_01.sql`
2. `supabase/migrations/20260808210100_ga_mvp_completion_01.sql`
3. `supabase/migrations/20260808210200_ga_authorization_04.sql`

No additional GA schema migrations are missing from main. Hash pins match
`docs/migration-evidence/graduates-affairs/GA_RELEASE_HASH_MANIFEST.txt`.

Lifecycle note: authoritative fact states are
`pending → approved → corrected|revoked` on official decisions / graduate
records. External academic notions (candidate / eligible / graduation_approved)
never authorize GA access (proven by runtime-wire matrix).

---

## PHASE B — Source closure

### Already on main (verified)

- Promoted GA1/GA2/GA3 migrations + post-verifiers
- Hash manifest + release contract tests
- PG17 exact rehearsal + 10/10 failure matrix (cross-platform PS1)
- AUTH04 negative/positive matrices, follow-up authority race, context RPC matrix
- Import validation fail-closed batch gate
- Runtime adapters + flags OFF

### Closed in this mission

| Item | Action |
|---|---|
| Staff operational workspace stub | Integrated PR #325 surface (`GraduatesAffairsStaffWorkspace`) behind flag OFF |
| Lovable apply-one packets GA1–GA3 | Brought from operator-pack PR #330 onto this branch |
| SELECT-only prod preflight | `docs/migration-drafts/GA-PRODUCTION-PROMOTION-PREFLIGHT-READONLY-SELECT-01.sql` |
| Specialist scope dry-run | `docs/migration-drafts/GA-PRODUCTION-SPECIALIST-SCOPE-REMEDIATION-DRY-RUN-01.sql` |

### Local verification (this worktree)

| Check | Result |
|---|---|
| `scripts/ga-local-exact-rehearsal.ps1` | `LOCAL_EXACT_APPLY_REHEARSAL_PASS` |
| `scripts/ga-failure-matrix-rehearsal.ps1` | `LOCAL_FAILURE_MATRIX_REHEARSAL_PASS` (10/10) |
| `bun test tests/graduates-affairs` | **184 pass / 0 fail** (after `bun install` + closure artifacts) |
| `bunx tsc --noEmit` | clean |
| `git diff --check` | clean |
| Hash pins FULL/BODY | match manifest |

---

## PHASE C — Production read-only preflight

Channel: Lovable MCP `query_database` (SELECT only).  
Captured: 2026-08-10.

```
PG=17.6
MIGRATION_TIP=20260810180000 (councils_c5_minutes_lifecycle_02) — tip moved during mission
GA_LEDGER_ROWS=0
GRADUATE_OBJECTS=0
GRADUATE_FUNCTIONS=0
GRADUATE_TYPES=0
UNIT_OK=YES (graduate_affairs)
ROLES_OK=YES (manager + specialist)
ACTIVE_MANAGERS=1
ACTIVE_SPECIALISTS=1
SPECIALISTS_WITHOUT_DEPARTMENT_SCOPE=1
AMBIGUOUS_STAFF=0
C5V2_APPLIED=YES (20260810180000)
C6_C9_EXACT_VERSIONS=ABSENT
COUNCIL_REPORT_RPCS=0
AC_NOTIFICATIONS=ABSENT
FLAGS_SOURCE=staffGraduatesAffairs:false studentGraduatesAffairs:false
PRODUCTION_WRITES=0 (this agent)
```

Live SELECT preflight
(`GA-PRODUCTION-PROMOTION-PREFLIGHT-READONLY-SELECT-01.sql`):

**Preflight token:** `HOLD_SPECIALIST_MISSING_DEPARTMENT_SCOPE`  
**Councils write-gate signal:** `C9_NOT_VERIFIED`

Even if specialist scope were remediated, mission contract forbids GA apply
until C9 is verified and owner production authorization exists.

---

## Write gate — NOT OPEN

Do **not** apply GA1/GA2/GA3 until all of:

1. Councils C9 verified in production (reports/notifications surface + ledger).
2. Explicit owner production authorization for GA apply-one sequence.
3. Specialist `staff_profile_departments` remediated (or specialist assignment revoked before apply).
4. Per-migration: hash pin → apply one → matching post-verifier PASS → STOP.

Apply-one packets:

- `docs/go-live/operator-packets/GA1-LOVABLE-APPLY-ONE.txt`
- `docs/go-live/operator-packets/GA2-LOVABLE-APPLY-ONE.txt`
- `docs/go-live/operator-packets/GA3-LOVABLE-APPLY-ONE.txt`
- Runbook: `docs/migration-drafts/GA-PRODUCTION-APPLY-ONE-QUALIFICATION-01.md`

---

## Exhausted queue while gated

- Authorization matrices (TS + PG17) — PASS
- Import/reconciliation tooling contract — PASS (fail-closed batch)
- Reports / min-cell suppression — PASS (SQL floor 3 / default 5)
- Edge-case failure matrix + recovery drills — PASS
- Staff UI operational surface (flag OFF) — integrated
- Browser E2E against live GA schema — **blocked** (schema absent + flags OFF); disposable PG E2E matrix covers actor denials

---

## Files touched this mission

```
docs/reviews/PORTAL-24H-GRADUATES-AFFAIRS-PRODUCTION-FULL-CLOSURE-01-REPORT.md
docs/reviews/PORTAL-GRADUATES-AFFAIRS-ADMIN-SURFACE-INTEGRATION-01.md
docs/migration-drafts/GA-PRODUCTION-PROMOTION-PREFLIGHT-READONLY-SELECT-01.sql
docs/migration-drafts/GA-PRODUCTION-SPECIALIST-SCOPE-REMEDIATION-DRY-RUN-01.sql
docs/go-live/operator-packets/GA1-LOVABLE-APPLY-ONE.txt
docs/go-live/operator-packets/GA2-LOVABLE-APPLY-ONE.txt
docs/go-live/operator-packets/GA3-LOVABLE-APPLY-ONE.txt
src/components/portal/GraduatesAffairsStaffWorkspace.tsx
src/routes/staff.graduates-affairs.tsx
src/lib/graduates-affairs/rpc.ts
tests/graduates-affairs/graduates-affairs-admin-surface-integration-01.test.ts
tests/graduates-affairs/ga-production-full-closure-readiness-01.test.ts
```

---

## Assumptions

- Lovable project `90f4dcde-…` remains the production DB for `wpmicqriltrowwonknox`.
- PR #299 content already landed on main via prior integrate commits; open PR #299 is residual stacking noise.
- Label-only Arabic remediation for unit/role names is deferred (OWNER_D1 option A codes unchanged).

## Risks

- Applying GA while specialist lacks department scope would leave a provisioned specialist who can never see records (fail-closed) and would fail foundation preflight if that check is enforced pre-apply.
- Councils C5–C9 campaign is an external dependency; GA SQL does not depend on C9 objects, but release policy does.

## Production impact

Zero. No migrations applied. No flags flipped. No deploy. No demo/staff data mutation.

## Resume → PASS_PORTAL_24H_GRADUATES_AFFAIRS_PRODUCTION_CLOSED

1. C9 verified + owner auth.
2. Specialist scope remediated (or assignment cleared).
3. SELECT preflight returns `READY_FOR_APPLY_FOUNDATION`.
4. Apply GA1 → foundation verifier PASS → STOP.
5. Apply GA2 → completion verifier PASS → STOP.
6. Apply GA3 → AUTH04 verifier PASS → STOP.
7. Config dry-run → governed continuity policy + assignment confirmation.
8. Keep feature flags OFF until separate enablement decision.
9. Emit `PASS_PORTAL_24H_GRADUATES_AFFAIRS_PRODUCTION_CLOSED`.
