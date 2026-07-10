# PORTAL-G9-ELIGIBILITY-DATA-IMPORTER-IMPLEMENTATION-01

## القرار

`PASS_G9_ELIGIBILITY_IMPORTER_PR_READY_FOR_REVIEW`

---

## قرار التصميم

تم إنشاء مستورد مستقل `student_eligibility` (بيانات أهلية الطلبات) بدل تعديل مستورد إنشاء الطلاب، لأن:

- مستورد `students` مخصص لإنشاء ملفات طلاب جديدة (`INSERT` فقط).
- الـ validator الحالي يرفض `academic_number` موجود مسبقًا.
- خلط الإنشاء والتحديث قد يؤدي إلى حسابات دخول أو آثار جانبية غير مطلوبة.

**نوع العملية:** `UPDATE EXISTING STUDENTS ONLY`

---

## البيئة

| البند        | القيمة                                                |
| ------------ | ----------------------------------------------------- |
| Repository   | `msorori-mh/saba-uni-portal`                          |
| Worktree     | `C:\projects\saba-uni-portal-g9-eligibility-importer` |
| Branch       | `feature/g9-eligibility-data-importer`                |
| Base         | `main` (G9 applied, types synced)                     |
| Supabase ref | `wpmicqriltrowwonknox` (لم يُستخدم في هذه المرحلة)    |

---

## الملفات المعدّلة

| الملف                                                                  | الغرض                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| `src/lib/imports/types.ts`                                             | نوع `student_eligibility` + `EligibilityImportSummary` |
| `src/lib/imports/labels.ts`                                            | تسميات عربية + أخطاء الحقول                            |
| `src/lib/imports/validators.ts`                                        | `StudentEligibilityRow` + `validateStudentEligibility` |
| `src/lib/imports/engine.server.ts`                                     | `importStudentEligibility` + dry-run summary           |
| `src/lib/imports/bulk-import-validation.server.ts`                     | dispatch التحقق على الخادم                             |
| `src/lib/imports.functions.ts`                                         | صلاحيات + تنفيذ + revalidation                         |
| `src/lib/imports/templates.ts`                                         | قالب Excel + تعليمات                                   |
| `src/lib/imports/master-templates.ts`                                  | `template_student_eligibility.xlsx` في المكتبة         |
| `src/lib/imports/reports.ts`                                           | إحصاءات dry-run في تقرير Excel                         |
| `src/routes/admin/imports.tsx`                                         | تبويب + وصف + تحذير + إحصاءات                          |
| `tests/imports/student-eligibility-importer.test.ts`                   | اختبارات mock                                          |
| `docs/PORTAL-G9-ELIGIBILITY-DATA-IMPORTER-IMPLEMENTATION-01-REPORT.md` | هذا التقرير                                            |

---

## تصميم القالب

**الملف:** `template_student_eligibility.xlsx` (يُولَّد من الواجهة عبر `downloadTemplate` / `downloadMasterTemplate`)

| العمود                                | مطلوب | النوع   | القاعدة                                    |
| ------------------------------------- | ----: | ------- | ------------------------------------------ |
| `academic_number`                     |   نعم | text    | طالب موجود مسبقًا                          |
| `student_study_status`                |   نعم | enum    | `new` / `repeat` (+ aliases عربية)         |
| `transferred_current_year`            |   نعم | boolean | `true/false` أو `نعم/لا` — لا default صامت |
| `previous_suspension_semesters_count` |   نعم | integer | ≥ 0                                        |
| `consecutive_suspension_years_count`  |   نعم | integer | ≥ 0                                        |
| `source_reference`                    |   نعم | text    | 3–250 حرف — للتدقيق فقط                    |
| `notes`                               |    لا | text    | اختياري — لا يُخزَّن في `student_profiles` |

`student_profile_id` **لا** يُؤخذ من Excel — يُحل من `academic_number` على الخادم.

---

## قواعد validation

### الرقم الأكاديمي

- مطلوب، بدون تكرار داخل الملف.
- يجب أن يطابق `student_profiles` — غير الموجود يُرفض.
- UUID كرقم أكاديمي مرفوض.

### `student_study_status`

- مقبول: `new`, `repeat`, `مستجد`, `باقي للإعادة`, `إعادة`.
- لا استنتاج من المستوى أو سنة القبول.

### `transferred_current_year`

- مطلوب: `true/false`, `1/0`, `yes/no`, `نعم/لا`.
- الفراغ = خطأ.

### العدادات

- عدد صحيح ≥ 0 فقط — لا كسور، لا default عند الفراغ.

### `source_reference`

- مطلوب، trim ≥ 3، max ~250 — لا يُحفظ في أعمدة الطالب.

---

## الصلاحيات

**مسموح:** `admin`, `system_admin`, `registrar`, `student_affairs`

**غير مسموح:** `dean`, `department_head`, `faculty_member`, `finance_officer`, `student`, `anon`

طبقة: `requireSupabaseAuth` + `assertAnyRole` + rate limit الاستيراد الحالي.

---

## update-only guarantee

| السلوك                     | التطبيق                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `insert` / `upsert`        | **غير مستخدم** — `update` فقط                                                                                                                |
| إنشاء طالب                 | **مرفوض** في validator                                                                                                                       |
| `student_academic_status`  | **لا يُمس**                                                                                                                                  |
| حسابات دخول / `user_roles` | **لا يُنشأ**                                                                                                                                 |
| طلبات / workflow           | **لا يُنشأ**                                                                                                                                 |
| الحقول المحدَّثة           | الأربعة فقط: `student_study_status`, `transferred_current_year`, `previous_suspension_semesters_count`, `consecutive_suspension_years_count` |
| `updateExisting` UI        | **مخفي** — النوع update-only بطبيعته                                                                                                         |

---

## dry-run guarantee

عند `dryRun=true` للمسار الكامل (`preview` + `dry run` + orchestration):

- لا `UPDATE` على `student_profiles`.
- لا `INSERT` في `import_logs`.
- لا `log_audit` (لا من الخادم ولا من lifecycle audit في الواجهة).
- لا `auditImportValidated` / `auditImportFailed` أثناء preview.
- لا `auditImportStarted` / `auditImportFailed` أثناء dry run.
- لا `finalizeImportServer` (يُتخطى عبر `shouldSkipEligibilityFinalizeServer`).
- لا login provisioning.
- يُرجع تقريرًا + `eligibility_summary` فقط (إجمالي، صالح، مرفوض، new/repeat، محوّلون، سابق إيقاف، مراجع مصدر).

عند `dryRun=false` (استيراد فعلي): يبقى `finalizeImportServer` وlifecycle audit مفعّلين.

السياسة في: `src/lib/imports/eligibility-import-policy.ts`

---

## PR #114 remediation (dry-run read-only)

| المسار | الإصلاح |
|--------|---------|
| Preview (`onFile`) | تخطي `auditImportValidated` / `auditImportFailed` لـ`student_eligibility` |
| Dry run UI (`runImport`) | تخطي `auditImportStarted` / `auditImportFailed` عند `student_eligibility && dryRun` |
| Server (`runBulkImport`) | تخطي `finalizeImportServer` عند `student_eligibility && dryRun` |


## audit behavior

عند التنفيذ الفعلي (مستقبلًا): `student_eligibility_data_imported` يتضمن `old`/`new` للحقول الأربعة + `source_reference` + `import_file_name` + `actor_user_id` — **بدون** اسم/هاتف/هوية/بريد.

Audit best-effort عبر `safeAudit` — فشل audit لا يخفي فشل تحديث البيانات.

---

## revalidation

الخادم يعيد التحقق عبر `revalidateBulkImportRows` → `validateStudentEligibility` — لا يعتمد على `parsed` من المتصفح دون revalidation.

---

## الاختبارات

`tests/imports/student-eligibility-importer.test.ts` (mocks فقط):

- validator: صف صحيح، رقم مفقود/غير موجود/مكرر/UUID، study status، boolean عربي/فارغ، عداد سالب/عشري/فارغ، source_reference، notes اختيارية.
- dry run: لا استدعاء `from`/`rpc`.
- execution mock: تحديث الحقول الأربعة فقط + فشل عند ≠ 1 row.
- summary: إحصاءات بدون PII.

`tests/imports/eligibility-import-readonly-policy.test.ts`:

- preview لـ`student_eligibility` لا lifecycle audit.
- dry run لا `auditImportStarted`/`auditImportFailed`.
- server orchestration لا `finalizeImportServer` في eligibility dryRun.
- الاستيراد الفعلي `dryRun=false` ما زال يمر عبر finalize/audit.
- بقية أنواع الاستيراد لم يتغير سلوكها.

---

## ضمانات النطاق

- **لم** يُنفَّذ استيراد فعلي على الإنتاج.
- **لم** يُنفَّذ SQL أو migration أو seed.
- **لم** يُعدَّل `types.ts` أو migrations أو G9 RPCs.
- **لم** يُربَط بـ `create_student_request` / `submit_student_request`.
- **لم** يُنفَّذ Publish أو Deploy.

---

## نتائج التحقق

| الأمر | النتيجة | ملاحظات |
|-------|---------|---------|
| `bun test tests/imports/student-eligibility-importer.test.ts` | **PASS** | 19 pass، 0 fail (Bun 1.3.14) |
| `bunx tsc --noEmit` | **PASS** | exit 0 |
| `bun run lint` | **FAIL (محلي Windows — CRLF/prettier)** | exit 1 (~87k prettier \r على المستودع بالكامل). CI: lint **advisory** (لا يفشل الـ job). ملفات الـ PR بعد prettier: 1 خطأ 
o-explicit-any سابق (`imports.tsx:1460`) + 2 تحذير hooks |
| `bun run build` | **PASS** | Nitro build ~30s، exit 0 |
| `git diff --check` | **PASS** | exit 0 |

**تاريخ التشغيل:** 2026-07-10 — worktree `C:\projects\saba-uni-portal-g9-eligibility-importer`، branch `feature/g9-eligibility-data-importer`.

