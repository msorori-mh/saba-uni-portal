# COURSE-SECTION-STUDY-SYSTEM-RECONCILIATION-01

الحالة: **DECISION INPUT — NOT APPROVED DATA**. لا كتابة إنتاجية، ولا Migration مطبقة، ولا نشر.

## 1. المصدر المعتمد

المصدر الوحيد لتحديد `course_sections.study_system` للمجموعات الثماني هو **استيراد course_sections** من مركز الاستيراد مع تفعيل خيار «تحديث القائم».

- لا واجهة إدارة جديدة.
- لا اشتقاق من بيانات الطلاب أو التسجيلات.
- لا قيمة افتراضية أو تخمينية من الوكيل.
- القيم تُعبَّأ من مالك المشروع في ملف الاستيراد ثم تُطبَّق بعد موافقة صريحة على الكتابة الإنتاجية.

القيم المقبولة في العمود: `عام` / `نفقة خاصة` / `كلا النظامين` (العمود إلزامي في القالب، والقيم غير المعروفة تُرفض قبل الكتابة).

## 2. المجموعات النشطة ذات `study_system = NULL` (قراءة إنتاجية فقط)

عدد الصفوف: **8**

| # | course_code | اسم المقرر | academic_year | semester | program_code | level | section_code | faculty_employee_number | capacity | status | section_id |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | AI414 | تنقيب البيانات | 2026-2027 | 2026-1 | IT | 4 | DEMO-AI414 | DEMO-F-001 | 40 | active | fa1ba625-269a-498e-bb01-40119c67ed0c |
| 2 | FITCS01 | مقدمة في تكنولوجيا المعلومات | 2026-2027 | 2026-1 | IT | 1 | DEMO-FITCS01 | DEMO-F-001 | 40 | active | 352280c8-2214-46e2-aaf9-de424d0cc58b |
| 3 | FITCS02 | تفاضل وتكامل | 2026-2027 | 2026-1 | IT | 1 | DEMO-FITCS02 | DEMO-F-002 | 40 | active | ae8ffd5c-8b72-476c-bf80-61c3d8fba363 |
| 4 | FITCS03 | برمجة الحاسوب (1) | 2026-2027 | 2026-1 | IT | 1 | DEMO-FITCS03 | DEMO-F-001 | 40 | active | b4f00f2e-aec2-404a-8ac6-a3aae3737791 |
| 5 | FITCS05 | الرياضيات المتقطعة | 2026-2027 | 2026-1 | IT | 1 | DEMO-FITCS05 | DEMO-F-001 | 40 | active | df14b32c-5282-427e-b9f1-a8a76c6f254e |
| 6 | IT343 | التجارة الالكترونية | 2026-2027 | 2026-1 | IT | 4 | DEMO-IT343 | DEMO-F-002 | 40 | active | b600135e-55e9-45a8-a005-d0e5088c527e |
| 7 | IT425 | إدارة النظم وصيانتها | 2026-2027 | 2026-1 | IT | 4 | DEMO-IT425 | DEMO-F-001 | 40 | active | 9cb4c780-ed17-4691-b5f0-c4d845fd978f |
| 8 | USR02 | مهارات اللغة العربية (2) | 2025-2026 | second | IT | 1 | A | F2025028 | 30 | active | 92a920b4-5e7d-401c-aae3-aa2f22c8b1b9 |

`section_id` مذكور للتدقيق فقط، وليس عمودًا في ملف الاستيراد.

## 2-أ. القرار المعتمد (2026-08-13)

**APPROVED VALUES — مجموعات DEMO السبع = `عام`:**

| section_code | study_system |
|---|---|
| DEMO-FITCS01 | عام |
| DEMO-FITCS02 | عام |
| DEMO-FITCS03 | عام |
| DEMO-FITCS05 | عام |
| DEMO-IT343 | عام |
| DEMO-IT425 | عام |
| DEMO-AI414 | عام |

**PENDING OFFICIAL SOURCE — `A` / `USR02`:**

- القيمة تُترك **فارغة**؛ لا اعتماد ولا افتراض.
- السبب: لا يتوفر حاليًا مصدر أكاديمي رسمي يثبت نظام دراسة هذه المجموعة، وهي مجموعة إنتاجية حقيقية وليست DEMO.
- لا اشتقاق من الطلاب أو الرسوم أو أنماط التسجيل.

**أثر البوابة:** ما دامت `A / USR02` بلا قيمة فإن `ACTIVE_SECTIONS_WITH_NULL_STUDY_SYSTEM ≥ 1`،
وبالتالي **Migration A (Canonicalization) يبقى محجوزًا** حتى بلوغ القيمة `0`.
**Migration B (تأمين `cdp_instantiate_from_syllabus`)** تصلّب أمني مستقل تقنيًا، ويجوز اعتماده بأمر منفصل من المالك؛ لا تُربط سلامته بحالة USR02.

## 3. مرفق القرار (ملف الاستيراد)

المسار: `docs/reviews/COURSE-SECTION-STUDY-SYSTEM-RECONCILIATION-01-IMPORT.csv`

- يحتوي **8 صفوف بالضبط** — المجموعات الإنتاجية أعلاه.
- يستخدم أعمدة قالب `course_sections` القانونية بالترتيب نفسه:
  `course_code, academic_year, semester, program_code, level, section_code, study_system, faculty_employee_number, capacity, status`
- يحافظ على جميع قيم المفاتيح والسياق الحالية كما هي في الإنتاج.
- عمود `study_system` معبّأ بـ `عام` لصفوف DEMO السبع، و**فارغ** لصف `A / USR02` (معلّق).
- لا يحتوي أي قيمة مخمّنة أو افتراضية.
- **DECISION INPUT — NOT YET AUTHORIZED FOR PRODUCTION IMPORT** — لا يُرفع إلى الاستيراد الإنتاجي قبل أمر كتابة إنتاجية صريح.

## 4. أثر التصنيف على المواد التعليمية

المنطق fail-closed مطبَّق مسبقًا في المصدر:

- `src/lib/course-materials-scope.ts` — `deriveMaterialStudySystem` يعيد `null` للمجموعة غير المصنفة (لا رجوع إلى `both`).
- `src/lib/faculty-materials.functions.ts` — `getMaterialSectionStudySystem` يفحص التصنيف للواجهة.
- `src/routes/faculty-portal.materials.$sectionId.tsx` — يمنع إنشاء مادة ويعرض تنبيهًا عربيًا عند مجموعة غير مصنفة.
- المسودة `COURSE-MATERIALS-STUDY-SYSTEM-CANONICALIZATION-01` ترفع `UNKNOWN_SECTION_STUDY_SYSTEM` على مستوى قاعدة البيانات.

## 5. ترتيب الإنتاج المعتمد

راجع دليل التنفيذ: `docs/reviews/COURSE-SYLLABUS-MATERIALS-STUDY-SYSTEM-EXECUTION-GUIDE-01.md`
