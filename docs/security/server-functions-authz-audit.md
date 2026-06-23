# Server Functions Authorization Audit

**النطاق:** `src/lib/**/*.functions.ts` (44 ملف، ~200 export)  
**تاريخ الجرد:** 2026-06-23  
**Legend:** ✅ جيد | ⚠️ يحتاج اختبار | 🔴 يحتاج إصلاح لاحق

---

## 1. ملخص

| البند | العدد/الحالة |
|-------|--------------|
| ملفات `*.functions.ts` | 44 |
| Endpoints بدون `requireSupabaseAuth` | **1** (`checkPublicRateLimit`) — allowlist مقصود |
| تستخدم `supabaseAdmin` | ~40 ملف |
| تستخدم `assertAnyRole` / authz helpers | ~35 ملف |
| Domain ownership checks | academic-status, transcript, document-audit, student-requests |
| Rate limit | imports, admin-users provision, schedule import |

---

## 2. Endpoints بدون auth (allowlist)

| Function | File | Auth | Rate limit | Classification | Notes |
|----------|------|------|------------|----------------|-------|
| `checkPublicRateLimit` | `rate-limit.functions.ts` | ❌ | self | ✅ | pre-login; fail-open on RPC error — ⚠️ monitor |

---

## 3. Admin session & layout

| Function | Auth | Role check | Admin DB | R/W | Audit | IDOR | Class |
|----------|------|------------|----------|-----|-------|------|-------|
| `getAdminSession` | ✅ | panel implicit | ✅ userRoles | R | ❌ | ❌ | ✅ |

---

## 4. Imports (`imports.functions.ts`) — سطح حساس

| Function | Auth | Roles | Admin | Write | Audit | Rate | Class |
|----------|------|-------|-------|-------|-------|------|-------|
| `validateBulkImportPreview` | ✅ | panel + per-type | ✅ | ❌ | ❌ | ❌ | ✅ |
| `runBulkImport` | ✅ | panel + per-type | ✅ | ✅ | ✅ import_logs | ✅ | ✅ |
| `getImportStats` | ✅ | panel | ✅ | ❌ | ❌ | ❌ | ✅ |
| `listImportHistory` | ✅ | panel | ✅ | ❌ | ❌ | ❌ | ✅ |
| `getScheduleImportLookups` | ✅ | SCHEDULE_PANEL | ✅ | ❌ | ❌ | ❌ | ✅ |
| `runScheduleImport` | ✅ | panel + write | ✅ RPC | ✅ | ✅ | ✅ | ✅ |
| `logScheduleImport` | ✅ | panel | ✅ | ✅ | ✅ | ❌ | ✅ |

**⚠️:** `revalidateBulkImportRows` ignores `updateExisting` — drift with preview (known).

---

## 5. Users & roles — 🔴 عالية الحساسية

| Module | Key functions | Auth | Role | Ownership | Class |
|--------|---------------|------|------|-----------|-------|
| `admin-users.functions.ts` | listUsers, createAccount, resetPassword, setActive, addRole, removeRole, removeLoginAccount, createAdminAccount | ✅ | per-kind roles | ❌ | ✅ / ⚠️ IDOR on userId |
| `roles-management.functions.ts` | listRoles, createRole, assignUserRole, … | ✅ | assertAdmin | ❌ | ✅ |
| `faculty-accounts.functions.ts` | create/link/reset/import | ✅ | hr/admin | ❌ | ⚠️ bulk import rows |
| `admin-session.functions.ts` | getAdminSession | ✅ | implicit | ❌ | ✅ |

---

## 6. People & students

| Module | Functions | Auth | Role helpers | Ownership | Class |
|--------|-----------|------|--------------|-----------|-------|
| `admin-students.functions.ts` | CRUD, provisionStudentLogin | ✅ | STUDENT_* | ❌ | ✅ |
| `admin-people.functions.ts` | faculty/staff CRUD | ✅ | FACULTY_CMS / hr | dept scope server | ⚠️ test hr scope |
| `academic-status.functions.ts` | getStudentProgress, getMyProgress, searchStudents, … | ✅ | STUDENT_READ + ownership | ✅ isOwnerStudent | ⚠️ test IDOR |
| `admin-student-requests.functions.ts` | list, update status, attachment URL | ✅ | assertRequestsAdmin + workflow | ⚠️ path-based | ⚠️ attachment IDOR |
| `admin-enrollments.functions.ts` | CRUD enrollments | ✅ | registrar roles | ❌ | ✅ |
| `admin-grades.functions.ts` | grid, approve, return | ✅ | admin/dept | section scope | ⚠️ |

---

## 7. Academic & documents

| Module | Functions | Auth | Notes | Class |
|--------|-----------|------|-------|-------|
| `transcript.functions.ts` | searchStudentsForTranscript, getUnofficialTranscriptData | ✅ | assertTranscriptAccess / ownership | ✅ |
| `document-audit.functions.ts` | logDocumentAction | ✅ | assertDocumentViewAccess | ✅ |
| `admin-documents.functions.ts` | list, issue, cancel | ✅ | DOCUMENT_ADMIN_ROLES | ✅ |
| `admin-course-offerings.functions.ts` | offerings/sections CRUD | ✅ | registrar | ✅ |
| `admin-study-plans.functions.ts` | plans/courses | ✅ | registrar | ✅ |
| `admin-finance.functions.ts` | fees, payments, receipts URL | ✅ | finance roles | ⚠️ signed URL path |

---

## 8. Executive, ops, audit

| Module | Functions | Auth | Roles | Class |
|--------|-----------|------|-------|-------|
| `executive-dashboard.functions.ts` | scope, KPIs, log viewed | ✅ | EXEC_ROLES | ✅ |
| `executive-analytics.functions.ts` | analytics, export log | ✅ | EXEC | ✅ |
| `admin-operations.functions.ts` | getOperationsOverview | ✅ | OPERATIONS | ✅ |
| `admin-reports.functions.ts` | report aggregates | ✅ | REPORTS | ⚠️ reads all students via admin |
| `admin-audit-log.functions.ts` | listAuditLogs | ✅ | AUDIT_LOG_FULL_READ | ✅ app-level; RLS also scoped |
| `ops-audit.functions.ts` | logOperationsEvent | ✅ | OPERATIONS | ✅ |
| `report-audit.functions.ts` | logReportEvent | ✅ | REPORTS | ✅ |
| `admin-data-cleanup.functions.ts` | preview, run cleanup | ✅ | admin | 🔴 **destructive** — test carefully |

---

## 9. Pilot, automation, org

| Module | Auth | Manage vs read | Class |
|--------|------|----------------|-------|
| `pilot.functions.ts` (16 fn) | ✅ | assertPilotRead/Manage | ✅ |
| `automation.functions.ts` | ✅ | read vs manage split | ✅ |
| `org-structure.functions.ts` | ✅ | read dean; write admin | ✅ |

---

## 10. Communications & email

| Module | Functions | Auth | Notes | Class |
|--------|-----------|------|-------|-------|
| `communications.functions.ts` | announcements, messages, stats | ✅ | COMMUNICATIONS_ADMIN + student/faculty branches | ⚠️ complex role matrix |
| `email.functions.ts` | sendNotificationEmail | ✅ | EMAIL_SENDER_ROLES | ✅ |

---

## 11. CMS & low sensitivity

| Module | Class |
|--------|-------|
| `admin-news/events/research.functions.ts` | ✅ assertAdmin |
| `admin-contacts/settings/departments.functions.ts` | ✅ assertAdmin |
| `admin-storage.functions.ts` | ✅ assertAdmin + bucket validation |
| `admin-dashboard.functions.ts` | ✅ mixed roles per endpoint |
| `admin-system-readiness.functions.ts` | ✅ admin — read-only checks |

---

## 12. IDOR hotspots — ⚠️ يحتاج اختبار

| Endpoint | Parameter | Mitigation in code | Test |
|----------|-----------|-------------------|------|
| `getStudentProgress` | studentProfileId | hasAnyRole OR isOwnerStudent | UUID swap |
| `getUnofficialTranscriptData` | studentProfileId | assertTranscriptAccess | UUID swap |
| `logDocumentAction` | documentId | assertDocumentViewAccess | UUID swap |
| `getStudentRequestAttachmentUrl` | path | server-side path validation | path traversal |
| `getPaymentReceiptFileUrl` | path | finance fn | path traversal |
| `getStudent` | id | assertStudentRead | UUID swap |
| `updateStudentRequestStatus` | requestId | workflow + admin check | cross-dept |
| `listUsers` | kind/search | role per kind | info leak |

---

## 13. supabaseAdmin bypass — مقصود

Server functions **تتجاوز RLS عمداً** via `supabaseAdmin`. الأمان يعتمد على:

1. `requireSupabaseAuth` — JWT valid
2. `assertAnyRole` / domain checks — authorization
3. Input validation (zod)
4. Rate limits where applied

**خطر:** أي endpoint بـ auth ضعيف + admin client = full DB access.

---

## 14. توصيات إصلاح لاحق (لا تنفيذ الآن)

| Priority | Item |
|----------|------|
| 🔴 | Automated IDOR tests for section 12 |
| 🟠 | Rate limit on `checkPublicRateLimit` abuse |
| 🟠 | `runDataCleanup` — extra confirmation + audit |
| 🟡 | Standardize audit on all write endpoints |
| 🟡 | `communications` — document role matrix in authz.server |

---

## 15. File index (44 files)

All listed files use `createServerFn` except noted. Auth ✅ = has `requireSupabaseAuth` on handlers.

`imports`, `admin-users`, `admin-students`, `admin-people`, `admin-finance`, `admin-student-requests`, `academic-status`, `transcript`, `document-audit`, `communications`, `pilot`, `automation`, `org-structure`, `executive-*`, `admin-operations`, `admin-reports`, `admin-audit-log`, `roles-management`, `faculty-accounts`, `admin-data-cleanup`, `admin-grades`, `admin-dashboard`, `admin-academic-*`, `admin-enrollments`, `admin-course-offerings`, `admin-study-plans`, `admin-documents`, `admin-request-types`, `admin-faculty`, `admin-news/events/research`, `admin-contacts/settings/departments/storage`, `admin-system-readiness`, `email`, `ops-audit`, `report-audit`, `admin-session`, `rate-limit` (1 public).
