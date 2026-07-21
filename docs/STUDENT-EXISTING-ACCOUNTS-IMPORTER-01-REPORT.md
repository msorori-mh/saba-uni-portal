# STUDENT-EXISTING-ACCOUNTS-IMPORTER-01

| الحقل | القيمة |
|---|---|
| البرنامج | `STUDENT-EXISTING-ACCOUNTS-IMPORTER-01` |
| المستودع | `msorori-mh/saba-uni-portal` |
| الفرع | `feat/student-existing-accounts-importer-01` |
| الأساس | `origin/main` @ `df90f1a8379da4b15c561a87ebc21e3a31e2550e` |
| النطاق | Source + Tests + PR فقط |
| التاريخ | 2026-07-21 |

## الهدف

مستورد `student_accounts` لإنشاء/ربط حسابات الدخول للطلاب **الموجودين مسبقاً** في `student_profiles`، دون إنشاء ملفات طلاب ودون تعديل البيانات الأكاديمية.

## ما أُضيف

| الطبقة | الملفات |
|---|---|
| نوع الاستيراد | `src/lib/imports/types.ts` → `student_accounts` |
| تحقق + تصنيف النتائج | `src/lib/imports/student-accounts.ts` |
| تنفيذ server-side | `importStudentAccounts` في `engine.server.ts` (عبر `provisionStudentLoginServer` + RPC) |
| Preview / revalidate | `bulk-import-validation.server.ts` |
| صلاحيات | `imports.functions.ts` → `admin` / `system_admin` فقط |
| قالب | `templates.ts` + `master-templates.ts` |
| واجهة | تبويب «حسابات الطلاب الموجودين» في `/admin/imports` |
| اختبارات | `tests/imports/student-existing-accounts-importer.test.ts` (16) |

## قواعد النتيجة

| الحالة | المعنى |
|---|---|
| `READY_TO_CREATE` | طالب موجود بلا حساب Auth → يُنشأ عند التنفيذ |
| `ALREADY_LINKED` | مربوط مسبقاً → تخطي آمن (idempotent) |
| `CONFLICT` | Auth موجود بالبريد وغير مربوط بالطالب، أو بريد لطالب آخر → **لا ربط تلقائي** |
| `STUDENT_NOT_FOUND` | لا ملف طالب |
| `INVALID_EMAIL` | بريد ناقص/غير صالح/مكرر في الملف |

عناوين عربية مقبولة: `الرقم الأكاديمي`، `البريد الإلكتروني الجامعي`.

## ضمانات أمنية

- لا service role في المتصفح — التنفيذ عبر `runBulkImport` + `supabaseAdmin` في الخادم فقط.
- إنشاء الحساب عبر Auth Admin + `link_student_user_account` + `admin_mark_student_password_reset`.
- كلمة المرور تُولَّد عبر `generateTemporaryPassword` مع `must_change_password=true` افتراضياً.
- **لا** كلمة مرور في تقرير الاستيراد أو حمولة audit.
- لا تعديل: قسم / برنامج / مستوى / سنة / فصل / حالة أكاديمية.

## الاختبارات (محلي)

```
bun test tests/imports/student-existing-accounts-importer.test.ts
→ 16 pass / 0 fail
```

يغطي: موجود بلا حساب، مربوط مسبقاً، غير موجود، بريد لطالب آخر، Auth CONFLICT، تكرار رقم/بريد، بريد غير صالح، dry-run، idempotent، لا password في التقرير، لا حقول أكاديمية في update، قالب + أدوار.

## ما لم يُنفَّذ (التزام)

- لا إنشاء حسابات إنتاجية.
- لا استيراد فعلي على بيانات حية.
- لا Deploy / Publish / Migration apply.

## القرار

**`PASS_STUDENT_EXISTING_ACCOUNTS_IMPORTER_SOURCE_READY`**
