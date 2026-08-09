# ACADEMIC-COUNCILS-FACULTY-OPERATIONAL-DASHBOARD-UX-01

## Mission
Transform Faculty Academic Councils page from a long vertical form stack into an operational council dashboard (UI/UX + information architecture only).

## SHAs
- **BASE_SHA:** `0ba4ee53c012541fdd1f60977b3f9d54cb9a5e4f`
- **IMPLEMENTATION_SHA:** `db0965ffa90aa4a48ab593cfa166c021feb4a7ca`

## Files changed
### Added
- `src/lib/faculty-portal/councils-operational.ts` — pure summary / action-required derivation
- `src/components/portal/councils/shared.tsx` — labels, Arabic error maps, compact empty states
- `src/components/portal/councils/CouncilsOperationalSummary.tsx`
- `src/components/portal/councils/CouncilsActionRequired.tsx`
- `src/components/portal/councils/CouncilMembershipCard.tsx`
- `src/components/portal/councils/CouncilMeetingCard.tsx`
- `src/components/portal/councils/CouncilMeetingsWorkspace.tsx`
- `src/components/portal/councils/CouncilTopicsWorkspace.tsx`
- `src/components/portal/councils/CouncilTopicCard.tsx`
- `src/components/portal/councils/ScheduleMeetingDialog.tsx`
- `src/components/portal/councils/CouncilAgendaDialog.tsx`
- `src/components/portal/councils/SubmitCouncilTopicDialog.tsx`
- `src/components/portal/councils/MeetingAgendaExpandable.tsx`
- `src/components/portal/councils/index.ts`
- `tests/academic-councils/faculty-operational-dashboard-ux-01.test.ts`
- `docs/reviews/ACADEMIC-COUNCILS-FACULTY-OPERATIONAL-DASHBOARD-UX-01.md`

### Modified
- `src/routes/faculty-portal.academic-councils.tsx` — operational IA composition (~1900 → ~400 lines)

## Before / after information architecture
### Before
Header → current councils → archived memberships → permanent schedule form → permanent agenda editor → upcoming meetings → previous meetings → my topics → council topics → permanent submit form

### After
Header → operational summary → action required → current councils → next-meeting priority → primary actions (+schedule / +submit) → tabs [Meetings | Topics | Archive] with progressive dialogs

## Summary derivation
Truthful values only from loaded queries:
- current councils count
- next meeting label (council + formatted datetime) or «لا يوجد»
- my submitted topics count
- action-required label (role/status derived; never invented numeric pending counts)

## Action-required logic
Deterministic from loaded data:
- Chair with zero upcoming chaired meetings → «اجتماع يحتاج جدولة»
- Agenda-write role + upcoming meeting in `scheduled|intake_open|intake_closed` → agenda completion card (capped)
- My topics with `needs_completion` → completion cards
- Empty → compact «لا توجد إجراءات حالية»

## Current councils
High on page; compact cards with name, type, role, status, next meeting when known, «فتح المجلس».

## Meetings workspace
Consolidated upcoming/previous via sub-tabs. Meeting cards keep edit (chair) and agenda manage (chair/secretary) gates.

## Schedule-dialog change
Permanent «جدولة اجتماع (رئيس المجلس)» form removed. Chair-only `+ جدولة اجتماع` opens `ScheduleMeetingDialog` with all prior fields and `scheduleCouncilMeeting`.

## Agenda progressive disclosure
Permanent agenda editor removed. Meeting card / action card opens `CouncilAgendaDialog` for write-authorized councils; members retain read-only «عرض جدول الأعمال» expand. Finalize remains chair-only.

## Topics workspace
My topics + council topics consolidated with filter tabs. Submit moved to dialog.

## Submit-topic dialog
Preserves eligibility roles, validation, max 5 attachments, upload/security flow, Arabic errors, query invalidation.

## Archive behavior
Previous memberships moved under «الأرشيف» tab; compact empty «لا توجد عناصر مؤرشفة.»

## Permission preservation
UI gates unchanged: chair schedule/edit/finalize; chair|secretary agenda write; submit roles; viewer banner / no submit.

## Secure function contract preservation
Unchanged usage of:
`getMyAcademicCouncilMembershipsV2`, `getMyCouncilMeetingsV2`, `getMyCouncilTopics`, `getAgendaItemsForMeeting`, `scheduleCouncilMeeting`, `updateCouncilMeeting`, `getAvailableTopicsForAgenda`, `addTopicToAgenda`, `addManualAgendaItem`, `updateAgendaItem`, `reorderAgendaItems`, `finalizeMeetingAgenda`, `prepareCouncilTopicAttachmentUpload`, `submitCouncilTopic`, `getCouncilTopicAttachments`, `getCouncilTopicAttachmentSignedUrl`.

No direct table writes. No migrations. No RLS/RPC contract changes.

## Responsive / a11y review (source)
- RTL `dir="rtl"` on tabs/dialogs
- Responsive grids / wrapping tabs / min touch targets (`min-h-8/9/10`)
- Semantic headings, labels, `role="status"|"alert"`, Dialog focus management via Radix
- Status conveyed by text badges, not color alone

## Test results
- `bun test tests/academic-councils` — 17 pass / 0 fail
- `bun test tests/faculty-portal` — 61 pass / 0 fail

## TypeScript
`bunx tsc --noEmit` — PASS

## Build
`bun run build` — PASS

## Diff check
`git diff --check` — PASS

## CI
_(filled after PR checks)_

## Visual check status
`LIVE_AUTHENTICATED_VISUAL_CHECK=NOT_AVAILABLE` (no authenticated faculty session in this environment). Source/test responsive review performed.

## Risks / notes
- Next-meeting priority is a compact summary; full meeting controls remain in Meetings tab (intentional progressive disclosure; some metadata overlap by design).
- Available-topics-for-agenda is not counted in summary (requires per-meeting query); action cards avoid inventing that count.
- Ordinary members never see chair write controls.

## Production impact
UI-only. `PRODUCTION_READS=0`, `PRODUCTION_WRITES=0`, `RPC_PRODUCTION_CALLS=0`, `MIGRATION_APPLIED=NO`, `DEPLOY=NO`, `MERGE=NO`.

## Decision
PASS (pending CI confirmation after draft PR)
