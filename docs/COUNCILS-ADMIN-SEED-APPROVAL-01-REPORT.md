# COUNCILS-ADMIN-SEED-APPROVAL-01 — تقرير اعتماد Seed محدود (الخيار A)

- المرحلة: **اعتماد فقط (Approval-only)** — لم يُنفَّذ أي SQL.
- المرجع: `docs/COUNCILS-ADMIN-SEED-PLANNING-01-REPORT.md` (PASS WITH NOTES).
- النطاق المعتمد: **الخيار A فقط** — إنشاء سجل مجلس الكلية كسجل تأسيسي، بدون أي عضويات أو بيانات تشغيلية.

---

## 1) السجل الوحيد المقترح إنشاؤه

سجل واحد فقط في جدول `public.academic_councils`:

| الحقل | القيمة المقترحة |
|---|---|
| `id` | `gen_random_uuid()` |
| `name` | `مجلس الكلية` |
| `name_en` | `College Council` |
| `council_type` | `'college'` |
| `department_id` | `NULL` (مجلس على مستوى الكلية، لا يخص قسماً) |
| `description` | `المجلس الأعلى الأكاديمي على مستوى الكلية — سجل تأسيسي (Seed A).` |
| `settings` | `'{}'::jsonb` (افتراضي) |
| `is_active` | `true` |
| `created_by` | `NULL` (seed إداري، لا مستخدم منفذ) |
| `updated_by` | `NULL` |
| `created_at` | `now()` |
| `updated_at` | `now()` |

---

## 2) قائمة التحقق

| البند | القيمة |
|---|---|
| اسم المجلس | مجلس الكلية |
| نوع المجلس | `college` |
| الحالة | فعّال (`is_active = true`) |
| هل يحتاج `department_id`؟ | **لا** — NULL لأن المجلس على مستوى الكلية |
| هل يحتاج أعضاء؟ | **لا** — لا إدراج في `academic_council_members` |
| هل يحتاج `user_ids`؟ | **لا** — لا ربط بأي حساب |
| هل ستُنشأ اجتماعات؟ | **لا** — لا إدراج في `academic_council_meetings` |
| هل ستُنشأ قرارات؟ | **لا** — لا إدراج في `academic_council_decisions` |
| هل ستُنشأ موضوعات/جدول أعمال/محاضر/مرفقات؟ | **لا** لأي منها |
| هل يُرسل إيميل/تنبيه؟ | **لا** |
| هل يُعدَّل RLS/Storage/Cron/كود/واجهة؟ | **لا** |
| هل التنفيذ آمن؟ | **نعم** — INSERT واحد على جدول محمي بـ RLS، بدون ربط بحسابات، قابل للحذف بسهولة |

---

## 3) SQL المقترح للتنفيذ لاحقاً (لم يُنفَّذ الآن)

الأداة المقترحة لاحقاً: `supabase--insert` (تعديل بيانات فقط، بدون migration).

```sql
-- COUNCILS-ADMIN-SEED-APPLY-01 (لاحقاً)
-- سجل تأسيسي واحد لمجلس الكلية. بدون أعضاء، بدون بيانات تشغيلية.
INSERT INTO public.academic_councils (
  name,
  name_en,
  council_type,
  department_id,
  description,
  settings,
  is_active
)
SELECT
  'مجلس الكلية',
  'College Council',
  'college',
  NULL,
  'المجلس الأعلى الأكاديمي على مستوى الكلية — سجل تأسيسي (Seed A).',
  '{}'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.academic_councils
  WHERE council_type = 'college' AND department_id IS NULL
);
```

ملاحظات على الـ SQL:
- **Idempotent**: شرط `NOT EXISTS` يمنع الازدواج إذا نُفّذ أكثر من مرة.
- **لا `id` صريح**: يعتمد على `DEFAULT gen_random_uuid()` في الـ schema.
- **لا `created_by`/`updated_by`**: تبقى `NULL` (seed إداري).
- **لا ملامسة لأي جدول آخر** من الجداول السبعة.

### التحقق بعد التنفيذ (للمرحلة التالية فقط)

```sql
SELECT id, name, council_type, department_id, is_active
FROM public.academic_councils;
-- المتوقع: صف واحد فقط، college, department_id = NULL, is_active = true

SELECT count(*) FROM public.academic_council_members;      -- المتوقع: 0
SELECT count(*) FROM public.academic_council_meetings;     -- المتوقع: 0
SELECT count(*) FROM public.academic_council_agenda_items; -- المتوقع: 0
SELECT count(*) FROM public.academic_council_topics;       -- المتوقع: 0
SELECT count(*) FROM public.academic_council_minutes;      -- المتوقع: 0
SELECT count(*) FROM public.academic_council_decisions;    -- المتوقع: 0
```

### مسار التراجع (Rollback)

```sql
DELETE FROM public.academic_councils
WHERE council_type = 'college'
  AND department_id IS NULL
  AND description LIKE '%Seed A%';
```

آمن لأنه لا توجد عضويات/اجتماعات/قرارات مرتبطة بهذا السجل.

---

## 4) المخاطر

| # | المخاطرة | الشدة | الحالة |
|---|---|---|---|
| R-01 | ازدواج السجل عند إعادة التنفيذ | Low | مُخفَّف عبر `WHERE NOT EXISTS` |
| R-02 | ظهور المجلس في الواجهة بدون أعضاء | Low (متوقع ومقصود) | الواجهة تعرض "الأعضاء: 0" وهو صحيح |
| R-03 | تسرّب صلاحيات لمستخدم | None | لا `user_ids`، لا `members`، RLS مفعّل، anon محذوف |
| R-04 | تأثير على مسارات أخرى | None | INSERT واحد في جدول معزول |

**لا يوجد Blocker أو High.**

---

## 5) ما لم يُنفَّذ (تأكيد صريح)

- ❌ لم يُنفَّذ أي SQL في هذه المرحلة.
- ❌ لا INSERT/UPDATE/DELETE فعلي.
- ❌ لا مجالس أقسام (الخيار B/C مرفوض حالياً).
- ❌ لا أعضاء / لا user_ids.
- ❌ لا اجتماعات / موضوعات / قرارات / محاضر / مرفقات.
- ❌ لا migration جديد.
- ❌ لا تعديل RLS / Storage / Email / Cron / كود / واجهة / نشر.
- ❌ لا تفعيل أزرار الكتابة.
- ❌ لا توسيع Pilot.

---

## 6) التوصية

**READY FOR OPTION-A-SEED-APPLY**

الخطوة التالية المقترحة: `COUNCILS-ADMIN-SEED-APPLY-01` — تنفيذ الـ INSERT الوحيد أعلاه عبر أداة `supabase--insert` بعد موافقتك الصريحة النهائية.

---

## القرار النهائي

**PASS** — خطة اعتماد آمنة ومحدودة تماماً بنطاق الخيار A. جاهزة للتنفيذ عند إصدار أمر التطبيق.
