# GRADUATION-PROJECTS — MIGRATION PACKAGE 01 (FORWARD-ONLY, NOT_APPLIED)

Sequential apply manifest for the packaged graduation-projects migrations.
Every migration is forward-only, guarded against ambiguous retries, and has a
read-only preflight plus a disposable-PG17 verifier. **No migration in this
package has been applied to production or staging (MIGRATIONS_APPLIED=0).**

Local evidence: `tests/graduation-projects/run-pg17-migration-package.sh`
(docker postgres:17, ON_ERROR_STOP, one migration at a time, verifiers end in
ROLLBACK) → `tests/graduation-projects/POSTGRES-17-MIGRATION-PACKAGE-VERIFICATION-RESULT.md`.

## Apply order

| # | Migration | Contents | Preflight (read-only) | Verifier(s) |
|---|---|---|---|---|
| M1 | `supabase/migrations/20260730100000_b1b476e7-0c92-42cf-80e3-925d7941d780.sql` | Foundation: 2 enums, 15 tables, RLS deny-by-default, triggers, readiness predicate, reporting view, 6 RPCs | `tests/graduation-projects/pg17/preflight-01-foundation.sql` | `tests/graduation-projects/postgres-foundation-verifier.sql` |
| M2 | `supabase/migrations/20260730100001_96beebe1-d809-4302-a782-c2f6483e102a.sql` | Lifecycle completion: 19 write RPCs + 6 read/report RPCs, literal actions, optimistic concurrency | `tests/graduation-projects/pg17/preflight-02-lifecycle.sql` | `tests/graduation-projects/postgres-lifecycle-verifier.sql` |
| M3 | `supabase/migrations/20260730100002_c8f89b6d-6521-4597-97bc-aae0b837023f.sql` | `co_supervisor` enum value (isolated: a new enum label cannot be used inside its own transaction) | `tests/graduation-projects/pg17/preflight-03-co-supervisor-enum.sql` | covered by M4 verifier + post-verifier checks |
| M4 | `supabase/migrations/20260730100003_1811ed11-afad-4cbc-8f8a-287ba5b13a19.sql` | Completion hardening: co-supervisor activation, exactly-one indexes, guarded messages, scan-state RPC + audit columns, rubric tables, notification dedupe log | `tests/graduation-projects/pg17/preflight-04-hardening.sql` | `tests/graduation-projects/postgres-hardening-verifier.sql` + foundation/lifecycle re-run |
| M5 | `supabase/migrations/20260730100004_ff96c58a-8c93-4abe-9d0f-f0f44fe25a11.sql` | Files & notifications: attachment policy (MIME allowlist, 50 MiB cap, `file_kind` stage binding), notification fan-out trigger with dedupe, own-notifications read RPC, orphan-file review RPC | `tests/graduation-projects/pg17/preflight-05-files-notifications.sql` | `tests/graduation-projects/postgres-files-notifications-verifier.sql` + all prior verifiers re-run |
| M6 | `supabase/migrations/20260730100005_a69a1dc9-8b9f-4dfc-a5e8-69a335909c8b.sql` | Admin settings (team size, supervisor capacity, co-supervisor rule, windows) with in-RPC enforcement, rubric management RPCs, defense report RPC | `tests/graduation-projects/pg17/preflight-06-admin-settings.sql` | `tests/graduation-projects/postgres-admin-settings-verifier.sql` + all prior verifiers re-run |
| M7 | `supabase/migrations/20260730100006_b953bddf-de2d-43f6-9d3d-10755d8a9da6.sql` | Evaluation completeness: result conclusion requires every panel member of the held discussion finalized (GP-07 High finding) | `tests/graduation-projects/pg17/preflight-07-evaluation-completeness.sql` | `tests/graduation-projects/postgres-authorization-matrix-verifier.sql` (68 rows) + all prior verifiers re-run |
| M8 | `supabase/migrations/20260730100007_4f682b52-7e51-486d-ad02-4d886d2331ec.sql` | Panel completeness: the `held` outcome requires ≥1 panel member and an assigned chair (GP-08 journey 11) | `tests/graduation-projects/pg17/preflight-08-panel-completeness.sql` | `tests/graduation-projects/postgres-e2e-journeys-verifier.sql` (53 steps) + all prior verifiers re-run |

## Expected object/data deltas

- **M1**: +2 enum types, +15 tables, +1 view, +7 functions, +2 triggers, +1 unique index; 0 data rows.
- **M2**: +25 functions (19 write, 6 read/report); 0 tables; 0 data rows.
- **M3**: +1 enum label (`co_supervisor`); 0 data rows.
- **M4**: +3 tables (`graduation_project_rubrics`, `_rubric_criteria`, `_notification_log`), +3 partial unique indexes, +2 columns on `graduation_project_files` (`scan_decided_at`, `scan_correlation_id`), +1 function (`set_graduation_project_file_scan_state`), 4 `create or replace` functions (`assign_graduation_project_faculty`, `request_graduation_project_discussion`, `assign_graduation_project_panel_member`, `get_graduation_project_detail` — signatures and grants unchanged), 1 check-constraint replacement (`assignment_subject_shape` widened for `co_supervisor`); 0 data rows.
- **M5**: +1 column (`graduation_project_files.file_kind`), +1 trigger (`graduation_project_events_notify`), +3 functions (`graduation_project_notify_from_event`, `list_my_graduation_project_notifications`, `list_graduation_project_orphan_files`), 1 function replacement (`register_graduation_project_file` — 9th parameter `p_file_kind` defaulted; 8-arg calls keep working), 1 `create or replace` (`get_graduation_project_detail` adds `file_kind` to the payload); 0 data rows.
- **M6**: +1 table (`graduation_project_settings`, RLS deny-by-default, `nulls not distinct` department+year key), +6 functions (`graduation_project_settings_for` internal, `upsert_/get_graduation_project_settings`, `upsert_graduation_project_rubric`, `list_graduation_project_rubrics`, `get_graduation_project_defense_report`), 3 `create or replace` enforcement upgrades (`add_graduation_project_team_member` team_max, `submit_graduation_project_proposal` window + team_min, `assign_graduation_project_faculty` capacity + co-supervisor rule); 0 data rows.
- **M7**: 1 `create or replace` (`conclude_graduation_project_result` — adds the panel-completeness guard; signature, grants, literals unchanged); 0 data rows.
- **M8**: 1 `create or replace` (`record_graduation_project_discussion_outcome` — adds the `panel incomplete for defense` guard on `held`; signature, grants, literals unchanged); 0 data rows.

## Stop conditions (per migration)

Stop the apply chain and do NOT continue if any of these holds:

1. The preflight raises (missing predecessor objects, or objects already present → ambiguous retry).
2. `psql` exits non-zero with ON_ERROR_STOP during the apply.
3. The structural/post verifier raises any `CHECK FAILED` / unexpected error.
4. The migration grants any table privilege to `anon`/`authenticated`, adds an RLS policy, or creates a bucket/public URL (none may ever appear).
5. The target database contains non-fixture graduation-projects data (this package is verified empty-schema-first; promoting onto an existing partially-applied schema requires a new reviewed package).

## Behavioral notes

- `request_graduation_project_discussion` keeps the merged message precedence: readiness is checked before the new pending-request guard, so the foundation contract (`discussion readiness failed` on a non-ready project) is unchanged; `discussion request already pending` only fires for the privileged-insert edge the new unique index also covers.
- `set_graduation_project_file_scan_state` is revoked from `public/anon/authenticated`; a conditional grant to `service_role` applies only where that role exists. The scanner holds no `auth.users` identity, so decisions are audited on the file row (`scan_decided_at`, `scan_correlation_id`), not in the events log.
- `co_supervisor` is read-only by contract: staff-level read visibility, zero write-RPC whitelist entries.
