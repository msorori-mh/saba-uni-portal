# ADMIN-ACADEMIC-OPERATIONS-RUNTIME-ERROR-FIX-01 — Report

**Repo:** `msorori-mh/saba-uni-portal`  
**Branch:** `fix/admin-academic-operations-runtime-error-01`  
**Date:** 2026-07-11  
**Decision:** `PASS_ADMIN_ACADEMIC_OPERATIONS_RUNTIME_FIX_PR_READY_FOR_REVIEW`

## Root cause

On `/admin/academic-operations`, `AcademicOpsPage` imported server functions `setCurrentAcademicYear` / `setCurrentSemester` and also declared local handlers with the same names (`const setCurrentYear` / `const setCurrentSemester`). The local `setCurrentSemester` shadowed the imported binding in the same scope used by `useServerFn(setCurrentSemester)`, producing a Temporal Dead Zone `ReferenceError` during render before the page could mount.

Separately, the root `ErrorComponent` always linked “العودة للرئيسية” to `/` via `<a href="/">`, which ejected admins from the admin panel into the public site after any uncaught route error.

## Expected error before fix

```
ReferenceError: Cannot access 'setCurrentSemester' before initialization
```

(or equivalent TDZ failure) while rendering `AcademicOpsPage`, often surfacing through the root error boundary with a home link to `/`.

## Changes

| File | Change |
|------|--------|
| `src/routes/admin/academic-operations.tsx` | Alias server imports (`*Server`), rename handlers to `handleSetCurrentYear` / `handleSetCurrentSemester`, in-page fallbacks for context/KPI query failures (no `throw`) |
| `src/routes/admin.tsx` | Admin-scoped `errorComponent`: safe Arabic message, retry via `reset` + `invalidate`, Link to `/admin`, no `signOut` |
| `src/routes/__root.tsx` | Home target `/admin` when pathname starts with `/admin`, else `/`; retry = `reset` then `invalidate`, chunk-load reload fallback; TanStack `Link` |
| `src/lib/route-error-recovery.ts` | Shared helpers: `getErrorRecoveryHomePath`, `isChunkLoadError`, `retryRouteError` |
| `tests/admin/academic-operations-runtime-error.test.ts` | Focused coverage for naming, fallbacks, home paths, retry order, no `signOut` |
| `src/routeTree.gen.ts` | Regenerated Register types from build tooling |
| `docs/ADMIN-ACADEMIC-OPERATIONS-RUNTIME-ERROR-FIX-01-REPORT.md` | This report |

## Test results

```
bun test tests/admin/academic-operations-runtime-error.test.ts
12 pass, 0 fail
```

Covered:

1. No server-fn / handler name collision  
2. TDZ-prone local/import collision removed  
3. Context query failure uses in-page fallback (no throw → no root error boundary)  
4. Admin error home → `/admin`  
5. Public error home → `/`  
6. Retry calls `reset` then `invalidate`  
7. Error fallbacks never call `signOut`

## Verification

| Command | Result |
|---------|--------|
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| Focused tests | PASS (12/12) |

## Migrations / DB

- Migrations changed: **no**
- RLS changed: **no**
- RPCs changed: **no**
- Supabase / Lovable DB writes: **none**
- Publish / Deploy: **none**

## Admin recovery confirmation

- Admin `errorComponent` “العودة إلى لوحة الإدارة” uses TanStack `Link` to `/admin`.
- Root `ErrorComponent` uses `getErrorRecoveryHomePath(pathname)` so `/admin/*` failures return to `/admin`, not `/`.
- Neither fallback signs the user out or sends them to the public home from an admin context.

## Security Review

- Files changed: listed above  
- Did migrations change? **no**  
- Did RLS change? **no**  
- Did RPCs change? **no**  
- Authentication impact: **no** (session untouched on page errors)  
- Authorization impact: **no**  
- Sensitive data exposure: **no** (user-facing messages are generic; errors still logged via `console` / `reportLovableError`)  
- Privilege escalation risk: **no**  
- Production risk: **low**  
- Ready for merge: **yes** (pending review)  
- Ready for deploy: **yes** (after merge; deploy not performed)

## Production impact

Frontend-only recovery and naming fix. No schema or policy changes. Admins stay in `/admin` after recoverable errors.

## Remaining risks

- Full browser E2E of `/admin/academic-operations` was not run in this pass (unit/source tests + tsc/build only).
- Chunk-load full reload remains a last-resort path and will remount the app (session cookies preserved; no explicit `signOut`).

## Recommended next step

Review and merge PR `fix/admin-academic-operations-runtime-error-01` → `main`, then smoke-test `/admin/academic-operations` in staging.
