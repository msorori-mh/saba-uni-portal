# FACULTY-DASHBOARD-OPERATIONAL-PRIORITY-REDESIGN-01

## Decision

`PASS_FACULTY_DASHBOARD_OPERATIONAL_PRIORITY_REDESIGN_01`

## Scope

UI/UX operational-priority redesign of `/faculty-portal/` only.

- No database migrations
- No RLS / authorization changes
- No production reads/writes
- No deploy / merge

## Files changed

| File | Role |
|------|------|
| `src/routes/faculty-portal.index.tsx` | Reordered operational dashboard IA |
| `src/lib/faculty-portal/dashboard-schedule.ts` | Pure today-session / summary helpers |
| `src/components/portal/FacultyGradesManager.tsx` | Compact section-card entry UX (logic unchanged) |
| `src/components/communications/AnnouncementsWidget.tsx` | Optional `compactEmpty` empty state |
| `tests/faculty-portal/dashboard-operational-priority-01.test.ts` | Targeted IA + helper tests |
| `docs/reviews/FACULTY-DASHBOARD-OPERATIONAL-PRIORITY-REDESIGN-01.md` | This report |

## Before / after information architecture

### Before

1. Large welcome header
2. Six profile StatCards immediately under header
3. Duplicate schedule entry: action card «جدول التدريس الأسبوعي» + section «جدولي التدريسي»
4. Academic councils / materials / processing action cards
5. Announcements
6. Teaching sections list
7. Grades management
8. Future-services note

### After

1. Compact welcome / identity header (name, academic rank, position, employee #, status)
2. Daily operational summary (today sessions, courses, processing access label)
3. Single «جدولي التدريسي» (today first + full-schedule link)
4. «إدارة الدرجات»
5. Operational actions: processing (gated) + councils + materials (feature flag)
6. Announcements (compact empty)
7. «بياناتي الأكاديمية» profile details
8. Future-services note

## Duplicate schedule removal

- Removed the standalone «جدول التدريس الأسبوعي» action card.
- Kept one teaching section titled «جدولي التدريسي».
- Full weekly timetable remains at `/faculty-portal/schedule` via «عرض الجدول الكامل».

## Daily summary behavior

Truthful values derived from existing teaching + processing-access data:

| Metric | Source |
|--------|--------|
| محاضرات اليوم | `getTodaySessions(teaching)` count |
| مقرراتي | `teaching.length` (active sections) |
| طلبات المعالجة | label from `processingAccessSummaryLabel` — **no invented pending count** |

Labels when access is known:

- assignment/admin → `تحتاج متابعة`
- otherwise → `لا توجد صلاحية معالجة`

## Grades placement

- Moved directly after the schedule section.
- `FacultyGradesManager` persistence/security unchanged (`grade_components` / `student_grades`).
- Entry UX: compact actionable cards with course code/name, section code, and clear «إدارة الدرجات» CTA.

## Processing / councils / materials

| Surface | Behavior |
|---------|----------|
| طلبات المعالجة | Still gated by `showProcessingCard = hasAssignment \|\| isAdmin`; keeps `data-testid="faculty-processing-card"` and route |
| مجالسي الأكاديمية | Concise card → `/faculty-portal/academic-councils`; **no fabricated upcoming-meeting count** |
| موادي التعليمية | Still behind `portalFeatures.facultyCourseMaterials` (currently `false`) |

## Announcements

- Moved after operational actions.
- Dashboard uses `compactEmpty` → «لا توجد إعلانات جديدة» with reduced vertical padding.
- Fetch/mark-viewed security path unchanged.

## Profile details relocation

- Six academic facts moved to bottom section «بياناتي الأكاديمية».
- Header keeps operational identity only (name / rank / position / employee # / status).
- Department affiliation and administrative position remain separate fields.

## Tests

```text
bun test tests/faculty-portal
→ 79 pass / 0 fail
```

Coverage includes:

- schedule represented once (no duplicate heading/card)
- grades before actions/announcements
- processingAccess gate preserved
- materials feature flag preserved
- profile details rendered at bottom
- empty teaching + no-today states
- today session summary calculation
- routes preserved

## Verification

| Check | Result |
|-------|--------|
| `bun install --frozen-lockfile` | PASS |
| `bun test tests/faculty-portal` | PASS (79) |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |

## Responsive verification

Source-level review of the redesigned layout:

- `grid-cols-1 sm:grid-cols-*` stacking
- `min-h-10` / `min-h-[4.5rem]` touch-friendly actions
- `break-words` / `truncate` / `min-w-0` for Arabic RTL overflow safety
- schedule rows wrap time/room/type without relying on horizontal scroll

Live authenticated browser walkthrough was not available in this worktree (no local `.env` / faculty session). Responsive classes were verified in source and through the existing RTL/a11y faculty portal guards.

## Risks / notes

- Today sessions use the browser local calendar day mapped to DB `day_of_week` codes — consistent with on-site faculty use; no timezone migration added.
- Processing summary uses an access/action label, not a pending-request count (count not safely exposed on the dashboard without a new query/contract).
- Councils upcoming-meeting count intentionally omitted to avoid fabricating or adding an extra dashboard fetch tonight.
- Grades business logic untouched; only selection presentation changed.

## Production impact

None. Source-only UI reorder/consolidation. Draft PR only — **DO NOT MERGE** until product review.

## Tokens

```text
BASE_SHA=<see delivery block>
NEW_SHA=<see delivery block>
BRANCH=feat/faculty-dashboard-operational-priority-01
PASS_FACULTY_DASHBOARD_OPERATIONAL_PRIORITY_REDESIGN_01
PRODUCTION_READS=0
PRODUCTION_WRITES=0
MIGRATION_APPLIED=NO
DEPLOY=NO
MERGE=NO
```
