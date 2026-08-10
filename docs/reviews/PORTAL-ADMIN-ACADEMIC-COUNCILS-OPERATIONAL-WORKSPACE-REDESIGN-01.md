# PORTAL-ADMIN-ACADEMIC-COUNCILS-OPERATIONAL-WORKSPACE-REDESIGN-01

## Mission
Transform the admin academic councils page from a long document-like layout into a selected-council operational workspace for University Council review readiness.

## SHAs
- **BASE_SHA:** `b02241c5ccf92f8057213232092cde81a0231b48`
- **BRANCH:** `feat/admin-councils-operational-workspace-01`
- **WORKTREE:** `C:/projects/saba-admin-councils-operational-ui-01`

## Files changed
### Added
- `src/lib/admin-portal/councils-operational.ts` — truthful action-required / minutes_review derivation
- `tests/academic-councils/admin-operational-workspace-ux-01.test.ts`
- `docs/reviews/PORTAL-ADMIN-ACADEMIC-COUNCILS-OPERATIONAL-WORKSPACE-REDESIGN-01.md`

### Modified
- `src/routes/admin/academic-councils.tsx` — operational IA composition (header → KPI strip → selected council → context → tabs)

### Not modified (by design)
- `supabase/migrations/**`
- `src/lib/admin-councils.functions.ts`
- C5/C6/C7/C8/C9 backend surfaces

## Before / after information architecture
### Before
Long vertical stack: dual maturity badges → green “enabled/read-only” notice → KPI section card → college/department section cards → membership → meetings → topics (labeled read-only) → agenda → minutes with locked CTA → follow-up → archive/reports placeholders → scheduling/notifications “قيد التأسيس” → architecture concept cards → footer phase note.

### After
Header (single title) → compact KPI strip → **المجلس الحالي** select + compact cards → council context header → **يتطلب انتباهك** → next-meeting priority (overview) → workspace tabs:
نظرة عامة | الأعضاء | الاجتماعات | الموضوعات | جدول الأعمال | المحاضر والقرارات | المتابعة | الأرشيف
Secondary: التقارير (existing `CouncilReportsView` when council selected).

## Capability inventory (source-authoritative)
| Capability | Status |
|---|---|
| Membership link/deactivate | Implemented (admin panel + server fns) |
| Meeting schedule/update | Implemented; chair-gated by server (admin app_role alone denied) |
| Topic review queue + actions | Implemented; chair/secretary via RPC; admin alone denied |
| Agenda manage/finalize | Implemented; write/finalize role-gated by server |
| Reports | Existing `CouncilReportsView` + C9 report fns |
| Decision issuance CTA | Not on admin surface — neutral copy, no fake locked button |
| Notification settings | No real implementation — removed from workspace |

## Authorization copy
- Removed misleading “(للأدمن ورئيس المجلس عبر الصلاحيات)”
- Retained/added: «تتوفر الإجراءات وفق عضويتك وصلاحيتك داخل المجلس.»
- Topic review still: `canAct = isChair \|\| isSecretary`
- **ADMIN_UNIVERSAL_ACADEMIC_BYPASS_INTRODUCED=NO**

## Meeting status reconciliation
- Display labels now include `minutes_review` → «محضر بانتظار الاعتماد»
- Manual edit dropdown (`MEETING_STATUS_OPTIONS`) intentionally does **not** add `minutes_review` (lifecycle remains RPC-driven)
- Backend `updateCouncilMeeting` schema already accepts `minutes_review`; UI does not broaden mutation into full lifecycle states

## Query discipline
- Global: `["admin", "academic-councils", "summary"]`
- Selected council only: meetings + topic-review-queue keys (shared with tab panels; `enabled: Boolean(selectedCouncilId)`)
- No all-councils meeting explosion; tab switches do not invent new keys

## Verification
| Check | Result |
|---|---|
| `bun test …/admin-operational-workspace-ux-01.test.ts` | PASS (11) |
| `bun test …/faculty-operational-dashboard-ux-01.test.ts` | PASS (17) |
| Source-level councils suite subset (UX + a11y + package + PR314) | PASS (47) |
| Full `bun test tests/academic-councils` Docker/PG17 harness | NOT_RUN / unavailable hang — classified separately; not patched |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| Browser smoke | NOT_RUN_ENVIRONMENT |

## Production / forbidden actions
- PRODUCTION_READS=0
- PRODUCTION_WRITES=0
- MIGRATION_CHANGES=0
- BACKEND_AUTH_CHANGES=0
- DEPLOY=NO
- PUBLISH=NO
- MERGE=NO

## Risks / assumptions
- Follow-up / open decisions remain summary-level aggregates (no per-decision admin list API in scope)
- Minutes panel is read/status view from loaded meetings + KPI counts — not issuance workflow
- Schedule button in context header opens Meetings tab (existing schedule form); server still enforces chair

## Findings counts
- CRITICAL_COUNT=0
- HIGH_COUNT=0
- MEDIUM_COUNT=1 (pre-existing: meeting edit dropdown still exposes some lifecycle statuses that ideally stay RPC-only; not broadened in this mission)

## Final token
PASS_PORTAL_ADMIN_ACADEMIC_COUNCILS_OPERATIONAL_WORKSPACE_REDESIGN_01
