# COUNCILS-SUPABASE-MIGRATION-REVIEW-01 — مراجعة Supabase لمسودة migration

> **مرحلة مراجعة Supabase فقط.** لم يُطبَّق migration، لم يُنقل الملف إلى `supabase/migrations/`، لم يُشغَّل SQL، لم تُعدَّل DB/RLS/Storage/Triggers/Buckets، لا seed، لا import، لا إيميلات، لا كود، لا توسيع Pilot.

**الملف المراجَع:** `docs/drafts/20260703000000_councils_mvp_schema_rls.draft.sql` (623 سطر)
**مراجع:** `COUNCILS-MIGRATION-DRAFT-REVISION-01-REPORT.md`, `COUNCILS-MIGRATION-SQL-REVIEW-01-REPORT.md`, `COUNCILS-DB-RLS-DESIGN-REVIEW-01-REPORT.md`

---

## 1. ملخص الحوكمة

| السؤال | الجواب |
|--------|--------|
| تم تطبيق migration؟ | **لا** |
| نُقل الملف إلى `supabase/migrations/`؟ | **لا** |
| شُغِّل SQL على قاعدة البيانات؟ | **لا** |
| عُدِّلت DB / RLS / Storage / Triggers / Buckets؟ | **لا** |
| seed / import / إيميلات / نشر / توسيع Pilot؟ | **لا** |
| عُدِّل أي كود واجهة؟ | **لا** |

---

## 2. توافق SQL مع Supabase / Postgres

**متوافق.** بنية الملف تلتزم بأنماط المشروع الحالية:

- `gen_random_uuid()` مفعَّل افتراضياً على Supabase — لا حاجة `pgcrypto`.
- ENUMs عبر `CREATE TYPE public.*` — مقبولة كلياً.
- `SECURITY DEFINER … SET search_path = public` مطابق لنمط `has_role` القائم.
- كل `CREATE POLICY` يحدد `TO authenticated` صراحة.
- لا `ALTER DATABASE postgres …` (ممنوع في Supabase migrations).
- لا امتدادات جديدة، لا schemas جديدة، لا لمس `auth.*` / `storage.*` / `realtime.*` / `vault.*` / `supabase_functions.*`.
- الترتيب: ENUMs → 7 CREATE TABLE (كل واحدة CREATE→GRANT→REVOKE DELETE→ENABLE RLS) → 5 helpers → GRANT/REVOKE EXECUTE → CREATE POLICY → 3 triggers. صحيح ومنطقي.

بلا أخطاء صياغة ظاهرة؛ التحقق التنفيذي النهائي يظل رهيناً بتشغيل الأداة في staging.

---

## 3. المراجع الخارجية (FKs) — تحقق من الوجود

| المرجع | الوجود في المشروع | التحقق |
|--------|-------------------|--------|
| `public.departments(id)` | **موجود** | ضمن قائمة الجداول الرسمية |
| `public.academic_years(id)` | **موجود** | ضمن قائمة الجداول الرسمية |
| `auth.users(id)` | **موجود** (مُدار Supabase) | مقبول كـ FK قراءة |
| `public.has_role(uuid, public.app_role)` | **موجود** | migration `20260531210002` |
| `public.app_role` (قيم `system_admin`, `admin`) | **موجود** | migrations `20260531205946`, `20260531222858` |

**لا مراجع غير مؤكدة.** كل FK يشير إلى جدول/عمود حقيقي.

---

## 4. RLS — الأمان

- كل الجداول السبعة: `ENABLE ROW LEVEL SECURITY`.
- كل السياسات `TO authenticated` فقط — **لا سياسات لـ `anon`**.
- العزل مبني على **عضوية المجلس** (`is_council_member`) وليس دوراً عاماً — يمنع التسرب بين الأقسام.
- `is_council_admin` = `system_admin` أو `admin` فقط (لا dean تلقائياً).
- helpers من نوع `SECURITY DEFINER` تتجاوز recursion على `academic_council_members`.
- `minutes_update_before_lock` مقيَّد بـ `is_locked = false` + trigger `tg_minutes_block_locked_edits` كطبقة ثانية.
- `topics_update_owner_draft` يقصر مالك الموضوع على `draft`/`needs_completion` فقط، ويسمح بـ `submitted` في `WITH CHECK` لدعم انتقال الحالة عند الإرسال.
- `decisions_update` — بعد REVISION-01 لم يعد يسمح لـ `responsible_user_id` بالتحديث؛ يقتصر على `can_write_council_agenda`. **صحيح وآمن.**

**الحكم: RLS آمن مبدئياً للـ MVP.**

---

## 5. GRANT / REVOKE — الأمان

الجداول السبعة:
- `GRANT SELECT, INSERT, UPDATE … TO authenticated` ✓
- `GRANT ALL … TO service_role` ✓
- `REVOKE DELETE … FROM authenticated` ✓ (يمنع الحذف من قِبل المستخدم؛ الأرشفة عبر `status`/`is_active`)
- **لا `GRANT … TO anon`** ✓

الدوال الخمس:
- `REVOKE ALL … FROM PUBLIC` ✓
- `GRANT EXECUTE … TO authenticated, service_role` ✓
- **لا EXECUTE لـ `anon`** ✓

**الحكم: GRANT/REVOKE آمنة، ومطابقة للمطلوب في §6 من طلبك.** لا صلاحيات زائدة.

ملاحظة اختيارية (غير حاجزة): يمكن لاحقاً إضافة `REVOKE ALL ON TABLE … FROM PUBLIC` كتعزيز، لكن النمط الافتراضي لـ Postgres في Supabase لا يمنح PUBLIC صلاحيات على جداول `public` جديدة بلا `GRANT` صريح، فلا خطر عملي.

---

## 6. Helper functions — الأمان

| الدالة | التوقيع | نمط الأمان | ملاحظة |
|--------|---------|-------------|--------|
| `is_council_admin` | `(uuid) → boolean` | SECURITY DEFINER, STABLE, sql | يستخدم `has_role` القائم |
| `is_council_member` | `(uuid, uuid) → boolean` | SECURITY DEFINER, STABLE, sql | يعتمد `active_from`/`active_to` |
| `has_council_role` | `(uuid, uuid, enum) → boolean` | SECURITY DEFINER, STABLE, sql | لا تعارض أسماء |
| `can_manage_council` | `(uuid, uuid) → boolean` | يستدعي الاثنين أعلاه | admin أو chair |
| `can_write_council_agenda` | `(uuid, uuid) → boolean` | admin أو chair أو secretary | مستخدم في meetings/agenda/decisions |

كل الدوال:
- `SET search_path = public` — يمنع search_path hijack.
- `STABLE` — مناسب للاستعلام داخل RLS.
- لا `SECURITY DEFINER` تفتح صلاحيات أوسع من الغرض.
- لا استعلامات عبر schemas أخرى.

**الحكم: helpers آمنة.**

ملاحظة معروفة من مراجعات سابقة (غير حاجزة): `is_council_admin` يعتمد `has_role` فقط ولا يفحص `user_role_assignments`. مقبول للـ MVP؛ يمكن التوحيد لاحقاً.

---

## 7. Triggers — الأمان والأثر

ثلاثة triggers، **جميعها على جداول جديدة فقط**:

1. `trg_*_touch` (7 triggers) على جداول المجالس الجديدة → تحديث `updated_at`.
2. `trg_acmin_lock_guard` على `academic_council_minutes` → يرفع استثناءً عند تعديل صف مقفول ويضبط `locked_at` عند القفل.
3. `trg_ac_validate_dept` على `academic_councils` → يفرض ثنائية `council_type ↔ department_id`.

- **لا trigger على أي جدول قائم** (`departments`, `academic_years`, `auth.users`, `student_*`, `student_requests`, `study_plans`, `class_schedule`, `audit_logs` …).
- كل ترجر يعرّف `SET search_path = public` داخل الدالة.

**الحكم: triggers آمنة ومعزولة.**

---

## 8. Partial unique indexes

- `idx_acmeet_council_year_number` على `(council_id, academic_year_id, meeting_number) WHERE academic_year_id IS NOT NULL`
- `idx_acmeet_council_number_without_year` على `(council_id, meeting_number) WHERE academic_year_id IS NULL`

يعالجان معاً دلالة NULL في UNIQUE بشكل صحيح: لا تكرار لرقم اجتماع لنفس المجلس ضمن نفس السنة، ولا تكرار له لعدة صفوف بلا سنة. **صحيحان.**

---

## 9. `decisions_update` بعد REVISION-01

- تمت إزالة `responsible_user_id = auth.uid()` من `USING` و`WITH CHECK`.
- التحديث محصور بـ `can_write_council_agenda` (admin / chair / secretary).
- `decisions_select` ما زالت تسمح للمسؤول بالرؤية.
- **صحيح ومطابق لتقرير REVISION-01.**

---

## 10. عدم وجود المحظورات

فحص نصي كامل للملف:

| العنصر | موجود؟ |
|--------|--------|
| مرفقات / `attachments` | **لا** |
| `storage.` / bucket / signed URL | **لا** |
| تنبيهات / `notifications` | **لا** |
| Email / SMTP | **لا** |
| `pg_cron` / `cron` / `net.http_*` / scheduled jobs | **لا** |
| seed data / `INSERT INTO` | **لا** |
| `academic_council_decision_followups` | **لا** (مؤجَّل) |
| `academic_council_schedule_rules` | **لا** (مؤجَّل) |

---

## 11. عدم لمس النظام القائم

| النطاق | ملموس؟ |
|--------|--------|
| `student_*` (profiles/enrollments/grades/requests/fees/payments/…) | **لا** |
| طلبات شؤون الطلاب (`student_requests`, `student_request_attachments`, `student_service_request_*`) | **لا** |
| التقارير | **لا** |
| الخطط الدراسية (`study_plans`, `study_plan_courses`) | **لا** |
| الجداول والإسناد (`class_schedule`, `course_offerings`, `course_sections`, `rooms`, `time_slots`) | **لا** |
| `departments`, `academic_years`, `auth.users` | قراءة FK فقط — لا `ALTER`/`DROP`/`TRUNCATE` |
| `audit_logs` | **لا** |
| Storage buckets | **لا** |
| Triggers على جداول قائمة | **لا** |

**لا `ALTER`، لا `DROP`، لا `TRUNCATE`** في الملف.

---

## 12. الأثر على Pilot الحالي

- كل الكائنات المُنشأة جديدة (7 جداول + 5 helpers + 3 triggers + 5 ENUMs).
- لا سياسات RLS تُعدَّل على جداول Pilot.
- لا صلاحيات جديدة تُفتح للأدوار الحالية.
- `/admin/academic-councils` يبقى صفحة مبدئية معزولة (لا استعلامات على الجداول الجديدة قبل SCAFFOLD-01).

**الحكم: صفر أثر على Pilot عند تطبيق هذه المسودة كما هي.**

---

## 13. المخاطر المتبقية (غير حاجزة)

| # | مخاطرة | الشدة | ملاحظة |
|---|--------|-------|--------|
| N1 | `is_council_admin` لا يشمل `user_role_assignments` | منخفضة | مقبول لـ MVP؛ يمكن التوحيد لاحقاً |
| N2 | لا trigger لترقيم `meeting_number` / `decision_number` تلقائياً | منخفضة | التوليد على طبقة server function |
| N3 | لا trigger لأرشفة/قفل الاجتماع بعد `archived` | منخفضة | مؤجَّل صراحة |
| N4 | dean لا يرى مجلس كليته ما لم يُضف كعضو `chair` عبر seed لاحق | منخفضة | مقصود؛ seed خارج نطاق هذه المسودة |
| N5 | `admin`/`system_admin` يرى كل المجالس (overexposure مقصود) | منخفضة | يحتاج audit لاحقاً |

**لا شيء منها يمنع نقل الملف إلى `supabase/migrations/`.**

---

## 14. هل توجد مشكلة تمنع النقل لاحقاً؟

**لا.** المسودة:

- متوافقة مع Supabase/Postgres.
- كل FKs تشير إلى كائنات موجودة.
- RLS مغلق افتراضياً ومنفتح فقط بشروط عضوية/دور.
- GRANT/REVOKE مطابقة لسياسة المشروع.
- helpers محمية ومحصورة على `authenticated`/`service_role`.
- triggers على جداول جديدة فقط.
- لا مرفقات/تنبيهات/بريد/سكجول/seed/storage.
- لا لمس للطلاب/الطلبات/التقارير/الخطط/الجداول.
- صفر أثر على Pilot.

---

## 15. التوصية

**READY FOR MIGRATION STAGING**

عند اعتماد المراجعة البشرية، تُقدَّم مسودة SQL نفسها عبر أداة migration الرسمية في `COUNCILS-MVP-SCAFFOLD-01` (لا نسخ يدوي إلى `supabase/migrations/`، ولا تنفيذ من هذه المرحلة).

---

## 16. القرار النهائي

### **PASS**

- المسودة سليمة ومعزولة وآمنة.
- الفجوات الثلاث لمراجعة SQL السابقة (GRANT EXECUTE، partial unique، decisions_update) مُغلَقة.
- الملاحظات N1–N5 اختيارية لمراحل لاحقة، ليست حاجزة.
- **لم يُطبَّق شيء على قاعدة بيانات؛ لم يُنقل الملف؛ لم يُعدَّل أي كود.**

---

*Generated: COUNCILS-SUPABASE-MIGRATION-REVIEW-01 — Supabase static review only, no DB changes.*
