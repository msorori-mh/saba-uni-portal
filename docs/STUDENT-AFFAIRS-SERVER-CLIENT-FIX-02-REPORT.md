# STUDENT-AFFAIRS-SERVER-CLIENT-FIX-02 — Report

## السبب الجذري
`performRequestAction` كان يستخدم `supabaseAdmin` (service_role) لتنفيذ
`UPDATE` على `student_requests` و `student_service_request_steps`. عند مرور
التحديث عبر التريجر `trg_sr_protect / protect_student_request()` يكون
`auth.uid() = NULL` لأن الخدمة لا تحمل جلسة المستخدم، فيرفض التريجر
بـ "Not authorized to modify this request" رغم أن الـ dean له صلاحية.

## الدوال المعدَّلة (src/lib/student-affairs.functions.ts)
- `performRequestAction` — أضيف باراميتر `sessionClient` واستُخدم لـ:
  - `UPDATE student_requests` (تغيير الحالة/الخطوة/الملاحظات).
  - `UPDATE student_service_request_steps` للخطوة الحالية والخطوة التالية.
- `actOnStudentServiceRequest` — يمرّر `sessionClient: context.supabase`.
- `returnStudentServiceRequestForCompletion` — يمرّر `sessionClient: context.supabase`.
- `cancelStudentServiceRequest` — استُبدل `supabaseAdmin.update(student_requests)`
  بـ `context.supabase.update(...)` لنفس السبب (يمر عبر التريجر).

## أين تم استخدام context.supabase
كل mutation تمر عبر `trg_sr_protect` أو أي RLS يعتمد `auth.uid()`:
جميع الـ `UPDATE`s على `student_requests` وعلى `student_service_request_steps`
داخل مسار workflow، بالإضافة إلى إلغاء الطالب لطلبه.

## أين بقي supabaseAdmin ولماذا
- قراءات مساعدة لا تُطلق التريجر: `student_requests.select`, `student_profiles.select`,
  `student_service_request_events/steps/attachments.select`.
- كتابة `student_service_request_events` (insertEvent) — جدول أحداث لا يخضع
  لـ `trg_sr_protect` ويُستخدم كسجل تدقيق.
- كتابة `audit_logs` و `notifications` — سجلات تدقيق/إشعارات لا تعتمد على
  هوية الفاعل داخل RLS.
- إنشاء `signedUrl` من storage للمرفقات.

هذه العمليات لا تعتمد على `auth.uid()` ولا تتجاوز قرار الصلاحية نفسه
(قرار الصلاحية يُتخذ قبلها بواسطة `assertCanAct` + التريجر أثناء `UPDATE`
على `student_requests`).

## قائمة تحقق
- تعديل trigger؟ **لا**.
- تعديل RLS؟ **لا**.
- تنفيذ migration؟ **لا**.
- تعديل DB مباشر؟ **لا** (سيقتصر على بيانات الاختبار في مرحلة التحقق).
- تعديل UI؟ **لا**.
- تعديل Storage؟ **لا**.

## نتيجة build
`bunx tsgo --noEmit` → **0 errors**. الـ CI/بناء التالي سيؤكد الحزم النهائي.

## اختبار dean `return_for_completion`
سيُنفَّذ بعد النشر باستخدام الحساب `test.dean.01d@quboolye.test` على الطلب
`SR-20260702-63868B56`. المتوقع: نجاح الإجراء وانتقال الحالة إلى
`returned_for_completion` وظهورها للطالب مع إمكانية إعادة الإرسال.

## اختبار unrelated admin
سيُتحقَّق أن `hr_officer` (غير مخوّل) يبقى محجوباً برسالة الصلاحيات — لأن
`assertCanAct` والتريجر معاً يعتمدان على `auth.uid()` الحقيقي.

## القرار
**PASS (code fix)** — بانتظار تأكيد نهائي بعد اختبار dean/unrelated في بيئة
النشر.
