# GRADUATION-PROJECTS M1–M8 — INDEPENDENT SECURITY AUDIT (AUDIT-05)

Scope: the 8 NOT_APPLIED drafts `docs/migration-drafts/GRADUATION-PROJECTS-M1-…-M8-….NOT_APPLIED.sql`.
Method: full-text adversarial review of every object + runtime proof in
disposable PostgreSQL 17 (docker `postgres:17`, minimal base schema
`tests/graduation-projects/postgres-minimal-schema.sql`, full M1→M8 chain).
Runtime evidence: `tests/graduation-projects/audit-05/AUDIT-05-RUNTIME-RESULTS.md`
plus the pre-existing harness `tests/graduation-projects/run-pg17-migration-package.sh`
(68-row authorization matrix, 53-step E2E, catalog invariants — all PASS).

Verdict summary: the package is genuinely deny-by-default, has no actor
spoofing path, no admin/dean/registrar bypass, pinned search_path on every
SECURITY DEFINER function, no dynamic SQL, and a clean grant surface.
Findings F-1..F-8 below are the residual risks; none blocks review (see
§9 Disposition).

## 1. Actor spoofing review (every RPC input)

No spoofing path found. Every RPC derives the actor exclusively from
`auth.uid()`; every audit/event write uses `auth.uid()` or the server-resolved
assignment row. The central helper (M1):

```sql
select * into a from public.graduation_project_assignments x
 where x.project_id = p_project_id and x.user_id = auth.uid()
   and x.active and x.ended_at is null and x.role = any(p_roles)
   and x.processing_unit_id = x.department_id and x.processing_role = x.role;
```

Client-supplied identity parameters that exist, and why they are safe:

- `add_graduation_project_team_member(p_student_profile_id, p_student_user_id, …)`
  — the user id is the *subject*, not the actor. Trigger
  `guard_graduation_project_assignment` (M1) forces the profile's
  `user_id`/`department_id` to equal the inserted row's, else
  `assignment identity/department mismatch`. The CHECK
  `assignment_subject_shape` makes the trigger's unguarded branch unreachable.
- `assign_graduation_project_faculty(p_faculty_profile_id, p_user_id, …)` —
  same trigger; `department_id` is forced to the project's department by the
  RPC body, and the trigger requires profile/department equality.
- `create_graduation_project` self-propagates the caller
  (`values(…, auth.uid(), …)`); no client identity accepted.
- No function accepts an `actor`/`assigned_by`/`on_behalf_of` parameter.
- INFO: the assignment guard fires only on INSERT/UPDATE of the assignment
  row; a later change to `student_profiles.user_id`/`department_id` does not
  re-validate existing assignments.

## 2. Authorization model (per write RPC)

All checks are per-project direct assignments via
`require_graduation_project_assignment` (or an equivalent inline lookup).
Anonymous, unrelated users, student non-owners, unrelated faculty,
wrong-department heads and unrelated panel members are denied everywhere —
there is no institutional-role shortcut. `assign_graduation_project_faculty`
explicitly refuses to create `department_head`/`dean` assignments
(`faculty assignment role denied`, M6); bootstrap of those roles is a
separately privileged step.

| RPC | Allowed actor(s) | Key preconditions |
|---|---|---|
| create_graduation_project | coordinator / dept head of the dept (assignment on any existing project of that dept) | title shape |
| submit_graduation_project_proposal | student owner | state=draft, version, M6 window + team_min |
| review_graduation_project_proposal | coordinator / dept head | literal actions only, version |
| resubmit_graduation_project_proposal | student owner | state=revision_required |
| activate_graduation_project | coordinator / dept head | state=approved |
| add_graduation_project_team_member | coordinator / dept head | state draft/revision_required, M6 team_max |
| assign_graduation_project_faculty | coordinator / dept head | role whitelist (supervisor, co_supervisor, coordinator, panel_member), slot guard, M6 capacity + co-sup rule |
| end_graduation_project_assignment | coordinator / dept head | cannot end own — **see F-1** |
| set_graduation_project_milestone | supervisor / coordinator | state approved/active |
| submit_graduation_project_deliverable | student (owner/team) | state=active, milestone open |
| review_graduation_project_submission | supervisor only (not co_supervisor) | submission state=submitted, same project |
| add_/resolve_graduation_project_supervisor_note | supervisor only | — |
| register_graduation_project_file | student / supervisor | key scope, MIME allowlist, 50 MiB, file_kind stage binding |
| request_graduation_project_discussion | student / supervisor | readiness predicate, single pending request |
| schedule_/reject_…discussion | coordinator / dept head | pending request |
| assign_graduation_project_panel_member | coordinator / dept head | target = active panel_member assignment of same project |
| record_graduation_project_discussion_outcome | coordinator / dept head | M8: held requires ≥1 panel member + chair |
| save_graduation_project_evaluation | panel_member attached to that discussion (own panel row) | score shape/magnitude |
| finalize_graduation_project_evaluation | panel_member, own evaluation only | discussion held, project evaluating, state=submitted |
| conclude_graduation_project_result | dept head / dean (direct assignment) | M7: every panel member of held discussion finalized |
| complete_graduation_project_correction | student owner | state=corrections_required |
| accept_graduation_project_correction | dept head / dean | — |
| archive_graduation_project | dept head / dean (direct assignment) | state=completed, version, clean accepted final evidence, zero unaccepted corrections |
| upsert_graduation_project_settings / upsert_graduation_project_rubric | dept head / dean of that department | input validation |
| set_graduation_project_file_scan_state | service_role only (ACL; no app grant) | one-way pending→clean/quarantined/rejected |

## 3. SECURITY DEFINER audit

- Every SECURITY DEFINER function in M1–M8 has `set search_path = public, pg_temp`
  pinned and schema-qualifies all object references (`public.`, `auth.uid()`).
- No dynamic SQL with user input: the only `execute` occurrences are literal
  grant strings inside `DO` blocks (M4/M5 conditional service_role grants) and
  trigger syntax.
- Ownership: functions/tables are owned by the applying role; RLS is enabled
  but not FORCED — deliberate, because definer RPCs are the only write path
  and the owner bypasses RLS. Default-deny for app roles comes from zero
  table grants + zero policies, not from FORCE.
- Two trigger functions (`guard_graduation_project_assignment`,
  `reject_graduation_project_event_mutation`) carry no grant statements; they
  are not directly callable surfaces (trigger-only) but retain the default
  PUBLIC EXECUTE grant as plain invoker functions that take no arguments and
  only raise/validate — no exploitable surface (calling them directly raises
  or is a no-op outside trigger context; recorded as INFO).

## 4. Grants

- Tables: blanket `revoke all … from anon, authenticated` (M1, M4, M6). No
  table GRANT to any app role anywhere.
- Functions: every RPC `revoke all … from public, anon` (kills the default
  PUBLIC EXECUTE) then narrow `grant execute … to authenticated`. Internal /
  service functions revoked from all three:
  `require_graduation_project_assignment` (M1),
  `graduation_project_is_discussion_ready` (M1),
  `graduation_project_settings_for` (M6),
  `set_graduation_project_file_scan_state` (M4, conditional service_role grant),
  `list_graduation_project_orphan_files` (M5, conditional service_role grant).
- No PUBLIC grant exists **after the audit fix**: the first audit-05 runtime
  pass found three trigger functions (`guard_graduation_project_assignment`,
  `reject_graduation_project_event_mutation` — M1;
  `graduation_project_notify_from_event` — M5) still carrying the default
  PUBLIC EXECUTE (`proacl` NULL). The audit added explicit
  `revoke all … from public, anon, authenticated` for all three to the drafts
  (the only draft edits made; see §8 F-0) and re-verified: audit-05 catalog
  check C2.5 now PASS, grant surface = `authenticated` + owner only.
- EXECUTE grants match intended callers (`authenticated` only); the
  in-function assignment checks do the real authorization.
- `graduation_project_reporting` view revoked from public/anon/authenticated
  — dead surface, unusable by every app role (INFO; see F-8).

## 5. RLS

All 19 tables (15 M1 + 3 M4 + 1 M6) have `enable row level security` and zero
policies → for non-owners default-deny is real. Combined with §4 (no table
grants), an app role cannot touch any table directly even before RLS is
consulted. Runtime proof: as `authenticated`, direct SELECT/INSERT on
`public.graduation_projects` fails with permission denied (audit-05 part 3-p).

## 6. PII / storage

- Attachments: no bucket, no storage objects, no public URLs anywhere.
  Metadata-only registration with enforced path scope
  `graduation-projects/<project_id>/%`, rejection of `..` and `http%`, MIME
  allowlist of 8 types, 50 MiB cap, sha256 format check, file_kind taxonomy +
  stage binding. `object_key` is hidden until `scan_state='clean'` in the read
  surface. Scan decisions are one-way and audited on the file row
  (`scan_decided_at`, `scan_correlation_id`) because the scanner holds no
  auth.users identity. INFO: MIME is client-declared; content sniffing is
  deferred to the (future) binary pipeline by design.
- Notifications: fan-out recipients = active direct assignments of the same
  project only, actor excluded; payload = type + entity ids only, no PII.
  Read path filters `recipient_user_id = auth.uid()`. INFO:
  `correction_completed` notifies supervisor/department_head/dean but not
  co_supervisor.
- Reports: states/assignments/evaluations/archive/defense reports are gated
  on coordinator/department_head/dean assignment on some project of the
  department; they expose project titles, supervisor user_ids and score
  aggregates to department-level staff — documented design. LOW: a
  coordinator of one project reads department-wide data.
- QR / public verification: no such surface exists in the package; nothing
  leaks; feature absent (INFO).

## 7. Broad bypass check

Case-insensitive sweep for `is_admin|is_dean|is_registrar|bypass|current_setting`
across all 8 files: zero authorization shortcuts. `current_setting` appears
only inside the minimal-schema `auth.uid()` shim. Dean/department_head powers
flow only through per-project direct assignments (e.g. M1 archive, M7
conclude, M6 settings). Compliant with the no-bypass rule.

## 8. Findings (severity-ranked)

- **F-0 LOW — FIXED BY THIS AUDIT: trigger functions kept default PUBLIC
  EXECUTE.** First runtime pass (audit-05 C2.5 FAIL):
  `guard_graduation_project_assignment->PUBLIC,
  reject_graduation_project_event_mutation->PUBLIC,
  graduation_project_notify_from_event->PUBLIC`. Impact was low (trigger-only
  helpers; outside trigger context they raise or no-op), but it violated the
  package's own no-PUBLIC-grant standard. Fixed in the drafts (M1/M5 explicit
  revokes — the only draft edits of this audit) and re-verified: audit-05
  `PASS (158 checks, 0 unexpected)`, package harness
  `MIGRATION PACKAGE PG17 VERIFICATION PASS`, bun 155/155, tsc clean.

- **F-1 MEDIUM — REMEDIATED IN M9 (remediation-06).** Was: a coordinator
  could end the assignment of the project's department_head or dean (only
  self-end was excluded). Runtime evidence pre-fix (verbatim):
  `T3.e.coord-ends-dept-head|INFO|RECORD: completed without error`, post-state
  `active=false, ended_at set`. Fix (M9, `end_graduation_project_assignment`
  CREATE OR REPLACE): an authority rank derived from existing assignment-role
  semantics (dean 60 > department_head 50 > coordinator 40 >
  supervisor/co_supervisor 30 > panel_member 20 > student 10; unknown → 0
  fail-closed) with a strictly-greater requirement —
  `assignment termination authority denied`. The actor whitelist is unchanged
  (coordinator/department_head; dean NOT added — no bypass). Rank is checked
  before the already-ended no-op return, so stale higher/same-rank attempts
  also deny. Verified by the audit-06 F-1 rank matrix (21 cases incl.
  same-rank cross-actor, wrong-department, unrelated, anonymous, stale,
  replay, zero-mutation-on-rejection).

- **F-2 MEDIUM — REMEDIATED IN M9 (remediation-06).** Was: settings/rubric
  mutations wrote no audit event and `p_correlation_id` was unused. Runtime
  evidence pre-fix (verbatim, disposable PG17): both upserts succeeded and
  `events_after_settings_rubric_upserts=0`,
  `events_with_correlation_c1=0`. Fix (M9): the canonical mechanism
  (`graduation_project_events`) was extended — not duplicated — with a
  nullable `department_id` scope, an exactly-one-scope CHECK and a partial
  unique dedupe key `(department_id, correlation_id, event_type) where
  project_id is null`. Both upserts now require a non-null correlation id,
  replay faithfully (return the recorded entity id, no duplicate write), and
  append exactly one department-scoped event per successful mutation with
  actor, operation, target, before/after non-PII scalars and correlation id.
  Rejections raise before any write: zero mutation, zero event. Append-only
  enforcement covers the new rows (audit-06 F-2 matrix, 21 cases).

- **F-3 LOW — product-decision-dependent; intentionally unchanged (left
  fail-closed).** `set_graduation_project_file_scan_state` has zero in-body
  authorization; protection rests entirely on the EXECUTE ACL (service_role
  only; 42501 proven for `authenticated`). How the future scanner
  authenticates (JWT claim shape) is an integration decision not yet made;
  hard-coding a claim check now could conflict with it. Current state is
  fail-closed at the ACL layer and re-verified in audit-06.

- **F-4 LOW — product-decision-dependent; intentionally unchanged.**
  `save_graduation_project_evaluation` validates only shape/magnitude of
  client-supplied criterion codes and maximums; `rubric_version` is free text
  with no FK to `graduation_project_rubrics`. Binding scores to administered
  rubrics changes the panel scoring contract (which rubric version is
  authoritative per discussion is a product decision). Shape/magnitude
  validation stays as the fail-closed floor.

- **F-5 LOW — product-decision-dependent; intentionally unchanged.**
  `get_graduation_project_detail` exposes the full event log, supervisor
  notes, assignment user_ids and finalized evaluations to every assigned
  role. Minimizing the payload changes the authenticated read contract the UI
  consumes; which fields are need-to-know per role is a product decision.
  Surface stays authenticated-participant-only (assignment-gated).

- **F-6 LOW — REMEDIATED IN M9.** `create_graduation_project`'s replay
  lookup is now department-scoped (joins `graduation_projects` and filters
  `p.department_id = p_department_id`): a correlation-id collision can no
  longer return another department's project id; the caller's own faithful
  replay still returns its recorded id. Verified in audit-06 part 5.

- **F-7 LOW — REMEDIATED IN M9.** `add_graduation_project_team_member` now
  replays before state gates (same ordering as the documented
  `assign_graduation_project_faculty` LOW-3 fix): a faithful retry returns
  the recorded assignment id even after the project moved on; genuinely new
  calls in the wrong state still raise `team mutation state denied`.
  (`submit_graduation_project_proposal` was already replay-first since M6.)
  Verified in audit-06 part 5.

- **F-8 INFO — dead/unverified surface.** `graduation_project_reporting` view
  is revoked from everyone despite `security_invoker=true`; the pre-existing
  catalog verifier asserted only that the view exists, not the invoker option.
  Audit-05 C2.9 confirms `reloptions` does contain `security_invoker=true`.

- **F-9 LOW — REMEDIATED IN M9.** `resolve_graduation_project_supervisor_note`
  now requires the authoring supervisor assignment
  (`note ownership required`). Pre-fix evidence (verbatim):
  `T3.f.resolve-other-supervisor|INFO|RECORD: completed without error`.
  Post-fix: cross-supervisor resolution denied with zero mutation;
  owning-supervisor resolution and student denial unchanged (audit-06
  part 5). Supervisor handover now requires the new supervisor to author
  their own notes — fail-closed.

- **F-10 INFO — M7/M8 (and preflights 07/08) tolerate replay by design.**
  Both are single idempotent CREATE OR REPLACE bodies with predecessor-only
  preflights; re-apply exits rc=0. Recorded verbatim (`P1.5.replay-M7`,
  `P1.5.replay-M8`, `P1.7.preflight-07-replay`, `P1.7.preflight-08-replay`).
  This is safe (byte-identical replacement) but differs from M1–M6's
  hard-fail-on-replay contract; operators scripting around the
  ambiguous-retry stop condition should special-case steps 7–8.

## 9. Runtime coverage added by this audit (gaps closed)

The pre-existing verifiers left these attack paths untested; audit-05
exercises them at runtime (results in
`tests/graduation-projects/audit-05/AUDIT-05-RUNTIME-RESULTS.md`):

- reject_graduation_project_discussion_request (positive + 3 negatives)
- review_graduation_project_submission (supervisor positive; co_supervisor,
  student, cross-project negatives)
- resubmit_graduation_project_proposal, activate_graduation_project
  (positive + wrong-state + wrong-role negatives)
- end_graduation_project_assignment: self-end denial, **F-1 evidence**,
  ended-assignment-loses-access
- resolve_graduation_project_supervisor_note (owner positive, cross-supervisor
  behavior recorded, student negative)
- All 5 department report RPCs: student/unrelated/cross-dept negatives,
  same-dept positive
- list_my_graduation_project_notifications recipient scoping
- list_graduation_project_orphan_files and set_graduation_project_file_scan_state
  ACL as `authenticated` (42501)
- register_graduation_project_file policy: MIME, >50 MiB, key scope, `..`,
  file_kind stage binding, final-manuscript rule, supervisor positive,
  team-member behavior
- save_graduation_project_evaluation by panel member not attached to the
  discussion (must fail); finalize by student/coordinator/unrelated panel
  member (must fail)
- M6 settings enforcement: team_max, team_min, proposal window, supervisor
  capacity, co_supervisor rule
- archive negatives: non-clean file, unaccepted correction, wrong version
- notification dedupe on replayed correlation_id
- direct table access as `authenticated` (permission denied proof)
- optimistic concurrency: stale-version submit must fail

## 10. Disposition (updated by remediation-06)

No HIGH findings. F-0 (LOW) was fixed in the drafts during audit-05.
**F-1 and F-2 (MEDIUM) and F-6, F-7, F-9 (LOW) are remediated by the new
forward-only draft
`docs/migration-drafts/GRADUATION-PROJECTS-M9-AUDIT-REMEDIATION-06.NOT_APPLIED.sql`
and verified by the audit-06 runtime matrices.**
F-3, F-4, F-5 (LOW) are product-decision-dependent and intentionally
unchanged — each is fail-closed at its current layer (ACL-only service path /
shape-validated scoring / assignment-gated authenticated read) and needs a
product decision before any contract change. F-8, F-10 INFO.
See `docs/GRADUATION-PROJECTS-M1-M8-AUDIT-FINDINGS-REMEDIATION-06-REPORT.md`.
