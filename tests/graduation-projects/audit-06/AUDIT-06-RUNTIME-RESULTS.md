# AUDIT-06 — RUNTIME RESULTS (verbatim)

> **POST-FIX ADDENDUM (2026-08-01, second run).** The first-run INVESTIGATE
> outcome below was resolved by two reviewed changes:
> 1. `tests/graduation-projects/postgres-security-audit-verifier.sql` — the two
>    stale caps were bumped with documented history: `function-inventory`
>    45→46 (M9 adds the internal, revoked `graduation_project_assignment_rank`)
>    and `co-supervisor-read-only` 6→7 (M9's F-1 comment text mentions
>    `co_supervisor`; the actual write whitelist is unchanged).
> 2. M9 preflight strengthened (finding P2.a2 from the first run): it now also
>    verifies the M7/M8 guard texts (`panel incomplete for defense`,
>    `order by d.starts_at desc limit 1`), so M9 on minimal+M1..M7 now raises
>    `graduation projects M7/M8 completeness guards missing; apply the reviewed
>    package first` instead of applying cleanly.
>
> Second run verdict (verbatim): **`AUDIT-06 RUNTIME: PASS (106 checks, 0 unexpected)`**
> (99 PASS + 7 INFO; the P2.a2 INFO now records the new guard failure).
> Companion re-runs: `run-pg17-migration-package.sh` →
> `MIGRATION PACKAGE PG17 VERIFICATION PASS`; audit-05 (M1..M8) →
> `AUDIT-05 RUNTIME: PASS (158 checks, 0 unexpected)`.
> The first-run record below is kept as audit history.

---

Runtime verification of `docs/migration-drafts/GRADUATION-PROJECTS-M9-AUDIT-REMEDIATION-06.NOT_APPLIED.sql`
on top of the verified M1..M8 chain. Executed by
`tests/graduation-projects/audit-06/run-audit-06.sh` on 2026-08-01 inside a single
throwaway `postgres:17` Docker container (one disposable database per part: a06r1,
a06s2a, a06s2b, a06p3, a06p4, a06p5; container force-removed on exit, `tmp/` deleted).
No existing repo file was modified; no real database was touched. Actor spoofing via
`set request.jwt.claim.sub`; genuine ACL probes via `set role authenticated`/`anon`.
All fixtures synthetic TEST_ONLY (7e58/7e59/7e5a-prefixed ids) inside rolled-back
transactions.

Runner verdict (verbatim):

```
AUDIT-06 RUNTIME: INVESTIGATE (1 unexpected)
```

The single unexpected result is the pre-flagged **Part-1 conflict**: the EXISTING
`tests/graduation-projects/postgres-security-audit-verifier.sql` fails under M1..M9.
Per instructions this is reported verbatim, not worked around — see below.

## PART 1 — regression: existing verifiers on M1..M9 (verbatim outcomes)

7 of 8 existing verifiers pass on M1..M9 exactly as on M1..M8:

```
AUDIT06|P1.1.postgres-foundation-verifier.sql|PASS|verifier passed on M1..M9 exactly as on M1..M8
AUDIT06|P1.2.postgres-lifecycle-verifier.sql|PASS|verifier passed on M1..M9 exactly as on M1..M8
AUDIT06|P1.3.postgres-hardening-verifier.sql|PASS|verifier passed on M1..M9 exactly as on M1..M8
AUDIT06|P1.4.postgres-files-notifications-verifier.sql|PASS|verifier passed on M1..M9 exactly as on M1..M8
AUDIT06|P1.5.postgres-admin-settings-verifier.sql|PASS|verifier passed on M1..M9 exactly as on M1..M8
AUDIT06|P1.6.postgres-authorization-matrix-verifier.sql|PASS|verifier passed on M1..M9 exactly as on M1..M8
AUDIT06|P1.7.postgres-e2e-journeys-verifier.sql|PASS|verifier passed on M1..M9 exactly as on M1..M8
```

### CONFLICT — postgres-security-audit-verifier.sql on M1..M9 (verbatim)

```
AUDIT06|P1.8.postgres-security-audit-verifier.sql|FAIL|CONFLICT on M1..M9 (verbatim): psql:<stdin>:132: ERROR:  SECURITY AUDIT FAILED: 2 checks failed
```

The two failing catalog rows (verbatim from the verifier's gp_audit table on M1..M9):

```
co-supervisor-read-only|FAIL|co_supervisor whitelist drift
function-inventory|FAIL|unexpected function count
psql:<stdin>:132: ERROR:  SECURITY AUDIT FAILED: 2 checks failed
CONTEXT:  PL/pgSQL function inline_code_block line 3 at RAISE
```

Root cause (verified by direct catalog queries on the M1..M9 database, container a06dbg):

1. `function-inventory` caps `count(pg_proc like 'graduation_project%')` at **<= 45**.
   M1..M8 leaves exactly 45; M9 adds `graduation_project_assignment_rank` -> **46**.
2. `co-supervisor-read-only` caps SECURITY DEFINER functions whose `prosrc` contains
   the text `co_supervisor` at **<= 6**. Under M1..M9 there are **7**:
   `assign_graduation_project_faculty, end_graduation_project_assignment,
   get_graduation_project_detail, get_graduation_project_settings,
   graduation_project_notify_from_event, list_graduation_project_rubrics,
   upsert_graduation_project_settings`.
   The new carrier is `end_graduation_project_assignment`: the M9 replacement's F-1
   comment line literally mentions "supervisor/co_supervisor/panel_member/student".
   The co_supervisor write whitelist itself is unchanged (no co_supervisor role was
   added to any write RPC); only the verifier's textual threshold is exceeded.

No e2e-journeys or authorization-matrix conflict exists: no existing fixture ends a
same/higher-rank assignment (only coordinator->student), no verifier resolves another
supervisor's note, and all settings/rubric upsert calls in the existing verifiers use
non-null correlation ids with the unchanged guard messages.

## PART 2 — M9 guards (verbatim)

```
AUDIT06|P2.a1.wrong-order-minimal-only|PASS|failed as expected: ERROR: psql:<stdin>:49: ERROR:  graduation projects M1..M8 missing; apply the reviewed package first
AUDIT06|P2.a2.wrong-order-m1-m7|INFO|RECORD: M9 APPLIED on minimal+M1..M7 (M8 absent) — preflight sentinels cannot detect the missing M8
AUDIT06|P2.b.replay-M9-guard|PASS|failed as expected: ERROR: psql:<stdin>:49: ERROR:  graduation projects audit remediation already exists; refuse ambiguous retry
AUDIT06|P2.b.replay-M9-unchanged|PASS|object counts identical before/after refused replay: 71/46/2
AUDIT06|P2.c.preflight-sentinel-ok|PASS|M9 applied cleanly on top of M1..M8 (sentinel preflight passed)
```

Note (recorded behavior): M9's preflight sentinels
(`record_graduation_project_discussion_outcome` exists since M2,
`graduation_project_settings` exists since M6) **cannot detect a missing M8** — M9
applies cleanly on minimal+M1..M7. Replay on M1..M9 raises
`graduation projects audit remediation already exists; refuse ambiguous retry` with
identical object counts before/after (71/46/2).

## PART 3 — F-1 rank-boundary matrix (verbatim, all rows)

```
AUDIT06|T3.01.coord-ends-supervisor|PASS|coordinator ends the supervisor assignment (rank 40 > 30) :: allowed: assignment ended, exactly one assignment_ended event with the correlation id
AUDIT06|T3.02.coord-ends-co-supervisor|PASS|coordinator ends the co_supervisor assignment (rank 40 > 30) :: allowed: assignment ended, exactly one assignment_ended event with the correlation id
AUDIT06|T3.03.coord-ends-panel|PASS|coordinator ends the panel_member assignment (rank 40 > 20) :: allowed: assignment ended, exactly one assignment_ended event with the correlation id
AUDIT06|T3.04.coord-ends-student|PASS|coordinator ends a student assignment (rank 40 > 10) :: allowed: assignment ended, exactly one assignment_ended event with the correlation id
AUDIT06|T3.05.coord-ends-head|PASS|coordinator ending a department_head must fail the rank boundary :: denied as expected: assignment termination authority denied | zero events, target unchanged
AUDIT06|T3.06.coord-ends-dean|PASS|coordinator ending a dean must fail the rank boundary :: denied as expected: assignment termination authority denied | zero events, target unchanged
AUDIT06|T3.07.coord-ends-coord|PASS|coordinator ending another coordinator (same rank) must fail :: denied as expected: assignment termination authority denied | zero events, target unchanged
AUDIT06|T3.08.head-ends-coordinator|PASS|department_head ends the second coordinator (rank 50 > 40) :: allowed: assignment ended, exactly one assignment_ended event with the correlation id
AUDIT06|T3.09.head-ends-supervisor|PASS|department_head ends the supervisor assignment (rank 50 > 30) :: allowed: assignment ended, exactly one assignment_ended event with the correlation id
AUDIT06|T3.10.head-ends-head|PASS|department_head ending another department_head (same rank) must fail :: denied as expected: assignment termination authority denied | zero events, target unchanged
AUDIT06|T3.11.head-ends-dean|PASS|department_head ending a dean must fail the rank boundary :: denied as expected: assignment termination authority denied | zero events, target unchanged
AUDIT06|T3.12.dean-not-whitelisted|PASS|dean ending a supervisor must fail (dean not whitelisted) :: denied as expected: exact direct processing assignment required | zero events, target unchanged
AUDIT06|T3.13.wrong-dept-coordinator|PASS|a coordinator of another department must fail :: denied as expected: exact direct processing assignment required | zero events, target unchanged
AUDIT06|T3.14.unrelated|PASS|unrelated faculty without a pA assignment must fail :: denied as expected: exact direct processing assignment required | zero events, target unchanged
AUDIT06|T3.15.anonymous|PASS|anonymous caller (auth.uid() null) must fail :: denied as expected: exact direct processing assignment required | zero events, target unchanged
AUDIT06|T3.16.stale-ended-supervisor|PASS|ending an already-ended lower-rank assignment returns its id with zero mutation :: invariant holds
AUDIT06|T3.17.stale-ended-head-rank|PASS|coordinator ending an already-ended department_head must still fail the rank boundary :: denied as expected: assignment termination authority denied | zero events, target unchanged
AUDIT06|T3.18.self-end|PASS|coordinator ending their OWN assignment must fail :: denied as expected: cannot end own assignment | zero events, target unchanged
AUDIT06|T3.19.cross-project-id|PASS|end with an assignment_id of another project must fail :: denied as expected: assignment not found | zero events, target unchanged
AUDIT06|T3.20.replay-no-duplicate-notification|PASS|replay produced no duplicate notification :: invariant holds
AUDIT06|T3.20.replay-no-second-event|PASS|replay wrote no second event for the correlation id :: invariant holds
AUDIT06|T3.20.replay-returns-recorded|PASS|replay with the same correlation id returns the recorded assignment id :: invariant holds
AUDIT06|T3.21.ended-supervisor-write|PASS|the ended supervisor must fail a subsequent write RPC :: denied as expected: exact direct processing assignment required | zero events, target unchanged
AUDIT06|T3.rank-table|INFO|RECORD: rank of each role (dean/head/coordinator/supervisor/co_supervisor/panel_member/student) :: RECORD: 60/50/40/30/30/20/10
AUDIT06|SETUP.p0-coord-asg|PASS|capture the p0 coordinator assignment id (cross-project probe) :: completed
AUDIT06|SETUP.pA.add-s1|PASS|coordinator adds student 1 :: completed
AUDIT06|SETUP.pA.add-s2|PASS|coordinator adds student 2 :: completed
AUDIT06|SETUP.pA.assign-coordb|PASS|coordinator assigns a second coordinator :: completed
AUDIT06|SETUP.pA.assign-cosup|PASS|coordinator assigns co-supervisor :: completed
AUDIT06|SETUP.pA.assign-sup2|PASS|coordinator assigns a replacement supervisor :: completed
AUDIT06|SETUP.pA.assign-sup|PASS|coordinator assigns supervisor :: completed
AUDIT06|SETUP.pA.create|PASS|coordinator creates project pA :: completed
```

## PART 4 — F-2 audit/correlation matrix (verbatim, all rows)

```
AUDIT06|T4.01.event-shape|PASS|exactly one department-scoped settings_upserted event with the canonical shape :: invariant holds
AUDIT06|T4.01.payload-insert|PASS|payload has operation=insert, changed_keys and after-scalars :: invariant holds
AUDIT06|T4.01.payload-no-pii-keys|PASS|payload top-level keys limited to operation/changed_keys/before/after (no PII keys) :: invariant holds
AUDIT06|T4.01.payload-verbatim|INFO|RECORD: verbatim settings_upserted payload :: RECORD: {"after": {"team_max": 3, "team_min": 1, "defense_notice_days": 7, "supervisor_capacity": null, "co_supervisor_allowed": true, "correction_window_days": 30}, "before": null, "operation": "insert", "changed_keys": ["team_min", "team_max", "supervisor_capacity", "co_supervisor_allowed", "correction_window_days", "defense_notice_days"]}
AUDIT06|T4.01.settings-insert|PASS|department_head upserts settings (insert path) :: completed
AUDIT06|T4.02.replay|PASS|replay same call+correlation returns the same id, one event, row untouched :: invariant holds
AUDIT06|T4.03.post-state|INFO|RECORD: settings row after the colliding call (team_min/team_max, updated_at unchanged?) :: RECORD: 1/3 | updated_at_unchanged=true
AUDIT06|T4.03.same-corr-different-args|INFO|RECORD: same correlation id with different args (team 9..9) :: RECORD: completed without error
AUDIT06|T4.04.settings-update|PASS|second upsert with a new correlation id (update path) :: completed
AUDIT06|T4.04.update-event|PASS|exactly one update event with operation=update, changed_keys=[team_max], before/after :: invariant holds
AUDIT06|T4.05.null-correlation|PASS|upsert settings with a null correlation id must fail :: denied as expected: correlation id required | zero new events
AUDIT06|T4.06.invalid-payload|PASS|upsert settings with team_max<team_min must fail :: denied as expected: settings invalid | zero new events
AUDIT06|T4.06.row-unchanged|PASS|settings row unchanged after the invalid upsert :: invariant holds
AUDIT06|T4.07.as-coordinator|PASS|coordinator upserting settings must fail :: denied as expected: settings administration assignment required | zero new events
AUDIT06|T4.08a.as-student|PASS|student upserting settings must fail :: denied as expected: settings administration assignment required | zero new events
AUDIT06|T4.08b.as-unrelated|PASS|unrelated user upserting settings must fail :: denied as expected: settings administration assignment required | zero new events
AUDIT06|T4.08c.as-anonymous|PASS|anonymous upserting settings must fail :: denied as expected: settings administration assignment required | zero new events
AUDIT06|T4.09.wrong-dept-head|PASS|a department_head of dept2 upserting settings for dept1 must fail :: denied as expected: settings administration assignment required | zero new events
AUDIT06|T4.10.payload-verbatim|INFO|RECORD: verbatim rubric_upserted payload :: RECORD: {"code": "GEN", "after": {"title": "TEST_ONLY — General rubric", "passing_threshold": 60}, "before": null, "operation": "insert", "version_label": "v1", "criteria_count": 2}
AUDIT06|T4.10.rubric-event|PASS|exactly one rubric_upserted event with operation=insert, code/version_label/criteria_count :: invariant holds
AUDIT06|T4.10.rubric-insert|PASS|department_head upserts a rubric (insert path) :: completed
AUDIT06|T4.11.rubric-replay|PASS|rubric replay returns the same id, one event, criteria not duplicated :: invariant holds
AUDIT06|T4.12.rubric-update-event|PASS|one update event with before/after title/threshold/criteria_count; criteria replaced :: invariant holds
AUDIT06|T4.12.rubric-update|PASS|rubric update path (p_rubric_id set, 3 criteria) :: completed
AUDIT06|T4.13.rubric-null-correlation|PASS|rubric upsert with a null correlation id must fail :: denied as expected: correlation id required | zero new events
AUDIT06|T4.14.criteria-unchanged|PASS|criteria unchanged after the invalid rubric upsert :: invariant holds
AUDIT06|T4.14.rubric-invalid|PASS|rubric upsert with an empty criteria array must fail :: denied as expected: rubric payload invalid | zero new events
AUDIT06|T4.15.rubric-not-found|PASS|rubric update against a non-existent rubric id must fail :: denied as expected: rubric not found | zero new events
AUDIT06|T4.16.rubric-as-coordinator|PASS|coordinator upserting a rubric must fail :: denied as expected: rubric administration assignment required | zero new events
AUDIT06|T4.17a.append-only-update|PASS|UPDATE on a department-scoped event row must fail :: denied as expected: graduation project events are append-only | zero new events
AUDIT06|T4.17b.append-only-delete|PASS|DELETE on a department-scoped event row must fail :: denied as expected: graduation project events are append-only | zero new events
AUDIT06|T4.18a.scope-both-set|PASS|direct insert with both project_id and department_id must violate the scope CHECK :: denied as expected: 23514: new row for relation "graduation_project_events" violates check constraint "graduation_project_events_scope"
AUDIT06|T4.18b.scope-both-null|PASS|direct insert with both scopes null must violate the scope CHECK :: denied as expected: 23514: new row for relation "graduation_project_events" violates check constraint "graduation_project_events_scope"
AUDIT06|T4.19.department-dedupe|PASS|second department event with the same (department_id, correlation_id, event_type) must fail unique :: denied as expected: 23505: duplicate key value violates unique constraint "graduation_project_events_department_correlation_key"
AUDIT06|T4.20.no-notification-fanout|PASS|notification_log gains zero rows for settings_upserted / rubric_upserted :: invariant holds
AUDIT06|T4.21a.rank-acl-authenticated|PASS|graduation_project_assignment_rank as role authenticated must fail 42501 :: denied as expected: 42501: permission denied for function graduation_project_assignment_rank
AUDIT06|T4.21b.rank-acl-anon|PASS|graduation_project_assignment_rank as role anon must fail 42501 :: denied as expected: 42501: permission denied for function graduation_project_assignment_rank
AUDIT06|SETUP.dedupe-first|PASS|first department event for the dedupe probe :: completed
```

### Case 4.3 — same correlation id, DIFFERENT args (recorded verbatim)

- `T4.03.same-corr-different-args|INFO|RECORD: completed without error` — the call
  returned without raising (faithful replay returns the recorded settings id).
- `T4.03.post-state|INFO|RECORD: 1/3 | updated_at_unchanged=true` — the colliding
  call (team 9..9) did NOT apply its values: the row still reads team_min/team_max =
  1/3 with `updated_at` untouched, and no second event row exists. This is faithful
  at-least-once delivery semantics; a caller reusing a correlation id with different
  arguments silently receives the ORIGINAL result (no mismatch error is raised).

## PART 5 — low-finding regressions (verbatim, all rows)

```
AUDIT06|T5.f3.scan-state-acl|PASS|set_graduation_project_file_scan_state as role authenticated still fails 42501 :: denied as expected: 42501: permission denied for function set_graduation_project_file_scan_state
AUDIT06|T5.f6.dept1-create|PASS|dept1 coordinator creates a project with correlation corrC1 :: completed
AUDIT06|T5.f6.dept1-faithful-replay|PASS|dept1 coordinator's own faithful replay with corrC1 returns the original dept1 project id :: invariant holds
AUDIT06|T5.f6.dept2-collision|INFO|RECORD: dept2 coordinator reuses corrC1 for a dept2 project (must NOT return the dept1 project id) :: RECORD: ede45895-9a05-4833-b4cb-070ddd08d741
AUDIT06|T5.f6.dept2-new-project|PASS|the colliding call created a NEW dept2 project (no cross-department id leak) :: invariant holds
AUDIT06|T5.f7.add-member-draft|PASS|coordinator adds student 1 to pX (draft) with correlation corrX1 :: completed
AUDIT06|T5.f7.new-add-wrong-state|PASS|a genuinely new add (different correlation) in the wrong state still fails :: denied as expected: team mutation state denied
AUDIT06|T5.f7.replay-after-state-change|PASS|faithful retry of add_team_member (same corrX1) after the state change returns the recorded assignment id :: invariant holds
AUDIT06|T5.f7.submit|PASS|student submits the pX proposal (project leaves the team-mutable states) :: completed
AUDIT06|T5.f9.activate|PASS|coordinator activates pX :: completed
AUDIT06|T5.f9.approve|PASS|head approves pX :: completed
AUDIT06|T5.f9.assign-supA|PASS|coordinator assigns supervisor A :: completed
AUDIT06|T5.f9.assign-supB|PASS|coordinator assigns replacement supervisor B :: completed
AUDIT06|T5.f9.head-ends-supA|PASS|department_head ends supervisor A's assignment (rank 50 > 30 — F-1 sanity) :: completed
AUDIT06|T5.f9.non-owner-resolve|PASS|replacement supervisor B resolving A's note must fail :: denied as expected: note ownership required
AUDIT06|T5.f9.note-still-open|PASS|note 2 remains unresolved and zero events were written for the denied attempt :: invariant holds
AUDIT06|T5.f9.note1|PASS|supervisor A authors note 1 :: completed
AUDIT06|T5.f9.note2|PASS|supervisor A authors note 2 :: completed
AUDIT06|T5.f9.owner-resolve-positive|PASS|owning supervisor A resolves note 1 :: completed
AUDIT06|T5.f9.start-review|PASS|head starts the pX review :: completed
AUDIT06|T5.f9.student-resolve|PASS|student resolving a supervisor note must fail :: denied as expected: exact direct processing assignment required
AUDIT06|T5.mime-negative|PASS|register_graduation_project_file still rejects a disallowed MIME type :: denied as expected: file media type not allowed
```

### F-6 outcomes (recorded verbatim)

- dept2 coordinator reusing dept1's correlation id `corrC1`:
  `T5.f6.dept2-collision|INFO|RECORD: ede45895-9a05-4833-b4cb-070ddd08d741` — a NEW
  uuid, NOT the dept1 project id (`T5.f6.dept2-new-project|PASS`: different id,
  department = dept2). The cross-department existence leak is closed.
- dept1 coordinator's own faithful replay with `corrC1` returns the original dept1
  project id (`T5.f6.dept1-faithful-replay|PASS`).

## Environment / cleanup

- Image `postgres:17`, container `gp-audit06-<pid>`, `--rm` + `trap cleanup EXIT`
  (force-removes the container, deletes `tests/graduation-projects/audit-06/tmp/`).
- `docker ps -a --filter name=gp-audit06` after the run: empty. `tmp/` absent.
- A temporary debug container `a06dbg` was used only for verbatim error capture and
  was force-removed immediately after.
