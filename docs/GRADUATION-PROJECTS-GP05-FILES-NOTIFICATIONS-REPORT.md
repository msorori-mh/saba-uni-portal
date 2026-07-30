# GRADUATION-PROJECTS — GP-05 FILES AND NOTIFICATIONS REPORT

- Phase: GP-05
- Date: 2026-07-30
- Branch: `k3/graduation-projects-completion`
- Base SHA: `83f145d976c2f84fe462fcb703b7fbef735f2d61` (GP-04 commit)
- Migrations created: 1 (M5) — Migrations applied: 0 (disposable local PG17 only) — Production operations: 0
- Decision: `PASS_GRADUATION_PROJECTS_GP05_FILES_AND_NOTIFICATIONS_COMPLETE`

---

## 1. Files / attachments contract (M5 — `20260730100004_...`)

- **Allowed MIME types** (SQL-enforced): pdf, zip, png, jpeg, text/plain, docx, pptx — anything else → `file media type not allowed`.
- **Size limit**: 50 MiB cap in the RPC (the portal schema already capped at 50 MB; SQL is now the authority) → `file size exceeds limit`.
- **Stage binding**: new `file_kind` column (10 kinds: proposal, milestone_submission, supervisor_feedback, final_manuscript, presentation, source_archive, defense_minutes, correction_version, archived_final, attachment). `milestone_submission`/`supervisor_feedback` require a submission; `final_manuscript` must attach to a **final** milestone submission.
- **Path/object-key ownership**: unchanged contract — `graduation-projects/<project_id>/<token>-<name>`, server-built token, `..`/URL rejection.
- **Upload window**: registration only in `active`/`corrections_required` (post-close uploads denied at the RPC; verified by the lifecycle verifier).
- **Download authorization**: object keys surface only for `scan_state='clean'` files and only to direct assignees via the detail RPC; students get keys redacted by the portal privacy layer. Signed-URL strategy documented: no bucket exists yet — the separately authorized storage draft must mint short-lived signed URLs server-side per clean object key; this package never constructs public URLs.
- **Scan state**: one-way service-path RPC (GP-02) + `scan_decided_at`/`scan_correlation_id` audit.
- **Orphan cleanup contract**: `list_graduation_project_orphan_files()` (service-role only) flags `scan_pending_expired` (>30 days) and `unlinked_terminal` files; deletion stays a privileged, separately authorized batch — this package never deletes.
- **No public bucket / no client-wide listing**: preserved; verified by structure checks.

Compatibility: `register_graduation_project_file` keeps one identity — the 9th
parameter `p_file_kind` is defaulted, so 8-arg callers keep working (verified in PG17).

## 2. Notifications contract (M5)

- Fan-out trigger `graduation_project_events_notify` on the append-only event log; `notification_type` reuses the audited event vocabulary (one Arabic label set).
- 15 mapped event families → recipients resolved from the project's active direct assignments only (students / supervisors+co / managers / result authority / panel), single-recipient events for team/faculty/panel/discussion-request subjects. The actor never notifies themselves; unmapped events (e.g. `file_registered`) stay silent by design.
- **Dedupe**: `unique(project_id, recipient_user_id, notification_type, entity_id)` + `ON CONFLICT DO NOTHING` — replays and double submissions cannot duplicate notifications.
- Read path: `list_my_graduation_project_notifications()` (own rows only, `auth.uid()`), granted to `authenticated`; the log table stays revoked/RLS-deny.
- Reminder-type notifications (milestone due, evaluation incomplete) are scheduled-job contracts on top of this log — documented for rollout, not faked by fixtures.

## 3. Client surface

- `registerFile` sends `p_file_kind`; portal schema validates the literal enum; `MilestonesPanel` has a labeled kind selector.
- `listMyNotifications` wrapper + `listMyGraduationProjectNotifications` server fn.
- `FILE_KIND_LABELS` for all 10 kinds; 5 new `ERROR_LABELS`.

## 4. Test results

| Suite | Result |
|---|---|
| PG17 migration package (5 migrations, sequential) | PASS incl. new `postgres-files-notifications-verifier.sql` |
| `bun test tests/graduation-projects` | 126 pass / 0 fail (1043 expects; +9 new) |
| `bunx tsc --noEmit` | clean |
| `git diff --check` | clean |

## 5. Files changed

- `supabase/migrations/20260730100004_ff96c58a-8c93-4abe-9d0f-f0f44fe25a11.sql` (new)
- `tests/graduation-projects/pg17/preflight-05-files-notifications.sql` (new)
- `tests/graduation-projects/postgres-files-notifications-verifier.sql` (new)
- `tests/graduation-projects/run-pg17-migration-package.sh` (M5 leg)
- `tests/graduation-projects/graduation-projects-files-notifications.test.ts` (new)
- `src/lib/graduation-projects/{rpc,lifecycle,portal.functions}.ts`, `src/components/graduation-projects/{MilestonesPanel,GraduationProjectPortalWorkspace}.tsx`
- `docs/migration-drafts/GRADUATION-PROJECTS-MIGRATION-PACKAGE-01.md`, `tests/graduation-projects/POSTGRES-17-MIGRATION-PACKAGE-VERIFICATION-RESULT.md` (updated)

## 6. Assumptions / risks / blockers

- Binary upload remains disabled pending the separately authorized storage/bucket draft (unchanged prior decision).
- Reminder notifications need a scheduler at rollout; the dedupe log is ready for it.
- No B1 files touched. Blockers: none.
