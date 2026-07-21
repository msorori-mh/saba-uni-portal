# ACADEMIC-DATA-QUALITY-AUDIT-01 — تقرير تدقيق جودة البيانات الأكاديمية وربطها (طلاب/برامج/مستويات/دفعات/خطط)

- **المهمة:** ACADEMIC-DATA-QUALITY-AND-COHORT-LINKING-01
- **الفرع:** `audit/academic-data-quality-01` (من `main` HEAD `8f229d09`)
- **التاريخ:** 2026-07-21
- **النطاق:** تحليل مصدري فقط + إصلاحات استيراد آمنة محددة مع اختبارات. **لم تُطبَّق أي migrations، ولم يُنفَّذ أي SQL على قاعدة الإنتاج، ولم يُدمَج أي PR.** كل الملاحظات عن بيانات الإنتاج مقتبسة من تقارير تدقيق سابقة موثقة في `docs/`.
- **الحالة:** مكتمل — ينتظر المراجعة واعتماد المسودات.

---

## 1. الملخص التنفيذي

تم تدقيق سلسلة الربط `students → programs/departments → levels → academic_years/semesters → study_plans → course_offerings/sections → enrollments/grades` من المصدر (المحرك `src/lib/imports/*`، الأنواع المولّدة `src/integrations/supabase/types.ts`، وملفات migrations المرجعية) مع مراجعة تقارير الاستيراد السابقة (G9، study plans، cohort binding، pilot readiness).

**النتيجة: 14 فجوة ربط — 1 حرجة، 4 عالية، 5 متوسطة، 4 منخفضة** + 5 ملاحظات جودة بيانات من التدقيقات السابقة تحتاج ملفات/قرارات من الجهة الأكاديمية.

| الشدة | العدد | الحالة في هذا الPR |
|---|---|---|
| CRITICAL | 1 (G-01) | ✅ أُصلح مصدرياً + اختبار |
| HIGH | 4 (G-02..G-05) | ✅ G-02 أُصلح + اختبار · مسودة DB لـ G-03/G-04 · مهمة مصدرية لـ G-05 |
| MEDIUM | 5 (G-06..G-10) | ✅ G-06/G-07 أُصلحان + اختبارات · مسودات لـ G-07(DB)/G-10 · G-08/G-09 قرارات |
| LOW | 4 (G-11..G-14) | مهام مصدرية/مسودات |

**أخطر ثلاث فجوات:**
1. **G-01 (حرجة):** خمسة validators للاستيراد (`course_sections`, `student_enrollments`, `student_grades`, `student_fees`, `student_discounts`) معطوبة بالكامل — معرّف غير معرَّف `sb` يرمي `ReferenceError` عند أي استدعاء. لا يكشفها البناء (vite فقط) ولا CI (لا typecheck) ولا الاختبارات الحالية.
2. **G-02 (عالية):** تحليل الفصل الدراسي غير مربوط بالسنة الأكاديمية — `semestersByCode` خريطة عامة تُبقي آخر صف فقط لكل `code`، والإنتاج يحوي **4 سنوات أكاديمية و9 فصول** ⇒ ربط صامت بفصل سنة أخرى.
3. **G-03 (عالية):** الجداول المركزية للحقائق الأكاديمية (`course_offerings`, `student_enrollments`, `student_grades`, `grade_components`) **بلا أي مفاتيح أجنبية** في قاعدة البيانات حتى HEAD.

---

## 2. منهجية التدقيق

- **مصدر الاستيراد:** `src/lib/imports/validators.ts`، `engine.server.ts`، `engine.ts`، `lookups.ts`، `types.ts`، `import-db.ts`، `templates.ts`، `bulk-import-validation.server.ts`.
- **المخطط:** `src/integrations/supabase/types.ts` (مولّد من قاعدة الإنتاج بعد G9 — مرجع العلاقات/FKs عند HEAD)، وmigrations المرجعية: `20260531230139` (سنوات/فصول/حالة أكاديمية)، `20260531231424` (مقررات/خطط)، `20260531232114` (إسنادات/مجموعات)، `20260531232752` (تسجيلات)، `20260531222858` (ملفات الطلاب)، `20260531210958` (البرامج)، `20260703192337` (أعمدة أهلية G9).
- **التقارير السابقة:** `PORTAL-G9-ELIGIBILITY-DATA-READINESS-AUDIT-01`، `PORTAL-G9-ELIGIBILITY-DATA-IMPORTER-IMPLEMENTATION-01`، `STUDY-PLANS-IMPORT-AUDIT-01`، `STUDY-PLANS-IMPORT-CONTEXT-02`، `STUDENT-TO-COHORT-BINDING-AUDIT-01`، `IT-STUDY-PLAN-DATA-READINESS-01`، `GRADES-SECOND-SEMESTER-IMPORT-READINESS-01`، `PORTAL-PILOT-DATA-READINESS-AUDIT-01`، `PORTAL-DATA-COLLECTION-01`، `REPORT-STUDY-PLANS-RELATIONSHIP-FIX-01`.
- **قناة التغذية/CI:** `.github/workflows/ci.yml`، `package.json`، `tests/imports/*`.

---

## 3. المخزون الحالي للربط (ما هو موجود)

| الجدول | قيود uniqueness | FKs موجودة (من types.ts) | ملاحظات |
|---|---|---|---|
| `student_profiles` | `academic_number` | `department_id`, `program_id` | بلا `study_plan_id`، بلا cohort/admission، بلا `gender` |
| `student_academic_status` | `(student_profile_id, academic_year_id, semester_id)` | 4 FKs | هو معرّف «الدفعة/الفصل الحالي» الفعلي للطالب |
| `programs` | `code` | `department_id` | `years`, `degree_type` موجودة؛ حقل `study_plan` JSON قديم مهجور |
| `academic_levels` | `level_number` (عالمي) | — | غير مربوط بالبرامج |
| `academic_years` | `name` | — | 4 سنوات في الإنتاج |
| `semesters` | `(academic_year_id, code)` | `academic_year_id` | 9 فصول في الإنتاج ⇒ الرموز تتكرر عبر السنوات |
| `study_plans` | `(program_id, version)` | `program_id` | بلا ربط بسنة/دفعة؛ `is_active` بلا قيد خطة واحدة نشطة |
| `study_plan_courses` | `(study_plan_id, course_id, level_id, semester_code)` | `course_id`, `prerequisite_course_id` | `semester_code` نص حر بلا CHECK |
| `course_offerings` | `(course_id, academic_year_id, semester_id, program_id, level_id)` | **لا شيء** | الأعمدة الخمسة uuid بلا REFERENCES |
| `course_sections` | `(course_offering_id, section_code)` | `course_offering_id` | — |
| `student_enrollments` | `(student_profile_id, course_section_id)` | **لا شيء** | يعوّضها جزئياً trigger `validate_student_enrollment` |
| `student_grades` | `(student_enrollment_id, grade_component_id)` | **لا شيء** | — |
| `grade_components` | `(course_section_id, name)` | **لا شيء** | — |
| `student_requests` | — | `request_type` فقط | `student_profile_id` بلا FK |

**سلسلة الاعتماد التشغيلية الموثقة:** مستويات/أقسام/برامج → مقررات → خطط → سنوات/فصول → طلاب (+حالة أكاديمية للفصل) → إسنادات → مجموعات → تسجيلات → درجات.

---

## 4. جدول الفجوات المرقم بشدة

| # | الشدة | الفجوة | الدليل (مصدر) | الإصلاح المقترح | مالك القرار | الحالة |
|---|---|---|---|---|---|---|
| G-01 | 🔴 حرجة | 5 validators معطوبة (`sb` غير معرَّف) | `validators.ts` | إصلاح مصدر + اختبارات | مصدر | ✅ منفذ في الPR |
| G-02 | 🟠 عالية | الفصل لا يُحلّ ضمن سنته (ربط عبر السنوات) | `lookups.ts` + `validators.ts` | إصلاح مصدر + اختبارات | مصدر | ✅ منفذ في الPR |
| G-03 | 🟠 عالية | لا FKs على `course_offerings`/`student_enrollments`/`student_grades`/`grade_components` | `types.ts` (Relationships: []) + migrations | مسودة DB forward-only | مصدر (تطبيق باعتماد) | 📄 مسودة D-1 |
| G-04 | 🟠 عالية | لا ربط طالب↔خطة دراسية (نسخة الخطة مجهولة لكل طالب) | `types.ts` + `engine.server.ts` | مسودة DB + سياسة ربط | NEEDS_USER_INPUT (سياسة) + مصدر | 📄 مسودة D-3 |
| G-05 | 🟠 عالية | لا مسار استيراد جماعي لترحيل الفصول (`student_academic_status`) | `types.ts` (ImportType) + `engine.server.ts` | مهمة مصدرية (importer جديد) | مصدر + NEEDS_USER_INPUT (سياسة الترحيل) | مفتوح |
| G-06 | 🟡 متوسطة | لا تحقق أن البرنامج يتبع القسم (طلاب/أعضاء هيئة) | `validators.ts` | إصلاح مصدر + اختبارات | مصدر | ✅ منفذ في الPR |
| G-07 | 🟡 متوسطة | `study_plan_courses.semester_code` نص حر | migration `20260531231424` + `validators.ts` | validator (منفذ) + CHECK (مسودة) | مصدر | ✅ جزئياً + 📄 D-2 |
| G-08 | 🟡 متوسطة | `importStudents` غير ذرّي + حقل gender يُفقد silently | `engine.server.ts` + `types.ts` | مهمة مصدرية (تعويض/rollback) + قرار gender | مصدر + NEEDS_USER_INPUT | مفتوح |
| G-09 | 🟡 متوسطة | حقول أهلية G9 غير مربوطة بسنة (ستالeness سنوي) | `engine.server.ts` + `types.ts` | سياسة (snapshot سنوي/reset) | NEEDS_USER_INPUT | مفتوح |
| G-10 | 🟡 متوسطة | لا معرّف دفعة قَبول (admission cohort) للطلاب | `types.ts` + G9 audit §3.1 | مسودة DB + تعريف أكاديمي | NEEDS_USER_INPUT + مصدر | 📄 مسودة D-4 |
| G-11 | 🔵 منخفضة | المستوى غير مقيّد بعدد سنوات البرنامج | `validators.ts` + `programs.years` | مهمة مصدرية (تحقق) | مصدر | مفتوح |
| G-12 | 🔵 منخفضة | المتطلب السابق: لا منع self-reference ولا تحقق داخل الخطة | `validators.ts` | مهمة مصدرية | مصدر | مفتوح |
| G-13 | 🔵 منخفضة | يمكن تعدد الخطط النشطة لنفس البرنامج | migration `20260531231424` | مسودة partial unique index | مصدر | 📄 ضمن D-3 |
| G-14 | 🔵 منخفضة | مفتاح find-or-create للخطة ≠ مفتاح الـunique | `engine.server.ts` | مهمة مصدرية | مصدر | مفتوح |

---

## 5. تفاصيل الفجوات والأدلة

### G-01 (حرجة) — خمسة validators ترمي `ReferenceError: sb is not defined` عند أي استدعاء
- **الدليل:** في `src/lib/imports/validators.ts`، الدوال `validateCourseSections`, `validateStudentEnrollments`, `validateStudentGrades`, `validateStudentFees`, `validateStudentDiscounts` تستدعي `sb.from("course_offerings")…` و`sb.from("student_academic_status")…` الخ، بينما الوحدة لا تستورد ولا تعرّف `sb` إطلاقاً (الاستيرادات الوحيدة: `types`, `normKey`, `getImportDb`, `resolveStaffRoleTypeInput`, `ELIGIBILITY_FIELD_ERROR_AR`). بقية validators الملف نفسه تستخدم `getImportDb()` بشكل صحيح، و`loadLookups()` في `lookups.ts` يعرّف `const sb = getImportDb();` محلياً.
- **لماذا لم تُكشف:** `package.json` بلا سكربت `typecheck` (خطوة Typecheck في `ci.yml` تطبع «skipping»)، والبناء `vite build` فقط (esbuild لا يفحص المعرّفات)، و`tests/imports/` تغطي أهلية G9 فقط، و`npm run lint` advisory في CI.
- **الأثر:** أي معاينة/تنفيذ لأنواع الاستيراد الخمسة يفشل فور أول `sb.from(...)`. هذا يشمل مسار استيراد درجات الفصل الثاني المخطط (`GRADES-SECOND-SEMESTER-IMPORT-READINESS-01`) وأقسام/تسجيلات/رسوم/خصومات. متوافق مع وضع الإنتاج: `course_offerings=0`, `course_sections=0`, `student_enrollments=0` (PILOT audit §4).
- **الإصلاح (منفذ):** `const sb = getImportDb();` أول كل دالة متأثرة (نفس نمط `loadLookups`) + اختبار smoke لكل مسار.

### G-02 (عالية) — تحليل الفصل الدراسي غير مربوط بالسنة الأكاديمية
- **الدليل:** `lookups.ts` كان يقرأ `semesters` بـ `select("id, name, code")` **بدون `academic_year_id`** ويبني `semestersByCode` عامة بـ `Map.set` — آخر صف يطمس البقية. القيد الفعلي في DB هو `UNIQUE (academic_year_id, code)` (migration `20260531230139`) أي `first` موجود مرة **لكل سنة**. الإنتاج فيه 4 سنوات و9 فصول (PILOT audit §3) ⇒ الاصطدام حاصل اليوم. ست دوال validator تحلّ الفصل عبر `lookups.semestersByCode.get(semKey) ?? lookups.semestersByName.get(semKey)` دون فحص انتماء الفصل لسنة الصف. نفس الخطر ورد كـ«risk» في `GRADES-SECOND-SEMESTER-IMPORT-READINESS-01` ولم يُعالج.
- **الأثر:** ربط صامت لصفوف الطلاب/الأقسام/التسجيلات/الدرجات/الرسوم بفصلٍ من سنة أخرى؛ ومفتاح الإسناد يجمع `ay_id` صحيح مع `sem_id` من سنة أخرى ⇒ إما فشل «لا يوجد إسناد مقرر مطابق» أو إنشاء إسنادات فاسدة ذاتياً الاتساق عبر `importCourseSections.resolveOffering`.
- **الإصلاح (منفذ):** خريطة `semestersByYearKey` (`ayId|key` لكلٍّ من code وname) + `resolveSemesterId()` عامل السنة، مع fallback للخرائط القديمة لتفادي أي كسر رجعي. رسالة الخطأ: «الفصل غير موجود ضمن السنة الأكاديمية المحددة».

### G-03 (عالية) — لا تكامل مرجعي على جداول الحقائق الأكاديمية
- **الدليل:** `src/integrations/supabase/types.ts` (المولّد من الإنتاج بعد G9): `course_offerings.Relationships: []`، `student_enrollments.Relationships: []`، `student_grades.Relationships: []`، `grade_components.Relationships: []`، و`student_requests` فيها FK لـ `request_type` فقط (أي `student_profile_id` بلا FK). الأصل: `CREATE TABLE public.course_offerings` في migration `20260531232114` بخمسة أعمدة uuid **بلا REFERENCES**، و`student_enrollments` في `20260531232752` كذلك. يوجد trigger `validate_student_enrollment` يغطي التسجيلات فقط.
- **الأثر:** أي مسار كتابة خارج الاستيراد (UI، RPC، SQL يدوي) يمكنه إنشاء مراجع يتيمة؛ لا `ON DELETE` محدد؛ حذف مقرر/فصل/برنامج يترك إسنادات معلقة ما تزال تطابق `offeringByKey` في الاستيراد.
- **الإصلاح:** مسودة **D-1** (`docs/drafts/20260721000000_academic_fk_integrity_constraints.draft.sql`) — FKs بأسلوب `NOT VALID` ثم `VALIDATE` بعد استعلامات كشف اليتامى. forward-only بالكامل.

### G-04 (عالية) — لا ربط طالب↔خطة دراسية
- **الدليل:** `student_profiles` بلا `study_plan_id` (قائمة الأعمدة في `types.ts`)؛ `study_plans` بلا ربط بسنة/دفعة (`name, program_id, version, is_active, status` فقط)؛ `importStudents` في `engine.server.ts` يدرج profile + academic status فقط. تقرير G9 §3.1: «No admission_year, cohort, intake_batch».
- **الأثر:** المقاصة/التخريج وحساب المقررات المتبقية وأهلية مشروع التخرج لا يمكنها تحديد نسخة الخطة الواجبة على الطالب؛ ومع إمكان تعدد الخطط النشطة للبرنامج (G-13) يصبح الاختيار تقديرياً.
- **الإصلاح:** مسودة **D-3** (عمود nullable + FK + فهرس جزئي لخطة نشطة واحدة). **سياسة الربط نفسها (أي خطة لأي دفعة/سنة) قرار أكاديمي ⇒ NEEDS_USER_INPUT.**

### G-05 (عالية) — لا مسار جماعي لترحيل الفصول الدراسية
- **الدليل:** `ImportType` في `src/lib/imports/types.ts` لا يحوي نوع `student_academic_status`؛ `importStudents` ينشئ الحالة لفصل واحد فقط عند الإنشاء؛ تقرير الدرجات يوثق أن إنشاء الحالة «يُنشأ مع استيراد الطلاب أو يدوياً». وكلّا validators التسجيلات/الدرجات تشترط صف حالة مطابقاً للفصل (`levelByStudentTerm`).
- **الأثر:** ترحيل ~500 طالب إلى فصل ثانٍ يدوي بالكامل ويغلق طريق استيراد تسجيلات/درجات الفصل الثاني؛ والاعتماد على «أحدث حالة» في trigger ومواد المقررات (HIGH-1..3 في STUDENT-TO-COHORT-BINDING-AUDIT-01) يزيد الهشاشة.
- **الإصلاح:** مهمة مصدرية: importer جديد `student_academic_status` (insert/update) مبني على `resolveSemesterId` المُصلَح. سياسة الترقية (level+1 تلقائياً؟ شروط الإعادة؟) ⇒ NEEDS_USER_INPUT.

### G-06 (متوسطة) — لا تحقق من انتماء البرنامج للقسم
- **الدليل:** `validateStudents` كان يحلّ `dep_id` من `departmentsByName` و`prog` من `programsByCode` بشكل مستقل؛ `programsByCode` يحمل `department_id` لكنه لا يُقارن أبداً. نفس النمط في `validateFaculty`. (ملاحظة: قالب الطلاب يعبّئ `department_code` بـ**اسم** القسم — يُحل بالاسم — ما يسهّل الخلط.)
- **الأثر:** طالب مربوط بقسم A وبرنامج تابع لقسم B ⇒ صلاحيات رؤساء الأقسام والتقارير والمجالس تُبنى على بيانات متناقضة. سابقة في الإنتاج: طالب بلا `program_id/department_id` (PILOT audit).
- **الإصلاح (منفذ):** خطأ تحقق «البرنامج لا يتبع القسم المحدد» عند عدم التطابق (طلاب + هيئة تدريس) + اختبارات.

### G-07 (متوسطة) — `study_plan_courses.semester_code` نص حر
- **الدليل:** migration `20260531231424`: `semester_code text NOT NULL` بلا CHECK؛ و`validateStudyPlans` كان `str(raw.semester) || "first"` — أي سلسلة تمر وتُخزن، والتقارير/السجل (مثل `student_unofficial_transcript.semester_code`) تفترض `first/second/summer`.
- **الأثر:** رموز فاسدة («الأول»، «Fall») تكسر مطابقة الفصول وتعطّل قيد `(plan, course, level, semester_code)` عملياً عبر تنويعات الإملاء.
- **الإصلاح:** validator (✅ منفذ): قائمة بيضاء + أسماء عربية → رموز قانونية. ومسودة **D-2** لقيد CHECK على DB بعد فحص/تنظيف القيم الحالية.

### G-08 (متوسطة) — `importStudents` غير ذرّي + فقدان gender
- **الدليل:** `engine.server.ts#importStudents`: إدراج `student_profiles` بحقول بلا `gender`، ثم إدراج `student_academic_status`؛ عند فشل الثاني `continue` دون حذف تعويضي ⇒ ملف يتيم والرقم الأكاديمي يصبح «موجود مسبقاً». و`validateStudents` يحلّل `gender` (male/female/ذكر/أنثى) والقالب يروّج لها، لكن **`student_profiles` لا يملك عمود gender أصلاً** (`types.ts`) ⇒ يُسقط silently.
- **الأثر:** سابقة موثقة: 503 ملفات طلاب مقابل 502 صف حالة أكاديمية (G9 readiness audit) — النمط نفسه؛ وفقدان بيانات النوع الاجتماعي للتقارير والاستهداف.
- **الإصلاح:** مهمة مصدرية (حذف تعويضي أو RPC ذرّي). سياسة gender (إضافة عمود أم حذف الحقل من القالب) ⇒ NEEDS_USER_INPUT.

### G-09 (متوسطة) — حقول أهلية G9 غير مربوطة بسنة
- **الدليل:** `student_study_status`, `transferred_current_year`, `previous_suspension_semesters_count`, `consecutive_suspension_years_count` على مستوى `student_profiles` (migration `20260703192337`) و`importStudentEligibility` يحدّثها بلا بُعد سنة.
- **الأثر:** في السنة التالية تصبح قيم «منقول هذا العام» قديمة وتُستخدم في قرارات أهلية خاطئة ما لم تُصفَّر يدوياً.
- **الإصلاح:** قرار: لقطات سنوية (جدول snapshot) أم runbook تصفير سنوي ⇒ NEEDS_USER_INPUT.

### G-10 (متوسطة) — لا معرّف دفعة قبول (admission cohort)
- **الدليل:** لا `admission_year`/`intake` على `student_profiles` (G9 audit §3.1 صريحة)؛ الاعتماد الحالي على بادئة الرقم الأكاديمي («26») كإشارة غير رسمية.
- **الأثر:** تحليلات الدفعات والاستهداف وربط المواد (تقرير STUDENT-TO-COHORT-BINDING-AUDIT-01) كلها على بدائل هشة.
- **الإصلاح:** مسودة **D-4** (عمودان nullable + FKs). تعريف الدفعة ومصدر قيمها ⇒ NEEDS_USER_INPUT.

### G-11 (منخفضة) — المستوى غير مقيّد بسنوات البرنامج
- **الدليل:** `academic_levels.level_number` فريد عالمياً؛ `programs.years` موجود لكن لا validator يقارن مستوى الطالب/مقرر الخطة/الإسناد مع طول البرنامج.
- **الإصلاح:** مهمة مصدرية: تحذير/خطأ عندما level_number > programs.years.

### G-12 (منخفضة) — سلامة المتطلبات السابقة في الخطط
- **الدليل:** `validateStudyPlans` يتحقق فقط من وجود المتطلب في `coursesByCode`؛ لا منع لـ self-prerequisite، ولا تحقق أن المتطلب ضمن الخطة نفسها أو مستوى/فصل سابق.
- **الإصلاح:** مهمة مصدرية: خطأ self-ref + تحذير خارج-الخطة + كشف دورات بسيط.

### G-13 (منخفضة) — تعدد الخطط النشطة لنفس البرنامج
- **الدليل:** `study_plans` قيدها `UNIQUE (program_id, version)` فقط؛ لا فهرس جزئي على `is_active`.
- **الإصلاح:** ضمن مسودة D-3 — `CREATE UNIQUE INDEX … ON study_plans(program_id) WHERE is_active` بعد فحص التعدد الحالي.

### G-14 (منخفضة) — مفتاح find-or-create للخطة ≠ قيد الـunique
- **الدليل:** `engine.server.ts#getOrCreatePlan` يبحث بـ `(program_id, name, version)` بينما القيد `(program_id, version)` — نسخة موجودة باسم مختلف تفشل الإدراج برسالة عامة «تعذر إنشاء أو إيجاد الخطة»؛ و`importStudyPlans` insert-only لصفوف الخطة (القيد يمنع التكرار لكن إعادة التشغيل الجزئي تفشل صفوفاً بشكل مربك).
- **الإصلاح:** مهمة مصدرية: محاذاة البحث مع القيد + رسالة أوضح + وضع update اختياري.

---

## 6. ملاحظات جودة بيانات (من التدقيقات السابقة — تحتاج جهة المصدر)

| الملاحظة | المصدر | المطلوب |
|---|---|---|
| ~500/501 طالب بلا إيميل جامعي | PILOT audit §4 | ملف إيميلات رسمي ⇒ NEEDS_USER_INPUT |
| 123 طالباً `study_system` فارغ | G9 audit + PILOT | ملف تصحيح نظام الدراسة ⇒ NEEDS_USER_INPUT |
| طالب واحد بلا `program_id/department_id` | PILOT audit §4 | تصحيح سجل فردي ⇒ NEEDS_USER_INPUT |
| 503 ملفات مقابل 502 حالة أكاديمية | G9 readiness audit | إنشاء الحالة الناقصة (يرتبط بـ G-08/G-05) |
| حقول الأهلية الأربعة كلها افتراضية/NULL؛ `student_enrollments` فارغ | G9 readiness audit §4 | ملفات شؤون الطلاب الرسمية (G9) ⇒ NEEDS_USER_INPUT |

---

## 7. الإصلاحات المصدرية المنفذة في هذا الPR

| الإصلاح | الملفات | الاختبارات |
|---|---|---|
| G-01: `const sb = getImportDb();` في الـvalidators الخمسة | `src/lib/imports/validators.ts` | smoke: `validateCourseSections`, `validateStudentFees` |
| G-02: `semestersByYearKey` + `resolveSemesterId` + توصيله بالدوال الست | `src/lib/imports/lookups.ts`, `types.ts`, `validators.ts` | ربط سنتين بنفس الرمز، رفض رمز غير موجود بالسنة، fallback قديم، بناء الخريطة من `loadLookups` |
| G-06: تحقق «البرنامج يتبع القسم» (طلاب + هيئة تدريس) | `src/lib/imports/validators.ts` | قبول/رفض الحالتين |
| G-07: قائمة بيضاء لـ semester_code + أسماء عربية | `src/lib/imports/validators.ts` | «الأول»→first، رفض «خريف»، الافتراضي first |

- **ملف الاختبار:** `tests/imports/import-validators-linking.test.ts` (bun:test، نفس نمط `student-eligibility-importer.test.ts`: `spyOn(importDb, "getImportDb")` + جداول وهمية).
- **التشغيل:** `bun test tests/imports/import-validators-linking.test.ts`.
- **شفافية التحقق:** بيئة التدقيق هذه MCP-only — لم يتسنَّ تشغيل `bun test` محلياً؛ الاختبارات تتبع نمط harness المعتمد في المستودع وتغطي المسارات المعدّلة حصراً. لم تُمسّ أي ملفات أخرى في `src/`.

## 8. مسودات DB forward-only المرفقة (غير مطبقة)

| المسودة | الفجوة | المضمون |
|---|---|---|
| `docs/drafts/20260721000000_academic_fk_integrity_constraints.draft.sql` | G-03 | FKs (NOT VALID ثم VALIDATE) لـ course_offerings/student_enrollments/student_grades/grade_components/student_requests + استعلامات كشف يتامى |
| `docs/drafts/20260721000001_study_plan_courses_semester_code_check.draft.sql` | G-07 | فحص القيم الحالية + تطبيع اختياري + CHECK `(first/second/summer)` |
| `docs/drafts/20260721000002_student_study_plan_binding.draft.sql` | G-04/G-13 | `student_profiles.study_plan_id` nullable + FK + فهرس جزئي خطة-نشطة-واحدة |
| `docs/drafts/20260721000003_student_admission_cohort.draft.sql` | G-10 | `admission_year_id`/`admission_semester_id` nullable + FKs + ملاحظة توسيع الاستيراد |

جميعها: إضافية فقط (ADD COLUMN/CONSTRAINT/INDEX)، بلا حذف، بلا تعبئة إجبارية، مع استعلامات تحقق مسبقة وملاحظات تراجع.

## 9. قرارات تحتاج NEEDS_USER_INPUT

1. **سياسة ربط الطالب بالخطة** (أي نسخة خطة لأي دفعة/سنة قبول) — قبل تطبيق D-3 وقبل أي backfill.
2. **تعريف «الدفعة» ومصدر بياناتها** — قبل تطبيق D-4.
3. **سياسة أهلية G9 السنوية** (snapshot لكل سنة أم تصفير سنوي موثق) — G-09.
4. **سياسة gender** (إضافة عمود DB أم إزالة الحقل من قالب الاستيراد) — G-08.
5. **الملفات الرسمية** (أهلية G9، الإيميلات الجامعية، نظام الدراسة) — قسم 6.

## 10. تأكيدات السلامة

- ❌ لا migrations مطبقة · ❌ لا SQL منفذ على الإنتاج · ❌ لا دمج PRs · ❌ لا تعديل واسع في `src/` (ثلاثة ملفات استيراد + اختبار واحد فقط).
- ✅ التغييرات المصدرية مقيدة بـ `src/lib/imports/{validators,lookups,types}.ts` + `tests/imports/import-validators-linking.test.ts`.
- ✅ سلوك جديد أصرم فقط حيث كانت البيانات صحيحة تمر دون تغيير (fallback للخرائط القديمة محفوظ).

**القرار: PASS WITH NOTES** — التقرير والإصلاحات والمسودات جاهزة للمراجعة؛ الفجوات المفتوحة موزعة بين مسودات DB بانتظار الاعتماد وقرارات NEEDS_USER_INPUT موثقة أعلاه.
