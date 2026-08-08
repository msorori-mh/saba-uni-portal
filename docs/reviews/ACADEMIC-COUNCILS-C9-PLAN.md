# ACADEMIC-COUNCILS-C9 Implementation Plan

## Branch context
- Base PR branch: `integration/councils-c0-c8-final-longrun-01`
- Work branch: `feat/councils-c9-notifications-reports-ux-longrun-01`
- Current HEAD: `d3ddce61f1d339d418d9c494fc8b456d4a5f6d85`

## Scope pillars

### A. Notification foundation
- Reuse existing `public.notifications` table; add `council` to `notification_type` CHECK via migration.
- Add `academic_council_notifications` outbox-style table for append-only event sourcing.
- Add `create_council_notification(p_user_id, p_event_type, p_council_id, p_meeting_id, p_entity_type, p_entity_id, p_payload)` SECURITY DEFINER helper.
- Add recipient derivation helper `get_council_notification_recipients(p_council_id, p_event_type, p_context)`.
- Wire notification generation into existing council RPCs: schedule meeting, intake open/close, topic submit/review, agenda ready, session open, attendance finalize, decision issue/update/overdue, archive.
- Add RPCs: `get_my_council_notifications`, `acknowledge_council_notification`.
- UI: notification bell + dropdown in faculty portal; mark-read; empty/error states.

### B. Reporting
- Add report RPCs secured by membership:
  - `get_council_report_meetings_by_period`
  - `get_council_report_attendance_rate`
  - `get_council_report_quorum_history`
  - `get_council_report_topic_disposition`
  - `get_council_report_agenda_completion`
  - `get_council_report_vote_result_summary`
  - `get_council_report_decision_execution_status`
  - `get_council_report_overdue_decisions`
  - `get_council_report_meeting_duration`
  - `get_council_report_archive_status`
  - `get_council_report_council_activity`
- Add catalog entries in `src/lib/reports/catalog/entries.ts` for `/admin/reports` and faculty reports center.
- UI: reports page for chair/secretary/member with role-scoped cards.

### C/D. Chair & Secretary dashboards
- Server functions returning role-scoped dashboards.
- Chair dashboard: upcoming meetings, intake status, topics requiring review, agenda readiness, attendance readiness, quorum state, meetings awaiting session, minutes awaiting approval, overdue decisions, meetings ready to archive.
- Secretary dashboard: topic preparation queue, agenda prep, attendance work, minutes drafts/review status, decision follow-up tracking.
- Components: `CouncilChairDashboard`, `CouncilSecretaryDashboard`.

### E. Member / Viewer / Responsible actor
- Member view: upcoming meetings, agenda, vote required, minutes, decisions.
- Viewer: read-only strict.
- Responsible actor: assigned decisions, due dates, progress/evidence update, completion action.

### F. Auth matrix tests
- PG17 verifier section covering read/ack/reports/cross-council/entity link/PII for all actor types.
- Zero mutation assertions for every denied write.

### G/H. Arabic / RTL / Accessibility
- Ensure all new labels/status in Arabic.
- RTL layouts.
- Accessible buttons, dialogs, focus traps, live regions.

### I. UI workflow E2E
- Wire dashboards into existing faculty route; new reports route.

### J. PG17 / tests
- Migration: `20260808180000_councils_c9_notifications_reporting_01.sql`
- Test file: `tests/academic-councils/councils-c9-notifications-reporting.test.ts`
- Verifier: `tests/academic-councils/postgres-c9-notifications-reporting-verifier.sql`
- Run `bun test tests/academic-councils`, `bunx tsc --noEmit`, `bun run build`, `git diff --check`.

### K. Stacked PR
- Push `feat/councils-c9-notifications-reports-ux-longrun-01` and open PR against `integration/councils-c0-c8-final-longrun-01`.

### M. Report
- Save final report to `docs/reviews/ACADEMIC-COUNCILS-C9-NOTIFICATIONS-REPORTS-OPERATIONAL-UX-LONGRUN-05.md`.

## Files expected to change/create
- `supabase/migrations/20260808180000_councils_c9_notifications_reporting_01.sql`
- `src/lib/councils-c9.functions.ts`
- `src/lib/council-notifications.ts`
- `src/components/councils/CouncilNotificationBell.tsx`
- `src/components/councils/CouncilChairDashboard.tsx`
- `src/components/councils/CouncilSecretaryDashboard.tsx`
- `src/components/councils/CouncilMemberWorkspace.tsx`
- `src/components/councils/CouncilReportsView.tsx`
- `src/routes/faculty-portal.academic-councils.tsx` (update)
- `src/routes/faculty-portal.academic-councils.reports.tsx` (new)
- `src/lib/reports/catalog/entries.ts` (append)
- `tests/academic-councils/councils-c9-notifications-reporting.test.ts`
- `tests/academic-councils/postgres-c9-notifications-reporting-verifier.sql`
- `docs/reviews/ACADEMIC-COUNCILS-C9-NOTIFICATIONS-REPORTS-OPERATIONAL-UX-LONGRUN-05.md`
