# STUDENT-REQUESTS-P2-P6-INTEGRATION-REVIEW-PR-01 Report

**Date:** 2026-07-07  
**Repository:** `C:\projects\saba-uni-portal-git`  
**Baseline:** `main` @ `a527463` — Add student request P1 foundations (#100)  
**Supabase ref:** `wpmicqriltrowwonknox` (single project; no separate staging DB)  
**Migrations 20260710130000–20260711020000:** NOT applied (verified — no apply in this session)

---

## 1. Decision

| Item | Result |
|------|--------|
| **Decision** | **PASS_WITH_NOTES** |
| **Blockers** | None |
| **PR eligible** | Yes — Draft PR to `main` |

**Summary:** P2–P6 UI foundations integrate cleanly on P1 `main`. Registry normalization, admin type config, dynamic forms, eligibility UI guards, and staff inbox shell all degrade gracefully when workflow schema/RPCs are absent. No browser direct access to workflow tables; no `act_on_student_request_step` UI calls; build passes.

**Notes (non-blocking):**
- Legacy staff-inbox fallback (`legacy_overview`) returns admin-wide request list (limit 200) when actor RPC unavailable — server auth enforced via `STUDENT_REQUESTS_ADMIN_ROLES`, but not actor-scoped until runtime apply.
- `docs/STUDENT-REQUESTS-STAGING-ENV-GATE-01-REPORT.md` not present in repo — omitted from commit; PR body references STAGING-ENV-GATE NO_GO from staging apply context.
- File upload fields are UI placeholders with explicit «الرفع الفعلي لاحقاً» — no fake success.
- `needs_verification` badge allows submit (by design) — RPC disclaimer shown; not treated as final eligible.
- Deprecated `StudentRequestsSection.tsx` unchanged (out of scope).

---

## 2. Git Baseline

| Check | Result |
|-------|--------|
| Branch before PR | `main` @ `a527463` |
| P1 migration on main | `20260711020000_student_requests_p1_foundations.sql` ✅ |
| Migrations applied this session | **0** |
| Production DB changes | **None** |
| `git diff --check` | PASS (no conflict markers) |

### Excluded from commit (forbidden)

| Path / pattern | Reason |
|----------------|--------|
| `src/routeTree.gen.ts` | Build artifact — restored |
| `src/components/portal/StudentRequestsSection.tsx` | Out of scope / deprecated |
| `supabase/migrations/**` | No migration changes |
| `docs/STUDENT-REQUEST-ENROLLMENT-SUSPENSION-DESIGN-01.md` | Forbidden |
| `applied.` | PowerShell paste artifact |
| `"student eligibility fields..."` | PowerShell paste artifact |
| `"t be merged to main before staging apply."` | PowerShell paste artifact |

---

## 3. P2–P6 Integration Review

### 3.1 P2 — Registry (single source)

| Criterion | Status |
|-----------|--------|
| Central registry `request-type-registry.ts` | ✅ |
| 8 canonical types consistent with spec | ✅ |
| Legacy aliases (`absence_excuse`, `transfer`, `reenrollment`) normalize on read | ✅ |
| Legacy aliases hidden from pickers when canonical exists | ✅ `filterStudentRequestTypesForDisplay` / `shouldHideLegacyTypeInPicker` |
| Legacy aliases not shown as create options | ✅ `buildAdminCreateTypeOptions` + server reject |
| Active routes use registry helpers | ✅ student new/index/mobile, admin inbox/reports, timeline |

### 3.2 P3 — Admin Request Types

| Criterion | Status |
|-----------|--------|
| No browser DB writes | ✅ server fns only (`admin-request-types.functions.ts`) |
| Schema probe before extended save | ✅ `probeRequestTypeSchema` |
| Graceful fallback on missing columns | ✅ retry base fields + Arabic banner |
| No crash on missing migrations | ✅ capabilities-driven select/save |
| No new alias records on create | ✅ `isLegacyStudentRequestTypeAlias` blocked server-side |
| Route | `/admin/request-types` |

### 3.3 P4 — Dynamic Forms

| Criterion | Status |
|-----------|--------|
| 8 canonical form definitions | ✅ `FORM_BY_CANONICAL` |
| Unknown types safe/disabled | ✅ unsupported message + submit blocked |
| No HTML/JS execution from `form_data` | ✅ text rendering + `safeDisplayText` escape in staff view |
| File upload does not fake success | ✅ placeholder `{ _filePlaceholder }` + UI label «الرفع الفعلي لاحقاً» |
| Schema pending notice | ✅ `unavailableUntilSchemaApplied` banner |

### 3.4 P5 — Eligibility UI Guard

| Criterion | Status |
|-----------|--------|
| Not RPC substitute | ✅ `RPC_NOTICE` on every card |
| Graduate from `student_profiles.status === "graduated"` only | ✅ `getStudentRequestUiContext` |
| Non active/graduated blocked in UI | ✅ `ACADEMIC_BLOCK_MSG` |
| `needs_verification` not final eligible | ✅ badge + warnings; submit allowed with disclaimer |
| No queries on unapplied P1 tables | ✅ only `student_profiles.status` |
| Service window unchecked = warn only | ✅ `evaluateServiceWindow` |

### 3.5 P6 — Staff Inbox

| Criterion | Status |
|-----------|--------|
| Reads via server functions/RPC wrappers only | ✅ `staff-inbox.functions.ts` |
| No direct client queries to workflow tables | ✅ grep clean in components/routes |
| No `act_on_student_request_step` from UI | ✅ grep zero matches in `src` |
| Action buttons disabled without runtime | ✅ `getAvailableUiActionsForRole(..., false)` |
| Preview vs actual distinguished | ✅ `workflowIsPreview` + «معاينة فقط» badge |
| Auth not UI-filter only | ✅ `assertStaffInboxAccess` + admin route guard |
| No SQL/stack trace leaks | ✅ `sanitizeStaffErrorMessage` |
| Attachments via signed URLs (server fn) | ✅ `getStudentRequestAttachmentUrl` |
| No role grants from UI | ✅ display labels only |

---

## 4. Schema-Absence Fallback

| Surface | Typed fallback | Arabic message | Crash / infinite load |
|---------|----------------|----------------|------------------------|
| Staff inbox RPC missing | `available: true`, `reason: "workflow_schema_unavailable"` | «صندوق معالجة الطلبات يحتاج تطبيق مخطط دورة الحياة…» | ✅ No crash |
| Staff detail RPC missing | Same + legacy detail | Same | ✅ No crash |
| Unauthorized staff | `available: false`, `reason: "unauthorized"` | «ليس لديك صلاحية…» | ✅ No crash |
| Student RPC missing | `mapStudentRequestRpcError` | «خدمة الطلبات قيد التحديث…» | ✅ No crash |
| Admin audience columns missing | capabilities banner | «إعدادات الجمهور والأهلية تحتاج تطبيق مخطط…» | ✅ No crash |
| Optimistic workflow actions | N/A | Actions disabled | ✅ No optimistic writes |

No direct browser DB fallback to workflow tables. Legacy inbox uses existing `student_requests` + `student_profiles` (base schema).

---

## 5. Routes and Guards

| Route | Guard mechanism | Roles (admin-nav) |
|-------|-----------------|-------------------|
| `/admin/request-types` | `admin.tsx` → `canAccessAdminRoute` | `system_admin`, `admin`, `registrar`, `student_affairs` |
| `/admin/student-requests` | Same + server `STUDENT_REQUESTS_ADMIN_ROLES` on inbox fns | + `dean` |
| `/student/requests` | `student.tsx` → auth + `student_profiles` exists | Authenticated student |
| `/student/requests/new` | Parent `/student` guard | Authenticated student |
| `/mobile/student/requests` | `mobile.student.tsx` → auth + profile | Authenticated student |

**Staff inbox URL access:** `/admin/student-requests` requires admin session (`getAdminSession`) + role in `canAccessAdminPanel` + route-specific role map. Unauthenticated users redirect to `/admin/login`. Wrong role redirects with `accessDenied=1`. Server functions re-check `assertStaffInboxAccess` — URL knowledge alone insufficient.

---

## 6. Security Review

| Check | Result |
|-------|--------|
| Browser → workflow tables | **PASS** — no component/route matches |
| `act_on_student_request_step` in UI | **PASS** — zero matches |
| Workflow table name in src | **PASS** — only error-string detection in `student-request-rpc.ts:62` |
| Public attachment URLs | **PASS** — signed URLs via server fn (300s) |
| form_data XSS | **PASS** — escaped text rendering, no `dangerouslySetInnerHTML` |
| Admin type config client writes | **PASS** — server-only |
| Role escalation from UI | **PASS** — none |

---

## 7. Validation Results

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** (exit 0, ~38–125s) |
| `git diff --check` | **PASS** |
| `git restore --worktree src/routeTree.gen.ts` | **PASS** |
| `git grep act_on_student_request_step -- src` | **0 matches** |
| `git grep workflow tables -- src` | **1 match** — `student-request-rpc.ts:62` (error detection only) |

---

## 8. PR Scope and Runtime Gate

### Files in PR (explicit paths)

**Libraries**
- `src/lib/student-requests/request-type-registry.ts`
- `src/lib/student-requests/request-form-registry.ts`
- `src/lib/student-requests/request-eligibility-ui.ts`
- `src/lib/student-requests/staff-inbox-ui.ts`
- `src/lib/student-requests/staff-inbox.functions.ts`
- `src/lib/admin-request-types.functions.ts`
- `src/lib/admin-student-requests.functions.ts`
- `src/lib/admin-reports.functions.ts`
- `src/lib/student-affairs.functions.ts`
- `src/lib/student-request-rpc.ts`
- `src/lib/student-request-timeline.ts`

**Components**
- `src/components/admin/RequestTypeConfigDialog.tsx`
- `src/components/student-requests/DynamicStudentRequestForm.tsx`
- `src/components/student-requests/StudentRequestEligibilityNotice.tsx`
- `src/components/student-requests/StaffInboxShell.tsx`
- `src/components/student-requests/StaffRequestInbox.tsx`
- `src/components/student-requests/StaffRequestDetailPanel.tsx`
- `src/components/student-requests/StudentRequestFormDataView.tsx`
- `src/components/student-requests/StaffRequestWorkflowTimeline.tsx`
- `src/components/student-requests/StaffRequestActionPanel.tsx`

**Routes**
- `src/routes/admin/request-types.tsx`
- `src/routes/admin/student-requests.lazy.tsx`
- `src/routes/admin/reports.tsx`
- `src/routes/student.requests.new.tsx`
- `src/routes/student.requests.index.tsx`
- `src/routes/mobile.student.requests.tsx`

**Docs**
- `docs/STUDENT-REQUESTS-P2-CODE-NORMALIZATION-01-REPORT.md`
- `docs/STUDENT-REQUESTS-P3-ADMIN-TYPE-CONFIG-UI-01-REPORT.md`
- `docs/STUDENT-REQUESTS-P4-DYNAMIC-FORM-FOUNDATION-01-REPORT.md`
- `docs/STUDENT-REQUESTS-P5-ELIGIBILITY-AVAILABILITY-UI-GUARD-01-REPORT.md`
- `docs/STUDENT-REQUESTS-P6-STAFF-INBOX-UI-FOUNDATION-01-REPORT.md`
- `docs/STUDENT-REQUESTS-STAGING-APPLY-02-REPORT.md`
- `docs/STUDENT-REQUESTS-P2-P6-INTEGRATION-REVIEW-PR-01-REPORT.md`

**Not included:** `docs/STUDENT-REQUESTS-STAGING-ENV-GATE-01-REPORT.md` (file absent from repo).

### Runtime activation gate

Per `STUDENT-REQUESTS-STAGING-APPLY-02-REPORT.md` (**NO_GO**): no staging DB confirmed, no migrations applied, no backup. Workflow runtime activation remains blocked until staging apply + STAGING-ENV-GATE clearance. This PR is **UI foundations only**.

### Constraints confirmation

| Constraint | Status |
|------------|--------|
| No migrations applied | ✅ |
| No Supabase apply | ✅ |
| No workflow seed | ✅ |
| No real staff actions | ✅ (buttons disabled) |
| No production DB changes | ✅ |
| Do not merge (Draft PR) | ✅ |
