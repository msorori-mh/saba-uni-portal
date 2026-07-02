# PILOT-READINESS-AUDIT-01 — REPORT

**المشروع**: بوابة كلية IT & CS — جامعة إقليم سبأ  
**التاريخ**: 2026-07-02  
**النطاق**: التشغيل التجريبي المحدود على `quboolye.com`  
**النوع**: تحقق read-only فقط.

---

## 0) ملخص Sync

| العنصر | الحالة |
|---|---|
| آخر commit محلي | `b62fcbc — Fixed RLS for resubmit flow` |
| الإنتاج `quboolye.com/` | HTTP 200 يخدم آخر build (assets `/assets/index-DXB_A-j9.js`, `styles-C_Qymcr2.css`, …) |
| مطابقة GitHub main | نعم — HEAD الحالي يحوي fix RLS المدموج (`sr_update_self` يحوي `returned_for_completion` ✓) |

---

## 1) Authentication ✅
- `/portal-login`, `?type=faculty`, `?type=student` → 200.
- تسجيل دخول طالب (`student.test.01d`) عبر JWT: ناجح، توكن صحيح.
- تسجيل دخول شؤون طلاب (`student.affairs.test.01d`): دور `student_affairs_officer` مربوط.
- تسجيل دخول admin غير مخول (`unrelated.admin.test.01d`): ناجح ولكن بلا صلاحيات موسعة.
- لا redirect loop (تم فحص `/admin`, `/student`, `/portal-login` — كلها 200).
- لا صفحة بيضاء (homepage 73KB HTML سليم).

## 2) RBAC ✅
- Anon → `student_requests`, `student_request_attachments`, `user_role_assignments` = `[]` (RLS يخفي).
- Student يرى فقط طلبه (`SR-20260702-63868B56`) وملفه الشخصي وحده.
- Unrelated admin: 0 صفوف من `student_requests` و`student_request_attachments`.
- Dean action سابقاً = PASS (STUDENT-AFFAIRS-WORKFLOW-DEAN-ACTION-01).
- لا تسريب عبر روابط مباشرة (SELECT مقيد بـ `auth.uid()`).

## 3) Student Portal ✅
- `/student`, `/student/requests`, `/admin/student-requests` تعطي 200 على الإنتاج.
- طلب `SR-20260702-63868B56`:
  - `status = submitted` (بعد نجاح إعادة الإرسال).
  - `current_role_key = dean` (عاد للـ workflow).
  - `updated_at = 2026-07-02 04:45:59Z`.
- سياسة `sr_update_self` تحوي `returned_for_completion` في `USING` ✓.
- المرفقات: bucket `student-request-attachments` = **private** (`public=false`) → signed URLs فقط.

## 4) Admin ✅
كل المسارات ترجع 200:
`/admin`, `/admin/students`, `/admin/imports`, `/admin/study-plans`, `/admin/reports`, `/admin/student-requests`.

## 5) Academic Data ✅
| الحقل | القيمة |
|---|---|
| القسم/البرنامج | البكالوريوس في تكنولوجيا المعلومات |
| اسم الخطة | خطة بكالوريوس تكنولوجيا المعلومات |
| الحالة | active |
| عدد المقررات | **41** ✓ |
| مجموع الساعات (محسوب) | **115** ✓ |

ملاحظة: عمود cache `total_credit_hours=0` في جدول `study_plans`، لكن الواجهة تعرض المحسوب من `study_plan_courses` (تم إصلاحه سابقاً في REPORT-STUDY-PLANS-RELATIONSHIP-FIX-01) ولا تظهر "0 ساعة" في البطاقة.

## 6) Reports ✅
- تقارير الخطط تعمل (بعد إصلاح PostgREST relationship في `admin-reports.functions.ts`).
- لا `Could not embed because more than one relationship was found` في الكود الحالي.
- تقارير طلبات شؤون الطلاب مبنية على IDs مباشرة، لا JOIN غامض.

## 7) Imports ✅
- `/admin/imports` = 200. لم يتم تنفيذ أي import.
- القوالب موزعة سيرفرياً (server-side preview) — سلامة الصفحة مؤكدة عبر HTTP.

## 8) Security Regression ✅
- لا `SUPABASE_SERVICE_ROLE_KEY` في bundles العميل (كل bundle يستخدم publishable key).
- لا bucket عام للمرفقات (`student-request-attachments.public=false`).
- سياسات RLS نظيفة، لا `USING (true)` على جدول طلبات.
- لا 4xx/5xx على أي مسار مفحوص.
- Console errors: لم تُرصد في snapshot الحالي.

## 9) Production Health ✅
- `quboolye.com` HTTP 200، 73KB، عناوين RTL/AR صحيحة.
- Assets حديثة (hashes جديدة) — لا cache قديم.
- الصفحة الرئيسية تعرض محتوى (ليست بيضاء).
- بوابات الدخول (طالب/موظف) و`/admin` كلها 200.

---

## المخاطر المتبقية (منخفضة)
1. حساب `test.dean.01d@quboolye.test` بلا `role_code` صريح في `user_role_assignments` — عمل عبر آلية أخرى (`current_role_key`). يفضّل توثيق ذلك أو تعيين دور صريح قبل التوسّع خارج الاختبار.
2. عمود `study_plans.total_credit_hours` مخزَّن كـ 0. الواجهة تحسبه، لكن يفضّل ملء القيمة لاحقاً لتقارير خارجية.

## Compliance
- migration جديدة؟ **لا**.
- import؟ **لا**.
- delete/reset/cleanup؟ **لا**.
- تعديل DB/RLS/Storage/trigger/أدوار/حسابات اختبار؟ **لا**.
- نشر جديد؟ **لا** (الإنتاج بالفعل يخدم آخر build المدموج).

---

## القرار النهائي
**PASS** — النظام جاهز للتشغيل التجريبي المحدود مع الملاحظتين أعلاه.
