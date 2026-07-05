# COUNCILS-MEETINGS-RLS-HELPERS-01 — تقرير

**التاريخ:** 2026-07-05  
**القرار:** **PASS**  
**التوصية التالية:** **READY_FOR_COUNCILS_MEETINGS_RLS_HELPERS_PR**

---

## تأكيد النطاق

| العنصر | الحالة |
|--------|--------|
| تطبيق migration / db push / Supabase writes | ❌ |
| seed / data writes / service role | ❌ |
| UI / server functions / routes | ❌ |
| DROP POLICY / DROP FUNCTION / DROP TABLE | ❌ |

**المخرجات:** migration جديدة + هذا التقرير فقط.

---

## Migration المنشأة

`supabase/migrations/20260710120000_council_meeting_schedule_helpers.sql`

---

## Helpers المضافة

### `can_schedule_council_meeting(_user uuid, _council uuid)`

| الخاصية | القيمة |
|---------|--------|
| النمط | `SECURITY DEFINER`, `STABLE`, `SET search_path = public` |
| admin / system_admin | ✅ عبر `is_council_admin(_user)` |
| chair على نفس `council_id` | ✅ عبر `has_council_role(..., 'chair')` |
| secretary / member / viewer | ❌ |
| العضوية الفعالة | `is_active = true` و `active_to IS NULL OR active_to > CURRENT_DATE` (نفس `has_council_role`) |
| الجدول | `academic_council_members` *(وليس `academic_council_memberships`)* |

**ملاحظة:** التوقيع يتبع نمط المشروع `(_user, _council)` مثل `can_manage_council` و`can_write_council_agenda`؛ السياسات تستدعي `can_schedule_council_meeting(auth.uid(), council_id)`.

**المنطق:** مطابق لـ `can_manage_council` — منفصل دلالياً لجدولة الاجتماعات دون ربطه بصلاحيات الأجندة.

---

## السياسات المعدّلة

| السياسة | الجدول | قبل | بعد |
|---------|--------|-----|-----|
| `meetings_insert` | `academic_council_meetings` | `can_write_council_agenda` | `can_schedule_council_meeting` |
| `meetings_update` | `academic_council_meetings` | `can_write_council_agenda` | `can_schedule_council_meeting` |

**آلية التعديل:** `DO` block + `ALTER POLICY` عند وجود السياسة، أو `CREATE POLICY` idempotent — **بدون** `DROP POLICY`.

### سياسات لم تُمس

| السياسة | السبب |
|---------|--------|
| `meetings_select` | المتطلب: لا تغيير قراءة |
| `agenda_insert` / `agenda_update` | secretary يبقى على `can_write_council_agenda` |
| `topics_*`, `minutes_*`, `decisions_*` | خارج نطاق هذه المرحلة |

---

## تأكيدات الصلاحيات

### جدولة الاجتماعات — admin + chair فقط

| السيناريو | النتيجة المتوقعة |
|-----------|------------------|
| admin / system_admin يجدول أي مجلس | ✅ |
| chair على مجلس الكلية يجدول مجلس الكلية | ✅ |
| chair على مجلس قسم يجدول مجلس قسمه فقط | ✅ (عزل `council_id`) |
| chair على قسم A يحاول جدولة مجلس قسم B | ❌ |
| secretary يُنشئ اجتماعاً (`INSERT`) | ❌ |
| secretary يُحدّث اجتماعاً (`UPDATE`) | ❌ |
| member يُنشئ/يُحدّث اجتماعاً | ❌ |
| viewer يُنشئ/يُحدّث اجتماعاً | ❌ |

### جدول الأعمال — لم يُكسر

| السيناريو | النتيجة |
|-----------|---------|
| secretary يُدرج/يُحدّث `academic_council_agenda_items` | ✅ (لا تغيير — `can_write_council_agenda`) |
| chair/admin يُدرج/يُحدّث الأجندة | ✅ |

---

## التحقق من الملفات

```text
grep -i "DROP POLICY\|DROP FUNCTION\|DROP TABLE" migration → لا نتائج
grep "can_schedule_council_meeting" migration → helper + policies
grep "can_write_council_agenda" migration (meetings) → لا استخدام على meetings
```

**agenda policies:** لا تزال تستخدم `can_write_council_agenda` في الملف الأصلي `20260703192337_...sql` — لم تُعدَّل.

---

## build / typecheck

| الأمر | النتيجة |
|-------|---------|
| `npm run build` | ✅ نجح (exit 0) |
| `npx tsc --noEmit` | ✅ نجح (exit 0) |

**ملفات هذه المرحلة فقط (untracked):**

- `supabase/migrations/20260710120000_council_meeting_schedule_helpers.sql`
- `docs/COUNCILS-MEETINGS-RLS-HELPERS-01-REPORT.md`

لا تغييرات UI/server/routes — `src/routeTree.gen.ts` تغيّر محلياً من `npm run build` وخارج نطاق هذه المرحلة.

---

## المخاطر والملاحظات

| # | ملاحظة |
|---|--------|
| N-01 | `meetings_update` يقيّد **كل** تحديثات الاجتماع على admin+chair؛ secretary لا يستطيع فتح/إغلاق الاستقبال عبر `UPDATE` حتى مرحلة لاحقة (مثلاً `can_operate_council_meeting`). |
| N-02 | `vice_chair` لا يجدول — فقط `chair` صراحةً. |
| N-03 | `can_schedule_council_meeting` ≡ `can_manage_council` منطقياً؛ الفصل للوضوح ولتوسعات مستقبلية. |
| N-04 | يجب تطبيق migration عبر pipeline المعتمد قبل اختبار RLS فعلياً على Supabase. |

---

## المرحلة التالية المقترحة

1. **PR:** `READY_FOR_COUNCILS_MEETINGS_RLS_HELPERS_PR` — مراجعة وتطبيق migration.
2. **COUNCILS-MEETINGS-ADMIN-FUNCTIONS-01** — دوال جدولة وفتح/إغلاق استقبال في admin.
3. **COUNCILS-MEETINGS-OPERATIONS-RLS-01** *(اختياري)* — فصل `UPDATE` التشغيلي (intake/status) عن الجدولة إذا رُغب بصلاحية secretary للتشغيل دون الجدولة.

---

*نهاية التقرير — COUNCILS-MEETINGS-RLS-HELPERS-01*
