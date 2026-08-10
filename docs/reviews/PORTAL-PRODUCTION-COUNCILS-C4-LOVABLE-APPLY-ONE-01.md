# PORTAL-PRODUCTION-COUNCILS-C4-LOVABLE-APPLY-ONE-01

**Mission:** `PORTAL-PRODUCTION-COUNCILS-C4-LOVABLE-APPLY-ONE-01`
**Owner authorization:** `OWNER_APPROVE_COUNCILS_C4`
**Scope:** EXACTLY C4 ONLY
**Decision:** `PASS_PORTAL_PRODUCTION_COUNCILS_C4_LOVABLE_APPLY_ONE_01`

---

## A — Source identity

| Field | Value |
|---|---|
| SOURCE | `supabase/migrations/20260808140000_councils_c4_session_voting_01.sql` (712 lines) |
| HASH_CONTRACT | `SHA256_LF_NORMALIZED_V1` |
| SOURCE_SHA256_LF | `d0825e1ddcce82c0e1123ea04cba2777e3b726bc0e4ae514940a714d322b05cd` |
| AUTHORITATIVE PIN | identical → `SOURCE_PIN_MATCH=YES` |
| CURRENT_SOURCE_HEAD | `0ae15fb437f2f8a56d3b4f97c9a6785f5e09b84f` |
| SOURCE_C4_UNMODIFIED | YES (file untouched; `git diff --check` clean) |

Normalization applied for managed apply: removal of line 16 `BEGIN;` and line 712 `COMMIT;` only
(Lovable supplies its own transaction). No other byte differs → `C4_SEMANTIC_BODY_MATCH=YES`,
`C4_NONTRANSACTIONAL_BOUNDARY=NONE`.

## B — Production prestate (read-only)

- C1: `council_transition_meeting(uuid,status,status,jsonb)` PRESENT; `council_meeting_transition_is_legal(status,status)` PRESENT → `C1_FUNCTIONAL_PREDECESSOR=PASS`
- C3: `meeting_has_valid_quorum` PRESENT; `academic_council_meeting_attendance_rolls`, `academic_council_meeting_quorum_evaluations` PRESENT → `C3_FUNCTIONAL_PREDECESSOR=PASS`
- C4 signature objects ABSENT: `academic_council_votes`, `academic_council_vote_results`, `academic_council_vote_value`, `academic_council_agenda_item_session_status` → `C4_PRESTATE=COMPATIBLE_NOT_APPLIED`
- C5–C9 ledger entries: 0 → `C5_TO_C9_APPLIED_COUNT=0`
- Pre-apply ledger: count=217, tip=`20260810011456` (C3)

## C — Pre-apply data fingerprints

| Table | Count | Fingerprint |
|---|---|---|
| academic_council_meetings | 1 | `90609f6841c5b3d2f3a534072f1d3a6d` |
| academic_council_agenda_items | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| academic_councils | 4 | — |
| academic_council_members | 11 | — |
| academic_council_topics | 2 | — |
| academic_council_minutes / decisions | 0 / 0 | — |

## D/E/F — Apply and ledger

| Field | Value |
|---|---|
| SOURCE_C4_VERSION | `20260808140000` |
| LOVABLE_MANAGED_C4_VERSION | `20260810012715` |
| C4_APPLY_ATTEMPT_COUNT | 1 |
| Ledger 217 → 218 | exactly one new entry |
| C4_LEDGER_MAPPING | PASS |
| MIGRATIONS_APPLIED_THIS_MISSION | 1 |
| UNAUTHORIZED_ADDITIONAL_MIGRATIONS | 0 |
| C5_APPLIED | NO (C5–C9 count still 0) |

## G — Source-derived object verification

**Types** — `academic_council_vote_value` = `{yes,no,abstain}`; `academic_council_agenda_item_session_status` = `{pending,in_discussion,voting_open,voting_closed,resolved}` → `C4_TYPES=PASS`

**Tables** — `academic_council_votes`, `academic_council_vote_results` created; RLS enabled on both → `C4_TABLES=PASS`

**Columns** — meetings: `opened_at, opened_by, closed_at, closed_by`; agenda items: `session_status, resolution, resolved_at, resolved_by` → `C4_COLUMNS=PASS`

**Indexes/constraints** — `idx_ac_votes_item`, `idx_ac_votes_meeting`, `idx_ac_votes_voter`, `idx_ac_vote_results_meeting`, `academic_council_votes_agenda_item_id_voter_user_id_key` (UNIQUE), `academic_council_vote_results_agenda_item_id_key` (UNIQUE).

**Functions (9/9)** — `council_assert_c1_contract_present`, `open_council_session`, `start_agenda_item_discussion`, `open_agenda_item_vote`, `cast_council_vote`, `close_agenda_item_vote`, `calculate_agenda_item_result`, `resolve_agenda_item`, `close_council_session`. All `SECURITY DEFINER` (0 exceptions), all `search_path=public, pg_temp` (0 exceptions) → `C4_FUNCTIONS=PASS`

**Policies** — `ac_votes_select` (SELECT, authenticated), `ac_vote_results_select` (SELECT, authenticated). No INSERT/UPDATE/DELETE policy on either table → `C4_POLICIES=PASS`

**ACL** — `authenticated=r` only on both tables; `anon` has no privilege; `service_role=arwdDxtm`. Function EXECUTE: authenticated=true, anon=false for all C4 RPCs → `C4_ACL=PASS`

## H — Session state machine

`open_council_session` sequence, verified from applied source: C1 contract assertion → row lock → exact `has_council_role(..., 'chair')` → `status = agenda_ready` → agenda non-empty + all approved → attendance roll `finalized` → `meeting_has_valid_quorum()` → authoritative `council_transition_meeting(agenda_ready → in_session)`. Status is never mutated directly. `close_council_session` requires chair + `in_session` + zero unresolved items, then `council_transition_meeting(in_session → minutes_draft)`.

`C1_TRANSITION_CONTRACT_PRESERVED=YES`, `C3_QUORUM_GATE_ENFORCED=YES`, `SESSION_OPEN_CHAIR_ONLY=YES`, `UNIVERSAL_ADMIN_SESSION_BYPASS=0`.

## I — Voting contract

- Vote values constrained by enum → `VOTE_VALUES=YES_NO_ABSTAIN_ONLY`
- `UNIQUE (agenda_item_id, voter_user_id)` + explicit pre-insert double-vote guard → `ONE_VOTE_PER_MEMBER_PER_ITEM=PASS`
- Eligibility requires finalized roll AND attendance state ∈ {present, present_remote} for `auth.uid()` → `FINALIZED_ATTENDANCE_ELIGIBILITY=PASS`
- Voter identity is always `council_attendance_require_auth_uid()`; no delegate/on-behalf parameter exists → `PROXY_VOTING=DENIED`
- Absent/missing attendance raises `COUNCIL_VOTER_NOT_ELIGIBLE` (42501) → `INELIGIBLE_VOTER=DENIED`
- No INSERT/UPDATE/DELETE grant or policy on `academic_council_votes` for anon/authenticated → `DIRECT_VOTE_TABLE_WRITE=DENY`

## J — Vote result contract

`calculate_agenda_item_result` computes `yes_count/no_count/abstain_count/total_votes/outcome` server-side from `academic_council_votes` (outcome: passed / rejected / tied), requires `can_write_council_agenda` and `session_status ∈ {voting_closed, resolved}`, and upserts on the unique `agenda_item_id`.

`VOTE_RESULT_SERVER_COMPUTED=YES`, `VOTE_RESULT_DIRECT_WRITE=DENY`, `VOTE_RESULT_CONTRACT=PASS`.

## K — Authorization

No role-name shortcut (`system_admin`, `admin`, `dean`, `registrar`) appears in any C4 write path; chair authority is derived exclusively from `has_council_role(uid, council_id, 'chair')` and result calculation from `can_write_council_agenda`. Read visibility only uses `is_council_admin` / `is_council_member`.

`UNIVERSAL_ADMIN_OPERATIONAL_BYPASS=0`, `UNIVERSAL_DEAN_BYPASS=0`, `UNIVERSAL_REGISTRAR_BYPASS=0`.

## L — Business data preservation

Post-apply fingerprints identical to pre-apply: meetings `90609f6841c5b3d2f3a534072f1d3a6d` (1 row), agenda items `d41d8cd98f00b204e9800998ecf8427e` (0 rows); councils 4, members 11, topics 2 unchanged.

`EXISTING_MEETING_ROWS_MUTATED=0`, `EXISTING_AGENDA_ROWS_MUTATED=0`, `VOTE_ROWS_CREATED_BY_MIGRATION=0`, `VOTE_RESULT_ROWS_CREATED_BY_MIGRATION=0`.

C0 helpers (5/5) present, C1/C2/C3 functions present, GP functions present (4 project rows), enrollment-certificate functions present (14) with 2 document rows, B1 five services `student_visible` still 5/5.

## M — Focused tests

| Gate | Result |
|---|---|
| `councils-c4-c8-late-lifecycle.test.ts` | 2 pass / 1 fail (Docker harness launch only) |
| `councils-c0-c9-production-readiness-package.test.ts` | 7 pass / 1 fail (Docker harness launch only) |
| `bun test tests/academic-councils` | 63 pass / 16 fail — all 16 are Docker PG17 harness-launch failures; 0 assertion failures |
| `bunx tsc --noEmit` | PASS |
| `git diff --check` | PASS |
| DOCKER_PG17_AVAILABLE | NO |

## Observations

- MEDIUM/informational: platform role `sandbox_exec` carries default `ar` (SELECT/INSERT) on the two new tables via pre-existing default privileges. It is not a client-facing role (`anon`/`authenticated` remain SELECT-only) and is outside C4 scope; no remediation performed.
- Post-apply linter output is dominated by pre-existing project-wide INFO items; the two new tables have RLS enabled with SELECT policies.

## Final counters

```
CURRENT_SOURCE_HEAD=0ae15fb437f2f8a56d3b4f97c9a6785f5e09b84f
SOURCE_C4_VERSION=20260808140000
LOVABLE_MANAGED_C4_VERSION=20260810012715
SOURCE_SHA256_LF=d0825e1ddcce82c0e1123ea04cba2777e3b726bc0e4ae514940a714d322b05cd
SOURCE_PIN_MATCH=YES
SOURCE_C4_UNMODIFIED=YES
C4_SEMANTIC_BODY_MATCH=YES
PRODUCTION_TARGET_VERIFIED=YES
C1_FUNCTIONAL_PREDECESSOR=PASS
C3_FUNCTIONAL_PREDECESSOR=PASS
C4_PRESTATE=COMPATIBLE_NOT_APPLIED
C4_APPLY_ATTEMPT_COUNT=1
MIGRATIONS_APPLIED_THIS_MISSION=1
C4_LEDGER_MAPPING=PASS
UNAUTHORIZED_ADDITIONAL_MIGRATIONS=0
C4_TYPES=PASS
C4_TABLES=PASS
C4_COLUMNS=PASS
C4_FUNCTIONS=PASS
C4_POLICIES=PASS
C4_ACL=PASS
C1_TRANSITION_CONTRACT_PRESERVED=YES
C3_QUORUM_GATE_ENFORCED=YES
SESSION_OPEN_CHAIR_ONLY=YES
VOTE_VALUES=YES_NO_ABSTAIN_ONLY
ONE_VOTE_PER_MEMBER_PER_ITEM=PASS
FINALIZED_ATTENDANCE_ELIGIBILITY=PASS
PROXY_VOTING=DENIED
INELIGIBLE_VOTER=DENIED
DIRECT_VOTE_TABLE_WRITE=DENY
VOTE_RESULT_SERVER_COMPUTED=YES
VOTE_RESULT_DIRECT_WRITE=DENY
VOTE_RESULT_CONTRACT=PASS
UNIVERSAL_ADMIN_OPERATIONAL_BYPASS=0
UNIVERSAL_DEAN_BYPASS=0
UNIVERSAL_REGISTRAR_BYPASS=0
EXISTING_MEETING_ROWS_MUTATED=0
EXISTING_AGENDA_ROWS_MUTATED=0
VOTE_ROWS_CREATED_BY_MIGRATION=0
VOTE_RESULT_ROWS_CREATED_BY_MIGRATION=0
C3_FUNCTIONAL_STATE_PRESERVED=YES
C2_FUNCTIONAL_STATE_PRESERVED=YES
C1_FUNCTIONAL_STATE_PRESERVED=YES
C0_SECURITY_PRESERVED=YES
GP_L4_GUARD_PRESERVED=YES
B1_VISIBILITY_CHANGED=NO
ENROLLMENT_CERTIFICATE_REGRESSION=NO
C4_TEST=PASS_EXCEPT_DOCKER_HARNESS
COUNCILS_READINESS_TEST=PASS_EXCEPT_DOCKER_HARNESS
COUNCILS_SUITE=63_PASS_16_DOCKER_HARNESS_FAIL
DOCKER_PG17_AVAILABLE=NO
TSC=PASS
DIFF_CHECK=PASS
C5_APPLIED=NO
DEPLOY=NO
PUBLISH=NO
CRITICAL_COUNT=0
HIGH_COUNT=0
MEDIUM_COUNT=1
```

**FINAL TOKEN:** `PASS_PORTAL_PRODUCTION_COUNCILS_C4_LOVABLE_APPLY_ONE_01`

**MANDATORY STOP:** C4 report complete. C5 NOT applied.
