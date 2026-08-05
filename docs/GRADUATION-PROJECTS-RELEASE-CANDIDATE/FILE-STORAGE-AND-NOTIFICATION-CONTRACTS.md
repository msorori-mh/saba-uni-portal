# GRADUATION-PROJECTS — FILE/STORAGE AND NOTIFICATION CONTRACTS

## 1. File / storage contract

- **Kinds** (`graduation_project_files.file_kind`): `attachment`, `proposal`,
  `milestone_submission`, `supervisor_feedback`, `final_manuscript`,
  `presentation`, `source_archive`, `defense_minutes`, `correction_version`,
  `archived_final`. Stage binding: milestone kinds require a submission;
  `final_manuscript` requires an accepted submission on a `final` milestone.
- **Allowed MIME**: pdf, zip, png, jpeg, text/plain, docx, pptx. **Size**: ≤ 50 MiB.
- **Object keys**: `graduation-projects/<project_id>/<16-char-random>-<safe-name>`,
  built server-side; `..`/URL forms rejected; globally unique.
- **Upload window**: registration only while `active`/`corrections_required`;
  post-close uploads denied at the RPC.
- **Scan**: one-way `pending → clean|quarantined|rejected` via
  `set_graduation_project_file_scan_state` (service-role only; audited via
  `scan_decided_at`/`scan_correlation_id`). Replays of the same decision are
  no-ops; conflicting decisions fail closed.
- **Read/download**: keys are exposed only for `clean` files and only to direct
  assignees (detail RPC); the portal privacy layer redacts keys for
  student-only viewers. **No public bucket, no public URLs, no client-side
  listing.** Signed-URL strategy: a separately authorized storage draft must
  create a private bucket and mint short-lived signed URLs server-side per
  clean object key; this package intentionally ships no bucket.
- **Binary upload**: unavailable. Private Storage has not been bootstrapped;
  no bucket was created and no migration was applied for GP file objects.
- **Metadata registration**: unavailable. `registerGraduationProjectFile` fails
  closed immediately after auth + module-availability checks — before UUID/token
  generation, object-key construction, `registerFile` / RPC, DB mutation, or any
  Storage call. The Milestones UI no longer exposes a metadata-registration
  action. This is a temporary safe closure until a separately designed and
  approved private Storage package lands.
- **Orphan cleanup**: `list_graduation_project_orphan_files()` (service-only,
  review-only) flags `scan_pending_expired` (>30d) and `unlinked_terminal`;
  deletion is a privileged, separately authorized batch — never in-app.

## 2. Notification contract

- **Source**: append-only `graduation_project_events` → trigger
  `graduation_project_events_notify` → `graduation_project_notification_log`.
- **Types**: reuse the event vocabulary (proposal_submitted, team_member_added,
  faculty_assigned, proposal_approved/rejected/revision_required,
  project_activated, milestone_set, deliverable_submitted,
  submission_accepted/revision_required, supervisor_note_added,
  discussion_requested/scheduled/request_rejected/held/postponed/cancelled,
  panel_member_assigned, evaluation_finalized, result_completed,
  corrections_requested, correction_completed/accepted, assignment_ended,
  project_archived). Arabic labels come from the shared `EVENT_LABELS`.
- **Recipients**: resolved from the project's active direct assignments only —
  never cross-project; the actor never notifies themselves.
- **Dedupe**: `unique(project_id, recipient_user_id, notification_type,
  entity_id)` + `ON CONFLICT DO NOTHING`; replays cannot duplicate.
- **Read**: `list_my_graduation_project_notifications()` — own rows only.
- **Reminder types** (milestone due, evaluation incomplete): scheduled-job
  contract on top of this log at rollout (see known lows).
