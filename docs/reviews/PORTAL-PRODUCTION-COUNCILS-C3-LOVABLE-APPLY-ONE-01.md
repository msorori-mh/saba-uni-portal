# PORTAL-PRODUCTION-COUNCILS-C3-LOVABLE-APPLY-ONE-01

**Mission:** PORTAL-PRODUCTION-COUNCILS-C3-LOVABLE-APPLY-ONE-01
**Authorization:** OWNER_APPROVE_COUNCILS_C3 (C3 only)
**Mode:** production read-only preflight → exactly ONE managed migration apply → catalog/security verification

---

## A — Source identity

| Field | Value |
|---|---|
| SOURCE_C3_VERSION | 20260808130000 |
| SOURCE FILE | supabase/migrations/20260808130000_councils_c3_attendance_quorum_01.sql |
| SOURCE_SHA256_LF | e7361f6c85014fb37b6f8d97bd468dc1205700748a526cb7a8063f82ff6c0de6 |
| SOURCE_PIN_MATCH | YES |
| SOURCE_C3_UNMODIFIED | YES |
| CURRENT_SOURCE_HEAD | 48904b8065e73cf1ec2a32c2200f8c3410e6ade6 |

Object inventory derived directly from the pinned SQL (not from prep briefs):
5 tables, 4 enum types (all in transaction-safe `DO … EXCEPTION WHEN duplicate_object` blocks),
1 trigger + trigger function, 16 functions total, 5 SELECT policies, 0 write policies,
2 partial unique indexes (one approved policy per council; one final evaluation per meeting).

## B — Production prestate (read-only)

| Check | Result |
|---|---|
| C1_FUNCTIONAL_PREDECESSOR | PASS (`minutes_review` label, `council_transition_meeting`, `council_meeting_transition_is_legal`, `academic_council_meeting_transition_events`) |
| C2_FUNCTIONAL_PREDECESSOR | PASS (topic transition/intake/review/resubmit functions present; 7/7 predecessor functions) |
| C0 helpers | PASS (`is_council_admin`, `is_council_member`, `has_council_role`) |
| C3_PRESTATE | COMPATIBLE_NOT_APPLIED (5/5 tables absent, 4/4 types absent, `meeting_has_valid_quorum` absent) |
| C4_TO_C9_APPLIED_COUNT | 0 |
| Ledger before | count=216, tip=20260810010400 |

## C — Pre-apply data snapshot (counts only, no PII)

COUNCIL_ROWS_BEFORE=4 · MEMBER_ROWS_BEFORE=11 · MEETING_ROWS_BEFORE=1 · TOPIC_ROWS_BEFORE=2

## D/E — Managed version + transaction semantics

Source version could not be preserved by the managed runner; exactly one managed version was assigned.

| Field | Value |
|---|---|
| SOURCE_C3_VERSION | 20260808130000 |
| LOVABLE_MANAGED_C3_VERSION | 20260810011456 |
| C3_LEDGER_MAPPING_POLICY | PASS (one mapping, no ledger edit, no db push, source file untouched) |
| C3_SEMANTIC_BODY_MATCH | YES (only outer `BEGIN;`/`COMMIT;` removed; runner supplies one transaction) |
| C3_TRANSACTION_MODEL | SAFE |
| C3_ENUM_BOUNDARY_HAZARD | NO |

## F/G — Apply + ledger poststate

C3_APPLY_ATTEMPT_COUNT=1 · MIGRATIONS_APPLIED_THIS_MISSION=1 · UNAUTHORIZED_ADDITIONAL_MIGRATIONS=0
Ledger after: count=217, tip=20260810011456. C4–C9 (and source version 20260808130000) remain NOT_APPLIED.

## H — Object inventory (post-apply)

| Inventory | Observed | Verdict |
|---|---|---|
| C3_TABLE_INVENTORY | 5/5 | PASS |
| C3_TYPE_INVENTORY | 4/4 | PASS |
| C3_FUNCTION_INVENTORY | 16/16 | PASS |
| C3_TRIGGER_INVENTORY | `trg_ac_attendance_audit_no_update` present | PASS |
| C3_POLICY_INVENTORY | 5 SELECT policies, 0 write policies | PASS |

## I — RLS / write surface

RLS enabled on 5/5 tables. `authenticated`: SELECT=true, INSERT/UPDATE/DELETE=false on all five.
`anon`: no SELECT. `service_role`: source-prescribed full access.

C3_RLS=PASS · C3_ACL=PASS · AUTHENTICATED_DIRECT_WRITE=DENY · C3_SELECT_POLICIES=PASS

## J — Quorum policy contract

Configurable per council (`absolute` | `ratio`), versioned, partial unique index enforces exactly one
approved policy per council. `council_current_approved_quorum_policy` returns empty when none;
`council_evaluate_quorum_internal` raises `COUNCIL_QUORUM_POLICY_REQUIRED`; `meeting_has_valid_quorum`
returns false. Approval authority is exact chair (`COUNCIL_QUORUM_POLICY_CHAIR_REQUIRED`). No invented
university-wide percentage. No production mutation RPC was invoked.

QUORUM_CONFIGURABLE=YES · QUORUM_POLICY_FAIL_CLOSED=PASS · QUORUM_POLICY_CHAIR_AUTHORITY=PASS

## K — Attendance snapshot contract

`council_ensure_attendance_roll` snapshots active eligible members at capture time
(`council_member_is_quorum_eligible` = chair/vice_chair/secretary/member; `viewer` excluded), storing
membership identity and validity window so later deactivation does not alter the roll. Recording is
secretary-only, restricted to snapshot rows (`COUNCIL_ATTENDANCE_MEMBER_NOT_IN_SNAPSHOT`), and blocked
once the roll is finalized or the meeting reaches in_session/minutes_draft/minutes_locked/archived.
No proxy attendance/voting path exists.

ATTENDANCE_SNAPSHOT=PASS · ATTENDANCE_SECRETARY_AUTHORITY=PASS · ATTENDANCE_LOCKING=PASS · PROXY_ATTENDANCE=DENIED

## L — Quorum evaluation

`evaluate_council_meeting_quorum` = chair OR secretary; `finalize_council_meeting_attendance` = exact
chair only. Counts and required threshold are computed server-side; no client-supplied totals.
Audit table is append-only via a BEFORE UPDATE OR DELETE trigger raising `COUNCIL_ATTENDANCE_AUDIT_IMMUTABLE`.

QUORUM_EVALUATION_AUTHORITY=PASS · ATTENDANCE_FINALIZE_CHAIR_ONLY=PASS · SERVER_COMPUTED_QUORUM=PASS · QUORUM_AUDIT_APPEND_ONLY=PASS

## M — meeting_has_valid_quorum gate

`public.meeting_has_valid_quorum(uuid)` present. Returns false for null/unknown meeting, missing
approved policy, missing or non-finalized roll, and missing final evaluation; otherwise returns the
final evaluation's `quorum_met`.

MEETING_HAS_VALID_QUORUM_PRESENT=YES · MEETING_HAS_VALID_QUORUM_FAIL_CLOSED=PASS · C1_IN_SESSION_GATE_NOW_BACKED_BY_C3=YES

## N — No universal operational bypass

No policy or RPC grants system_admin / admin / dean / registrar operational write authority. Council
admin visibility appears only in SELECT policies (read), never in write paths.

UNIVERSAL_ADMIN_OPERATIONAL_BYPASS=0 · UNIVERSAL_DEAN_BYPASS=0 · UNIVERSAL_REGISTRAR_BYPASS=0

## O — Business data preservation

Post-apply: councils=4, members=11, meetings=1, topics=2 (identical to pre-apply).
New C3 tables: 0 rows in all five.

EXISTING_COUNCIL_ROWS_MUTATED=0 · EXISTING_MEMBER_ROWS_MUTATED=0 · EXISTING_MEETING_ROWS_MUTATED=0
QUORUM_POLICY_ROWS_CREATED_BY_MIGRATION=0 · ATTENDANCE_ROLL_ROWS_CREATED_BY_MIGRATION=0 ·
ATTENDANCE_ROWS_CREATED_BY_MIGRATION=0 · QUORUM_EVALUATION_ROWS_CREATED_BY_MIGRATION=0 ·
ATTENDANCE_AUDIT_ROWS_CREATED_BY_MIGRATION=0
C2_FUNCTIONAL_STATE_PRESERVED=YES · C1_FUNCTIONAL_STATE_PRESERVED=YES · C0_SECURITY_PRESERVED=YES ·
GP_L4_GUARD_PRESERVED=YES · B1_VISIBILITY_CHANGED=NO (5/5 still visible) · ENROLLMENT_CERTIFICATE_REGRESSION=NO

## P — Focused tests

DOCKER_PG17_AVAILABLE=NO. `bun test tests/academic-councils`: 63 pass / 16 fail — every failure is a
disposable PostgreSQL 17 harness launch failure (Docker absent in this execution environment), not a
product assertion failure. Source packet evidence for C3/C1↔C3/readiness remains from prior PG17 runs.
`bunx tsc --noEmit` PASS. `git diff --check` PASS. No source patched.

---

## Result block

```
CURRENT_SOURCE_HEAD=48904b8065e73cf1ec2a32c2200f8c3410e6ade6
SOURCE_C3_VERSION=20260808130000
LOVABLE_MANAGED_C3_VERSION=20260810011456
SOURCE_SHA256_LF=e7361f6c85014fb37b6f8d97bd468dc1205700748a526cb7a8063f82ff6c0de6
SOURCE_PIN_MATCH=YES
SOURCE_C3_UNMODIFIED=YES
C3_SEMANTIC_BODY_MATCH=YES
PRODUCTION_TARGET_VERIFIED=YES
C1_FUNCTIONAL_PREDECESSOR=PASS
C2_FUNCTIONAL_PREDECESSOR=PASS
C3_PRESTATE=COMPATIBLE_NOT_APPLIED
C3_APPLY_ATTEMPT_COUNT=1
MIGRATIONS_APPLIED_THIS_MISSION=1
C3_LEDGER_MAPPING=PASS
UNAUTHORIZED_ADDITIONAL_MIGRATIONS=0
C3_TABLES=PASS
C3_TYPES=PASS
C3_FUNCTIONS=PASS
C3_TRIGGER=PASS
C3_POLICIES=PASS
C3_RLS=PASS
C3_ACL=PASS
AUTHENTICATED_DIRECT_WRITE=DENY
QUORUM_CONFIGURABLE=YES
QUORUM_POLICY_FAIL_CLOSED=PASS
QUORUM_POLICY_CHAIR_AUTHORITY=PASS
ATTENDANCE_SNAPSHOT=PASS
ATTENDANCE_SECRETARY_AUTHORITY=PASS
ATTENDANCE_LOCKING=PASS
PROXY_ATTENDANCE=DENIED
QUORUM_EVALUATION_AUTHORITY=PASS
ATTENDANCE_FINALIZE_CHAIR_ONLY=PASS
SERVER_COMPUTED_QUORUM=PASS
QUORUM_AUDIT_APPEND_ONLY=PASS
MEETING_HAS_VALID_QUORUM_PRESENT=YES
MEETING_HAS_VALID_QUORUM_FAIL_CLOSED=PASS
C1_IN_SESSION_GATE_NOW_BACKED_BY_C3=YES
EXISTING_COUNCIL_ROWS_MUTATED=0
EXISTING_MEMBER_ROWS_MUTATED=0
EXISTING_MEETING_ROWS_MUTATED=0
C2_FUNCTIONAL_STATE_PRESERVED=YES
C1_FUNCTIONAL_STATE_PRESERVED=YES
C0_SECURITY_PRESERVED=YES
GP_L4_GUARD_PRESERVED=YES
B1_VISIBILITY_CHANGED=NO
ENROLLMENT_CERTIFICATE_REGRESSION=NO
C3_TEST=HARNESS_UNAVAILABLE_DOCKER
C1_C3_SESSION_GATE_TEST=HARNESS_UNAVAILABLE_DOCKER
COUNCILS_READINESS_TEST=HARNESS_UNAVAILABLE_DOCKER
COUNCILS_SUITE=63_PASS_16_DOCKER_HARNESS_FAIL
DOCKER_PG17_AVAILABLE=NO
TSC=PASS
DIFF_CHECK=PASS
C4_APPLIED=NO
DEPLOY=NO
PUBLISH=NO
CRITICAL_COUNT=0
HIGH_COUNT=0
MEDIUM_COUNT=0
```

FINAL TOKEN: **PASS_PORTAL_PRODUCTION_COUNCILS_C3_LOVABLE_APPLY_ONE_01**

MANDATORY STOP after C3. C4 NOT applied.
