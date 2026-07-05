# COUNCILS-MEETINGS-RLS-APPLY-01 — تقرير التطبيق

**التاريخ:** 2026-07-05
**القرار:** **PASS**
**التوصية التالية:** **READY_FOR_COUNCILS_MEETINGS_ADMIN_UI_01**

---

## Migration المطبقة

- `supabase/migrations/20260710120000_council_meeting_schedule_helpers.sql` — **الوحيدة** المطبَّقة في هذه المرحلة.

---

## Pre-check

| البند | النتيجة |
|-------|---------|
| وجود الملف | ✅ |
| خلوّه من `DROP POLICY`/`DROP FUNCTION`/`DROP TABLE` | ✅ |
| migration معلقة وحيدة = `20260710120000_...` | ✅ (بقية الملفات في `supabase/migrations/` مطبَّقة سابقاً — helper و policies السابقة `can_write_council_agenda` مؤكَّدة على meetings قبل التطبيق) |

---

## Post-check (read-only)

### 1. وجود الدالة

```
proname                       | args
------------------------------+---------------------------
can_schedule_council_meeting  | _user uuid, _council uuid
```

✅ موجودة.

### 2. `academic_council_meetings` — السياسات بعد التطبيق

| السياسة | qual | with_check |
|---------|------|------------|
| `meetings_insert` | — | `can_schedule_council_meeting(auth.uid(), council_id) AND created_by = auth.uid()` ✅ |
| `meetings_update` | `can_schedule_council_meeting(auth.uid(), council_id)` ✅ | `can_schedule_council_meeting(auth.uid(), council_id)` ✅ |
| `meetings_select` | لم تتغير ✅ | — |

### 3. `academic_council_agenda_items` — لم تتغير

جميع سياسات الأجندة (`agenda_insert`, `agenda_update`, `agenda_select`) لا تزال تستخدم `can_write_council_agenda` كما هي. ✅

### 4. استخدام `can_write_council_agenda` على `academic_council_meetings`

لم يعد مستخدماً في `meetings_insert` ولا `meetings_update`. ✅
يبقى مستخدماً حصراً على `academic_council_agenda_items` (الأجندة) كما هو مطلوب.

---

## تأكيدات النطاق

| العنصر | الحالة |
|--------|--------|
| migrations إضافية غير `20260710120000` | ❌ لم تُطبَّق |
| data writes / seed | ❌ |
| إنشاء اجتماعات اختبارية | ❌ |
| تعديل عضويات / حذف / cleanup | ❌ |
| UI changes / server function / route changes | ❌ |
| Storage changes | ❌ |
| service role في المتصفح | ❌ |
| Email / Cron | ❌ |

---

## ملاحظات

- Security linter أعاد 174 تنبيهاً مسبق الوجود على مستوى المشروع (غير مرتبطة بهذه migration).
- الأثر الوظيفي: جدولة/تعديل الاجتماعات محصورة الآن على admin/system_admin + chair على نفس `council_id`؛ secretary/member/viewer لم يعودوا قادرين على `INSERT`/`UPDATE` اجتماعات. صلاحيات الأجندة لأمين السر لم تنكسر.

---

## المرحلة التالية

**READY_FOR_COUNCILS_MEETINGS_ADMIN_UI_01**

---

*نهاية التقرير — COUNCILS-MEETINGS-RLS-APPLY-01*
