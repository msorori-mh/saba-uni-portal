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
