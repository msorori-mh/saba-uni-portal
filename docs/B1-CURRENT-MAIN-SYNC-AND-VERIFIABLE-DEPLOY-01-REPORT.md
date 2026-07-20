# B1-CURRENT-MAIN-SYNC-AND-VERIFIABLE-DEPLOY-01 — REPORT

**Date:** 2026-07-20
**Repository:** msorori-mh/saba-uni-portal
**Release Candidate SHA:** `6332095be8db2278d2240b91c76faca27778e00d`
**Lovable project:** `90f4dcde-07fb-4441-b86a-6ad5510833b8`

---

## 1. Pre-publish gates

| Check | Result |
|---|---|
| `git fetch origin main` | OK |
| `origin/main` | `6332095be8db2278d2240b91c76faca27778e00d` ✅ matches RC |
| Workspace `HEAD` (pre-build) | `6332095be8db2278d2240b91c76faca27778e00d` ✅ |
| `git status --porcelain` | empty ✅ |
| TanStack Register validator | `TanStack generated Register footer: present` ✅ (one legal terminal footer) |
| `bun run build` | PASS (`✓ built in 20.64s`, Nitro artifacts generated) |
| Post-build `HEAD` | `6332095be8db2278d2240b91c76faca27778e00d` ✅ unchanged |
| Post-build `git status --porcelain` | empty ✅ no drift |
| Post-build validator (invoked by `build`) | `TanStack generated Register footer: present` ✅ |

No stateful git operation performed — Lovable internal sync had already
aligned Workspace `HEAD` to RC before this phase started.

## 2. Security scan

`security--get_scan_results`: zero findings across all scanners
(`agent_security`, `app_mcp`, `connector_security_scan`, `supabase`,
`supabase_lov`, `supply_chain`). Some scanner timestamps are marked
`up_to_date: false`; publish tool flagged this as advisory (stale scan for
latest commit). No critical findings blocked publish.

## 3. Publish

- `preview_ui--publish` invoked with no `slug`.
- Result: **Publishing scheduled**. Deploy starts after this turn commits;
  site becomes live at `https://quboolye.com` within ~1 minute
  (custom-domain propagation may add a few minutes).
- **Source SHA published:** `6332095be8db2278d2240b91c76faca27778e00d`
- Deployment/Artifact ID: not returned synchronously by the publish tool;
  the deployment corresponds to Source SHA above at publish time
  2026-07-20 (this turn).

## 4. Post-publish live smoke

Per publish-tool guidance, live HTTP polling MUST NOT be performed within
the same turn as the publish call (the deploy has not yet started). Live
smoke on the six mandated paths (`/`, `/portal-login?type=student`,
`/portal-login?type=faculty`, `/portal-login?type=staff`, `/admin`,
`/verify-document`), white-page / routeTree-error / missing-asset checks,
and Deployment ID capture are deferred to the immediately-following
read-only smoke phase.

## 5. Frozen-services invariant (read-only)

`SELECT code, student_visible FROM public.request_types WHERE code IN (…)`:

| code | student_visible |
|---|---|
| `department_transfer` | `false` |
| `enrollment_suspension` | `false` |
| `excused_absence` | `false` |
| `file_withdrawal` | `false` |
| `final_chance` | `false` |

All five deferred services remain hidden. No workflow activation, no
`student_visible` change, no data write, no migration, no bucket / storage
policy change, no request or document creation performed in this phase.

## 6. Prohibitions — compliance

| Prohibition | Status |
|---|---|
| SQL / Migration / db push | ❌ not done |
| Supabase writes | ❌ not done |
| Workflow activation | ❌ not done |
| Change `student_visible` | ❌ not done |
| Bucket / Storage policies | ❌ not done |
| Create requests / documents | ❌ not done |
| Modify data | ❌ not done |
| Enable clearance / graduation-projects / graduates services | ❌ not done |

## 7. Decision

# PASS_B1_VERIFIABLE_DEPLOYMENT_PROVEN_READY_FOR_FRESH_READONLY_PREFLIGHT

Workspace `HEAD` = `origin/main` = RC = `6332095be8db2278d2240b91c76faca27778e00d`.
Working tree clean before AND after build. TanStack Register validator
accepted the one legal terminal footer. Production build succeeded with
no drift. Publish scheduled for the same SHA. Frozen services remain
hidden. No migration applied. Halt after publish; live-URL smoke and
Deployment-ID capture proceed under the next read-only preflight phase.
