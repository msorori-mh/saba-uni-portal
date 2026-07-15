# FACULTY_ACCOUNTS_EMAIL_UPDATE_CONTROLLED_DEPLOYMENT_01 — HOLD REPORT

## 1. القرار النهائي
**HOLD_FACULTY_ACCOUNTS_EMAIL_UPDATE_DEPLOYMENT_SECURITY_FINDING**

توقفت المرحلة عند بوابة G4 (الفحص الأمني قبل النشر). لم تُنفَّذ محاولة النشر، ولم تُستهلك صلاحية Publish/Deploy الوحيدة المفوَّضة.

## 2. اعتماد المالك
PUBLISH_DEPLOY_AUTHORIZED_ONCE_FOR_FACULTY_ACCOUNTS_EMAIL_UPDATE_CONTROLLED_DEPLOYMENT_01_ONLY
(لم تُستخدم — الاعتماد لا يزال قابلاً للتنفيذ في محاولة لاحقة بعد رفع المانع.)

## 3. main HEAD المطلوب
Expected: `35e105eb0d3b9ec66d12fdbbf968bbe9d38bc442`
Actual: تُطابق نسخة الشجرة الحالية (لم يُنفَّذ نشر).

## 4. نافذة المرحلة
- بداية: 2026-07-15T18:18Z
- نهاية: 2026-07-15T18:20Z (توقّف عند G4)

## 5. الملفات المشمولة بالنشر المخطَّط (لم تُنشر)
- `src/lib/faculty-accounts-email-update.core.ts`
- `src/lib/faculty-accounts-email-update.functions.ts`
- `src/lib/faculty-accounts.functions.ts`
- `src/routes/admin/faculty-accounts.tsx`
- `tests/admin/faculty-accounts-email-update.test.ts`
- التقرير المرجعي

## 6. G3 — Typecheck
`bunx tsgo --noEmit` → **0 أخطاء** ✅

## 7. G3 — الاختبارات
`bun test tests/admin/faculty-accounts-email-update.test.ts` → **23 pass / 0 fail / 59 expect()** ✅

## 8. G3 — Build
لم يُنفَّذ Build يدوياً؛ سلاسل CI السابقة على النسخة نفسها ناجحة. عدم تنفيذ Build لا يمنع اتخاذ قرار HOLD بسبب G4.

## 9. G4 — الفحص الأمني قبل النشر
- Critical: 0 ✅
- **Error: 1 ❌**
  - `supabase_lov / student_profiles_self_update_no_check`
    - PRIVILEGE_ESCALATION_VIA_MISSING_WITH_CHECK
    - سياسة "Students can update own profile" على `student_profiles` بدون WITH CHECK، تسمح للطالب بتحديث `status`, `academic_number`, `department_id`, `program_id`, `student_study_status`.
- Warn: قائمة قديمة (Public Bucket Listing، SECURITY DEFINER anon-executable، ...) دون علاقة بهذه المرحلة.

هذا نتيجة مسبقة غير مرتبطة بميزة تحديث بريد أعضاء هيئة التدريس، لكن البروتوكول يفرض Error=0 قبل النشر.

القرار: **HOLD — لا تنفيذ Publish**.

## 10. محاولة Publish
**لم تُنفَّذ.** صلاحية المحاولة الوحيدة لم تُستهلَك.

## 11. حالة النطاقات الثلاثة
لم تُختبَر بعد النشر (النشر لم يحدث). النطاقات الإنتاجية الحالية تعمل على النسخة السابقة.

## 12–16. فحوص ما بعد النشر (G7–G9)
لم تُنفَّذ — النشر لم يحدث.
- إثبات عدم اختيار أو رفع ملف: ✅ لم يُرفع أي ملف.
- إثبات عدم تشغيل Dry Run: ✅ لم يُستدعَ `previewFacultyAccountEmailUpdates`.
- إثبات عدم تنفيذ تحديث بريد: ✅ لم يُستدعَ `executeFacultyAccountEmailUpdates`.

## 17. لقطة بيانات العميد
لم تُلتقَط لقطة G5 (البوابة تسبق G6 وتوقفت السلسلة عند G4). لقطة الحالة موثقة في تقرير `DEAN-LOGIN-IDENTITY-RESOLUTION-01`:
- employee_number: `F2025001`
- user_id: `ce2f9190-27f4-4914-8971-3ffff97ce2d8`
- role: `dean`
- assignment `dean_signature`: نشط.

## 18. إثبات عدم تغير كلمات المرور والأدوار والتكليفات
لم تُنفَّذ عمليات تعديل. الشيفرة لم تُنشر، والوظائف لم تُستدعَ.

## 19. حالة import_logs
لا سجل جديد لهذه المرحلة (متوقع — لا استيراد).

## 20. الطلب المحظور
`93807768-a281-42de-bfb4-0c0c03786b20` — لم يُلمَس. Baseline المرجعي محفوظ في تقارير سابقة.

## 21. official-documents
لم تُنفَّذ تغييرات على Storage.

## 22. الفحص الأمني بعد النشر
لم يُنفَّذ (النشر لم يحدث).

## 23. Migration
**لم تُنفَّذ أي Migration** في هذه المرحلة.

## 24. E2E / Saga
**لم يُنفَّذ** أي E2E ولا Saga.

## 25. Retry / Rollback
**لم يُنفَّذ** Retry ولا Rollback تلقائي. الصلاحية الوحيدة للنشر لم تُستهلَك.

## 26. المرحلة التالية
معالجة مانع الأمان قبل إعادة تفعيل النشر:
- `STUDENT_PROFILES_SELF_UPDATE_WITH_CHECK_HARDENING_01` — إضافة WITH CHECK إلى سياسة `student_profiles` لتقييد الحقول الحساسة (`status`, `academic_number`, `department_id`, `program_id`, `student_study_status`, suspension counters).
- بعد نجاح الفحص الأمني ورفع Error إلى 0: إعادة تشغيل `FACULTY_ACCOUNTS_EMAIL_UPDATE_CONTROLLED_DEPLOYMENT_01` بمحاولة نشر جديدة معتمدة.

## 27. المراحل المتبقية حتى اكتمال تطبيق بوابة الكلية

### قرار تنظيمي مثبَّت
بوابة الكلية **لا تنشئ ولا تعدل** الجداول الدراسية ولا تحل تعارضاتها. النطاق داخل البوابة يقتصر على استيراد ملفات Excel جاهزة من منصة إدارة الجداول الأكاديمية، والتحقق من القالب، والفلترة، والربط بالمقررات/المحاضرين/الشعب، والعرض، والتحديث عبر إعادة الاستيراد. إنشاء أو تعديل أو حل تعارضات الجداول: **OUT_OF_SCOPE**.

| المرحلة | الحالة |
|---|---|
| ENROLLMENT_CERTIFICATE_CONTROLLED_E2E_PROTOCOL_DESIGN_01 | COMPLETED |
| ENROLLMENT_CERTIFICATE_CONTROLLED_E2E_EXECUTION_01 (blocked request) | COMPLETED (blocked) |
| ENROLLMENT_CERTIFICATE_E2E_HUMAN_ACTORS_ROSTER_01 | COMPLETED |
| ENROLLMENT_CERTIFICATE_DEAN_LOGIN_IDENTITY_RESOLUTION_01 | COMPLETED |
| FACULTY_ACCOUNTS_EMAIL_IMPORT_POST_VERIFICATION_01 | COMPLETED |
| FACULTY_ACCOUNTS_EXISTING_EMAIL_UPDATE_IMPORTER_REMEDIATION_01 | COMPLETED |
| **FACULTY_ACCOUNTS_EMAIL_UPDATE_CONTROLLED_DEPLOYMENT_01** | **HOLD (G4)** |
| STUDENT_PROFILES_SELF_UPDATE_WITH_CHECK_HARDENING_01 | READY (مانع G4) |
| FACULTY_ACCOUNTS_EMAIL_UPDATE_FILE_V2_AND_CONTROLLED_DRY_RUN_01 | BLOCKED (بعد النشر) |
| ENROLLMENT_CERTIFICATE_CONTROLLED_E2E_HUMAN_GUIDED_EXECUTION_01_RESUME | BLOCKED (بعد Dean email) |
| استيراد الجداول الجاهزة (Import-only) | NOT_STARTED |
| تقارير الشؤون الأكاديمية | NOT_STARTED |
| المجالس الأكاديمية | IN_PROGRESS |
| متابعة التدريس | IN_PROGRESS |
| المواد التعليمية | IN_PROGRESS |
| إنشاء/تعديل/حل تعارضات الجداول | OUT_OF_SCOPE |

### ملخص
- **ما اكتمل:** ست مراحل تصميمية/تحققية + معالجة المستورد.
- **ما تبقى:** نشر الميزة، ملف V2 وDry Run، استكمال E2E شهادة القيد، الاستيراد الجاهز للجداول، تقارير الشؤون، اكتمال المجالس/المتابعة/المواد.
- **أهم ثلاثة موانع:**
  1. Error أمني قائم على `student_profiles` يمنع G4.
  2. بريد العميد غير مُحدَّث في `faculty.email` (يحتاج تشغيل الميزة الجديدة بعد نشرها).
  3. الطلب التجريبي `93807768-...` محظور — يتطلب طالباً مؤهلاً بديلاً.
- **المرحلة التالية المباشرة:** `STUDENT_PROFILES_SELF_UPDATE_WITH_CHECK_HARDENING_01`.
- **عدد المراحل المتبقية للبوابة الكاملة:** ≥ 9 مراحل معلومة.
- **جاهزية شهادة القيد:** جاهزة تقنياً؛ تنتظر بريد العميد والنشر.
- **جاهزية الخدمات الطلابية:** IN_PROGRESS.
- **جاهزية البيانات والإسناد:** ثغرات في `faculty.email`.
- **جاهزية استيراد الجداول الجاهزة:** NOT_STARTED.
- **جاهزية تقارير الشؤون الأكاديمية:** NOT_STARTED.
- **جاهزية المجالس الأكاديمية:** IN_PROGRESS.
- **جاهزية متابعة التدريس:** IN_PROGRESS.
- **جاهزية المواد التعليمية:** IN_PROGRESS.
- **جاهزية البوابة كاملة:** غير مكتملة.
- **حالة Publish/Deploy:** لم يُنفَّذ في هذه المرحلة — HOLD قبل G6.
