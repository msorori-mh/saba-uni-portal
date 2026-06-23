# SECURITY-FULL-ASSURANCE-01 — Security Test Matrix & RLS/API Audit

**الكود:** SECURITY-FULL-ASSURANCE-01  
**التاريخ:** 23 يونيو 2026  
**النوع:** جرد قراءة فقط — لا اختبار هجومي، لا تعديل production  
**الفرع:** `security/full-assurance-01-matrix-rls-audit`  
**البيئة المرجعية:** `main` (قراءة كود + migrations محلية)

---

## 1. ملخص تنفيذي

تم إجراء جرد أمني شامل **قراءة/تحليل فقط** لبوابة كلية تكنولوجيا المعلومات — جامعة إقليم سبأ. الهدف بناء مصفوفة اختبار وتقارير RLS/API تمهّد لاختبارات آلية أو إصلاحات محددة لاحقاً.

**الحكم العام:** البوابة **جاهزة أمنياً للـ Pilot المحدود** مع **ثغرات/فجوات متوسطة** تحتاج اختباراً يدوياً/آلياً قبل التوسع — وليست «جاهزة للإطلاق العام» بدون إغلاق الفجوات أدناه.

| المحور | التقييم | ملاحظة |
|--------|---------|--------|
| RLS على الجداول الحساسة | 🟢 قوي | 126+ migration، سياسات متعددة الأدوار |
| Server functions auth | 🟢 جيد | ~44 ملف، `requireSupabaseAuth` شبه شامل |
| Admin route RBAC | 🟢 جيد | `admin.tsx` + `getAdminSession` + `NAV_ITEM_ROLES` |
| Client Supabase متبقٍ | 🟡 متوسط | portals + `AdminShell` badge + schedule preview |
| IDOR / ownership | 🟡 يحتاج اختبار | domain checks موجودة لكن غير مُختبرة آلياً |
| Anon surface | 🟡 مراجعة | `class_schedule`, `verify_document`, rate limit RPC |
| Audit coverage | 🟡 جزئي | scoped RLS (RBAC-06)؛ ليس كل العمليات تُسجّل |

---

## 2. نطاق الجرد

### شُمّل

- الأدوار في `authz.server.ts`, `admin-nav.ts`, migrations
- 43+ مسار `/admin/*` (عدا `/admin/login`)
- ~200+ server function exports عبر 44 ملف `*.functions.ts`
- RLS policies في `supabase/migrations` (CREATE/ALTER POLICY, ENABLE RLS)
- أسطح: imports, schedule import, documents, storage, auth, audit

### لم يُشمّل (خارج هذه المرحلة)

- اختبار هجومي / fuzzing / brute force على production
- اختبار runtime على `quboolye.com`
- مراجعة infra Lovable Cloud / Supabase dashboard settings
- Penetration test خارجي
- تحليل dependencies (npm audit)
- Mobile app native layer (Capacitor) بعمق

---

## 3. الأدوار المستخرجة من الكود

| الدور | مصدر | ملاحظة |
|-------|------|--------|
| `system_admin` | authz, admin-nav, RLS | صلاحيات كاملة تقريباً |
| `admin` | authz, admin-nav, RLS | super-admin legacy |
| `dean` | authz, admin-nav, RLS | audit scoped |
| `vice_dean` | migrations RLS فقط | **غير موجود في `ADMIN_PANEL_ROLES`** — قد يُربط عبر catalog |
| `registrar` | authz, admin-nav | طلاب/تسجيل/imports |
| `student_affairs` | authz, admin-nav | طلاب/طلبات |
| `finance_officer` | authz, admin-nav | مالية/imports fees |
| `hr_officer` | authz, RLS RBAC-05/06 | staff/faculty scope |
| `department_head` | admin-nav | grades/enrollments scoped |
| `faculty_member` | authz priority, faculty portal | ليس admin panel |
| `student` | student portal | ليس admin |
| `graduate` | authz priority | alumni |
| `staff` | staff portal (implicit) | ليس في `ADMIN_PANEL_ROLES` |

**ثنائيات أدوار:** `user_roles` (legacy) + `user_role_assignments` + `roles_catalog.app_role_mapping` — `userRoles()` يدمجها.

---

## 4. أهم 5 مخاطر مكتشفة (تحليل ثابت)

| # | المخاطرة | الشدة | السبب |
|---|----------|-------|-------|
| R1 | **Schedule import preview على client JWT** | 🟠 | `ScheduleImportPanel` → `loadScheduleLookups()` بدون admin inject؛ قد يختلف عن server execute |
| R2 | **`class_schedule` anon SELECT `USING (true)`** | 🟠 | migration `20260531232114` — أي زائر قد يقرأ جداول (إن وُجد GRANT) |
| R3 | **`checkPublicRateLimit` fail-open** | 🟡 | عند RPC error → `allowed: true` — by design لكن يحتاج مراقبة |
| R4 | **`AdminShell` client read `contact_messages`** | 🟡 | badge sidebar عبر JWT client؛ يعتمد على RLS |
| R5 | **`revalidateBulkImportRows` بدون `updateExisting`** | 🟡 | preview قد يختلف عن import عند toggle update — drift معروف |

---

## 5. أهم 5 اختبارات للمرحلة التالية

| # | الاختبار | الهدف |
|---|----------|-------|
| T1 | **Student IDOR** — `getMyProgress`, `getUnofficialTranscriptData`, `document-view` | UUID طالب آخر → 403 |
| T2 | **Admin route bypass** — استدعاء server fn بدون token / بدور خاطئ | كل endpoints حساسة |
| T3 | **Registrar vs finance** — `runBulkImport` student_fees vs students | role separation |
| T4 | **Anon `verify_document` + class_schedule** | لا PII/ZPI leakage |
| T5 | **Audit log scope** — dean/hr/registrar reads | entity_type filtering matches RBAC-06 |

---

## 6. التوصيات

### قصيرة المدى (قبل Pilot)

1. تنفيذ **T1–T5** يدوياً على staging ببيانات اختبار مصطنعة (لا production PII).
2. إكمال **ADM-002 batch-5** (schedule preview server-side).
3. نقل **AdminShell `contact_messages` count** إلى server function.
4. توثيق/اختبار **`vice_dean`** إن كان دوراً فعلياً في production.

### متوسطة المدى

5. اختبارات Playwright/API automated per `security-test-plan.md`.
6. مراجعة سياسات **anon** على `class_schedule`, `course_sections`, `course_offerings`.
7. IDOR test suite لكل endpoint يقبل `*_id` في input.
8. Rate limit fail-closed option للعمليات الحساسة (config flag).

### طويلة المدى

9. Security regression في CI (static grep + smoke auth tests).
10. Periodic RLS policy diff review عند كل migration.

---

## 7. المراحل التالية

| المرحلة | الوصف |
|---------|--------|
| **SECURITY-FULL-ASSURANCE-02** | تنفيذ اختبارات T1–T5 على staging |
| **SECURITY-FULL-ASSURANCE-03** | Playwright auth matrix automation |
| **ADM-002 batch-5** | Schedule preview server-side |
| **SEC-009** (مقترح) | AdminShell + remaining client supabase reduction |

---

## 8. الملفات المرافقة

| ملف | المحتوى |
|-----|---------|
| [admin-route-access-matrix.md](./admin-route-access-matrix.md) | صفحات `/admin/*` |
| [rls-table-access-matrix.md](./rls-table-access-matrix.md) | جداول + RLS |
| [server-functions-authz-audit.md](./server-functions-authz-audit.md) | server functions |
| [security-test-plan.md](./security-test-plan.md) | خطة اختبار قادمة |

---

## 9. تأكيدات هذه المرحلة

- ❌ لم تُنشأ migrations
- ❌ لم تُطبَّق migrations
- ❌ لم تُعدَّل بيانات production
- ❌ لم يُجرَ هجوم على production
- ❌ لم يُعدَّل كود التطبيق (توثيق فقط)
