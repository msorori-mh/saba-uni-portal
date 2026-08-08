# ACADEMIC-COUNCILS-C3-ATTENDANCE-AND-QUORUM-FOUNDATION-05

## Verdict
**PASS_ACADEMIC_COUNCILS_C3_ATTENDANCE_QUORUM_PR_READY** (source + disposable PG17)

## Scope delivered
Forward-only C3 package (does **not** duplicate C0 write-surface hardening or C1 state machine):

| Surface | Behavior |
|---|---|
| Configurable quorum policy | Chair-approved per council (`absolute` or `ratio`); **no invented university percentage** |
| Fail-closed gate | No approved policy ⇒ `meeting_has_valid_quorum` = false; evaluate/finalize raise `COUNCIL_QUORUM_POLICY_REQUIRED` |
| Attendance states | `present`, `present_remote`, `excused`, `absent` (no proxy) |
| Snapshot | Eligible members at open time (`chair/vice_chair/secretary/member`); identity survives later deactivation |
| Quorum model | Server-computed: `eligible_member_count`, `present_member_count`, `required_member_count`, `quorum_met`, `evaluated_at`, `evaluated_by`, `policy_version` |
| Authorities | Secretary records; chair finalizes/approves policy; admin/system_admin/dean have **no** automatic academic write authority |
| Session gate | `meeting_has_valid_quorum(meeting_id)` for C1/C4 (`true` only when finalized **and** quorum met) |
| Immutability | Finalized roll + `in_session`/later meeting statuses lock attendance (MVP: fail-closed, no silent rewrite) |
| Audit | Append-only `academic_council_attendance_audit_events` on record/evaluate/finalize/policy |
| Writes | RPC-only; authenticated direct INSERT/UPDATE/DELETE revoked |

## RPCs
- `council_approve_quorum_policy(...)`
- `record_council_meeting_attendance(...)`
- `evaluate_council_meeting_quorum(...)`
- `finalize_council_meeting_attendance(...)`
- `meeting_has_valid_quorum(...)`

## Files modified
- `supabase/migrations/20260808130000_councils_c3_attendance_quorum_01.sql`
- `tests/academic-councils/postgres-minimal-schema.sql`
- `tests/academic-councils/postgres-c3-attendance-quorum-verifier.sql`
- `tests/academic-councils/councils-c3-attendance-quorum.test.ts`
- this report

## Tests / results
| Check | Result |
|---|---|
| `bun test tests/academic-councils/councils-c3-attendance-quorum.test.ts` | PASS (5/5, disposable PG17) |
| Verifier matrix | no-policy fail-closed; insufficient/exact/excess; excused/absent excluded; remote counts; inactive-after snapshot; unauthorized/finalized denials; concurrent finalize serialized; in_session lock; zero mutation on denials |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |

## Assumptions
- C0 (RPC-only lifecycle writes) and C1 (state machine transitions into `in_session`) land separately; C3 exposes the gate predicate only.
- Eligible quorum roster excludes `viewer`.
- Ratio threshold uses `ceil(eligible * numerator / denominator)`, clamped to `[1, eligible]`.
- Correction after finalize/`in_session` remains deferred fail-closed for MVP (no correction RPC).

## Risks
- Until C1 wires `meeting_has_valid_quorum` into transition RPCs, session open is not yet mechanically gated in the state machine package.
- Rebase after C0 may need grant/RLS coexistence review on shared helpers (C3 uses dedicated `council_attendance_*` helpers to avoid duplicating C0 auth helpers).

## Blockers
- None for source PR readiness.
- Production apply requires explicit single-migration approval (not requested).

## Production impact
- **PRODUCTION_WRITES: 0**
- **MIGRATION_APPLIED: NO**
- **MERGE: NO** (PR only)

## Decision
**PASS_ACADEMIC_COUNCILS_C3_ATTENDANCE_QUORUM_PR_READY**

| Field | Value |
|---|---|
| BRANCH | `feat/councils-c3-attendance-quorum-01` |
| DIRECT_WRITE_VERDICT | DENIED (C3 tables; zero mutation) |
| QUORUM_FAIL_CLOSED | PASS (no policy / not finalized ⇒ false) |
| ADMIN_ACADEMIC_BYPASS | ABSENT |
| NEGATIVE_MATRIX | PASS (PG17 disposable) |
| PG17 | PASS |
| TSC | PASS |
| BUILD | PASS |
| PRODUCTION_WRITES | 0 |
| MIGRATION_APPLIED | NO |
