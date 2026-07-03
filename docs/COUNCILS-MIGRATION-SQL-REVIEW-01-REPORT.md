# COUNCILS-MIGRATION-SQL-REVIEW-01 — مراجعة ساكنة لمسودة SQL

> **مرحلة مراجعة فقط.** لم يُطبَّق migration، ولم يُنقل الملف إلى `supabase/migrations/`، ولم يُشغَّل SQL على أي قاعدة بيانات، ولم تُعدَّل DB/RLS/Storage/Triggers، ولم تُضف seed data.

**الملف المراجع:** `docs/drafts/20260703000000_councils_mvp_schema_rls.draft.sql`  
**مراجع:** `COUNCILS-MIGRATION-PREP-01-REPORT.md`, `COUNCILS-DB-RLS-DESIGN-REVIEW-01-REPORT.md`, `COUNCILS-MODULE-DESIGN-01-REPORT.md`

---

## 1. ملخص التنفيذ

| السؤال | الجواب |
|--------|--------|
| هل تم تطبيق migration؟ | **لا** |
| هل تم تعديل DB؟ | **لا** |
| هل تم تعديل RLS فعلياً؟ | **لا** |
| هل تم تعديل Storage / Triggers على DB حالية؟ | **لا** |
| هل تم تعديل كود الواجهة؟ | **لا** |

---

## 2. هل SQL صالح مبدئياً؟

**نعم — صالح مبدئياً** كمسودة PostgreSQL/Supabase.

- بنية الملف منطقية: ENUMs → 7 جداول → GRANT/REVOKE → ENABLE RLS → سياسات → 5 helpers → 3 triggers.
- صياغة `EXECUTE FUNCTION` للـ triggers متوافقة مع نمط المشروع الحالي (`supabase/migrations`).
- لا `ALTER` / `DROP` / `TRUNCATE` على جداول قائمة.
- لا أخطاء syntax واضحة (أقواس `$$` مغلقة، فواصل صحيحة، أسماء مؤهَّدة).

**ملاحظة:** التحقق النهائي يتطلب تشغيل `psql` أو أداة migration على بيئة staging — لم يُنفَّذ في هذه المرحلة.

---

## 3. الجداول السبعة — أسماء ومراجع FK

| # | الجدول | FKs إلى جداول قائمة | مؤكد في المشروع |
|---|--------|---------------------|-----------------|
| 1 | `academic_councils` | `departments(id)`, `auth.users(id)` | نعم |
| 2 | `academic_council_members` | `academic_councils(id)`, `auth.users(id)` | جداول جديدة |
| 3 | `academic_council_meetings` | `academic_councils(id)`, `academic_years(id)` | `academic_years` موجود |
| 4 | `academic_council_topics` | `academic_councils(id)`, `academic_council_meetings(id)`, `auth.users` | جداول جديدة |
| 5 | `academic_council_agenda_items` | `academic_council_meetings(id)`, `academic_council_topics(id)`, `auth.users` | جداول جديدة |
| 6 | `academic_council_minutes` | `academic_council_meetings(id)` UNIQUE, `auth.users` | جداول جديدة |
| 7 | `academic_council_decisions` | `academic_council_meetings(id)`, `academic_council_topics(id)`, `auth.users` | جداول جديدة |

**مراجع غير مؤكدة / تحتاج تحقق Lovable:** لا توجد مراجع لجداول غير موجودة في المستودع. الاعتماد على `public.has_role(_user, _role public.app_role)` و`public.app_role` (`system_admin`, `admin`) **مؤكد** في migrations (`20260531205946`, `20260531222858`).

---

## 4. ENUMs (5)

| النوع | القيم | ملاحظة |
|-------|-------|--------|
| `academic_council_type` | `college`, `department` | تصميم الوثائق القديمة ذكر `faculty` — المسودة تستخدم `college` (اتساق داخلي صحيح) |
| `academic_council_member_role` | `chair`, `vice_chair`, `secretary`, `member`, `viewer` | `vice_chair` غير مستخدم في helpers — دور عرض/عضوية فقط |
| `academic_council_meeting_status` | 9 قيم | — |
| `academic_council_topic_status` | 9 قيم | — |
| `academic_council_decision_status` | 7 قيم | — |

لا تعارض أسماء ENUM مع أنواع قائمة في المستودع.

---

## 5. GRANTs / REVOKEs / DELETE

| البند | الحالة |
|-------|--------|
| `GRANT SELECT, INSERT, UPDATE` → `authenticated` | نعم — على الجداول السبعة |
| `GRANT ALL` → `service_role` | نعم |
| `REVOKE DELETE` → `authenticated` | نعم — على الجداول السبعة |
| `GRANT` → `anon` | **لا** — مطابق للمطلوب |
| حذف عبر `service_role` | ما زال ممكناً (متعمَّد للعمليات الإدارية) |

**فجوة مقترحة قبل التطبيق:** لا يوجد `GRANT EXECUTE` للـ helper functions الخمس على `authenticated` (انظر §8). نمط المشروع يفرض ذلك صراحة لـ `has_role` (`20260531210002`).

**فجوة ثانوية:** لا `REVOKE ALL ON TABLE ... FROM PUBLIC` — نمط المشروع غالباً لا يفرضه على كل جدول جديد؛ يُفضَّل تأكيده مع Lovable.

---

## 6. RLS — هل آمن؟

### نقاط قوة

- كل الجداول: `ENABLE ROW LEVEL SECURITY` + سياسات `TO authenticated` فقط.
- لا سياسات لـ `anon`.
- العزل يعتمد **عضوية المجلس** (`is_council_member`) وليس دوراً عاماً مثل `dean`/`department_head`.
- `is_council_admin` يقتصر على `system_admin` و`admin` فقط — **لا توسّع تلقائي لـ dean**.
- Helpers من نوع `SECURITY DEFINER` + `SET search_path = public` — يتجنّب recursion RLS على `academic_council_members`.
- المحضر: سياسة تحديث قبل القفل + trigger يمنع تعديل `is_locked=true`.
- الموضوعات: المالك يرى موضوعه؛ التحديث محصور بحالات مسودة/استكمال أو صلاحية agenda.

### مخاطر / فجوات

| # | المخاطرة | الشدة | التوصية |
|---|----------|-------|---------|
| R1 | **`decisions_update`**: `responsible_user_id` يمكنه تحديث **أي حقل** (عنوان، نص، رقم قرار) وليس حقول التنفيذ فقط | متوسطة | تقييد في migration لاحقة (trigger column guard) أو server functions — مذكور في PREP-01 |
| R2 | **لا استبعاد صريح لدور `student`** — أي مستخدم `authenticated` عضو في مجلس يرى البيانات | منخفضة | مقبول إذا العضوية لا تُمنح للطلاب؛ يُوثَّق تشغيلياً |
| R3 | **`admin`/`system_admin` يريان كل المجالس** بما فيها أقسام أخرى | متوسطة (متعمَّد) | audit إلزامي؛ لا يُعتبر ثغرة إذا مقصود |
| R4 | **عزل القسم** عبر `department_id` في RLS **غير مباشر** — يعتمد على عدم إضافة عضو قسم A لمجلس قسم B | منخفضة | Trigger ربط `council_type↔department_id` يمنع خلط الأنواع؛ العضوية تبقى مصدر الحقيقة |
| R5 | **`topics_select`**: `submitted_by = auth.uid()` يسمح برؤية الموضوع حتى لو لم يعد عضواً | منخفضة | سلوك مقبول لصاحب الموضوع |

**الحكم:** RLS **آمن مبدئياً** للـ MVP مع **PASS WITH NOTES** — يحتاج تقييد تحديث القرار من المسؤول قبل الإنتاج الكامل.

---

## 7. Helper functions (5) — هل آمنة؟

| الدالة | الغرض | أمان المنطق | فجوة |
|--------|-------|-------------|------|
| `is_council_admin` | `has_role` → admin/system_admin | صحيح | لا يشمل `user_role_assignments` (انظر R6) |
| `is_council_member` | عضوية نشطة + `active_to` | صحيح | `active_to > CURRENT_DATE` يستبعد يوم الانتهاء نفسه |
| `has_council_role` | دور محدد | صحيح | لا تعارض اسم في المستودع |
| `can_manage_council` | admin أو chair | صحيح | — |
| `can_write_council_agenda` | admin أو chair أو secretary | صحيح | — |

| # | مخاطرة | التوصية |
|---|--------|---------|
| R6 | `has_role` يقرأ `user_roles` فقط — بينما `has_any_role` يقرأ أيضاً `user_role_assignments` | إن كان بعض المسؤولين معيَّنين فقط عبر assignments، `is_council_admin` قد يفشل — يُفضَّل توحيد مع `has_any_role` أو توسيع `is_council_admin` |
| R7 | **غياب `GRANT EXECUTE ON FUNCTION ... TO authenticated`** للدوال الخمس | **يجب إضافتها قبل التطبيق** وإلا قد تفشل سياسات RLS عند التشغيل |

**الحكم:** المنطق آمن؛ **التطبيق يحتاج REVISION** لـ GRANT EXECUTE (وربما توحيد has_role).

---

## 8. Triggers (3) — هل آمنة على النظام الحالي؟

| Trigger | الجداول | التأثير على جداول قائمة |
|---------|---------|-------------------------|
| `tg_academic_councils_touch_updated_at` | 7 جداول مجالس | **لا** — جداول جديدة فقط |
| `tg_minutes_block_locked_edits` | `academic_council_minutes` | **لا** |
| `tg_councils_validate_department_binding` | `academic_councils` | **لا** |

لا triggers على `student_*`, `study_plan*`, `audit_logs`, أو أي جدول قائم.

**مؤجَّل (غير موجود — متعمَّد):** ترقيم `meeting_number`/`decision_number`، قفل الاجتماع بعد `archived`، audit hooks، تقييد حقول القرار.

**الحكم:** Triggers **آمنة** — لا خطر على الجداول الحالية.

---

## 9. عدم لمس النظام الحالي

| النطاق | ملمس؟ |
|--------|-------|
| `student_*` | **لا** |
| `student_requests` / طلبات | **لا** |
| تقارير / `reports` | **لا** |
| `study_plans` / `study_plan_courses` | **لا** |
| `departments` / `academic_years` | قراءة FK فقط — **لا ALTER** |
| `audit_logs` | **لا** |
| Storage buckets | **لا** |
| Triggers على جداول قائمة | **لا** |

---

## 10. public access / الطلاب / المرفقات

| البند | الحالة |
|-------|--------|
| public / anon access | **لا** — لا GRANT لـ `anon` |
| وصول الطلاب | **مرفوض افتراضياً** — لا سياسة عامة؛ يحتاج عضوية صريحة في `academic_council_members` |
| `academic_council_attachments` | **غير موجود** — مؤجَّل |
| `academic_council_notifications` | **غير موجود** — مؤجَّل |
| `academic_council_schedule_rules` | **غير موجود** — مؤجَّل |
| `academic_council_decision_followups` | **غير موجود** — مؤجَّل |

---

## 11. عزل مجالس الأقسام ومجلس الكلية

- **مجلس قسم:** `council_type='department'` + `department_id NOT NULL` (trigger).
- **مجلس الكلية:** `council_type='college'` + `department_id IS NULL` (trigger).
- **RLS:** لا SELECT بدون `is_council_member` أو `is_council_admin`.
- **dean:** ليس `is_council_admin` — يحتاج عضوية `chair` في seed لاحق (مذكور في PREP-01 R4).
- **department_head:** لا وصول تلقائي — يحتاج عضوية مجلس قسمه.

**مخاطر cross-department:** منخفضة إذا لم تُمنح عضويات متقاطعة. `admin` يرى الكل — overexposure متعمَّد.

---

## 12. الحذف النهائي

- `REVOKE DELETE FROM authenticated` على الجداول السبعة — **نعم**.
- البديل: `is_active`, `status`, `is_locked`, `cancelled`/`archived` في ENUMs.
- `service_role` ما زال قادراً على DELETE — مقبول للصيانة.

---

## 13. مشكلات وتحسينات مقترحة قبل التطبيق

### يجب معالجتها (NEEDS REVISION)

1. **`GRANT EXECUTE`** للدوال الخمس (`is_council_admin`, `is_council_member`, `has_council_role`, `can_manage_council`, `can_write_council_agenda`) إلى `authenticated` (+ `REVOKE FROM PUBLIC`).
2. **`UNIQUE (council_id, academic_year_id, meeting_number)`** — عند `academic_year_id IS NULL` يسمح PostgreSQL بعدة صفوف بنفس `meeting_number` (NULLs لا تتعارض في UNIQUE). إما جعل `academic_year_id NOT NULL` أو partial unique index.
3. **تقييد `decisions_update`** لحقول التنفيذ فقط عند `responsible_user_id` (trigger أو policy أضيق).

### يُفضَّل معالجتها (قبل أو مع MVP)

4. توحيد `is_council_admin` مع `has_any_role` إذا assignments أصبحت مصدر الأدوار الرئيسي.
5. توثيق أن `vice_chair` لا يملك صلاحيات إدارية في MVP.
6. إضافة `updated_by` لـ `academic_council_topics` لاتساق audit (اختياري).
7. Trigger لمنع تعديل اجتماع `status='archived'` (مؤجَّل في التصميم — يُحدَّد موعده).

---

## 14. هل المسودة جاهزة لمراجعة Lovable/Supabase؟

**نعم — مع تحفظات.**

التوصية: **READY FOR SUPABASE REVIEW** بعد إدراج `GRANT EXECUTE` للـ helpers في نسخة المراجعة التالية (أو كتعليمات صريحة لـ Lovable قبل التطبيق).

---

## 15. التوصية النهائية

| البند | القرار |
|-------|--------|
| جاهزية Supabase | **READY FOR SUPABASE REVIEW** (مع REVISION بسيطة لـ GRANT EXECUTE) |
| مراجعة SQL | **NEEDS REVISION** (3 فجوات §13 — ليست BLOCKED) |

### القرار: **PASS WITH NOTES**

- المسودة سليمة مبدئياً، معزولة عن النظام الحالي، ولا تمس الطلاب/الطلبات/الخطط/التقارير.
- RLS وtriggers منطقياً آمنان للـ MVP.
- لا تطبيق migration في هذه المرحلة.
- يُنصح بمعالجة GRANT EXECUTE وUNIQUE meetings وdecision field guard قبل التطبيق الفعلي في `COUNCILS-MVP-SCAFFOLD-01`.

---

*Generated: COUNCILS-MIGRATION-SQL-REVIEW-01 — static review only, no DB changes.*
