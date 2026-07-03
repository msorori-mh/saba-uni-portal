# COUNCILS-MVP-DB-VERIFY-01 — Report

**التاريخ:** 2026-07-03
**النطاق:** تحقق عميق قراءة فقط بعد `COUNCILS-MVP-DB-APPLY-01`.
**نوع المرحلة:** verification only — بدون أي تعديل على DB / كود / RLS / نشر / بيانات.

---

## 1. تحقق Schema ✅

| الجدول | موجود | أعمدة أساسية | RLS | created/updated_at | created/updated_by |
|---|---|---|---|---|---|
| `academic_councils` | ✅ | name, council_type, department_id, settings, is_active | ✅ | ✅ | ✅ |
| `academic_council_members` | ✅ | council_id, user_id, member_role, is_active, active_from/to | ✅ | ✅ | ✅ |
| `academic_council_meetings` | ✅ | council_id, academic_year_id, meeting_number, scheduled_at, status, intake_opens/closes_at | ✅ | ✅ | ✅ |
| `academic_council_topics` | ✅ | council_id, meeting_id, title/body/category, status, submitted_by, reviewed_by | ✅ | ✅ | (submitted_by) |
| `academic_council_agenda_items` | ✅ | meeting_id, topic_id, order_index, is_approved, approved_by/at | ✅ | ✅ | ✅ |
| `academic_council_minutes` | ✅ | meeting_id (UNIQUE), body, drafted_by, approved_by, is_locked, locked_at | ✅ | ✅ | (drafted_by) |
| `academic_council_decisions` | ✅ | meeting_id, topic_id, decision_number, status, responsible_user_id, due_date | ✅ | ✅ | ✅ |

**Foreign keys (18):** كلها `ON DELETE RESTRICT` للمراجع الحرجة و`SET NULL` للحقول الاختيارية (`updated_by`, `approved_by`, `reviewed_by`, `responsible_user_id`). لا يوجد `CASCADE` — حماية من الحذف السلسلي.

**Partial unique indexes (تحقق فعلي):**
- `idx_acmeet_council_year_number` WHERE `academic_year_id IS NOT NULL` ✅
- `idx_acmeet_council_number_without_year` WHERE `academic_year_id IS NULL` ✅
- `idx_acm_active` WHERE `is_active` ✅

**Unique constraints:**
- `academic_council_members(council_id, user_id, member_role, active_from)` ✅
- `academic_council_agenda_items(meeting_id, order_index)` ✅
- `academic_council_decisions(meeting_id, decision_number)` ✅
- `academic_council_minutes(meeting_id)` UNIQUE (اجتماع واحد ↔ محضر واحد) ✅

---

## 2. تحقق ENUMs ✅

| ENUM | موجود | تعارض مع ENUMs موجودة |
|---|---|---|
| `academic_council_type` | ✅ | ❌ لا |
| `academic_council_member_role` | ✅ | ❌ لا (منفصل عن `app_role`) |
| `academic_council_meeting_status` | ✅ | ❌ لا |
| `academic_council_topic_status` | ✅ | ❌ لا |
| `academic_council_decision_status` | ✅ | ❌ لا |

كل الأسماء مسبوقة بـ `academic_council_` → لا تصادم.

---

## 3. تحقق RLS ✅ (مع ملاحظة Medium)

- **RLS مفعّل:** 7/7 جداول (`pg_tables.rowsecurity = t`).
- **عدد policies:** 21 (3 لكل جدول: SELECT / INSERT / UPDATE). **لا policy لـ DELETE على أي جدول** — الحذف ممنوع للمستخدمين.
- **كل الـ policies مقيدة بـ `TO authenticated`** — لا يوجد أي policy لـ `anon` أو `public`.
- **لا policy مفتوحة عامة** — كل شرط `USING`/`WITH CHECK` يستدعي دالة تحقق (`is_council_admin` / `is_council_member` / `can_manage_council` / `can_write_council_agenda`) أو يفرض `submitted_by = auth.uid()`.

**تحقق تفصيلي:**

| السيناريو | النتيجة |
|---|---|
| Anon (بلا جلسة) يقرأ أي جدول | 🚫 محجوب (لا policy لـ anon → RLS يرفض) |
| Authenticated بلا عضوية أو دور admin/system_admin | 🚫 لا يرى أي صف (كل SELECT policy تشترط `is_council_admin(uid) OR is_council_member(uid, council_id)`) |
| طالب (role=student) | 🚫 لا يصل — `is_council_admin` = false و`is_council_member` = false |
| عضو مجلس القسم "أ" يحاول قراءة مجلس القسم "ب" | 🚫 محجوب — `is_council_member(uid, council_B)` = false |
| Cross-department leak | ❌ لا يوجد — العزل يمر عبر `council_id` في كل policy، والعضوية لكل مجلس منفصلة |
| مجلس الكلية | 🔒 محمي بالعضوية/الدور فقط، لا انفتاح على "كل الكلية" |

**دالة SECURITY DEFINER:** كل الاستعلامات داخل الدوال لا تُعيد قراءة الجدول الذي يستدعيها من داخل RLS نفسه → **لا recursion**.

---

## 4. تحقق Helper Functions ✅ / ⚠️

كل الدوال موجودة وبالخصائص المطلوبة:

| Function | STABLE | SECURITY DEFINER | search_path=public | Owner |
|---|---|---|---|---|
| `is_council_admin(uuid)` | ✅ | ✅ | ✅ | postgres |
| `is_council_member(uuid, uuid)` | ✅ | ✅ | ✅ | postgres |
| `has_council_role(uuid, uuid, ...)` | ✅ | ✅ | ✅ | postgres |
| `can_manage_council(uuid, uuid)` | ✅ | ✅ | ✅ | postgres |
| `can_write_council_agenda(uuid, uuid)` | ✅ | ✅ | ✅ | postgres |

**⚠️ ملاحظة Medium (F-01):** فحص `pg_proc.proacl` أظهر أن `anon` يحمل صلاحية `EXECUTE` (X) على الدوال الخمس رغم `REVOKE ALL … FROM PUBLIC`. السبب: Supabase تُطبّق **default privileges** على schema `public` (`ALTER DEFAULT PRIVILEGES … TO anon, authenticated, service_role`) تمنح EXECUTE تلقائياً لأي دالة جديدة يملكها `postgres` أو `supabase_admin`. `REVOKE FROM PUBLIC` لا يُبطل هذه المنح الصريحة لأدوار محددة.

**الأثر الفعلي:** anon يستطيع استدعاء الدوال مع أي UUID والحصول على `boolean`. لا تسرّب بيانات صفوف، لكن يُمكّن تعداد "هل هذا المستخدم admin/عضو". يطابق تحذيرات linter #6-#10 (`0028_anon_security_definer_function_executable`).

**الإصلاح المقترح (مرحلة لاحقة):** `REVOKE EXECUTE … FROM anon;` صراحة على الدوال الخمس.

---

## 5. تحقق Triggers ✅

| Trigger | الجدول | يعمل حصراً على جداول المجالس |
|---|---|---|
| `trg_ac_touch` | `academic_councils` | ✅ |
| `trg_acm_touch` | `academic_council_members` | ✅ |
| `trg_acmeet_touch` | `academic_council_meetings` | ✅ |
| `trg_actopics_touch` | `academic_council_topics` | ✅ |
| `trg_acagenda_touch` | `academic_council_agenda_items` | ✅ |
| `trg_acmin_touch` | `academic_council_minutes` | ✅ |
| `trg_acdec_touch` | `academic_council_decisions` | ✅ |
| `trg_acmin_lock_guard` | `academic_council_minutes` (منع تعديل بعد القفل) | ✅ |
| `trg_ac_validate_dept` | `academic_councils` (BEFORE INSERT OR UPDATE) | ✅ |

**لا trigger على أي جدول خارج نطاق المجالس.** فحص `pg_trigger` مقصور على جداول `academic_council*` فقط.

---

## 6. تحقق GRANT/REVOKE ⚠️ (Medium)

**فحص `pg_class.relacl` الفعلي:**

| Role | SELECT | INSERT | UPDATE | DELETE | TRUNCATE | REFERENCES | TRIGGER |
|---|---|---|---|---|---|---|---|
| `service_role` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `authenticated` | ✅ | ✅ | ✅ | ❌ (REVOKE ناجح) | ✅ | ✅ | ✅ |
| `anon` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**⚠️ ملاحظة Medium (F-02):** `anon` يحمل صلاحيات `arwdDxtm` كاملة على الجداول السبعة رغم أن migration لم يُصدر `GRANT … TO anon`. السبب نفسه: `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon` مضبوطة تلقائياً من Supabase على مالكي `postgres` و`supabase_admin`.

**الأثر الفعلي:**
- **قراءة بيانات:** 🚫 مستحيل — لا توجد policy لـ `anon`، وRLS مفعّل → PostgREST يعيد 0 صفوف حتى مع GRANT.
- **إدخال/تعديل/حذف:** 🚫 مستحيل — RLS يرفض كل عملية بلا policy مطابقة.
- **الخطر الفعلي:** لا شيء على مستوى البيانات. لكن الطبقة الدفاعية (defense-in-depth) ناقصة.

**F-03 (Low — نفس الجذر):** `authenticated` يحمل أيضاً `TRUNCATE`/`REFERENCES`/`TRIGGER` من default privileges. RLS يحمي البيانات فعلياً لكن الأمن الافتراضي أوسع من اللازم.

**الإصلاح المقترح (مرحلة لاحقة `COUNCILS-MVP-DB-HARDEN-01`):**
```sql
REVOKE ALL ON public.academic_councils FROM anon;
REVOKE ALL ON public.academic_council_members FROM anon;
-- ... (7 tables)
REVOKE EXECUTE ON FUNCTION public.is_council_admin(uuid) FROM anon;
-- ... (5 functions)
```

**ملاحظة حوكمية:** هذه السلوك default على المشروع كله — نفس الوضع موجود على جداول أخرى قائمة سابقاً (Pilot يعمل عليها بلا مشاكل بفضل RLS)، لذا لا يُصنَّف Blocker.

---

## 7. تحقق الجداول فارغة ✅

```
academic_councils | 0
members           | 0
meetings          | 0
topics            | 0
agenda            | 0
minutes           | 0
decisions         | 0
```

**لا seed data، لا بيانات حقيقية، لا اختبارات.**

---

## 8. تحقق عدم التأثير على النظام الحالي ✅

الجداول الأساسية القائمة (`student_profiles`, `student_requests`, `study_plans`, `course_offerings`, `class_schedule`) موجودة كما هي بلا تغيير. لا trigger/policy/grant جديد على أي منها.

---

## 9. تحقق المسارات (Browser via Playwright)

| المسار | HTTP | التوجيه | Page errors |
|---|---|---|---|
| `/` | 200 | — | 0 |
| `/admin/login` | 200 | — | 0 |
| `/admin` | 200 | `/admin/login` (متوقع) | 0 |
| `/admin/academic-councils` | 200 | `/admin/login` (متوقع) | 0 |
| `/admin/reports` | 200 | `/admin/login` (متوقع) | 0 |
| `/admin/student-requests` | 200 | `/admin/login` (متوقع) | 0 |
| `/admin/study-plans` | 200 | `/admin/login` (متوقع) | 0 |
| `/student/requests` | 200 | `/portal-login` (متوقع) | 0 |
| `/student/requests/new` | 200 | — | 0 |

**لا page errors، لا تراجع بصري.**

---

## 10. تصنيف الملاحظات

| ID | Severity | العنوان | الجذر | يوقف المرحلة التالية؟ |
|---|---|---|---|---|
| F-01 | Medium | `anon` لديه `EXECUTE` على 5 دوال SECURITY DEFINER | Supabase default privileges | ❌ لا (RLS يحمي البيانات) |
| F-02 | Medium | `anon` لديه `arwdDxtm` على الجداول السبعة | Supabase default privileges | ❌ لا (RLS يحجب كل عملية) |
| F-03 | Low | `authenticated` لديه TRUNCATE/REFERENCES/TRIGGER | Supabase default privileges | ❌ لا |

**Blocker: 0 · High: 0 · Medium: 2 · Low: 1**

---

## 11. إجابات الأسئلة المطلوبة

- **هل يوجد anon/public access فعّال على البيانات؟** ❌ لا (RLS يحجب — التحقق: لا policy لـ anon).
- **هل يوجد وصول للطلاب؟** ❌ لا (`is_council_admin` = false و`is_council_member` = false للطلاب).
- **هل يوجد cross-department risk؟** ❌ لا — كل policy تعزل بـ `council_id` والعضوية لكل مجلس منفصلة.
- **هل يوجد Blocker أو High؟** ❌ لا.
- **هل قاعدة المجالس جاهزة للمرحلة التالية؟** ✅ نعم، مع توصية بتنفيذ `COUNCILS-MVP-DB-HARDEN-01` قبل ربط أي كتابة حقيقية من الواجهة.

---

## 12. التوصية

**READY FOR UI INTEGRATION (READ-ONLY)** مع شرط:

1. **قبل تفعيل أي كتابة حقيقية من الواجهة:** تنفيذ `COUNCILS-MVP-DB-HARDEN-01` (migration صغير) لسد F-01/F-02/F-03 عبر `REVOKE` صريح على anon و`authenticated` (للصلاحيات الفائضة).
2. **القراءة الأولى من الواجهة آمنة الآن** لأن RLS يمنع أي تسرّب، والجداول فارغة.

المرحلة التالية الموصى بها:
- **الخيار المُفضَّل:** `COUNCILS-MVP-DB-HARDEN-01` أولاً (تصلب الصلاحيات) ← ثم `COUNCILS-MVP-WIRING-01` (ربط الواجهة قراءة فقط).
- **البديل:** `COUNCILS-MVP-WIRING-01` مباشرة إن اقتصر على SELECT، مع فتح `HARDEN-01` كتذكرة متابعة.

---

## القرار النهائي

**PASS WITH NOTES**

- Schema/ENUMs/Triggers/Policies/Helpers كلها مطابقة للتصميم المعتمد.
- الجداول فارغة، Pilot غير متأثر، المسارات تعمل.
- ملاحظتان Medium بشأن default privileges لـ anon على الجداول والدوال — الخطر مغلق بـ RLS لكن يُنصح بتصلبه في `COUNCILS-MVP-DB-HARDEN-01` قبل تفعيل أي كتابة حقيقية.
