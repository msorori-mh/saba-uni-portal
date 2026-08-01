# GRADUATION-PROJECTS — DATABASE OBJECTS AND MIGRATION PROMOTION

## 1. Database object inventory (post-M8, NOT_APPLIED)

- **Enums (2)**: `graduation_project_state` (14 values),
  `graduation_project_assignment_role` (7 values incl. `co_supervisor`).
- **Tables (19)**: `graduation_projects`, `_assignments`, `_approvals`,
  `_milestones`, `_submissions`, `_supervisor_notes`, `_files`,
  `_discussion_requests`, `_discussions`, `_panel_members`, `_evaluations`,
  `_evaluation_scores`, `_corrections`, `_final_archives`, `_events`,
  `_rubrics`, `_rubric_criteria`, `_notification_log`, `_settings`.
  All: RLS enabled, zero policies, grants revoked from anon/authenticated.
- **Views (1)**: `graduation_project_reporting` (security_invoker, revoked).
- **Triggers (3)**: assignment identity guard, events append-only, events
  notify fan-out.
- **Partial unique indexes (4)**: active assignment per (project, role, user);
  single active supervisor/co-supervisor per project; single pending
  discussion request per project; single panel chair per discussion.
- **Functions (~44)**: 25 write RPCs, 10 read/report RPCs, 5 privileged/service
  RPCs, triggers + predicates — every definer function pins
  `search_path=public,pg_temp` (catalog-audited).

## 2. Migration promotion map (sequential, forward-only)

| Order | File | Gate before apply | Gate after apply |
|---|---|---|---|
| M1 | `20260730100000_b1b476e7-…sql` | `pg17/preflight-01-foundation.sql` | `postgres-foundation-verifier.sql` |
| M2 | `20260730100001_96beebe1-…sql` | `pg17/preflight-02-lifecycle.sql` | `postgres-lifecycle-verifier.sql` |
| M3 | `20260730100002_c8f89b6d-…sql` | `pg17/preflight-03-co-supervisor-enum.sql` | (covered by M4 verifier) |
| M4 | `20260730100003_1811ed11-…sql` | `pg17/preflight-04-hardening.sql` | `postgres-hardening-verifier.sql` |
| M5 | `20260730100004_ff96c58a-…sql` | `pg17/preflight-05-files-notifications.sql` | `postgres-files-notifications-verifier.sql` |
| M6 | `20260730100005_a69a1dc9-…sql` | `pg17/preflight-06-admin-settings.sql` | `postgres-admin-settings-verifier.sql` |
| M7 | `20260730100006_b953bddf-…sql` | `pg17/preflight-07-evaluation-completeness.sql` | matrix + full regression re-run |
| M8 | `20260730100007_4f682b52-…sql` | `pg17/preflight-08-panel-completeness.sql` | E2E + audit + full regression re-run |

Full details (expected deltas, stop conditions):
`docs/migration-drafts/GRADUATION-PROJECTS-MIGRATION-PACKAGE-01.md`.
Local proof: `tests/graduation-projects/run-pg17-migration-package.sh`
(docker postgres:17) → `tests/graduation-projects/POSTGRES-17-MIGRATION-PACKAGE-VERIFICATION-RESULT.md`.

## 3. Sequential apply instructions (for the authorized operator only)

1. Take a logical backup; confirm the graduation_projects schema objects are absent.
2. Apply **one migration at a time**, in order M1→M8, each in its own
   transaction with `ON_ERROR_STOP`.
3. Before each migration: run its read-only preflight; stop on any failure.
4. After each migration: run its structural/post verifier on a staging clone
   first; only then proceed.
5. After M8: re-run the authorization matrix + E2E journeys on the staging
   clone (fail_rows must be 0).
6. Provision the first department bootstrap assignments (G4) manually with
   approved coordinator identities.

## 4. Production rollout checklist

- [ ] Migrations reviewed against this inventory (8 files, forward-only)
- [ ] Preflights pass on a production-clone snapshot
- [ ] Verifiers pass on staging after each step
- [ ] First bootstrap assignments recorded with ticket references
- [ ] Storage/bucket draft (separate authorization) scheduled if binary upload is wanted
- [ ] Notification scheduler (reminders) configured if wanted
- [ ] Portal feature monitoring: `list_my_graduation_projects` probe returns available

## 5. Rollback / stop conditions

Stop the promotion immediately and do not continue if:

1. Any preflight raises (unexpected existing objects → ambiguous state).
2. Any apply errors under ON_ERROR_STOP (the transaction aborts cleanly).
3. Any verifier reports `CHECK FAILED` / matrix fail_rows > 0.
4. Any table grant to `anon`/`authenticated`, any RLS policy, or any bucket appears.

Rollback per migration: because each migration runs in one transaction and the
chain is empty-schema-first, the safe rollback before cutover is to restore the
pre-M1 backup. There are no data migrations (data delta = 0 by design), so no
backfill rollback is needed.

## 6. Explicit statement

**ALL MIGRATIONS ARE NOT_APPLIED.** Migrations applied to production: 0.
Migrations applied to staging: 0. The only executions were inside disposable
local PostgreSQL 17 containers that were destroyed after verification.
