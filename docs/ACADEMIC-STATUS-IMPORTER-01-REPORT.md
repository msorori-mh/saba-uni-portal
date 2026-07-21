# تقرير تنفيذ: مستورِد الحالة الأكاديمية للطلاب + LOWs الأربعة (ACADEMIC-STATUS-IMPORTER-01)

- **المهمة:** G-05 importer لـ `student_academic_status` + إصلاح LOWs الأربعة من تدقيق #187
- **الفرع:** `feat/student-academic-status-importer-01` (من `main` @ `331b7bcd`)
- **التاريخ:** 2026-07-21
- **النطاق:** `src/lib/imports/`، `src/lib/imports.functions.ts`، `src/routes/admin/imports.tsx` (ربط المسار فقط)، `tests/imports/`، `docs/`
- **القيود:** لا migrations مطبقة، لا SQL مُنفَّذ، لا دمج — تعديلات مصدرية + اختبارات فقط.
- **المرجعية:** [docs/ACADEMIC-DATA-QUALITY-AUDIT-01-REPORT.md](./ACADEMIC-DATA-QUALITY-AUDIT-01-REPORT.md) (PR #187، دُمج squash)

---

## 1) ملخص تنفيذي

1. **G-05 (HIGH) أُغلق:** أصبح لـ `student_academic_status` مستورِد كامل بنمط المستورِدات القائمة (validator → engine → dispatch → قالب → تبويب UI)، بحلّ الفصل **ضمن سنته** عبر `resolveSemesterId`، وبدفعة **ذرّية** (إدراج واحد / upsert واحد)، وبدون فقدان أي حقل silently. هذا يتيح ترحيل ~500 طالب لفصل جديد آلياً ويرفع الحاجب عن استيراد درجات الفصل الثاني.
2. **LOWs الأربعة طُبِّقت** في نفس الفرع: G-11 (المستوى ≤ سنوات البرنامج)، G-12 (منع المتطلب الذاتي/الدورات في الخطط)، G-13 (خطة نشطة واحدة لكل برنامج)، G-14 (هوية الخطة = UNIQUE الفعلي).
3. **اختبارات bun** موجبة/سالبة لكل ما سبق (ملف جديد + توسعة ملف الانحدار).

> ملاحظة حول مصدر «LOWs الأربعة»: PR #187 لا يحمل أي تعليقات مراجعة (تحققنا عبر API)؛ البنود الأربعة هي G-11..G-14 كما سُجِّلت في تقرير التدقيق المدمج («4 LOW notes logged» في رسالة الـ squash).

---

## 2) G-05 — مستورِد student_academic_status

### 2.1 نقاط الربط (كاملة، بلا مسار منقطع)

| # | الملف | التغيير |
|---|-------|---------|
| 1 | `src/lib/imports/types.ts` | إضافة `"student_academic_status"` إلى union الخاص بـ `ImportType` |
| 2 | `src/lib/imports/validators.ts` | `StudentAcademicStatusRow` + `validateStudentAcademicStatus()` |
| 3 | `src/lib/imports/engine.server.ts` | `importStudentAcademicStatus()` + `actionMap` ("student_academic_status_imported") |
| 4 | `src/lib/imports/bulk-import-validation.server.ts` | `case "student_academic_status"` في `previewBulkImportValidation` |
| 5 | `src/lib/imports/templates.ts` | قالب Excel (أعمدة + عينة + تعليمات عربية) |
| 6 | `src/lib/imports/labels.ts` | `IMPORT_TYPE_LABEL_AR` ("الحالة الأكاديمية للطلاب") + `STRUCTURE_TYPES` |
| 7 | `src/lib/imports.functions.ts` | `importTypeSchema` (z.enum) + `IMPORT_ROLES_BY_TYPE` (ACADEMIC_IMPORT_ROLES) + `runBulkImport` switch |
| 8 | `src/routes/admin/imports.tsx` | تبويب جديد + `STRUCTURE_TYPES` (تفعيل «تحديث القائم») + `IMPORT_TAB_INFO` (وصف/تحذير) — خارج النطاق الاسمي لكنه **ضروري لاتصال المسار** (بدونه لا يمكن الوصول للمستورِد من اللوحة) |

### 2.2 قواعد الـ validator

- **الأعمدة:** `academic_number` (مطلوب، يُحل عبر `student_profiles` بقطع 500)، `academic_year` (مطلوب)، `semester` (مطلوب)، `academic_level` أو `level` (مطلوب)، `enrollment_status` (اختياري).
- **حل الفصل ضمن سنته (G-02):** `resolveSemesterId(lookups, ay_id, semKey)` بخريطة `semestersByYearKey` — الإنتاج فيه 4 سنوات/9 فصول وأكواد مكررة (`first` في كل سنة)، فالحل القديم كان سيربط الطالب بفصل سنة أخرى silently.
- **حالة القيد:** whitelist = `enrolled/active/suspended/graduated/withdrawn/transferred/completed`، الافتراضي `enrolled` عند الإغفال (يتوافق مع DEFAULT 'active' في DB بمعنى «مقيّد»، ويطابق ما يكتبه importStudents).
- **G-11:** المستوى ≤ `programYearsById[student.program_id]`.
- **منع التكرار:** داخل الملف بمفتاح `student|year|semester`، وضد DB بقراءة `student_academic_status` كاملة ومطابقة UNIQUE(student_profile_id, academic_year_id, semester_id) — الموجود يُرفض ما لم يُفعَّل «تحديث القائم»، وحينها يُوسم بـ `_existingId`.

### 2.3 ذرّية الدفعة (engine)

```
newRows  → INSERT واحد (كل الصفوف في statement واحدة)
updateRows → UPSERT واحد ON CONFLICT (student_profile_id, academic_year_id, semester_id)
```

- كل statement في Postgres ذرّية: **عند الفشل لا يُدرَج/يُحدَّث أي صف** من المجموعة، ويُسجَّل خطأ دفعي (`row: 0`) يوضح «لم يُدرَج أي صف» / «لم يُحدَّث أي صف» مع سبب Postgres.
- **عدم فقدان الحقول silently:** `toPayload` يمرّر الحقول الخمسة كلها (`student_profile_id, academic_year_id, semester_id, level_id, enrollment_status`) + `updated_at`؛ لا يوجد حقل مُتحقَّق منه يُسقَط عند الكتابة.
- **قيود تصميمية موثقة:** supabase-js لا يوفر transaction متعددة الـ statements من غير RPC؛ لذا الذرّية **لكل مجموعة** (إدراج/تحديث) وليست عبر المجموعتين معاً. المجموعتان مستقلتان دلالياً (إنشاء مقابل تحديث) والفشل مُبلَّغ. إن طُلبت ذرّية عابرة للمجموعتين مستقبلاً فالحل RPC (يحتاج قرار مالك DB — NEEDS_USER_INPUT).
- الصفوف الفاشلة تحققاً لا تُقرّب DB إطلاقاً؛ Dry Run عبر `structDryRun` (صفر كتابة).

### 2.4 القالب والواجهة

- قالب `student_academic_status.xlsx`: الأعمدة أعلاه + صف عينة + 8 تعليمات (منها: الحل ضمن السنة، الذرّية، «تحديث القائم»).
- التبويب يعرض تحذير الذرّية ويُفعّل «تحديث القائم» (Structure tab) مع إعادة تحقق تلقائية عند تبديله، ويلزم Dry Run قبل التنفيذ — مثل بقية المستورِدات.

---

## 3) LOWs الأربعة — المنفَّذ

| البند | الشدة | المنفَّذ | الملف | اختبار |
|-------|-------|----------|-------|--------|
| **G-11** المستوى يتجاوز سنوات البرنامج | LOW | تحقق `level_number > prog.years` في 4 validators (students / study_plans / course_sections / academic_status)؛ `lookups.ts` يجلب `programs.years` ويبني `levelNumberById` + `programYearsById` (اختيارية — تُتخطى عند غيابها) | `lookups.ts`, `types.ts`, `validators.ts` | 5 حالات (طالب/خطة/مجموعة/حالة أكاديمية + skip عند غياب الخرائط) |
| **G-12** متطلب سابق ذاتي/دورات | LOW | رسم بياني لكل خطة (`program|plan|version`) داخل الملف؛ رفض `course == prerequisite`، وكشف الدورة بـ DFS (`prereqPathExists`) | `validators.ts` | 3 حالات (ذاتي، دورة ثنائية، سلسلة خطية سليمة) |
| **G-13** خطة نشطة واحدة لكل برنامج | LOW | قراءة `study_plans` النشطة؛ رفض تفعيل إصدار ثانٍ («عطّلها أولاً أو استورد كمسودة»)؛ نفس الإصدار أو draft مسموح | `validators.ts` | 3 حالات |
| **G-14** عدم تطابق مفتاح getOrCreatePlan | LOW | الهوية صارت `(program_id, version)` = UNIQUE الفعلي: بحث select أولاً، وإعادة قراءة بعد فشل الإدراج (سباق/قيد)، ورسالة خطأ تتضمن الإصدار | `engine.server.ts` | تغطية غير مباشرة عبر مسار study_plans القائم |

---

## 4) الاختبارات

| الملف | المحتوى |
|-------|---------|
| `tests/imports/student-academic-status-importer.test.ts` (جديد) | 10 حالات validator (موجبة/سالبة: حل فصل سنتين متشاركتين بالكود، الافتراضي، طالب غير موجود، فصل خارج السنة، حالة غير صحيحة، كل الحالات السبع، تكرار ملف، موجود مع/بدون updateExisting، G-11) + 5 حالات engine (إدراج/upsert واحد لكل مجموعة، onConflict = مفتاح UNIQUE، تطابق مفاتيح الـ payload الستة، فشل المجموعة كاملة في كل من الإدراج والـ upsert، صفر DB للصفوف الفاشلة وللـ dry-run) |
| `tests/imports/import-validators-linking.test.ts` (مُحدَّث) | إضافة describes لـ G-11 (5) وG-12 (3) وG-13 (3)؛ تحديث `makeLookups` (years/levelNumberById/programYearsById + cs102) ودعم `.eq()` في الـ mock (استعلام G-13)؛ اختبارات G-07 القائمة صارت تمرّر `study_plans: []` |

### شفافية التحقق
بيئة العمل MCP-only: **تعذّر تشغيل `bun test` فعلياً هنا** (لا runtime). الاختبارات كُتبت على نفس harness المُثبت في `student-eligibility-importer.test.ts` و`import-validators-linking.test.ts` (mock.module لـ @supabase/supabase-js + spyOn لـ getImportDb + نفس أشكال الـ chainables: select/in/eq/insert/upsert)، ورُوجعت سلوكياتها سطراً بسطر مقابل المصدر المنفَّذ. يُوصى بتشغيل `bun test tests/imports` محلياً أو في CI قبل الدمج.

---

## 5) تأكيدات السلامة

- ✅ لا migrations أُضيفت أو طُبِّقت؛ لا SQL نُفِّذ (أدوات GitHub MCP فقط).
- ✅ لا دمج — PR واحد فقط على `main`.
- ✅ لا تغيير على سلوك المستورِدات الأخرى خارج البنود الأربعة (G-11 تحقق إضافي فقط، يُتخطى عند غياب الخرائط الاختيارية؛ G-13 قراءة إضافية واحدة لكل دفعة خطط).
- ✅ البنى الاختيارية في `LookupMaps` تحفظ توافق الاختبارات/الاستدعاءات القديمة.

## 6) متابعات (غير مانعة)

1. **قالب رسمي في `master-templates.ts`:** مكتبة القوالب الرسمية تستخدم union خاصاً بها؛ إضافة مدخل للحالة الأكاديمية تحسين تجميلي اختياري (القالب متاح أصلاً من التبويب).
2. **ذرّية عابرة للمجموعتين** (إدراج+تحديث في transaction واحدة): تتطلب RPC — قرار مالك DB (NEEDS_USER_INPUT).
3. **G-04 (ربط الطالب بخطته) يبقى مفتوحاً** من التدقيق الأصلي — مسودة D-3 جاهزة في `docs/drafts/` وتنتظر قرار المالك.
