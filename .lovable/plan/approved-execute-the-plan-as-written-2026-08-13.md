# APPROVED — EXECUTE THE PLAN AS WRITTEN.

One mandatory addition:

Before declaring

PASS_COURSE_SYLLABUS_MATERIALS_STUDY_SYSTEM_SOURCE_READY_FOR_PRODUCTION_GATE

run not only:

- tests/mobile

- tests/student-requests

- tsgo --noEmit

but also all targeted suites for:

- course syllabus

- lecture execution

- faculty/course materials

- student materials

- course_sections imports

- CDP authorization / direct RPC negative matrix

The reconciliation import attachment must:

- contain exactly the 8 production sections

- use the exact canonical course_sections import columns

- preserve all current key/context values

- leave study_system BLANK

- contain no guessed/default value

- be clearly marked DECISION INPUT / NOT APPROVED DATA

No Production write.

No Migration apply.

No Publish/Deploy.

Proceed to source/document/package completion and return:

- STARTING_HEAD

- ENDING_HEAD

- exact changed files

- reconciliation attachment path

- updated reconciliation report

- execution guide path

- both migration draft hashes/diffs

- targeted test counts

- ZERO production writes confirmation

Final allowed decision:

PASS_COURSE_SYLLABUS_MATERIALS_STUDY_SYSTEM_SOURCE_READY_FOR_PRODUCTION_GATE

Then STOP.

إغلاق مسار نظام الدراسة والمواد التعليمية — مسار معتمد

المصدر الوحيد لتحديد نظام الدراسة للمجموعات الثماني هو **استيراد course_sections** مع خيار «تحديث القائم». لا واجهة إدارة جديدة، ولا اشتقاق من بيانات الطلاب، ولا أي قيمة افتراضية تُطبَّق تلقائيًا.

## الحالة الحالية (مؤكدة بالقراءة)

- قالب استيراد المجموعات يحتوي بالفعل على عمود `study_system` **إلزاميًا** بالقيم: عام / نفقة خاصة / كلا النظامين، ويرفض القيم غير المعروفة قبل الكتابة.
- محرّك الاستيراد يحدّث `study_system` للمجموعات الموجودة عند تفعيل «تحديث القائم» (UPDATE على السجل نفسه، بلا إنشاء مكرر).
- مسودتا الترحيل جاهزتان وغير مطبقتين:
  - `COURSE-MATERIALS-STUDY-SYSTEM-CANONICALIZATION-01` (توسيع المفردات + Trigger اشتقاق النطاق مع FAIL CLOSED عند مجموعة غير مصنفة)
  - `CDP-INSTANTIATE-AUTHORIZATION-HARDENING-01` (سحب EXECUTE من authenticated/anon/PUBLIC)
- 8 مجموعات نشطة قيمتها NULL (وفق تقرير المطابقة القائم).

## مخرجات هذه المرحلة (بدون كتابة إنتاجية)

1. **ملف استيراد مطابقة جاهز للتعبئة** يُولَّد من قراءة الإنتاج فقط، يحتوي صفًا واحدًا لكل مجموعة من الثماني بالمفاتيح الكاملة المطلوبة للقالب (course_code, academic_year, semester, program_code, level, section_code, …) و`study_system` **فارغًا** لتعبئته منك. يُحفظ ضمن `docs/reviews/` كمرفق مطابقة، لا كبيانات معتمدة.
2. **تحديث تقرير المطابقة** `docs/reviews/COURSE-SECTION-STUDY-SYSTEM-RECONCILIATION-01.md` ليضم: قائمة الثماني، مسار الاستيراد المعتمد، استعلامات التحقق، وترتيب الترحيل.
3. **دليل تنفيذ مرحلي** يوثّق كل بوابة وأمر التحقق الخاص بها.

## ترتيب الإنتاج المعتمد (كل خطوة ببوابة موافقة منك)

```text
1. رفع ملف الاستيراد المعبَّأ (course_sections + تحديث القائم)  ← موافقتك
2. Verify: ACTIVE_SECTIONS_WITH_NULL_STUDY_SYSTEM = 0
3. Migration A: COURSE-MATERIALS-STUDY-SYSTEM-CANONICALIZATION-01  ← موافقتك
4. Verify A: القيد + الدالة + الـTrigger + FAIL CLOSED
5. Migration B: CDP-INSTANTIATE-AUTHORIZATION-HARDENING-01        ← موافقتك
6. Verify B: proacl بلا authenticated/anon/PUBLIC + سلامة المسارات الإدارية
7. E2E متكامل: توصيف → خطة تنفيذ → مواد (محاضرة/عام) → عرض الطالب
```

Migration منفصلة لكل غرض؛ لا دمج.

## تفاصيل تقنية

- استعلام البوابة 2:
`SELECT count(*) FROM course_sections cs JOIN course_offerings co ON co.id = cs.course_offering_id WHERE cs.status = 'active' AND (cs.study_system IS NULL OR btrim(cs.study_system) = '');`
- Verify A: وجود `course_materials_study_system_check` بالمفردات القانونية، وجود `course_materials_derive_scope_trg`، ورفض إدراج مادة على مجموعة غير مصنفة بخطأ `UNKNOWN_SECTION_STUDY_SYSTEM`.
- Verify B: `SELECT proacl FROM pg_proc … proname='cdp_instantiate_from_syllabus'` — بلا `authenticated=X` أو `anon=X` أو `=X/`، مع بقاء المالك و`service_role`، وسلامة `syllabus_approve_version` و`cdp_regenerate_section_plan` و`cdp_section_autoplan`.
- الواجهة: المنطق fail-closed مطبَّق مسبقًا في `src/lib/course-materials-scope.ts` و`src/routes/faculty-portal.materials.$sectionId.tsx` — لا تعديل إضافي مطلوب.
- الاختبارات: `tests/student-requests` و`tests/mobile` و`tsgo --noEmit` قبل كل بوابة إنتاجية.

## خارج النطاق

واجهة إدارة جديدة، أي UPDATE مباشر لقيم الثماني، أي backfill أو قيمة افتراضية، نشر Web أو بناء APK.