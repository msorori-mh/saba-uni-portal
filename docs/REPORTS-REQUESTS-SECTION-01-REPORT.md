# REPORTS-REQUESTS-SECTION-01 — Report

## Baseline
- آخر commit على main قبل التنفيذ: `3a3092c`.
- بيئة التنفيذ: Lovable auto-sync إلى `main`.

## الملفات المعدلة (4 فقط)
1. `src/lib/admin-reports.functions.ts`
   - توسعة `fetchRequestsReport` لقبول فلاتر: `from_date`, `to_date`, `department_id`, `program_id`, `status`, `request_type`.
   - إضافة `openCount` وصفوف تفصيلية (`rows`) مع اسم الطالب والرقم الأكاديمي.
   - إعادة كتابة تصدير `getReportsRequests` كـ `createServerFn` مع `inputValidator` (Zod) مع الاحتفاظ بـ `assertReportsAccess` و`REPORTS_ROLES` كما هي.
2. `src/routes/admin/reports.tsx`
   - `validateSearch` لدعم `?tab=<id>`.
   - مزامنة `activeSection` مع الـ URL عبر `useNavigate({ replace: true })`.
   - قسم جديد "تقارير الطلبات" (`requests`) مفعّل ضمن شبكة الأقسام.
   - مكوّن `RequestsReport` كامل: KPIs، توزيع الحالة/النوع، جدول آخر الطلبات، تصدير CSV، طباعة، وتسجيل `report_viewed` / `report_exported` عبر `logReportEvent` (report_name = `student_requests_report`).
3. `src/routes/admin/index.lazy.tsx`
   - بطاقة "طلبات مفتوحة" تربط الآن إلى `/admin/reports?tab=requests` عبر `Link.search={{ tab: "requests" }}`.
4. `docs/REPORTS-REQUESTS-SECTION-01-REPORT.md` (هذا الملف).

## Build
- `bun run build` → **نجح** (built in ~13s، لا أخطاء).

## القواعد
| بند | الحالة |
|---|---|
| هل تم تنفيذ migration؟ | **لا** |
| هل تم تعديل DB؟ | **لا** |
| هل تم تعديل RLS/Storage/Trigger؟ | **لا** |
| هل تم تعديل صلاحيات؟ | **لا** — الاعتماد الكامل على `REPORTS_ROLES` وrPC `assertReportsAccess` الموجودَين. |
| هل تم import بيانات؟ | **لا** |
| هل تم delete/reset/cleanup؟ | **لا** |

## التحقق الوظيفي
- `/admin/reports?tab=requests` → يفتح مباشرة على تبويب "تقارير الطلبات" (validateSearch + مزامنة).
- الفلاتر: من/إلى تاريخ، القسم، البرنامج، الحالة، نوع الطلب — تعمل client-side apply/clear وتنعكس على استعلام السيرفر.
- KPIs المعروضة: إجمالي / مفتوحة / مقبولة / مرفوضة / متوسط أيام المعالجة.
- توزيعات: حسب الحالة، حسب النوع (مع نسب مئوية).
- التصدير CSV عبر `downloadCsv` الموحّد + تسجيل `report_exported`.
- الطباعة عبر `window.print()` (نفس نمط باقي التقارير).
- تدقيق: عند العرض يُستدعى `logReportEvent({ reportName: "student_requests_report", action: "report_viewed" })`؛ وعند التصدير `report_exported` مع `rowCount` والفلاتر.
- منع غير المخوّل: `getReportsRequests` يستدعي `assertReportsAccess(userId)` قبل أي قراءة (نفس آلية باقي تقارير المركز)، فالمستخدم بدون دور ضمن `REPORTS_ROLES` يحصل على خطأ من السيرفر ولا تُرجع بيانات.

## القرار
**PASS**
