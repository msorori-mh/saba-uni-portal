# ADMIN-NAVIGATION-AND-DASHBOARD-UX-REORGANIZATION-01

## SHAs

| Key | Value |
|-----|-------|
| BASE_SHA | `0ba4ee53c012541fdd1f60977b3f9d54cb9a5e4f` |
| IMPLEMENTATION_SHA | `32db723945c7a36c3965a6b669d17fac30a6966c` |
| BRANCH | `feat/admin-navigation-dashboard-ux-01` |

## Summary

Source-only Admin Portal UX reorganization: clearer sidebar information architecture, client-side navigation search (after role filtering), readable typography, and an operationally prioritized dashboard. No backend, permission, route, migration, or deploy changes.

## Files changed

- `src/lib/admin-navigation-config.ts` (new) — operational nav groups + search/accordion helpers
- `src/components/admin/AdminShell.tsx` — search, exclusive accordion, fonts, `w-80`, a11y preserved
- `src/routes/admin/index.lazy.tsx` — KPI row, يحتاج انتباهك, compact cards, health deprioritized
- `tests/admin/admin-navigation-dashboard-ux-reorganization-01.test.ts` (new)
- `tests/admin/admin-navigation-rtl-a11y-consistency-01.test.ts` — read nav targets from config
- `tests/admin/processing-assignments-crud.test.ts` — nav link assertion via config

## Before / after nav groups

### Before (~12 top-level groups)

لوحة التحكم · القيادة التنفيذية · الشؤون الأكاديمية · شؤون الطلاب · الموارد البشرية · الشؤون المالية · الوثائق الرسمية · الاتصالات · الأتمتة · التقارير والتحليلات · إدارة الموقع · النظام والرقابة

### After (10 operational groups)

1. لوحة التحكم  
2. القيادة والإدارة  
3. العمليات الأكاديمية  
4. شؤون الطلاب  
5. هيئة التدريس والموارد البشرية  
6. المجالس والحوكمة  
7. المشاريع والخريجون  
8. المالية والوثائق  
9. الاتصالات والتقارير  
10. النظام والإعدادات  

All previously linked sidebar routes preserved. No new routes invented. Graduates Affairs not linked (no existing Admin nav route added).

## Terminology policy

- Approved: المجموعات الدراسية / المجموعات الدراسية النشطة / تقسيم المجموعات / إسناد المقررات والمجموعات الدراسية  
- Banned in Admin UI labels: شعبة · شعب · الشعبة · الشعب  
- Internal identifiers (`sections`, `activeSections`, …) unchanged  
- Regression test scans AdminShell, dashboard, and nav-config user-facing strings only (not historical docs/migrations)

## Search behavior

- Placeholder: `ابحث عن خدمة أو نظام...`  
- Searches group + item labels (Arabic-friendly `toLocaleLowerCase("ar")`)  
- Runs only on `visibleGroups` **after** `filterNavGroups` + finance gate  
- Matching groups expand during search; clearing restores active-group accordion  
- Clear button + Escape clears focused search  
- Unauthorized routes never appear in results

## Permission preservation

- `NAV_ITEM_ROLES` / `filterNavGroups` / `canSeeNavItem` unchanged and authoritative  
- Finance item still gated by `portalFeatures.adminFinance`  
- Search cannot bypass role filtering

## Font sizes

| Surface | Target applied |
|---------|----------------|
| Brand title | `text-base` / `sm:text-lg` (16–18px) |
| Group labels | `text-[15px]` bold |
| Nav items | `text-sm` (14px) + `h-4` icons |
| Breadcrumb | `text-[13px]` |
| Supporting | ≥12–13px (`text-xs`) |

Sidebar width: `w-80` with `max-w-[94vw]` on mobile; tightened vertical spacing (`space-y-0.5`).

## Dashboard hierarchy

A. نظرة سريعة (KPI row)  
B. يحتاج انتباهك  
C. العمليات الأكاديمية  
D. عمليات اليوم / الجداول  
E. التقدم الأكاديمي  
F. الموارد / الاتصالات  
G. صحة النظام (deprioritized)  
H. secondary operational areas  

## KPI changes

Top row (truthful data only; `—` while loading):

- الطلاب  
- المقررات  
- المجموعات الدراسية  
- الطلبات المفتوحة  

Removed nearby decorative duplicate of الطلاب (former «إحصائيات أكاديمية» block).

Responsive: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`.

## Attention section

`يحتاج انتباهك` uses already-fetched metrics when > 0:

- open requests  
- failed imports  
- at-risk students (informational)  
- unread messages  

No invented severity labels. Compact positive empty state when nothing needs attention.

## Responsive / a11y verification

- Mobile drawer: Escape, focus return, backdrop `aria-hidden`, `aria-expanded`/`aria-controls` preserved  
- Search works in drawer; long Arabic labels use `break-words`  
- Touch targets ≈ `min-h-10` / `min-h-11`  
- Live authenticated visual session: **not available** in this worktree — verified via source + tests

## Tests

```
bun test tests/admin
→ 272 pass / 0 fail

bun test tests/faculty-portal
→ 61 pass / 0 fail
```

Mission coverage includes role filtering, search visibility, accordion, KPI/attention/health order, banned terminology, mobile a11y.

## TSC / build / diff

| Check | Result |
|-------|--------|
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |

## CI

Draft PR #317. Initial Bun suite failed on 3 source assertions still pointing at inline AdminShell nav strings; remediations retargeted those tests to `admin-navigation-config.ts` / `applyAdminFinanceNavGate`. Re-check pending.

## Visual check status

SOURCE/TEST review only (no authenticated Admin session in environment).

## Production / safety

| Gate | Value |
|------|-------|
| PRODUCTION_READS | 0 |
| PRODUCTION_WRITES | 0 |
| MIGRATION_APPLIED | NO |
| DEPLOY | NO |
| MERGE | NO |

## Decision

**PASS** (pending CI green on draft PR)

`PASS_ADMIN_NAVIGATION_AND_DASHBOARD_UX_REORGANIZATION_01`
