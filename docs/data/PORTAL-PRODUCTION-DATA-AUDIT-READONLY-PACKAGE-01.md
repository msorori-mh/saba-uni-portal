# PORTAL-PRODUCTION-DATA-AUDIT-READONLY-PACKAGE-01

**الحالة:** `HOLD_DATA_REALITY_AUDIT_READONLY_CHANNEL_REQUIRED`
**التدقيق:** PORTAL-PRODUCTION-DATA-REALITY-AUDIT-AND-IMPORT-GAP-MATRIX-01
**المستودع:** `msorori-mh/saba-uni-portal` @ `main` (`debf9d041f7c05794f6df33877f1dff91253625e`)
**البيئة المستهدفة:** Supabase project ref `wpmicqriltrowwonknox` — Postgres 17.6 / PostgREST 14.5
**القناة المطلوبة:** Lovable Read database (غير متاحة حالياً — هذه الحزمة هي البديل الميكانيكي الجاهز للتنفيذ فور فتح القناة وفق بند المواصفة 492–498).

## 1. الغرض والسياق

هذه الحزمة هي **حزمة تنفيذ SELECT-only كاملة** لتدقيق واقع البيانات الإنتاجية. لأن قناة القراءة الإنتاجية غير متاحة، لا يُدَّعى أن التدقيق الإنتاجي مكتمل؛ الحالة المعلنة هي `HOLD_DATA_REALITY_AUDIT_READONLY_CHANNEL_REQUIRED`. عند فتح القناة، تُنفَّذ الاستعلامات أدناه حرفياً وبالترتيب، وتُلتقط الأدلة بالقالب الموحد في القسم 8، ثم تُغذَّى النتائج في مصفوفة الفجوات والـbacklog وفق القسم 9.

مرتكزات المعرّفات: كل أسماء الجداول والأعمدة في هذه الحزمة مأخوذة حصراً من `SCHEMA-ANCHORS.json` / `ENTITIES.md` / `IMPORTERS.md` (مشتقة من `src/integrations/supabase/types.ts` على main — 102 جدولاً + 3 views + الأنواع enum). **لم يُختلق أي معرّف.** القيم المرجعية المصدرية للمطابقة مأخوذة من مخرجات recon: `student-recon/AGGREGATES.json`، `plans-recon/COURSES.json` (114 رمز مقرر مميز)، `ops-recon/AGGREGATES.json`.

## 2. قواعد التنفيذ (إلزامية)

1. **SELECT فقط.** ممنوع منعاً باتاً أي `INSERT / UPDATE / DELETE / MERGE / DDL / TRUNCATE / GRANT / REVOKE / CALL / DO`. كل استعلام في هذه الحزمة يبدأ بـ `SELECT` أو `WITH ... SELECT` ولا يحتوي أي عبارة كتابة. لا دوال متطايرة (volatile) سوى `now()` لأغراض ختم الوقت.
2. **لا كتابة نهائياً** — لا جداول مؤقتة (`CREATE TEMP TABLE`)، لا `SELECT ... INTO`. المعاملات تُمرَّر كبارامترات مربوطة (bind parameters) من قناة التنفيذ.
3. **القناة:** Lovable Read database فقط (دور قراءة / service-role readonly). أي استعلام يلمس `auth.users` موسوم صراحة بـ **[AUTH-SCHEMA]** ويتطلب صلاحية قراءة مخطط `auth`؛ إن لم تتوفر يُسجَّل `SKIPPED_AUTH_SCHEMA_UNAVAILABLE` ولا يُحاوَل عبر منح صلاحيات.
4. **لا PII في الأدلة الملتقطة:** تُلتقط الأعداد والتجميعات فقط. الاستعلامات المصممة لإرجاع صفوف تفصيلية (مثل التكرارات أو اليتامى) تُنفَّذ بعدّادات (`COUNT`) أو بإرجاع معرّفات غير شخصية (uuid / أكواد / أرقام طلبات). نتائج تحتوي أرقاماً أكاديمية كاملة أو أسماء تُحفظ خارج Git فقط (وفق G2.9/G2.10) ولا تُلصق في التقارير.
5. **البارامترات:** الصيغة `:param_name` تعني بارامتراً مربوطاً تُمرره القناة. لا تُلصق قيم PII حرفية داخل SQL إطلاقاً. الاستثناء المسموح: الأكواد غير الشخصية (أكواد الخدمات، UUIDs السجلات المحمية، أرقام الطلبات المرجعية) لأنها ليست PII.
6. **أداء آمن إنتاجياً:** الاستعلامات تعتمد مفاتيح أساسية/فهارس طبيعية (id, code, academic_number) وتستخدم `LIMIT` حيث يُحتمل إرجاع صفوف. استعلامات العدّ الشامل `COUNT(*)` مقبولة على الجداول المذكورة لأنها نطاق كلية واحدة (المئات إلى آلاف الصفوف).
7. **التقاط الدليل لكل استعلام:** `query_id`, `executed_at` (UTC ISO), `rowcount`, و`sha256` لنتيجة الاستعلام بالتسلسل القياسي الموضح في القسم 8. بغير ذلك لا يُعتد بالنتيجة.
8. **التنفيذ على البيئة الصحيحة فقط:** يجب تأكيد `project_ref = wpmicqriltrowwonknox` قبل أي استعلام (انظر Q-P2-01). أي اختلاف ⇒ إيقاف فوري (`PROJECT_REF_MISMATCH`).
9. الاستعلامات التي تشير إلى امتداد `pgcrypto` (دالة `digest`) موسومة بـ **[pgcrypto]**؛ إن كان الامتداد غير مفعّل تُحسب الـsha256 خارجياً من النتيجة الخام بنفس التسلسل القياسي ولا يُفعَّل أي امتداد.
10. استعلامات الوجود (existence) مصممة لتعمل عبر PostgREST/القناة حتى لو كان الجدول غائباً: تُنفَّذ ضد `information_schema` أولاً (Q-P1-01) لتحديد الجداول الموجودة فعلياً قبل الاستعلامات المباشرة.

## 3. خريطة المراحل والتغطية

| المرحلة | النطاق | بادئة الاستعلامات | مرجع المواصفة |
|---|---|---|---|
| P1 | كيانات الإنتاج (33 كياناً بجدول حقيقي + 19 NO_TABLE_FOUND) | Q-P1-xx | G1 (سطور 89–178) |
| P2 | الطلاب والحسابات + عقد لقطة PR#200 | Q-P2-xx | G2 (سطور 180–241) |
| P3 | المقررات والخطط الدراسية | Q-P3-xx | G3 (سطور 243–279) |
| P4 | هيئة التدريس والموظفون | Q-P4-xx | G4 (سطور 281–301) |
| P5 | سلامة التشغيل الأكاديمي | Q-P5-xx | G5 (سطور 303–321) |
| P6 | سلامة الأنظمة الإدارية | Q-P6-xx | G6 (سطور 323–339) |

> ملاحظة منهجية P1: لتجنّب تضخيم الحزمة، يتبع كل كيان بنية ثابتة من الاستعلامات: (أ) وجود+إجمالي، (ب) نشط/غير نشط حيث يوجد عمود حالة، (ج) مفاتيح أعمال مميزة + تكرارات، (د) NULLs في الأعمدة المطلوبة، (هـ) يتامى FK حيث توجد FKs، (و) توزيعات حيث تنطبق، (ز) مدى created_at + أحدث updated_at. كل كيان أدناه يذكر استعلاماته الصريحة بأعمدته الحقيقية من المرتكزات.

---

## 4. المرحلة P1 — كتالوج كيانات الإنتاج (G1)

### Q-P1-01 — سجل الجداول الموجودة فعلياً (وجود الكيانات)
**الغرض:** تحديد أي الجداول الـ33 (+المساندة) موجود فعلياً في الإنتاج — البديل الآمن لافتراض الوجود من المايگريشنز (المواصفة تمنع الاستدلال بـ schema_migrations).
**المخرجات المتوقعة:** `table_name`، `exists` (صف لكل جدول مبحوث عنه).
**قاعدة المطابقة:** تُقارن القائمة مع كيانات SCHEMA-ANCHORS: 33 كياناً بجدول حقيقي؛ أي غياب يُصنَّف `MISSING` في المصفوفة.

```sql
SELECT t.table_name
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_name IN (
    'departments','programs','academic_levels','academic_years','semesters',
    'student_profiles','faculty_profiles','staff_profiles','staff_profile_departments',
    'roles_catalog','user_roles','user_role_assignments',
    'request_processing_units','request_processing_roles','request_processing_assignments',
    'organizational_positions','position_assignments','position_role_mapping',
    'courses','study_plans','study_plan_courses',
    'course_offerings','course_sections','student_enrollments','student_grades','grade_components',
    'buildings','rooms','time_slots','class_schedule',
    'request_types','request_type_workflows','request_type_workflow_steps','request_type_workflow_transitions',
    'student_requests','student_request_workflow_steps','student_request_workflow_events',
    'official_documents','student_request_attachments',
    'academic_councils','academic_council_members'
  )
ORDER BY t.table_name;
```

### Q-P1-02 — وجود الـviews الثلاثة
**الغرض:** التأكد من وجود views التقارير (بديل كيان "reports").
**المخرجات:** `table_name` (view).
**قاعدة المطابقة:** الثلاثة المتوقعة من المرتكزات: `student_course_grade_summary`, `student_transcript_summary`, `student_unofficial_transcript`.

```sql
SELECT v.table_name
FROM information_schema.views v
WHERE v.table_schema = 'public'
  AND v.table_name IN ('student_course_grade_summary','student_transcript_summary','student_unofficial_transcript')
ORDER BY v.table_name;
```

### Q-P1-03 — departments: ملف الكيان الكامل
**الغرض:** إجمالي + نشط + مفاتيح + NULLs + مدى زمني لجدول الأقسام.
**المخرجات:** صف واحد: `total_rows`, `active_rows`, `inactive_rows`, `distinct_name_ar`, `null_name_ar`, `null_is_active`, `null_sort_order`, `earliest_created_at`, `latest_created_at`, `latest_updated_at`.
**قاعدة المطابقة:** متوقع 3 أقسام على الأقل بأسماء: «قسم تكنولوجيا المعلومات»، «قسم علوم الحاسوب»، «قسم نظم المعلومات الحاسوبية» (student-recon: توزيعات department_code الثلاثة). `distinct_name_ar` يجب أن يساوي `total_rows` (المفتاح التجاري name_ar).

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE is_active) AS active_rows,
  COUNT(*) FILTER (WHERE NOT is_active) AS inactive_rows,
  COUNT(DISTINCT name_ar) AS distinct_name_ar,
  COUNT(*) FILTER (WHERE name_ar IS NULL) AS null_name_ar,
  COUNT(*) FILTER (WHERE is_active IS NULL) AS null_is_active,
  COUNT(*) FILTER (WHERE sort_order IS NULL) AS null_sort_order,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM departments;
```

### Q-P1-04 — departments: تكرار المفتاح التجاري
**الغرض:** duplicate keys على name_ar.
**المخرجات:** عدد المجموعات المكررة فقط `duplicate_groups` (لا قيم).
**قاعدة المطابقة:** متوقع 0.

```sql
SELECT COUNT(*) AS duplicate_groups
FROM (
  SELECT name_ar FROM departments GROUP BY name_ar HAVING COUNT(*) > 1
) d;
```

### Q-P1-05 — programs: ملف الكيان
**الغرض:** إجمالي + حالة + مفاتيح + NULLs + زمني.
**المخرجات:** `total_rows`, `active_rows (is_active)`, `status_distinct`, `distinct_code`, `null_code`, `null_name_ar`, `null_status`, `earliest_created_at`, `latest_created_at`, `latest_updated_at`.
**قاعدة المطابقة:** متوقع 4 برامج بأكواد {CS, IT, CIS, CYB} (بذرة المايگريشن + ملفات الخطط الأربع + student-recon OUT_OF_SCOPE=0). `distinct_code = total_rows`.

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE is_active) AS active_rows,
  COUNT(DISTINCT status) AS status_distinct,
  COUNT(DISTINCT code) AS distinct_code,
  COUNT(*) FILTER (WHERE code IS NULL) AS null_code,
  COUNT(*) FILTER (WHERE name_ar IS NULL) AS null_name_ar,
  COUNT(*) FILTER (WHERE status IS NULL) AS null_status,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM programs;
```

### Q-P1-06 — programs: التكرارات + الأكواد الفعلية + التوزيع بالقسم
**الغرض:** duplicate code + قائمة الأكواد (غير PII) + توزيع البرامج على الأقسام + يتامى department_id.
**المخرجات:** (أ) `duplicate_code_groups`؛ (ب) `code`, `status`, `is_active` لكل برنامج؛ (ج) `department_id`, `programs_count`؛ (د) `orphan_programs`.
**قاعدة المطابقة:** الأكواد ⊆ {CS, IT, CIS, CYB}؛ orphan_programs = 0؛ تكرارات = 0.

```sql
-- (أ) تكرار code
SELECT COUNT(*) AS duplicate_code_groups
FROM (SELECT code FROM programs GROUP BY code HAVING COUNT(*) > 1) d;
```

```sql
-- (ب) الأكواد الفعلية (أكواد، ليست PII)
SELECT code, status, is_active FROM programs ORDER BY code;
```

```sql
-- (ج) توزيع البرامج حسب القسم
SELECT department_id, COUNT(*) AS programs_count
FROM programs GROUP BY department_id ORDER BY department_id;
```

```sql
-- (د) يتامى: برنامج يشير لقسم غير موجود
SELECT COUNT(*) AS orphan_programs
FROM programs p LEFT JOIN departments d ON d.id = p.department_id
WHERE p.department_id IS NOT NULL AND d.id IS NULL;
```

### Q-P1-07 — academic_levels: ملف الكيان
**الغرض:** إجمالي + مفاتيح (level_number, name) + NULLs + زمني.
**قاعدة المطابقة:** متوقع 4 مستويات (student-recon: academic_level ∈ {1,2,3,4}؛ خطط: 4 سنوات). `distinct_level_number = total_rows`.

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT level_number) AS distinct_level_number,
  COUNT(DISTINCT name) AS distinct_name,
  COUNT(*) FILTER (WHERE level_number IS NULL) AS null_level_number,
  COUNT(*) FILTER (WHERE name IS NULL) AS null_name,
  COUNT(*) FILTER (WHERE status IS NULL) AS null_status,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM academic_levels;
```

### Q-P1-08 — academic_levels: قيم المستويات الفعلية
**المخرجات:** `level_number`, `name`, `status` لكل مستوى.
**قاعدة المطابقة:** level_number ⊆ {1,2,3,4}؛ لا تكرار.

```sql
SELECT level_number, name, status FROM academic_levels ORDER BY level_number;
```

### Q-P1-09 — academic_years: ملف الكيان + is_current
**الغرض:** إجمالي + مفاتيح name + NULLs + تعارض السنوات الحالية.
**قاعدة المطابقة:** متوقع وجود «2026-2027» و«2025-2026» (student-recon). `current_years` يجب أن يكون بالضبط 1 (وإلا G5 conflicting active terms).

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT name) AS distinct_name,
  COUNT(*) FILTER (WHERE is_current) AS current_years,
  COUNT(*) FILTER (WHERE name IS NULL) AS null_name,
  COUNT(*) FILTER (WHERE start_date IS NULL) AS null_start_date,
  COUNT(*) FILTER (WHERE end_date IS NULL) AS null_end_date,
  COUNT(*) FILTER (WHERE status IS NULL) AS null_status,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM academic_years;
```

### Q-P1-10 — academic_years: القيم الفعلية
**المخرجات:** `name`, `start_date`, `end_date`, `is_current`, `status`.
**قاعدة المطابقة:** وجود 2026-2027 (كل الـ1101 في المصدر تقريباً) و2025-2026 (صف واحد).

```sql
SELECT name, start_date, end_date, is_current, status FROM academic_years ORDER BY start_date;
```

### Q-P1-11 — semesters (terms): ملف الكيان + is_current
**الغرض:** إجمالي + مفتاح مركب (academic_year_id, code) + NULLs + الفصول الحالية + يتامى السنة.
**قاعدة المطابقة:** متوقع فصل بكود `second` ضمن 2026-2027 (student-recon: semester=second للكل). `current_terms` = 1. orphan = 0.

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE is_current) AS current_terms,
  COUNT(*) FILTER (WHERE code IS NULL) AS null_code,
  COUNT(*) FILTER (WHERE name IS NULL) AS null_name,
  COUNT(*) FILTER (WHERE academic_year_id IS NULL) AS null_academic_year_id,
  COUNT(*) FILTER (WHERE status IS NULL) AS null_status,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM semesters;
```

### Q-P1-12 — semesters: تكرار المفتاح المركب + يتامى + القيم الفعلية
```sql
-- (أ) تكرار (academic_year_id, code)
SELECT COUNT(*) AS duplicate_term_key_groups
FROM (SELECT academic_year_id, code FROM semesters GROUP BY academic_year_id, code HAVING COUNT(*) > 1) d;
```

```sql
-- (ب) يتامى academic_year_id
SELECT COUNT(*) AS orphan_terms
FROM semesters s LEFT JOIN academic_years y ON y.id = s.academic_year_id
WHERE s.academic_year_id IS NOT NULL AND y.id IS NULL;
```

```sql
-- (ج) القيم الفعلية: كود + سنة + حداثة (لا PII)
SELECT s.code, s.name, y.name AS academic_year_name, s.start_date, s.end_date, s.is_current, s.status
FROM semesters s JOIN academic_years y ON y.id = s.academic_year_id
ORDER BY y.start_date, s.start_date;
```

### Q-P1-13 — student_profiles: ملف الكيان (مرجعي — التفصيل في P2)
**الغرض:** ملف الكيان العام فقط (التدقيق العميق في P2).
**قاعدة المطابقة:** المرجع الموثق D-02: total=846, linked=843, unlinked=3 (UNVERIFIED_CHANNEL حتى التنفيذ).

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS linked_profiles,
  COUNT(*) FILTER (WHERE user_id IS NULL) AS unlinked_profiles,
  COUNT(DISTINCT academic_number) AS distinct_academic_number,
  COUNT(*) FILTER (WHERE academic_number IS NULL) AS null_academic_number,
  COUNT(*) FILTER (WHERE full_name_ar IS NULL) AS null_full_name_ar,
  COUNT(*) FILTER (WHERE status IS NULL) AS null_status,
  COUNT(*) FILTER (WHERE must_change_password IS NULL) AS null_must_change_password,
  COUNT(*) FILTER (WHERE consecutive_suspension_years_count IS NULL) AS null_consec_susp_years,
  COUNT(*) FILTER (WHERE previous_suspension_semesters_count IS NULL) AS null_prev_susp_sems,
  COUNT(*) FILTER (WHERE transferred_current_year IS NULL) AS null_transferred_current_year,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM student_profiles;
```

### Q-P1-14 — student_profiles: توزيعات G1
**الغرض:** توزيع حسب القسم/البرنامج/نظام الدراسة/الحالة.
**قاعدة المطابقة:** تُقارن التوزيعات لاحقاً مع المصدر المدمج 1101 (program: IT 308 / CIS 281 / CYB 260 / CS 252؛ study_system: regular 728 / private 373؛ status: active 1075 / suspended 26) مع مراعاة أن الإنتاج يشمل طلاباً خارج ملفات المصدر.

```sql
-- حسب القسم
SELECT department_id, COUNT(*) AS students_count FROM student_profiles GROUP BY department_id ORDER BY students_count DESC;
```

```sql
-- حسب البرنامج
SELECT program_id, COUNT(*) AS students_count FROM student_profiles GROUP BY program_id ORDER BY students_count DESC;
```

```sql
-- حسب نظام الدراسة (العمود nullable)
SELECT study_system, COUNT(*) AS students_count FROM student_profiles GROUP BY study_system ORDER BY students_count DESC;
```

```sql
-- حسب حالة الملف ووضع الدراسة
SELECT status, COUNT(*) AS profiles_count FROM student_profiles GROUP BY status ORDER BY profiles_count DESC;
```

```sql
SELECT student_study_status, COUNT(*) AS profiles_count FROM student_profiles GROUP BY student_study_status ORDER BY profiles_count DESC;
```

### Q-P1-15 — student_profiles: يتامى department/program
```sql
SELECT
  COUNT(*) FILTER (WHERE sp.department_id IS NOT NULL AND d.id IS NULL) AS orphan_department,
  COUNT(*) FILTER (WHERE sp.program_id IS NOT NULL AND p.id IS NULL) AS orphan_program
FROM student_profiles sp
LEFT JOIN departments d ON d.id = sp.department_id
LEFT JOIN programs p ON p.id = sp.program_id;
```

### Q-P1-16 — faculty_profiles: ملف الكيان
**قاعدة المطابقة:** مرجع ops-recon: 18 اسماً مدرّساً مميزاً في ملف الإسناد (مصدر غير جاهز للحسابات — بلا أرقام وظيفية وبريد). faculty_id NOT NULL 1:1 إلى CMS faculty.

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS linked_profiles,
  COUNT(*) FILTER (WHERE user_id IS NULL) AS unlinked_profiles,
  COUNT(DISTINCT faculty_id) AS distinct_faculty_id,
  COUNT(DISTINCT employee_number) AS distinct_employee_number,
  COUNT(*) FILTER (WHERE employee_number IS NULL) AS null_employee_number,
  COUNT(*) FILTER (WHERE faculty_id IS NULL) AS null_faculty_id,
  COUNT(*) FILTER (WHERE full_name_ar IS NULL) AS null_full_name_ar,
  COUNT(*) FILTER (WHERE status IS NULL) AS null_status,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM faculty_profiles;
```

### Q-P1-17 — faculty_profiles: تكرارات + يتامى + توزيع بالقسم/البرنامج
```sql
-- تكرار employee_number (يتجاهل NULL)
SELECT COUNT(*) AS duplicate_employee_number_groups
FROM (SELECT employee_number FROM faculty_profiles WHERE employee_number IS NOT NULL GROUP BY employee_number HAVING COUNT(*) > 1) d;
```

```sql
-- يتامى department/program + توزيع
SELECT
  COUNT(*) FILTER (WHERE fp.department_id IS NOT NULL AND d.id IS NULL) AS orphan_department,
  COUNT(*) FILTER (WHERE fp.program_id IS NOT NULL AND p.id IS NULL) AS orphan_program
FROM faculty_profiles fp
LEFT JOIN departments d ON d.id = fp.department_id
LEFT JOIN programs p ON p.id = fp.program_id;
```

```sql
SELECT department_id, COUNT(*) AS faculty_count FROM faculty_profiles GROUP BY department_id ORDER BY faculty_count DESC;
```

### Q-P1-18 — staff_profiles: ملف الكيان
**قاعدة المطابقة:** employee_number مفتاح تجاري؛ email من مايگريشن 20260711000000.

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS linked_profiles,
  COUNT(*) FILTER (WHERE user_id IS NULL) AS unlinked_profiles,
  COUNT(DISTINCT employee_number) AS distinct_employee_number,
  COUNT(*) FILTER (WHERE employee_number IS NULL) AS null_employee_number,
  COUNT(*) FILTER (WHERE email IS NULL) AS null_email,
  COUNT(*) FILTER (WHERE full_name_ar IS NULL) AS null_full_name_ar,
  COUNT(*) FILTER (WHERE job_title IS NULL) AS null_job_title,
  COUNT(*) FILTER (WHERE role_type IS NULL) AS null_role_type,
  COUNT(*) FILTER (WHERE department_scope IS NULL) AS null_department_scope,
  COUNT(*) FILTER (WHERE status IS NULL) AS null_status,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM staff_profiles;
```

### Q-P1-19 — staff_profiles: تكرار employee_number + يتامى قسم
```sql
SELECT COUNT(*) AS duplicate_employee_number_groups
FROM (SELECT employee_number FROM staff_profiles WHERE employee_number IS NOT NULL GROUP BY employee_number HAVING COUNT(*) > 1) d;
```

```sql
SELECT COUNT(*) AS orphan_department
FROM staff_profiles sp LEFT JOIN departments d ON d.id = sp.department_id
WHERE sp.department_id IS NOT NULL AND d.id IS NULL;
```

### Q-P1-20 — staff_profile_departments (نطاق متعدد الأقسام)
**الغرض:** إجمالي + تكرار المفتاح المركب + يتامى الطرفين. (لا created_at/updated_at حسب المرتكزات — created_at موجود فقط؛ لا updated_at.)

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT staff_profile_id) AS distinct_staff,
  COUNT(DISTINCT department_id) AS distinct_departments,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at
FROM staff_profile_departments;
```

```sql
SELECT COUNT(*) AS duplicate_pairs
FROM (SELECT staff_profile_id, department_id FROM staff_profile_departments GROUP BY staff_profile_id, department_id HAVING COUNT(*) > 1) d;
```

```sql
SELECT
  COUNT(*) FILTER (WHERE sp.id IS NULL) AS orphan_staff_profile,
  COUNT(*) FILTER (WHERE d.id IS NULL) AS orphan_department
FROM staff_profile_departments spd
LEFT JOIN staff_profiles sp ON sp.id = spd.staff_profile_id
LEFT JOIN departments d ON d.id = spd.department_id;
```

### Q-P1-21 — roles_catalog: ملف الكيان
**قاعدة المطابقة:** enum app_role له 13 قيمة؛ roles_catalog.app_role_mapping يجب أن يكون ضمنها.

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE is_active) AS active_rows,
  COUNT(DISTINCT code) AS distinct_code,
  COUNT(*) FILTER (WHERE code IS NULL) AS null_code,
  COUNT(*) FILTER (WHERE name_ar IS NULL) AS null_name_ar,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM roles_catalog;
```

### Q-P1-22 — roles_catalog: تكرار code + القيم الفعلية
```sql
SELECT COUNT(*) AS duplicate_code_groups
FROM (SELECT code FROM roles_catalog GROUP BY code HAVING COUNT(*) > 1) d;
```

```sql
SELECT code, app_role_mapping, is_active FROM roles_catalog ORDER BY code;
```

### Q-P1-23 — user_roles: ملف الكيان + توزيع الأدوار
**قاعدة المطابقة:** role ضمن enum app_role (13 قيمة). التوزيع مرجع لتدقيق G4 (missing roles).

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT user_id) AS distinct_users,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at
FROM user_roles;
```

```sql
SELECT role, COUNT(*) AS assignments_count FROM user_roles GROUP BY role ORDER BY assignments_count DESC;
```

```sql
SELECT COUNT(*) AS duplicate_user_role_pairs
FROM (SELECT user_id, role FROM user_roles GROUP BY user_id, role HAVING COUNT(*) > 1) d;
```

### Q-P1-24 — user_role_assignments: ملف الكيان + توزيع + يتامى role_code
```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT user_id) AS distinct_users,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at
FROM user_role_assignments;
```

```sql
SELECT role_code, COUNT(*) AS assignments_count FROM user_role_assignments GROUP BY role_code ORDER BY assignments_count DESC;
```

```sql
SELECT COUNT(*) AS orphan_role_code
FROM user_role_assignments ura LEFT JOIN roles_catalog rc ON rc.code = ura.role_code
WHERE rc.code IS NULL;
```

```sql
SELECT COUNT(*) AS duplicate_user_role_pairs
FROM (SELECT user_id, role_code FROM user_role_assignments GROUP BY user_id, role_code HAVING COUNT(*) > 1) d;
```

### Q-P1-25 — request_processing_units: ملف الكيان
```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE is_active) AS active_rows,
  COUNT(*) FILTER (WHERE is_academic_unit) AS academic_units,
  COUNT(DISTINCT code) AS distinct_code,
  COUNT(*) FILTER (WHERE code IS NULL) AS null_code,
  COUNT(*) FILTER (WHERE name_ar IS NULL) AS null_name_ar,
  COUNT(*) FILTER (WHERE portal_scope IS NULL) AS null_portal_scope,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM request_processing_units;
```

### Q-P1-26 — request_processing_roles: ملف الكيان + يتامى
```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT code) AS distinct_code,
  COUNT(*) FILTER (WHERE is_managerial) AS managerial_roles,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at
FROM request_processing_roles;
```

```sql
SELECT
  COUNT(*) FILTER (WHERE u.id IS NULL) AS orphan_unit,
  COUNT(*) FILTER (WHERE op.code IS NULL AND r.position_code IS NOT NULL) AS orphan_position_code
FROM request_processing_roles r
LEFT JOIN request_processing_units u ON u.id = r.unit_id
LEFT JOIN organizational_positions op ON op.code = r.position_code;
```

### Q-P1-27 — request_processing_assignments: ملف الكيان + يتامى
```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE is_active) AS active_rows,
  COUNT(DISTINCT unit_id) AS distinct_units,
  COUNT(*) FILTER (WHERE unit_id IS NULL) AS null_unit_id,
  COUNT(*) FILTER (WHERE assignment_type IS NULL) AS null_assignment_type,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM request_processing_assignments;
```

```sql
SELECT assignment_type, COUNT(*) AS assignments_count FROM request_processing_assignments GROUP BY assignment_type ORDER BY assignments_count DESC;
```

```sql
SELECT
  COUNT(*) FILTER (WHERE u.id IS NULL) AS orphan_unit,
  COUNT(*) FILTER (WHERE r.id IS NULL AND a.role_id IS NOT NULL) AS orphan_role,
  COUNT(*) FILTER (WHERE d.id IS NULL AND a.department_id IS NOT NULL) AS orphan_department,
  COUNT(*) FILTER (WHERE fp.id IS NULL AND a.faculty_profile_id IS NOT NULL) AS orphan_faculty_profile,
  COUNT(*) FILTER (WHERE sp.id IS NULL AND a.staff_profile_id IS NOT NULL) AS orphan_staff_profile,
  COUNT(*) FILTER (WHERE pa.id IS NULL AND a.position_assignment_id IS NOT NULL) AS orphan_position_assignment
FROM request_processing_assignments a
LEFT JOIN request_processing_units u ON u.id = a.unit_id
LEFT JOIN request_processing_roles r ON r.id = a.role_id
LEFT JOIN departments d ON d.id = a.department_id
LEFT JOIN faculty_profiles fp ON fp.id = a.faculty_profile_id
LEFT JOIN staff_profiles sp ON sp.id = a.staff_profile_id
LEFT JOIN position_assignments pa ON pa.id = a.position_assignment_id;
```

### Q-P1-28 — organizational_positions: ملف الكيان + يتامى parent_code
```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE is_active) AS active_rows,
  COUNT(DISTINCT code) AS distinct_code,
  COUNT(*) FILTER (WHERE code IS NULL) AS null_code,
  COUNT(*) FILTER (WHERE name_ar IS NULL) AS null_name_ar,
  COUNT(*) FILTER (WHERE unit_type IS NULL) AS null_unit_type,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM organizational_positions;
```

```sql
-- يتامى parent_code (إشارة ذاتية غير مفروضة في الأنواع)
SELECT COUNT(*) AS orphan_parent_code
FROM organizational_positions p LEFT JOIN organizational_positions parent ON parent.code = p.parent_code
WHERE p.parent_code IS NOT NULL AND parent.code IS NULL;
```

### Q-P1-29 — position_assignments + position_role_mapping
```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE is_active) AS active_rows,
  COUNT(DISTINCT position_id) AS distinct_positions_used,
  COUNT(DISTINCT user_id) AS distinct_users,
  MIN(created_at) AS earliest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM position_assignments;
```

```sql
SELECT COUNT(*) AS orphan_position
FROM position_assignments pa LEFT JOIN organizational_positions p ON p.id = pa.position_id
WHERE p.id IS NULL;
```

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE pm.is_active) AS active_rows,
  COUNT(*) FILTER (WHERE p.id IS NULL) AS orphan_position,
  COUNT(*) FILTER (WHERE rc.code IS NULL) AS orphan_role_code
FROM position_role_mapping pm
LEFT JOIN organizational_positions p ON p.id = pm.position_id
LEFT JOIN roles_catalog rc ON rc.code = pm.role_code;
```

### Q-P1-30 — courses: ملف الكيان
**قاعدة المطابقة:** مرجع plans-recon: 114 رمزاً مميزاً في المصدر (109 حقيقي + 5 placeholders). المقارنة التفصيلية في P3.

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT code) AS distinct_code,
  COUNT(*) FILTER (WHERE code IS NULL) AS null_code,
  COUNT(*) FILTER (WHERE name_ar IS NULL) AS null_name_ar,
  COUNT(*) FILTER (WHERE credit_hours IS NULL) AS null_credit_hours,
  COUNT(*) FILTER (WHERE theory_hours IS NULL) AS null_theory_hours,
  COUNT(*) FILTER (WHERE practical_hours IS NULL) AS null_practical_hours,
  COUNT(*) FILTER (WHERE status IS NULL) AS null_status,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM courses;
```

### Q-P1-31 — courses: تكرار code + توزيع بالقسم + يتامى
```sql
SELECT COUNT(*) AS duplicate_code_groups
FROM (SELECT code FROM courses GROUP BY code HAVING COUNT(*) > 1) d;
```

```sql
SELECT department_id, COUNT(*) AS courses_count FROM courses GROUP BY department_id ORDER BY courses_count DESC;
```

```sql
SELECT COUNT(*) AS orphan_department
FROM courses c LEFT JOIN departments d ON d.id = c.department_id
WHERE c.department_id IS NOT NULL AND d.id IS NULL;
```

### Q-P1-32 — study_plans: ملف الكيان
**قاعدة المطابقة:** متوقع 4 خطط نشطة على الأقل (برنامج × نسخة 2026-2027). total_credit_hours المتوقع 135 معلن / 136 محسوب (A11).

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE is_active) AS active_rows,
  COUNT(DISTINCT program_id) AS distinct_programs,
  COUNT(*) FILTER (WHERE name IS NULL) AS null_name,
  COUNT(*) FILTER (WHERE version IS NULL) AS null_version,
  COUNT(*) FILTER (WHERE program_id IS NULL) AS null_program_id,
  COUNT(*) FILTER (WHERE total_credit_hours IS NULL) AS null_total_credit_hours,
  COUNT(*) FILTER (WHERE status IS NULL) AS null_status,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM study_plans;
```

### Q-P1-33 — study_plans: يتامى برنامج + قائمة الخطط (غير PII)
```sql
SELECT COUNT(*) AS orphan_program
FROM study_plans sp LEFT JOIN programs p ON p.id = sp.program_id
WHERE p.id IS NULL;
```

```sql
SELECT sp.id, p.code AS program_code, sp.name, sp.version, sp.total_credit_hours, sp.is_active, sp.status
FROM study_plans sp LEFT JOIN programs p ON p.id = sp.program_id
ORDER BY p.code, sp.version;
```

### Q-P1-34 — study_plan_courses: ملف الكيان + يتامى شاملة
**قاعدة المطابقة:** المصدر: 48 مقرراً لكل خطة (45 حقيقياً + 3 اختياري placeholder).

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT study_plan_id) AS distinct_plans_used,
  COUNT(DISTINCT course_id) AS distinct_courses_used,
  COUNT(*) FILTER (WHERE is_required) AS required_rows,
  COUNT(*) FILTER (WHERE NOT is_required) AS elective_rows,
  COUNT(*) FILTER (WHERE prerequisite_course_id IS NOT NULL) AS rows_with_prereq,
  COUNT(*) FILTER (WHERE study_plan_id IS NULL) AS null_study_plan_id,
  COUNT(*) FILTER (WHERE course_id IS NULL) AS null_course_id,
  COUNT(*) FILTER (WHERE level_id IS NULL) AS null_level_id,
  COUNT(*) FILTER (WHERE semester_code IS NULL) AS null_semester_code,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM study_plan_courses;
```

```sql
SELECT
  COUNT(*) FILTER (WHERE sp.id IS NULL) AS orphan_plan,
  COUNT(*) FILTER (WHERE c.id IS NULL) AS orphan_course,
  COUNT(*) FILTER (WHERE l.id IS NULL) AS orphan_level,
  COUNT(*) FILTER (WHERE pc.id IS NULL AND spc.prerequisite_course_id IS NOT NULL) AS orphan_prereq_course
FROM study_plan_courses spc
LEFT JOIN study_plans sp ON sp.id = spc.study_plan_id
LEFT JOIN courses c ON c.id = spc.course_id
LEFT JOIN academic_levels l ON l.id = spc.level_id
LEFT JOIN courses pc ON pc.id = spc.prerequisite_course_id;
```

### Q-P1-35 — course_offerings: ملف الكيان + تكرار المفتاح الخماسي
```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT status) AS status_distinct,
  COUNT(*) FILTER (WHERE course_id IS NULL) AS null_course_id,
  COUNT(*) FILTER (WHERE academic_year_id IS NULL) AS null_academic_year_id,
  COUNT(*) FILTER (WHERE semester_id IS NULL) AS null_semester_id,
  COUNT(*) FILTER (WHERE program_id IS NULL) AS null_program_id,
  COUNT(*) FILTER (WHERE level_id IS NULL) AS null_level_id,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM course_offerings;
```

```sql
SELECT COUNT(*) AS duplicate_offering_key_groups
FROM (
  SELECT course_id, academic_year_id, semester_id, program_id, level_id
  FROM course_offerings
  GROUP BY course_id, academic_year_id, semester_id, program_id, level_id
  HAVING COUNT(*) > 1
) d;
```

### Q-P1-36 — course_offerings: يتامى + توزيع بسنة/فصل
```sql
SELECT
  COUNT(*) FILTER (WHERE c.id IS NULL) AS orphan_course,
  COUNT(*) FILTER (WHERE y.id IS NULL) AS orphan_year,
  COUNT(*) FILTER (WHERE s.id IS NULL) AS orphan_semester,
  COUNT(*) FILTER (WHERE p.id IS NULL) AS orphan_program,
  COUNT(*) FILTER (WHERE l.id IS NULL) AS orphan_level
FROM course_offerings o
LEFT JOIN courses c ON c.id = o.course_id
LEFT JOIN academic_years y ON y.id = o.academic_year_id
LEFT JOIN semesters s ON s.id = o.semester_id
LEFT JOIN programs p ON p.id = o.program_id
LEFT JOIN academic_levels l ON l.id = o.level_id;
```

```sql
SELECT academic_year_id, semester_id, COUNT(*) AS offerings_count
FROM course_offerings GROUP BY academic_year_id, semester_id ORDER BY offerings_count DESC;
```

### Q-P1-37 — course_sections: ملف الكيان + تكرار + يتامى
```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE faculty_profile_id IS NULL) AS sections_without_faculty,
  COUNT(*) FILTER (WHERE course_offering_id IS NULL) AS null_course_offering_id,
  COUNT(*) FILTER (WHERE section_code IS NULL) AS null_section_code,
  COUNT(*) FILTER (WHERE status IS NULL) AS null_status,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM course_sections;
```

```sql
SELECT COUNT(*) AS duplicate_section_key_groups
FROM (SELECT course_offering_id, section_code FROM course_sections GROUP BY course_offering_id, section_code HAVING COUNT(*) > 1) d;
```

```sql
SELECT
  COUNT(*) FILTER (WHERE o.id IS NULL) AS orphan_offering,
  COUNT(*) FILTER (WHERE fp.id IS NULL AND cs.faculty_profile_id IS NOT NULL) AS orphan_faculty_profile
FROM course_sections cs
LEFT JOIN course_offerings o ON o.id = cs.course_offering_id
LEFT JOIN faculty_profiles fp ON fp.id = cs.faculty_profile_id;
```

### Q-P1-38 — student_enrollments: ملف الكيان + تكرار
```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT student_profile_id) AS distinct_students,
  COUNT(DISTINCT course_section_id) AS distinct_sections,
  COUNT(DISTINCT enrollment_status) AS status_distinct,
  COUNT(*) FILTER (WHERE student_profile_id IS NULL) AS null_student_profile_id,
  COUNT(*) FILTER (WHERE course_section_id IS NULL) AS null_course_section_id,
  COUNT(*) FILTER (WHERE enrolled_at IS NULL) AS null_enrolled_at,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM student_enrollments;
```

```sql
SELECT COUNT(*) AS duplicate_enrollment_key_groups
FROM (SELECT student_profile_id, course_section_id FROM student_enrollments GROUP BY student_profile_id, course_section_id HAVING COUNT(*) > 1) d;
```

### Q-P1-39 — student_grades + grade_components: ملف الكيان
```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE approved_at IS NOT NULL) AS approved_rows,
  COUNT(*) FILTER (WHERE student_enrollment_id IS NULL) AS null_enrollment_id,
  COUNT(*) FILTER (WHERE grade_component_id IS NULL) AS null_grade_component_id,
  COUNT(*) FILTER (WHERE score IS NULL) AS null_score,
  COUNT(*) FILTER (WHERE status IS NULL) AS null_status,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM student_grades;
```

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT course_section_id) AS distinct_sections,
  COUNT(*) FILTER (WHERE course_section_id IS NULL) AS null_course_section_id,
  COUNT(*) FILTER (WHERE name IS NULL) AS null_name,
  COUNT(*) FILTER (WHERE max_score IS NULL) AS null_max_score,
  MIN(created_at) AS earliest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM grade_components;
```

### Q-P1-40 — buildings + rooms: ملف الكيان
**قاعدة المطابقة:** مرجع ops-recon: ملف قاعات جاهز 19 صفاً (14 قاعة محاضرات سعة 60 + 5 معامل حاسوب سعة 30). لا مستورد rooms في المستودع (فجوة import موثقة).

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE is_active) AS active_rows,
  COUNT(DISTINCT code) AS distinct_code,
  COUNT(*) FILTER (WHERE code IS NULL) AS null_code,
  MIN(created_at) AS earliest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM buildings;
```

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE is_active) AS active_rows,
  COUNT(*) FILTER (WHERE room_type = 'lab') AS lab_rows,
  COUNT(*) FILTER (WHERE room_type = 'lecture') AS lecture_rows,
  COUNT(*) FILTER (WHERE room_type = 'office') AS office_rows,
  COUNT(*) FILTER (WHERE room_type = 'hall') AS hall_rows,
  COUNT(DISTINCT (building_id, code)) AS distinct_building_code_keys,
  COUNT(*) FILTER (WHERE building_id IS NULL) AS null_building_id,
  COUNT(*) FILTER (WHERE code IS NULL) AS null_code,
  COUNT(*) FILTER (WHERE capacity IS NULL) AS null_capacity,
  COUNT(*) FILTER (WHERE capacity <= 0) AS invalid_capacity,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM rooms;
```

```sql
SELECT COUNT(*) AS orphan_building
FROM rooms r LEFT JOIN buildings b ON b.id = r.building_id
WHERE r.building_id IS NOT NULL AND b.id IS NULL;
```

### Q-P1-41 — time_slots + class_schedule: ملف الكيان
```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE is_active) AS active_rows,
  COUNT(DISTINCT (day_of_week, start_time, end_time)) AS distinct_slots,
  MIN(created_at) AS earliest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM time_slots;
```

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE status = 'published') AS published_rows,
  COUNT(*) FILTER (WHERE status = 'draft') AS draft_rows,
  COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_rows,
  COUNT(*) FILTER (WHERE faculty_profile_id IS NULL) AS rows_without_faculty,
  COUNT(*) FILTER (WHERE course_section_id IS NULL) AS null_course_section_id,
  COUNT(*) FILTER (WHERE room_id IS NULL) AS null_room_id,
  COUNT(*) FILTER (WHERE time_slot_id IS NULL) AS null_time_slot_id,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM class_schedule;
```

### Q-P1-42 — request_types: ملف الكيان + الخدمات المخفية
**قاعدة المطابقة:** مرجع B1-preflight: 5 خدمات `is_active=true, student_visible=false` بالأكواد: enrollment_suspension, excused_absence, file_withdrawal, department_transfer, final_chance؛ والخدمة النشطة المرئية: enrollment_certificate.

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE is_active) AS active_rows,
  COUNT(*) FILTER (WHERE is_active AND student_visible) AS active_visible_rows,
  COUNT(*) FILTER (WHERE is_active AND NOT student_visible) AS active_hidden_rows,
  COUNT(DISTINCT code) AS distinct_code,
  COUNT(*) FILTER (WHERE code IS NULL) AS null_code,
  COUNT(*) FILTER (WHERE name_ar IS NULL) AS null_name_ar,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM request_types;
```

```sql
-- التحقق من الخدمات الخمس المخفية الموثقة (أكواد — ليست PII)
SELECT code, is_active, student_visible
FROM request_types
WHERE code IN ('enrollment_suspension','excused_absence','file_withdrawal','department_transfer','final_chance','enrollment_certificate')
ORDER BY code;
```

### Q-P1-43 — request_type_workflows: ملف الكيان + تكرار
```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE is_active) AS active_rows,
  COUNT(DISTINCT request_type_id) AS distinct_request_types_with_workflow,
  COUNT(*) FILTER (WHERE request_type_id IS NULL) AS null_request_type_id,
  COUNT(*) FILTER (WHERE code IS NULL) AS null_code,
  COUNT(*) FILTER (WHERE version IS NULL) AS null_version,
  MIN(created_at) AS earliest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM request_type_workflows;
```

```sql
SELECT COUNT(*) AS duplicate_workflow_key_groups
FROM (SELECT code, request_type_id, version FROM request_type_workflows GROUP BY code, request_type_id, version HAVING COUNT(*) > 1) d;
```

### Q-P1-44 — request_type_workflow_steps + transitions: ملف الكيان + يتامى
```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT workflow_id) AS distinct_workflows_with_steps,
  COUNT(*) FILTER (WHERE processing_role_id IS NULL AND processing_unit_id IS NULL) AS steps_without_assignment_target,
  COUNT(*) FILTER (WHERE workflow_id IS NULL) AS null_workflow_id,
  COUNT(*) FILTER (WHERE step_key IS NULL) AS null_step_key,
  MIN(created_at) AS earliest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM request_type_workflow_steps;
```

```sql
SELECT
  COUNT(*) FILTER (WHERE w.id IS NULL) AS orphan_workflow,
  COUNT(*) FILTER (WHERE r.id IS NULL AND s.processing_role_id IS NOT NULL) AS orphan_role,
  COUNT(*) FILTER (WHERE u.id IS NULL AND s.processing_unit_id IS NOT NULL) AS orphan_unit
FROM request_type_workflow_steps s
LEFT JOIN request_type_workflows w ON w.id = s.workflow_id
LEFT JOIN request_processing_roles r ON r.id = s.processing_role_id
LEFT JOIN request_processing_units u ON u.id = s.processing_unit_id;
```

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE w.id IS NULL) AS orphan_workflow,
  COUNT(*) FILTER (WHERE fs.id IS NULL AND t.from_step_id IS NOT NULL) AS orphan_from_step,
  COUNT(*) FILTER (WHERE ts.id IS NULL AND t.to_step_id IS NOT NULL) AS orphan_to_step
FROM request_type_workflow_transitions t
LEFT JOIN request_type_workflows w ON w.id = t.workflow_id
LEFT JOIN request_type_workflow_steps fs ON fs.id = t.from_step_id
LEFT JOIN request_type_workflow_steps ts ON ts.id = t.to_step_id;
```

### Q-P1-45 — student_requests: ملف الكيان + يتامى نوع الطلب
**قاعدة المطابقة:** request_type FK→request_types.code (نصي). يشمل السجلات المحمية الخمسة (انظر P6).

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT status) AS status_distinct,
  COUNT(DISTINCT request_type) AS distinct_request_types,
  COUNT(*) FILTER (WHERE request_number IS NULL) AS null_request_number,
  COUNT(*) FILTER (WHERE student_profile_id IS NULL) AS null_student_profile_id,
  COUNT(*) FILTER (WHERE request_type IS NULL) AS null_request_type,
  MIN(created_at) AS earliest_created_at,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM student_requests;
```

```sql
SELECT request_type, COUNT(*) AS requests_count FROM student_requests GROUP BY request_type ORDER BY requests_count DESC;
```

```sql
SELECT COUNT(*) AS orphan_request_type
FROM student_requests sr LEFT JOIN request_types rt ON rt.code = sr.request_type
WHERE sr.request_type IS NOT NULL AND rt.code IS NULL;
```

### Q-P1-46 — student_request_workflow_steps (التعيينات التشغيلية) + events
```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT student_request_id) AS distinct_requests,
  COUNT(*) FILTER (
    WHERE assigned_user_id IS NULL
      AND assigned_faculty_profile_id IS NULL
      AND assigned_staff_profile_id IS NULL
      AND assigned_position_assignment_id IS NULL
  ) AS steps_without_any_assignee,
  COUNT(*) FILTER (WHERE status IS NULL) AS null_status,
  MIN(created_at) AS earliest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM student_request_workflow_steps;
```

```sql
SELECT
  COUNT(*) FILTER (WHERE sr.id IS NULL) AS orphan_request,
  COUNT(*) FILTER (WHERE w.id IS NULL AND s.workflow_id IS NOT NULL) AS orphan_workflow,
  COUNT(*) FILTER (WHERE ws.id IS NULL AND s.workflow_step_id IS NOT NULL) AS orphan_workflow_step,
  COUNT(*) FILTER (WHERE fp.id IS NULL AND s.assigned_faculty_profile_id IS NOT NULL) AS orphan_assigned_faculty,
  COUNT(*) FILTER (WHERE sp.id IS NULL AND s.assigned_staff_profile_id IS NOT NULL) AS orphan_assigned_staff,
  COUNT(*) FILTER (WHERE pa.id IS NULL AND s.assigned_position_assignment_id IS NOT NULL) AS orphan_assigned_position
FROM student_request_workflow_steps s
LEFT JOIN student_requests sr ON sr.id = s.student_request_id
LEFT JOIN request_type_workflows w ON w.id = s.workflow_id
LEFT JOIN request_type_workflow_steps ws ON ws.id = s.workflow_step_id
LEFT JOIN faculty_profiles fp ON fp.id = s.assigned_faculty_profile_id
LEFT JOIN staff_profiles sp ON sp.id = s.assigned_staff_profile_id
LEFT JOIN position_assignments pa ON pa.id = s.assigned_position_assignment_id;
```

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE sr.id IS NULL) AS orphan_request,
  MIN(e.created_at) AS earliest_created_at,
  MAX(e.created_at) AS latest_created_at
FROM student_request_workflow_events e
LEFT JOIN student_requests sr ON sr.id = e.student_request_id;
```

### Q-P1-47 — official_documents: ملف الكيان + تكرار المفاتيح
```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT document_number) AS distinct_document_number,
  COUNT(DISTINCT verification_code) AS distinct_verification_code,
  COUNT(DISTINCT document_type) AS document_type_distinct,
  COUNT(*) FILTER (WHERE student_request_id IS NULL) AS docs_without_request,
  COUNT(*) FILTER (WHERE document_number IS NULL) AS null_document_number,
  COUNT(*) FILTER (WHERE student_profile_id IS NULL) AS null_student_profile_id,
  COUNT(*) FILTER (WHERE verification_code IS NULL) AS null_verification_code,
  COUNT(*) FILTER (WHERE status IS NULL) AS null_status,
  MIN(created_at) AS earliest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM official_documents;
```

```sql
SELECT COUNT(*) AS duplicate_document_number_groups
FROM (SELECT document_number FROM official_documents GROUP BY document_number HAVING COUNT(*) > 1) d;
```

```sql
SELECT COUNT(*) AS duplicate_verification_code_groups
FROM (SELECT verification_code FROM official_documents GROUP BY verification_code HAVING COUNT(*) > 1) d;
```

### Q-P1-48 — student_request_attachments: ملف الكيان + يتامى
(العمود الزمني الوحيد uploaded_at — لا created_at/updated_at حسب المرتكزات.)

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT request_id) AS distinct_requests,
  COUNT(*) FILTER (WHERE request_id IS NULL) AS null_request_id,
  COUNT(*) FILTER (WHERE file_name IS NULL) AS null_file_name,
  COUNT(*) FILTER (WHERE file_url IS NULL) AS null_file_url,
  COUNT(*) FILTER (WHERE uploaded_at IS NULL) AS null_uploaded_at,
  MIN(uploaded_at) AS earliest_uploaded_at,
  MAX(uploaded_at) AS latest_uploaded_at
FROM student_request_attachments;
```

```sql
SELECT COUNT(*) AS orphan_request
FROM student_request_attachments a LEFT JOIN student_requests sr ON sr.id = a.request_id
WHERE a.request_id IS NOT NULL AND sr.id IS NULL;
```

### Q-P1-49 — academic_councils: ملف الكيان
**قاعدة المطابقة:** council_type ∈ {college, department}؛ department_id NULL = مجلس كلية.

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE is_active) AS active_rows,
  COUNT(*) FILTER (WHERE council_type = 'college') AS college_councils,
  COUNT(*) FILTER (WHERE council_type = 'department') AS department_councils,
  COUNT(*) FILTER (WHERE department_id IS NULL) AS null_department,
  COUNT(*) FILTER (WHERE name IS NULL) AS null_name,
  MIN(created_at) AS earliest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM academic_councils;
```

```sql
SELECT COUNT(*) AS orphan_department
FROM academic_councils c LEFT JOIN departments d ON d.id = c.department_id
WHERE c.department_id IS NOT NULL AND d.id IS NULL;
```

### Q-P1-50 — academic_council_members: ملف الكيان + يتامى مجلس
```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE is_active) AS active_rows,
  COUNT(DISTINCT council_id) AS distinct_councils_with_members,
  COUNT(DISTINCT user_id) AS distinct_users,
  COUNT(*) FILTER (WHERE member_role IS NULL) AS null_member_role,
  MIN(created_at) AS earliest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM academic_council_members;
```

```sql
SELECT COUNT(*) AS orphan_council
FROM academic_council_members m LEFT JOIN academic_councils c ON c.id = m.council_id
WHERE c.id IS NULL;
```

```sql
SELECT member_role, COUNT(*) AS members_count FROM academic_council_members GROUP BY member_role ORDER BY members_count DESC;
```

---

### 4.ب — كيانات NO_TABLE_FOUND (19) — مجسّات بديلة موثقة أو ملاحظة NO_TABLE

لكل كيان من الـ19: إما مجس بديل (استعلام SELECT على البديل الموثق في المرتكزات) أو ملاحظة صريحة بأن لا بديل. لا يجوز إنشاء أي استعلام على جدول غير موجود.

#### Q-P1-N01 — colleges ⇒ NO_TABLE (بديل: مجالس نوع college)
لا يوجد جدول colleges؛ البديل الموثق: صفوف `academic_councils` بنوع `college` + غياب college_id من departments (نشر كلية واحدة).

```sql
SELECT COUNT(*) AS college_type_councils
FROM academic_councils WHERE council_type = 'college';
```

#### Q-P1-N02 — study_systems ⇒ NO_TABLE (بديل: عمود student_profiles.study_system)
```sql
SELECT study_system, COUNT(*) AS profiles_count
FROM student_profiles
GROUP BY study_system
ORDER BY profiles_count DESC;
```
**قاعدة المطابقة:** القيم المتوقعة من المصدر {regular, private} (student-recon: 728/373 في الـ1101 المدمج) + NULL مسموح (العمود nullable).

#### Q-P1-N03 — auth_account_links ⇒ NO_TABLE (بديل: أعمدة user_id)
```sql
SELECT
  (SELECT COUNT(*) FROM student_profiles WHERE user_id IS NOT NULL) AS student_links,
  (SELECT COUNT(*) FROM faculty_profiles WHERE user_id IS NOT NULL) AS faculty_links,
  (SELECT COUNT(*) FROM staff_profiles WHERE user_id IS NOT NULL) AS staff_links;
```

#### Q-P1-N04 — department_chairs ⇒ NO_TABLE (بديل: التعيينات بدور رئيس قسم)
انظر الاستعلام الكامل Q-P4-06 (دلالات B-audit). مجس الكيان هنا: عدد التعيينات النشطة المرتبطة بقسم.

```sql
SELECT COUNT(*) AS active_department_scoped_assignments
FROM request_processing_assignments
WHERE is_active AND department_id IS NOT NULL;
```

#### Q-P1-N05 — prerequisites ⇒ NO_TABLE (بديل: عمود study_plan_courses.prerequisite_course_id)
```sql
SELECT
  COUNT(*) FILTER (WHERE prerequisite_course_id IS NOT NULL) AS rows_with_prereq,
  COUNT(*) FILTER (WHERE prerequisite_course_id IS NULL) AS rows_without_prereq
FROM study_plan_courses;
```

#### Q-P1-N06 — shared_courses ⇒ NO_TABLE (بديل: مقررات مستخدمة في أكثر من خطة)
**قاعدة المطابقة:** plans-recon: 27 رمزاً حقيقياً مشتركاً بين خطتين فأكثر في المصدر (20 مشتركة بين الأربع كلها).

```sql
SELECT COUNT(*) AS courses_in_multiple_plans
FROM (
  SELECT course_id FROM study_plan_courses
  GROUP BY course_id HAVING COUNT(DISTINCT study_plan_id) > 1
) d;
```

#### Q-P1-N07 — electives ⇒ NO_TABLE (بديل: is_required=false)
```sql
SELECT COUNT(*) AS elective_plan_course_rows
FROM study_plan_courses WHERE NOT is_required;
```
**قاعدة المطابقة:** المصدر: 12 صفاً اختيارياً عبر الخطط الأربع (3 لكل خطة) لكنها placeholder بلا تعريف pool (A12) — متوقع 0 أو قيمة تتطلب قراراً.

#### Q-P1-N08 — course_descriptions ⇒ NO_TABLE (بديل: courses.description_ar)
```sql
SELECT
  COUNT(*) FILTER (WHERE description_ar IS NOT NULL AND btrim(description_ar) <> '') AS courses_with_description,
  COUNT(*) FILTER (WHERE description_ar IS NULL OR btrim(description_ar) = '') AS courses_without_description
FROM courses;
```

#### Q-P1-N09 — cohorts ⇒ NO_TABLE (لا بديل تخزيني)
ملاحظة موثقة: الربط بالدفعات مشتق من الهيكل الأكاديمي (سنة/فصل/برنامج/مستوى) ولا جدول cohorts. **لا استعلام** — يُسجَّل `NOT_APPLICABLE` في المصفوفة؛ فحص G5 «section بلا cohort» يُصنَّف تلقائياً NOT_APPLICABLE بنفس المرجع.

#### Q-P1-N10 — teaching_assignments ⇒ NO_TABLE (بديل: course_sections.faculty_profile_id + class_schedule.faculty_profile_id)
```sql
SELECT
  (SELECT COUNT(*) FROM course_sections WHERE faculty_profile_id IS NOT NULL) AS sections_with_faculty,
  (SELECT COUNT(*) FROM course_sections WHERE faculty_profile_id IS NULL) AS sections_without_faculty,
  (SELECT COUNT(*) FROM class_schedule WHERE faculty_profile_id IS NOT NULL) AS schedule_rows_with_faculty,
  (SELECT COUNT(*) FROM class_schedule WHERE faculty_profile_id IS NULL) AS schedule_rows_without_faculty;
```

#### Q-P1-N11 — grade_approvals ⇒ NO_TABLE (بديل: أعمدة student_grades المدمجة)
```sql
SELECT
  COUNT(*) FILTER (WHERE approved_at IS NOT NULL) AS approved_rows,
  COUNT(*) FILTER (WHERE approved_at IS NULL) AS unapproved_rows,
  COUNT(*) FILTER (WHERE approved_by IS NULL AND approved_at IS NOT NULL) AS approved_without_approver
FROM student_grades;
```

#### Q-P1-N12 — labs ⇒ NO_TABLE (بديل: rooms بـ room_type='lab')
**قاعدة المطابقة:** مرجع ops-recon: 5 معامل حاسوب في ملف القاعات الجاهز (سعة 30).

```sql
SELECT
  COUNT(*) AS lab_rooms,
  COUNT(*) FILTER (WHERE is_active) AS active_lab_rooms,
  COUNT(*) FILTER (WHERE capacity IS NULL OR capacity <= 0) AS invalid_capacity_labs
FROM rooms WHERE room_type = 'lab';
```

#### Q-P1-N13 — sessions ⇒ NO_TABLE (لا بديل — time_slots فقط)
ملاحظة موثقة: لا جدول sessions/attendance؛ أوقات اللقاءات هي صفوف time_slots المشار إليها من class_schedule. فحصا G5 «session بلا room / بلا instructor» يُنفَّذان كمجسين بديلين على class_schedule (Q-P5-10) مع تسجيل التصنيف NOT_APPLICABLE لكيان sessions ذاته.

#### Q-P1-N14 — clearance ⇒ NO_TABLE
لا بديل. موثق كتوسع معلّق (G4 في وثيقة البوابات). يُسجَّل `MISSING` + `NOT_APPLICABLE` للاستيراد حالياً.

#### Q-P1-N15 — graduation_projects ⇒ NO_TABLE
لا بديل. توسع معلّق. يُسجَّل `MISSING`.

#### Q-P1-N16 — graduates_affairs ⇒ NO_TABLE (بديل جزئي: دور graduate)
```sql
SELECT COUNT(*) AS users_with_graduate_role
FROM user_roles WHERE role = 'graduate';
```

#### Q-P1-N17 — lecture_execution ⇒ NO_TABLE (بديل: class_schedule المنشور)
```sql
SELECT COUNT(*) AS published_schedule_rows
FROM class_schedule WHERE status = 'published';
```

#### Q-P1-N18 — learning_materials ⇒ NO_TABLE_IN_GENERATED_TYPES (تحقق وجود اختياري)
المرتكزات: `course_materials` / `course_material_events` غير موجودتين في types.ts على main؛ مجس information_schema التالي يحسم الوجود الفعلي (احتمال وجودهما في مايگريشنز UUID متأخرة غير مؤكدة):

```sql
SELECT t.table_name
FROM information_schema.tables t
WHERE t.table_schema = 'public' AND t.table_name IN ('course_materials','course_material_events');
```
إذا عاد صفر صف ⇒ `MISSING`؛ غير ذلك يُضاف ملف كيان مؤقت ويُرفع للـlead (خارج نطاق المرتكزات — لا استعلامات إضافية معدة مسبقاً).

#### Q-P1-N19 — reports ⇒ NO_TABLE (بديل: الـviews الثلاثة)
انظر Q-P1-02. الصفوف المقروءة من كل view (عدّ فقط):

```sql
SELECT
  (SELECT COUNT(*) FROM student_course_grade_summary) AS grade_summary_rows,
  (SELECT COUNT(*) FROM student_transcript_summary) AS transcript_summary_rows,
  (SELECT COUNT(*) FROM student_unofficial_transcript) AS unofficial_transcript_rows;
```

---

## 5. المرحلة P2 — الطلاب والحسابات (G2) + عقد لقطة PR#200

> قواعد G2 الملزمة: المطابقة بالرقم الأكاديمي الموحّد فقط (قاعدة التطبيع N1–N6 من student-recon: تحويل أرقام عربية-هندية لـASCII، إزالة كل الفراغات، **عدم** إزالة أصفار بادئة وعدم حشو، الصلاحية `^[0-9]{8}$`). لا تُلصق أرقام أكاديمية حرفية في SQL — تُمرَّر كبارامترات. النتائج الصفّية تُحفظ خارج Git؛ في Git أعداد مجمعة فقط.

### Q-P2-01 — تأكيد البيئة (project_ref) — يُنفَّذ أولاً وقبل كل شيء
**الغرض:** حارس anti-wrong-environment. يجب أن تعيد `wpmicqriltrowwonknox`؛ غير ذلك إيقاف فوري (`PROJECT_REF_MISMATCH`).
**المخرجات:** `project_ref`.
**قاعدة المطابقة:** يساوي حرفياً `wpmicqriltrowwonknox`.

```sql
SELECT current_setting('request.jwt.claims', true) IS NOT NULL AS channel_alive,
       current_database() AS database_name;
```

> ملاحظة تنفيذ: الـproject_ref لا يظهر عبر SQL قياسي؛ تؤكده القناة نفسها (لوحة Supabase/ميتاداتا الاتصال). هذا الاستعلام يثبت حياة القناة واسم قاعدة البيانات؛ يُرفق في الدليل حقل `project_ref` كما تؤكده القناة. إن تعذّر التأكيد ⇒ `PROJECT_REF_MISMATCH` ولا متابعة.

### Q-P2-02 — لقطة الإنتاج بعقد PR#200 (counts-only + sha256)
**الغرض:** إنتاج `StudentAccountsProductionSnapshot` (schema_version=1) مطابقاً حرفياً لعقد `student-accounts-preflight.ts`: **أعداد فقط، لا PII**، حقول: `schema_version`, `total_profiles`, `linked_profiles`, `unlinked_profiles`, `captured_at`, `expires_at` (TTL 15 دقيقة), `source_channel`, `project_ref`, `snapshot_hash` (sha256 على JSON قياسي من كل ما سبق).
**المخرجات:** صف واحد JSON بالحقول التسعة.
**قاعدة المطابقة:** المرجع الموثق D-02 (UNVERIFIED_CHANNEL): total=846, linked=843, unlinked=3. اللقطة تُستهلك خلال 15 دقيقة وإلا `STALE_SNAPSHOT`.

```sql
WITH counts AS (
  SELECT
    COUNT(*) AS total_profiles,
    COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS linked_profiles,
    COUNT(*) FILTER (WHERE user_id IS NULL) AS unlinked_profiles,
    now() AS captured_at,
    now() + interval '15 minutes' AS expires_at
  FROM student_profiles
),
payload AS (
  SELECT jsonb_build_object(
    'schema_version', 1,
    'total_profiles', total_profiles,
    'linked_profiles', linked_profiles,
    'unlinked_profiles', unlinked_profiles,
    'captured_at', to_char(captured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'expires_at', to_char(expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'source_channel', 'supabase_service_role_readonly',
    'project_ref', 'wpmicqriltrowwonknox'
  ) AS doc
  FROM counts
)
SELECT
  doc ->> 'schema_version' AS schema_version,
  doc ->> 'total_profiles' AS total_profiles,
  doc ->> 'linked_profiles' AS linked_profiles,
  doc ->> 'unlinked_profiles' AS unlinked_profiles,
  doc ->> 'captured_at' AS captured_at,
  doc ->> 'expires_at' AS expires_at,
  doc ->> 'source_channel' AS source_channel,
  doc ->> 'project_ref' AS project_ref,
  encode(digest(doc #>> '{}', 'sha256'), 'hex') AS snapshot_hash
FROM payload;
```
**[pgcrypto]** إن لم يكن `digest` متاحاً: تُنفَّذ أول SELECT فقط (بدون آخر سطرين — يعاد بناء JSON خارجياً بالترتيب نفسه للمفاتيح) وتُحسب sha256 خارجياً على التسلسل القياسي `{"schema_version":1,"total_profiles":T,"linked_profiles":L,"unlinked_profiles":U,"captured_at":"...","expires_at":"...","source_channel":"supabase_service_role_readonly","project_ref":"wpmicqriltrowwonknox"}` (مفاتيح مرتبة أبجدياً، بلا فراغات). الترتيب الأبجدي هو التسلسل القياسي المعتمد (jsonb يخزّن مرتباً بالمفتاح).

> القاعدة الملزمة (PR#200): عند تصنيف ملف الـ566 لاحقاً: `READY_TO_CREATE === snapshot.unlinked_profiles` وإلا `HOLD_ACCOUNT_IMPORT` (`BINDING_RULE_VIOLATION`). فجوة D-02 الحسابية: 1101−846=255 (تفسيرها في Q-P2-08).

### Q-P2-03 — PRESENT_LINKED / PRESENT_UNLINKED / MISSING_PROFILE (مجمّع، بارامتري)
**الغرض:** تصنيف مجموعة أرقام أكاديمية (مصدر 1101 أو أي جزء) ضد الإنتاج — **أعداد مجمعة فقط**.
**البارامترات:** `:numbers text[]` — أرقام أكاديمية موحّدة (8 خانات بعد تطبيق N1–N6 خارجياً).
**المخرجات:** `present_linked`, `present_unlinked`, `missing_profile`.
**قاعدة المطابقة:** 535 ∩ 566 = ∅، الاتحاد 1101 (student-recon). لا افتراض مسبق عن التوزيع الإنتاجي (UNVERIFIED_CHANNEL).

```sql
WITH src AS (
  SELECT DISTINCT n AS academic_number
  FROM unnest(:numbers::text[]) AS n
  WHERE n ~ '^[0-9]{8}$'
)
SELECT
  COUNT(*) FILTER (WHERE sp.id IS NOT NULL AND sp.user_id IS NOT NULL) AS present_linked,
  COUNT(*) FILTER (WHERE sp.id IS NOT NULL AND sp.user_id IS NULL) AS present_unlinked,
  COUNT(*) FILTER (WHERE sp.id IS NULL) AS missing_profile
FROM src LEFT JOIN student_profiles sp ON sp.academic_number = src.academic_number;
```

### Q-P2-04 — DUPLICATE_IN_PRODUCTION
**الغرض:** أرقام أكاديمية مكررة داخل الإنتاج نفسه (إجمالي + ضمن المجموعة المصدرية).
**المخرجات:** (أ) `duplicate_academic_number_groups_production`؛ (ب) `duplicate_groups_within_source_set`.
**قاعدة المطابقة:** متوقع 0 في كليهما (المصدر نظيف: 0 تكرارات؛ التكرار الإنتاجي يُصنّف DUPLICATE_IN_PRODUCTION ويوقف المطابقة الفريدة).

```sql
-- (أ) إجمالي الإنتاج
SELECT COUNT(*) AS duplicate_academic_number_groups_production
FROM (
  SELECT academic_number FROM student_profiles
  WHERE academic_number IS NOT NULL
  GROUP BY academic_number HAVING COUNT(*) > 1
) d;
```

```sql
-- (ب) ضمن المجموعة المصدرية :numbers text[]
SELECT COUNT(*) AS duplicate_groups_within_source_set
FROM (
  SELECT sp.academic_number
  FROM student_profiles sp
  WHERE sp.academic_number = ANY(:numbers::text[])
  GROUP BY sp.academic_number HAVING COUNT(*) > 1
) d;
```

### Q-P2-05 — CONFLICTING_PROFILE / MISMATCH probes (برنامج/نظام/مستوى/حالة)
**الغرض:** كشف الصفوف الموجودة إنتاجياً لكن بحقول مختلفة عن المصدر — مجمّع بارامتري.
**البارامترات:** `:numbers text[]`، `:program_codes text[]` (موازية بالترتيب: code لكل رقم)، `:study_systems text[]`، `:levels text[]`، `:statuses text[]` (مصفوفات متوازية بالفهرس — الربط خارجياً من ملفات المصدر، بلا PII في SQL).
**المخرجات:** `program_mismatch`, `study_system_mismatch`, `level_mismatch`, `status_mismatch` (أعداد فقط؛ القوائم التفصيلية خارج Git).
**قاعدة المطابقة:** تُحسب الأعداد؛ المرجع صفري التوقع لكنه UNVERIFIED_CHANNEL. ملاحظة: مستوى الطالب إنتاجياً يقاس بـ academic_levels.level_number عبر الربط المتاح؛ إن لم يوجد عمود مستوى مباشر على student_profiles يُقارن عبر الانتماء فقط ويُسجَّل LEVEL_MISMATCH = DEFERRED.

```sql
WITH src AS (
  SELECT
    n AS academic_number,
    pc AS program_code,
    ss AS study_system,
    lv AS academic_level,
    st AS status
  FROM unnest(:numbers::text[], :program_codes::text[], :study_systems::text[], :levels::text[], :statuses::text[])
    AS u(n, pc, ss, lv, st)
)
SELECT
  COUNT(*) FILTER (WHERE sp.id IS NOT NULL AND p.code IS DISTINCT FROM src.program_code) AS program_mismatch,
  COUNT(*) FILTER (WHERE sp.id IS NOT NULL AND sp.study_system IS DISTINCT FROM src.study_system) AS study_system_mismatch,
  COUNT(*) FILTER (WHERE sp.id IS NOT NULL AND al.level_number::text IS DISTINCT FROM src.academic_level) AS level_mismatch,
  COUNT(*) FILTER (WHERE sp.id IS NOT NULL AND sp.status IS DISTINCT FROM src.status) AS status_mismatch
FROM src
JOIN student_profiles sp ON sp.academic_number = src.academic_number
LEFT JOIN programs p ON p.id = sp.program_id
LEFT JOIN academic_levels al ON al.id = sp.level_id;
```
> ملاحظة مرتكزات: SCHEMA-ANCHORS لا يثبت عمود `level_id` على student_profiles (غير مذكور في not_null/fk). إن فشل الاستعلام لعمود غير موجود: يُعاد تنفيذه بعد حذف سطر level_mismatch ووسمه `LEVEL_MISMATCH = DEFERRED_SCHEMA`، ويُرفع للـlead لتحديث المرتكز. لا يُخمَّن اسم عمود بديل.

### Q-P2-06 — [AUTH-SCHEMA] مجس تعارض Auth (البريد المصدري)
**الغرض:** كشف حسابات Auth موجودة ببريد من مجموعة المصدر — يصنّف CONFLICT (ملف مرتبط بحساب غريب) أو يؤكد ALREADY_LINKED.
**البارامترات:** `:emails text[]` (بريد جامعي من ملف الـ566/535 — يُمرَّر مربوطاً؛ النتائج المجمعة فقط).
**المخرجات:** `auth_users_for_source_emails` (عدد)،`auth_emails_without_profile_link` (عدد).
**[AUTH-SCHEMA]** يتطلب قراءة auth.users عبر القناة؛ إن غير متاح ⇒ `SKIPPED_AUTH_SCHEMA_UNAVAILABLE` وكل تصنيفات G2 التي تعتمد عليه تبقى UNVERIFIED_CHANNEL.

```sql
SELECT
  COUNT(*) AS auth_users_for_source_emails,
  COUNT(*) FILTER (
    WHERE NOT EXISTS (SELECT 1 FROM student_profiles sp WHERE sp.user_id = au.id)
  ) AS auth_emails_without_profile_link
FROM auth.users au
WHERE lower(au.email) IN (SELECT lower(e) FROM unnest(:emails::text[]) AS e);
```

### Q-P2-07 — [AUTH-SCHEMA] يتامى الروابط (user_id يشير لمستخدم غير موجود)
**الغرض:** profile يقول مرتبط لكن مستخدم Auth غير موجود (رابط ميت) — يُحسب ضمن CONFLICTING_PROFILE.
**المخرجات:** `orphan_user_id_links`.
**[AUTH-SCHEMA]**

```sql
SELECT COUNT(*) AS orphan_user_id_links
FROM student_profiles sp
LEFT JOIN auth.users au ON au.id = sp.user_id
WHERE sp.user_id IS NOT NULL AND au.id IS NULL;
```

### Q-P2-08 — تفسير الفجوة 255 (G2.4) — مجمّعات التحليل
**الغرض:** تفكيك فجوة (1101 المصدر − 846 الموثق = 255) إلى مكونات مؤكدة: مفقود فعلياً / خريج / منسحب / موقوف / خارج البرامج / رقم غير صالح.
**المخرجات:** صف واحد بعدّادات: `production_total`, `matched_to_source` (بارامتري `:numbers` = اتحاد 1101 الموحّد), `production_not_in_source`, `production_out_of_college_programs` (خارج {CS,IT,CIS,CYB}), `production_by_status_json`, `source_invalid_numbers` (=2 ثابت من student-recon).
**قاعدة المطابقة:** `matched_to_source + production_not_in_source = production_total`؛ الفجوة 255 = missing (من Q-P2-03) + تفسيرات الحالات.

```sql
WITH src AS (SELECT DISTINCT n AS academic_number FROM unnest(:numbers::text[]) n WHERE n ~ '^[0-9]{8}$'),
cls AS (
  SELECT
    sp.id,
    (src.academic_number IS NOT NULL) AS in_source,
    (p.code IN ('CS','IT','CIS','CYB')) AS in_college_programs,
    sp.status
  FROM student_profiles sp
  LEFT JOIN src ON src.academic_number = sp.academic_number
  LEFT JOIN programs p ON p.id = sp.program_id
)
SELECT
  (SELECT COUNT(*) FROM cls) AS production_total,
  (SELECT COUNT(*) FROM cls WHERE in_source) AS matched_to_source,
  (SELECT COUNT(*) FROM cls WHERE NOT in_source) AS production_not_in_source,
  (SELECT COUNT(*) FROM cls WHERE NOT in_source AND NOT in_college_programs) AS production_out_of_college_programs,
  (SELECT jsonb_object_agg(COALESCE(status,'<null>'), cnt)
   FROM (SELECT status, COUNT(*) AS cnt FROM cls GROUP BY status) t) AS production_by_status_json,
  (SELECT jsonb_object_agg(COALESCE(status,'<null>'), cnt)
   FROM (SELECT status, COUNT(*) AS cnt FROM cls WHERE NOT in_source GROUP BY status) t) AS not_in_source_by_status_json;
```
> التصنيفات خريج/منسحب/موقوف تُقرأ من `production_by_status_json` (مفردات status الفعلية من الإنتاج — لا تُفترض مسبقاً). «يحتاج قراراً بشرياً» = المتبقي غير المفسر بعد طرح المكونات.

### Q-P2-09 — تصنيف ملف الـ566 (ALREADY_LINKED / READY_TO_CREATE / CONFLICT / STUDENT_NOT_FOUND) — مجمّع
**الغرض:** التصنيف الأرباعي لملف حسابات الطلاب الموجودين 566 وفق G2.6 وقواعد PR#200 (INVALID_EMAIL=0 وDUPLICATE_*=0 مثبتة مصدرياً).
**البارامترات:** `:numbers text[]` (566 رقماً موحّداً)، `:emails text[]` (متوازية).
**المخرجات:** `already_linked`, `ready_to_create`, `conflict_profile_linked_to_other`, `student_not_found`.
**قاعدة المطابقة (القاعدة الملزمة):** `ready_to_create` يجب أن يساوي `snapshot.unlinked_profiles` من Q-P2-02 (المرجع D-02: 3). اختلاف ⇒ `HOLD_ACCOUNT_IMPORT` (`BINDING_RULE_VIOLATION`).

```sql
WITH src AS (
  SELECT n AS academic_number, e AS university_email
  FROM unnest(:numbers::text[], :emails::text[]) AS u(n, e)
  WHERE n ~ '^[0-9]{8}$'
),
linked_flag AS (
  SELECT
    src.academic_number,
    sp.id AS profile_id,
    sp.user_id,
    EXISTS (
      SELECT 1 FROM student_profiles other
      WHERE other.id <> sp.id AND other.user_id IS NOT NULL
        AND other.user_id = sp.user_id
    ) AS shared_user_id
  FROM src JOIN student_profiles sp ON sp.academic_number = src.academic_number
)
SELECT
  COUNT(*) FILTER (WHERE lf.user_id IS NOT NULL AND NOT lf.shared_user_id) AS already_linked,
  COUNT(*) FILTER (WHERE lf.user_id IS NULL) AS ready_to_create_candidates,
  COUNT(*) FILTER (WHERE lf.shared_user_id) AS conflict_shared_account
FROM linked_flag lf;
```

```sql
-- STUDENT_NOT_FOUND = أرقام الـ566 غير الموجودة إنتاجياً
SELECT COUNT(*) AS student_not_found
FROM unnest(:numbers::text[]) AS n
WHERE n ~ '^[0-9]{8}$'
  AND NOT EXISTS (SELECT 1 FROM student_profiles sp WHERE sp.academic_number = n);
```
> ملاحظة: `ready_to_create` النهائي = `ready_to_create_candidates` بعد خصم: (أ) تعارضات Auth من Q-P2-06، (ب) أي رقم غير فريد المطابقة (DUPLICATE_IN_PRODUCTION>0 في Q-P2-04)، (ج) قرار الموقوفين (26 صفاً مصدرياً — DECISION_REQUIRED). لا يُعتمد الرقم نهائياً إلا بهذه الخصومات (G2.5).

### Q-P2-10 — كشف الموقوفين والحالات الخاصة داخل مجموعة المصدر (مجمّع)
**الغرض:** قياس تداخل قرار «حسابات للموقوفين» مع الإنتاج.
**المخرجات:** `source_suspended_present`, `production_suspended_linked`.
**قاعدة المطابقة:** المصدر: 26 موقوفاً (20+6). القرار أكاديمي — DECISION_REQUIRED.

```sql
SELECT
  COUNT(*) FILTER (WHERE sp.status = 'suspended') AS source_suspended_present,
  COUNT(*) FILTER (WHERE sp.status = 'suspended' AND sp.user_id IS NOT NULL) AS production_suspended_linked
FROM student_profiles sp
WHERE sp.academic_number = ANY(:numbers::text[]);
```

---

## 6. المرحلة P3 — المقررات والخطط الدراسية (G3)

> المرجع المصدري: `plans-recon/COURSES.json` — 114 رمزاً مميزاً عبر 4 خطط (109 حقيقي + 5 placeholders: `CS4XX(E)`, `IT4XX(E)`, `CIS4XX`, `CY3XX(E)`, `CY4XX(E)`)؛ 48 صف مقرر/خطة؛ قاعدة الساعات المكتشفة: credit = theory + practical/2 + training/2؛ إجمالي معلن 135 / محسوب 136 (A11). شذوذات مصدرية مثبتة: A7 (متطلب CIS444 يشير CIS343 غير الموجود — مرجّح CIS443)، A9 (11 رمزاً مشتركاً بتعارضات، منها ساعات FR283/CS331)، A12 (12 مقعداً اختيارياً بلا pool).

### Q-P3-01 — جرد المقررات الإنتاجية بالكود (مجمّع + قائمة أكواد)
**الغرض:** إجمالي + مميز + قائمة الأكواد الفعلية للمطابقة الخارجية مع الـ114.
**المخرجات:** (أ) `total_courses`, `distinct_codes`؛ (ب) قائمة `code` (أكواد — ليست PII).
**قاعدة المطابقة:** تقاطع/فرق المجموعتين يحسب خارجياً: موجود/مفقود لكل رمز من الـ114.

```sql
SELECT COUNT(*) AS total_courses, COUNT(DISTINCT code) AS distinct_codes FROM courses;
```

```sql
SELECT code FROM courses ORDER BY code;
```

### Q-P3-02 — مقررات المصدر المفقودة إنتاجياً (بارامتري)
**البارامترات:** `:codes text[]` — الـ114 رمزاً (أو 109 بدون placeholders).
**المخرجات:** `missing_in_production`, `present_in_production`.
**قاعدة المطابقة:** المفقودات تغذي G3 (missing courses) وbacklog (courses import).

```sql
SELECT
  COUNT(*) FILTER (WHERE c.id IS NULL) AS missing_in_production,
  COUNT(*) FILTER (WHERE c.id IS NOT NULL) AS present_in_production
FROM unnest(:codes::text[]) AS s(code)
LEFT JOIN courses c ON c.code = s.code;
```

### Q-P3-03 — تكرار course_code + نفس الرمز باسم مختلف
**الغرض:** G3: course_code مكرر؛ نفس الرمز بأسماء متعددة.
**المخرجات:** `duplicate_code_groups`, `codes_with_multiple_names`.
**قاعدة المطابقة:** متوقع 0 (تكرارات الرموز في المصدر placeholders فقط ولا تُستورد).

```sql
SELECT
  (SELECT COUNT(*) FROM (SELECT code FROM courses GROUP BY code HAVING COUNT(*) > 1) a) AS duplicate_code_groups,
  (SELECT COUNT(*) FROM (SELECT code FROM courses GROUP BY code HAVING COUNT(DISTINCT name_ar) > 1) b) AS codes_with_multiple_names;
```

### Q-P3-04 — نفس المقرر برموز مختلفة (بالاسم الموحّد)
**الغرض:** G3: same course different codes — كشف أسماء مرتبطة بأكثر من رمز.
**المخرجات:** `names_with_multiple_codes` (عدد فقط؛ التفاصيل خارج Git).
**قاعدة المطابقة:** مرجع المصدر: 7 حالات حقيقية (A3) — تُقارن القائمة خارجياً.

```sql
SELECT COUNT(*) AS names_with_multiple_codes
FROM (
  SELECT btrim(name_ar) AS n FROM courses
  GROUP BY btrim(name_ar) HAVING COUNT(DISTINCT code) > 1
) d;
```

### Q-P3-05 — رموز مؤقتة/placeholder في الإنتاج
**الغرض:** G3: رموز مؤقتة — كشف الأكواد المخالفة لنمط `^[A-Z]{2,5}[0-9]{3}$` (USR0x ضمن النمط).
**المخرجات:** `placeholder_like_codes` (عدد).
**قاعدة المطابقة:** متوقع 0؛ أي وجود ⇒ DO_NOT_IMPORT لصف placeholder المصدر المقابل.

```sql
SELECT COUNT(*) AS placeholder_like_codes
FROM courses WHERE code !~ '^[A-Z]{2,5}[0-9]{3}$';
```

### Q-P3-06 — ساعات ناقصة/غير متسقة
**الغرض:** G3: theory/practical/credit ساعات ناقصة أو غير متسقة.
**المخرجات:** `null_theory`, `null_practical`, `null_credit`, `zero_all_hours`, `credit_inconsistent_with_components` (credit_hours ≠ theory_hours + practical_hours/2 — ملاحظة: نموذج الإنتاج لا يخزن training منفصلاً حسب المرتكزات؛ التطابق التام بقاعدة المصدر يُحسب خارجياً).
**قاعدة المطابقة:** المصدر: لا خلايا ساعات فارغة (A5/A6=0). التباين في credit يُصنّف DECISION_REQUIRED.

```sql
SELECT
  COUNT(*) FILTER (WHERE theory_hours IS NULL) AS null_theory,
  COUNT(*) FILTER (WHERE practical_hours IS NULL) AS null_practical,
  COUNT(*) FILTER (WHERE credit_hours IS NULL) AS null_credit,
  COUNT(*) FILTER (WHERE COALESCE(theory_hours,0)=0 AND COALESCE(practical_hours,0)=0) AS zero_all_hours,
  COUNT(*) FILTER (WHERE credit_hours IS NOT NULL AND theory_hours IS NOT NULL AND practical_hours IS NOT NULL
                   AND credit_hours <> theory_hours + practical_hours / 2.0) AS credit_inconsistent_with_components
FROM courses;
```

### Q-P3-07 — جرد الخطط + توزيع مقرراتها
**الغرض:** G3: خطة مستوى/فصل غير مكتملة؛ اختلاف نسخ الخطط.
**المخرجات:** صف لكل خطة: `study_plan_id`, `program_code`, `version`, `is_active`, `status`, `plan_course_rows`, `distinct_courses`, `distinct_levels`, `distinct_semesters`.
**قاعدة المطابقة:** المصدر: 48 صف مقرر/خطة موزعة 6/6/6/6/6/6/1(صيفي)/6/5 عبر (سنة،فصل)؛ نسخة واحدة 2026-2027.

```sql
SELECT sp.id AS study_plan_id, p.code AS program_code, sp.version, sp.is_active, sp.status,
       COUNT(spc.id) AS plan_course_rows,
       COUNT(DISTINCT spc.course_id) AS distinct_courses,
       COUNT(DISTINCT spc.level_id) AS distinct_levels,
       COUNT(DISTINCT spc.semester_code) AS distinct_semesters
FROM study_plans sp
LEFT JOIN programs p ON p.id = sp.program_id
LEFT JOIN study_plan_courses spc ON spc.study_plan_id = sp.id
GROUP BY sp.id, p.code, sp.version, sp.is_active, sp.status
ORDER BY p.code, sp.version;
```

### Q-P3-08 — توزيع plan_courses بمستوى×فصل لكل خطة (بارامتري بخطة)
**الغرض:** مصفوفة اكتمال (برنامج، مستوى، فصل) — expected vs production.
**البارامترات:** `:plan_id uuid` (من Q-P3-07).
**المخرجات:** `level_number`, `semester_code`, `courses_count`.
**قاعدة المطابقة:** الجدول المتوقع من plans-recon §4 (6 مقررات لكل فصل نظامي، 5 في 4-2، 1 صيفي).

```sql
SELECT al.level_number, spc.semester_code, COUNT(*) AS courses_count
FROM study_plan_courses spc
LEFT JOIN academic_levels al ON al.id = spc.level_id
WHERE spc.study_plan_id = :plan_id
GROUP BY al.level_number, spc.semester_code
ORDER BY al.level_number, spc.semester_code;
```

### Q-P3-09 — مقرر في الخطة غير موجود في courses + مقرر بلا plan mapping
**الغرض:** G3: orphan بالاتجاهين.
**المخرجات:** `plan_courses_orphan_course`, `courses_without_plan_mapping`.

```sql
SELECT
  (SELECT COUNT(*) FROM study_plan_courses spc LEFT JOIN courses c ON c.id = spc.course_id WHERE c.id IS NULL) AS plan_courses_orphan_course,
  (SELECT COUNT(*) FROM courses c WHERE NOT EXISTS (SELECT 1 FROM study_plan_courses spc WHERE spc.course_id = c.id)) AS courses_without_plan_mapping;
```

### Q-P3-10 — سلامة المتطلبات السابقة
**الغرض:** G3: prerequisite مفقود / يشير لمقرر غير موجود.
**المخرجات:** `prereq_orphan` (prerequisite_course_id لا يطابق courses)،`plans_with_prereq_coverage` (نسبة الصفوف ذات متطلب)،`placeholder_prereq_candidates` (متطلبات ضمن نفس الخطة لكن مقرر المتطلب غير مسجل فيها).
**قاعدة المطابقة:** المصدر: A7 (CIS444←CIS343 غير موجود بأي خطة — خطأ مصدر مثبت)، A7b (9 متطلبات غير رمزية: بوابات ساعات/موافقة قسم — لا تُستورد كمتطلبات مقررات).

```sql
SELECT
  (SELECT COUNT(*) FROM study_plan_courses spc
   LEFT JOIN courses pc ON pc.id = spc.prerequisite_course_id
   WHERE spc.prerequisite_course_id IS NOT NULL AND pc.id IS NULL) AS prereq_orphan,
  (SELECT COUNT(*) FROM study_plan_courses spc
   WHERE spc.prerequisite_course_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM study_plan_courses x
                     WHERE x.study_plan_id = spc.study_plan_id
                       AND x.course_id = spc.prerequisite_course_id)) AS prereq_not_in_same_plan,
  (SELECT COUNT(*) FROM study_plan_courses WHERE prerequisite_course_id IS NOT NULL) AS rows_with_prereq;
```

### Q-P3-11 — تعارض المقررات المشتركة (بارامتري)
**الغرض:** G3: shared-course inconsistency — قياس ساعات/تعارضات الرموز الـ11 المشتركة المشخّصة (FR283, CS331, FR231, FR216, IT231, CY234, CIS321, IT324, AI211, IT112, IT221) ضد سجل الإنتاج الواحد.
**البارامترات:** `:codes text[]` (الرموز الـ11).
**المخرجات:** `code`, `name_ar`, `credit_hours`, `theory_hours`, `practical_hours`, `department_id` لكل رمز موجود.
**قاعدة المطابقة:** سجل الإنتاج الواحد لكل رمز يُقارن خارجياً بقيم COURSES.json لكل خطة؛ التعارض (كـ FR283: T2/Tr2 مقابل T3) يُصنّف DECISION_REQUIRED (قرار: فريد كلياً أم plan-scoped).

```sql
SELECT code, name_ar, credit_hours, theory_hours, practical_hours, department_id, status
FROM courses WHERE code = ANY(:codes::text[])
ORDER BY code;
```

### Q-P3-12 — جاهزية الاستيراد للمقررات (مجمّع نهائي G3)
**الغرض:** تجميع المدخلات لحساب ready-to-import / decision-required خارجياً.
**المخرجات:** `production_codes_count`, `production_placeholder_codes`, `production_duplicate_codes`, `plan_rows_total`, `plan_rows_elective_flag`.
**قاعدة المطابقة:** ready-to-import = رموز المصدر الـ109 الحقيقية − الموجودة بلا تعارض؛ decision-required = تعارضات A9 + placeholders A4/A12 + A7/A7b.

```sql
SELECT
  (SELECT COUNT(DISTINCT code) FROM courses) AS production_codes_count,
  (SELECT COUNT(*) FROM courses WHERE code !~ '^[A-Z]{2,5}[0-9]{3}$') AS production_placeholder_codes,
  (SELECT COUNT(*) FROM (SELECT code FROM courses GROUP BY code HAVING COUNT(*) > 1) d) AS production_duplicate_codes,
  (SELECT COUNT(*) FROM study_plan_courses) AS plan_rows_total,
  (SELECT COUNT(*) FROM study_plan_courses WHERE NOT is_required) AS plan_rows_elective_flag;
```

---

## 7. المرحلة P4 — هيئة التدريس والموظفون (G4)

> مراجع المصدر: ops-recon — 18 مدرّساً مميزاً (F01–F18) في ملف الإسناد؛ **0** رقم وظيفي و**0** بريد (ملف غير جاهز كمصدر حسابات)؛ 8 أسماء بشذوذ تنسيق. IMPORTERS.md: مستورد faculty_accounts منفصل (قالب موثق)، ومستورد staff ضمن المحرك.

### Q-P4-01 — عدّادات faculty_profiles الأساسية
**الغرض:** G4: عدد الملفات، المرتبطين، غير المرتبطين، أرقام وظيفية ناقصة.
**المخرجات:** صف واحد: `total`, `linked`, `unlinked`, `missing_employee_number`, `duplicate_employee_number_groups`, `inactive_status` (status <> نشط حسب مفردات الإنتاج — تُقرأ من التوزيع).
**قاعدة المطابقة:** المصدر 18 اسماً (لا رقم/بريد) — أي حساب موجود إنتاجياً يُقارن اسمه خارجياً خارج Git.

```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS linked,
  COUNT(*) FILTER (WHERE user_id IS NULL) AS unlinked,
  COUNT(*) FILTER (WHERE employee_number IS NULL) AS missing_employee_number,
  (SELECT COUNT(*) FROM (SELECT employee_number FROM faculty_profiles WHERE employee_number IS NOT NULL GROUP BY employee_number HAVING COUNT(*) > 1) d) AS duplicate_employee_number_groups
FROM faculty_profiles;
```

```sql
SELECT status, COUNT(*) AS profiles_count FROM faculty_profiles GROUP BY status ORDER BY profiles_count DESC;
```

### Q-P4-02 — staff_profiles: عدّادات + بريد ناقص
**الغرض:** G4: بريد رسمي ناقص/متعارض (staff)، أرقام وظيفية ناقصة.
**المخرجات:** `total`, `linked`, `unlinked`, `missing_employee_number`, `missing_email`, `duplicate_email_groups`.

```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS linked,
  COUNT(*) FILTER (WHERE user_id IS NULL) AS unlinked,
  COUNT(*) FILTER (WHERE employee_number IS NULL) AS missing_employee_number,
  COUNT(*) FILTER (WHERE email IS NULL) AS missing_email,
  (SELECT COUNT(*) FROM (SELECT email FROM staff_profiles WHERE email IS NOT NULL GROUP BY email HAVING COUNT(*) > 1) d) AS duplicate_email_groups
FROM staff_profiles;
```

### Q-P4-03 — duplicate accounts (عبر user_id مشترك بين ملفات)
**الغرض:** G4: duplicate accounts — نفس user_id على أكثر من profile (داخل نوع واحد أو عبر الأنواع الثلاثة).
**المخرجات:** `shared_user_id_count`.

```sql
WITH all_links AS (
  SELECT user_id FROM student_profiles WHERE user_id IS NOT NULL
  UNION ALL SELECT user_id FROM faculty_profiles WHERE user_id IS NOT NULL
  UNION ALL SELECT user_id FROM staff_profiles WHERE user_id IS NOT NULL
)
SELECT COUNT(*) AS shared_user_id_count
FROM (SELECT user_id FROM all_links GROUP BY user_id HAVING COUNT(*) > 1) d;
```

### Q-P4-04 — missing roles (أعضاء هيئة التدريس بلا دور)
**الغرض:** G4: missing roles — ملفات مرتبطة لكن بلا دور في أي من جدولي الأدوار.
**المخرجات:** `faculty_linked_without_role`, `staff_linked_without_role`.

```sql
SELECT
  (SELECT COUNT(*) FROM faculty_profiles fp
   WHERE fp.user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = fp.user_id)
     AND NOT EXISTS (SELECT 1 FROM user_role_assignments ura WHERE ura.user_id = fp.user_id)) AS faculty_linked_without_role,
  (SELECT COUNT(*) FROM staff_profiles sp
   WHERE sp.user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = sp.user_id)
     AND NOT EXISTS (SELECT 1 FROM user_role_assignments ura WHERE ura.user_id = sp.user_id)) AS staff_linked_without_role;
```

### Q-P4-05 — توزيع الأدوار (الجدولان)
**الغرض:** مرجع G4: roles distribution (faculty_member / department_head / إلخ).
**المخرجات:** قائمتان مجمعتان.

```sql
SELECT role, COUNT(*) AS users_count FROM user_roles GROUP BY role ORDER BY users_count DESC;
```

```sql
SELECT role_code, COUNT(*) AS users_count FROM user_role_assignments GROUP BY role_code ORDER BY users_count DESC;
```

### Q-P4-06 — رؤساء الأقسام (دلالات B-audit)
**الغرض:** G4: رؤساء الأقسام — التعيينات النشطة على وحدة=department بدور department_head.
**المنهج (دلالات B-audit):** `request_processing_assignments` النشطة المقيّدة بقسم (`department_id IS NOT NULL`) والمرتبطة بدور رئيس قسم — عبر `request_processing_roles` (mapping إلى app_role='department_head') **أو** `assignment_type='department_head'`؛ بالإضافة لحاملي الدور المباشر.
**المخرجات:** `department_head_assignments_active`, `distinct_departments_with_head`, `users_with_department_head_role`.
**ملاحظة مرتكزات:** اسم عمود الـmapping على request_processing_roles غير مثبت حرفياً في SCHEMA-ANCHORS («app_role mapping»)؛ يُستخدم `app_role_mapping` كما في roles_catalog. إن فشل الاستعلام لعمود غير موجود ⇒ يُعاد بسطر `a.assignment_type = 'department_head'` فقط ويُرفع للـlead.

```sql
SELECT
  COUNT(*) AS department_head_assignments_active,
  COUNT(DISTINCT a.department_id) AS distinct_departments_with_head
FROM request_processing_assignments a
LEFT JOIN request_processing_roles r ON r.id = a.role_id
WHERE a.is_active
  AND a.department_id IS NOT NULL
  AND (r.app_role_mapping = 'department_head' OR a.assignment_type = 'department_head');
```

```sql
SELECT COUNT(DISTINCT user_id) AS users_with_department_head_role
FROM user_roles WHERE role = 'department_head';
```

### Q-P4-07 — أعضاء بلا إسناد تدريس + مقررات بلا مدرس
**الغرض:** G4: أعضاء بلا إسناد؛ مقررات بلا مدرس (sections بلا faculty + عروض الفصل الحالي بلا أي section مدرّس).
**المخرجات:** `faculty_without_any_section`, `sections_without_faculty`, `schedule_rows_without_faculty`.
**قاعدة المطابقة:** المصدر: كل صف إسناد له اسم (لا مقرر بلا مدرس داخل الملف)؛ لكن الملف يغطي فصلين فقط — «خطة بلا مدرس» غير قابلة للحساب كفجوة من الملف وحده (ops-recon §2).

```sql
SELECT
  (SELECT COUNT(*) FROM faculty_profiles fp
   WHERE NOT EXISTS (SELECT 1 FROM course_sections cs WHERE cs.faculty_profile_id = fp.id)
     AND NOT EXISTS (SELECT 1 FROM class_schedule sch WHERE sch.faculty_profile_id = fp.id)) AS faculty_without_any_section,
  (SELECT COUNT(*) FROM course_sections WHERE faculty_profile_id IS NULL) AS sections_without_faculty,
  (SELECT COUNT(*) FROM class_schedule WHERE faculty_profile_id IS NULL) AS schedule_rows_without_faculty;
```

### Q-P4-08 — active assignments + wrong department/unit probes
**الغرض:** G4: active assignments؛ wrong department/unit — تعيينات نشطة تشير لقسم/وحدة غير موجودين (يتامى) أو بلا أي مُسنَد إليه.
**المخرجات:** `active_assignments`, `assignments_without_any_assignee`, `orphan_unit`, `orphan_department`.

```sql
SELECT
  COUNT(*) FILTER (WHERE a.is_active) AS active_assignments,
  COUNT(*) FILTER (WHERE a.is_active AND a.user_id IS NULL AND a.faculty_profile_id IS NULL AND a.staff_profile_id IS NULL AND a.position_assignment_id IS NULL) AS assignments_without_any_assignee,
  COUNT(*) FILTER (WHERE u.id IS NULL) AS orphan_unit,
  COUNT(*) FILTER (WHERE a.department_id IS NOT NULL AND d.id IS NULL) AS orphan_department
FROM request_processing_assignments a
LEFT JOIN request_processing_units u ON u.id = a.unit_id
LEFT JOIN departments d ON d.id = a.department_id;
```

### Q-P4-09 — نقص بيانات النصاب التدريسي
**الغرض:** G4: نقص بيانات النصاب — قياس توفر بيانات ساعات قابلة للاحتساب إنتاجياً (sections لكل مدرّس).
**المخرجات:** توزيع عدد الشعب لكل faculty_profile (مجمّع بفئات).
**قاعدة المطابقة:** المصدر: أحمال أسبوعية F01–F18 (4–14 ساعة) — لا عمود نصاب رسمي في المصدر؛ النصاب إنتاجياً مشتق. يُسجَّل DECISION_REQUIRED إن لم توجد شعب.

```sql
SELECT sections_count, COUNT(*) AS faculty_count
FROM (
  SELECT fp.id, COUNT(cs.id) AS sections_count
  FROM faculty_profiles fp LEFT JOIN course_sections cs ON cs.faculty_profile_id = fp.id
  GROUP BY fp.id
) t
GROUP BY sections_count
ORDER BY sections_count;
```

---

## 8. المرحلة P5 — سلامة التشغيل الأكاديمي (G5)

كل استعلام يعيد أعداداً فقط. أي عدد > 0 يُفصَّل خارج Git (قائمة معرّفات uuid فقط) ويغذي تصنيف ORPHANED/DUPLICATED في المصفوفة.

### Q-P5-01 — offering بلا course
```sql
SELECT COUNT(*) AS orphan_offerings_no_course
FROM course_offerings o LEFT JOIN courses c ON c.id = o.course_id
WHERE o.course_id IS NOT NULL AND c.id IS NULL;
```

### Q-P5-02 — offering بلا plan course
**الغرض:** عرض لمقرر غير ممثّل في أي خطة لنفس البرنامج (عبر study_plans بنفس program_id).
```sql
SELECT COUNT(*) AS offerings_without_plan_course
FROM course_offerings o
WHERE NOT EXISTS (
  SELECT 1
  FROM study_plan_courses spc
  JOIN study_plans sp ON sp.id = spc.study_plan_id
  WHERE spc.course_id = o.course_id
    AND sp.program_id = o.program_id
);
```

### Q-P5-03 — section بلا offering
```sql
SELECT COUNT(*) AS orphan_sections_no_offering
FROM course_sections cs LEFT JOIN course_offerings o ON o.id = cs.course_offering_id
WHERE cs.course_offering_id IS NOT NULL AND o.id IS NULL;
```

### Q-P5-04 — section بلا cohort
**NOT_APPLICABLE** — لا جدول cohorts (SCHEMA-ANCHORS: cohorts NO_TABLE_FOUND؛ الربط مشتق). يُسجَّل في المصفوفة `NOT_APPLICABLE` بمرجع Q-P1-N09. لا استعلام.

### Q-P5-05 — enrollment بلا student
```sql
SELECT COUNT(*) AS orphan_enrollments_no_student
FROM student_enrollments e LEFT JOIN student_profiles sp ON sp.id = e.student_profile_id
WHERE e.student_profile_id IS NOT NULL AND sp.id IS NULL;
```

### Q-P5-06 — enrollment بلا section/course
```sql
SELECT
  COUNT(*) FILTER (WHERE cs.id IS NULL) AS orphan_enrollments_no_section,
  COUNT(*) FILTER (WHERE cs.id IS NOT NULL AND o.id IS NULL) AS enrollments_section_without_offering,
  COUNT(*) FILTER (WHERE cs.id IS NOT NULL AND c.id IS NULL) AS enrollments_without_course
FROM student_enrollments e
LEFT JOIN course_sections cs ON cs.id = e.course_section_id
LEFT JOIN course_offerings o ON o.id = cs.course_offering_id
LEFT JOIN courses c ON c.id = o.course_id;
```

### Q-P5-07 — grade بلا enrollment
```sql
SELECT COUNT(*) AS orphan_grades_no_enrollment
FROM student_grades g LEFT JOIN student_enrollments e ON e.id = g.student_enrollment_id
WHERE g.student_enrollment_id IS NOT NULL AND e.id IS NULL;
```

### Q-P5-08 — teaching assignment بلا faculty/course
**الغرض:** إسناد (عمود nullable) يشير لملف غير موجود + شعبة/جدولة بلا مقرر عبر السلسلة.
```sql
SELECT
  (SELECT COUNT(*) FROM course_sections cs LEFT JOIN faculty_profiles fp ON fp.id = cs.faculty_profile_id
   WHERE cs.faculty_profile_id IS NOT NULL AND fp.id IS NULL) AS sections_orphan_faculty,
  (SELECT COUNT(*) FROM class_schedule sch LEFT JOIN faculty_profiles fp ON fp.id = sch.faculty_profile_id
   WHERE sch.faculty_profile_id IS NOT NULL AND fp.id IS NULL) AS schedule_orphan_faculty,
  (SELECT COUNT(*) FROM class_schedule sch
   LEFT JOIN course_sections cs ON cs.id = sch.course_section_id
   LEFT JOIN course_offerings o ON o.id = cs.course_offering_id
   LEFT JOIN courses c ON c.id = o.course_id
   WHERE c.id IS NULL) AS schedule_without_course;
```

### Q-P5-09 — schedule بلا offering/section
```sql
SELECT
  COUNT(*) FILTER (WHERE cs.id IS NULL) AS schedule_orphan_section,
  COUNT(*) FILTER (WHERE cs.id IS NOT NULL AND o.id IS NULL) AS schedule_section_without_offering
FROM class_schedule sch
LEFT JOIN course_sections cs ON cs.id = sch.course_section_id
LEFT JOIN course_offerings o ON o.id = cs.course_offering_id;
```

### Q-P5-10 — session بلا room / بلا instructor (بديل class_schedule)
**ملاحظة NO_TABLE:** لا جدول sessions (Q-P1-N13) — «session بلا room» و«session بلا instructor» يُنفَّذان كمجسين بديلين على صفوف الجدولة، مع تسجيل sessions ذاتها NOT_APPLICABLE.
```sql
SELECT
  COUNT(*) FILTER (WHERE r.id IS NULL) AS schedule_orphan_room,
  COUNT(*) FILTER (WHERE ts.id IS NULL) AS schedule_orphan_time_slot,
  COUNT(*) FILTER (WHERE sch.faculty_profile_id IS NULL) AS schedule_without_instructor,
  COUNT(*) FILTER (WHERE r.id IS NOT NULL AND NOT r.is_active) AS schedule_using_inactive_room
FROM class_schedule sch
LEFT JOIN rooms r ON r.id = sch.room_id
LEFT JOIN time_slots ts ON ts.id = sch.time_slot_id;
```

### Q-P5-11 — room أو lab غير صالح
**الغرض:** سعة غير صالحة، مبنى يتيم، نوع غير متوقع، غير نشط مُستخدم بجدولة منشورة.
**قاعدة المطابقة:** مرجع المصدر: 19 قاعة (14 LEC سعة 60 + 5 LAB سعة 30).
```sql
SELECT
  COUNT(*) FILTER (WHERE capacity IS NULL OR capacity <= 0) AS rooms_invalid_capacity,
  COUNT(*) FILTER (WHERE b.id IS NULL) AS rooms_orphan_building,
  COUNT(*) FILTER (WHERE room_type NOT IN ('lecture','lab','office','hall')) AS rooms_unexpected_type,
  COUNT(*) FILTER (WHERE r.room_type = 'lab' AND NOT r.is_active) AS inactive_labs
FROM rooms r LEFT JOIN buildings b ON b.id = r.building_id;
```

### Q-P5-12 — duplicate registration
```sql
SELECT COUNT(*) AS duplicate_enrollment_groups
FROM (
  SELECT student_profile_id, course_section_id
  FROM student_enrollments
  GROUP BY student_profile_id, course_section_id
  HAVING COUNT(*) > 1
) d;
```

### Q-P5-13 — duplicate schedule
```sql
SELECT COUNT(*) AS duplicate_schedule_groups
FROM (
  SELECT course_section_id, time_slot_id, room_id
  FROM class_schedule
  GROUP BY course_section_id, time_slot_id, room_id
  HAVING COUNT(*) > 1
) d;
```

### Q-P5-14 — conflicting active academic terms
**الغرض:** أكثر من سنة حالية / أكثر من فصل حالي / تداخل تواريخ فصول نشطة ضمن نفس السنة.
```sql
SELECT
  (SELECT COUNT(*) FROM academic_years WHERE is_current) AS current_years,
  (SELECT COUNT(*) FROM semesters WHERE is_current) AS current_terms,
  (SELECT COUNT(*) FROM semesters WHERE status IS NOT NULL AND start_date > end_date) AS terms_inverted_dates;
```

```sql
-- تداخل تواريخ فصول ضمن نفس السنة الأكاديمية
SELECT COUNT(*) AS overlapping_term_pairs
FROM semesters a
JOIN semesters b ON b.academic_year_id = a.academic_year_id AND b.id <> a.id
WHERE a.start_date <= b.end_date AND b.start_date <= a.end_date;
```
> ملاحظة: أزواج التداخل تُحسب مرتين (a,b) و(b,a)؛ القيمة الفعلية = الناتج/2. قاعدة المطابقة: current_years=1، current_terms=1، تداخل=0.

---

## 9. المرحلة P6 — سلامة الأنظمة الإدارية (G6)

### Q-P6-01 — request type بلا workflow
**الغرض:** نوع طلب نشط بلا أي workflow نشط.
```sql
SELECT COUNT(*) AS active_types_without_active_workflow
FROM request_types rt
WHERE rt.is_active
  AND NOT EXISTS (
    SELECT 1 FROM request_type_workflows w
    WHERE w.request_type_id = rt.id AND w.is_active
  );
```

### Q-P6-02 — workflow بلا steps
```sql
SELECT COUNT(*) AS workflows_without_steps
FROM request_type_workflows w
WHERE NOT EXISTS (SELECT 1 FROM request_type_workflow_steps s WHERE s.workflow_id = w.id);
```

### Q-P6-03 — step بلا assignment
**الغرض:** خطوة بلا هدف إسناد (لا role ولا unit) — معيار «بلا assignment» على مستوى التعريف.
```sql
SELECT COUNT(*) AS steps_without_assignment
FROM request_type_workflow_steps s
WHERE s.processing_role_id IS NULL AND s.processing_unit_id IS NULL;
```

### Q-P6-04 — active workflow لتطبيق مخفي أو العكس
**الغرض:** (أ) خدمة نشطة مخفية (student_visible=false) ولها workflow نشط — تشمل فحص الخدمات الخمس الموثقة؛ (ب) خدمة مرئية نشطة بلا workflow نشط (تظهر للطالب بلا مسار).
**قاعدة المطابقة:** B1-preflight: 5 خدمات `is_active=true, student_visible=false`: enrollment_suspension, excused_absence, file_withdrawal, department_transfer, final_chance؛ مقابل enrollment_certificate النشطة المرئية.
```sql
-- (أ) مخفي لكن بمسار نشط + حالة الخدمات الخمس الموثقة (أكواد — ليست PII)
SELECT rt.code, rt.is_active, rt.student_visible,
       COUNT(w.id) FILTER (WHERE w.is_active) AS active_workflows
FROM request_types rt
LEFT JOIN request_type_workflows w ON w.request_type_id = rt.id
WHERE rt.is_active
GROUP BY rt.code, rt.is_active, rt.student_visible
ORDER BY rt.code;
```

```sql
-- (ب) العكس: مرئي نشط بلا workflow نشط
SELECT COUNT(*) AS visible_active_types_without_workflow
FROM request_types rt
WHERE rt.is_active AND rt.student_visible
  AND NOT EXISTS (SELECT 1 FROM request_type_workflows w WHERE w.request_type_id = rt.id AND w.is_active);
```

### Q-P6-05 — council بلا أعضاء
```sql
SELECT COUNT(*) AS active_councils_without_members
FROM academic_councils c
WHERE c.is_active
  AND NOT EXISTS (SELECT 1 FROM academic_council_members m WHERE m.council_id = c.id AND m.is_active);
```

### Q-P6-06 — عضوية بلا profile
**الغرض:** عضوية user_id لا يقابلها أي profile في الجداول الثلاثة (وكيل public-schema؛ التحقق الكامل من وجود مستخدم Auth في Q-P6-07).
```sql
SELECT COUNT(*) AS memberships_without_any_profile
FROM academic_council_members m
WHERE NOT EXISTS (SELECT 1 FROM student_profiles sp WHERE sp.user_id = m.user_id)
  AND NOT EXISTS (SELECT 1 FROM faculty_profiles fp WHERE fp.user_id = m.user_id)
  AND NOT EXISTS (SELECT 1 FROM staff_profiles st WHERE st.user_id = m.user_id);
```

### Q-P6-07 — [AUTH-SCHEMA] عضوية بلا مستخدم Auth
```sql
SELECT COUNT(*) AS memberships_orphan_auth_user
FROM academic_council_members m
LEFT JOIN auth.users au ON au.id = m.user_id
WHERE au.id IS NULL;
```
**[AUTH-SCHEMA]** إن غير متاح ⇒ SKIPPED_AUTH_SCHEMA_UNAVAILABLE.

### Q-P6-08 — position بلا assignment
```sql
SELECT COUNT(*) AS active_positions_without_assignment
FROM organizational_positions p
WHERE p.is_active
  AND NOT EXISTS (SELECT 1 FROM position_assignments pa WHERE pa.position_id = p.id AND pa.is_active);
```

### Q-P6-09 — document بلا request
**الغرض:** (أ) وثائق بلا student_request_id (عدّ)؛ (ب) وثائق request_id يتيم.
**ملاحظة:** student_request_id nullable — بعض أنواع الوثائق قد تصدر بلا طلب؛ (أ) يُسجَّل معلومة، (ب) هو اليتيم الحقيقي.
```sql
SELECT
  COUNT(*) FILTER (WHERE student_request_id IS NULL) AS documents_without_request,
  COUNT(*) FILTER (WHERE student_request_id IS NOT NULL AND sr.id IS NULL) AS documents_orphan_request
FROM official_documents od
LEFT JOIN student_requests sr ON sr.id = od.student_request_id;
```

### Q-P6-10 — attachment بلا parent
```sql
SELECT COUNT(*) AS attachments_orphan_request
FROM student_request_attachments a
LEFT JOIN student_requests sr ON sr.id = a.request_id
WHERE a.request_id IS NOT NULL AND sr.id IS NULL;
```

### Q-P6-11 — document status mismatch
**الغرض:** انجراف حالة الوثيقة عن حالة طلبها الأم (توزيع مشترك للحالات + تقاطعات غير متسقة محتملة).
**المنهج:** لا تُفترض مفردات الحالات؛ يُلتقط التوزيع المشترك ويُقيَّم خارجياً مقابل دلالات الحالات الموثقة (مثلاً وثيقة `issued` تحت طلب ملغى/مرفوض ⇒ mismatch).
```sql
SELECT od.status AS document_status, sr.status AS request_status, COUNT(*) AS docs_count
FROM official_documents od
JOIN student_requests sr ON sr.id = od.student_request_id
GROUP BY od.status, sr.status
ORDER BY docs_count DESC;
```

### Q-P6-12 — protected records drift (السجلات الخمسة المحمية)
**الغرض:** التحقق من وجود وحالة السجلات المحمية do-not-touch الموثقة في B1-preflight ووثيقة البوابات — وجود + حالة + أحدث تعديل (أي تغيير عن الحالة الموثقة = drift).
**المخرجات:** `id`, `request_number`, `request_type`, `status`, `created_at`, `updated_at` للمطابقات.
**قاعدة المطابقة:** يجب وجود الثلاثة بالـUUID وطلبا USR-2026-000001/000002 (مؤرشفان). أي غياب أو تغيّر حالة ⇒ تصعيد فوري (drift على سجل محمي).

```sql
SELECT id, request_number, request_type, status, created_at, updated_at
FROM student_requests
WHERE id IN (
  '93807768-a281-42de-bfb4-0c0c03786b20',
  '9cfd55a4-b2bf-4266-9c06-52f007ef3afe',
  'ec85cca4-ac93-462c-a0a5-83e8b915bedc'
)
OR request_number IN ('USR-2026-000001','USR-2026-000002','SR-20260713-2DE64041','SR-20260715-FEDCB3E1','SR-20260716-26BAD4C8');
```

---

## 10. قالب التقاط النتائج (execution evidence) — إلزامي لكل استعلام

لكل `query_id` يُنشأ سجل JSON واحد بالمخطط التالي. ملف الأدلة يُحفظ خارج Git؛ إلى Git يذهب الملخص المجمّع فقط (أعداد + تصنيفات) وفق G2.9/G2.10.

```json
{
  "$schema": "portal-production-audit-evidence/v1",
  "audit": "PORTAL-PRODUCTION-DATA-REALITY-AUDIT-AND-IMPORT-GAP-MATRIX-01",
  "project_ref": "wpmicqriltrowwonknox",
  "source_channel": "supabase_service_role_readonly",
  "records": [
    {
      "query_id": "Q-P1-03",
      "phase": "P1",
      "executed_at": "2026-07-22T00:00:00Z",
      "rowcount": 1,
      "duration_ms": 0,
      "result_sha256": "<hex sha256 of canonical result>",
      "canonicalization": "rows as JSON arrays; keys sorted; numbers as-is; null preserved; timestamps ISO-UTC; UTF-8; no whitespace",
      "result_kind": "aggregate_counts_only | code_list | status_distribution | skipped",
      "contains_pii": false,
      "status": "OK | SKIPPED_AUTH_SCHEMA_UNAVAILABLE | SKIPPED_EXTENSION_UNAVAILABLE | ERROR",
      "error": null,
      "params_redacted": true,
      "match_reference": "short pointer to the recon aggregate this query feeds"
    }
  ]
}
```

**طريقة sha256 للنتيجة:** تسلسل الصفوف كمصفوفات JSON بترتيب إرجاع الاستعلام، المفاتيح مرتبة أبجدياً، بلا فراغات، ترميز UTF-8، ثم sha256 hex. عند توفر pgcrypto يمكن التحقق بـ `encode(digest(<canonical>, 'sha256'), 'hex')` خارج قاعدة البيانات فقط (لا دوال تشفير داخل SQL الانتقائي غير الموسوم).

**قواعد التقاط خاصة:**
- Q-P2-02 (اللقطة): سجل الدليل يحمل `result_sha256 = snapshot_hash` نفسه، ويُختم بـ `expires_at`؛ أي استهلاك بعد الانقضاء ⇒ `STALE_SNAPSHOT` (HOLD).
- الاستعلامات البارامترية (Q-P2-03/05/06/09/10, Q-P3-02/11): لا تُحفظ قيم البارامترات في الدليل إطلاقاً؛ يُحفظ `params_redacted: true` + عدد العناصر فقط (`param_cardinality`).
- الاستعلامات التي تعيد قوائم أكواد (Q-P1-06ب, Q-P1-08, Q-P1-10, Q-P1-12ج, Q-P3-01ب): الأكواد ليست PII وتجوز في الدليل.
- أي نتيجة تحمل أرقاماً أكاديمية أو أسماء (تفصيل التكرارات/اليتامى) تُحفظ في ملف محلي خارج Git ولا تدخل ملف الأدلة المشترك.

## 11. ما بعد التنفيذ — كيف تتدفق النتائج

### 11.1 إلى مصفوفة الفجوات (PORTAL-DATA-IMPORT-GAP-MATRIX-01)
1. كل `query_id` يربط صفاً/خلية في المصفوفة بمعرّفه و`result_sha256` (evidence traceability — شرط G9).
2. تحديث التصنيفات النهائية لكل كيان من القاموس: COMPLETE / PARTIAL / MISSING / CONFLICT / DUPLICATED / ORPHANED / SOURCE_FILE_READY / SOURCE_FILE_PARTIAL / SOURCE_FILE_MISSING / IMPORTER_READY / IMPORTER_MISSING / DECISION_REQUIRED / NOT_APPLICABLE / DO_NOT_IMPORT.
3. كيانات NO_TABLE_FOUND الـ19: تبقى MISSING/NOT_APPLICABLE ما لم يُثبت Q-P1-N18 (learning_materials) وجوداً فعلياً — عندها تُرفع للـlead قبل أي توسيع.
4. تعارضات G3 (A7/A9/A11/A12) وقرارات G4 (الموقوفون، النصاب) تُسجَّل DECISION_REQUIRED وتُجمَّع في PORTAL-DATA-USER-INPUT-REQUIRED-01.md.

### 11.2 إلى backlog (PORTAL-DATA-IMPORT-BACKLOG-01.json)
- `current_count` من عدّادات P1؛ `expected_count` من مجمّعات المصدر (students 1101؛ courses 114 مميز/109 حقيقي؛ rooms 19؛ faculty 18 بلا رقم/بريد ⇒ SOURCE_FILE_PARTIAL)؛ `gap_count = expected − current` (لا سالب — شرط G9).
- `verification_query` لكل عنصر = `query_id` من هذه الحزمة.
- ترتيب الاستيراد يلتزم تسلسل G7 (بنية أكاديمية ← برامج/أنظمة/مستويات ← مقررات ← خطط ← ملفات طلاب ← هيئة تدريس/موظفين ← حسابات للملفات الموجودة فقط ← عروض/شعب ← إسناد ← تسجيل ← درجات ← جداول/قاعات ← تعيينات إدارية)؛ لا READY_TO_IMPORT مع conflict أو dependency ناقصة.

### 11.3 مسار حساب تصنيفات الطلاب (G2) بعد التنفيذ
1. **التطبيع:** طبّق N1–N6 خارجياً على الأرقام الـ1101 (المصدر نظيف: التطبيع محايد، 2 رقم invalid بقيا WRONG_LENGTH ويُستبعدان ⇒ 1099 رقماً صالحاً للمطابقة).
2. **اللقطة أولاً:** نفّذ Q-P2-01 ثم Q-P2-02؛ ثبّت `project_ref`؛ خزّن `snapshot_hash` و`expires_at`.
3. **الحضور:** Q-P2-03 على اتحاد الأرقام ⇒ PRESENT_LINKED / PRESENT_UNLINKED / MISSING_PROFILE.
4. **التكرارات:** Q-P2-04 ⇒ DUPLICATE_IN_PRODUCTION (المصدر DUPLICATE_IN_SOURCE=0 مثبت).
5. **التعارضات:** Q-P2-05 ⇒ PROGRAM/STUDY_SYSTEM/LEVEL/STATUS_MISMATCH؛ Q-P2-06/07 ⇒ CONFLICT (Auth) — وإلا تبقى UNVERIFIED_CHANNEL إن كان auth غير متاح.
6. **ملف الـ566:** Q-P2-09 ⇒ ALREADY_LINKED / READY_TO_CREATE / CONFLICT / STUDENT_NOT_FOUND (INVALID_EMAIL=0, DUPLICATE_*=0 مثبتة مصدرياً).
7. **القاعدة الملزمة (PR#200):** بعد الخصومات (تعارضات Auth + تكرارات إنتاج + قرار الموقوفين):
   - إذا `READY_TO_CREATE === snapshot.unlinked_profiles` ⇒ يسمح بالمتابعة إلى dry-run الإلزامي (DRY_RUN_MISSING = HOLD).
   - إذا اختلف ⇒ **`decision = HOLD_ACCOUNT_IMPORT`** (`BINDING_RULE_VIOLATION`) ولا إنشاء حسابات إطلاقاً. المرجع الموثق (UNVERIFIED_CHANNEL حتى التنفيذ): unlinked=3؛ أي انحراف عن 3 أو عن التطابق يوقف الاستيراد.
8. **اللقطة منتهية** (now() > expires_at) ⇒ `STALE_SNAPSHOT` ⇒ أعد Q-P2-02 قبل أي قرار.
9. الفجوة 255 تُفسَّر بمخرجات Q-P2-08 وتُغلق في التقرير التنفيذي؛ أي متبقٍّ غير مفسَّر ⇒ «يحتاج قراراً بشرياً».

### 11.4 إغلاق الـHOLD
يبقى القرار `HOLD_DATA_REALITY_AUDIT_READONLY_CHANNEL_REQUIRED` قائماً حتى: (أ) تنفيذ كل الاستعلامات بحالة OK أو SKIPPED موثق، (ب) اكتمال traceability في المصفوفة، (ج) حسم القاعدة الملزمة. عندها فقط ينتقل القرار إلى أحد مخرجَي المواصفة (PASS_DATA_REALITY_AUDIT_COMPLETE_IMPORT_BACKLOG_READY أو PASS_WITH_DATA_GAPS_AND_USER_INPUT_REQUIRED) وفق النتائج.

## 12. جرد الاستعلامات

| القسم | النطاق | عدد الاستعلامات |
|---|---|---|
| P1 وجود+كيانات | Q-P1-01..Q-P1-50 (بعضها متعدد العبارات) | 50 بنداً مرقماً |
| P1 بدائل NO_TABLE | Q-P1-N01..Q-P1-N19 | 19 بنداً (17 بها SQL؛ N09 وN14 وN15 ملاحظات/جزئية) |
| P2 طلاب | Q-P2-01..Q-P2-10 | 10 بنود (2 موسومان AUTH-SCHEMA) |
| P3 مقررات وخطط | Q-P3-01..Q-P3-12 | 12 |
| P4 هيئة تدريس وموظفون | Q-P4-01..Q-P4-09 | 9 |
| P5 تشغيل أكاديمي | Q-P5-01..Q-P5-14 | 14 (واحد NOT_APPLICABLE بلا SQL) |
| P6 أنظمة إدارية | Q-P6-01..Q-P6-12 | 12 (واحد موسوم AUTH-SCHEMA) |

**وسوم خاصة:** [AUTH-SCHEMA] على Q-P2-06, Q-P2-07, Q-P6-07. [pgcrypto] على Q-P2-02 (مع بديل خارجي). كل عبارة SQL في هذه الحزمة SELECT-only (SELECT أو WITH…SELECT)؛ لا INSERT/UPDATE/DELETE/DDL؛ الدالة المتطايرة الوحيدة `now()`.

## 13. مرتكزات تعذّر حسمها (أمانة توثيق)

1. `request_processing_roles.app_role_mapping` — اسم العمود الدقيق للـmapping إلى app_role غير مثبت حرفياً في SCHEMA-ANCHORS؛ Q-P4-06 يفترض `app_role_mapping` مع مسار رجوع موثق.
2. `student_profiles.level_id` — غير مثبت في المرتكزات؛ Q-P2-05 يوثق مسار الرجوع `DEFERRED_SCHEMA`.
3. `course_materials` / `course_material_events` — محتملة في مايگريشنز UUID متأخرة غير مؤكدة؛ Q-P1-N18 يحسم الوجود فقط.
4. مفردات `status` (student_profiles/student_requests/official_documents/courses…) غير مثبتة في المرتكزات؛ الاستعلامات تلتقط التوزيعات الفعلية بدل افتراض القيم.
5. الـproject_ref لا يُقرأ عبر SQL قياسي — تأكيده مسؤولية القناة (Q-P2-01).

*نهاية الحزمة — SELECT-only، لا PII، لا كتابة. الإصدار: 01.*
