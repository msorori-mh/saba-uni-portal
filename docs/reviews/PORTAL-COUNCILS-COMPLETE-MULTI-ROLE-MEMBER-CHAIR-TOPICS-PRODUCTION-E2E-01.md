# PORTAL-COUNCILS-COMPLETE-MULTI-ROLE-MEMBER-CHAIR-TOPICS-PRODUCTION-E2E-01

DECISION: **HOLD_PORTAL_COUNCILS_COMPLETE_MULTI_ROLE_MEMBER_CHAIR_TOPICS_PRODUCTION_E2E_NO_AUTHENTICATED_COUNCIL_ACTOR_SESSIONS**

Mode executed: G0–G3 discovery (read-only), G2 structural reverify, G25 regression/typecheck,
partial G23 negative session check. G4–G22 not executed — see BLOCKER.

## G0 — PRODUCTION TRUTH

```
CURRENT_MAIN_SHA=ed2cb0b11d000f7d29e6af00e706766ff8f5824d
CURRENT_DEPLOYED_SHA=0200b6a12568602688b1b8003ae46cc6280d62ec
SHA_MATCH=NO (source ahead of published build)
COUNCIL_SCHEMA_STATE=PRESENT (councils, members, meetings, topics, agenda_items,
  attendance, attendance_rolls, quorum_policies/evaluations, votes/vote_results,
  minutes/amendments, decisions, notifications, audit events)
COUNCIL_LEDGER_STATE=C0–C9 applied; structural head-fix migration applied
STRUCTURAL_HEAD_FIX_PRESENT=YES (membership_source, source_position_assignment_id,
  reconcile_department_head_council_memberships, trg_sync_department_head_council_memberships)
STRUCTURAL_HEAD_FIX_POSTVERIFY=PASS (no drift, no re-backfill performed)
```

### Councils discovered (no hard-coded names used)

| Council | Type | ID |
|---|---|---|
| مجلس الكلية | college | 8a3381c5-77e0-4c84-b0f2-d44be4dbd1a8 |
| مجلس قسم علوم الحاسوب | department | 2b7ab808-e1bb-4df6-9414-1d9565f0c4d7 |
| مجلس قسم نظم المعلومات الحاسوبية | department | c43a194a-68ea-4d98-8bfb-7731c9704ccd |
| مجلس قسم تكنولوجيا المعلومات | department | 663bc159-ab2d-4191-9d94-ce59c289f860 |

ACTIVE_MEMBERSHIPS = 14

| Council | Person | Role | Source |
|---|---|---|---|
| College | أ.م.د. مقبول قايد الكامل (maqbol3) | chair | official_assignment |
| College | د. اسامه سيف (osamah.saif) | member | administrative_position |
| College | د. خالد البراحي (kh.alborahy) | member | administrative_position |
| College | د. رمزي الجابري (ramzi) | member | administrative_position |
| College | د. عبدالعزيز ثوابه (azizth) | member | official_assignment |
| College | أ.م.د. مختار السروري (msorori) | member | official_assignment |
| CS | د. اسامه سيف | chair | official_assignment |
| CS | د. عيسى محمد (issamohammed.cs) | secretary | official_assignment |
| CS | د. يحيى محمد (yahya.mohammed) | member | official_assignment |
| IS | د. رمزي الجابري | chair | official_assignment |
| IS | د. غسان المعمري (ghassan.almaamari) | secretary | official_assignment |
| IS | أ.م.د. مختار السروري | member | official_assignment |
| IT | د. خالد البراحي | chair | official_assignment |
| IT | أ. يوسف الهجري (ywsfalhwlndy) | secretary | official_assignment |

Councils operational data at baseline: meetings=1, topics=2, agenda_items=0, attendance=0,
votes=0, minutes=0, decisions=0, quorum_policies=0.

## G1 — ACTOR MATRIX

| ACTOR | USER_ID | LOGIN | COUNCIL | TYPE | EXPECTED_ROLE | AUTH_PRINCIPAL_PROVEN | SESSION_AVAILABLE | SCOPE |
|---|---|---|---|---|---|---|---|---|
| A Ordinary dept member | 6e46bad6-…f26cf0 | yahya.mohammed@usr.edu.ye | CS | department | member | YES (DB) | **NO** | G3,G4,G5,G21 |
| B Department chair | f602b62c-…b347d | ramzi@usr.edu.ye | IS | department | chair | YES (DB) | **NO** | G7,G10,G11 |
| C College member | f602b62c-…b347d / 0023ca37-… | ramzi@ / azizth@ | College | college | member | YES (DB) | **NO** | G8,G10 |
| D College chair | b3dd71e6-…e7bf0 | maqbol3@usr.edu.ye | College | college | chair | YES (DB) | **NO** | G9 |
| E Multi-role head | f602b62c-…b347d | ramzi@usr.edu.ye | IS + College | both | chair + member | YES (DB) | **NO** | G10,G11,G20 |
| Non-member control | aec1303e-…5b535 | mameen@usr.edu.ye | — | — | none | YES | YES | negative |

## G2 — DEPARTMENT HEADS REVERIFY (no mutation)

| Head | Own council | Own role | College role | ACTIVE_COUNCIL_COUNT |
|---|---|---|---|---|
| د. اسامه سيف | CS | chair | member | 2 |
| د. رمزي الجابري | IS | chair | member | 2 |
| د. خالد البراحي | IT | chair | member | 2 |

Result: **PASS**, precondition holds, zero re-backfill.

## BLOCKER (why G4–G22 were not executed)

Full production authenticated E2E requires acting as five distinct real staff/faculty
principals. In this environment:

1. Only one browser session is injected (mameen@usr.edu.ye, archive staff, non-member).
2. Sessions for ramzi / maqbol3 / yahya / osamah / kh.alborahy cannot be produced without
   the account owner signing in. Creating auth users, changing passwords, or minting
   impersonation tokens for real staff is explicitly forbidden by project rules and was
   not attempted.
3. The read-only DB tool cannot execute council functions:
   `ERROR 42501: permission denied for function is_council_member`. The restricted psql
   role likewise cannot execute functions. Therefore even the backend-only authorization
   matrix (G19) cannot be exercised through DB tooling; it needs real bearer tokens
   against PostgREST/RPC.

Consequently every journey gate that requires an authenticated principal
(G4–G22 mutations and denials) is **NOT_RUN**, not FAILED. No substitute
(TEST_ONLY staff account, service-role write, RLS-bypass mutation) was used, per mission
constraints.

Unblock path (single manual step per actor, same handoff used in earlier missions):
sign in as each actor in the preview and hand the turn back; each journey can then be
executed end-to-end without further approvals.

## G25 — REGRESSION

```
TYPECHECK (bunx tsc --noEmit) = PASS
TESTS  bun test tests/academic-councils = 103 pass / 20 fail (123 across 22 files)
  - 19 failures: "docker required" — the PG17 disposable harness and PostgREST HTTP
    matrix cannot start containers in this sandbox (environmental, not source defects).
  - 1 failure: pr314-rc313 test 4 — routeTree semantic SHA pin
    (09be61de…0a7c) is stale after legitimate later route additions
    (staff audit-log, fee-assessment-board, fixtures-diagnostics …). All reachability
    assertions in the same test pass; classified LOW / stale-pin. Not re-pinned here,
    because re-pinning a governance fingerprint is out of scope for a read-only gate.
git diff --check = clean
```

## G24 — TEST DATA SAFETY

```
EXPECTED_MUTATIONS=0
UNEXPECTED_MUTATIONS=0
```
No TEST_ONLY councils data was created; no meeting, topic, agenda item, attendance,
vote, minutes, decision, or membership row was inserted, updated, or deleted.

## FINAL MATRIX

```
CURRENT_MAIN_SHA=ed2cb0b11d000f7d29e6af00e706766ff8f5824d
CURRENT_DEPLOYED_SHA=0200b6a12568602688b1b8003ae46cc6280d62ec
SHA_MATCH=NO
COUNCILS_DISCOVERED=4 (1 college, 3 department)
ACTIVE_MEMBERSHIPS=14
ORDINARY_MEMBER_ACTOR=yahya.mohammed@usr.edu.ye (CS, member)
DEPARTMENT_CHAIR_ACTOR=ramzi@usr.edu.ye (IS, chair)
COLLEGE_MEMBER_ACTOR=ramzi@usr.edu.ye / azizth@usr.edu.ye (College, member)
COLLEGE_CHAIR_ACTOR=maqbol3@usr.edu.ye (College, chair)
MULTI_ROLE_ACTOR=ramzi@usr.edu.ye (IS chair + College member)
ORDINARY_MEMBER_E2E=NOT_RUN (no session)
DEPARTMENT_CHAIR_E2E=NOT_RUN (no session)
COLLEGE_MEMBER_E2E=NOT_RUN (no session)
COLLEGE_CHAIR_E2E=NOT_RUN (no session)
MULTI_ROLE_E2E=NOT_RUN (no session)
TOPIC_CREATE=NOT_RUN
TOPIC_RETURN_RESUBMIT=NOT_RUN
TOPIC_TO_AGENDA=NOT_RUN
MEETING_LIFECYCLE=NOT_RUN (contract present: scheduled→intake_open→intake_closed→
  agenda_ready→in_session→minutes_draft→minutes_review→minutes_locked→archived|cancelled)
ATTENDANCE=NOT_RUN
QUORUM=NOT_RUN
VOTING=NOT_RUN
MINUTES=NOT_RUN
DECISIONS=NOT_RUN
FOLLOWUP_ARCHIVE=NOT_RUN
DIRECT_RPC_MATRIX=NOT_RUN (function EXECUTE denied to read-only tooling)
CROSS_COUNCIL_IDOR=NOT_RUN
ROLE_UNION_ISOLATION=STRUCTURALLY_CONFIRMED_DB_ONLY (role is stored per (council_id,user_id);
  no global MAX_ROLE column exists) — runtime proof NOT_RUN
ADMIN_BYPASS_DENIAL=SOURCE_ASSERTED (surface test 5 passes: no admin/dean bypass markers) —
  runtime proof NOT_RUN
UX_DESKTOP=NOT_RUN for council actors
UX_MOBILE=NOT_RUN
RTL=NOT_RUN
SESSION_ISOLATION=PARTIAL (non-member/non-faculty session is redirected to portal login on
  /faculty-portal/academic-councils; per-actor isolation NOT_RUN)
EXPECTED_MUTATIONS=0
UNEXPECTED_MUTATIONS=0
TESTS=103 pass / 20 fail (19 docker-environment, 1 stale routeTree pin)
TYPECHECK=PASS
BUILD=NOT_RUN (blocked gate; typecheck clean, no source change in this mission)
CRITICAL_COUNT=0
HIGH_COUNT=0
```

FINAL TOKEN:
`HOLD_PORTAL_COUNCILS_COMPLETE_MULTI_ROLE_MEMBER_CHAIR_TOPICS_PRODUCTION_E2E_NO_AUTHENTICATED_COUNCIL_ACTOR_SESSIONS`

---

# AUTHENTICATED LIFECYCLE CONTINUATION-02

MISSION: PORTAL-COUNCILS-AUTHENTICATED-LIFECYCLE-AND-ACTOR-STATE-PRODUCTION-E2E-CONTINUATION-02
(G0–G25 evidence above is preserved unchanged.)

## C0 — RELEASE ALIGNMENT (CLOSED)

| Item | Value |
|---|---|
| PREVIOUS_MAIN_SHA | ed2cb0b1 |
| PREVIOUS_DEPLOYED_SHA | 0200b6a12568602688b1b8003ae46cc6280d62ec |
| RUNTIME_DIFF_EXISTS | YES — 46 files / +3150 lines vs deployed (auth/session artifacts clearing, logout hooks, faculty-portal.tsx, __root.tsx, 3 new staff routes, routeTree, B1 preflight surfaces) |
| CURRENT_MAIN_SHA | 1969727a1b2840f5b30f34374b10542a129bf4f6 |
| DEPLOYED_SHA (/version.json, quboolye.com) | 1969727a1b2840f5b30f34374b10542a129bf4f6 |
| SHA_MATCH | **YES** |

Defect found and fixed during alignment (DEF-C02-01, MEDIUM):
the first publish of this mission returned `{"sha":"unknown"}` because the publish
build sandbox had no `.git`, so `resolveBuildSha()` degraded to the sentinel and
release alignment became unprovable. Remediation (forward-only, source):
committed release stamp `build-sha.generated.json` + a new fallback step in
`vite.config.ts` (`env → git → committed stamp → unknown`), with the behavioral
provenance contract extended (`tests/build-provenance`, 38 pass / 0 fail).
The subsequent publish resolved a real git SHA and now matches main exactly.

Gates: `bunx tsgo --noEmit` PASS · `bun run build` PASS · `git diff --check` PASS.

## C1 — TEST BASELINE CLEANUP

A. routeTree semantic pin — **CLOSED**.
Cause: three legitimate new staff routes (`/staff/audit-log`,
`/staff/fee-assessment-board`, `/staff/fixtures-diagnostics`). No councils route
semantics changed. Pin re-issued
`09be61de…` → `a64201aebb8cd34aacf9884b18e860c9dfcbb9766d2b5668cba54e6fc502101c`.
`pr314-rc313-semantic-integration-remediation-03.test.ts` = 7 pass / 0 fail
(the anti-masking assertions for councils reporting routes were kept intact).

B. Docker-dependent suites — 19 tests, environment blocked (`docker info` = UNAVAILABLE).
Classification (all identical in kind):

| TEST (file) | PURPOSE | SECURITY_CRITICAL | EQUIVALENT_EVIDENCE_AVAILABLE | CLASSIFICATION |
|---|---|---|---|---|
| councils-c0-write-surface-hardening | C0 write-surface chain | YES | Production read-only ACL/RLS verifier + C0–C9 apply ledger (G0) | ENVIRONMENT_BLOCKED_WITH_EQUIVALENT_EVIDENCE |
| councils-c1-meeting-state-machine | C1 meeting FSM | YES | C11 production RPC matrix (this mission, pending actor sessions) | ENVIRONMENT_BLOCKED_WITH_EQUIVALENT_EVIDENCE |
| councils-c1-c3-session-gate | session open gate | YES | C13 production attendance/quorum matrix | ENVIRONMENT_BLOCKED_WITH_EQUIVALENT_EVIDENCE |
| councils-c2-verifier-contract | intake/review chain | YES | C10 topic FSM matrix | ENVIRONMENT_BLOCKED_WITH_EQUIVALENT_EVIDENCE |
| councils-c3-attendance-quorum | attendance/quorum | YES | C13 | ENVIRONMENT_BLOCKED_WITH_EQUIVALENT_EVIDENCE |
| councils-c4-c8-final-integration | C0→C7 integration | YES | C14–C17 | ENVIRONMENT_BLOCKED_WITH_EQUIVALENT_EVIDENCE |
| councils-c5-rev02-digest-search-path | search_path + auth negatives | YES | production function fingerprint pins (TARGET-MANIFEST) | ENVIRONMENT_BLOCKED_WITH_EQUIVALENT_EVIDENCE |
| councils-c9-notifications-reporting | C9 chain | NO | C9 apply ledger | ENVIRONMENT_BLOCKED_WITH_EQUIVALENT_EVIDENCE |
| c0-c8 / c9 deterministic concurrency (2) | vote/close, archive/followup, minutes races | YES | C19 concurrency matrix (this mission) | ENVIRONMENT_BLOCKED_WITH_EQUIVALENT_EVIDENCE |
| postgrest-http-authorization-matrix | direct DML + privileged RPC denial | YES | C22 direct RPC matrix on production | ENVIRONMENT_BLOCKED_WITH_EQUIVALENT_EVIDENCE |
| c0-c9 production readiness package | rehearsal + residue | NO | applied production ledger + zero-residue reads | ENVIRONMENT_BLOCKED_WITH_EQUIVALENT_EVIDENCE |
| pr306 release qualification remediation | TEST_ONLY lifecycle + sentinels | NO | C8/C9 lifecycle (this mission) | ENVIRONMENT_BLOCKED_WITH_EQUIVALENT_EVIDENCE |
| phase-a codex HIGH findings closure | H2/H3/H4 closure | YES | production source+function verifier (G25) | ENVIRONMENT_BLOCKED_WITH_EQUIVALENT_EVIDENCE |
| pr311 anti-false-pass classifier (4) | ledger lineage / guard regressions | YES | production migration ledger lineage read | ENVIRONMENT_BLOCKED_WITH_EQUIVALENT_EVIDENCE |
| legacy production → C0-C9 reconciliation | legacy migration | NO | already applied in production | ENVIRONMENT_BLOCKED_WITH_EQUIVALENT_EVIDENCE |

Note: the equivalent evidence for the SECURITY_CRITICAL rows marked "this mission"
is only fully discharged once C10–C22 execute against production with authenticated
actors — which is the current blocker below.

## C2/C3 — AUTH SESSION PROTOCOL (BLOCKING)

Sandbox auth status = `signed_out`; zero preview viewers connected; no session
material available. No account was created, no password touched, no impersonation,
no service-role login bypass.

Production truth re-read (no drift vs baseline): 4 councils, 14 active memberships,
3 department heads each CHAIR of own department council + MEMBER of college council
(`membership_source = administrative_position`).

Session plan (minimum switches, 4 actors cover every journey):

| # | ACTOR | LOGIN_IDENTIFIER | EXPECTED_ROLE | JOURNEYS |
|---|---|---|---|---|
| 1 | د. رمزي | ramzi@usr.edu.ye | chair @ مجلس قسم نظم المعلومات الحاسوبية + member @ مجلس الكلية (position-derived) | C4, C10, C12, C19–C23 partial |
| 2 | د. مقبل | maqbol3@usr.edu.ye | chair @ مجلس الكلية | C6, C11, C13–C18 |
| 3 | د. يحيى | yahya.mohammed@usr.edu.ye | member @ مجلس قسم علوم الحاسوب | C5, negative matrix |
| 4 | أ. غسان | ghassan.almaamari@usr.edu.ye | secretary @ مجلس قسم نظم المعلومات الحاسوبية | C7 |

## CONTINUATION-02 STATUS

CURRENT_MAIN_SHA=1969727a1b2840f5b30f34374b10542a129bf4f6
DEPLOYED_SHA=1969727a1b2840f5b30f34374b10542a129bf4f6
SHA_MATCH=YES
AUTHENTICATED_ACTORS_EXECUTED=0
ORDINARY_MEMBER_JOURNEY=NOT_RUN_PENDING_SESSION
DEPARTMENT_CHAIR_JOURNEY=NOT_RUN_PENDING_SESSION
COLLEGE_MEMBER_JOURNEY=NOT_RUN_PENDING_SESSION
COLLEGE_CHAIR_JOURNEY=NOT_RUN_PENDING_SESSION
SECRETARY_JOURNEY=NOT_RUN_PENDING_SESSION
MULTI_ROLE_JOURNEY=NOT_RUN_PENDING_SESSION
USER_LIFECYCLE=NOT_RUN_PENDING_SESSION
MEMBERSHIP_LIFECYCLE=NOT_RUN_PENDING_SESSION
DEPARTMENT_HEAD_POSITION_LIFECYCLE=BASELINE_PASS (structural fix re-verified read-only; TEST_ONLY lifecycle pending session)
TOPIC_LIFECYCLE=NOT_RUN_PENDING_SESSION
MEETING_LIFECYCLE=NOT_RUN_PENDING_SESSION
AGENDA_LIFECYCLE=NOT_RUN_PENDING_SESSION
ATTENDANCE_QUORUM_LIFECYCLE=NOT_RUN_PENDING_SESSION
VOTING_LIFECYCLE=NOT_RUN_PENDING_SESSION
MINUTES_LIFECYCLE=NOT_RUN_PENDING_SESSION
DECISION_LIFECYCLE=NOT_RUN_PENDING_SESSION
FOLLOWUP_LIFECYCLE=NOT_RUN_PENDING_SESSION
INVALID_TRANSITION_MATRIX=NOT_RUN_PENDING_SESSION
FINAL_LOCKED_STATE_NEGATIVES=NOT_RUN_PENDING_SESSION
DIRECT_RPC_MATRIX=NOT_RUN_PENDING_SESSION
CROSS_COUNCIL_IDOR=NOT_RUN_PENDING_SESSION
ROLE_UNION_ISOLATION=NOT_RUN_PENDING_SESSION
SESSION_ISOLATION=NOT_RUN_PENDING_SESSION
CONCURRENCY=NOT_RUN_PENDING_SESSION
REPLAY_IDEMPOTENCY=NOT_RUN_PENDING_SESSION
EXPECTED_MUTATIONS=0
UNEXPECTED_MUTATIONS=0
TESTS=104 pass / 19 fail (all 19 = docker environment blocked, classified above)
TYPECHECK=PASS
BUILD=PASS
CRITICAL_COUNT=0
HIGH_COUNT=0

DECISION: HOLD_PORTAL_COUNCILS_AUTHENTICATED_LIFECYCLE_AND_ACTOR_STATE_PRODUCTION_E2E_CONTINUATION_02_NO_AUTHENTICATED_COUNCIL_ACTOR_SESSIONS
