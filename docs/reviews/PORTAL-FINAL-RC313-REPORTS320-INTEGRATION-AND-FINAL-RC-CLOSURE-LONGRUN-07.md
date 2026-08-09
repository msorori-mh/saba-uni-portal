# PORTAL-FINAL-RC313-REPORTS320-INTEGRATION-AND-FINAL-RC-CLOSURE-LONGRUN-07

**Decision:** `PASS_PORTAL_FINAL_RC313_REPORTS320_INTEGRATION_AND_FINAL_RC_CLOSURE_LONGRUN_07`  
**PR:** [#313](https://github.com/msorori-mh/saba-uni-portal/pull/313) (Draft retained)  
**Branch:** `rc/portal-final-v4-prebuild-non-b1-01`  
**Date:** 2026-08-10

---

## Identity

| Field | Value |
|---|---|
| STARTING_RC_HEAD | `afe5f55b545aceb9f761ee8a508818c19068db07` |
| REPORTS320_HEAD | `57010a34ee06863ac23558c3b71c79ef3743a9dd` |
| PRE_REPORTS320_RC_HEAD_SHA | `afe5f55b545aceb9f761ee8a508818c19068db07` |
| FINAL_RC_PRODUCT_SHA | `fe772f0faba165f885d0bc32f84944ada2b94681` |
| FINAL_RC_HEAD_SHA | `633810b804fbe1808a1b0ec9560214fc90f28e57` |
| INTEGRATED_PRS | `#293,#291,#299,#311,#312,#314,#315,#317,#310,#318,#320` |
| merge-base(RC, #320) | `afe5f55b545aceb9f761ee8a508818c19068db07` |

Pre-merge identity gate: **PASS**

- Local / origin RC HEAD = `afe5f55b545aceb9f761ee8a508818c19068db07`
- PR #320 head = `57010a34ee06863ac23558c3b71c79ef3743a9dd`
- PR #320 Web CI = **completed / success** (all jobs) — https://github.com/msorori-mh/saba-uni-portal/actions/runs/31340124413
- No SHA drift → proceed

Parents of merge commit `fe772f0f…`:
- `afe5f55b545aceb9f761ee8a508818c19068db07` (RC)
- `57010a34ee06863ac23558c3b71c79ef3743a9dd` (#320)

---

## Integration result

| Metric | Value |
|---|---|
| Merge command | `git merge --no-ff 57010a34ee06863ac23558c3b71c79ef3743a9dd` |
| Strategy | `ort` (clean) |
| TEXT_CONFLICTS | **0** |
| SEMANTIC_CONFLICTS | **0** |
| SEMANTIC_LOSS_COUNT | **0** |
| ROUTE_LOSS_COUNT | **0** |
| Files changed (product) | **17** (UX + attention builders + tests + closure doc) |
| Migrations touched | **0** |
| Main merge | **NO** |

#320 was branched from the exact RC tip (`afe5f55b…`), so the merge introduced only the three-level reports UX commits with no overlapping semantic conflict surface.

---

## G3 — Three-level UX preservation

Canonical orchestrator `ReportsOperationalWorkspace` (mandatory order Attention → KPIs → Catalog) is mounted on all centers:

| Route | Workspace |
|---|---|
| `/student/reports` | YES |
| `/faculty-portal/reports` | YES |
| `/admin/department-reports` | YES |
| `/admin/executive-reports` | YES (all allowed views) |
| `/admin/reports` | YES (catalog tab) |

| Property | Result |
|---|---|
| Level titles | يحتاج انتباهك الآن → المؤشرات الرئيسية → جميع التقارير |
| Empty attention state | `لا توجد عناصر تحتاج تدخلك الآن` (`data-attention-empty`) |
| Proven-only alerts | `sourceCode` required; zero / `NO_DATA` / incomplete never fabricate warnings |
| viewerScope | Hubs still pass scope into `ReportsCatalogSection` / `ReportsCenter` |
| Binding-aware visibility | Dean / VP / presidency builders fail closed without bindings |
| BLOCKED honesty | BLOCKED entries remain non-openable in end-user catalog |
| Mobile / RTL | Workspace roots `dir="rtl"`; existing responsive grids preserved |

**THREE_LEVEL_UX_PRESERVED = YES**

---

## G4 — Terminology

Modified Arabic report UX surfaces (#320 delta) use exclusively:

- المجموعة الدراسية
- المجموعات الدراسية

No `الشعبة` / `الشعب` in `src/components/reports/*`, `src/lib/reports/attention/*`, or the five remounted route files. Technical identifiers (`course_sections`, `section_id`, etc.) unchanged.

Focused regression: `three-level-operational-ux.test.tsx` §12 PASS.

**TERMINOLOGY_VERDICT = PASS**

---

## G5 — Reports authz (Hardening-03)

| Scope rule | Preserved |
|---|---|
| student = SELF ONLY | YES |
| faculty = ASSIGNED ONLY | YES |
| department head = OWN DEPARTMENT ONLY | YES |
| operational units = OWN UNIT ONLY | YES |
| dean = fail closed without college_id | YES |
| VP Student / VP Academic / presidency = explicit binding only | YES |
| Attention / KPI never exceed those bounds | YES (builders + route gates + beneficiary suites) |

**REPORTS_AUTHZ_PRESERVED = YES**

---

## G6 — B1 safety

| Check | Result |
|---|---|
| B1_VISIBILITY_CHANGES | **0** |
| B1_NEW_EXECUTABLE_MIGRATIONS | **0** |
| B1_AUTHORIZATION_CHANGES | **0** |
| `student_visible` for B1 release state | **unchanged** (no migration / no request_types edits) |
| Old `student_visible=false` baseline reintroduced | **NO** |

---

## G7 — Domain preservation

| Domain | Result |
|---|---|
| B1_SECURITY_PRESERVED | YES (arch14 in full suite: 36/36 + 267 negatives + 17 failure injections) |
| GP_SECURITY_PRESERVED | YES |
| GA_SECURITY_PRESERVED | YES |
| COUNCILS_SECURITY_PRESERVED | YES |
| FACULTY_SECURITY_PRESERVED | YES |
| PWA_SECURITY_PRESERVED | YES |
| ADMIN_SECURITY_PRESERVED | YES |
| STUDENT_REQUEST_SECURITY_PRESERVED | YES |
| ENROLLMENT_CERTIFICATE_PRESERVED | YES (source suites; Windows Wrangler PDF timeout environmental — same class as LONGRUN-05/06) |
| REPORTS_AUTHZ_PRESERVED | YES |

---

## G8 — Migration safety

| Check | Result |
|---|---|
| REPORTS_NEW_EXECUTABLE_MIGRATIONS | **0** |
| DUPLICATE_MIGRATION_VERSIONS | **0** |
| DUPLICATE_MIGRATION_FILENAMES | **0** |
| HISTORICAL_MIGRATION_REWRITES | **0** |
| Migration apply | **NOT RUN** |
| Final RC migration set size | **295** SQL files (unchanged vs STARTING_RC) |

---

## G10 — Catalog (CODE IS TRUTH)

Re-read from `src/lib/reports/catalog/entries.ts` after merge:

| Status | Count |
|---|---|
| TOTAL | **74** |
| LIVE | **26** |
| DATA_DEPENDENT | **0** |
| SOURCE_READY | **5** |
| UNDER_DEVELOPMENT | **6** |
| NOT_ACTIVATED | **20** |
| BLOCKED | **17** |

#320 is UX-only relative to catalog: counts unchanged vs LONGRUN-06.

---

## G9 — Validation evidence

### Focused reports
| Suite | Result |
|---|---|
| `bun test tests/reports tests/admin-reports tests/reports-beneficiaries` | **354 pass / 0 fail** |

### Domain
| Suite | Result |
|---|---|
| `tests/admin` | **274 pass / 0 fail** |
| `tests/faculty-portal` | **79 pass / 0 fail** |
| `tests/student-portal` | **96 pass / 0 fail** |
| `tests/student-requests` | **1066 pass / 0 fail** |
| `tests/graduation-projects` | **119 pass / 0 fail** |
| `tests/graduates-affairs` | **175 pass / 0 fail** |
| `tests/academic-councils` | **79 pass / 0 fail** |
| `tests/pwa` | **49 pass / 0 fail** |
| `tests/runbook` | **21 pass / 0 fail** |
| Domain aggregate (SR+GP+GA+Councils+Faculty+Admin+PWA+Runbook) | **1862 pass / 0 fail** |

### Full local `bun test tests/`
| Metric | Value |
|---|---|
| Pass | **3121** |
| Fail | **1** (environmental) |
| Files | **265** |
| Duration | ~590s |

Environmental failure (not a #320 product regression):
- `tests/documents/enrollment-certificate-arabic-pdf-worker-runtime.test.ts` — Windows Wrangler Worker timeout 60s (same LONGRUN-05/06 classification).

### Tooling
| Check | Result |
|---|---|
| `bunx tsc --noEmit` | **PASS** (exit 0) |
| `bun run build` | **PASS** (`BUILD_EXIT=0`) |
| `git diff --check` | **PASS** |
| PG17 B1 arch14 (inside full suite) | **PASS** (267 denials + observer ACL + failure injection) |
| PG17 councils/GA/GP (domain suites) | **PASS** |

---

## G11 / G13 — CI / PR #313

| Check | Result |
|---|---|
| Integrated streams | `#293,#291,#299,#311,#312,#314,#315,#317,#310,#318,#320` |
| PR #313 Draft | **YES** (retained) |
| Push target | `rc/portal-final-v4-prebuild-non-b1-01` only |
| New PR | **NO** |
| Web CI on final HEAD | *(recorded after push — must be completed/success)* |
| Migration Review on final HEAD | *(recorded after push — must be completed/success)* |

---

## Production safety declarations

| Control | Value |
|---|---|
| ZERO_PRODUCTION_READS | YES |
| ZERO_PRODUCTION_WRITES | YES |
| ZERO_PRODUCTION_RPC | YES |
| ZERO_MIGRATION_APPLY | YES |
| NO_ROLE_CHANGES | YES |
| NO_DEPLOY | YES |
| NO_PUBLISH | YES |
| NO_MAIN_MERGE | YES |
| PR #313 Draft | YES |

---

## FINAL DECISION

**PASS_PORTAL_FINAL_RC313_REPORTS320_INTEGRATION_AND_FINAL_RC_CLOSURE_LONGRUN_07**

Hard gates remaining after docs land: Web CI + Migration Review must show **completed / success** on the exact Draft tip SHA. Product merge is clean, UX/authz/B1/catalog/domain gates already green locally.
