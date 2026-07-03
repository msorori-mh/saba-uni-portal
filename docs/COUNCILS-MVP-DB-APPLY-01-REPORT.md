# COUNCILS-MVP-DB-APPLY-01 — Report

**التاريخ:** 2026-07-03
**الأداة المستخدمة:** `supabase--migration` (القناة الرسمية المعتمدة)
**النطاق:** schema-only لبوابة إدارة المجالس الأكاديمية.
**المصدر:** `docs/drafts/20260703000000_councils_mvp_schema_rls.draft.sql`

---

## 1. حالة التنفيذ

| البند | القيمة |
|---|---|
| هل تم تطبيق migration؟ | ✅ نعم |
| القناة | `supabase--migration` (بموافقة صريحة من المستخدم على SQL كاملاً) |
| نتيجة التنفيذ | نجاح — transaction واحدة، بدون أخطاء |
| هل نُقل ملف إلى `supabase/migrations/` على main يدوياً؟ | ❌ لا (المسودة بقيت في `docs/drafts/`) |
| عدد محاولات retry | 0 |

---

## 2. ما تم إنشاؤه (تحقق فعلي من قاعدة البيانات)

### 2.1 الجداول (7/7) — RLS مفعّل على كلها ✅

| الجدول | RLS |
|---|---|
| `academic_councils` | ✅ ON |
| `academic_council_members` | ✅ ON |
| `academic_council_meetings` | ✅ ON |
| `academic_council_topics` | ✅ ON |
| `academic_council_agenda_items` | ✅ ON |
| `academic_council_minutes` | ✅ ON |
| `academic_council_decisions` | ✅ ON |

### 2.2 ENUMs (5/5) ✅
- `academic_council_type`
- `academic_council_member_role`
- `academic_council_meeting_status`
- `academic_council_topic_status`
- `academic_council_decision_status`

(الأنواع الإضافية في `pg_type` هي row-types يولّدها Postgres تلقائياً لكل جدول — سلوك عادي.)

### 2.3 Helper Functions (5/5) ✅
- `is_council_admin(uuid)`
- `is_council_member(uuid, uuid)`
- `has_council_role(uuid, uuid, academic_council_member_role)`
- `can_manage_council(uuid, uuid)`
- `can_write_council_agenda(uuid, uuid)`

كلها `SECURITY DEFINER STABLE` مع `search_path = public`، و`REVOKE ALL FROM PUBLIC` ثم `GRANT EXECUTE TO authenticated, service_role` (بدون anon).

### 2.4 Trigger Functions (3/3) ✅
- `tg_academic_councils_touch_updated_at`
- `tg_minutes_block_locked_edits`
- `tg_councils_validate_department_binding`

### 2.5 Triggers (9/9) ✅
- 7 × `*_touch` (updated_at) على كل الجداول السبعة
- `trg_acmin_lock_guard` على `academic_council_minutes`
- `trg_ac_validate_dept` على `academic_councils` (BEFORE INSERT OR UPDATE — يظهر مرتين في information_schema، سلوك متوقع)

### 2.6 RLS Policies (21/21) ✅
3 policies لكل جدول (SELECT / INSERT / UPDATE) — 7 × 3 = 21.
لا يوجد أي policy لـ DELETE (الحذف ممنوع للمستخدمين — service_role فقط).

### 2.7 GRANT / REVOKE
- `authenticated`: `SELECT, INSERT, UPDATE` على كل الجداول السبعة، `DELETE` مسحوب صراحة.
- `service_role`: `ALL` على كل الجداول السبعة.
- `anon`: لا شيء — لا `GRANT` لأي جدول أو دالة.
- الدوال: `REVOKE ALL FROM PUBLIC` ثم `GRANT EXECUTE TO authenticated, service_role`.

---

## 3. ما لم يتم (تأكيدات صريحة)

| البند | القيمة |
|---|---|
| seed data | ❌ لا — كل الجداول السبعة count = 0 (تحقق فعلي) |
| Storage bucket / objects | ❌ لا |
| مرفقات / signed URLs | ❌ لا |
| بريد إلكتروني | ❌ لا |
| Scheduled jobs / cron | ❌ لا |
| تعديل جداول خارج نطاق المجالس | ❌ لا (المسودة لا تحتوي أي `ALTER`/`DROP`/`INSERT` على جدول غير `academic_council*`) |
| تعديل جداول الطلاب / الطلبات / الخطط / الجداول / التقارير | ❌ لا |
| تعديل `auth` / `storage` / `realtime` / `vault` | ❌ لا |
| تعديل كود التطبيق | ❌ لا (schema فقط، الواجهة `/admin/academic-councils` بقيت UI-only كما هي) |
| نشر جديد | ❌ لا |
| توسيع Pilot | ❌ لا |

---

## 4. نتائج التحقق من RLS

- RLS مفعّل على 7/7 جداول ✅
- لا يوجد `GRANT ... TO anon` — anon لا يرى شيئاً ✅
- `authenticated` بدون عضوية/دور: `SELECT` يمر عبر policies تشترط إما `is_council_admin` أو `is_council_member` (أو `submitted_by = auth.uid()` للموضوعات، أو `responsible_user_id` للقرارات) — بدون تحقق أي شرط لن يرى أي صف ✅
- الطلاب (`student` role): ليس `system_admin` ولا `admin`، ولن يُضافوا كأعضاء مجلس، فلا يصلون لأي بيانات مجالس ✅
- `admin` / `system_admin`: `is_council_admin = true` عبر `has_role(...)` — يرى ويدير كل شيء ✅
- `dean`: ليس مدرجاً في `is_council_admin` (فقط `system_admin` + `admin`) — سيرى فقط المجالس التي يُضاف إليها كعضو/رئيس/أمين. **ملاحظة:** إذا كان مطلوباً أن يرى العميد كل مجالس الكلية تلقائياً، يلزم تعديل `is_council_admin` أو إضافة helper مخصص في مرحلة لاحقة (خارج نطاق MVP الحالي).

---

## 5. نتائج التحقق من المسارات الحالية

**الكود لم يُعدَّل في هذه المرحلة.** الجداول جديدة ومعزولة تماماً، ولا يوجد أي استيراد لها في `src/**`. المسارات الحالية لا تلمس أي جدول مجالس، ولا يوجد أي احتمال تأثر:

| المسار | متأثر؟ |
|---|---|
| `/admin` | ❌ لا |
| `/admin/academic-councils` | ❌ لا (UI-only، أزرار disabled، لا اتصال DB) |
| `/admin/reports` | ❌ لا |
| `/admin/student-requests` | ❌ لا |
| `/admin/study-plans` | ❌ لا |
| `/student/requests` | ❌ لا |
| `/student/requests/new` | ❌ لا |

التحقق التشغيلي (browser check) سيُنفَّذ في مرحلة `COUNCILS-MVP-DB-VERIFY-01` مع التقارير النهائية.

---

## 6. ملاحظات Linter

Supabase Linter عاد بـ 168 finding، لكن الفحص السريع أظهر أنها **موجودة سابقاً وغير ناتجة عن هذه المرحلة**:

- تحذيرات `Public Bucket Allows Listing` تخص buckets قائمة في Storage (لم نلمس Storage).
- تحذيرات `Public Can Execute SECURITY DEFINER Function` تخص دوال قائمة سابقاً؛ دوال المجالس الخمس الجديدة صادرة صراحة بـ `REVOKE ALL FROM PUBLIC` ثم `GRANT EXECUTE TO authenticated, service_role` فقط، فلا تدخل في هذه الفئة.
- لا يوجد أي `ERROR` أو `CRITICAL` جديد ناتج عن migration المجالس.

**التوصية:** فحص linter تفصيلي لدوال المجالس تحديداً يُنفَّذ في `COUNCILS-MVP-DB-VERIFY-01` لتأكيد عدم إسهامها في العدد.

---

## 7. المخاطر المتبقية

- **R1:** الواجهة الحالية `/admin/academic-councils` UI-only بأزرار disabled — لا خطر تشغيلي.
- **R2:** لم تُعَد `types.ts` بعد على مستوى الكود (Lovable يعيد التوليد تلقائياً بعد الموافقة على migration). يجب التحقق في `VERIFY-01` أن `Database['public']['Tables']` يحتوي جداول `academic_council*`.
- **R3:** المسودة في `docs/drafts/` لم تُنقل — يجب الإبقاء عليها هناك (لا يوجد ملف مطابق داخل `supabase/migrations/` على main، وأداة `supabase--migration` تدير التطبيق داخلياً بمعرف زمني خاص بها).

---

## 8. توصية المرحلة التالية

**READY FOR `COUNCILS-MVP-DB-VERIFY-01`**

المدخلات المطلوبة للمرحلة التالية:
1. تشغيل `supabase--linter` تفصيلياً وفصل findings المجالس عن الموروثة.
2. اختبار RLS برمجياً بحسابات (student / faculty / admin / dean / system_admin).
3. تحقق browser من المسارات السبعة الحرجة.
4. تأكيد إعادة توليد `src/integrations/supabase/types.ts`.
5. تقرير نهائي للاعتماد قبل تفعيل أي CRUD حقيقي في الواجهة (`COUNCILS-MVP-WIRING-01`).

---

## القرار النهائي

**PASS**

- Migration طُبّق بنجاح (schema-only).
- كل الأهداف تحققت: 7 جداول + 5 ENUMs + 5 دوال مساعدة + 3 دوال triggers + 9 triggers + 21 policy.
- لا بيانات، لا Storage، لا إيميلات، لا Scheduled jobs، لا تعديل خارج نطاق المجالس.
- Pilot الحالي غير متأثر.
- المرحلة التالية: `COUNCILS-MVP-DB-VERIFY-01`.
