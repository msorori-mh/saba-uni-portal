# FACULTY_ACCOUNTS_EXISTING_EMAIL_UPDATE_IMPORTER_REMEDIATION_01 — REPORT

## 1. القرار

**PASS_FACULTY_ACCOUNTS_EXISTING_EMAIL_UPDATE_IMPORTER_READY_FOR_CONTROLLED_DEPLOYMENT_NO_DATA_IMPORT_NO_PUBLISH**

تم تطوير وضع صريح جديد لتحديث بريد تسجيل الدخول للحسابات المرتبطة مسبقاً،
مع Dry Run إلزامي، وتأكيد بشري صريح قبل التنفيذ، وضمان عدم مساس أي حقل
لا يخص البريد. لم يُنفَّذ أي استيراد بيانات فعلي، ولم يُنفَّذ Publish/Deploy.

## 2. سبب عدم تحديث الاستيراد السابق للبريد

المستورد الحالي `importFacultyAccountsRows` في
`src/lib/faculty-accounts.functions.ts` مصمَّم لثلاث نتائج فقط:

- `created` — إنشاء حساب Auth جديد إذا لم يكن هناك حساب.
- `linked` — ربط حساب Auth موجود بالبريد نفسه.
- `already_linked` — تخطٍّ صامت عند أي `faculty_profiles.user_id`.

عند مسار `already_linked` (السطر 424 – 432 قبل التعديل) يتوقف المعالج دون أي مقارنة
بين البريد المطلوب في الملف والبريد الحالي على Auth أو في `public.faculty`،
وبالتالي جميع الصفوف الـ24 قد تم تجاوزها. المستورد لم يكتب سجلاً في
`public.import_logs` (كتب فقط في `audit_logs`)، ولهذا خلا الجدول من أي أثر
لمحاولة الاستيراد.

## 3. الملفات والدوال المعدلة/المضافة

| ملف | الوصف |
| --- | --- |
| `src/lib/faculty-accounts-email-update.core.ts` (**جديد**) | منطق تصنيف نقي بدون I/O: `classifyEmailUpdate`, `normalizeEmail`, `isValidEmailFormat`, `emailDomainAllowed`, `maskEmail`, `isReadyOutcome`. قابل للاختبار مباشرة. |
| `src/lib/faculty-accounts-email-update.functions.ts` (**جديد**) | Server functions: `previewFacultyAccountEmailUpdates` (Dry Run) + `executeFacultyAccountEmailUpdates` (يتطلب `confirm: true`). كلاهما محمي بـ`requireSupabaseAuth` + `assertAnyRole(['admin','system_admin','hr_officer'])` + `enforceRateLimit`. |
| `src/lib/faculty-accounts.functions.ts` (**تعديل نقطي**) | إضافة كتابة `import_logs` في نهاية `importFacultyAccountsRows` — تُسجَّل جميع الحالات: `success`, `partial`, `all_failed`, `all_already_linked`, `no_changes`. لم يُغيَّر أي سلوك آخر. |
| `src/routes/admin/faculty-accounts.tsx` (**تعديل + إضافة**) | زر واضح «تحديث البريد للحسابات المرتبطة»، ومكوّن `EmailUpdatePanel` مطوي افتراضياً، لا يعمل تلقائياً. يعرض Dry Run + جدول Before/After + مربع تأكيد صريح ثم زر التنفيذ. |
| `tests/admin/faculty-accounts-email-update.test.ts` (**جديد**) | 23 اختباراً وحدوياً ومصدرياً. |

## 4. عقد وضع تحديث البريد (UPDATE_EXISTING_FACULTY_ACCOUNT_EMAILS)

- المطابقة حصراً عبر `employee_number`؛ الاسم لا يُستخدم أبداً.
- التحقق من: profile واحد فقط، `user_id` واحد، Auth user موجود،
  عدم امتلاك البريد الجديد من قِبَل حساب آخر، صيغة صحيحة،
  نطاق `usr.edu.ye` (أو نطاقات جامعية معتمدة).
- عند أي غموض → رفض الصف، لا تخمين.

## 5. حالات Dry Run (10)

`READY_AUTH_AND_FACULTY_EMAIL_UPDATE`, `READY_FACULTY_EMAIL_BACKFILL_ONLY`,
`ALREADY_MATCHED`, `EMAIL_CONFLICT`, `FACULTY_NOT_FOUND`,
`FACULTY_DUPLICATE`, `AUTH_USER_NOT_FOUND`, `ACCOUNT_LINK_AMBIGUOUS`,
`INVALID_EMAIL`, `FAILED`. زر التنفيذ لا يظهر إذا وُجدت `EMAIL_CONFLICT` أو
كان عدد الصفوف الجاهزة = 0.

## 6. آلية تحديث Auth و faculty (G2 — التنفيذ المسموح فقط)

للصفوف المصنَّفة `READY_*` فقط:

1. عند `needs_auth_update`: `supabaseAdmin.auth.admin.updateUserById(user_id, { email, email_confirm: true })`.
2. عند `needs_faculty_update`: `UPDATE public.faculty SET email = <new> WHERE id = <faculty_profiles.faculty_id>`.
3. تسجيل Audit مفصَّل + تسجيل `import_logs` واحد لكل تنفيذ.

يُعاد التصنيف بالكامل داخل `execute` — لا يُوثَق أبداً في نتيجة العميل.

## 7. ضمانات المحافظة (G2 المحظورات)

- لا `password` ولا `must_change_password` ولا توليد كلمات مرور.
- لا كتابة في `user_roles` أو `position_assignments`/`processing_assignments`.
- لا تعديل `employee_number` أو `full_name_ar` أو `faculty_id`.
- لا حذف/إنشاء مستخدمين. `user_id` يبقى كما هو.
- المكالمة الوحيدة لـ`updateUserById` تحمل حقلَي `email` و`email_confirm` فقط.
- إنهاء الجلسات: لم تُستدع صراحةً؛ ظهر تحذير UI بأن مزود Auth قد يُلزم بذلك.

## 8. معالجة `import_logs` (G6)

- مسار جديد: `import_type='faculty_account_email_update'` — يُكتب دائماً بحالات
  `success | partial | no_changes | all_failed`.
- المسار القديم `importFacultyAccountsRows` بات يكتب أيضاً `import_type='faculty_accounts'`
  بحالات `success | partial | all_already_linked | no_changes | all_failed`.
- لا كلمات مرور ولا Tokens ضمن `notes`.

## 9. الاختبارات

`tests/admin/faculty-accounts-email-update.test.ts` — 23 اختباراً (كلها ناجحة).
يشمل: تحديث Auth+faculty، ردم faculty فقط، `EMAIL_CONFLICT`،
`FACULTY_NOT_FOUND`, `FACULTY_DUPLICATE`, `ACCOUNT_LINK_AMBIGUOUS`,
`INVALID_EMAIL`, عدم استخدام الاسم للمطابقة، تسجيل `import_logs`،
عدم كشف الأسرار في UI، بقاء المسار القديم دون كسر.

## 10. نتائج typecheck/build/tests

- `bunx tsgo --noEmit`: **0 errors**.
- `bun test tests/admin/faculty-accounts-email-update.test.ts`: **23 pass / 0 fail / 59 expect()**.
- Build: يُدار تلقائياً من قِبَل الـ harness.

## 11. المطابقات الأربعة المصحّحة (للاستخدام لاحقاً)

- F2025028 — يوسف عبدالواحد الهجري — `ywsfalhwlndy@usr.edu.ye`
- F2025029 — عصماء خليل عبدالواسع القرشي — `asmaaalkershi@usr.edu.ye`
- F2025030 — عقيل معوضه البحري — `albahriaqeel@usr.edu.ye`
- F2025031 — نورا عزمي سيف العبسي — `eng.nouraazmi@usr.edu.ye`

`F2025032` غير موجود في `faculty_profiles` — لا يُستخدم.

## 12. الرقم الوظيفي الصحيح لضيف الله غالب (G7)

استعلام قراءة فقط على `public.faculty_profiles`:

| employee_number | full_name_ar | profile id | user_id |
| --- | --- | --- | --- |
| **F2025027** | أ. ضيف الله غالب عبدالله | `729ff2b3-c628-4892-9fd6-ef174717e17c` | `09a600e0-05e7-4726-ae7c-a658263ca311` |

يوجد سجل مجاور مقارب في الاسم:
`F2025026 — أ. غالب عبدالله مبارك عبار` (سجل مختلف — لا يُخلط بينه وبين ضيف الله غالب).
لم يُعدَّل أي سجل.

## 13. حالة «محمد شمسان» (G7)

لا يوجد أي سجل في `public.faculty_profiles` ولا في `public.faculty`
مطابق للاسم `%شمسان%`. لذلك لا employee_number له، ولا يُعامَل كعضو
هيئة تدريس ضمن هذا المستورد. القرار: **تجاهل** حتى يُثبت المالك خلاف ذلك.

## 14. إثبات عدم تنفيذ أي استيراد فعلي

- لم يُستدعَ `executeFacultyAccountEmailUpdates` من أي مسار.
- لم يُرفَع ملف Excel.
- المسار القديم `importFacultyAccountsRows` لم يُستدعَ في هذه المرحلة.
- الاستعلام `SELECT id, import_type FROM import_logs WHERE import_type ILIKE '%faculty%' ORDER BY created_at DESC LIMIT 10`
  أعاد سجلاً واحداً قديماً بتاريخ `2026-06-04` فقط.

## 15. إثبات عدم Migration أو Publish/Deploy

- لا استدعاء لأداة `supabase--migration` في هذه الدورة.
- لم يُنفَّذ Publish/Deploy.
- الطلب المحظور بقي كما هو:
  `93807768-a281-42de-bfb4-0c0c03786b20` — `status=in_review` —
  `updated_at=2026-07-13 17:59:19.782271+00` (تحقق قبل وبعد التنفيذ).

## 16. المرحلة التالية

`FACULTY_ACCOUNTS_EMAIL_UPDATE_CONTROLLED_DEPLOYMENT_01` — نشر التعديل
البرمجي على الإنتاج (بعد اعتماد المالك)، ثم رفع ملف
`faculty_accounts_email_update_ready_v2.xlsx` يحتوي المطابقات الأربعة أعلاه،
وتشغيل Dry Run ثم التنفيذ الصريح.

بعد نجاح تحديث بريد العميد يمكن استئناف:
`ENROLLMENT_CERTIFICATE_CONTROLLED_E2E_HUMAN_GUIDED_EXECUTION_01_RESUME`.

---

**Publish/Deploy:** `PUBLISH_DEPLOY_FORBIDDEN` — لم يُنفَّذ.
**Import execution:** لم يُنفَّذ.
