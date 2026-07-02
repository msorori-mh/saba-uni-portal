# PORTAL-REPORTING-COVERAGE-AUDIT-01 — REPORT

**التاريخ**: 2026-07-02  
**النطاق**: `/admin/reports`, `src/lib/admin-reports.functions.ts`, `src/lib/reports/*`, `src/lib/admin-audit-log.functions.ts`, `src/lib/imports.functions.ts`.  
**النوع**: تحقق قراءة فقط — لا تعديل كود/DB/RLS.

---

## 1) خريطة نظام التقارير الحالي

### 1.1 صفحة `/admin/reports` (8 أقسام معلنة)
| id | العنوان | الحالة في UI |
|---|---|---|
| `students` | تقارير الطلاب | **نشط** ← `<StudentsReport />` |
| `imports` | تقارير الاستيراد | **نشط** ← `<ImportJobsReport />` |
| `accounts` | تقارير حسابات الطلاب | **نشط** ← `<StudentAccountsReport />` |
| `academic` | التقارير الأكاديمية | **نشط** ← `<AcademicReports />` (4 تقارير) |
| `schedules` | تقارير الجداول والإسناد | **نشط** ← `<ScheduleReports />` (7 تقارير) |
| `faculty` | تقارير أعضاء هيئة التدريس | **Coming Soon** |
| `documents` | تقارير الوثائق والخدمات | **Coming Soon** |
| `audit` | تقارير التدقيق والأمان | **Coming Soon** |

### 1.2 Server Functions المتاحة في `src/lib/admin-reports.functions.ts`
- **مربوطة بالـ UI**: `getStudentsReportForAdmin`, `getImportJobsReportForAdmin`, `getImportJobErrorsForAdmin`, `getStudentAccountsReportForAdmin`, `getAcademicReportLookupsForAdmin`, `getAcademicProgramsReportForAdmin`, `getStudyPlansReportForAdmin`, `getCoursesReportForAdmin`, `getStudyPlanCoverageReportForAdmin`, `getScheduleReportLookupsForAdmin`, `getCourseAssignmentsReportForAdmin`, `getUnassignedCoursesReportForAdmin`, `getStudyGroupsReportForAdmin`, `getTimetableReportForAdmin`, `getRoomUtilizationReportForAdmin`, `getFacultyLoadReportForAdmin`, `getScheduleConflictIndicatorsForAdmin`.
- **موجودة لكن غير مربوطة بالـ UI (Legacy dashboards)**: `getReportsAcademic`, `getReportsPerformance`, `getReportsEnrollment`, `getReportsFaculty`, `getReportsRequests` (يحسب `total/approved/rejected/avgDays/byType/byStatus`), `getReportsFinancial`.
- **تدقيق**: `src/lib/reports/report-audit.functions.ts::logReportEvent` (view/export → `log_audit` RPC).

### 1.3 التصدير والفلاتر
- CSV + XLSX (lazy-load) عبر `src/lib/reports/export.ts` مع BOM لدعم العربية.
- كل التقارير النشطة تدعم فلاتر تاريخ + قسم + برنامج + مستوى + نظام دراسة + حالة، بحسب طبيعة كل تقرير.
- الصلاحيات: `REPORTS_ROLES = [system_admin, admin, dean, registrar, finance_officer, student_affairs]` عبر `assertReportsAccess`.

---

## 2) تقييم المحاور المطلوبة

### أ) التقارير الأكاديمية ✅
- الطلاب حسب القسم/البرنامج/المستوى/الحالة/نظام الدراسة/الحساب: **موجود** (`StudentsReport` + KPIs 6 + جداول توزيع).
- الخطط، المقررات، تغطية الخطط، الساعات، البرامج/الأقسام: **موجود** (4 تقارير في `AcademicReports`).

### ب) تقارير شؤون الطلاب ⚠️ ناقص في الـ UI
- **البيانات موجودة**: `student_requests` + `student_service_request_events` + `student_service_request_steps` + `audit_logs`.
- **الدالة موجودة**: `getReportsRequests` تحسب: إجمالي/معتمد/مرفوض/متوسط أيام المعالجة/byType/byStatus.
- **الفجوة**: لا يوجد قسم "تقارير الطلبات" في `/admin/reports` (activeSection يستثني `requests` كلياً). كما لا يوجد تفصيل:
  - الطلبات المعلقة/المعادة للاستكمال/حسب البرنامج والمستوى.
  - العمر الحالي (`age at status`) لكل طلب متأخر.
  - Drill-down على مستوى الطلب.
- **مطلوب قبل Pilot** (High).

### ج) تقارير أداء الموظفين ⚠️ بيانات فقط
- **البيانات موجودة جزئياً**:
  - `student_service_request_events` يحوي `actor_id, event_type, from_status, to_status, created_at` → كافٍ لعدد الإجراءات/الموافقات/الرفض/الإرجاع لكل موظف.
  - `audit_logs` يحوي كل إجراء إداري (actor/entity/action/notes/created_at) → كافٍ لآخر نشاط + الإجراءات الحساسة.
- **الفجوة**:
  - لا Server Function ولا UI. لا يوجد مقياس "الطلبات المتأخرة عند كل دور/موظف" (يتطلب join بين `student_requests.current_role_key` و `updated_at` وأعتاب SLA).
- **مطلوب قبل Pilot** (High — للحوكمة والمساءلة أثناء التجربة).

### د) تقارير الاستيراد ✅
- `ImportJobsReport` مع KPIs (total/completed/failed/processing/partial/dry_run) + فلاتر (نوع، ملف، تاريخ، منفّذ، حالة).
- Drill-down للأخطاء عبر `getImportJobErrorsForAdmin` (top errors + عينة).
- الجدول المرجعي: `import_logs` (لا `import_jobs/import_errors` منفصلة). العدّاد المطلوب (مقبول/مرفوض/من نفّذ/متى/نوع/أخطاء متكررة) موجود.
- **PASS**.

### هـ) تقارير الأمن والصلاحيات ⚠️ ناقص في الـ UI
- **البيانات موجودة**:
  - `audit_logs`: كل إجراء حساس (role grants/revokes، فتح مرفقات، تسجيل تقارير مصدَّرة عبر `report_viewed/report_exported`).
  - `rate_limit_attempts`: محاولات مصادقة/إجراء متكررة.
  - `notifications`: تنبيهات النظام.
- **الفجوة**: قسم `audit` في `/admin/reports` ما زال Coming Soon. لا تقرير:
  - `accessDenied` / محاولات وصول غير مصرح.
  - تغييرات الأدوار (grant/revoke) عبر الزمن.
  - توليد Signed URLs للمرفقات (event مسجَّل في `audit_logs`؟ يحتاج تأكيد بيانات).
- **مطلوب قبل Pilot** (High — الحد الأدنى: عرض `audit_logs` قابل للفلترة).

### و) صلاحيات التقارير ✅
- Server-side gate عبر `assertReportsAccess` + `REPORTS_ROLES`.
- الطالب/غير المخول: تم التحقق سابقاً (PILOT-READINESS-AUDIT-01) — RLS يمنع + الصفحة تُعيد Unauthorized.
- Dean/registrar/student_affairs مضمَّنين. `finance_officer` يرى المالية عبر التقارير المشتركة.
- **PASS**.

### ز) جودة التقرير ✅ مع ملاحظات
- الفلاتر: تاريخ/قسم/برنامج/مستوى/نظام/حالة → موجودة.
- التصدير: CSV + XLSX ✓.
- **Pagination**: غير موجود — كل تقرير يجلب كل الصفوف عبر `fetchAll` (paged بحجم 1000 داخلياً). مقبول في Pilot (أحجام صغيرة: <200 طالب/<50 خطة/<100 وظيفة استيراد).
- **مخاطر أداء**: `fetchFinancialReport` و`fetchPerformanceReport` تجلب كل `student_fees/payments/receipts/discounts` — قد تصبح ثقيلة بعد التوسع، لكنها ليست في الـ UI حالياً.
- Console/Network: لا أخطاء مرصودة في آخر جلسة Pilot Readiness.

---

## 3) خريطة الفجوات

| الفجوة | البيانات | Server fn | UI | الأولوية |
|---|---|---|---|---|
| قسم "تقارير الطلبات" في `/admin/reports` | ✅ | ✅ (`getReportsRequests`) | ❌ | **Critical** |
| تفصيل طلبات: pending/returned/by program/level/age | ✅ | جزئي | ❌ | **High** |
| قسم "تدقيق وأمان" (عرض `audit_logs` مع فلاتر) | ✅ | ❌ | ❌ (Coming Soon) | **High** |
| تقرير أداء الموظفين (من `student_service_request_events`) | ✅ | ❌ | ❌ | **High** |
| تقرير تغييرات الأدوار (grant/revoke من `audit_logs`) | ✅ | ❌ | ❌ | **Medium** |
| تقرير `accessDenied` / محاولات الوصول | جزئي (`rate_limit_attempts`) | ❌ | ❌ | **Medium** |
| قسم "أعضاء هيئة التدريس" (Coming Soon) | ✅ | ✅ (`getReportsFaculty`) | ❌ | **Medium** |
| قسم "الوثائق والخدمات" (Coming Soon) — `official_documents` | ✅ | ❌ | ❌ | **Low** |
| Pagination للتقارير الكبيرة | — | — | ❌ | Low (بعد Pilot) |
| تقارير SLA (متأخر عند دور X > N ساعة) | تُشتق | ❌ | ❌ | Low → Medium بعد Pilot |

---

## 4) توصيات مرتبة

### 🔴 Critical (قبل Pilot)
1. **ربط قسم "تقارير طلبات شؤون الطلاب"** في `/admin/reports`: تفعيل تبويب `requests` جديد يستهلك `getReportsRequests` (موجود) + عرض KPIs (إجمالي/معتمد/مرفوض/معلق/معاد للاستكمال/متوسط أيام) + جدولين (byType, byStatus). المكونات جاهزة (KpiCard, TableCard).

### 🟠 High (قبل Pilot أو خلال الأسبوع الأول)
2. **قسم التدقيق والأمان**: عرض `audit_logs` قابل للفلترة (actor, entity_type, action_type, date range) — Server fn جديد + UI بسيط. الحد الأدنى للحوكمة أثناء التجربة.
3. **تقرير أداء الموظفين**: من `student_service_request_events` — group by `actor_id` × `event_type` مع آخر نشاط.
4. **تفصيل الطلبات حسب البرنامج/المستوى + العمر الحالي**: توسيع `fetchRequestsReport` أو دالة جديدة.

### 🟡 Medium (خلال Pilot)
5. تفعيل قسم `faculty` (الدالة `getReportsFaculty` موجودة — يحتاج UI فقط).
6. تقرير تغييرات الأدوار من `audit_logs.action_type IN ('role_granted','role_revoked')`.
7. تقرير محاولات وصول من `rate_limit_attempts`.

### 🟢 Low (بعد Pilot)
8. Pagination + Server-side aggregation للجداول التي قد تتجاوز 5K صف.
9. تقارير `official_documents` (إصدار السجل الرسمي).
10. لوحة SLA وتنبيهات تلقائية.

---

## 5) الأثر المطلوب لاحقاً

| العنصر | مطلوب؟ |
|---|---|
| Migration جديدة | **لا** (كل البيانات موجودة في `student_requests` + `student_service_request_events` + `audit_logs` + `import_logs`). لاحقاً قد يُضاف index على `student_service_request_events(actor_id, created_at)` للأداء. |
| Server function جديدة | **نعم** لاحقاً — لأقسام audit + performance + role changes. |
| تعديل UI | **نعم** — إضافة أقسام `requests`, `audit`, `faculty` وربطها. |
| RLS/Storage/Triggers | **لا**. |

---

## 6) مخاطر
- **حوكمة**: بدون قسم "تدقيق وأمان" و"أداء الموظفين"، ستكون المتابعة أثناء Pilot يدوية (استعلامات SQL مباشرة).
- **شفافية العمل**: بدون قسم "الطلبات" في `/admin/reports`، لا يستطيع العميد/شؤون الطلاب رؤية KPIs مركزية للطلبات رغم توفر الدالة.
- **أداء**: لا مخاطر حالية على أحجام Pilot (<200 طالب، <100 job).

---

## 7) الامتثال
- migration: **لا**. import: **لا**. delete/reset/cleanup: **لا**. تعديل DB/RLS/Storage/Triggers/كود: **لا**. تعديل حسابات اختبار: **لا**.

---

## القرار النهائي
**PASS WITH NOTES** — النظام قابل للانطلاق في Pilot بالتقارير الحالية (طلاب/استيراد/حسابات/أكاديمي/جداول)، لكن يُوصى بشدة قبل التوسع بإضافة **قسم تقارير الطلبات** (Critical — الدالة جاهزة) و**قسم التدقيق والأمان** (High) و**تقرير أداء الموظفين** (High).
