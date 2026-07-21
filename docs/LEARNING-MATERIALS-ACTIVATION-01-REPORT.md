# LEARNING-MATERIALS-SECURE-ACTIVATION-01 — التقرير

**الحالة:** مكتمل مصدريًا (source-complete) — التفعيل الفعلي يبقى خلف feature flags.
**الفرع:** `feat/learning-materials-activation-01` (من main @ `8f229d09`)
**النطاق:** `src/**/material*` والمكونات المرتبطة، `tests/materials/`, `docs/drafts/*material*`, `docs/LEARNING-MATERIALS-*`.
**لم يتم:** أي migration مطبقة، أي SQL مطبق، أي تغيير على سياسات/سلات Storage (موافقة معلقة)، أي دمج، أي قلب للأعلام (`facultyCourseMaterials` / `studentCourseMaterials` تبقيان `false`).

## 1) ما تم إنجازه (مطابقة للبنود المطلوبة)

### ربط المواد بالأسبوع/المحاضرة/المقرر
- `week_number` (1..20، nullable) أضيف عبر مسودة SQL (DRAFT ONLY) مع CHECK وفهرس `(course_section_id, week_number)`.
- الربط بالمقرر قائم أصلاً عبر `course_sections → course_offerings` (العقود المدموجة #154/#156/#157).
- واجهة الأستاذ: حقل «الأسبوع» في إنشاء المادة + عرض «الأسبوع X • المحاضرة Y» وترتيب حسب الأسبوع ثم المحاضرة.
- واجهة الطالب: نفس التسمية والترتيب في صفحة مواد المقرر.

### واجهات رفع/عرض للأستاذ والطالب
- موجودة من MVP (#156) وتم استكمالها: شارات حالة الفحص لكل ملف عند الأستاذ، وتعطيل التنزيل قبل `clean`، وإظهار رسالة الخطأ بدل ابتلاعها.

### Signed URLs عبر المسارات المعتمدة
- لم يُنشأ bucket جديد ولم تتغير أي سياسة Storage. المسار المعتمد من العقود المدموجة محفوظ: `getCourseMaterialDownloadUrl` يوقّع عبر service role لسلة `course-materials` الخاصة (60 ثانية) مع حدث تدقيق.
- أضيفت بوابة fail-closed: **لا رابط موقّت لأي ملف قبل `scan_state = 'clean'`** — للطالب وللأستاذ المالك على حد سواء.

### سجلات وصول (access logs)
- حدث `downloaded` موجود؛ أضيف `file_scanned` لقاموس الأحداث (مسودة SQL).
- دالة خادم جديدة `listCourseMaterialAccessLogs` (مالك المادة فقط، حد أقصى 100) + حوار «سجل الوصول» في واجهة الأستاذ.

### تقارير استخدام
- دالة خادم جديدة `getCourseMaterialsUsageReport` (مالك المجموعة فقط): لكل مادة — عدد التنزيلات، المنزّلون الفريدون، آخر تنزيل، جرد حالات الفحص (clean/pending/infected/failed) + إجمالي المجموعة. التجميع النقي في `buildMaterialsUsageReport` (مختبَر unit).
- حوار «تقرير الاستخدام» في صفحة مواد المجموعة.

## 2) القواعد الأمنية

| القاعدة | التنفيذ |
| --- | --- |
| لا وصول لملف قبل `scan_state='clean'` | بوابة في `getCourseMaterialDownloadUrl` + إخفاء الملفات غير النظيفة من قوائم الطالب + بوابة مماثلة داخل `record_course_material_download` في المسودة + تعطيل UI. افتراضي `pending` (فشل-مغلق). |
| المرفقات خاصة | بقيت السلة خاصة بدون وصول عميل (سياسة `course_materials_no_client_access` من المسودة التصميمية)، التوقيع من الخادم فقط. لم تُلمس سياسات Storage. |
| أنواع/أحجام configurable (D-16 معلق) | `resolveMaterialsUploadPolicy`: الإعدادات (`materials_max_mb`, `materials_allowed_mime_types`, `materials_allowed_extensions`) **تضيّق فقط** — لا يمكن توسيع خط الأساس المتحفظ (25MB + pdf/doc/docx/ppt/pptx) حتى يُحسم D-16. قيم غير صالحة ⇒ الرجوع للافتراضي. فحص الواجهة المبدئي عند اختيار الملف (`onPick`) يستخدم ثوابت خط الأساس الساكنة لأسباب UX فقط؛ الإنفاذ الموثوق خادمي بالسياسة الفعالة المضيّقة (`getEffectiveMaterialsUploadPolicy`). |
| كل الكتابات عبر RPCs مغلقة | مسودة SQL تضيف RPCs الثلاثة المطلوبة بإجراء cutover الذري (#157) بالتواقيع الدقيقة: `faculty_reserve_course_material_upload(uuid,uuid,jsonb)`، `faculty_finalize_course_material_upload(uuid,uuid,jsonb)`، `record_course_material_download(uuid,uuid)` — security definer + `search_path=public, pg_temp` + EXECUTE لـ `authenticated` فقط. إضافةً إلى `service_mark_course_material_file_scanned(uuid,text)` لدور `service_role` حصرًا (نقطة تكامل عامل الفحص المستقبلي). تبديل الـ runtime لاستدعائها يبقى إصدارًا منفصلًا مبوّبًا بإجراء `apply_materials_rpc_only_dml_cutover` (يتطلب بصمات SHA-256 مراجعة) — لم يُغيّر مسار استدعاء runtime في هذا الـ PR التزامًا بالترتيب المتفق عليه. |
| تجميد الجمهور (#154) | لم يُمس: نفس عدادات الاستدعاءات (4/2)، لا `student_academic_status` في مسار قراءة الطالب، لا توسعة cohort. محفوظ أيضًا في اختبار العقد الجديد. |

## 3) الملفات

**معدّلة (5):**
- `src/lib/course-materials.shared.ts` — نموذج scan_state + حدود الأسبوع + محلل سياسة الرفع (تضييق-فقط) + أنواع/مُجمّعات تقارير الاستخدام وسجلات الوصول. (الثوابت السابقة بقيت verbatim.)
- `src/lib/faculty-materials.functions.ts` — `week_number` في إنشاء/تعديل/سرد؛ رفع بسياسة فعالة مضيّقة + `scan_state:'pending'`؛ `getMaterialsUploadPolicy`؛ `getCourseMaterialsUsageReport`؛ `listCourseMaterialAccessLogs`.
- `src/lib/student-materials.functions.ts` — بوابة `clean` على التنزيل، إخفاء الملفات غير النظيفة، `week_number` في السرد والترتيب.
- `src/routes/faculty-portal.materials.$sectionId.tsx` — حقل الأسبوع، شارات الفحص، تعطيل التنزيل قبل النظافة، حوارا تقرير الاستخدام وسجل الوصول.
- `src/routes/student.materials.$sectionId.tsx` — تسمية الأسبوع/المحاضرة.

**جديدة (8):**
- `docs/drafts/20260721000000_materials_secure_activation.draft.sql` — **DRAFT ONLY، لا يُطبَّق من هذا الـ PR** (week_number، scan_state، `file_scanned`، إعدادات السياسة، RPCs الأربعة).
- `tests/materials/course-materials-secure-shared.test.ts` — 16 اختبار unit (bun).
- `tests/materials/materials-secure-activation-contract.test.ts` — 19 اختبار عقد نصي (مسودة SQL + ثوابت runtime + بقاء الأعلام مغلقة).
- `tests/materials/postgres-minimal-schema.sql` — ركيزة تحقق مستهلكة.
- `tests/materials/postgres-secure-activation-verifier.sql` — مُتحقق تنفيذي (38 مجموعة فحص).
- `tests/materials/run-postgres-verifier.mjs` — مشغّل المُتحقق على PG17 مستهلك.
- `tests/materials/POSTGRES-17-VERIFICATION-RESULT.md` — نتيجة موثقة: **PASS على PostgreSQL 17.10**.
- `docs/LEARNING-MATERIALS-ACTIVATION-01-REPORT.md` — هذا التقرير.

## 4) الفحوص المنفذة

| الفحص | النتيجة |
| --- | --- |
| `bun test tests/materials/` (35 اختبارًا) | PASS |
| مُتحقق PG17 التنفيذي (38 مجموعة فحص إيجابية/سلبية/ACL) | PASS (17.10، ROLLBACK) |
| `tsc --noEmit` على الملفات المعدّلة (stubs للحزم الخارجية) | exit 0 |
| ثوابت #154 في `student-materials.functions.ts` (عدادات 4/2، أنماط ممنوعة) | محفوظة + مغطاة باختبار العقد |
| عدم الإشارة لـ RPC الذري غير المطبق في runtime (#157) | محفوظ + مغطى |
| الأعلام `facultyCourseMaterials`/`studentCourseMaterials` = `false` | بلا تغيير + مغطى باختبار |

## 5) الفجوات والمتبقي (خارج هذا الـ PR عمدًا)

1. **تطبيق migrations:** مسودة المواد الأساسية + المسودة الذرية (#157) + مسودة هذا العمل — بترتيب موثق، وبعد الموافقات. حتى then، runtime الجديد (scan_state/week_number) يستلزم الأعمدة الجديدة.
2. **موافقة Storage معلقة:** إنشاء السلة الخاصة + سياسة منع العميل — لم تُنفَّذ ولم تُمس.
3. **D-16 معلق:** الأنواع/الحدود النهائية. البنية قابلة للتضييق اليوم؛ التوسيع يتطلب حسم D-16 ثم تحديث خط الأساس المدمَّج (runtime + CHECK قيد 25MB في DB).
4. **إصدار المستدعي (caller release):** تبديل runtime إلى RPCs المغلقة يمر عبر `apply_materials_rpc_only_dml_cutover` مع بصمات تعريف مراجعة (تُحسب من `pg_get_functiondef` بعد التطبيق على نسخة المراجعة) — خطوة لاحقة منفصلة.
5. **عامل الفحص (scanner):** تكامل فعلي خارجي؛ RPC الانتقال جاهز لدور `service_role` فقط، والانتقالات نهائية (`pending → clean|infected|failed`)، وإعادة الفحص تتطلب نسخة ملف جديدة.
6. **مسار إشعارات النشر** ما يزال يقرأ `materials_linkage_mode` (cohort fallback) كما في العقود المدموجة — خارج نطاق هذه المهمة؛ مسار قراءة الطالب مغلق تمامًا (#154).

## 6) ملاحظات cutover (توثيق مراجعة الجولة الثانية)

- **الأقفال:** المسودة تستخدم أقفالًا صريحة فقط (`SELECT ... FOR UPDATE` و `LOCK TABLE ... IN SHARE MODE`) بترتيب حتمي موثق داخل كل RPC؛ **لا تستخدم `pg_advisory_lock`** — إشارة المراجعة إلى «advisory locks» لا تطابق أي نص فعلي في هذا الـPR (رُوجِع الوصف وجميع الملفات)، وهذا السطر هو التوثيق الصحيح لآلية القفل المستخدمة.
- **fail-closed لـ `study_system` (MEDIUM-1):** `record_course_material_download` يستخدم الآن `coalesce(v_student.study_system, '') not in ('regular','parallel')` — طالب بـ `study_system IS NULL` يُرفض (`AUTHORIZATION_DENIED`) كما في runtime تمامًا؛ مغطى بفحص المُتحقق 33b (كان `NULL not in (...)` يُقيَّم NULL فلا يرفض).
- **cast الخام لـ `size_bytes`:** يُحرَّس بـ regex `^[0-9]+$` قبل `::bigint`؛ القيم غير الرقمية ⇒ NULL (في reserve تُرفض بـ `INVALID_FILE_SIZE`، وفي finalize يُتخطّى فحص تطابق الحجم). قيمة رقمية تتجاوز bigint ترفع خطأ PG خامًا (22003) لا رمز حارسًا — على المستدعي إرسال bigint سليم ضمن الحد؛ يُشدَّد عند cutover إن رغبت المراجعة.
- **فحص الفصل في finalize:** شرط `CURRENT_ACTIVE_SECTION_REQUIRED` يُفرض عند reserve فقط؛ finalize يقفل بالترتيب (faculty → material → file) ويطابق البصمة/الحجم (`UPLOAD_FINALIZE_MISMATCH`) ويرفض الأرشفة، دون إعادة فحص الفصل الحالي — قرار موثق (الحجز قصير العمر والمادة مقفولة)؛ إعادة الفرض عند finalize تُضاف قبل cutover إن طُلب.

## 7) قائمة التفعيل اللاحقة (بعد الموافقات)

1. تطبيق migrations بالترتيب → 2) إنشاء السلة الخاصة + السياسات (موافقة) → 3) التحقق التنفيذي على النسخة → 4) إصدار المستدعي + cutover → 5) ربط عامل الفحص → 6) حسم D-16 (اختياريًا تضييق الإعدادات) → 7) قلب الأعلام على دفعات مراقبة.
