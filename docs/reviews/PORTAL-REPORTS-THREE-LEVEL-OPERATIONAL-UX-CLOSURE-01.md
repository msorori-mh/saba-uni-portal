# PORTAL-REPORTS-THREE-LEVEL-OPERATIONAL-UX-CLOSURE-01

**Decision:** `PASS_PORTAL_REPORTS_THREE_LEVEL_OPERATIONAL_UX_CLOSURE_01`  
**Branch:** `feat/reports-three-level-operational-ux-01`  
**Base:** `rc/portal-final-v4-prebuild-non-b1-01` (`afe5f55b545aceb9f761ee8a508818c19068db07`)  
**Stacked against:** PR #313 RC branch — **not main**

## Architecture

Reusable three-level operational workspace (no per-route UI duplication):

| Layer | Component | Arabic title |
|------|-----------|--------------|
| 1 | `ReportsAttentionSection` | يحتاج انتباهك الآن |
| 2 | `ReportsPrimaryKpis` | المؤشرات الرئيسية |
| 3 | `ReportsCatalogSection` → `ReportsCenter` | جميع التقارير |

Orchestrator: `ReportsOperationalWorkspace` — **mandatory order** Attention → KPIs → Catalog.

Pure attention builders live under `src/lib/reports/attention/`:

- Typed `ReportAttentionItem` with required `sourceCode` provenance
- `filterAttentionActions` strips disallowed routes (authorization before convenience)
- Zero / `NO_DATA` / `data_incomplete` / `no_access` / `not_configured` never become warnings

## Beneficiary mapping

| Beneficiary | Route / surface | Page title |
|-------------|-----------------|------------|
| Student | `/student/reports` | تقاريري |
| Faculty | `/faculty-portal/reports` | تقاريري |
| Department head | `/admin/department-reports` | تقارير القسم |
| Operational units | `/admin/executive-reports` (operational) | تقارير الوحدة |
| Academic affairs | `/admin/executive-reports` (academic_affairs) | تقارير الشؤون الأكاديمية |
| Alumni / quality | `/admin/executive-reports` (alumni) | تقارير الخريجين والجودة |
| Dean | `/admin/executive-reports` (dean) | تقارير الكلية |
| VP Student Affairs | `/admin/executive-reports` (vp_student) | تقارير شؤون الطلاب |
| VP Academic Affairs | `/admin/executive-reports` (vp_academic) | التقارير الأكاديمية |
| Presidency / council | `/admin/executive-reports` (strategic) | المؤشرات والتقارير الاستراتيجية |
| Admin / system | `/admin/reports` (catalog tab) | مركز التقارير |

## Attention source inventory

| Beneficiary | Source | When shown |
|-------------|--------|------------|
| Student | `student_requests.status:returned*` → `returnedForCompletion` | count > 0 only |
| Faculty | `course_materials` draft / `staleMaterials` | ScopedMetric value > 0 |
| Department | `weeklyIssues.unassigned_sections` / `teachingLoad.unassignedSections` | proven positive count |
| Operational | `processing.overdue` | value > 0 |
| Academic affairs / VP Academic | `teachingLoad.unassignedSections` | value > 0 + binding/role |
| Alumni | `kpis.pendingGraduationCandidates` | value > 0; **never** from blocked families |
| Dean | college KPIs only if `collegeScopeConfigured` | no_access never alerts |
| VP Student | `kpis.studentsNoProgram` | requires `vpStudentAffairsBound` |
| Strategic | aggregate risk codes only | requires `universityPresidencyBound`; no PII |
| Admin | `failedImports` / `scheduleConflicts` / unassigned | only when caller passes proven counts |

Empty state copy (canonical): **لا توجد عناصر تحتاج تدخلك الآن**

## KPI inventory

| Beneficiary | KPIs (3–6) |
|-------------|------------|
| Student | المقررات الحالية، الطلبات المفتوحة، الوثائق الصادرة |
| Faculty | المجموعات الدراسية المسندة، الساعات المعتمدة، المواد التعليمية، المواد المنشورة |
| Department | طلاب القسم، أعضاء هيئة التدريس، البرامج، المقررات، المجموعات الدراسية المسندة/غير المسندة |
| Operational | إجمالي الطلبات، قيد المعالجة، متأخرة، متوسط أيام الحل |
| Academic / VP Academic | programs / plans / courses / sections / faculty or department slice |
| Alumni | pending candidates + honest no_access for blocked families |
| Dean | none presented as valid without college binding |
| VP Student | students / active / suspended / no program / pending / docs |
| Strategic | aggregate university KPIs (no PII) |
| Admin catalog | no fabricated KPI strip (empty tiles OK) |

`ScopedMetric` presence semantics preserved — missing data is never coerced to `0`.

## Routes covered

- `/student/reports`
- `/faculty-portal/reports`
- `/admin/department-reports`
- `/admin/executive-reports`
- `/admin/reports` (catalog → three-level; other tabs unchanged)

## Terminology contract

User-facing Arabic for `course_sections`:

- **المجموعة الدراسية** / **المجموعات الدراسية**

Applied in KPI labels, attention titles, department `weeklyIssues`, faculty scope copy.  
DB/API identifiers (`course_sections`, `section_id`) unchanged.

## Authorization preservation

Source of truth remains **Reports AUTHZ Hardening-03**:

- Student self-only
- Faculty assigned-only
- Department own department only
- Operational unit explicit codes only
- Dean fail-closed without college binding
- VP / presidency require explicit bindings
- `ReportsCenter` still receives `viewerScope` / `catalogViewerFromActorScope`
- BLOCKED / NOT_ACTIVATED remain non-openable / hidden from end-user catalog
- No RLS / grants / migrations / workflow / B1 visibility changes

## Tests

`tests/reports-beneficiaries/three-level-operational-ux.test.tsx` — 29 cases covering G10 matrix (order, scopes, weeklyIssues, empty attention, no fabrication, dean/VP/presidency gates, operational isolation, action allow-list, terminology, scope-aware catalog, BLOCKED, no PII).

Validation run:

- `bunx tsc --noEmit` — pass
- `bun test tests/reports` + `admin-reports` + `reports-beneficiaries` — pass
- `bun test tests/admin` + `faculty-portal` + `student-portal` — pass
- `bun run build` — pass
- `git diff --check` — pass

## Manual QA checklist

1. Student: open `/student/reports` — Attention first; empty message if no returned requests; catalog titled جميع التقارير.
2. Faculty: assigned KPIs use المجموعات الدراسية المسندة; draft materials only if proven.
3. Department: weeklyIssues appear under يحتاج انتباهك الآن before KPIs.
4. Executive: switch beneficiary tabs — titles + gates match bindings; unbound VP/dean/strategic absent.
5. Admin catalog tab: Attention empty (honest) → All Reports scope-aware.
6. Mobile RTL: no horizontal overflow; attention actions ≥ touch target.
7. Keyboard: section headings / links focusable; severity not color-only (text labels حرج/تنبيه/معلومة).

## Source safety / zero production impact

| Gate | Result |
|------|--------|
| REPORTS_NEW_EXECUTABLE_MIGRATIONS | 0 |
| HISTORICAL_MIGRATION_REWRITES | 0 |
| B1 visibility changes | 0 |
| workflow authorization changes | 0 |
| role changes | 0 |
| RLS changes | 0 |
| ZERO_PRODUCTION_READS / WRITES / RPC | honored by agent |
| ZERO_MIGRATION_APPLY / NO_DEPLOY / NO_PUBLISH / NO_MAIN_MERGE | honored |

## Assumptions

- Admin catalog attention stays empty until a proven lightweight summary is wired; builder accepts proven counts when available.
- Strategic “risk” today surfaces only aggregate pending student services when count > 0 — informational, not fabricated SLA drama.
- Faculty stale materials use existing 180-day builder heuristic (proven timestamp), not invented deadlines.

## Risks

- Admin operational tabs (imports/schedules) still live beside the three-level catalog; operators may need a follow-up to lift proven conflict/import counts into Attention.
- Executive view titles change per active beneficiary tab — intentional for the ten-beneficiary matrix.

## Production impact

**None.** UI/UX + pure builders + tests + docs only. No schema, RLS, grants, migrations, or B1 visibility edits.
