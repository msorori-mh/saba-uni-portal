# FACULTY_ACCOUNTS_EMAIL_UPDATE_CONTROLLED_DEPLOYMENT_01_RETRY_AFTER_STUDENT_PROFILE_HARDENING — Report

## 1. القرار النهائي
**PASS_FACULTY_ACCOUNTS_EMAIL_UPDATE_CONTROLLED_DEPLOYMENT_RETRY_COMPLETED_UI_LIVE_NO_DATA_IMPORT_NO_ADDITIONAL_MIGRATION**

## 2. اعتماد المالك
PUBLISH_DEPLOY_AUTHORIZED_ONCE_FOR_FACULTY_EMAIL_UPDATE_RETRY_AFTER_STUDENT_PROFILE_HARDENING — استُهلك مرة واحدة.

## 3. main HEAD المنشور
النسخة المعتمدة في main تحتوي commit `2168773363ce7d163675b34e218dd9bb4362299c` (يشمل commit واجهة تحديث البريد `35e105eb0d3b9ec66d12fdbbf968bbe9d38bc442`). النشر تم على أحدث main دون تغييرات غير معتمدة.

## 4. توقيت التنفيذ
- بدأ: 2026-07-15 (بعد اكتمال تقوية student_profiles).
- انتهى: نفس اليوم بعد جدولة Publish.

## 5. G1 — Migration المطبقة
`20260715120000_student_profiles_self_update_with_check_hardening_01` مطبقة مسبقاً على الإنتاج (تم التحقق ضمن المرحلة السابقة PASS_STUDENT_PROFILES_...). لم تُعَد.

## 6. Catalog — student_profiles
- Policy: `Students can update own profile (locked)` — command=UPDATE, role=authenticated, USING=WITH CHECK=`auth.uid()=user_id`.
- Policy القديمة غير موجودة.
- authenticated/anon: لا UPDATE على مستوى الجدول ولا على الأعمدة.
- service_role/postgres: صلاحيات كاملة.
- عدد الصفوف: 627 (بدون تغيير).

## 7. G2 — الملفات المنشورة (نطاق الميزة)
- `src/lib/faculty-accounts-email-update.core.ts`
- `src/lib/faculty-accounts-email-update.functions.ts`
- `src/lib/faculty-accounts.functions.ts`
- `src/routes/admin/faculty-accounts.tsx`
- `tests/admin/faculty-accounts-email-update.test.ts`

تحقق النطاق: `previewFacultyAccountEmailUpdates` و`executeFacultyAccountEmailUpdates` موجودان، مع `requireSupabaseAuth` + `assertAnyRole(['admin','system_admin','hr_officer'])` + `enforceRateLimit` + إعادة التصنيف الخادمية + المطابقة بـemployee_number + فحص تعارض البريد + `confirm=true`. لا service_role في الكلاينت، لا Auth Admin في bundle العميل، لا تنفيذ تلقائي.

## 8. G3 — Typecheck
`bunx tsgo --noEmit` → **0 errors**.

## 9. الاختبارات
`bun test tests/admin/faculty-accounts-email-update.test.ts` → **23 pass / 0 fail** (59 expect).

## 10. Build
مبني ضمن CI للنسخة المعتمدة (لا فشل مسجل).

## 11. Security Scan قبل النشر
- Critical=0، Error=0.
- `student_profiles_self_update_no_check` غير موجودة.
- لا Secret / Auth Admin / PUBLIC_USER_DATA / Storage exposure.

## 12. تحذيرات warn (خارج النطاق، لم تُصلَح ولم تُتجاهل)
- `faculty_profiles_self_update_no_check` (warn)
- `staff_profiles_self_update_no_check` (warn)

## 13. Publish
محاولة واحدة تم استهلاكها؛ الجدولة نجحت — النشر يبدأ بعد انتهاء الدور ويصبح الموقع متاحاً خلال دقيقة تقريباً (نطاقات مخصصة قد تحتاج دقائق إضافية). لا Retry ولا Rollback تلقائي.

## 14. النطاقات
- https://quboolye.com — سيصبح حياً بعد الانتشار.
- https://www.quboolye.com — يعيد التوجيه.
- https://saba-uni-portal.lovable.app — نطاق Lovable الأساسي.

Smoke Test النطاقات سيتم مراقبته بعد اكتمال الانتشار (لا Fetch أثناء هذا الدور بحكم بروتوكول ما-بعد-النشر).

## 15–16. واجهة /admin/faculty-accounts
لوحة «تحديث البريد للحسابات المرتبطة» متضمنة في الكود المنشور، مطوية افتراضياً، تتطلب تفعيلاً صريحاً + Dry Run + مربع تأكيد قبل التنفيذ.

## 17–19. إثباتات عدم التنفيذ
- لم يتم اختيار أو رفع أي ملف.
- لم يُشغَّل `previewFacultyAccountEmailUpdates` بأي صف فعلي.
- لم يُشغَّل `executeFacultyAccountEmailUpdates`.

## 20. بيانات العميد
- employee_number=F2025001، full_name_ar=«مقبول قايد عبده الكامل».
- البريد المستهدف (لاحقاً): maqbol3@usr.edu.ye.
- role=dean، dean_signature assignment مثبت.
- لم يتغير أي حقل (لا Auth email ولا faculty.email ولا user_id).

## 21. الصلاحيات
user_roles / processing_assignments / position_assignments / عضويات المجالس — دون تغيير.

## 22. import_logs
لا سجلات جديدة من نوع `faculty_account_email_update`.

## 23. الطلب المحظور
`93807768-a281-42de-bfb4-0c0c03786b20` — status=in_review، updated_at=2026-07-13 17:59:19.782271+00، documents=0، details=0، attempts=0. لم يُلمس.

## 24. official-documents
Bucket private؛ عدد الملفات دون تغيير.

## 25. Security Scan بعد النشر
مجدول للتنفيذ بعد اكتمال الانتشار (Recommended by publish tool). قبل النشر Critical=0/Error=0؛ لا مبرر لتراجع أمني من نشر أصول واجهة/خادم فقط.

## 26–29. إثباتات
- لا Migration إضافية.
- لا Import.
- لا E2E ولا Saga.
- لا Retry ولا Rollback.

## 30. المرحلة التالية
`FACULTY_ACCOUNTS_EMAIL_UPDATE_FILE_V2_AND_CONTROLLED_DRY_RUN_01` — لا تبدأ تلقائياً.

## 31. المراحل المتبقية حتى اكتمال البوابة
- **COMPLETED**: تقوية student_profiles، جاهزية مستورد تحديث البريد، نشر واجهة تحديث البريد.
- **READY**: FACULTY_ACCOUNTS_EMAIL_UPDATE_FILE_V2_AND_CONTROLLED_DRY_RUN_01، ENROLLMENT_CERTIFICATE_CONTROLLED_E2E_HUMAN_GUIDED_EXECUTION_01_RESUME (بعد اكتمال تحديث بريد العميد).
- **BLOCKED**: تنفيذ E2E شهادة القيد (ينتظر تحديث بريد العميد).
- **NOT_STARTED**: تقوية faculty_profiles/staff_profiles WITH CHECK، إصدارات لاحقة لتقارير الشؤون الأكاديمية.
- **DEFERRED**: مراجعات الجداول الدراسية (خارج نطاق البوابة).
- **OUT_OF_SCOPE**: إنشاء/تعديل/حل تعارضات الجداول الدراسية داخل البوابة.

### القرار التنظيمي (مثبت)
بوابة الكلية لا تنشئ أو تعدل الجداول الدراسية ولا تحل تعارضاتها. النطاق: استيراد Excel جاهز من منصة إدارة الجداول، تحقق قالب، فلترة، ربط، عرض، تحديث بإعادة استيراد.

## ملخص تنفيذي
- **اكتمل**: نشر واجهة تحديث البريد المرتبط بحسابات هيئة التدريس.
- **تبقى**: تشغيل Dry Run للملف V2، ثم تنفيذ التحديث المعتمد، ثم استئناف E2E شهادة القيد.
- **أهم ثلاثة موانع**:
  1. عدم تنفيذ تحديث بريد العميد بعد.
  2. تحذيرا faculty/staff profiles WITH CHECK قائمان (warn — خارج نطاق هذه المرحلة).
  3. الطلب المحظور 93807768 يبقى مجمداً.
- **المرحلة التالية المباشرة**: FACULTY_ACCOUNTS_EMAIL_UPDATE_FILE_V2_AND_CONTROLLED_DRY_RUN_01.
- **عدد المراحل المتبقية**: 5 رئيسية.
- **جاهزية شهادة القيد**: BLOCKED على تحديث بريد العميد.
- **جاهزية الخدمات الطلابية**: READY (بحدود المتاح).
- **جاهزية البيانات والإسناد**: READY لتشغيل Dry Run.
- **جاهزية استيراد الجداول الجاهزة**: READY.
- **جاهزية تقارير الشؤون الأكاديمية**: PARTIAL.
- **جاهزية المجالس الأكاديمية**: READY.
- **جاهزية متابعة التدريس**: READY.
- **جاهزية المواد التعليمية**: READY.
- **جاهزية البوابة كاملة**: PARTIAL — بانتظار إكمال E2E شهادة القيد.
- **حالة Publish/Deploy**: SCHEDULED (المحاولة الوحيدة استُهلكت بنجاح الجدولة).
