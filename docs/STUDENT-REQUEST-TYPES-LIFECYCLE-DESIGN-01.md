# STUDENT-REQUEST-TYPES-LIFECYCLE-DESIGN-01

**التاريخ:** 2026-07-06  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**GitHub:** [msorori-mh/saba-uni-portal](https://github.com/msorori-mh/saba-uni-portal)  
**المصدر:** [STUDENT-REQUEST-TYPES-LIFECYCLE-AUDIT-01-REPORT.md](./STUDENT-REQUEST-TYPES-LIFECYCLE-AUDIT-01-REPORT.md) (PASS_WITH_NOTES)  
**القرار التصميمي:** **READY_FOR_IMPLEMENTATION_WITH_USER_APPROVAL**  
**أول مرحلة تنفيذ مقترحة:** **STUDENT-REQUEST-TYPES-SCHEMA-01** (بعد إجابة §16)

---

## 1. Executive Summary

نظام طلبات الطلاب في البوابة **ليس فارغاً** — البنية الأساسية موجودة: `request_types` كـ master data، `student_requests` مع workflow (`workflow_schema` + `student_service_request_steps` + `student_service_request_events`)، مرفقات، RLS جزئي، وواجهات طالب/إدارة.

**المطلوب ليس بناء نظام من الصفر**، بل:

1. إضافة **جمهور الطلب** (`request_audience`: مستمر / خريج / مشترك).
2. إضافة **وضع العرض لغير المؤهلين** (`ineligible_display_mode`: مخفي / معطّل).
3. **توحيد الأكواد** وإزالة تعارض `sr_type_chk` مع `request_types`.
4. **عقود RPC آمنة** للقائمة والإنشاء والإرسال — الحماية في DB وليس UI فقط.
5. **توحيد الواجهة** على مسار `/student/requests/*` وإيقاف المسار القديم تدريجياً.
6. تأجيل **الرسوم** لمرحلة لاحقة ما لم يُطلب خلاف ذلك.

**القرار:** **READY_FOR_IMPLEMENTATION_WITH_USER_APPROVAL** — التصميم جاهز للتنفيذ على مراحل، لكن **يجب موافقة المستخدم** على القرارات في §16 قبل كتابة أول migration.

---

## 2. Design Scope

| ضمن النطاق | خارج النطاق |
|------------|-------------|
| تصميم أعمدة، enums، RPCs، RLS، UI، مراحل تنفيذ | migrations فعلية |
| توصيات توحيد أكواد وواجهات | seed / تفعيل أنواع في DB |
| عقود دوال وسلوك متوقع | تعديل TypeScript / React / SQL |
| مخاطر وقرارات مطلوبة | commit / push / PR |

**الكتابة الوحيدة في هذه المرحلة:** هذا الملف.

---

## 3. Current Foundation

### جداول وكيانات

| الكيان | الدور الحالي |
|--------|--------------|
| **`request_types`** | Master data: `code`, `name_ar`, `is_active`, `student_visible`, `requires_attachment`, `required_documents`, `form_schema`, `workflow_schema`, `category`, `sort_order` |
| **`student_requests`** | طلب فردي: `student_profile_id`, `request_type`, `status`, `form_data`, `request_number`, خطوة workflow حالية |
| **`student_request_attachments`** | مرفقات مرتبطة بـ `request_id` + bucket `student-request-attachments` |
| **`student_service_request_steps`** | خطوات runtime لكل طلب |
| **`student_service_request_events`** | سجل أحداث/انتقالات |
| **جداول `*_details`** | بيانات نوعية (غياب، وقف قيد، كشف رسمي، …) |

### Workflow

- **تعريف:** `request_types.workflow_schema.steps[]` (مفتاح، عنوان عربي، `role_key`, إجراءات).
- **تشغيل:** عند `submit` تُنشأ الخطوات؛ الإدارة تتقدم عبر server functions (`student-affairs.functions.ts`).
- **حالات:** `draft`, `submitted`, `in_review`, `under_review`, `returned`, `returned_for_completion`, `approved`, `rejected`, `cancelled`, `completed`.

### الواجهات

| المسار | الحالة |
|--------|--------|
| `/student/requests/*` + `student-affairs.functions.ts` | **جديد** — workflow عام |
| `StudentRequestsSection` في `/student` | **قديم** — نماذج مباشرة لأنواع محددة (~1900 سطر) |
| `/admin/student-requests`, `/admin/request-types` | إدارة |

### مصدر حالة الطالب

- **رسمي:** `student_profiles.status`
- **قيم ذات صلة:** `active`, `graduated`, `suspended`, `withdrawn`, `transferred`
- **مساعد:** `student_academic_status.enrollment_status` (قيد فصلي — لا يعوّض `graduated`)

---

## 4. Student Eligibility Model

### التعريفات المعتمدة في التصميم

| فئة الطالب | الشرط الأساسي | ملاحظات |
|------------|---------------|---------|
| **طالب مستمر (active_student)** | `student_profiles.status = 'active'` | يُفضّل أيضاً `enrollment_status = 'active'` لطلبات تتطلب قيداً فعّالاً (مثل شهادة قيد) |
| **خريج (graduate)** | `student_profiles.status = 'graduated'` | المصدر الرسمي الوحيد للتخرج المعتمد |
| **غير مؤهل لطلبات الخدمة** | `suspended`, `withdrawn`, `transferred` | سياسة افتراضية: **لا إنشاء** طلبات جديدة إلا باستثناءات إدارية لاحقة |

### قاعدة التخرج (إلزامية في المنطق)

> **لا يُعتبر الطالب خريجاً بمجرد إكمال كل المواد أو الظهور في «مرشحو التخرج».**  
> الخريج فقط عند **اعتماد إداري** يحوّل `student_profiles.status` إلى `'graduated'`.

- «مرشحو التخرج» (`getGraduationCandidates`) = **أهلية أكاديمية** ≠ **حالة خريج**.
- اعتماد التخرج = إجراء إداري صريح (مستقبلاً: RPC `approve_student_graduation` — **خارج نطاق هذه المرحلة**).

### حالات وسيطة مستقبلية (لا تُنفَّذ الآن)

| حالة مقترحة | الغرض المحتمل | التوصية |
|-------------|---------------|---------|
| `pending_graduation` | أكمل متطلبات لكن لم يُعتمد التخرج | مرحلة لاحقة إن لزم تمييز UI |
| `cleared` | أخلى side مالي/إداري قبل التخرج | مرحلة لاحقة مع الرسوم |
| `inactive` | خريج قديم بلا حساب دخول | مرحلة لاحقة |

**للتنفيذ الأول:** الاكتفاء بـ `active` و `graduated` + رفض الباقي عند الإنشاء.

### دالة مساعدة مقترحة (SQL — لاحقاً)

```text
resolve_student_audience_role(profile_id) → 'active_student' | 'graduate' | 'ineligible'
```

- `active` → `active_student`
- `graduated` → `graduate`
- غير ذلك → `ineligible` (مع رسالة عربية حسب `status`)

---

## 5. Request Audience Design

### الحقل الجديد

```sql
-- مقترح على request_types (تنفيذ لاحق)
request_audience text NOT NULL DEFAULT 'active_student'
  CHECK (request_audience IN ('active_student', 'graduate', 'both'))
```

### المعنى

| القيمة | الجمهور | أمثلة |
|--------|---------|-------|
| `active_student` | طلاب مستمرون فقط | غياب بعذر، وقف قيد، تظلم، تحويل قسم |
| `graduate` | خريجون فقط | شهادة تخرج نهائية، شهادة تخرج مؤقتة |
| `both` | الطرفان | كشف درجات رسمي، شهادة قيد (حسب سياسة الكلية) |

### لماذا `request_types` وليس `student_requests`؟

- الجمهور **خاصية نوع الخدمة** وليست قراراً لكل طلب.
- يبسط القائمة، RPC، والـ RLS: نوع واحد = قاعدة واحدة.
- الطلب الفردي يرث الجمهور من `request_type` وقت الإنشاء (يمكن لاحقاً snapshot في `student_requests.audience_at_submit` اختياري للتدقيق).

### علاقة مع `student_visible`

| الحقل | الدور |
|-------|--------|
| `is_active` | هل النوع مفعّل في النظام؟ |
| `student_visible` | هل يظهر في بوابة الطالب/الخريج أصلاً؟ (staff-only types = false) |
| `request_audience` | **لمن** المفعّل من حيث الأهلية؟ |

ترتيب الفلترة في RPC:

1. `is_active = true`
2. `student_visible = true`
3. تطابق `request_audience` مع دور الطالب
4. تطبيق `ineligible_display_mode` للأنواع غير المطابقة (إن وُجدت في قائمة موسّعة للإدارة فقط — انظر §14)

---

## 6. Ineligible Display Mode Design

### الحقل الاختياري

```sql
ineligible_display_mode text NOT NULL DEFAULT 'hidden'
  CHECK (ineligible_display_mode IN ('hidden', 'disabled'))
```

### السلوك

| الوضع | للمستخدم غير المؤهل |
|-------|---------------------|
| `hidden` | لا يظهر النوع في القائمة |
| `disabled` | يظهر باهتاً، غير قابل للنقر، مع `ineligibility_reason_ar` |

### القيم الافتراضية المقترحة (قابلة للتعديل من المستخدم §16)

| سيناريو | افتراضي مقترح |
|---------|---------------|
| طلب `graduate` أمام طالب `active` | `disabled` — توعية: «متاح بعد التخرج» |
| طلب `active_student` أمام خريج | `hidden` — لا فائدة من إظهاره |
| طلبات حساسة (فصل، شطب) | `hidden` حتى للمستمر غير المؤهل حسب قيود إضافية لاحقة |

### حقل مساعد اختياري (لاحقاً)

```text
ineligibility_reason_ar text  -- مثال: «هذا الطلب متاح للخريجين فقط»
```

يمكن أيضاً تخزينه في `form_schema` أو قالب ثابت حسب `request_audience`.

---

## 7. Request Type Codes Normalization

### المشكلة

| كود في workflow seed (20260706120000) | كود في `sr_type_chk` (20260627120000) |
|---------------------------------------|---------------------------------------|
| `reenrollment` | `enrollment_reinstatement` |
| `department_transfer` | `transfer` |
| `enrollment_certificate` | غير مدرج |
| — | `extra_chance`, `equivalency` موجودان في chk لكن ليسا في seed النشط |

**النتيجة:** INSERT قد يفشل؛ ازدواجية بيانات؛ UI قديم يستخدم أكواداً مختلفة عن workflow الجديد.

### الخيارات

| # | الخيار | إيجابيات | سلبيات |
|---|--------|----------|--------|
| 1 | توسيع `sr_type_chk` بأكواد جديدة | بسيط قصير المدى | يتكرر مع كل نوع جديد |
| 2 | توحيد الأكواد إلى القديمة (`reenrollment` → `enrollment_reinstatement`) | توافق مع بيانات قديمة | أسماء أقل وضوحاً في workflow seed |
| 3 | **إسقاط `sr_type_chk` واستبداله بـ FK** `student_requests.request_type` → `request_types(code)` | master data واحد؛ لا صيانة قائمة ثابتة | يتطلب migration حذر + بيانات يتيمة |

### التوصية: **الخيار 3 (FK إلى `request_types.code`)**

**الأسباب:**

1. `request_types` هي بالفعل master data مع CRUD إداري.
2. check constraint يتعارض مع إضافة أنواع من `/admin/request-types` دون migration.
3. الأمان الحقيقي = **RPC + أهلية** وليس قائمة نصوص ثابتة.
4. بعد FK، أي `code` غير موجود في `request_types` يُرفض تلقائياً.

### خطة ترحيل أكواد (تنفيذ لاحق — SCHEMA-01)

| الإجراء | التفاصيل |
|---------|----------|
| A | توحيد canonical codes في جدول mapping تصميمي |
| B | تحديث صفوف `student_requests` و`request_types` المتعارضة |
| C | إضافة FK: `ALTER TABLE student_requests ADD CONSTRAINT sr_request_type_fk FOREIGN KEY (request_type) REFERENCES request_types(code)` |
| D | `DROP CONSTRAINT sr_type_chk` |

### جدول توحيد مقترح (canonical)

| canonical `code` | يستبدل / يدمج | `request_audience` المقترح |
|------------------|---------------|---------------------------|
| `absence_excuse` | — | `active_student` |
| `enrollment_suspension` | — | `active_student` |
| `enrollment_reinstatement` | alias seed: `reenrollment` | `active_student` |
| `transfer` | alias seed: `department_transfer` | `active_student` |
| `equivalency` | — | `active_student` |
| `extra_chance` | — | `active_student` |
| `grade_appeal` | — | `active_student` |
| `official_transcript` | — | `both` (مع تحقق `active` إضافي حالياً — يُراجع) |
| `enrollment_certificate` | — | `both` أو `active_student` (قرار مستخدم) |
| `temporary_graduation_certificate` | كتالوج | `graduate` |
| `final_graduation_certificate` | كتالوج | `graduate` |

**توصية الاسم:** اعتماد **`enrollment_reinstatement`** و **`transfer`** كـ canonical (لتوافق triggers/details الحالية)، وتحديث seed workflow ليطابقهما بدلاً من `reenrollment` / `department_transfer`.

---

## 8. Lifecycle / Workflow Design

### حالات مقترحة (هدف نهائي)

| الحالة | مطلوب فوراً؟ | ملاحظة |
|--------|--------------|--------|
| `draft` | ✅ نعم | موجود |
| `submitted` | ✅ نعم | موجود |
| `under_review` / `in_review` | ✅ نعم | توحيد تسمية لاحقاً إلى `under_review` فقط |
| `needs_attachment` | ⚠️ مرحلة 2 | أو الإبقاء على `returned_for_completion` مع سبب «نقص مرفق» |
| `needs_payment` | ❌ مرحلة رسوم | بعد STUDENT-REQUEST-FEES-01 |
| `approved` | ✅ نعم | موجود |
| `rejected` | ✅ نعم | موجود |
| `completed` | ✅ نعم | نهاية workflow |
| `cancelled` | ✅ نعم | موجود |

### Subset آمن للمرحلة الأولى (MVP جمهور + RPC)

```
draft → submitted → under_review → approved | rejected | returned_for_completion
                  → completed (إن workflow ينتهي بـ complete)
                  → cancelled (طالب)
```

### ربط workflow بنوع الطلب

- **لا إعادة بناء:** الإبقاء على `workflow_schema` الحالي.
- عند `submit_student_request`: قراءة steps من النوع → `initializeSteps` (كما هو).
- أنواع **بدون steps** (مستقبلاً): مسار مبسط `submitted → under_review → approved`.

### حسب نوع الطلب

| البعد | التصميم |
|-------|---------|
| **رسوم** | اختياري per type — مرحلة لاحقة |
| **مرفقات** | `requires_attachment` + `required_documents[]` |
| **وثيقة ناتجة** | flag مقترح: `produces_official_document boolean` أو استنتاج من `category = 'documents'` + trigger موجود |

أنواع تنتج وثيقة اليوم: `official_transcript` (ومسار `issue_official_document` لأنواع أخرى).

---

## 9. Attachments Design

### المرحلة 1: توسيع `required_documents` (jsonb على `request_types`)

```json
[
  {
    "key": "medical_report",
    "label_ar": "تقرير طبي",
    "required": true,
    "min_count": 1,
    "max_count": 3,
    "allowed_mime": ["application/pdf", "image/jpeg", "image/png"],
    "max_size_mb": 5
  }
]
```

- يتوافق مع `requires_attachment` (إن `true` و`required_documents` فارغ → مرفق واحد عام إلزامي).

### المرحلة 2 (اختياري): `request_type_required_attachments`

| عمود | نوع |
|------|-----|
| `request_type_code` | FK → `request_types(code)` |
| `attachment_key` | text |
| `label_ar` | text |
| `required` | boolean |
| `min_count`, `max_count` | int |
| `allowed_mime` | text[] |
| `max_size_mb` | int |

**توصية:** البدء بـ jsonb؛ الجدول المنفصل فقط إن احتاجت الإدارة CRUD معقد للمرفقات.

### قواعد التحقق عند `submit_student_request`

1. لكل بند `required: true` → عدد مرفقات `student_request_attachments` مع `file_type` / metadata مطابق ≥ `min_count`.
2. نقص → رفض مع رسالة عربية؛ أو انتقال إلى `returned_for_completion` من المراجع (ليس من الطالب).
3. **أكثر من ملف:** مدعوم عبر عدة صفوف في `student_request_attachments`.
4. **أنواع وحجم:** تحقق في RPC + `storage-validation.ts` (موجود جزئياً) + RLS storage.

### رفض بسبب نقص المرفقات

- **عند الإرسال:** RPC يمنع `submitted` إن نقص إلزامي.
- **أثناء المراجعة:** staff يستخدم `return_for_completion` مع ملاحظة.

---

## 10. Fees Design

### الوضع الحالي

- `student_fees` / `fee_types` / `student_payments` / `payment_receipts` — **منفصلة** عن الطلبات.

### خياران

| الخيار | الوصف | ملاءمة |
|--------|-------|--------|
| **A** `request_types.fee_amount` + `fee_currency` | بسيط | رسوم ثابتة لكل نوع فقط |
| **B** جدول `request_type_fees` | مرن | اختلاف حسب برنامج / نظام دراسي / سنة |

### التوصية: **الخيار B — `request_type_fees` (مرحلة لاحقة)**

```text
request_type_fees (
  id, request_type_code FK,
  fee_type_id FK nullable,
  amount, currency,
  applicable_audience,  -- active_student | graduate | both
  study_system nullable,
  program_id nullable,
  effective_from, effective_to,
  is_active
)
```

### ربط الطلب

```text
student_requests (
  ...
  fee_required_amount nullable,
  fee_status nullable,  -- not_required | pending | paid | waived
  student_fee_id nullable FK,
  payment_receipt_id nullable FK
)
```

### سير الحالة

1. عند `submit`: إن النوع يتطلب رسوماً → `needs_payment` أو `submitted` مع `fee_status = pending` (قرار تنفيذي).
2. رفع إثبات دفع → ربط `payment_receipts` → `fee_status = paid`.
3. **الاعتماد النهائي** (`approved` / `completed` / إصدار وثيقة): **لا يتم** إن `fee_status = pending` إلا بصلاحية waive إدارية.

### توصية التوقيت

**الرسوم خارج MVP الجمهور** — مرحلة **STUDENT-REQUEST-FEES-01** بعد استقرار RPC والواجهة الموحدة.

---

## 11. Secure RPC Contract Design

### مبادئ عامة

- إنشاء/إرسال الطلبات للطلاب: **SECURITY DEFINER** مع `SET search_path = public` وتحقق `auth.uid()`.
- قراءة القائمة: نفس النمط أو server functions موجودة (TanStack Start) تستدعي RPC.
- كل DEFINER يتحقق: `profile.user_id = auth.uid()` قبل أي كتابة.

---

### 1) `get_available_request_types_for_current_student()`

| البند | التفاصيل |
|-------|----------|
| **الغرض** | قائمة أنواع مناسبة للطالب الحالي |
| **المدخلات** | لا شيء (يستمد من `auth.uid()`) |
| **المخرجات** | `TABLE (code, name_ar, description_ar, category, requires_attachment, sort_order, eligible boolean, display_mode text, ineligibility_reason_ar text)` |
| **المنطق** | حل profile → `resolve_student_audience_role` → join `request_types` حيث `is_active` و`student_visible` → حساب `eligible` من `request_audience` → تطبيق `hidden` (استبعاد) أو `disabled` (إرجاع مع flag) |
| **SECURITY DEFINER** | نعم — لقراءة موحّدة حتى مع RLS على `request_types` |
| **ضوابط DEFINER** | لا تُرجع أنواعاً `hidden` لغير المؤهلين؛ لا تسريب بيانات طلاب آخرين |

---

### 2) `create_student_request(p_request_type text, p_title text, p_form_data jsonb, p_student_notes text default null)`

| البند | التفاصيل |
|-------|----------|
| **الغرض** | إنشاء مسودة بعد تحقق الأهلية |
| **الشروط** | profile مرتبط بـ `auth.uid()`؛ `status` يسمح (`active` أو `graduated` حسب النوع)； النوع `is_active`؛ تطابق `request_audience`؛ **رفض صريح** active يطلب graduate-only والعكس |
| **المخرجات** | `uuid` (request id) + `request_number` |
| **SECURITY DEFINER** | نعم |
| **ضوابط** | لا قبول `student_profile_id` من العميل — دائماً من session؛ تسجيل `audit_logs` |

---

### 3) `submit_student_request(p_request_id uuid)`

| البند | التفاصيل |
|-------|----------|
| **الغرض** | `draft` أو `returned*` → `submitted` |
| **الشروط** | ملكية؛ حالة قابلة؛ مرفقات إلزامية؛ رسوم (لاحقاً)； تهيئة workflow steps |
| **المخرجات** | `boolean` + رسالة |
| **SECURITY DEFINER** | نعم — يستدعي منطق `protect_student_request` المتسق |
| **ضوابط** | إعادة التحقق من أهلية النوع (لا تغيّر حالة الطالب بين create وsubmit) |

---

### 4) `get_my_student_requests(p_limit int default 50, p_offset int default 0)`

| البند | التفاصيل |
|-------|----------|
| **الغرض** | طلبات الطالب الحالي فقط |
| **المخرجات** | قائمة ملخصة + `status` + `request_type` + تواريخ |
| **SECURITY DEFINER** | اختياري — يمكن RLS + view إن كانت السياسات كافية |
| **توصية** | البدء بتحسين server fn الحالية؛ RPC إن لزم mobile/مستقبل |

---

### 5) دوال إدارية (لاحقاً — لا تغيير جذري)

| دالة | ملاحظة |
|------|--------|
| `act_on_student_service_request` | موجودة كـ server fn — يمكن wrap RPC |
| `issue_document_for_request` | للأنواع الوثائقية |
| `waive_request_fee` | بعد مرحلة الرسوم |

---

## 12. RLS Design

### التوصية: **منع INSERT المباشر للطلاب + إجبار الإنشاء عبر RPC**

| الجدول | سياسة مقترحة |
|--------|--------------|
| `request_types` | SELECT: active للطلاب عبر RPC فقط؛ أو SELECT محدود `is_active` (الأفضل القراءة عبر RPC للقائمة المفلترة) |
| `student_requests` | SELECT: المالك + staff (كما هو)； INSERT/UPDATE للطالب: **إزالة أو تضييق** — السماح فقط لـ `service_role` / RPC DEFINER |
| `student_request_attachments` | INSERT: مالك الطلب + request في `draft`/`returned*` |
| `student_service_request_steps/events` | INSERT/UPDATE: staff / DEFINER فقط (مطبّق جزئياً في 20260707120000) |

### لماذا ليس INSERT مباشر بسياسات معقدة؟

- سياسة «الطالب ينشئ فقط إن audience متطابق» **معقدة** في RLS وتُكرر منطق RPC.
- DEFINER واحد = نقطة تحقق واحدة + رسائل خطأ عربية + audit.

### مسار انتقالي (إن رُفض حظر INSERT فوراً)

- الإبقاء على INSERT مع `WITH CHECK` يستدعي `student_can_create_request_type(auth.uid(), request_type)`.
- **الهدف النهائي:** حظر INSERT للـ `authenticated` role على `student_requests` ما عدا عبر RPC.

### المرفقات

- `WITH CHECK`: `is_owner_of_request` AND request.status IN (`draft`, `returned`, `returned_for_completion`).

---

## 13. UI Consolidation Decision

### القرار

| اعتماد | إيقاف تدريجي |
|--------|--------------|
| **`/student/requests/*`** + `student-affairs.functions.ts` | **`StudentRequestsSection`** في `student.index.tsx` |

### المبررات

- Workflow موحّد، `request_number`, timeline, أحداث.
- أسهل إضافة `request_audience` في قائمة واحدة.
- المكون القديم مرتبط بأكواد/details قديمة ومباشر Supabase client.

### خطة انتقال (تنفيذ لاحق — UI-CONSOLIDATION-01)

1. **المرحلة أ:** إضافة قائمة الأنواع المؤهلة (مع disabled) في `/student/requests/new`.
2. **المرحلة ب:** في `student.index.tsx` — استبدال `StudentRequestsSection` ببطاقة ملخص + رابط «إدارة الطلبات» → `/student/requests`.
3. **المرحلة ج:** redirect `#student-requests` → `/student/requests` (mobile أيضاً).
4. **المرحلة د:** إخفاء الكود القديم خلف feature flag ثم حذفه بعد smoke.

### عرض غير المؤهلين

- `hidden`: لا يظهر في `<select>`.
- `disabled`: بطاقة أو `<option disabled>` مع `ineligibility_reason_ar` — مثال: «متاح بعد اعتماد التخرج».

### رسائل الحالة

| حالة الطالب | رسالة في رأس صفحة الطلبات |
|-------------|---------------------------|
| `active` | «طلبات الطلاب المستمرين» |
| `graduated` | «طلبات الخريجين» |
| غير ذلك | «حسابك غير مؤهل لتقديم طلبات حالياً» + توجيه للشؤون |

---

## 14. Request Visibility Rules

### طالب مستمر (`status = active`)

| `request_audience` | السلوك الافتراضي |
|--------------------|------------------|
| `active_student` | ✅ eligible — يظهر ويُنشأ |
| `both` | ✅ eligible |
| `graduate` | حسب `ineligible_display_mode`: **`disabled`** (افتراضي مقترح) أو `hidden` |

### خريج (`status = graduated`)

| `request_audience` | السلوك الافتراضي |
|--------------------|------------------|
| `graduate` | ✅ eligible |
| `both` | ✅ eligible |
| `active_student` | **`hidden`** (افتراضي) — لا `disabled` إلا بقرار صريح من الإدارة |

### قواعد إضافية

- `is_active = false` → دائماً `hidden` للجميع.
- `student_visible = false` → مخفي عن البوابة (staff-only).
- `official_transcript`: اليوم يشترط `active` في trigger — **يُراجع** إن أصبح `both`: السماح للخريج بكشف نهائي مع نفس guards الدرجات.

### مصفوفة مختصرة

```
                    │ active_student │ graduate │ both │
────────────────────┼────────────────┼──────────┼──────┤
طالب active         │      نعم       │ disabled*│ نعم  │
خريج graduated      │     hidden     │   نعم    │ نعم  │
غير مؤهل            │     hidden     │  hidden  │hidden│

* أو hidden حسب قرار المستخدم
```

---

## 15. Proposed Implementation Phases

| المرحلة | المحتوى | تبعيات |
|---------|---------|--------|
| **STUDENT-REQUEST-TYPES-SCHEMA-01** | `request_audience`, `ineligible_display_mode`, FK بدل `sr_type_chk`, توحيد أكواد seed | قرارات §16 |
| **STUDENT-REQUEST-TYPES-RPC-RLS-01** | RPCs الثلاث + تضييق INSERT + `resolve_student_audience_role` | SCHEMA-01 |
| **STUDENT-REQUEST-TYPES-UI-CONSOLIDATION-01** | `/student/requests` + disabled/hidden + إيقاف `StudentRequestsSection` | RPC-RLS-01 |
| **STUDENT-REQUEST-TYPES-SEED-CONFIG-01** | تفعيل أنواع + audience + workflow (بموافقة مستخدم) | UI أو بالتوازي |
| **STUDENT-REQUEST-FEES-01** | `request_type_fees`, `needs_payment` | اختياري لاحقاً |
| **STUDENT-REQUESTS-E2E-SMOKE-01** | حسابات active + graduated | PILOT accounts |

---

## 16. User Decisions Needed

يجب إجابة المستخدم **قبل SCHEMA-01**:

| # | السؤال | افتراضي مقترح إن لم يُجب |
|---|--------|---------------------------|
| 1 | طلبات الخريجين أمام المستمر: `disabled` أم `hidden`؟ | `disabled` |
| 2 | طلبات المستمر أمام الخريج: `hidden` أم `disabled`؟ | `hidden` |
| 3 | اعتماد `student_profiles.status = 'graduated'` كمصدر نهائي؟ | نعم |
| 4 | إلغاء `sr_type_chk` لصالح FK → `request_types.code`؟ | نعم |
| 5 | canonical codes: `enrollment_reinstatement` / `transfer` أم `reenrollment` / `department_transfer`؟ | **القديمة** (توافق details) |
| 6 | الواجهة المعتمدة: `/student/requests/*`؟ | نعم |
| 7 | الرسوم في نفس الموجة أم لاحقاً؟ | **لاحقاً** |
| 8 | أنواع الطلبات الأولى للتفعيل؟ | `absence_excuse`, `enrollment_certificate`, `official_transcript` + نوع خريج واحد عند الجاهزية |
| 9 | `official_transcript` → `both` أم `active_student` فقط؟ | `both` مع guards درجات |
| 10 | هل نحتاج `pending_graduation` كحالة profile لاحقاً؟ | تأجيل |

---

## 17. Risks

| الخطر | الأثر | التخفيف |
|-------|-------|---------|
| كسر `sr_type_chk` عند إنشاء طلب بكود جديد | فشل INSERT | FK + توحيد أكواد في SCHEMA-01 |
| واجهتان متزامنتان | سلوك مختلف، ثغرات أهلية | UI-CONSOLIDATION-01 |
| الاعتماد على UI فقط | تجاوز غير المؤهلين | RPC-RLS-01 إلزامي |
| جمهور بدون RPC | عرض خاطئ فقط — ليس أماناً | منع INSERT المباشر |
| `graduated` يدوياً دون سير اعتماد | طلبات خريج لغير خريج حقيقي | RPC اعتماد تخرج لاحق + audit |
| إسقاط constraint مع بيانات يتيمة | فشل migration | migration script يفحص orphan codes أولاً |
| تغيير `official_transcript` guard | خريج لا يحصل على كشف | اختبار حالات في smoke |

---

## 18. Recommended Decision

### هل ننتقل إلى التنفيذ؟

**نعم — بعد إجابة §16 (أو قبول الافتراضيات المقترحة صراحة).**

### أول مرحلة تنفيذية

**STUDENT-REQUEST-TYPES-SCHEMA-01**

محتوى متوقع:

1. `ALTER TABLE request_types ADD request_audience, ineligible_display_mode`.
2. Backfill قيم أولية لأنواع موجودة (في migration script — ليس في هذه المرحلة).
3. توحيد أكواد `reenrollment` → `enrollment_reinstatement`, `department_transfer` → `transfer`.
4. `DROP sr_type_chk` + `ADD CONSTRAINT sr_request_type_fk FOREIGN KEY (request_type) REFERENCES request_types(code)`.
5. دالة SQL `resolve_student_audience_role(uuid)` (بدون ربط UI بعد).

### قبل كتابة migrations — مطلوب من المستخدم

- تأكيد أو تعديل الافتراضيات في §16 (جدول القرارات).
- قائمة أنواع الطلبات المراد تفعيلها في Pilot الأول.
- موافقة على إيقاف `StudentRequestsSection` على مرحلتين.

### بعد SCHEMA + RPC-RLS

**STUDENT-REQUEST-TYPES-UI-CONSOLIDATION-01** ثم **SEED-CONFIG** ثم **E2E-SMOKE**.

---

## 19. No-Write Assurance

| العنصر | تم؟ |
|--------|-----|
| migrations | ❌ |
| تعديل قاعدة البيانات | ❌ |
| إدخال بيانات / seed | ❌ |
| تعديل RLS | ❌ |
| تعديل UI / server / routes | ❌ |
| تعديل TypeScript / React / SQL | ❌ |
| حذف / cleanup / reset | ❌ |
| service role | ❌ |
| commit / push / PR | ❌ |
| لمس `PILOT-TEST-ACCOUNTS-MATRIX-01-REPORT.md` | ❌ |
| **الملف الوحيد المُنشأ** | ✅ `docs/STUDENT-REQUEST-TYPES-LIFECYCLE-DESIGN-01.md` |

### Git عند البدء

```
?? docs/PILOT-TEST-ACCOUNTS-MATRIX-01-REPORT.md
?? docs/STUDENT-REQUEST-TYPES-LIFECYCLE-AUDIT-01-REPORT.md
الفرع: main
```

---

*نهاية التصميم — STUDENT-REQUEST-TYPES-LIFECYCLE-DESIGN-01*
