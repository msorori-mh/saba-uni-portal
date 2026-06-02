# Phase PERF-01 — Portal Performance & UX Optimization

## Approach

This is a broad performance phase. To keep the change set safe (no business logic, no schema, no RLS), I'll work in two passes:

**Pass A — Audit (read-only)**: Inventory the slowest pages and quantify the actual bottlenecks before touching code. Deliverable: a baseline findings report (in chat) listing per-page issues: query counts, missing `staleTime`, unpaginated lists, heavy synchronous imports (xlsx/recharts/qrcode), unnecessary re-renders.

**Pass B — High-impact fixes only**: Apply the optimizations whose ROI is clearest and risk is lowest. Skip speculative micro-optimizations.

## Pass B — Concrete changes

### 1. React Query caching defaults
- Set sensible defaults in `src/router.tsx` `QueryClient` (staleTime 60s, gcTime 5m, refetchOnWindowFocus false).
- Per-query overrides only where the current value is clearly wrong:
  - lookups (programs/departments/semesters/years): staleTime 10m
  - dashboard KPIs: staleTime 2m
  - reports/analytics: staleTime 5m
  - session/profile: staleTime 5m

### 2. Lazy-load heavy modules
Convert static imports to dynamic `import()` inside the export/print handlers (not at module top):
- `xlsx` (used in `src/lib/reports/export.ts`, `src/lib/schedule-export.ts`, several admin pages)
- `recharts` (only loaded when chart actually renders — `React.lazy` on chart components)
- `qrcode` (only inside generation handler)
- Import engine / large report utils — `React.lazy` route-level where feasible

Expected bundle impact: significant reduction in initial chunk for `/admin`, `/student`, `/faculty-portal`.

### 3. Tables & pagination
For admin tables currently rendering unbounded lists, add client-side pagination (100 rows/page) and 350ms debounce on search inputs. Targets:
- `/admin/users`, `/admin/faculty-management`, `/admin/staff-management`
- `/admin/imports` (history table)
- `/admin/audit-log`
- `/admin/finance`
- `/admin/documents`
- `/admin/schedules`

### 4. Dashboard aggregate queries
Audit `/admin` and `/admin/executive-dashboard` for `select *` queries used only for counts. Replace with `select('id', { count: 'exact', head: true })` where applicable. No schema changes.

### 5. Loading UX
Replace full-page spinners with skeletons on the heavy routes (admin index, executive dashboard, reports, imports, schedules, finance, student portal, faculty portal). Keep showing cached data during refetch (`placeholderData: keepPreviousData`).

### 6. Mobile
For tables on viewports `<768px`, switch to card list layout on the top 3 admin pages users open on mobile (admin index, student portal, faculty portal).

## Out of scope (per phase guardrails)

- No schema changes, no RLS changes, no new indexes (only reported if recommended).
- No new features, no route renames, no removed functionality.
- No design overhaul — only loading states & layout-density tweaks.

## Process

1. I'll run the audit first and post findings in chat.
2. **You approve which subset of fixes to apply** (or "all").
3. I implement the approved fixes, then report metrics (queries reduced, lazy-loaded modules, build status).

This avoids a 40-file blind refactor and lets you steer the risk.
