# STUDENT-REQUEST-WORKFLOW-ROUTE-UNNEST-FIX-01F — Report

**Date:** 2026-07-12  
**Repo:** `msorori-mh/saba-uni-portal`  
**Branch:** `fix/request-types-workflow-route-unnest-01f`  
**Base commit:** `0658f2ce33a1b30ddbed9da7335cbd6a1f2bfa44` (post PR #117)

## Decision

**PASS_STUDENT_REQUEST_WORKFLOW_ROUTE_UNNEST_MAIN_SYNC_READY_FOR_FINAL_REVIEW**

## Prior production smoke (context)

Before this fix, `/admin/request-types/:id/workflow` returned HTTP 200 but rendered the `/admin/request-types` list page because the workflow file was nested under `request-types.tsx`, which has no `<Outlet />`.

## Root cause

| Item | Detail |
|------|--------|
| Nested file | `src/routes/admin/request-types.$id.workflow.tsx` |
| Parent | `src/routes/admin/request-types.tsx` (CRUD list, no Outlet) |
| Effect | Child route matched URL but never mounted |

## Why trailing underscore (not Outlet)

- `request-types.tsx` is a standalone CRUD page.
- Adding `<Outlet />` would risk showing list + editor together or force an unrelated layout refactor.
- TanStack Router trailing `_` (`request-types_.$id.workflow.tsx`) unnests the route while keeping public URL `/admin/request-types/$id/workflow`.

## Rename

| Before | After |
|--------|-------|
| `src/routes/admin/request-types.$id.workflow.tsx` | `src/routes/admin/request-types_.$id.workflow.tsx` |

Git recorded a real rename (`R099`).

`createFileRoute("/admin/request-types_/$id/workflow")` — underscore is route-id only.

List link unchanged:

```ts
to="/admin/request-types/$id/workflow"
params={{ id: row.id }}
```

No Outlet added to `request-types.tsx`.

## routeTree after build

| Check | Result |
|-------|--------|
| Import | `./routes/admin/request-types_.$id.workflow` |
| Route id | `/admin/request-types_/$id/workflow` |
| `fullPath` | `/admin/request-types/$id/workflow` |
| `parentRoute` | `AdminRoute` (not `AdminRequestTypesRoute`) |
| Nested children of RequestTypes | **removed** |
| Old file registration | **gone** |

## Local smoke

### Unauthenticated SSR (`http://localhost:8080`)

| URL | HTTP | Redirect | Match leaf |
|-----|------|----------|------------|
| `/admin/request-types` | 200 | none | `/admin/request-types` |
| `/admin/request-types/<uuid>/workflow` | 200 | none | `/admin/request-types_/$id/workflow` |
| Same workflow URL refresh | 200 | none | same unnested leaf |

Workflow SSR match chain is `__root__ → /admin → /admin/request-types_/$id/workflow` (not under list page).

### Authenticated UI (admin session)

**Not fully executed here:** no local `.env` / admin credentials available without writing secrets into logs.

Expected after login (for reviewer / staging smoke):

- List page: types only + lifecycle buttons; no editor inline.
- Workflow page: lifecycle title, steps/transitions editors, dry-run + draft/activate buttons; no 12-type list.
- Draft save button gated by save RPC availability (feature flag), activate still tied to dry-run.
- Network: `getAdminRequestWorkflowConfig` / `admin_get_request_workflow_config` on open.
- No Save Draft / Activate pressed in this task.

## RPC / DB / Deploy

| Action | Done? |
|--------|-------|
| Call save / activate | **No** |
| Migrations / SQL / seed | **No** |
| Supabase DB writes | **No** |
| Publish / Deploy | **No** |
| Merge | **No** (PR only) |

Code still wires `getAdminRequestWorkflowConfig` on the workflow page; authenticated call confirmation is deferred to reviewer smoke with a real session.

## Verification

| Command | Result |
|---------|--------|
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `bun test tests/student-requests/request-workflow-route-unnest.test.ts` | PASS (6) |
| `bun test tests/student-requests/enrollment-certificate-workflow-foundation.test.ts` | PASS (55) |
| `git diff --check` | PASS |

## Files changed

- `src/routes/admin/request-types_.$id.workflow.tsx` (renamed + route id)
- `src/routeTree.gen.ts` (regenerated)
- `tests/student-requests/request-workflow-route-unnest.test.ts` (new)
- `tests/student-requests/enrollment-certificate-workflow-foundation.test.ts` (path update)
- `docs/STUDENT-REQUEST-WORKFLOW-ROUTE-UNNEST-FIX-01F-REPORT.md` (this report)

## Security Review

- Files changed: routes + generated tree + tests + docs only
- Migrations / RLS / RPCs changed: **no**
- Auth / authorization impact: **no** (routing structure only)
- Sensitive data exposure: **no**
- Privilege escalation: **no**
- Production risk: **low**
- Ready for merge: **yes** (pending review + authenticated smoke)
- Ready for deploy: **yes** after merge (deploy not performed)

## Remaining risk

Authenticated browser confirmation of editor mount + `admin_get_request_workflow_config` network call still needed with an admin session.

## Recommended next step

Review PR → smoke workflow URL while logged in as admin → merge.

## Main synchronization remediation

**Date:** 2026-07-12  
**Phase:** `STUDENT-REQUEST-WORKFLOW-ROUTE-UNNEST-MAIN-SYNC-01F-R1`  
**PR:** #119 (same branch; no new PR)

| Item | Value |
|------|--------|
| Pre-sync HEAD | `cef0e73609e5a5af7fcd6f4e465a928feae77731` |
| Merged `origin/main` | `31e50ff718dab0348519e8ff2a3140fc929300a0` |
| Merge commit | `bd54270374e9dd579121ec19197329b45dbbd4c3` |
| Method | `git merge origin/main` (no rebase, no force push) |
| Conflicts | **None** (including `src/routeTree.gen.ts`) |

### routeTree after sync + build

| Check | Result |
|-------|--------|
| Regenerated via `bun run build` | Yes (no uncommitted diff after build) |
| `fullPath` | `/admin/request-types/$id/workflow` |
| `parentRoute` | `typeof AdminRoute` |
| Nested under `AdminRequestTypesRoute` | **No** |
| `AdminRequestTypesRouteChildren` / workflow child | **Absent** |
| Import | `./routes/admin/request-types_.$id.workflow` |

### Main impact preserved

Merge brought in recent main changes (including home/header updates such as `src/routes/index.tsx`, `src/components/site/Header.tsx`, `.lovable/plan.md`) without dropping the unnest rename or regenerating a nested workflow parent.

### Tests after sync

| Command | Result |
|---------|--------|
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `request-workflow-route-unnest.test.ts` | PASS (**6**) |
| `enrollment-certificate-workflow-foundation.test.ts` | PASS (**55**) |
| `git diff --check` | PASS |
| **Total focused tests** | **61** |

### Local SSR smoke after sync

| URL | HTTP | Leaf match |
|-----|------|------------|
| `/admin/request-types` | 200 | `/admin/request-types` |
| `/admin/request-types/<uuid>/workflow` | 200 | `/admin/request-types_/$id/workflow` under `/admin` |

No Save Draft / Activate pressed. No DB writes. No Deploy. No merge of PR #119 on GitHub from this phase.
