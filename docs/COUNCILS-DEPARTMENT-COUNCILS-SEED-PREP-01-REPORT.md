# COUNCILS-DEPARTMENT-COUNCILS-SEED-PREP-01 — تقرير تجهيز Seed Migration

**التاريخ:** 2026-07-05  
**النطاق:** إنشاء ملف migration داخل المستودع فقط — **لم يُطبَّق على Supabase**.  
**القرار:** **PASS**

**التوصية التالية:** **READY_FOR_COUNCILS_DEPARTMENT_COUNCILS_SEED_PREP_PR**

**المرجع:** `docs/COUNCILS-DEPARTMENT-COUNCILS-SEED-PLANNING-01-REPORT.md`

---

## ملخص

تم تجهيز migration idempotent لإنشاء **مجالس الأقسام الناقصة فقط** من `public.departments` النشطة إلى `public.academic_councils`، دون مساس بمجلس الكلية ودون إنشاء عضويات أو بيانات تشغيلية.

---

## ملف Migration

| البند | القيمة |
|-------|--------|
| **المسار** | `supabase/migrations/20260709120000_department_councils_seed.sql` |
| **المعرّف** | `COUNCILS-DEPARTMENT-COUNCILS-SEED-PREP-01` |
| **طُبِّق على Supabase؟** | **لا** |
| **أوامر DROP** | **لا** — الملف خالٍ من `DROP` |

---

## ماذا تنشئ الـ migration

### المصدر

```sql
FROM public.departments d
WHERE d.is_active = true
```

### الهدف

```sql
INSERT INTO public.academic_councils (
  name, name_en, council_type, department_id,
  description, is_active, created_by
)
```

### الحقول (من schema الفعلي `20260703192337_...`)

| الحقل | القيمة |
|-------|--------|
| `name` | `'مجلس ' \|\| d.name_ar` |
| `name_en` | `'Department Council — ' \|\| COALESCE(name_en, name_ar)` |
| `council_type` | `'department'::academic_council_type` |
| `department_id` | `d.id` |
| `description` | سجل تأسيسي عربي |
| `is_active` | `true` |
| `created_by` | أول `system_admin` أو `admin` من `user_roles` |
| `settings` | default `'{}'` (لا يُمرَّر) |
| `created_at` / `updated_at` | defaults `now()` |

**لا يُنشئ:** `academic_council_members`، اجتماعات، موضوعات، قرارات، محاضر.

---

## Idempotency ومنع التكرار

```sql
AND NOT EXISTS (
  SELECT 1
  FROM public.academic_councils ac
  WHERE ac.council_type = 'department'
    AND ac.department_id = d.id
)
```

- مجلس واحد كحد أقصى لكل `department_id` (بغض النظر عن `is_active` للمجلس الموجود).
- إعادة تشغيل الـ migration لا تُضيف صفوفاً مكررة.
- **لا** `UNIQUE` constraint جديد — الاعتماد على `NOT EXISTS` فقط (كما في التخطيط).

### سلوك آمن عند غياب admin

إذا لم يوجد `system_admin` أو `admin` في `user_roles`:

- لا INSERT.
- `RAISE NOTICE` يوضح التخطي.
- لا فشل للـ migration بالكامل.

---

## عدم لمس مجلس الكلية

- الاستعلام يستهدف `council_type = 'department'` فقط.
- **لا** UPDATE / DELETE على أي صف.
- **لا** INSERT لـ `council_type = 'college'`.
- مجلس الكلية الحالي (`college`, `department_id IS NULL`) يبقى دون تغيير.

---

## العضويات والربط اليدوي

| البند | السياسة |
|-------|---------|
| إنشاء عضويات تلقائياً | **لا** |
| ربط رئيس القسم | يدوياً من `/admin/academic-councils` |
| ربط أعضاء مجلس القسم | يدوياً من الأدمن |
| رئيس القسم في مجلسين | يمكن ربطه يدوياً بمجلس قسمه **و** مجلس الكلية |
| عضو هيئة التدريس | يرى فقط المجالس التي ربطه الأدمن بها في `academic_council_members` |

بعد تطبيق الـ migration: تظهر بطاقات مجالس الأقسام في لوحة الإدارة بـ **0 أعضاء** حتى الربط اليدوي.

---

## الاختبارات المحلية

| الاختبار | النتيجة |
|----------|---------|
| SQL على DB | **NOT RUN** — لا اتصال Supabase |
| `npm run build` | **PASS** (exit 0) |
| `npx tsc --noEmit` | **PASS** (exit 0) |

---

## استعلامات التحقق بعد التطبيق (NOT RUN — للمرحلة VERIFY)

### عدد الأقسام النشطة

```sql
SELECT count(*) AS active_departments
FROM public.departments
WHERE is_active = true;
```

### عدد مجالس الأقسام

```sql
SELECT count(*) AS department_councils
FROM public.academic_councils
WHERE council_type = 'department';
```

### الأقسام بدون مجلس

```sql
SELECT d.id, d.name_ar
FROM public.departments d
WHERE d.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.academic_councils ac
    WHERE ac.council_type = 'department' AND ac.department_id = d.id
  );
-- المتوقع بعد seed ناجح: 0 صفوف
```

### مجالس مكررة لنفس القسم

```sql
SELECT department_id, count(*) AS n
FROM public.academic_councils
WHERE council_type = 'department'
GROUP BY department_id
HAVING count(*) > 1;
-- المتوقع: 0
```

### مجالس department بدون department_id

```sql
SELECT id, name FROM public.academic_councils
WHERE council_type = 'department' AND department_id IS NULL;
-- المتوقع: 0 (trigger يرفض INSERT أصلاً)
```

### مجالس مرتبطة بقسم غير نشط

```sql
SELECT ac.id, ac.name, d.name_ar, d.is_active
FROM public.academic_councils ac
JOIN public.departments d ON d.id = ac.department_id
WHERE ac.council_type = 'department' AND d.is_active = false;
-- المتوقع: 0 (seed يقرأ active فقط)
```

### مجلس الكلية لم يتغير

```sql
SELECT id, name, council_type, department_id, is_active
FROM public.academic_councils
WHERE council_type = 'college' AND department_id IS NULL;
-- المتوقع: صف واحد، نفس id السابق
```

### عدم إنشاء عضويات

```sql
SELECT count(*) FROM public.academic_council_members;
-- المتوقع: نفس العدد قبل seed (غالباً 0 أو العدد الحالي دون زيادة)
```

---

## تأكيدات النطاق

| العنصر | الحالة |
|--------|--------|
| تطبيق migration على Supabase | ❌ **لا** |
| `supabase db push` / `db reset` | ❌ |
| data writes فعلية | ❌ |
| seed مطبّق | ❌ |
| UI / server function changes | ❌ |
| RLS / Storage changes | ❌ |
| إنشاء عضويات | ❌ |
| اجتماعات / موضوعات / قرارات | ❌ |
| تعديل مجلس الكلية | ❌ |
| service role في client | ❌ |
| لمس `src/routeTree.gen.ts` | ❌ |

---

## المرحلة التالية

1. **PR:** `READY_FOR_COUNCILS_DEPARTMENT_COUNCILS_SEED_PREP_PR`
2. بعد الدمج والتطبيق المعتمد: `COUNCILS-DEPARTMENT-COUNCILS-SEED-VERIFY-01` (استعلامات § أعلاه)
3. ثم ربط العضويات يدوياً من `/admin/academic-councils`

---

*نهاية التقرير — COUNCILS-DEPARTMENT-COUNCILS-SEED-PREP-01*
