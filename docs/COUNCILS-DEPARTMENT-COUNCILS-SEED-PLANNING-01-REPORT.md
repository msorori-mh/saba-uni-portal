# COUNCILS-DEPARTMENT-COUNCILS-SEED-PLANNING-01 — تقرير تحليل وتخطيط

**التاريخ:** 2026-07-05  
**النطاق:** تحليل وتخطيط فقط — **لم يُنفَّذ أي** migration / DB / seed / UI / functions.  
**القرار:** **PASS** (مع ملاحظة تحقق قائمة الأقسام عند التنفيذ)

**التوصية التالية:** **READY_FOR_COUNCILS_DEPARTMENT_COUNCILS_SEED_APPLY_PLANNING**

---

## تأكيد النطاق (لم يُنفَّذ)

| العنصر | الحالة |
|--------|--------|
| migrations | ❌ |
| DB / RLS / Storage changes | ❌ |
| UI / server function changes | ❌ |
| إنشاء مجالس / أعضاء / اجتماعات / موضوعات | ❌ |
| seed / import / data writes | ❌ |
| تطبيق migration | ❌ |
| service role في client | ❌ |

**المخرج الوحيد:** هذا التقرير.

---

## 1. الجداول التي تم فحصها

| الجدول | المصدر | الغرض في التحليل |
|--------|--------|------------------|
| `public.departments` | `20260531210958_...sql`, `types.ts` | مصدر الأقسام النشطة |
| `public.academic_councils` | `20260703192337_...sql`, `types.ts` | مجالس الكلية والأقسام |
| `public.academic_council_members` | نفس migration | عضويات (خارج نطاق seed المقترح) |
| `public.faculty_profiles` | مرجع عبر وثائق سابقة | ربط لاحق بالأقسام |

**ملفات التطبيق المُفحوصة (قراءة فقط):**

- `src/routes/admin/academic-councils.tsx`
- `src/lib/admin-councils.functions.ts` (`getCouncilsSummary`)
- `src/lib/faculty-councils.functions.ts` (`getMyAcademicCouncilMembershipsV2` — يعرض `department_name`)

**وثائق seed سابقة:**

- `docs/COUNCILS-ADMIN-SEED-PLANNING-01-REPORT.md`
- `docs/COUNCILS-OPTION-A-SEED-APPLY-01-REPORT.md`
- `docs/COUNCILS-OPTION-A-SEED-VERIFY-01-REPORT.md`

---

## 2. جدول الأقسام — `public.departments`

### الاسم الفعلي

`departments` (لا يوجد جدول بديل).

### الحقول المهمة

| الحقل | النوع | ملاحظة |
|-------|-------|--------|
| `id` | `uuid` PK | المفتاح لربط `academic_councils.department_id` |
| `name_ar` | `text` NOT NULL | الاسم العربي — **أساس التسمية المقترحة** |
| `name_en` | `text` | اختياري — لـ `name_en` في المجلس |
| `is_active` | `boolean` DEFAULT `true` | فلتر الأقسام المؤهلة للمجلس |
| `sort_order` | `integer` | ترتيب عرض فقط |
| `description_ar` / `description_en` | `text` | وصف القسم |
| `image` / `icon` | `text` | وسائط عرض |
| `created_at` / `updated_at` | `timestamptz` | تدقيق |

### حقول **غير موجودة** (مهم)

- **لا يوجد** عمود `code` في `departments` — الاستيراد يستخدم `name_ar` كمفتاح منطقي (`master-templates.ts`).
- **لا يوجد** `college_id` — الكلية مفترضة واحدة ضمن النظام.

### RLS

- العام: SELECT للأقسام النشطة (`is_active = true`).
- Admin: CRUD كامل لـ `admin`.

---

## 3. جدول المجالس — `public.academic_councils`

### الحقول ذات الصلة

| الحقل | النوع | ملاحظة |
|-------|-------|--------|
| `id` | `uuid` PK | يُستخدم في المواضيع والمرفقات والعضويات |
| `name` | `text` NOT NULL | اسم العرض |
| `name_en` | `text` | اختياري |
| `council_type` | `academic_council_type` | `'college'` \| `'department'` |
| `department_id` | `uuid` FK → `departments` | **NULL** لمجلس الكلية؛ **مطلوب** لمجلس القسم |
| `is_active` | `boolean` DEFAULT `true` | لا يوجد enum `status` منفصل |
| `description` | `text` | |
| `settings` | `jsonb` | |
| `created_by` | `uuid` NOT NULL FK → `auth.users` | **إلزامي عند INSERT** |
| `created_at` / `updated_at` | `timestamptz` | |

### قيود schema حرجة

**Trigger `trg_ac_validate_dept` / `tg_councils_validate_department_binding()`:**

```sql
-- council_type = 'department'  → department_id IS NOT NULL
-- council_type = 'college'       → department_id IS NULL
```

**لا يوجد** حالياً `UNIQUE` على `(council_type, department_id)` — منع التكرار يعتمد على منطق seed idempotent (`NOT EXISTS`).

### RLS (INSERT)

- `councils_insert_admin`: `is_council_admin(auth.uid()) AND created_by = auth.uid()`
- seed يُنفَّذ عادةً بـ service role أو حساب admin في SQL يدوي معتمد — خارج نطاق هذه المرحلة.

---

## 4. هل schema يدعم مجالس الأقسام؟

**نعم — بشكل كامل.**

| القدرة | الحالة |
|--------|--------|
| `council_type = 'department'` | ✅ enum موجود |
| ربط `department_id` | ✅ FK + trigger تحقق |
| عزل بالقسم في UI admin | ✅ قسم «مجالس الأقسام» منفصل |
| faculty يعرض اسم القسم | ✅ join `departments(name_ar)` في `faculty-councils.functions.ts` |
| موضوعات + مرفقات | ✅ تعتمد على `council_id` فقط — نفس الآلية لكل مجلس |

---

## 5. حالة مجلس الكلية (لا تعديل)

وفق `COUNCILS-OPTION-A-SEED-VERIFY-01` (قراءة DB سابقة — **لم تُعاد هنا**):

| البند | القيمة المتوقعة |
|-------|-----------------|
| موجود | **نعم** — صف واحد |
| `name` | مجلس الكلية |
| `council_type` | `college` |
| `department_id` | `NULL` |
| `is_active` | `true` |
| `id` (مرجع) | `8a3381c5-77e0-4c84-b0f2-d44be4dbd1a8` |
| تكرار college بدون قسم | **لا** (count = 1) |

**سياسة APPLY اللاحقة:** لا INSERT ولا UPDATE لمجلس الكلية.

---

## 6. مجالس الأقسام — المؤشرات الحالية

### من الوثائق والكود (بدون استعلام production جديد)

| المؤشر | النتيجة |
|--------|---------|
| صفوف `academic_councils` بعد Option A | **1** (مجلس الكلية فقط) |
| `council_type = 'department'` | **0** متوقع |
| seed سابق لمجالس أقسام | **لا** — Option A أدرج college فقط |
| UI admin | `departmentCouncils.length === 0` → «لا توجد مجالس أقسام مفعّلة حالياً» |
| UI faculty | لا يظهر مجلس قسم حتى يُنشأ المجلس **ويُربط** العضو |

### تخطيط سابق (`COUNCILS-ADMIN-SEED-PLANNING-01`)

ذكر **3 أقسام** فعّالة بمعرّفات ثابتة (مرجع تاريخي — **يجب إعادة التحقق** من DB الفعلي):

| name_ar (مرجع) | department_id (مرجع) |
|----------------|----------------------|
| قسم تكنولوجيا المعلومات | `ce485c67-5f7c-498d-b120-4b1130a86ae8` |
| قسم علوم الحاسوب | `11111111-1111-4111-8111-111111111111` |
| قسم نظم المعلومات الحاسوبية | `22222222-2222-4222-8222-222222222222` |

### ملاحظة تسمية (تحقق عند APPLY)

مصادر المشروع تذكر أسماء متباينة:

- `قسم تكنولوجيا المعلومات والاتصالات` (قوالب الاستيراد)
- `قسم نظم المعلومات` vs `قسم نظم المعلومات الحاسوبية`
- «الأمن السيبراني» كبرنامج/محتوى موقع — **ليس مؤكداً** كصف في `departments`

**التوصية:** لا تثبيت أسماء يدوياً في seed — اشتق الاسم من `departments.name_ar` وقت التنفيذ.

---

## 7. استعلامات التحقق المقترحة (للتنفيذ لاحقاً — NOT RUN)

> **لم تُنفَّذ** على production في هذه المرحلة.

### 7.1 عدد الأقسام النشطة

```sql
SELECT count(*) AS active_departments
FROM public.departments
WHERE is_active = true;
```

### 7.2 قائمة الأقسام النشطة

```sql
SELECT id, name_ar, name_en, is_active, sort_order
FROM public.departments
WHERE is_active = true
ORDER BY sort_order, name_ar;
```

### 7.3 عدد مجالس الأقسام

```sql
SELECT count(*) AS department_councils
FROM public.academic_councils
WHERE council_type = 'department';
```

### 7.4 الأقسام التي لها مجلس

```sql
SELECT d.id, d.name_ar, ac.id AS council_id, ac.name AS council_name, ac.is_active
FROM public.departments d
INNER JOIN public.academic_councils ac
  ON ac.department_id = d.id AND ac.council_type = 'department'
WHERE d.is_active = true
ORDER BY d.name_ar;
```

### 7.5 الأقسام **بدون** مجلس (الهدف لـ SEED-APPLY)

```sql
SELECT d.id, d.name_ar, d.name_en
FROM public.departments d
WHERE d.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.academic_councils ac
    WHERE ac.council_type = 'department'
      AND ac.department_id = d.id
  )
ORDER BY d.sort_order, d.name_ar;
```

### 7.6 مجالس أقسام مكررة لنفس `department_id`

```sql
SELECT department_id, count(*) AS council_count,
       array_agg(id ORDER BY created_at) AS council_ids,
       array_agg(name ORDER BY created_at) AS council_names
FROM public.academic_councils
WHERE council_type = 'department'
GROUP BY department_id
HAVING count(*) > 1;
```

### 7.7 مجالس `department` بدون `department_id` (يجب أن تكون 0 — محظور بالـ trigger)

```sql
SELECT id, name, department_id
FROM public.academic_councils
WHERE council_type = 'department'
  AND department_id IS NULL;
```

### 7.8 مجالس مرتبطة بقسم غير موجود أو غير نشط

```sql
-- قسم محذوف منطقياً (لا صف)
SELECT ac.id, ac.name, ac.department_id
FROM public.academic_councils ac
LEFT JOIN public.departments d ON d.id = ac.department_id
WHERE ac.council_type = 'department'
  AND d.id IS NULL;

-- قسم موجود لكن غير نشط
SELECT ac.id, ac.name, ac.department_id, d.name_ar, d.is_active
FROM public.academic_councils ac
INNER JOIN public.departments d ON d.id = ac.department_id
WHERE ac.council_type = 'department'
  AND d.is_active = false;
```

### 7.9 مجلس الكلية (تحقق عدم المساس)

```sql
SELECT id, name, council_type, department_id, is_active
FROM public.academic_councils
WHERE council_type = 'college' AND department_id IS NULL;
-- المتوقع: صف واحد، is_active = true
```

---

## 8. نمط تسمية مجالس الأقسام المقترح

### النمط الأساسي (ديناميكي — موصى به)

```
name_ar للمجلس = 'مجلس ' || departments.name_ar
```

إذا كان `name_ar` للقسم يبدأ بـ «قسم»، الناتج طبيعي:

| `departments.name_ar` | `academic_councils.name` |
|-----------------------|--------------------------|
| قسم علوم الحاسوب | مجلس قسم علوم الحاسوب |
| قسم تكنولوجيا المعلومات والاتصالات | مجلس قسم تكنولوجيا المعلومات والاتصالات |
| قسم نظم المعلومات الحاسوبية | مجلس قسم نظم المعلومات الحاسوبية |

### `name_en` (اختياري)

```
'Department Council — ' || COALESCE(departments.name_en, departments.name_ar)
```

### `description` (اقتراح)

```
'مجلس أكاديمي لـ ' || departments.name_ar || ' — سجل تأسيسي (department council seed)'
```

**لا تُثبَّت** أسماء الأقسام في SQL ثابت — اشتقها من الجدول لتجنب تعارض التسمية بين البيئات.

---

## 9. خطة المرحلة اللاحقة — `COUNCILS-DEPARTMENT-COUNCILS-SEED-APPLY-01`

### النطاق

| يُنشأ | لا يُنشأ / لا يُعدَّل |
|-------|---------------------|
| صفوف `academic_councils` لأقسام **ناقصة** فقط | مجلس الكلية |
| | `academic_council_members` |
| | اجتماعات / موضوعات / قرارات / محاضر |
| | تعطيل أو حذف مجالس موجودة |

### SQL مقترح (idempotent — للمراجعة قبل التنفيذ)

```sql
-- COUNCILS-DEPARTMENT-COUNCILS-SEED-APPLY-01 (مقترح — لم يُنفَّذ)
INSERT INTO public.academic_councils (
  name,
  name_en,
  council_type,
  department_id,
  description,
  is_active,
  created_by
)
SELECT
  'مجلس ' || d.name_ar,
  'Department Council — ' || COALESCE(NULLIF(trim(d.name_en), ''), d.name_ar),
  'department'::public.academic_council_type,
  d.id,
  'مجلس أكاديمي لـ ' || d.name_ar || ' — سجل تأسيسي (department council seed)',
  true,
  :created_by_admin_uuid   -- نفس نمط Option A: user_id لحساب admin/system_admin للتدقيق فقط
FROM public.departments d
WHERE d.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.academic_councils ac
    WHERE ac.council_type = 'department'
      AND ac.department_id = d.id
  );
```

### ضوابط الأمان

1. **Idempotent:** `NOT EXISTS` على `(council_type='department', department_id)`.
2. **لا تكرار:** إعادة التشغيل لا تُضيف صفوفاً جديدة لقسم له مجلس.
3. **لا مساس بمجلس الكلية:** الاستعلام يستهدف `department` فقط.
4. **Trigger schema:** يرفض تلقائياً `department` بدون `department_id`.
5. **`created_by`:** NOT NULL — يحتاج `user_id` admin مؤكد (نفس نمط `b522b4c7-...` في Option A أو استعلام حي).
6. **لا أعضاء:** العضويات تبقى يدوية من `/admin/academic-councils`.
7. **موافقة بشرية:** يُفضَّل تقرير VERIFY قبل/بعد يشغّل استعلامات §7.

### تحسين اختياري (مرحلة DB لاحقة — خارج APPLY)

```sql
CREATE UNIQUE INDEX uq_ac_department_council
  ON public.academic_councils (department_id)
  WHERE council_type = 'department' AND department_id IS NOT NULL;
```

يمنع التكرار على مستوى DB — غير موجود حالياً.

---

## 10. أثر ذلك على العضويات والبوابات

### بعد إنشاء مجالس الأقسام (بدون أعضاء)

| المسار | السلوك |
|--------|--------|
| `/admin/academic-councils` | قسم «مجالس الأقسام» يعرض بطاقة لكل مجلس جديد؛ KPI أعضاء = 0 |
| إدارة العضويات | الأدمن يربط chair / secretary / member / viewer يدوياً (`linkCouncilMembership`) |
| `/faculty-portal/academic-councils` | **لا يظهر** مجلس القسم للعضو حتى تُنشأ عضوية فعّالة له |
| تقديم موضوع + مرفقات | يعمل على أي `council_id` بعد الربط — نفس `submitCouncilTopic` ومرفقات DB-01 |

### عزل القسم

- RLS يعزل بالمجلس (`council_id`) وليس بالقسم مباشرة.
- UI admin يفلتر بحث الأكاديميين حسب `faculty_profiles.department_id` لمجالس الأقسام (`COUNCILS-MEMBERSHIP-ADMIN-LINKING-DESIGN-01`).

---

## 11. عرض لوحة الإدارة (الوضع الحالي)

`getCouncilsSummary` (`admin-councils.functions.ts`):

- يقرأ كل `academic_councils` عبر `supabaseAdmin`.
- يُرتب حسب `council_type` ثم `name`.

`academic-councils.tsx`:

- `collegeCouncils` = `council_type === 'college'`
- `departmentCouncils` = `council_type === 'department'`
- empty state للأقسام عند length = 0
- auto-select عند مجلس واحد فقط (حالياً مجلس الكلية)

**لا حاجة لتعديل UI** لظهور مجالس الأقسام بعد seed — المنطق جاهز.

---

## 12. المخاطر

| # | المخاطرة | الشدة | التخفيف |
|---|----------|-------|---------|
| R-01 | تكرار مجلس لنفس القسم | Medium | `NOT EXISTS` في seed؛ unique index اختياري لاحقاً |
| R-02 | أسماء أقسام مختلفة بين البيئات | Medium | تسمية ديناميكية من `name_ar` |
| R-03 | قسم نشط في DB لكن غير مرغوب في مجلس | Low | مراجعة استعلام §7.5 قبل APPLY |
| R-04 | `created_by` غير صالح | High | التحقق من `auth.users` + `user_roles` قبل seed |
| R-05 | توقع ظهور faculty دون عضويات | Low | توثيق: seed مجالس ≠ seed عضويات |
| R-06 | خلط برامج (مثل الأمن السيبراني) بأقسام | Medium | الاعتماد على `departments` لا `programs` |
| R-07 | تعديل مجلس الكلية بالخطأ | High | استبعاد صريح في SQL؛ تحقق §7.9 |

---

## 13. NEEDS_USER_INPUT (اختياري عند APPLY — لا يمنع التخطيط)

| # | السؤال | متى يُحسم |
|---|--------|-----------|
| Q-01 | هل كل `departments.is_active=true` يستحق مجلساً؟ | قبل SEED-APPLY |
| Q-02 | هل نبدأ بقسم واحد (pilot) أم كل الأقسام النشطة؟ | قرار إداري |
| Q-03 | `user_id` لـ `created_by` في بيئة الهدف | وقت التنفيذ |
| Q-04 | تأكيد القائمة النهائية للأقسام (3 vs 4+) | استعلام §7.2 على DB الفعلي |

**القرار PASS** لأن schema واضح والخطة idempotent ممكنة؛ Q-01…Q-04 تُحل عند APPLY وليس عند التخطيط.

---

## 14. الخلاصة

| البند | القرار |
|-------|--------|
| **القرار** | **PASS** |
| **Schema يدعم مجالس الأقسام** | ✅ |
| **مجلس الكلية** | موجود (Option A) — لا مساس |
| **مجالس أقسام حالياً** | **لا مؤشرات** — متوقع 0 صف `department` |
| **التوصية** | **READY_FOR_COUNCILS_DEPARTMENT_COUNCILS_SEED_APPLY_PLANNING** |
| **المرحلة التالية** | `COUNCILS-DEPARTMENT-COUNCILS-SEED-APPLY-01` (+ VERIFY) بعد موافقة واستعلامات §7 |

---

*نهاية التقرير — COUNCILS-DEPARTMENT-COUNCILS-SEED-PLANNING-01*
