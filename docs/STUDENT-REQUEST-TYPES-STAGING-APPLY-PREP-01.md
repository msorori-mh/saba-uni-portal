# STUDENT-REQUEST-TYPES-STAGING-APPLY-PREP-01

**التاريخ:** 2026-07-06  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**GitHub:** `msorori-mh/saba-uni-portal`  
**القرار:** **READY_FOR_STAGING_APPLY_WITH_EXPLICIT_APPROVAL**  
**المرحلة التالية (بعد موافقة صريحة):** **STUDENT-REQUEST-TYPES-STAGING-APPLY-01**

---

## 1. Executive Summary

| البند | النتيجة |
|-------|---------|
| **القرار** | **READY_FOR_STAGING_APPLY_WITH_EXPLICIT_APPROVAL** |
| **هل يمكن تجهيز أمر التطبيق؟** | ✅ **نعم** — الإجراء والـ checklist والتحقق موثّقة أدناه |
| **موانع قبل التطبيق** | ❌ **لا موانع تقنية** — يتطلب فقط موافقة صريحة + بيئة staging + نسخة احتياطية |

**الخلاصة:** سلسلة migrations الثلاثة جاهزة للتطبيق على **staging فقط** بعد عبارة موافقة صريحة من المستخدم. لا blocking issues من مراجعة `MIGRATION-REVIEW-01`. FK `NOT VALID` يسمح بالتطبيق قبل data normalization. **لا يُنفَّذ أي تطبيق في هذه المرحلة.**

---

## 2. Scope

هذه المرحلة:

- **إعداد وتخطيط فقط** — خطة تطبيق staging لاحقاً.
- ❌ لا تشغيل migration.
- ❌ لا اتصال بقاعدة البيانات للكتابة.
- ❌ لا Lovable apply / Supabase push / SQL Editor تنفيذ.
- **الملف الوحيد المُنشأ:** هذا المستند.

---

## 3. Git State

| البند | القيمة |
|-------|--------|
| **الفرع** | `main` |
| **آخر commits** | `b044459` → `f98252d` → `5728214` → `5191940` → `98daec1` |
| **commit / push / PR** | ❌ لم يُنفَّذ في هذه المرحلة |

### ملفات غير متتبعة — مراحل طلبات الطلاب

| المسار | النوع |
|--------|-------|
| `supabase/migrations/20260710130000_student_request_types_schema.sql` | migration |
| `supabase/migrations/20260710140000_student_request_types_rpc_rls.sql` | migration |
| `supabase/migrations/20260710150000_student_request_types_rls_submit_bypass_fix.sql` | migration |
| `docs/STUDENT-REQUEST-TYPES-*.md` (تقارير المراحل) | توثيق |
| `src/lib/student-request-rpc.ts` | UI consolidation |
| `src/lib/student-affairs.functions.ts` | UI consolidation (معدّل) |
| `src/components/portal/StudentRequestsPortalSummary.tsx` | UI consolidation |
| `src/routes/student.requests.*`, `student.index.tsx`, `mobile.student.requests.tsx` | UI consolidation |

### ملفات معدّلة غير متتبعة — يجب عدم لمسها في مرحلة التطبيق

| المسار | ملاحظة |
|--------|--------|
| `src/routeTree.gen.ts` | مُولَّد — unrelated لـ apply |
| `docs/PILOT-TEST-ACCOUNTS-MATRIX-01-REPORT.md` | unrelated |
| `src/components/portal/StudentRequestsSection.tsx` | deprecated — لا يُركَّب |

**تنبيه:** migrations وUI consolidation **غير مُلتزَمَة في git** حتى الآن — يُفضَّل commit/PR قبل أو مع دورة staging apply إن طُلب لاحقاً.

---

## 4. Migrations to Apply on Staging

| # | الملف | الغرض | يعتمد على | Data writes | VALIDATE | ملاحظات |
|---|-------|-------|-----------|-------------|----------|---------|
| 1 | `20260710130000_student_request_types_schema.sql` | `request_audience` + `ineligible_display_mode`؛ DROP `sr_type_chk`؛ FK `NOT VALID` | `request_types`, `student_requests` موجودان؛ `request_types.code` UNIQUE | **لا** | **لا** | idempotent (`IF NOT EXISTS`, DO blocks) |
| 2 | `20260710140000_student_request_types_rpc_rls.sql` | RPCs أهلية؛ DROP `sr_insert_self`؛ تشديد `sra_insert` | `20260710130000` (أعمدة audience) | **لا** | **لا** | يترك `sr_update_self` القديمة عمداً |
| 3 | `20260710150000_student_request_types_rls_submit_bypass_fix.sql` | إغلاق bypass submit؛ `submit_via_rpc` flag؛ استبدال `sr_update_self` + trigger | `20260710140000` (`submit_student_request`) | **لا** | **لا** | **يجب أن يليه فوراً #2 في نفس الجلسة** |

### تفاصيل كل migration

#### 1 — SCHEMA (`20260710130000`)

- `ADD COLUMN IF NOT EXISTS request_audience` — default `active_student` — CHECK: `active_student | graduate | both`
- `ADD COLUMN IF NOT EXISTS ineligible_display_mode` — default `hidden` — CHECK: `hidden | disabled`
- COMMENTs على العمودين
- `DROP CONSTRAINT IF EXISTS sr_type_chk`
- FK `student_requests_type_request_types_code_fk` → `request_types(code)` **`NOT VALID`**
- لا UPDATE/INSERT/DELETE seed

#### 2 — RPC/RLS (`20260710140000`)

- Helpers: `current_student_profile_for_auth`, `assert_student_can_use_request_type`, …
- RPCs: `get_available_request_types_for_current_student`, `create_student_request`, `submit_student_request`, `get_my_student_requests`
- `DROP POLICY IF EXISTS sr_insert_self`
- `DROP POLICY IF EXISTS sra_insert` + `CREATE POLICY sra_insert`
- Grants: `REVOKE PUBLIC` + `GRANT EXECUTE TO authenticated` فقط

#### 3 — SUBMIT BYPASS FIX (`20260710150000`)

- `DROP POLICY IF EXISTS sr_update_self` + سياسة جديدة (لا `submitted`/`under_review`/`in_review` في WITH CHECK)
- `CREATE OR REPLACE protect_student_request` — رفض submit المباشر؛ السماح مع `student_request.submit_via_rpc`
- `CREATE OR REPLACE submit_student_request` — `set_config` قبل UPDATE
- Grants لـ `submit_student_request`

---

## 5. Critical Apply Rule

> **يجب تطبيق migrations الثلاثة في جلسة واحدة وبالترتيب الزمني نفسه.**

```
20260710130000  →  20260710140000  →  20260710150000
     SCHEMA            RPC/RLS           BYPASS-FIX
```

**لا يجب التوقف** بعد:

`20260710140000_student_request_types_rpc_rls.sql`

**وقبل:**

`20260710150000_student_request_types_rls_submit_bypass_fix.sql`

**السبب:** بين `140000` و`150000` فقط تبقى نافذة bypass مؤقتة:
- `sr_update_self` القديمة (`20260702044232`) تسمح `WITH CHECK` يشمل `submitted`
- `protect_student_request` القديم (`20260706120000`) يسمح `draft`→`submitted` للطالب مباشرة
- `sr_insert_self` يكون مُسقَطاً بعد `140000` — INSERT المباشر ممنوع لكن UPDATE→submitted ما زال ممكناً

**الحل:** تطبيق `150000` **فوراً** في نفس الجلسة دون فاصل.

---

## 6. Pre-Apply Checklist

**لا يُنفَّذ في هذه المرحلة — للموافقة اللاحقة:**

- [ ] البيئة المستهدفة هي **staging** وليست production
- [ ] نسخة احتياطية / restore point (Supabase backup أو Lovable snapshot) قبل التطبيق
- [ ] موافقة صريحة من المستخدم (انظر §13)
- [ ] كود UI الموحّد (`/student/requests/*` + RPC wrappers) **منشور على staging** أو جاهز في نفس دورة التحقق
- [ ] التحقق من عدم وجود apply جزئي سابق لهذه الثلاثة (فحص `supabase_migrations.schema_migrations` أو Lovable migration history)
- [ ] جدول `request_types` موجود
- [ ] جدول `student_requests` موجود
- [ ] `request_types.code` له UNIQUE constraint (منذ `20260601000207`)
- [ ] `student_profiles.status` يستخدم `active` و`graduated` للأهلية
- [ ] **لا** `VALIDATE CONSTRAINT`
- [ ] **لا** data normalization (`reenrollment`, `department_transfer`)
- [ ] **لا** seed لـ `request_audience` per type
- [ ] **لا** production publish

---

## 7. Suggested Apply Command / Procedure

**لا يُنفَّذ الآن — للتطبيق لاحقاً بعد الموافقة الصريحة.**

### الخيار أ — Lovable / Supabase SQL Editor (موصى به للتحكم اليدوي)

1. افتح **مشروع staging فقط** (ليس production).
2. أنشئ restore point / backup.
3. افتح الملفات بالترتيب من المستودع المحلي:
   - `supabase/migrations/20260710130000_student_request_types_schema.sql`
   - `supabase/migrations/20260710140000_student_request_types_rpc_rls.sql`
   - `supabase/migrations/20260710150000_student_request_types_rls_submit_bypass_fix.sql`
4. انسخ محتوى كل ملف **كاملاً** والصقه في SQL Editor.
5. نفّذ **الملف الأول** → انتظر نجاحاً كاملاً.
6. **فوراً** نفّذ **الملف الثاني** → انتظر نجاحاً كاملاً **دون توقف**.
7. **فوراً** نفّذ **الملف الثالث** → انتظر نجاحاً كاملاً.
8. راقب أي error في كل خطوة.

**قواعد الفشل:**

| الحالة | الإجراء |
|--------|---------|
| فشل migration #1 | **توقف** — لا تطبق #2 أو #3؛ راجع الخطأ |
| فشل migration #2 | **توقف** — لا تطبق #3؛ سجّل الخطأ؛ لا تنشر UI |
| فشل migration #3 بعد نجاح #1 و#2 | **أولوية عالية** — نافذة bypass قد تبقى؛ جهّز forward-fix (لا حل عشوائي) |

### الخيار ب — Supabase CLI (لاحقاً)

```bash
# ⚠️ لا تنفّذ الآن — للمرجع فقط
# تأكد أن SUPABASE_PROJECT_REF يشير إلى مشروع STAGING فقط

supabase link --project-ref <STAGING_PROJECT_REF>

# تطبيق migrations المعلّقة فقط — راجع القائمة قبل التنفيذ
supabase db push
```

**قيود:**

- يوجّه إلى **staging project فقط**
- لا production credentials
- لا service role في المتصفح
- لا تضمين أسرار أو connection strings في هذا المستند

### الخيار ج — Lovable Apply (لاحقاً)

- استخدم آلية Lovable المعتادة لتطبيق migrations من المستودع
- تأكد أن الفرع يحتوي الثلاثة migrations
- طبّق الثلاثة في **دفعة واحدة** إن أمكن؛ وإلا طبّق بالترتيب دون فاصل بين #2 و#3

---

## 8. Post-Apply Verification Plan

**قراءة فقط — بعد التطبيق على staging:**

### فحوصات SQL (SELECT / catalog queries)

```sql
-- 1. الأعمدة الجديدة
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'request_types'
  AND column_name IN ('request_audience', 'ineligible_display_mode');

-- 2. CHECK constraints
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.request_types'::regclass
  AND conname IN ('request_types_request_audience_chk', 'request_types_ineligible_display_mode_chk');

-- 3. FK NOT VALID
SELECT conname, convalidated
FROM pg_constraint
WHERE conname = 'student_requests_type_request_types_code_fk';
-- المتوقع: convalidated = false

-- 4. sr_type_chk مُسقَط
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.student_requests'::regclass AND conname = 'sr_type_chk';
-- المتوقع: لا صفوف

-- 5. RPCs موجودة
SELECT proname FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND proname IN (
    'get_available_request_types_for_current_student',
    'create_student_request',
    'submit_student_request',
    'get_my_student_requests'
  );

-- 6. sr_insert_self مُسقَط
SELECT policyname FROM pg_policies
WHERE tablename = 'student_requests' AND policyname = 'sr_insert_self';
-- المتوقع: لا صفوف

-- 7. sr_update_self — WITH CHECK لا يشمل submitted
SELECT qual, with_check FROM pg_policies
WHERE tablename = 'student_requests' AND policyname = 'sr_update_self';
-- راجع أن with_check لا يسمح submitted/under_review/in_review
```

### فحوصات UI على staging (يدوياً لاحقاً)

| السيناريو | المتوقع |
|-----------|---------|
| طالب `active` | list/create/submit عبر `/student/requests/*` |
| طالب `graduated` | أنواع graduate/both فقط |
| طالب غير `active` وغير `graduated` | كل الأنواع disabled + رسالة الأهلية |
| مستخدم بلا `student_profile` | لا بيانات طالب آخر؛ رسالة مناسبة |

---

## 9. Smoke Test Plan

**لا يُنفَّذ في هذه المرحلة — بعد apply + نشر UI على staging:**

### Active Student

| الخطوة | المتوقع |
|--------|---------|
| فتح `/student/requests/new` | يرى `active_student` + `both` مفعّلة |
| أنواع `graduate` | disabled (أو hidden حسب `ineligible_display_mode`) |
| إنشاء draft | نجاح عبر `create_student_request` |
| إرسال | نجاح عبر `submit_student_request` |
| محاولة UPDATE مباشر → `submitted` | **فشل** (RLS + trigger) |

### Graduate

| الخطوة | المتوقع |
|--------|---------|
| قائمة الأنواع | `graduate` + `both` فقط |
| `active_student` | hidden أو disabled |
| create + submit لنوع مؤهل | نجاح |

### Ineligible Student

أي `student_profiles.status` **ليس** `active` **وليس** `graduated` (مفصول، موقوف قيد، محروم، …):

| الخطوة | المتوقع |
|--------|---------|
| قائمة الأنواع | كلها **disabled** وباهتة |
| create | **مرفوض** |
| submit | **مرفوض** |
| الرسالة | «لا يمكنك تقديم طلبات حالياً بسبب حالة القيد الأكاديمي. يرجى مراجعة شؤون الطلاب.» |

### No Student Profile

| الخطوة | المتوقع |
|--------|---------|
| list types | فارغ أو رسالة مناسبة |
| create | **مرفوض** — لا ملف طالب |
| لا تسريب | لا طلبات طلاب آخرين |

### حسابات مقترحة

راجع `docs/PILOT-TEST-ACCOUNTS-MATRIX-01-REPORT.md` إن وُجدت حسابات staging جاهزة؛ وإلا أنشئ/استخدم حسابات pilot معروفة لكل سيناريو.

---

## 10. Rollback / Failure Strategy

| المبدأ | التفاصيل |
|--------|----------|
| **لا rollback عشوائي** | لا DROP policies/functions دون خطة forward-fix |
| فشل قبل أي migration | لا تغيير على DB |
| فشل بعد #1 فقط | توقف؛ راجع الخطأ؛ DB قد يحتوي أعمدة/FK جزئية — لا تطبق #2/#3 |
| فشل بعد #2 | توقف؛ **لا تنشر UI**؛ INSERT مباشر للطالب ممنوع؛ bypass submit مفتوح — أولوية إصلاح |
| فشل #3 بعد نجاح #1+#2 | **أولوية عالية** — bypass submit مفتوح؛ جهّز migration forward-fix أو أكمل #3 يدوياً بعد مراجعة |
| **لا** reset DB | إلا بقرار إداري منفصل |
| **لا** cleanup عشوائي | لا حذف policies/RPCs بدون توثيق |

**ملاحظة:** migrations مصممة idempotent نسبياً (`IF NOT EXISTS`, `DROP IF EXISTS`, `CREATE OR REPLACE`) — إعادة محاولة **بعد** فهم الخطأ قد تكون ممكنة؛ لا تُعد محاولة عمياء.

---

## 11. Production Notes

- **هذه المرحلة staging فقط.**
- **production يحتاج قراراً منفصلاً** وموافقة صريحة مستقلة.
- في production يجب تنسيق:
  1. تطبيق migrations الثلاثة (جلسة واحدة)
  2. نشر UI الجديد (`/student/requests/*` + RPCs)
  3. عدم ترك الكود القديم (`StudentRequestsSection`, INSERT/UPDATE مباشر) يعمل مع RLS الجديدة
- الكود القديم المنشور **سيفشل** بعد `140000` (إسقاط `sr_insert_self`) حتى لو بقي UI قديماً
- **لا production publish في هذه المرحلة**

---

## 12. Deferred Items

| البند | المرحلة المقترحة |
|-------|------------------|
| DATA-NORMALIZATION: `reenrollment` → `enrollment_reinstatement` | STUDENT-REQUEST-TYPES-DATA-NORMALIZATION-01 |
| DATA-NORMALIZATION: `department_transfer` → `transfer` | نفس المرحلة |
| `VALIDATE CONSTRAINT student_requests_type_request_types_code_fk` | بعد normalization |
| SEED-CONFIG لـ `request_audience` per type | لاحقاً |
| FEES | STUDENT-REQUEST-FEES-01 |
| مرفقات في `/student/requests/new` | STUDENT-REQUEST-ATTACHMENTS-01 |
| E2E smoke بحسابات فعلية | بعد STAGING-APPLY-01 |
| Commit/PR لـ migrations + UI | عند طلب المستخدم |
| Production apply/publish | قرار منفصل |

---

## 13. Recommended Next Step

### **STUDENT-REQUEST-TYPES-STAGING-APPLY-01**

**لا يُنفَّذ إلا بعد موافقة المستخدم الصريحة**, مثلاً:

> «نعم، طبّق migrations على staging»

عند الموافقة:

1. تنفيذ Pre-Apply Checklist (§6)
2. تطبيق الثلاثة migrations في جلسة واحدة (§5, §7)
3. Post-Apply Verification (§8)
4. Smoke Test على staging (§9)
5. توثيق النتيجة في `STUDENT-REQUEST-TYPES-STAGING-APPLY-01-REPORT.md`

---

## 14. No-Write Assurance

| العنصر | تم؟ |
|--------|-----|
| تشغيل migration | ❌ |
| تطبيق DB changes | ❌ |
| data writes | ❌ |
| service role | ❌ |
| تعديل migrations | ❌ |
| تعديل UI/server/routes | ❌ |
| commit / push / PR | ❌ |

**الملف الوحيد المُنشأ:** `docs/STUDENT-REQUEST-TYPES-STAGING-APPLY-PREP-01.md`

---

*نهاية الخطة — STUDENT-REQUEST-TYPES-STAGING-APPLY-PREP-01*
