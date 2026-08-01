# AUDIT-05 — RUNTIME RESULTS (verbatim)

> **POST-FIX ADDENDUM (2026-08-01, second run).** The C2.5 FAIL recorded below was
> remediated during the audit by adding explicit revokes of the three trigger
> functions to the migration drafts (the only draft edits made by this audit):
> - M1: `revoke all on function public.guard_graduation_project_assignment() from public, anon, authenticated;`
>   and the same for `public.reject_graduation_project_event_mutation()`.
> - M5: `revoke all on function public.graduation_project_notify_from_event() from public, anon, authenticated;`
>
> Re-runs after the fix, all green:
> - `tests/graduation-projects/audit-05/run-audit-05.sh` →
>   **`AUDIT-05 RUNTIME: PASS (158 checks, 0 unexpected)`** (C2.5 now PASS; the 11
>   INFO records below are unchanged recorded behaviors).
> - `tests/graduation-projects/run-pg17-migration-package.sh` →
>   **`MIGRATION PACKAGE PG17 VERIFICATION PASS`** (incl. 68-row authorization
>   matrix ×2, 53-step E2E, catalog invariants).
> - `bun test tests/graduation-projects` → **155 pass, 0 fail**; `bunx tsc --noEmit` → clean.
>
> Post-fix draft SHAs (`git hash-object`): M1 `bc4767a3d68726f495a76bde000124db18467845`,
> M5 `fd3fdfd7bc51e799018e50644319bf1398af7935`; M2 `3bc52d9f0828bd0393d7cef3fd450ee05e0c00fb`,
> M3 `64cadd267ff47a60e2278fc55b9ea35383e41851`, M4 `5fcd68304202179db8e05c063a0f72a6c935f349`,
> M6 `a4d903409f060820b5929646b37052c031c9f570`, M7 `8920a94be8d45e8fa2129ac23edf50450e17d0c4`,
> M8 `8d38d78e88e2fedf6893564630efa2b90b806b26`.
>
> The verbatim first-run record below is kept as audit history.

---

Independent audit of the forward-only migration package
`docs/migration-drafts/GRADUATION-PROJECTS-M1..M8-*.NOT_APPLIED.sql`.
Executed by `tests/graduation-projects/audit-05/run-audit-05.sh` on 2026-08-01 inside a
single throwaway `postgres:17` Docker container (one disposable database per scenario,
container force-removed on exit, `tmp/` deleted). No existing repo file was modified;
no real database was touched. Actor spoofing via `set request.jwt.claim.sub`;
genuine ACL probes via `set role authenticated`. All fixtures are synthetic
TEST_ONLY rows (7e57-prefixed ids) inside rolled-back transactions.

Runner verdict (verbatim):

```
AUDIT-05 RUNTIME: INVESTIGATE (1 unexpected results)
```

158 checks: 146 PASS, 11 INFO (recorded behavior), 1 FAIL (genuine catalog finding C2.5).

## Headline findings

1. **C2.5 FAIL — three trigger functions keep the default PUBLIC EXECUTE grant.**
   `guard_graduation_project_assignment()`, `reject_graduation_project_event_mutation()`
   (both M1) and `graduation_project_notify_from_event()` (M5) are never revoked in any
   migration, so their `proacl` is NULL and the effective ACL is the function default
   (`=X/postgres` → PUBLIC EXECUTE). Every other graduation function (41 SECURITY DEFINER
   functions) is properly revoked/pinned. Impact is low (they are trigger helpers with no
   actor checks of their own), but it violates the audit expectation "zero EXECUTE grants
   to PUBLIC/anon on any graduation function". Verbatim:
   `guard_graduation_project_assignment->PUBLIC, reject_graduation_project_event_mutation->PUBLIC, graduation_project_notify_from_event->PUBLIC`
2. **M7 and M8 are silently replayable** — their guards only check the predecessor
   exists; the bodies are bare `create or replace function` with no already-exists guard,
   so a second apply exits rc=0 and COMMITs (see Part 1, item 5).
3. **preflight-07 and preflight-08 are replay-tolerant** — same missing already-applied
   guard; they print their OK marker and exit rc=0 on a fully applied database
   (see Part 1, item 7).
4. **A coordinator CAN end the project's department_head assignment** (item e2 evidence
   below). The RPC allows any active coordinator/department_head to end any assignment
   except their own.
5. **A replacement supervisor CAN resolve a note authored by a different (former)
   supervisor** — `resolve_graduation_project_supervisor_note` checks only that the actor
   holds an active supervisor assignment on the project, never
   `note.supervisor_assignment_id = actor` (item f evidence below).
6. **Idempotent replay of `add_graduation_project_team_member` is state-gated.** The M6
   rewrite checks `p.state in ('draft','revision_required')` BEFORE the correlation-id
   replay lookup, so a faithful retry after the project left those states raises
   `team mutation state denied` instead of returning the recorded id (observed in an
   earlier run against an archived project). Within the team-mutable states the replay
   returns cleanly and produces no duplicate event or notification rows (T3.o.* PASS).

---

## PART 1 — order / replay / atomicity (verbatim runner lines)

```
AUDIT05|P1.1.wrong-order-M2-before-M1|PASS|failed as expected: ERROR: psql:<stdin>:17: ERROR:  graduation projects foundation missing; apply reviewed foundation first
AUDIT05|P1.2.wrong-order-M4-before-M3|PASS|failed as expected: ERROR: psql:<stdin>:30: ERROR:  co_supervisor enum value missing; apply the enum migration first
AUDIT05|P1.3.wrong-order-preflight-02|PASS|failed as expected: ERROR: psql:<stdin>:13: ERROR:  PREFLIGHT FAIL: foundation missing; apply 20260730100000 first
AUDIT05|P1.4.replay-M1-guard|PASS|failed as expected: ERROR: psql:<stdin>:15: ERROR:  graduation projects foundation already exists; refuse ambiguous retry
AUDIT05|P1.4.replay-M1-unchanged|PASS|object counts identical before/after refused replay: 52/10/18
AUDIT05|P1.5.replay-M2|PASS|clean guard failure: ERROR: psql:<stdin>:17: ERROR:  graduation projects lifecycle completion already exists; refuse ambiguous retry
AUDIT05|P1.5.replay-M3|PASS|clean guard failure: ERROR: psql:<stdin>:21: ERROR:  co_supervisor enum value already exists; refuse ambiguous retry
AUDIT05|P1.5.replay-M4|PASS|clean guard failure: ERROR: psql:<stdin>:30: ERROR:  graduation projects hardening already exists; refuse ambiguous retry
AUDIT05|P1.5.replay-M5|PASS|clean guard failure: ERROR: psql:<stdin>:23: ERROR:  graduation projects files/notifications package already exists; refuse ambiguous retry
AUDIT05|P1.5.replay-M6|PASS|clean guard failure: ERROR: psql:<stdin>:24: ERROR:  graduation projects admin settings package already exists; refuse ambiguous retry
AUDIT05|P1.5.replay-M7|INFO|REPLAY SUCCEEDED (rc=0) — migration has no already-exists guard (create-or-replace only)
AUDIT05|P1.5.replay-M8|INFO|REPLAY SUCCEEDED (rc=0) — migration has no already-exists guard (create-or-replace only)
AUDIT05|P1.6a.partial-apply-atomic|PASS|abort was atomic: only the pre-existing 1-column conflict table remains (other-tables/types/functions/cols = 0/0/0/1)
AUDIT05|P1.6a.partial-apply-guard|PASS|failed as expected: ERROR: psql:<stdin>:15: ERROR:  graduation projects foundation already exists; refuse ambiguous retry
AUDIT05|P1.6b.fault-injection-atomic|PASS|zero M1 objects after mid-migration fault (tables+views/types/functions = 0/0/0)
AUDIT05|P1.6b.fault-injection-fails|PASS|injected fault aborted the migration: ERROR: psql:<stdin>:370: ERROR:  division by zero
AUDIT05|P1.7.preflight-01-replay|PASS|raised as expected: ERROR: psql:<stdin>:19: ERROR:  PREFLIGHT FAIL: graduation_projects already exists; foundation migration is not forward-only here
AUDIT05|P1.7.preflight-02-replay|PASS|raised as expected: ERROR: psql:<stdin>:13: ERROR:  PREFLIGHT FAIL: lifecycle completion already exists; not forward-only here
AUDIT05|P1.7.preflight-03-replay|PASS|raised as expected: ERROR: psql:<stdin>:15: ERROR:  PREFLIGHT FAIL: co_supervisor enum value already exists; not forward-only here
AUDIT05|P1.7.preflight-04-replay|PASS|raised as expected: ERROR: psql:<stdin>:19: ERROR:  PREFLIGHT FAIL: hardening objects already exist; not forward-only here
AUDIT05|P1.7.preflight-05-replay|PASS|raised as expected: ERROR: psql:<stdin>:12: ERROR:  PREFLIGHT FAIL: files/notifications package already exists; not forward-only here
AUDIT05|P1.7.preflight-06-replay|PASS|raised as expected: ERROR: psql:<stdin>:12: ERROR:  PREFLIGHT FAIL: admin settings package already exists; not forward-only here
AUDIT05|P1.7.preflight-07-replay|INFO|REPLAY TOLERATED (rc=0): preflight has no already-applied guard — output: (1 row)
AUDIT05|P1.7.preflight-08-replay|INFO|REPLAY TOLERATED (rc=0): preflight has no already-applied guard — output: (1 row)
```

Item 5 detail (replay of each of M2..M8 against the fully applied database):

- M2: rc!=0, `ERROR:  graduation projects lifecycle completion already exists; refuse ambiguous retry` — clean guard, transaction aborted.
- M3: rc!=0, `ERROR:  co_supervisor enum value already exists; refuse ambiguous retry` — clean guard.
- M4: rc!=0, `ERROR:  graduation projects hardening already exists; refuse ambiguous retry` — clean guard.
- M5: rc!=0, `ERROR:  graduation projects files/notifications package already exists; refuse ambiguous retry` — clean guard.
- M6: rc!=0, `ERROR:  graduation projects admin settings package already exists; refuse ambiguous retry` — clean guard.
- M7: **rc=0, COMMIT — replay SUCCEEDED with no guard** (body is `create or replace function public.conclude_graduation_project_result`; only checks the predecessor exists).
- M8: **rc=0, COMMIT — replay SUCCEEDED with no guard** (body is `create or replace function public.record_graduation_project_discussion_outcome`; only checks the predecessor exists).

Item 6 note: in scenario 6a the pre-created conflict table `public.graduation_projects(id uuid)`
survives (it is not an M1 object); every M1 object (other 14 tables, both enums, all
functions, the reporting view) is absent after the abort — the begin/commit wrapper is
atomic. Scenario 6b (`select 1/0;` injected before `commit;` in a temp copy, deleted after
the run) aborted with `ERROR:  division by zero` at line 370 and left zero M1 objects.

## PART 2 — catalog security (verbatim)

```
AUDIT05|C2.1.rls-enabled|PASS|every graduation_project* table has relrowsecurity=true :: tables=19, rls_on=19
AUDIT05|C2.2.zero-policies|PASS|pg_policies count on graduation tables = 0 :: policies=0
AUDIT05|C2.3.no-table-grants|PASS|zero table grants to anon/authenticated/PUBLIC on graduation tables :: none
AUDIT05|C2.4.definer-search-path|PASS|all SECURITY DEFINER graduation functions pin search_path=public,pg_temp :: definers=41, pinned=41
AUDIT05|C2.5.no-public-execute|FAIL|zero effective EXECUTE grants to PUBLIC/anon on graduation functions :: guard_graduation_project_assignment->PUBLIC, reject_graduation_project_event_mutation->PUBLIC, graduation_project_notify_from_event->PUBLIC
AUDIT05|C2.5b.function-grant-inventory|INFO|every effective EXECUTE grant on graduation functions (signature -> role) :: accept_graduation_project_correction(uuid,uuid,uuid) -> authenticated; accept_graduation_project_correction(uuid,uuid,uuid) -> postgres; activate_graduation_project(uuid,bigint,uuid) -> authenticated; activate_graduation_project(uuid,bigint,uuid) -> postgres; add_graduation_project_supervisor_note(uuid,uuid,text,uuid) -> authenticated; add_graduation_project_supervisor_note(uuid,uuid,text,uuid) -> postgres; add_graduation_project_team_member(uuid,uuid,uuid,uuid) -> authenticated; add_graduation_project_team_member(uuid,uuid,uuid,uuid) -> postgres; archive_graduation_project(uuid,uuid,bigint,uuid) -> authenticated; archive_graduation_project(uuid,uuid,bigint,uuid) -> postgres; assign_graduation_project_faculty(uuid,text,uuid,uuid,uuid) -> authenticated; assign_graduation_project_faculty(uuid,text,uuid,uuid,uuid) -> postgres; assign_graduation_project_panel_member(uuid,uuid,uuid,boolean,uuid) -> authenticated; assign_graduation_project_panel_member(uuid,uuid,uuid,boolean,uuid) -> postgres; complete_graduation_project_correction(uuid,uuid,uuid) -> authenticated; complete_graduation_project_correction(uuid,uuid,uuid) -> postgres; conclude_graduation_project_result(uuid,text,jsonb,bigint,uuid) -> authenticated; conclude_graduation_project_result(uuid,text,jsonb,bigint,uuid) -> postgres; create_graduation_project(uuid,text,text,uuid,uuid,uuid,uuid) -> authenticated; create_graduation_project(uuid,text,text,uuid,uuid,uuid,uuid) -> postgres; end_graduation_project_assignment(uuid,uuid,uuid) -> authenticated; end_graduation_project_assignment(uuid,uuid,uuid) -> postgres; finalize_graduation_project_evaluation(uuid,uuid) -> authenticated; finalize_graduation_project_evaluation(uuid,uuid) -> postgres; get_graduation_project_archive_report(uuid) -> authenticated; get_graduation_project_archive_report(uuid) -> postgres; get_graduation_project_assignments_report(uuid) -> authenticated; get_graduation_project_assignments_report(uuid) -> postgres; get_graduation_project_defense_report(uuid) -> authenticated; get_graduation_project_defense_report(uuid) -> postgres; get_graduation_project_detail(uuid) -> authenticated; get_graduation_project_detail(uuid) -> postgres; get_graduation_project_evaluations_report(uuid) -> authenticated; get_graduation_project_evaluations_report(uuid) -> postgres; get_graduation_project_settings(uuid) -> authenticated; get_graduation_project_settings(uuid) -> postgres; get_graduation_project_states_report(uuid) -> authenticated; get_graduation_project_states_report(uuid) -> postgres; graduation_project_is_discussion_ready(uuid) -> postgres; graduation_project_notify_from_event() -> postgres; graduation_project_notify_from_event() -> PUBLIC; graduation_project_settings_for(uuid,uuid) -> postgres; guard_graduation_project_assignment() -> postgres; guard_graduation_project_assignment() -> PUBLIC; list_graduation_project_orphan_files() -> postgres; list_graduation_project_rubrics(uuid) -> authenticated; list_graduation_project_rubrics(uuid) -> postgres; list_my_graduation_project_notifications() -> authenticated; list_my_graduation_project_notifications() -> postgres; list_my_graduation_projects() -> authenticated; list_my_graduation_projects() -> postgres; record_graduation_project_discussion_outcome(uuid,uuid,text,uuid) -> authenticated; record_graduation_project_discussion_outcome(uuid,uuid,text,uuid) -> postgres; register_graduation_project_file(uuid,uuid,text,text,text,bigint,text,uuid,text) -> authenticated; register_graduation_project_file(uuid,uuid,text,text,text,bigint,text,uuid,text) -> postgres; reject_graduation_project_discussion_request(uuid,uuid,text,uuid) -> authenticated; reject_graduation_project_discussion_request(uuid,uuid,text,uuid) -> postgres; reject_graduation_project_event_mutation() -> postgres; reject_graduation_project_event_mutation() -> PUBLIC; request_graduation_project_discussion(uuid,uuid) -> authenticated; request_graduation_project_discussion(uuid,uuid) -> postgres; require_graduation_project_assignment(uuid,graduation_project_assignment_role[]) -> postgres; resolve_graduation_project_supervisor_note(uuid,uuid,uuid) -> authenticated; resolve_graduation_project_supervisor_note(uuid,uuid,uuid) -> postgres; resubmit_graduation_project_proposal(uuid,bigint,uuid) -> authenticated; resubmit_graduation_project_proposal(uuid,bigint,uuid) -> postgres; review_graduation_project_proposal(uuid,text,text,bigint,uuid) -> authenticated; review_graduation_project_proposal(uuid,text,text,bigint,uuid) -> postgres; review_graduation_project_submission(uuid,uuid,text,text,uuid) -> authenticated; review_graduation_project_submission(uuid,uuid,text,text,uuid) -> postgres; save_graduation_project_evaluation(uuid,uuid,text,jsonb,text,boolean,uuid) -> authenticated; save_graduation_project_evaluation(uuid,uuid,text,jsonb,text,boolean,uuid) -> postgres; schedule_graduation_project_discussion(uuid,uuid,timestamp with time zone,text,uuid) -> authenticated; schedule_graduation_project_discussion(uuid,uuid,timestamp with time zone,text,uuid) -> postgres; set_graduation_project_file_scan_state(uuid,text,uuid) -> postgres; set_graduation_project_milestone(uuid,text,text,integer,numeric,uuid) -> authenticated; set_graduation_project_milestone(uuid,text,text,integer,numeric,uuid) -> postgres; submit_graduation_project_deliverable(uuid,uuid,text,uuid) -> authenticated; submit_graduation_project_deliverable(uuid,uuid,text,uuid) -> postgres; submit_graduation_project_proposal(uuid,bigint,uuid) -> authenticated; submit_graduation_project_proposal(uuid,bigint,uuid) -> postgres; upsert_graduation_project_rubric(uuid,uuid,text,text,text,numeric,jsonb,uuid) -> authenticated; upsert_graduation_project_rubric(uuid,uuid,text,text,text,numeric,jsonb,uuid) -> postgres; upsert_graduation_project_settings(uuid,uuid,integer,integer,integer,boolean,integer,integer,uuid) -> authenticated; upsert_graduation_project_settings(uuid,uuid,integer,integer,integer,boolean,integer,integer,uuid) -> postgres
AUDIT05|C2.6.no-storage-bucket|PASS|no storage.buckets rows referencing graduation :: storage schema absent in minimal harness (no bucket possible)
AUDIT05|C2.7.files-key-constraint|PASS|graduation_project_files check constraint bans http keys and dot-dot segments :: CHECK (((object_key !~~ 'http%'::text) AND (object_key !~~ '%..%'::text)))
AUDIT05|C2.8.ownership|PASS|all graduation tables/functions owned by postgres (migration owner) :: non-postgres-owned: none
AUDIT05|C2.9.reporting-security-invoker|PASS|graduation_project_reporting reloptions contains security_invoker=true :: reloptions={security_invoker=true}
```

## PART 3 — extended actor matrix (verbatim, all rows incl. lifecycle setup steps)

```
AUDIT05|SETUP.m.add-first-member|PASS|first team member within team_max=1 :: completed
AUDIT05|SETUP.m.create-pS1|PASS|dept2 coordinator creates settings-test project pS1 :: completed
AUDIT05|SETUP.m.create-pS2|PASS|dept2 coordinator creates second settings-test project pS2 :: completed
AUDIT05|SETUP.m.upsert-settings|PASS|dept2 head upserts settings (team 1..1) :: completed
AUDIT05|SETUP.pA.accept-final|PASS|supervisor accepts the final deliverable :: completed
AUDIT05|SETUP.pA.add-s1|PASS|coordinator adds student 1 (fixed correlation id for the dedupe probe) :: completed
AUDIT05|SETUP.pA.add-s2|PASS|coordinator adds student 2 (fixed correlation id for the dedupe probe) :: completed
AUDIT05|SETUP.pA.approve|PASS|head approves pA :: completed
AUDIT05|SETUP.pA.assign-chair|PASS|coordinator assigns chair panel_member to the project :: completed
AUDIT05|SETUP.pA.assign-cosup|PASS|coordinator assigns co-supervisor :: completed
AUDIT05|SETUP.pA.assign-panel2|PASS|coordinator assigns second panel_member to the project :: completed
AUDIT05|SETUP.pA.assign-panel3|PASS|coordinator assigns a third panel_member to the project (never attached to the discussion) :: completed
AUDIT05|SETUP.pA.assign-sup2|PASS|coordinator assigns the replacement supervisor :: completed
AUDIT05|SETUP.pA.assign-sup|PASS|coordinator assigns supervisor :: completed
AUDIT05|SETUP.pA.attach-chair|PASS|coordinator attaches the chair to the discussion :: completed
AUDIT05|SETUP.pA.attach-panel2|PASS|coordinator attaches the second panel member to the discussion :: completed
AUDIT05|SETUP.pA.conclude|PASS|head concludes the result completed :: completed
AUDIT05|SETUP.pA.create|PASS|coordinator creates main project pA :: completed
AUDIT05|SETUP.pA.deliverable-final|PASS|student submits the final deliverable :: completed
AUDIT05|SETUP.pA.deliverable-m1|PASS|student 2 submits pA milestone 1 deliverable :: completed
AUDIT05|SETUP.pA.end-sup|PASS|coordinator ends the first supervisor assignment (supervision slot handover) :: completed
AUDIT05|SETUP.pA.finalize-chair|PASS|chair finalizes their evaluation :: completed
AUDIT05|SETUP.pA.finalize-panel2|PASS|second panel member finalizes their evaluation :: completed
AUDIT05|SETUP.pA.held|PASS|coordinator records the defense as held :: completed
AUDIT05|SETUP.pA.milestone-final|PASS|coordinator sets pA final milestone :: completed
AUDIT05|SETUP.pA.milestones|PASS|coordinator sets pA milestone plan (40 progress + 60 final) :: completed
AUDIT05|SETUP.pA.note1|PASS|supervisor adds note 1 :: completed
AUDIT05|SETUP.pA.note2|PASS|supervisor adds note 2 :: completed
AUDIT05|SETUP.pA.re-request|PASS|student re-requests the defense :: completed
AUDIT05|SETUP.pA.request-discussion|PASS|student requests the defense once ready :: completed
AUDIT05|SETUP.pA.save-panel2|PASS|second panel member submits their evaluation :: completed
AUDIT05|SETUP.pA.scan-clean|PASS|external scanner marks the first final file clean (service path) :: completed
AUDIT05|SETUP.pA.schedule|PASS|coordinator schedules the defense :: completed
AUDIT05|SETUP.pA.second-final|PASS|student registers a second final manuscript (left scan-pending for archive negatives) :: completed
AUDIT05|SETUP.pA.start-review|PASS|head starts pA review :: completed
AUDIT05|SETUP.pB.activate|PASS|coordinator activates pB :: completed
AUDIT05|SETUP.pB.add-s1|PASS|coordinator adds student 1 to pB :: completed
AUDIT05|SETUP.pB.approve|PASS|head approves pB :: completed
AUDIT05|SETUP.pB.create|PASS|coordinator creates project pB :: completed
AUDIT05|SETUP.pB.deliverable|PASS|student submits pB deliverable (cross-project submission fixture) :: completed
AUDIT05|SETUP.pB.milestone|PASS|coordinator sets pB milestone :: completed
AUDIT05|SETUP.pB.require-revision|PASS|head returns pB for revision :: completed
AUDIT05|SETUP.pB.review2|PASS|head starts second pB review round :: completed
AUDIT05|SETUP.pB.start-review|PASS|head starts pB review :: completed
AUDIT05|SETUP.pB.submit|PASS|student submits pB proposal :: completed
AUDIT05|T3.a.reject-as-cross-dept-coordinator|PASS|reject as a coordinator of another department must fail :: denied as expected: exact direct processing assignment required
AUDIT05|T3.a.reject-as-student|PASS|reject_graduation_project_discussion_request as student must fail :: denied as expected: exact direct processing assignment required
AUDIT05|T3.a.reject-as-unrelated|PASS|reject as unrelated same-department user must fail :: denied as expected: exact direct processing assignment required
AUDIT05|T3.a.reject-positive|PASS|coordinator rejects the pending discussion request :: completed
AUDIT05|T3.b.review-as-co-supervisor|PASS|review_graduation_project_submission as co_supervisor must fail :: denied as expected: exact direct processing assignment required
AUDIT05|T3.b.review-as-student|PASS|review_graduation_project_submission as student must fail :: denied as expected: exact direct processing assignment required
AUDIT05|T3.b.review-cross-project|PASS|review with a submission_id of another project must fail :: denied as expected: submission review precondition failed
AUDIT05|T3.b.review-positive|PASS|assigned supervisor accepts the milestone 1 submission :: completed
AUDIT05|T3.c.resubmit-from-draft|PASS|resubmit_graduation_project_proposal from draft state must fail :: denied as expected: proposal resubmission precondition failed
AUDIT05|T3.c.resubmit-positive|PASS|student resubmits from revision_required :: completed
AUDIT05|T3.c.resubmit-unrelated|PASS|resubmit as unrelated same-department user must fail :: denied as expected: exact direct processing assignment required
AUDIT05|T3.d.activate-as-student|PASS|activate_graduation_project as student must fail :: denied as expected: exact direct processing assignment required
AUDIT05|T3.d.activate-from-draft|PASS|activate_graduation_project from draft state must fail :: denied as expected: project activation precondition failed
AUDIT05|T3.d.activate-positive|PASS|coordinator activates pA from approved :: completed
AUDIT05|T3.e.coord-ends-dept-head|INFO|RECORD: coordinator ends the project's department_head assignment :: RECORD: completed without error
AUDIT05|T3.e.ended-head-state|INFO|RECORD: pB department_head assignment state after the coordinator end attempt (active / ended_at) :: RECORD: false / 2026-08-01 03:09:45.413695+00
AUDIT05|T3.e.ended-user-write|PASS|ended department_head must fail a subsequent write RPC :: denied as expected: exact direct processing assignment required
AUDIT05|T3.e.self-end|PASS|coordinator ending their OWN assignment must fail :: denied as expected: cannot end own assignment
AUDIT05|T3.f.note2-end-state|INFO|RECORD: note 2 resolved_at after the cross-supervisor resolve attempt :: RECORD: 2026-08-01 03:09:45.413695+00
AUDIT05|T3.f.resolve-as-student|PASS|note resolution as student must fail :: denied as expected: exact direct processing assignment required
AUDIT05|T3.f.resolve-other-supervisor|INFO|RECORD: replacement supervisor resolves a note authored by the previous supervisor :: RECORD: completed without error
AUDIT05|T3.f.resolve-owning|PASS|owning supervisor resolves note 1 :: completed
AUDIT05|T3.g.archive-report-as-student|PASS|archive report as student must fail :: denied as expected: department report assignment required
AUDIT05|T3.g.archive-report-as-unrelated|PASS|archive report as unrelated user must fail :: denied as expected: department report assignment required
AUDIT05|T3.g.archive-report-cross-dept|PASS|archive report as cross-department coordinator must fail :: denied as expected: department report assignment required
AUDIT05|T3.g.archive-report-positive|PASS|archive report as same-department coordinator :: completed
AUDIT05|T3.g.assignments-report-as-student|PASS|assignments report as student must fail :: denied as expected: department report assignment required
AUDIT05|T3.g.assignments-report-as-unrelated|PASS|assignments report as unrelated user must fail :: denied as expected: department report assignment required
AUDIT05|T3.g.assignments-report-cross-dept|PASS|assignments report as cross-department coordinator must fail :: denied as expected: department report assignment required
AUDIT05|T3.g.assignments-report-positive|PASS|assignments report as same-department coordinator :: completed
AUDIT05|T3.g.defense-report-as-student|PASS|defense report as student must fail :: denied as expected: department report assignment required
AUDIT05|T3.g.defense-report-as-unrelated|PASS|defense report as unrelated user must fail :: denied as expected: department report assignment required
AUDIT05|T3.g.defense-report-cross-dept|PASS|defense report as cross-department coordinator must fail :: denied as expected: department report assignment required
AUDIT05|T3.g.defense-report-positive|PASS|defense report as same-department coordinator :: completed
AUDIT05|T3.g.evaluations-report-as-student|PASS|evaluations report as student must fail :: denied as expected: department report assignment required
AUDIT05|T3.g.evaluations-report-as-unrelated|PASS|evaluations report as unrelated user must fail :: denied as expected: department report assignment required
AUDIT05|T3.g.evaluations-report-cross-dept|PASS|evaluations report as cross-department coordinator must fail :: denied as expected: department report assignment required
AUDIT05|T3.g.evaluations-report-positive|PASS|evaluations report as same-department coordinator :: completed
AUDIT05|T3.g.states-report-as-student|PASS|states report as student must fail :: denied as expected: department report assignment required
AUDIT05|T3.g.states-report-as-unrelated|PASS|states report as unrelated user must fail :: denied as expected: department report assignment required
AUDIT05|T3.g.states-report-cross-dept|PASS|states report as cross-department coordinator must fail :: denied as expected: department report assignment required
AUDIT05|T3.g.states-report-positive|PASS|states report as same-department coordinator :: completed
AUDIT05|T3.h.cross-user-isolation|PASS|unrelated user B receives zero of the pA actors' notifications :: invariant holds
AUDIT05|T3.h.recipient-positive|PASS|recipient (student 2) sees at least one pA notification of their own :: invariant holds
AUDIT05|T3.i.orphan-files-acl|PASS|list_graduation_project_orphan_files as role authenticated must fail 42501 :: denied as expected: 42501: permission denied for function list_graduation_project_orphan_files
AUDIT05|T3.i.scan-state-acl|PASS|set_graduation_project_file_scan_state as role authenticated must fail 42501 :: denied as expected: 42501: permission denied for function set_graduation_project_file_scan_state
AUDIT05|T3.j.bad-mime|PASS|disallowed MIME type must fail :: denied as expected: file media type not allowed
AUDIT05|T3.j.key-dotdot|PASS|object_key containing a dot-dot segment must fail :: denied as expected: file object key outside project scope
AUDIT05|T3.j.key-outside-scope|PASS|object_key outside graduation-projects/<project_id>/ must fail :: denied as expected: file object key outside project scope
AUDIT05|T3.j.oversize|PASS|byte_size above 50 MiB must fail :: denied as expected: file size exceeds limit
AUDIT05|T3.j.stage-binding|PASS|file_kind milestone_submission without a submission must fail :: denied as expected: file stage binding invalid
AUDIT05|T3.j.student-positive|PASS|student registers the final manuscript (becomes the clean final file) :: completed
AUDIT05|T3.j.supervisor-positive|PASS|supervisor registers an attachment :: completed
AUDIT05|T3.j.team-member|INFO|RECORD: second student (team member) registers an attachment :: RECORD: completed without error
AUDIT05|T3.j.unrelated|PASS|file registration as unrelated user must fail :: denied as expected: exact direct processing assignment required
AUDIT05|T3.k.save-as-supervisor|PASS|save_graduation_project_evaluation as supervisor must fail :: denied as expected: exact direct processing assignment required
AUDIT05|T3.k.save-positive|PASS|attached chair submits their evaluation :: completed
AUDIT05|T3.k.save-unattached-panel|PASS|save_graduation_project_evaluation as project panel_member NOT attached to the discussion must fail :: denied as expected: evaluation write precondition failed
AUDIT05|T3.l.finalize-as-coordinator|PASS|finalize_graduation_project_evaluation as coordinator must fail :: denied as expected: exact direct processing assignment required
AUDIT05|T3.l.finalize-as-student|PASS|finalize_graduation_project_evaluation as student must fail :: denied as expected: exact direct processing assignment required
AUDIT05|T3.l.finalize-as-unattached-panel|PASS|finalize another panel member's evaluation as an unattached panel_member must fail :: denied as expected: evaluator panel assignment mismatch
AUDIT05|T3.m.capacity-exceeded|PASS|assigning the same supervisor to a 2nd live project with capacity=1 must fail :: denied as expected: supervisor capacity reached
AUDIT05|T3.m.capacity-first|PASS|first supervision within supervisor_capacity=1 succeeds :: completed
AUDIT05|T3.m.cosup-denied|PASS|co_supervisor assignment with co_supervisor_allowed=false must fail :: denied as expected: co-supervisor not allowed by settings
AUDIT05|T3.m.cosup-positive|PASS|co_supervisor assignment with co_supervisor_allowed=true succeeds :: completed
AUDIT05|T3.m.team-max|PASS|adding a 2nd team member with team_max=1 must fail :: denied as expected: team size limit reached
AUDIT05|T3.m.window-closed|PASS|proposal submission outside the configured window must fail :: denied as expected: proposal window closed
AUDIT05|T3.m.window-positive|PASS|proposal submission with an open window succeeds :: completed
AUDIT05|T3.n.archive-nonclean-file|PASS|archive with a scan-pending (non-clean) final file must fail :: denied as expected: clean accepted final evidence and accepted corrections required
AUDIT05|T3.n.archive-pending-correction|PASS|archive with an unaccepted correction outstanding must fail :: denied as expected: clean accepted final evidence and accepted corrections required
AUDIT05|T3.n.archive-positive|PASS|head archives with the clean final file and correct version :: completed
AUDIT05|T3.n.archive-wrong-version|PASS|archive with a wrong expected_version must fail :: denied as expected: project not archive-ready
AUDIT05|T3.o.dedupe-events|PASS|replayed correlation_id produced no duplicate event rows :: invariant holds
AUDIT05|T3.o.dedupe-notifications|PASS|replayed correlation_id produced no duplicate notification rows :: invariant holds
AUDIT05|T3.o.replayed-write|INFO|RECORD: replayed add_graduation_project_team_member with the same correlation_id returns without re-writing :: RECORD: completed without error
AUDIT05|T3.p.direct-insert-acl|PASS|direct insert into graduation_projects as role authenticated must fail 42501 :: denied as expected: 42501: permission denied for table graduation_projects
AUDIT05|T3.p.direct-select-acl|PASS|direct select on graduation_projects as role authenticated must fail 42501 (RLS+grants default-deny) :: denied as expected: 42501: permission denied for table graduation_projects
AUDIT05|T3.q.first-submit|PASS|student submits proposal (version 1) — first attempt wins :: completed
AUDIT05|T3.q.stale-submit|PASS|second submit with stale version and a fresh correlation id must fail :: denied as expected: proposal transition precondition failed
```

## Recorded-behavior evidence (informational, verbatim)

- **(e2) coordinator ends department_head**:
  `T3.e.coord-ends-dept-head|INFO|RECORD: completed without error` and post-state
  `T3.e.ended-head-state|INFO|RECORD: false / 2026-08-01 03:09:45.413695+00`
  → the end succeeded: the department_head assignment is `active=false` with `ended_at` set.
  The ended head then failed a write RPC with `exact direct processing assignment required`
  (T3.e.ended-user-write PASS), and self-end raised `cannot end own assignment`
  (T3.e.self-end PASS).
- **(f) cross-supervisor note resolution**:
  `T3.f.resolve-other-supervisor|INFO|RECORD: completed without error`,
  `T3.f.note2-end-state|INFO|RECORD: 2026-08-01 03:09:45.413695+00`
  → the replacement supervisor resolved the previous supervisor's note (no ownership check).
- **(j) team member file registration**:
  `T3.j.team-member|INFO|RECORD: completed without error`
  → a second student (team member) can register files (role `student` is in the RPC allowlist).
- **(o) replayed write**:
  `T3.o.replayed-write|INFO|RECORD: completed without error` (in draft state) with
  T3.o.dedupe-events / T3.o.dedupe-notifications PASS — no duplicate rows.
- **(5) replay M2..M8**: see Part 1 item 5 detail above — M2..M6 fail cleanly with
  `refuse ambiguous retry` guards; M7 and M8 replay successfully (rc=0).

## Environment / cleanup

- Image `postgres:17`, container name `gp-audit05-<pid>`, `--rm` plus `trap cleanup EXIT`
  (force-removes the container and deletes `tests/graduation-projects/audit-05/tmp/`).
- `docker ps -a --filter name=gp-audit05` after the run: empty. `tmp/` absent.
- Databases used: a05s1, a05s2, a05s3, a05s4, a05full, a05s6a, a05s6b, a05cat, a05act —
  all destroyed with the container.
