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


---

## حالة الدمج على main (إضافة لاحقة)

| الحقل | القيمة |
|---|---|
| تحديث بواسطة | `PORTAL-PR194-CLOSURE-THEN-PR195-VERIFICATION-01` |
| تاريخ | 2026-07-21 |
| PR | [#195](https://github.com/msorori-mh/saba-uni-portal/pull/195) — **MERGED** |
| `mergeCommit` | `edb26740257e1168164e6fdee43a303c8e23fd61` |
| `origin/main` | `edb26740257e1168164e6fdee43a303c8e23fd61` |
| Web CI على merge | [29854602219](https://github.com/msorori-mh/saba-uni-portal/actions/runs/29854602219) — **success** (10/10) |
| قرار البرنامج | `PASS_PR194_AND_PR195_MERGED_MAIN_GREEN_READY_FOR_ACCOUNT_IMPORT_PREFLIGHT` |

**ملاحظة:** لا استيراد إنتاج ولا deploy ضمن هذا التحديث التوثيقي.
