# B1-POST-DEPLOY-LIVE-SMOKE-AND-SOURCE-DRIFT-AUDIT-01

**Date:** 2026-07-19
**Deployed SHA:** `7431601dfbdf4609693235631c9b5c0b7aa5495d`
**Current origin/main:** `600021d4a5ab452bf6601dd0fa379169b5475c6f`
**Mode:** READ-ONLY (no SQL writes, no migration, no publish, no data mutations)

---

## 1. Live production smoke (https://quboolye.com)

| Path | HTTP | Body |
|---|---|---|
| `/` | 200 | 70,777 B |
| `/portal-login?type=student` | 200 | 25,737 B |
| `/portal-login?type=faculty` | 200 | 25,737 B |
| `/portal-login?type=staff`   | 200 | 25,638 B |
| `/admin` | 200 | 8,786 B |
| `/verify-document` | 200 | 20,164 B |

- No white-screen response (all payloads non-trivial HTML).
- No 404 on JavaScript/CSS assets observed at the entry-document layer.
- No routeTree runtime error surfaced in served HTML.
- Portal entry points (student / faculty / staff / admin) reachable.
- Public document verification (`/verify-document`) remains available.

Authenticated deep routes (student portal, staff inbox, faculty portal internals):
**MANUAL_AUTHENTICATED_SMOKE_REQUIRED** — no test technical account was used and no real
user session was created or impersonated, per phase mandate.

## 2. Database read-only verification

### 2.1 Five deferred services — `student_visible` unchanged

| code | is_active | student_visible |
|---|---|---|
| `department_transfer`   | true | **false** ✅ |
| `enrollment_suspension` | true | **false** ✅ |
| `excused_absence`       | true | **false** ✅ |
| `file_withdrawal`       | true | **false** ✅ |
| `final_chance`          | true | **false** ✅ |
| `enrollment_certificate` (control) | true | true ✅ |

### 2.2 No new active workflow for the five services

| code | workflows | active_workflows |
|---|---|---|
| department_transfer   | 0 | 0 |
| enrollment_suspension | 0 | 0 |
| excused_absence       | 0 | 0 |
| file_withdrawal       | 0 | 0 |
| final_chance          | 0 | 0 |

### 2.3 No publish-induced data creation

- `student_requests` created in the last 2 hours: **0**
- `official_documents` created in the last 2 hours: **0**

### 2.4 Enrollment certificate baseline preserved

- Document `USR-2026-000002` status: `archived` (unchanged from pre-publish baseline).

## 3. Source drift audit (`7431601…` → `600021d…`)

```
600021d Verified and deployed SHA B1
8bf0538 Changes
d2bf8cd Changes
```

`git diff --stat 7431601 600021d`:

```
docs/B1-RELEASE-DEPLOY-AND-SHA-VERIFICATION-02-REPORT.md | 74 ++++++++++++++++++++++
src/routeTree.gen.ts                                     | 10 ---
2 files changed, 74 insertions(+), 10 deletions(-)
```

Diff scope confirmed to be exactly the two allowed classes:

1. **Deployment report** — new file `docs/B1-RELEASE-DEPLOY-AND-SHA-VERIFICATION-02-REPORT.md` (documentation only).
2. **Removal of TanStack `Register` module-augmentation block** from generated `src/routeTree.gen.ts`:

```diff
-import type { getRouter } from './router.tsx'
-import type { startInstance } from './start.ts'
-declare module '@tanstack/react-start' {
-  interface Register {
-    ssr: true
-    router: Awaited<ReturnType<typeof getRouter>>
-    config: Awaited<ReturnType<typeof startInstance.getOptions>>
-  }
-}
```

The generator is expected to re-emit this block on any subsequent route regeneration, so
the drift will reappear on the next auto-regeneration of `routeTree.gen.ts`. Per phase
mandate this is **NOT fixed in this phase**.

### 3.1 Deferred remediation (recorded, not applied)

Move the `declare module '@tanstack/react-start' { interface Register { … } }` augmentation
out of the generated file into a stable, non-generated source such as
`src/types/tanstack-start-register.d.ts`. This keeps the Register typing stable across
`routeTree.gen.ts` regenerations and prevents recurring drift after every publish.

## 4. Compliance with phase restrictions

| Restriction | Status |
|---|---|
| No SQL / Migration | ✅ none (SELECT only) |
| No Supabase writes | ✅ none |
| No workflow activation | ✅ none |
| No `student_visible` change | ✅ unchanged |
| No new Deploy / Publish | ✅ none |
| No `routeTree.gen.ts` edit | ✅ untouched |
| No new requests / documents | ✅ none |
| No student / staff data change | ✅ none |

## 5. Decisions

### ✅ PASS_B1_POST_DEPLOY_LIVE_SMOKE

All six probed public routes return HTTP 200 with substantive bodies; no white screen,
no routeTree runtime error surfaced; `verify-document` remains public. Five deferred
services stay `student_visible=false` with zero workflows and zero new rows in the
publish window; enrollment certificate baseline (`USR-2026-000002` → `archived`) intact.

### ⚠️ HOLD_B1_POST_PUBLISH_SOURCE_DRIFT_REGISTER_REMEDIATION_REQUIRED

`origin/main` (`600021d…`) is one commit ahead of the deployed SHA (`7431601…`). The drift
is limited to (a) the deployment report and (b) removal of the TanStack `Register`
module-augmentation from `src/routeTree.gen.ts`. Remediation required in a later dedicated
phase: relocate the `Register` augmentation into a stable non-generated declaration file
(e.g. `src/types/tanstack-start-register.d.ts`) so it survives route-tree regeneration.
