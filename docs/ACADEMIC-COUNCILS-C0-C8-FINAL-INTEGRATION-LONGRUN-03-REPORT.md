# ACADEMIC-COUNCILS-C0-C8-FINAL-INTEGRATION-LONGRUN-03 REPORT

## Verdict

**PASS_ACADEMIC_COUNCILS_C0_C8_FINAL_INTEGRATION_PR_READY**

## Mission

Integrate PR #297 (C4–C8 late lifecycle) onto PR #298 (C0–C3), remove full-integration dependence on the C1 test shim, remediate C4–C7 to use the real C1 state machine, prove full PG17 lifecycle + authorization matrix, reconcile faculty UI, and open one PR.

## Bases

| Item | Value |
|------|-------|
| Base (C0–C3 / PR #298) | `96fc02ee472b58550f0db90040ad82204f3e1aa6` |
| Late-lifecycle source (PR #297) | `681192e3e57bd761ea2e3b204ed70d35ef3b5aec` |
| Branch | `integration/councils-c0-c8-final-longrun-01` |
| Integration method | Cherry-pick of `681192e3` onto `96fc02ee`, then source remediation |

## REAL_C1_INTEGRATION

- Full integration / E2E pipeline loads **real** `20260808121000_councils_c1_meeting_state_machine_01.sql`.
- `postgres-c1-contract-shim.sql` remains as an isolated TEST_ONLY artifact and is **not** applied in the C0–C7 harness.
- C4 `council_assert_c1_contract_present()` now requires:
  - `council_transition_meeting(...)`
  - `council_meeting_transition_is_legal(...)`
  - Explicitly rejects shim-only `can_transition_council_meeting_state` as sufficient.
- `open_council_session` / `close_council_session` / `approve_and_lock_council_minutes` / `archive_council_meeting` call real C1 transitions (or C1-legal secretary edge for `minutes_draft→minutes_review`).
- Verifier proves C1 transition events for `agenda_ready→in_session`.

## C0_C8_CHAIN

Canonical forward-only chain (deterministic timestamps):

1. predecessors (create / harden / history / schedule helpers)
2. `20260808120000` C0
3. `20260808121000` C1
4. `20260808122000` C2
5. `20260808130000` C3
6. `20260808140000` C4
7. `20260808150000` C5
8. `20260808160000` C6
9. `20260808170000` C7

No separate `councils_c8_*.sql` migration — “C8” denotes the integrated late-lifecycle package / UI layer.

## POSITIVE_E2E

Executable PG17 journey covered in `tests/academic-councils/postgres-c4-c8-verifier.sql`:

scheduled → intake_open → topic submit/review/accept → intake_closed → agenda → agenda_ready → attendance/quorum → in_session → discussion/vote/resolve → minutes_draft → minutes_review → minutes_locked → decision follow-up → archived → historical read.

Cancellation proven only at legal pre-session point (`scheduled→cancelled`).

## AUTHORIZATION_MATRIX / ZERO_MUTATION / NEGATIVE_CASE_COUNT

Actors exercised for lifecycle actions: system_admin, admin, dean, chair, secretary, member, viewer, responsible actor, inactive/historical faculty, student, anonymous, wrong-council chair.

Every denial path uses before/after fingerprint with **exact zero mutation**.

Verifier enforces `NEGATIVE_CASE_COUNT >= 25` and emits `ZERO_MUTATION_DENIALS_COUNTED`.

No automatic admin/system_admin/dean academic bypass.

## VOTING_SECURITY

- Eligible voters only from finalized attendance (`present` / `present_remote`)
- Absent / viewer / admin / cross-council denied
- One effective vote per member per item; double-vote denied
- Vote after close denied
- MVP options only: yes / no / abstain
- Direct table insert denied

## MINUTES_IMMUTABILITY

Secretary draft → submit for review → chair approve/lock.

After lock: draft update DENY, DELETE DENY, agenda/vote mutation DENY (application-role paths). No false claims about PostgreSQL superuser semantics.

## DECISION_FOLLOWUP

Decision linked to meeting/agenda/minutes evidence. issued → in_progress → completed by responsible actor. Canonical text immutable after minutes lock. Unassigned / admin follow-up denied.

## ARCHIVE

Requires session closed, minutes locked, meeting `minutes_locked`, all items resolved, no active voting/discussion. Post-archive operational mutations DENY; historical authorized read remains.

## CONCURRENCY

Stale transition race, session open race, attendance finalize race, vote-vs-close race, minutes draft-during-review race — all fail closed without silent overwrite.

## UI

- Faculty portal mounts `CouncilSessionAndGovernanceWorkspace` for operational meeting states.
- In-session agenda + `CouncilVotingControl` wired (chair discussion/voting; eligible members vote).
- Arabic RTL labels for roles/statuses/decision states.
- Admin remains technical/overview; no academic action merely because admin.
- Backend RPCs remain authoritative; UI buttons are state-aware only.

## Migration hygiene (Phase M)

Documented duplicate pairs (not deleted):

| Pair | Canonical | Redundant twin |
|------|-----------|----------------|
| Schedule helpers | `20260705232119_84b04a88-50be-4c5c-b9c3-11aeb54fa119.sql` | `20260710120000_council_meeting_schedule_helpers.sql` |
| Topic attachments | `20260708120000_council_topic_attachments.sql` | `20260705012437_ce22d82a-51b3-4452-bde2-90f0b8d64fa8.sql` |

C0–C7 filenames/timestamps are unique and ordered. No scanner bypass introduced.

## Files modified (mission-scoped)

- `supabase/migrations/20260808140000_councils_c4_session_voting_01.sql`
- `supabase/migrations/20260808150000_councils_c5_minutes_lifecycle_01.sql`
- `supabase/migrations/20260808170000_councils_c7_audit_archive_01.sql`
- `tests/academic-councils/councils-c4-c8-late-lifecycle.test.ts`
- `tests/academic-councils/postgres-c4-c8-verifier.sql`
- `src/lib/councils-c4-c8.functions.ts`
- `src/lib/faculty-councils.functions.ts`
- `src/lib/admin-councils.functions.ts`
- `src/components/councils/CouncilSessionAndGovernanceWorkspace.tsx`
- `src/routes/faculty-portal.academic-councils.tsx`
- `docs/ACADEMIC-COUNCILS-C0-C8-FINAL-INTEGRATION-LONGRUN-03-REPORT.md`

(+ cherry-picked C4–C8 package files from #297)

## Tests / local gates

| Gate | Result |
|------|--------|
| `bun test tests/academic-councils` | PASS (28) |
| Faculty/admin navigation RTL tests | PASS (122) |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| PG17 disposable chain | PASS (no shim) |

## Assumptions

- C8 is the integrated late-lifecycle surface (UI + verifier), not a separate SQL migration file.
- Secretary may advance meeting status `minutes_draft→minutes_review` via C1-legal edge with append-only transition event (chair remains required for lock/archive/session).

## Risks

- Pre-existing duplicate schedule/attachment migrations remain in history (documented only).
- Generated Supabase TS types may not yet list `session_status`/`resolution`; runtime selects are stringly typed via mappers.

## Production impact

- SOURCE-ONLY. No production connection/write.
- Migrations not applied.
- No deploy/publish/merge.

## Boundaries observed

- PRODUCTION_READS: 0
- PRODUCTION_WRITES: 0
- MIGRATION_APPLIED: NO
- DEPLOY: NO
- PUBLISH: NO
- MERGE: NO
- GP/GA: untouched

## SUPERSEDES_CANDIDATES (do not close)

#294, #295, #296, #297, #298

## Decision

**PASS**
