# STUDENT-REQUEST-TYPES-MIGRATION-REVIEW-01 Report

**التاريخ:** 2026-07-06  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**القرار:** **PASS_WITH_NOTES**  
**المرحلة التالية:** **STUDENT-REQUEST-TYPES-STAGING-APPLY-PREP-01**

---

## 1. Executive Summary

| البند | النتيجة |
|-------|---------|
| **القرار** | **PASS_WITH_NOTES** |
| **جاهزية السلسلة للتطبيق لاحقاً** | ✅ **نعم** — مع موافقة صريحة وترتيب نشر آمن |
| **Blocking issues** | ❌ **لا يوجد** |

**الخلاصة:** سلسلة migrations الثلاثة **متسقة في الترتيب والاعتماديات**، خالية من data writes/seed/VALIDATE، ومتوافقة مع الواجهة الموحدة `/student/requests/*`. يمكن تطبيقها على staging **قبل** data normalization لأن FK `NOT VALID`. الملاحظات غير الحاصرة: نافذة bypass بين `140000` و`150000` عند التطبيق الجزئي، تهيئة workflow خارج RPC، وأكواد يتيمة تاريخية (`reenrollment`, `department_transfer`, `enrollment_certificate`).

---

## 2. Scope

- **مراجعة قراءة فقط** — لم يُطبَّق أو يُعدَّل أي migration.
- **الكتابة الوحيدة:** هذا التقرير.
- ❌ لا DB apply، لا UI/server changes، لا commit/push/PR.

---

## 3. Git State

| البند | القيمة |
|-------|--------|
| **الفرع** | `main` |
| **آخر commits** | `b044459` → `f98252d` → `5728214` → `5191940` → `98daec1` |
| **ملفات معدّلة (خارج نطاق المراجعة)** | UI consolidation + migrations غير متتبعة من مراحل سابقة — **لم تُلمس في هذه المرحلة** |
| **الملف المنشأ** | `docs/STUDENT-REQUEST-TYPES-MIGRATION-REVIEW-01-REPORT.md` فقط |
| **commit / push / PR** | ❌ |

---

## 4. Migrations Reviewed

| Migration | الغرض | يعتمد على | النتيجة | ملاحظات |
|-----------|-------|-----------|---------|---------|
| `20260710130000_student_request_types_schema.sql` | أعمدة audience/display + FK `NOT VALID` | `request_types` موجودة؛ `code` UNIQUE منذ `20260601000207` | ✅ PASS | idempotent؛ لا data writes |
| `20260710140000_student_request_types_rpc_rls.sql` | RPCs + إسقاط `sr_insert_self` + تشديد `sra_insert` | `20260710130000` (`request_audience`, `ineligible_display_mode`) | ✅ PASS | `sr_update_self` عمداً **بدون تغيير** هنا |
| `20260710150000_student_request_types_rls_submit_bypass_fix.sql` | إغلاق bypass submit + flag trigger | `20260710140000` (`submit_student_request`) | ✅ PASS | يستبدل `sr_update_self`, `protect_student_request`, `submit_student_request` |

**ملاحظة:** `20260710120000_council_meeting_schedule_helpers.sql` ضمن نفس الطابع الزمني لكن **خارج سلسلة طلبات الطلاب** — لا تعارض.

---

## 5. Ordering Review

### الترتيب المنطقي

```
20260710130000 (SCHEMA)
    ↓ request_audience, ineligible_display_mode, FK NOT VALID
20260710140000 (RPC/RLS)
    ↓ RPCs تعتمد الأعمدة؛ يحذف sr_insert_self
20260710150000 (SUBMIT-BYPASS-FIX)
    ↓ يغلق UPDATE→submitted؛ يكمّل submit_student_request بـ set_config flag
```

| سؤال | الجواب |
|------|--------|
| هل الترتيب صحيح؟ | ✅ نعم |
| dependency مكسور؟ | ❌ لا |
| تطبيق `150000` بدون `140000`؟ | ❌ يفشل منطقياً — `submit_student_request` غير موجود أو ناقص |
| تطبيق `140000` بدون `130000`؟ | ❌ يفشل — `request_audience` / `ineligible_display_mode` غير موجودين |

### نافذة جزئية (ملاحظة غير حاصرة)

بين `140000` و`150000` فقط:
- `sr_update_self` القديمة (`20260702044232`) ما زالت تسمح `WITH CHECK` يشمل `submitted`.
- `protect_student_request` القديم (`20260706120000`) ما زال يسمح `draft`→`submitted` للطالب.
- **التوصية:** تطبيق الثلاثة في **جلسة واحدة** دون توقف بين `140000` و`150000`.

---

## 6. Schema Migration Review

**الملف:** `20260710130000_student_request_types_schema.sql`  
**النتيجة:** ✅ **PASS**

| المعيار | الحالة |
|---------|--------|
| `ADD COLUMN IF NOT EXISTS request_audience` | ✅ |
| default = `active_student` | ✅ |
| CHECK: `active_student`, `graduate`, `both` | ✅ idempotent DO block |
| `ADD COLUMN IF NOT EXISTS ineligible_display_mode` | ✅ |
| default = `hidden` | ✅ |
| CHECK: `hidden`, `disabled` | ✅ idempotent DO block |
| COMMENT على العمودين | ✅ |
| `DROP CONSTRAINT IF EXISTS sr_type_chk` | ✅ |
| FK `student_requests_type_request_types_code_fk` → `request_types(code)` | ✅ |
| `NOT VALID` | ✅ |
| `VALIDATE CONSTRAINT` | ❌ غير موجود (مقصود) |
| UPDATE/DELETE/INSERT seed | ❌ غير موجود |

### أمان إسقاط `sr_type_chk` قبل FK `NOT VALID`

| الجانب | التقييم |
|--------|---------|
| الصفوف التاريخية | FK `NOT VALID` **لا يفحص** الصفوف الموجودة — الأكواد اليتيمة تبقى |
| INSERT/UPDATE جديد | FK **يفحص فوراً** — `create_student_request` يفشل إن لم يوجد `code` في `request_types` |
| RPC | يختار نوعاً من `request_types` فقط — يقلل خطر أكواد عشوائية |
| admin INSERT | `sr_insert_priv` ما زال يسمح إدخالاً إدارياً — يخضع FK على الصفوف الجديدة |

**الحكم:** إسقاط `sr_type_chk` **آمن للتطبيق** مع FK `NOT VALID` + RPC؛ التوحيد مطلوب فقط قبل `VALIDATE`.

---

## 7. RPC/RLS Migration Review

**الملف:** `20260710140000_student_request_types_rpc_rls.sql`  
**النتيجة:** ✅ **PASS**

### RPCs

| RPC | موجود | ملاحظات |
|-----|--------|---------|
| `get_available_request_types_for_current_student()` | ✅ | لا args؛ `auth.uid()` |
| `create_student_request(p_request_type, p_title, p_form_data, p_student_notes)` | ✅ | يرجع `uuid` |
| `submit_student_request(p_request_id)` | ✅ | يرجع `boolean` |
| `get_my_student_requests(p_limit, p_offset)` | ✅ | افتراضي 50/0 |
| `assert_student_can_use_request_type` | ✅ | helper |
| `current_student_profile_for_auth` | ✅ | helper |
| `student_request_type_is_eligible` | ✅ | helper |

### الأهلية

| حالة الطالب | list RPC | create | submit |
|-------------|----------|--------|--------|
| `active` | `active_student` + `both`؛ graduate types حسب `ineligible_display_mode` | ✅ مع assert | ✅ مع assert |
| `graduated` | `graduate` + `both` | ✅ | ✅ |
| `NOT IN ('active','graduated')` | كل الأنواع `is_disabled=true` + رسالة ثابتة | ❌ ممنوع | ❌ ممنوع |

- لا يقبل `student_id` / `user_id` من العميل — يستخدم `auth.uid()` + `student_profiles`.
- لا service role في migration.
- `SECURITY DEFINER` + `SET search_path = public` على الدوال الحساسة ✅

### Grants

| النمط | الحالة |
|-------|--------|
| `REVOKE ALL FROM PUBLIC` | ✅ لكل الدوال |
| `GRANT EXECUTE TO authenticated` | ✅ |
| `anon` | ❌ غير ممنوح |

### RLS

| التغيير | الحالة |
|---------|--------|
| `DROP POLICY IF EXISTS sr_insert_self` | ✅ يمنع INSERT المباشر للطالب |
| `sra_insert` | ✅ `DROP IF EXISTS` ثم `CREATE` — مالك + `active/graduated` + حالة طلب قابلة للتعديل |
| `sr_update_self` | ⚠️ **بدون تغيير** — يُغلق في `150000` |

- لا data writes في migration نفسه ✅
- لا seed ✅
- لا VALIDATE ✅

---

## 8. Submit Bypass Fix Review

**الملف:** `20260710150000_student_request_types_rls_submit_bypass_fix.sql`  
**النتيجة:** ✅ **PASS**

| المعيار | الحالة |
|---------|--------|
| لا يعدّل ملفات migration سابقة | ✅ migration منفصل |
| `DROP POLICY IF EXISTS sr_update_self` | ✅ |
| `WITH CHECK` لا يشمل `submitted`/`under_review`/`in_review` | ✅ |
| تعديل `draft`/`returned` + `cancelled` | ✅ مسموح |
| `CREATE OR REPLACE protect_student_request` | ✅ |
| رفض `draft/returned*` → `submitted` بدون flag | ✅ EXCEPTION |
| السماح مع `student_request.submit_via_rpc = '1'` | ✅ |
| `submit_student_request` يضبط `set_config` قبل UPDATE | ✅ |
| إعادة فحص ملكية + status + audience | ✅ عبر assert |
| UPDATE بيانات / VALIDATE / seed | ❌ غير موجود |

**ملاحظة:** `submit_student_request` هو `SECURITY DEFINER` — يتجاوز RLS؛ الحماية عبر trigger + assert داخل RPC.

---

## 9. UI Compatibility Review

**النتيجة:** ✅ **PASS** — أسماء وتوقيعات ومخرجات متوافقة

### مطابقة RPC names

| SQL RPC | `student-request-rpc.ts` | متطابق |
|---------|--------------------------|--------|
| `get_available_request_types_for_current_student` | `rpcGetAvailableRequestTypes` | ✅ |
| `create_student_request` | `rpcCreateStudentRequest` | ✅ |
| `submit_student_request` | `rpcSubmitStudentRequest` | ✅ |
| `get_my_student_requests` | `rpcGetMyStudentRequests` | ✅ |

### مطابقة المعاملات

| RPC | SQL params | UI params |
|-----|------------|-----------|
| `create_student_request` | `p_request_type`, `p_title`, `p_form_data`, `p_student_notes` | ✅ نفس الأسماء |
| `submit_student_request` | `p_request_id` | ✅ |
| `get_my_student_requests` | `p_limit`, `p_offset` | ✅ (50, 0) |

### مطابقة المخرجات

| RPC output | UI usage |
|------------|----------|
| `is_eligible`, `is_disabled`, `disabled_reason`, `request_audience`, `requires_attachment` | `/student/requests/new`, mobile | ✅ |
| `uuid` من create | `created.id` عبر admin select لاحق | ✅ |
| `request_type_name_ar` | `student.requests.index.tsx` | ✅ |
| fallback RPC missing | `STUDENT_REQUEST_SERVICE_UPDATING_MSG` | ✅ لا مسار غير آمن |

### مسارات نشطة

| الملف | الحالة |
|-------|--------|
| `student.requests.*` | RPC عبر `student-affairs.functions.ts` |
| `StudentRequestsPortalSummary` | RPC list |
| `mobile.student.requests.tsx` | server fns → RPC |
| `StudentRequestsSection` | `@deprecated` — **غير مُركَّب** |

### direct INSERT/UPDATE حساس (واجهة نشطة)

| النمط | الحالة |
|-------|--------|
| INSERT `student_requests` | ❌ لا |
| UPDATE → `submitted`/`under_review`/`in_review` | ❌ لا |
| UPDATE مسودة / cancel | ✅ مسموح (`saveStudentServiceRequestDraft`, `cancelStudentServiceRequest`) |

### فجوة UI (ملاحظة)

`submitStudentServiceRequest` (server fn) يكمّل **تهيئة workflow steps** عبر `supabaseAdmin` بعد RPC — غير موجود في SQL migration. **مقبول** لأنها عملية إدارية/server-side وليست bypass طالب.

---

## 10. Data Normalization / FK Review

| السؤال | الجواب |
|--------|--------|
| هل يمكن apply قبل normalization؟ | ✅ **نعم** — FK `NOT VALID` يستثني الصفوف التاريخية |
| متى `VALIDATE`؟ | بعد **STUDENT-REQUEST-TYPES-DATA-NORMALIZATION-01** (أو ما يعادلها) |
| أكواد مؤجلة | `reenrollment` → `enrollment_reinstatement`؛ `department_transfer` → `transfer`؛ `enrollment_certificate` (يتيم في `sr_type_chk` سابقاً) |
| خطر إسقاط `sr_type_chk`؟ | يُخفَّف بـ FK على الصفوف الجديدة + RPC يختار من `request_types` فقط |
| UPDATE بيانات في migrations؟ | ❌ لا |

**المرحلة المقترحة للتوحيد:** `STUDENT-REQUEST-TYPES-DATA-NORMALIZATION-01` → ثم `VALIDATE CONSTRAINT student_requests_type_request_types_code_fk`.

---

## 11. Apply Readiness

### التوصية: **READY_FOR_STAGING_APPLY_WITH_APPROVAL**

| المعيار | الحالة |
|---------|--------|
| ترتيب صحيح | ✅ |
| idempotency كافية | ✅ (IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE) |
| duplicate policy risk | ✅ مُخفَّف — `DROP POLICY IF EXISTS` قبل CREATE |
| duplicate constraint risk | ✅ DO blocks تفحص `pg_constraint` |
| duplicate FK risk | ✅ IF NOT EXISTS في DO block |
| triggers | ✅ `CREATE OR REPLACE` على `protect_student_request` |
| grants | ✅ آمنة |
| blocking apply failure | ❌ لا يُتوقَّع عند تطبيق سلسلة كاملة على DB نظيفة من نفس baseline |

### مخاطر staging/production (ملاحظات)

| المخاطرة | التأثير | التخفيف |
|----------|---------|---------|
| apply migrations بدون UI الجديد | INSERT/UPDATE مباشر من كود قديم **يفشل** | نشر UI الموحّد مع/قبل migrations |
| نشر UI بدون migrations | RPCs غير موجودة → رسالة «قيد التحديث» | آمن؛ لا bypass |
| تطبيق `140000` فقط ثم توقف | bypass submit مؤقت | تطبيق `150000` فوراً في نفس الجلسة |
| أكواد يتيمة تاريخية | قراءة فقط؛ لا يمنع apply | normalization لاحقاً قبل VALIDATE |

---

## 12. Recommended Safe Apply Order

**لا يُنفَّذ في هذه المرحلة — للموافقة اللاحقة فقط:**

1. **موافقة صريحة** من المستخدم على تطبيق staging.
2. **نسخة احتياطية / snapshot** لقاعدة staging.
3. **تطبيق migrations بالترتيب في جلسة واحدة:**
   - `20260710130000_student_request_types_schema.sql`
   - `20260710140000_student_request_types_rpc_rls.sql`
   - `20260710150000_student_request_types_rls_submit_bypass_fix.sql`
4. **Smoke محدود** (بعد apply فقط):
   - طالب `active` — list / create draft / submit
   - طالب `graduated` — أنواع graduate/both
   - طالب `NOT IN (active, graduated)` — كل الأنواع disabled + create/submit مرفوض
   - مستخدم بلا `student_profile` — list فارغ / رسالة مناسبة
5. **commit/PR** للكود (migrations + UI) إن طُلب — بعد نجاح staging smoke.
6. **production:** تطبيق migrations ثم نشر UI **معاً** (أو migrations أولاً ثم UI خلال نافذة قصيرة).

**ترتيب النشر الآمن للإنتاج:** migrations أولاً (أو معاً مع UI) — لأن UI الجديد يعتمد RPCs؛ الكود القديم المنشور **سينكسر** عند إسقاط `sr_insert_self` حتى لو بقي UI قديماً.

---

## 13. Deferred Items

- DATA-NORMALIZATION (`reenrollment`, `department_transfer`, `enrollment_certificate`)
- `VALIDATE CONSTRAINT student_requests_type_request_types_code_fk`
- seed `request_audience` per type
- fees (`STUDENT-REQUEST-FEES-01`)
- مرفقات في `/student/requests/new`
- تهيئة workflow steps داخل `submit_student_request` RPC
- E2E smoke (بعد apply)
- production publish
- حذف `StudentRequestsSection.tsx` legacy

---

## 14. Issues Found

### Blocking issues

**No blocking issues found.**

### Non-blocking notes

| # | الملاحظة | الخطورة |
|---|----------|---------|
| 1 | نافذة bypass بين `140000` و`150000` عند التطبيق الجزئي | منخفضة — يُغلق بتطبيق متتابع |
| 2 | `submit_student_request` لا يهيّئ workflow steps | منخفضة — UI server fn يكمّل |
| 3 | أكواد يتيمة تاريخية قبل VALIDATE | متوسطة لاحقاً — لا تمنع apply الآن |
| 4 | migrations + UI يجب تنسيق نشرهما | تشغيلية |
| 5 | `140000` يترك `sr_update_self` القديمة عمداً | يُحل في `150000` |

---

## 15. Recommended Next Phase

### **STUDENT-REQUEST-TYPES-STAGING-APPLY-PREP-01**

- إعداد أمر/خطة تطبيق staging فقط (Lovable/Supabase) **بدون تنفيذ** ما لم يوافق المستخدم صراحة.
- تضمين checklist smoke والحسابات التجريبية.
- لا E2E smoke قبل apply.

---

## 16. No-Write Assurance

| العنصر | تم؟ |
|--------|-----|
| إنشاء migration | ❌ |
| تعديل migration | ❌ |
| تشغيل migration | ❌ |
| تعديل قاعدة البيانات | ❌ |
| data writes | ❌ |
| service role | ❌ |
| تعديل UI/server/routes | ❌ |
| commit / push / PR | ❌ |

**الملف الوحيد المُنشأ:** `docs/STUDENT-REQUEST-TYPES-MIGRATION-REVIEW-01-REPORT.md`

---

*نهاية التقرير — STUDENT-REQUEST-TYPES-MIGRATION-REVIEW-01*
