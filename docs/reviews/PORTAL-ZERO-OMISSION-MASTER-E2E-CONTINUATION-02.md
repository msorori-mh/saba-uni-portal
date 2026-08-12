# PORTAL-ZERO-OMISSION-MASTER-E2E-CONTINUATION-02

MODE: AUTONOMOUS PRODUCTION — DEMO_ONLY + TEST_ONLY — FULL BROWSER E2E

## PHASE 0 — DEPLOY CURRENT ACCEPTED RUNTIME — CLOSED

### Provenance

| Item | Value |
|---|---|
| SOURCE_SHA (pre-publish) | `b277088c7887177a121fe4324d5dc2992efdec47` |
| Release stamp updated to | `b277088c…` (build-sha.generated.json) |
| SOURCE_SHA (frozen, published) | `5ec7f90a5be92b312c3862b4b08a433d7f6620cf` |
| PREVIOUS_DEPLOYED_SHA | `e4b38a14042b138af611131b768f6fcc14c26c94` |
| NEW_DEPLOYED_SHA (`/version.json`) | `5ec7f90a5be92b312c3862b4b08a433d7f6620cf` |
| DEPLOYED_SOURCE_PARITY | **PASS** |

Note: the earlier "404" observation was against `saba-uni-portal.lovable.app`, which
302-redirects to the canonical custom domain `https://quboolye.com`. Canonical host
measurements are authoritative from here on.

### Pre-publish gates

- typecheck (`tsgo --noEmit`): clean, no diagnostics.
- Security scan gate: publish was blocked by one CRITICAL finding
  `supabase_lov/student_requests_self_update_privileged_columns`.

### Blocking security finding — fixed forward-only (approved domain: B1 student requests)

Migration: column-level UPDATE privileges on `public.student_requests`.

- `REVOKE UPDATE ON public.student_requests FROM authenticated, anon;`
- `GRANT UPDATE (title, description, request_type, status, form_data, student_notes,
  submitted_at, cancelled_at, rejection_reason, updated_at) TO authenticated;`
- Rationale: RLS cannot restrict columns; GRANTs can. All workflow mutations run inside
  `SECURITY DEFINER` RPCs executing as the table owner and are unaffected.
- Post-state `relacl`: `authenticated=ardDxtm` / `anon=ardDxtm` (no table-wide `w`).

Live REST verification with a real student session (`demo.student.active`):

| Column patched | Result |
|---|---|
| `status` | 204 ALLOW (regression-safe: submit/resubmit still work) |
| `student_notes` | 204 ALLOW |
| `internal_notes` | 403 `42501` DENY |
| `current_step_index` | 403 `42501` DENY |
| `current_assignee_id` | 403 `42501` DENY |
| `workflow_version` | 403 `42501` DENY |
| `reviewed_by` | 403 `42501` DENY |

Post-fix scan: 0 error/critical findings (3 warn-level advisories remain, unrelated).

### Route parity after publish (canonical host, unauthenticated HTTP)

`REQUIRED_ROUTE_404_COUNT = 0`

| Route | Status |
|---|---|
| /faculty-portal/lecture-execution | 200 |
| /faculty-portal/lecture-execution/$sectionId | 200 |
| /faculty-portal/lecture-monitoring | 200 |
| /admin/lecture-execution | 200 |
| /faculty-portal/materials | 200 |
| /faculty-portal/materials/$sectionId | 200 |
| /student/materials | 200 |
| /student/materials/$sectionId | 200 |

### Authenticated browser rendering (Playwright, real UI login, retained DEMO actors)

| Actor | Login | Route | Rendered | JS errors |
|---|---|---|---|---|
| demo.faculty | PASS → /faculty-portal | /faculty-portal/lecture-execution | PASS | 0 |
| demo.faculty | — | /faculty-portal/materials | PASS | 0 |
| demo.faculty | — | /faculty-portal | PASS | 0 |
| demo.depthead | PASS → /faculty-portal | /faculty-portal/lecture-monitoring | PASS ("المخطط مقابل المنفذ ومؤشرات المخاطر") | 0 |
| demo.admin | PASS → /staff | /admin/lecture-execution | PASS (admin console) | 0 |
| demo.student.active | PASS → /student | /student/materials | PASS (FITCS01 materials listed) | 0 |
| demo.student.active | — | /student | PASS (نورة عبدالله الشامي / DEMO-2026-0001) | 0 |

`PHASE0_LOGIN_FAILURES = 0`, `PHASE0_ROUTE_CRASHES = 0`, `PHASE0_JS_ERRORS = 0`.

### Phase 0 tokens

- `DEPLOYED_SOURCE_PARITY = PASS`
- `REQUIRED_ROUTE_404_COUNT = 0`
- `STUDENT_REQUESTS_PRIVILEGED_COLUMN_LOCKDOWN = PASS`
- `UNINTENDED_REAL_DATA_WRITES = 0`
- `CORRECTIVE_REAL_DATA_WRITES = 2` (carried forward from the academic-year repair; reported separately, not rewritten as zero)

## STATUS OF PHASES 1..X

Not yet executed in this round: fresh zero-omission discovery, Campaigns S / F / W / GP /
GA / COUNCILS / DOCUMENTS+NOTIFICATIONS / R / X, presentation rehearsal, post-execution
rediscovery. `UNTESTED_*` remain > 0.

`FINAL_DECISION = HOLD_PORTAL_ZERO_OMISSION_FULL_E2E_CAMPAIGNS_S_F_W_GP_GA_COUNCILS_R_X_NOT_YET_EXECUTED`
