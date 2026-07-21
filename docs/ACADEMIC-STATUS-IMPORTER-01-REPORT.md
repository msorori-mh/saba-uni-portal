# تقرير تنفيذ: مستورِد الحالة الأكاديمية للطلاب + LOWs الأربعة (ACADEMIC-STATUS-IMPORTER-01)

- **المهمة:** G-05 importer لـ `student_academic_status` + إصلاح LOWs الأربعة من تدقيق #187
- **الفرع:** `feat/student-academic-status-importer-01` (من `main` @ `331b7bcd`)
- **التاريخ:** 2026-07-21 (مُحدَّث بعد المراجعة المستقلة لـ PR #193)
- **النطاق:** `src/lib/imports/`، `src/lib/imports.functions.ts`، `src/routes/admin/imports.tsx` (ربط المسار فقط)، `tests/imports/`، `docs/`
- **القيود:** لا migrations مطبقة، لا SQL مُنفَّذ، لا دمج — تعديلات مصدرية + اختبارات فقط.
- **المرجعية:** [docs/ACADEMIC-DATA-QUALITY-AUDIT-01-REPORT.md](./ACADEMIC-DATA-QUALITY-AUDIT-01-REPORT.md) (PR #187)

---

## 1) ملخص تنفيذي

1. **G-05 (HIGH) أُغلق:** مستورِد كامل لـ `student_academic_status` بنمط المستورِدات القائمة (validator → engine → dispatch → قالب → تبويب UI)، بحلّ الفصل **ضمن سنته** عبر `resolveSemesterId`، وبدفعة **ذرّية**، وبدون فقدان حقول silently.
2. **LOWs الأربعة طُبِّقت:** G-11 (المستوى ≤ سنوات البرنامج)، G-12 (متطلب ذاتي/دورات)، G-13 (خطة نشطة واحدة)، G-14 (هوية الخطة = UNIQUE الفعلي).
3. **معالجة مراجعة PR #193 (REVISE):** CRITICALان + HIGHان + MEDIUM + 3 LOWs — كلها مُعالجة في هذا الإصدار (القسم 7) مع تشغيل **bun + tsc فعليين** هذه المرة.

---

## 2) G-05 — مستورِد student_academic_status

### 2.1 نقاط الربط (كاملة، بلا مسار منقطع)

| # | الملف | التغيير |
|---|-------|---------|
| 1 | `src/lib/imports/types.ts` | `"student_academic_status"` في union الخاص بـ `ImportType` (+ افتراضي `unknown` لـ `ValidatedRow<T>` — إصلاح TS2314، انظر 7.6) |
| 2 | `src/lib/imports/validators.ts` | `StudentAcademicStatusRow` + `validateStudentAcademicStatus()` |
| 3 | `src/lib/imports/engine.server.ts` | `importStudentAcademicStatus()` + `actionMap` |
| 4 | `src/lib/imports/bulk-import-validation.server.ts` | `case "student_academic_status"` (+ إصلاح HIGH-4 — انظر 7.4) |
| 5 | `src/lib/imports/templates.ts` | مدخل قالب إضافي **فقط** على نسخة main الأصلية (انظر 7.1–7.3) |
| 6 | `src/lib/imports/labels.ts` | `IMPORT_TYPE_LABEL_AR` + `STRUCTURE_TYPES` |
| 7 | `src/lib/imports.functions.ts` | z.enum + `IMPORT_ROLES_BY_TYPE` + `runBulkImport` switch (+ تمرير updateExisting — HIGH-4) |
| 8 | `src/routes/admin/imports.tsx` | تبويب + `STRUCTURE_TYPES` + `IMPORT_TAB_INFO` — ضروري لاتصال المسار |

### 2.2 قواعد الـ validator

- الأعمدة: `academic_number` (مطلوب، يُحل عبر `student_profiles` بقطع 500)، `academic_year` + `semester` + `academic_level` (مطلوبة)، `enrollment_status` (اختياري).
- **حل الفصل ضمن سنته (G-02):** `resolveSemesterId` بخريطة `semestersByYearKey` — الإنتاج فيه 4 سنوات/9 فصول بأكواد مكررة.
- **حالة القيد:** whitelist = `enrolled/active/suspended/graduated/withdrawn/transferred/completed`، افتراضي `enrolled`.
- **G-11:** المستوى ≤ `programYearsById[student.program_id]`.
- **منع التكرار:** داخل الملف (`student|year|semester`) وضد DB بمطابقة UNIQUE؛ الموجود يُرفض ما لم يُفعَّل «تحديث القائم» وحينها يُوسم بـ `_existingId`.

### 2.3 ذرّية الدفعة (engine)

```
newRows    → INSERT واحد (كل الصفوف في statement واحدة)
updateRows → UPSERT واحد ON CONFLICT (student_profile_id, academic_year_id, semester_id)
```

- كل statement ذرّية في Postgres: عند الفشل لا يُدرَج/يُحدَّث أي صف من المجموعة، ويُسجَّل خطأ دفعي (`row: 0`).
- **لا فقدان حقول silently:** الحقول الخمسة + `updated_at` تُكتب كلها في الـ payload (مُختبَر بمطابقة مفاتيح الـ payload الستة).
- **هدف onConflict مؤكَّد (LOW-8):** القيد `UNIQUE (student_profile_id, academic_year_id, semester_id)` موجود فعلاً في `supabase/migrations/20260531230139_df358bbe-d10e-477d-a8ed-06a13fb837cb.sql` على main (blob `35e64c76a55ce9e46804f3a1171f1d0d23d3d2e4` — تحقق lead بالاقتباس الحرفي من CREATE TABLE). الـ upsert لن يفشل 400.
- **قيد تصميمي موثق:** supabase-js بلا transactions متعددة — الذرّية لكل مجموعة (إدراج/تحديث) لا عبرهما. التوسع عبر RPC = قرار مالك DB (NEEDS_USER_INPUT).
- **LOW-7 (متابعة نظامية):** الـ validator يقرأ `student_academic_status` كاملة بلا ترقيم؛ PostgREST يسقّط عند ~1000 صف افتراضياً ⇒ عند نمو الجدول قد تفوت سجلات موجودة فتُدرَج مكررة (يرفضها UNIQUE بخطأ دفعي — آمن لكن مزعج). المتابعة: ترقيم/تقييد القراءة بالسنة+الفصل الموجودين في الملف. ليست مانعة للحجم الحالي (ترحيل ~500 طالب/فصل).

### 2.4 القالب والواجهة

قالب `student_academic_status.xlsx` (sheetName + headers + sample + 8 تعليمات في ورقة Instructions منفصلة)؛ التبويب يعرض تحذير الذرّية ويفعّل «تحديث القائم» ويلزم Dry Run — مثل بقية المستورِدات.

---

## 3) LOWs الأربعة الأصلية — المنفَّذ

| البند | المنفَّذ | اختبار |
|-------|----------|--------|
| G-11 المستوى > سنوات البرنامج | تحقق في 4 validators + `programs.years`/`levelNumberById`/`programYearsById` في lookups (تخطٍّ آمن عند الغياب) | 5+1 حالات |
| G-12 متطلب ذاتي/دورات | رسم per-plan + DFS — **مُحسَّن لاحقاً (LOW-6, قسم 7.5)** | 4 حالات |
| G-13 خطة نشطة واحدة/برنامج | فحص DB — **عزّز لاحقاً بفحص داخل الملف (MEDIUM-5, قسم 7.5)** | 5 حالات |
| G-14 هوية الخطة | `getOrCreatePlan` على `(program_id, version)` + re-read بعد فشل الإدراج | عبر مسار study_plans |

---

## 4) الاختبارات — تشغيل فعلي هذه المرة

| الملف | الحالات |
|-------|---------|
| `tests/imports/student-academic-status-importer.test.ts` | 10 validator + 5 engine |
| `tests/imports/import-validators-linking.test.ts` | 25 (G-01/G-02/G-06/G-07/G-11/G-12/G-13 + MEDIUM-5 + LOW-6) |
| `tests/imports/import-templates.test.ts` **(جديد)** | 5 (سطح الوحدة + بنية الأوراق لكل الأنواع + round-trip) |
| `tests/imports/revalidate-update-existing.test.ts` **(جديد)** | 2 (مسار إعادة التحقق الخادمي بعلمَي updateExisting) |
| `tests/imports/student-eligibility-importer.test.ts` **(هارنس فقط)** | 19 كما هي بلا تغيير منطق — توحيد نمط موزِّد globalThis (قسم 7.6) |

### نتائج التشغيل الفعلي (bun 1.3.14، محلياً على شجرة معاد بناؤها بنسخ بايت-مطابقة)

```
bun test tests/imports/   →  66 pass / 0 fail / 230 expect() calls (5 files، تشغيل مجمّع واحد)
tsc --noEmit (noCheck=false, strict) على شجرة المصدر المشمولة → 0 أخطاء في ملفات هذه المهمة
```

- ملاحظة تشغيل: bun لا يوفّر `FileReader` (API متصفح) — أضاف اختبار القوالب polyfill صغيراً مشروطاً (`??=`-style، لا يمس المتصفح).
- **بقايا tsc خارج النطاق (موثقة، ليست من هذه المهمة):** خطأ واحد موجود مسبقاً على main في `src/lib/staff-functional-roles.ts:291` (تضييق يُنتج `never` — كامن بفعل `noCheck:true` في tsconfig المشروع)، وأخطاء أنواع بيئية (`process`/`node:crypto`) في ملفات main تُحل بإضافة `"node"` إلى types — كلها قائمة على main نفسه ولا علاقة للفرع بها.

---

## 5) تأكيدات السلامة

- ✅ لا migrations أُضيفت أو طُبِّقت؛ لا SQL نُفِّذ. ✅ لا دمج.
- ✅ لا تغيير سلوكي على المستورِدات الأخرى خارج البنود الموثقة هنا.
- ✅ البنى الاختيارية في `LookupMaps` تحفظ توافق الاستدعاءات القديمة.

## 6) متابعات (غير مانعة)

1. قالب رسمي في `master-templates.ts` (تحسين اختياري).
2. ذرّية عابرة للمجموعتين عبر RPC — NEEDS_USER_INPUT.
3. **LOW-7:** ترقيم قراءة `student_academic_status` (أو تقييدها بسنة/فصل الملف) قبل تجاوز ~1000 سجل (قسم 2.3).
4. G-04 (ربط الطالب بخطته) — مسودة D-3 بانتظار قرار المالك.
5. خطأ `staff-functional-roles.ts:291` الكامن على main — مالك: مصدر (يظهر فقط عند تعطيل `noCheck`).

---

## 7) معالجة المراجعة المستقلة لـ PR #193 (حكم: REVISE)

> **إقرار بالخطأ الأصلي (تصريح كان غائباً):** النسخة الأولى من هذه المهمة أعادت كتابة `templates.ts` **بهيكلة مختلفة غير موثقة** عند إضافة مدخل القالب (دالة `buildTemplateWorkbook` جديدة، حذف `parseExcel`، تغيير توقيع `downloadTemplate`، دمج التعليمات في ورقة البيانات، ودالة `downloadStudentsTemplate` ميتة). لم تُذكر هذه إعادة الهيكلة في التقرير الأصلي — وهو ما مرّر CRITICAL-1/2 وHIGH-3. **المعالجة المعتمدة:** التراجع الكامل عن إعادة الهيكلة واعتماد نسخة main بايت-بايت مع مدخل إضافي فقط.

| # | البند | المعالجة | الدليل |
|---|-------|----------|--------|
| CRITICAL-1 | حذف `parseExcel` من templates.ts | اعتماد templates.ts من نسخة main (blob `ddbe0a8f…` محققة بـ `git hash-object`) — `parseExcel` مصدَّر كما كان؛ imports.tsx وScheduleImportPanel لا يُمسّان | اختبار `exports parseExcel as a function` + **tsc فعلي نظيف** |
| CRITICAL-2 | تغيير توقيع downloadTemplate + دالة ميتة | **النهج المختار (موثق):** إبقاء توقيع main الثلاثي `(type, studentOverrides?, options?)` وعدم وجود `downloadStudentsTemplate` إطلاقاً — المستدعي الحالي في imports.tsx يبقى صحيحاً كما هو | اختبار `downloadTemplate.length === 3` |
| HIGH-3 | التعليمات داخل ورقة البيانات | نسخة main تكتب التعليمات في ورقة "Instructions" منفصلة؛ المدخل الجديد يتبع نفس البنية دون أي helper جديد | اختباران: ورقة البيانات = صفّان فقط لكل الأنواع الـ12 + round-trip عبر parseExcel يعيد صفاً واحداً |
| HIGH-4 | `revalidateBulkImportRows` تثبّت `false` | التوقيع صار `(type, rows, updateExisting = false)` ويمرّر العلم إلى `previewBulkImportValidation`؛ المستدعي في imports.functions.ts يمرّر `data.updateExisting` | اختبار `revalidate-update-existing.test.ts` عبر الوحدة الحقيقية (loadLookups + validator): نفس الصف الموجود مسبقاً يفشل بـ false ويمر بـ true مع `_existingId` |
| MEDIUM-5 | G-13 يقرأ DB فقط ⇒ إصداران نشطان في ملف واحد يمرّان | `activeVersionInFileByProgram` داخل `validateStudyPlans`: أول إصدار active يُثبَّت لكل برنامج وأي إصدار active مختلف لاحق في نفس الملف يُرفض برسالة واضحة؛ تكرار نفس الإصدار مسموح | حالتا اختبار جديدتان في G-13 |
| LOW-6 | حواف دورات من صفوف راسخة لأسباب أخرى ⇒ إيجابيات كاذبة | **حُسّن (لا وُثّق فقط):** كشف الدورات صار على مرحلتين — الحواف تُجمع في المرور الأول وتُقيَّم بعده من الصفوف السليمة فقط (`pendingPrereqEdges` + pass 2)؛ الصف الراسخ لسبب آخر لا يسهم بحافة | حالة `LOW-6: rows failing for other reasons do not contribute cycle edges` |
| LOW-7 | قراءة كاملة بلا ترقيم (~1000 PostgREST) | موثقة كمتابعة نظامية (قسم 6.3) — آمنة حالياً: عند تجاوز السقف يفشل INSERT بالقيد الفريد (ذرّي، لا تلف بيانات) | — |
| LOW-8 | تأكيد قيد UNIQUE للـ onConflict | مؤكد على main: migration `20260531230139_df358bbe-d10e-477d-a8ed-06a13fb837cb.sql` — الاقتباس الحرفي في قسم 2.3 | blob `35e64c76…` |

### 7.6 إصلاحات إضافية أثناء المعالجة (مكشوفة بالتشغيل الفعلي)

1. **تلوث mocks بين ملفات الاختبار (خطورة كامنة من #193 على المجموعة الكاملة):** bun يشغّل الملفات في عملية واحدة بلا عزل، وكاش `supabaseAdmin` الكسول (Proxy في client.server) مشترك ⇒ تسجيل `mock.module("@supabase/supabase-js")` في أكثر من ملف يتعارض لأن أول `createClient` يُحتجز في الكاش بمن فيه `from` **و`rpc`** (اكتُشف عند أول تشغيل مجمّع حقيقي: 3 فشل في ملف المستورِد، ثم فشل rpc في ملف الأهلية). **المعالجة:** نمط موزِّد `globalThis` مزدوج — `createClient` المموَّه يفوّض `from` و`rpc` إلى handler يثبّته كل ملف في `beforeEach` (آخر كاتب يفوز، لكل اختبار). طُبّق على الملفات الثلاثة المموِّهة: `revalidate-update-existing.test.ts` و`student-academic-status-importer.test.ts` و`student-eligibility-importer.test.ts` (الأخير **هارنس فقط بلا أي تغيير في منطق الاختبارات** — لتشاركها نفس الكاش). النتيجة بعد التوحيد: **66/66 في التشغيل المجمّع لكل الملفات الخمسة** — وهو ما سيشغّله CI.
2. **TS2314 في `bulk-import-validation.server.ts` و`imports.functions.ts`:** استخدام `ValidatedRow[]` مجرداً (موروث من main، كامن بفعل `noCheck:true`). **المعالجة:** افتراضي `T = unknown` في `types.ts` — سطر واحد يغطي كل الاستخدامات دون مساس باستدعاءات أخرى.

### 7.7 بصمات الملفات المُصلحة (git blob SHA-1)

تُسجَّل في تقرير التسليم المرافق (رسالة lead) — كل نسخ القواعد تحققت بايت-بايت قبل البناء عليها (`templates.main.ts` = `ddbe0a8f…`، `bulk-import-validation.branch.ts` = `5b9697cc…`، `validators/types/engine` طابقت بصمات الفرع).
