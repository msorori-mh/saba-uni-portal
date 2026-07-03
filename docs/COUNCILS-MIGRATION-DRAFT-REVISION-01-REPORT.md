# COUNCILS-MIGRATION-DRAFT-REVISION-01 — تقرير تعديل مسودة SQL

> **مرحلة تعديل مسودة فقط.** لم يُطبَّق migration، ولم يُنقل الملف إلى `supabase/migrations/`، ولم يُشغَّل SQL على أي قاعدة بيانات، ولم تُعدَّل DB/RLS/Storage/Triggers فعلياً، ولم تُضف seed data، ولم يُعدَّل كود الواجهة.

**الملف المعدَّل:** `docs/drafts/20260703000000_councils_mvp_schema_rls.draft.sql`  
**مراجع:** `COUNCILS-MIGRATION-SQL-REVIEW-01-REPORT.md` (قرار: **PASS WITH NOTES** — 3 فجوات NEEDS REVISION)

---

## 1. ملخص التنفيذ

| السؤال | الجواب |
|--------|--------|
| هل تم تطبيق migration؟ | **لا** |
| هل تم تشغيل SQL؟ | **لا** |
| هل تم تعديل DB فعلياً؟ | **لا** |
| هل تم تعديل RLS فعلياً؟ | **لا** |
| هل تم تعديل Storage؟ | **لا** |
| هل تم تعديل Triggers على قاعدة حقيقية؟ | **لا** |
| هل تم نقل الملف إلى `supabase/migrations/`؟ | **لا** |
| هل تم تعديل كود الواجهة؟ | **لا** |

---

## 2. ما الذي تم تعديله في مسودة SQL

تمت معالجة **الفجوات الثلاث** المحددة في §13 من تقرير المراجعة الساكنة:

| # | الفجوة | الإجراء |
|---|--------|---------|
| 1 | غياب `GRANT EXECUTE` للـ helper functions | إضافة `REVOKE ALL ... FROM PUBLIC` ثم `GRANT EXECUTE ... TO authenticated, service_role` للدوال الخمس |
| 2 | `UNIQUE` مع `academic_year_id IS NULL` | إزالة القيد على مستوى الجدول؛ استبداله بفهرسين unique جزئيين |
| 3 | `decisions_update` واسع لـ `responsible_user_id` | إزالة `responsible_user_id` من سياسة التحديث؛ الإبقاء على SELECT فقط للمسؤول |

تحديث ترويسة الملف لتضمين مرحلة `COUNCILS-MIGRATION-DRAFT-REVISION-01`.

---

## 3. GRANT EXECUTE — كيف عُولج

بعد تعريف الدوال الخمس (`is_council_admin`, `is_council_member`, `has_council_role`, `can_manage_council`, `can_write_council_agenda`) وقبل قسم RLS:

```sql
REVOKE ALL ON FUNCTION public.<fn>(...) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.<fn>(...) TO authenticated, service_role;
```

**المنطق:**

- سياسات RLS تستدعي هذه الدوال داخل تعبيرات `USING` / `WITH CHECK` — بدون `EXECUTE` لـ `authenticated` قد تفشل السياسات عند التشغيل (نمط المشروع: migration `20260531210002` لـ `has_role`).
- **لا منح لـ `anon`** — المسودة لا تفتح المجالس للوصول العام.
- **`service_role`** مُمنَح للعمليات الإدارية عبر Supabase (متسق مع بقية الجداول).
- **`REVOKE FROM PUBLIC`** يمنع تنفيذاً افتراضياً أوسع من المطلوب.

الدالة `public.has_role` (مستخدمة داخل `is_council_admin`) لها منح سابق في migrations القائمة — لم تُعدَّل.

---

## 4. UNIQUE مع `academic_year_id = NULL` — كيف عُولج

**الحل المختار:** فهارس unique جزئية (partial unique indexes) — **وليس** جعل `academic_year_id NOT NULL`.

**السبب (الأقل خطراً للـ MVP):**

- جعل `academic_year_id NOT NULL` يفرض ربط كل اجتماع بسنة أكاديمية عند الإدراج، بما في ذلك الاجتماعات المسودة أو قبل تحديد السنة — تغيير سلوكي أوسع قد يعيق سير العمل المبكر.
- الفهارس الجزئية تحافظ على إمكانية `NULL` (كما في التصميم الأصلي) مع فرض التفرد بشكل صحيح في كلا الحالتين.

**التطبيق:**

1. إزالة `UNIQUE (council_id, academic_year_id, meeting_number)` من `CREATE TABLE academic_council_meetings`.
2. إضافة:
   - `idx_acmeet_council_year_number` — `(council_id, academic_year_id, meeting_number) WHERE academic_year_id IS NOT NULL`
   - `idx_acmeet_council_number_without_year` — `(council_id, meeting_number) WHERE academic_year_id IS NULL`

بهذا لا يمكن تكرار `meeting_number` لنفس المجلس ضمن نفس السنة، ولا تكراره لعدة صفوف بدون سنة أكاديمية.

---

## 5. `decisions_update` — كيف عُولج

**الحل المختار:** إزالة `OR responsible_user_id = auth.uid()` من سياسة `decisions_update` (الخيار الأكثر أماناً للـ MVP).

**السبب:**

- بدون جدول `academic_council_decision_followups` (مؤجَّل)، السماح للمسؤول بالتحديث عبر RLS يفتح تعديل **كل** حقول القرار (عنوان، نص، رقم، حالة) — لا يمكن تقييد الأعمدة في `CREATE POLICY` وحدها.
- trigger لحماية الأعمدة الجوهرية ممكن لاحقاً لكنه يزيد التعقيد قبل وجود نموذج متابعة واضح.
- في MVP: **المسؤول يرى قراراته** (`decisions_select` ما زالت تتضمن `responsible_user_id = auth.uid()`)؛ **التحديث** يقتصر على `can_write_council_agenda` (رئيس/أمين سر/مسؤول نظام).

**المتابعة التنفيذية للمسؤول:** تُؤجَّل إلى `COUNCILS-DECISIONS-FOLLOWUP-01` عبر جدول `academic_council_decision_followups` أو دوال server — خارج نطاق هذه المرحلة.

---

## 6. تحقق من عدم التوسع (خارج النطاق)

| البند | الحالة بعد التعديل |
|-------|-------------------|
| مرفقات / `attachments` | **غير موجود** |
| تنبيهات / `notifications` | **غير موجود** |
| جدولة قواعد / `schedule_rules` | **غير موجود** (يوجد فقط `scheduled_at` و ENUM `scheduled` للاجتماع — ليس جدولة نظام) |
| seed data | **غير موجود** |
| إرسال بريد / email | **غير موجود** |
| Storage / buckets | **غير موجود** |
| `academic_council_decision_followups` | **غير موجود** (مؤجَّل) |

---

## 7. تحقق من عدم لمس النظام الحالي

| النطاق | ملمس؟ |
|--------|-------|
| `student_*` | **لا** |
| طلبات شؤون الطلاب | **لا** |
| تقارير | **لا** |
| خطط دراسية | **لا** |
| مسارات الواجهة الحالية | **لا** |
| `departments` / `academic_years` | FK قراءة فقط — **لا ALTER** |
| Triggers على جداول قائمة | **لا** — الثلاثة triggers على جداول مجالس جديدة فقط |

---

## 8. ملاحظات متبقية (ليست BLOCKED)

من تقرير المراجعة الساكنة — **لم تُعالَج في هذه المرحلة** (خارج نطاق REVISION-01):

- توحيد `is_council_admin` مع `has_any_role` إذا أصبحت `user_role_assignments` مصدراً رئيسياً (R6).
- توثيق أن `vice_chair` بلا صلاحيات إدارية في MVP.
- trigger لمنع تعديل اجتماع `archived` (مؤجَّل في التصميم).
- `REVOKE ALL ON TABLE ... FROM PUBLIC` على الجداول السبعة (تحسين اختياري — نمط المشروع).

هذه لا تمنع مراجعة Supabase للمسودة الحالية.

---

## 9. هل المسودة جاهزة الآن لـ Supabase Review؟

**نعم.** الفجوات الثلاث الإلزامية (NEEDS REVISION) عُولجت في المسودة دون توسيع النطاق.

**التوصية:** **READY FOR SUPABASE REVIEW**

---

## 10. التوصية النهائية

| البند | القرار |
|-------|--------|
| جاهزية Supabase | **READY FOR SUPABASE REVIEW** |
| مراجعة SQL (بعد REVISION-01) | **PASS** — الفجوات الثلاث مُغلَقة؛ ملاحظات §8 اختيارية لمراحل لاحقة |

### القرار: **PASS**

- المسودة معزولة، لا تمس الطلاب/الطلبات/الخطط/التقارير، ولا تحتوي مرفقات/تنبيهات/seed/storage.
- RLS helpers قابلة للتنفيذ من `authenticated`؛ تفرد أرقام الاجتماعات صحيح مع NULL؛ تحديث القرارات مقيَّد لأصحاب الصلاحية الإدارية فقط.
- **لم يُطبَّق أي شيء على قاعدة بيانات.**

---

*Generated: COUNCILS-MIGRATION-DRAFT-REVISION-01 — draft SQL edit only, no DB changes.*
