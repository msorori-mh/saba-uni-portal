# STUDENT-REQUEST-ENROLLMENT-CERTIFICATE-WORKFLOW-FOUNDATION-01A — Round 3

**Repository:** `msorori-mh/saba-uni-portal`  
**Branch:** `feature/enrollment-certificate-workflow-foundation-01a`  
**PR:** #115  
**Scope:** معالجة ملاحظتي المراجعة النهائية فقط، دون تطبيق migrations أو أي كتابة على قاعدة البيانات.

## المشكلة الأولى: صلاحية الدور لا تكفي

كانت دوال الرسوم تتحقق من الدور العام ومن إمكانية الوصول إلى الطلب، لكن ذلك لا يثبت أن المستخدم معين على **الخطوة النشطة الحالية**. قد يمتلك المستخدم وصولًا إلى الطلب بسبب خطوة أخرى في نفس دورة الحياة.

### المعالجة

أعيد تعريف الدالتين:

- `assess_student_request_fee`
- `confirm_student_request_fee_payment`

بعد تحميل الخطوة النشطة والتحقق من `action_type`، تُنفّذ القاعدة:

```sql
IF NOT public.is_current_user_admin_actor()
   AND NOT public.user_matches_workflow_runtime_step(v_runtime_step.id)
THEN
  RAISE EXCEPTION 'غير مصرح بتنفيذ الخطوة الحالية';
END IF;
```

وبذلك:

- مدير شؤون الطلاب لا يقيّم الرسوم إلا عندما يكون معينًا على خطوة `assess_fee` النشطة.
- مسؤول المالية لا يؤكد السداد إلا عندما يكون معينًا على خطوة `confirm_payment` النشطة.
- يبقى `admin/system_admin` هو الاستثناء الإداري الصريح.
- مجرد امتلاك صلاحية مشاهدة الطلب لا يمنح صلاحية تنفيذ الخطوة.

## المشكلة الثانية: بقاء خطوة المالية Pending عند الرسوم صفر

تهيئة runtime تنشئ جميع الخطوات مسبقًا؛ الخطوة الأولى `active` والبقية `pending`. عند اختيار المسار `fee_not_required` كان المسجل العام يُفعّل، لكن خطوة تأكيد الدفع تبقى معلقة.

### المعالجة

بعد تطبيق انتقال `fee_not_required`:

1. يُحدد ترتيب الخطوة التالية الفعلية.
2. تُحدد خطوات `confirm_payment` الواقعة بين خطوة تقييم الرسوم والخطوة التالية.
3. تتحول من `pending` إلى:
   - `status = skipped`
   - `decision = skipped`
   - تسجيل `completed_by` و`completed_at`
4. يُسجل workflow event داخلي بالنص:
   - `تم تجاوز خطوة المالية لعدم وجود رسوم`
5. لا يُنشأ إشعار دفع للطالب لأن الإشعار ما زال محصورًا داخل `IF v_amount > 0`.

هذه المعالجة لا تتجاوز أي خطوة مالية لاحقة خارج الفرع؛ فهي تقيد التخطي بالخطوات الوسيطة فقط باستخدام ترتيب الخطوات.

## الملفات المضافة

- `supabase/migrations/20260711050000_enrollment_certificate_workflow_round3_hardening.sql`
- `tests/student-requests/enrollment-certificate-workflow-round3.test.ts`
- هذا التقرير.

## الاختبارات المضافة

تغطي الاختبارات المصدرية:

- وجود تحقق assignment في دالة تقييم الرسوم قبل إنشاء التقييم.
- وجود تحقق assignment في دالة تأكيد الدفع قبل تعديل سجل الرسوم.
- تحويل خطوة المالية الوسيطة إلى `skipped`.
- تسجيل سبب التخطي في workflow events.
- استمرار حصر إشعار الدفع في `amount > 0`.
- فصل الخطوة التالية الفعلية عن الخطوات الوسيطة المتجاوزة.

## تحقق GitHub Actions النهائي

| الفحص | النتيجة |
|---|---|
| Migration Review — run 53 | PASS |
| Web CI: Install · Lint · Typecheck · Build — run 310 | PASS |

## الأمان ونطاق التنفيذ

- لا migration apply.
- لا Supabase/Lovable DB writes.
- لا seed.
- لا إنشاء طلب تجريبي.
- لا merge.
- لا Publish/Deploy.
- لا تعديل لبيانات الطلاب أو الطلبات الحالية.

## القرار

`PASS_PR115_REMEDIATION_ROUND_3_READY_FOR_REREVIEW`
