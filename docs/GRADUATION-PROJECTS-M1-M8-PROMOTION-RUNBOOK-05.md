# GRADUATION-PROJECTS M1–M8 — PROMOTION RUNBOOK (AUDIT-05)

Forward-only promotion procedure for the 8-migration graduation-projects
package. This runbook assumes the audit decision is PASS and a human operator
executes each step. **Nothing in this runbook has been applied by the audit;
all drafts remain NOT_APPLIED.**

## 0. Preconditions (all must hold — abort otherwise)

1. Audit decision `PASS_GRADUATION_PROJECTS_M1_M8_INDEPENDENT_MIGRATION_PACKAGE_READY_FOR_REVIEW`
   recorded in `docs/GRADUATION-PROJECTS-M1-M8-INDEPENDENT-OVERNIGHT-AUDIT-05-REPORT.md`.
2. The 8 drafts are byte-identical to the audited SHAs (record them:
   `git hash-object docs/migration-drafts/GRADUATION-PROJECTS-M*.NOT_APPLIED.sql`).
3. Target database contains **no** graduation-projects objects and **no**
   non-fixture graduation-projects data (manifest stop condition 5). Verify:
   `select to_regclass('public.graduation_projects');` → NULL, and none of the
   19 package tables exist.
4. Base schema present: `auth.users`, `auth.uid()`, `public.departments`,
   `programs`, `academic_years`, `semesters`, `student_profiles`,
   `faculty_profiles`; roles `anon`, `authenticated` (Supabase default),
   `service_role` (Supabase default; optional — M4/M5 grants to it are
   conditional).
5. Findings F-1..F-10 from `docs/GRADUATION-PROJECTS-M1-M8-SECURITY-AUDIT-05.md`
   acknowledged by the package owner (no HIGH; F-0 fixed during the audit;
   F-1/F-2 tracked for next revision).
6. A restorable backup/snapshot of the target database taken immediately before step 2.

## 1. Apply order and expected deltas

Strictly sequential, one migration at a time, each in its own session with
`psql -v ON_ERROR_STOP=on`. Never reorder, never parallelize, never wrap two
migrations in one transaction (M3's enum label must commit before M4 starts).

| Step | Migration (rename to `supabase/migrations/<k3 timestamp>_<uuid>.sql` at promotion time, or apply manually) | Expected delta |
|---|---|---|
| 1 | M1 FOUNDATION (20260730100000) | +2 enums, +15 tables, +1 view, +10 functions, +2 triggers, +1 index |
| 2 | M2 LIFECYCLE-COMPLETION (20260730100001) | +25 functions |
| 3 | M3 CO-SUPERVISOR-ENUM (20260730100002) | +1 enum label |
| 4 | M4 COMPLETION-HARDENING (20260730100003) | +3 tables, +3 partial unique indexes, +2 columns, +1 function, 4 replaced functions, 1 check replacement |
| 5 | M5 FILES-AND-NOTIFICATIONS (20260730100004) | +1 column, +1 trigger, +3 functions, register_file 8-arg→9-arg, 1 replaced function |
| 6 | M6 ADMIN-SETTINGS (20260730100005) | +1 table, +1 index, +6 functions, 3 replaced functions |
| 7 | M7 EVALUATION-COMPLETENESS (20260730100006) | 1 replaced function |
| 8 | M8 PANEL-COMPLETENESS (20260730100007) | 1 replaced function |

Per-step procedure:

1. Run the step's read-only preflight (`tests/graduation-projects/pg17/preflight-0N-*.sql`).
   If it raises — STOP (missing predecessor or ambiguous retry).
2. Apply the migration. If psql exits non-zero — STOP (transaction aborts
   atomically; nothing partial persists).
3. Run the step's verifier (all verifiers end in ROLLBACK; they are safe on a
   live database but will create+rollback fixture rows):
   - after M1: `postgres-foundation-verifier.sql`
   - after M2: `postgres-lifecycle-verifier.sql`
   - after M4: re-run foundation + lifecycle, then `postgres-hardening-verifier.sql`
   - after M5: re-run all prior, then `postgres-files-notifications-verifier.sql`
   - after M6: re-run all prior, then `postgres-admin-settings-verifier.sql`
   - after M7: re-run all prior, then `postgres-authorization-matrix-verifier.sql`
   - after M8: re-run all prior, then `postgres-e2e-journeys-verifier.sql` and
     `postgres-security-audit-verifier.sql`
   The full reference sequence is executable locally via
   `tests/graduation-projects/run-pg17-migration-package.sh` (disposable
   docker postgres:17) — run it against the exact promoted SHAs before touching
   any shared environment.
4. Run the audit-05 negative suite
   (`tests/graduation-projects/audit-05/run-audit-05.sh`) locally if any draft
   byte changed since the audit.

## 2. Stop conditions (any → halt, do not continue the chain)

1. Any preflight raises (missing predecessor, or objects already present → ambiguous retry).
2. psql exits non-zero with ON_ERROR_STOP during an apply.
3. Any verifier raises CHECK FAILED / unexpected error.
4. Any migration would grant table privileges to anon/authenticated, add an
   RLS policy, or create a bucket/public URL (none may ever appear).
5. The target contains non-fixture graduation-projects data.

## 3. Rollback-by-forward (remediation strategy)

The package is forward-only: no down-migrations exist and none may be created
by editing applied history. Remediation paths, in order of preference:

1. **Before any data exists** (promotion just failed at step N): the failed
   migration rolled back atomically. Objects from steps 1..N-1 remain. Because
   every migration is replay-guarded, re-running the chain after fixing the
   cause will hard-fail at the first already-applied migration's preflight —
   that is the designed signal, not an error to work around. To start over on
   an empty schema, drop the package objects in reverse dependency order
   (M6/M4 tables → M1 tables → enums → functions) with a reviewed, separate
   cleanup script; do not improvise one during an incident.
2. **Defect discovered after apply, before traffic**: same as 1.
3. **Defect discovered with live data**: fix forward with a new migration
   (M9+) that CREATE OR REPLACEs the defective function or adds the missing
   guard; never edit M1–M8 retroactively. The function-replacement chain
   (M4/M5/M6/M7/M8) is the established pattern.
4. **Point-in-time recovery**: if remediation is impossible forward, restore
   the step-0.6 snapshot. This is the only scenario that touches history, and
   it requires declaring the applied package void.

Known forward-fix queue already identified by the audit (not blockers):
F-1 end-assignment rank guard, F-2 settings/rubric audit trail, F-3 in-body
service-claim check, F-4 rubric binding for scores, F-5 detail-payload
minimization, F-8 dead reporting view, F-9 supervisor-note ownership check.

Note on steps 7–8 (F-10): M7/M8 are single idempotent CREATE OR REPLACE
migrations; a duplicate apply exits 0 instead of raising an ambiguous-retry
error. Scripts built around the "preflight raises → STOP" signal must
special-case these two steps.

## 4. Post-promotion verification checklist

- [ ] All 19 tables present, RLS enabled, zero policies
      (`select relname, relrowsecurity from pg_class where relname like 'graduation_project%'`).
- [ ] Zero table grants to anon/authenticated/public on package tables.
- [ ] Every package function: definer functions have `proconfig` search_path
      pinned; no EXECUTE to PUBLIC/anon.
- [ ] `co_supervisor` present in `pg_enum`.
- [ ] 3 partial unique indexes (M4) + settings dept/year index (M6) present.
- [ ] Trigger `graduation_project_events_notify` enabled on events;
      `graduation_project_events_append_only` rejects UPDATE/DELETE.
- [ ] No storage buckets/objects referencing `graduation-projects/`.
- [ ] Smoke: one full lifecycle journey through the RPCs as fixture actors in
      a transaction, then ROLLBACK (mirror of `postgres-e2e-journeys-verifier.sql`).

## 5. Operational notes

- Bootstrap of `department_head`/`dean` project assignments is deliberately
  not RPC-reachable (`faculty assignment role denied`); perform it as a
  separately reviewed privileged step after promotion.
- The file scanner integration calls `set_graduation_project_file_scan_state`
  as `service_role`; there is no app-role path. Orphan-file review is
  `list_graduation_project_orphan_files` (service_role, review-only).
- Idempotent client retries are safe: every write RPC replays on
  `(project_id, correlation_id, event_type)` and returns the recorded entity.
- Notification delivery is the notification_log table only (dedupe-keyed);
  no e-mail/push side effects exist in this package.
