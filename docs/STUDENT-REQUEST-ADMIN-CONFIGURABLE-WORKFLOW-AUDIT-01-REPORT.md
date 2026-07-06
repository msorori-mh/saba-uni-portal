# STUDENT-REQUEST-ADMIN-CONFIGURABLE-WORKFLOW-AUDIT-01 Report

**التاريخ:** 2026-07-06  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**GitHub:** `msorori-mh/saba-uni-portal`  
**القرار:** **NEEDS_DESIGN**  
**توصية Apply:** **PROCEED_WITH_CURRENT_STAGING_APPLY** (مع **إيقاف مؤقت** حتى اكتمال DESIGN)  
**المرحلة التالية:** **STUDENT-REQUEST-ADMIN-CONFIGURABLE-WORKFLOW-DESIGN-01**

---

## 1. Executive Summary

| البند | النتيجة |
|-------|---------|
| **القرار** | **NEEDS_DESIGN** |
| **إنشاء أنواع الطلبات من الأدمن** | **جزئياً** — صفحة `/admin/request-types` موجودة لكن **ناقصة** |
| **workflow قابل للإعداد من الأدمن** | **لا** — workflow **مُزروع في SQL** وليس عبر واجهة |
| **إيقاف staging apply** | **نعم مؤقتاً** — حتى يُقرأ هذا التقرير ويُكمَّل DESIGN |

**الخلاصة:** النظام الحالي يملك **بنية تحتية قوية** (`request_types`, `workflow_schema`, خطوات runtime، أدوار، مناصب تنظيمية، إشعارات، بوابات متعددة) لكنه **ليس بعد** نظاماً «قابلاً للإعداد بالكامل من الأدمن». migrations الثلاثة المعلّقة تخدم **طبقة الطالب + الأهلية + RPC** و**لا تتعارض** مع تصميم admin-config workflow لاحقاً — يمكن تطبيقها كـ foundation بعد DESIGN إن لم تُضف متطلبات جديدة تغيّر schema الطالب.

---

## 2. Scope

- مرحلة **فحص وتحليل فقط** — لا تعديل DB، لا code، لا migrations apply.
- **STUDENT-REQUEST-TYPES-STAGING-APPLY-01** **موقوف** بقرار المستخدم حتى خروج هذا التقرير.
- **الكتابة الوحيدة:** هذا الملف.

---

## 3. Git State

| البند | القيمة |
|-------|--------|
| **الفرع** | `main` |
| **آخر commits** | `b044459` → `f98252d` → `5728214` → `5191940` → `98daec1` |
| **commit / push / PR** | ❌ |
| **الملف المنشأ** | `docs/STUDENT-REQUEST-ADMIN-CONFIGURABLE-WORKFLOW-AUDIT-01-REPORT.md` |

ملفات غير متتبعة ذات صلة: migrations `20260710130000`–`150000`، تقارير مراحل طلبات الطلاب، UI consolidation — **لم تُلمس**.

---

## 4. Admin Request Type Configuration Review

### الموجود حالياً

| العنصر | الحالة | المصدر |
|--------|--------|--------|
| صفحة أدمن لأنواع الطلبات | ✅ | `/admin/request-types` — `src/routes/admin/request-types.tsx` |
| server functions | ✅ | `src/lib/admin-request-types.functions.ts` |
| صلاحيات | ✅ | `system_admin`, `admin`, `registrar`, `student_affairs` |
| إنشاء / تعديل / حذف / تفعيل | ✅ جزئياً | `upsertRequestType`, `toggleRequestTypeActive`, `deleteRequestType` |

### حقول مدعومة في واجهة الأدمن اليوم

| الحقل | UI أدمن | DB (`types.ts`) | ملاحظة |
|-------|---------|-----------------|--------|
| `code` | ✅ (ثابت بعد الإنشاء) | ✅ | regex `^[a-z][a-z0-9_]*$` |
| `name_ar` | ✅ | ✅ | |
| `description_ar` | ✅ | ✅ | |
| `is_active` | ✅ | ✅ | |
| `requires_attachment` | ✅ | ✅ | |
| `sort_order` | ✅ | ✅ | |
| `title_en` | ❌ | ✅ عمود | غير معروض |
| `student_visible` | ❌ | ✅ | افتراضي DB؛ لا يتحكم الأدمن |
| `category` | ❌ | ✅ | |
| `article_ref` | ❌ | ✅ | |
| `form_schema` | ❌ | ✅ JSON | يُزرع في migrations فقط |
| `workflow_schema` | ❌ | ✅ JSON | يُزرع في migrations فقط |
| `required_documents` | ❌ | ✅ JSON | |
| `request_audience` | ❌ | ⏳ migration معلّق | `active_student` / `graduate` / `both` |
| `ineligible_display_mode` | ❌ | ⏳ migration معلّق | `hidden` / `disabled` |
| رسوم | ❌ | ❌ لا `request_id` في fees | مؤجل FEES-01 |
| جهة مالية | ❌ | — | |
| إصدار وثيقة | ❌ جزئياً | `official_documents` لأنواع محددة | hardcoded في server logic |

### Hardcoding في الكود

| الموقع | النوع | التأثير |
|--------|-------|---------|
| `StudentRequestsSection.tsx` | ~1900 سطر، أنواع محددة + INSERT مباشر | **deprecated** — غير مُركَّب |
| `admin/student-requests.lazy.tsx` | panels لكل نوع (`suspension`, `transfer`, `equivalency`, …) | معالجة **نوع-محددة** وليست generic |
| `20260706120000` seed | `workflow` JSON لكل نوع | **ثابت في migration** |
| `SUPPORTED_CODES` في mobile (قديم) | قائمة ثابتة | أُزيل في UI consolidation |

### الفجوات حتى يستطيع المستخدم إنشاء الطلبات بنفسه

1. **توسيع نموذج الأدمن:** `request_audience`, `ineligible_display_mode`, `student_visible`, `form_schema`, `required_documents`.
2. **محرر workflow** لكل نوع (خطوات، جهات، أدوار، إجراءات).
3. **محرر نموذج ديناميكي** (`form_schema`) أو قوالب جاهزة.
4. **إزالة/تعميم** panels النوع-المحددة في `/admin/student-requests` أو ربطها بـ `form_schema`.
5. **عدم الاعتماد على seed SQL** لإضافة أنواع جديدة.

**الحكم:** إنشاء نوع طلب **بسيط** (اسم + وصف + مرفق + ترتيب) **مدعوم**؛ إنشاء نوع طلب **كامل مع دورة حياة** **غير مدعوم** من الأدمن حالياً.

---

## 5. Admin Workflow Configuration Review

### البنية الموجودة

```
request_types.workflow_schema (JSON تعريف)
        ↓ عند submit
student_service_request_steps (runtime per request)
student_service_request_events (audit trail)
student_requests.current_step_index / current_role_key
```

| القدرة | الحالة |
|--------|--------|
| workflow موجود | ✅ عبر `workflow_schema.steps[]` |
| خطوات runtime | ✅ `student_service_request_steps` |
| أحداث | ✅ `student_service_request_events` |
| إجراءات workflow | ✅ `approve`, `reject`, `return_for_completion`, `forward`, `complete` — `student-affairs.functions.ts` |
| ربط خطوة بـ `role_key` | ✅ في JSON seed |
| **إعداد من الأدمن** | ❌ |
| ترتيب خطوات من UI | ❌ |
| جهة معالجة (unit) من UI | ❌ |
| أنواع خطوة (مراجعة/موافقة/أرشفة/رسوم) | ❌ — `allowed_actions` اختياري في JSON فقط |
| إشعار تلقائي لكل خطوة | جزئياً — `notify()` بعد إجراء واحد |
| إرجاع للطالب | ✅ `return_for_completion` |
| تحويل لجهة أخرى | ✅ `forward` بين خطوات |
| خطوة نهائية | ✅ `complete` / `approved` |

### شكل `workflow_schema` الحالي (من seed)

```json
{
  "steps": [
    { "key": "...", "title_ar": "...", "role_key": "registrar", "allowed_actions": [...], "can_complete": true }
  ]
}
```

- **ثابت** في `20260706120000_student_affairs_workflow_foundation.sql`.
- لا يوجد جدول `workflow_steps` منفصل قابل للتحرير.
- لا ربط بـ `organizational_positions` — فقط `role_key` نصي يُطابق `app_role` / `user_roles`.

**الحكم:** workflow **موجود ويعمل جزئياً** في runtime، لكنه **غير قابل للإعداد من الأدمن** — يحتاج DESIGN + مرحلة تنفيذ لاحقة.

---

## 6. Role / Position / Processing Unit Review

### آليات موجودة

| الآلية | الجدول/المصدر | الغرض |
|--------|---------------|--------|
| أدوار تشغيلية | `user_roles` + enum `app_role` | صلاحيات RLS/RPC |
| كتالوج أدوار | `roles_catalog` | مسميات + `app_role_mapping` |
| مناصب تنظيمية | `organizational_positions` | هيكل الكلية |
| إسناد منصب | `position_assignments` | user ↔ position |
| ربط منصب↔دور | `position_role_mapping` | position ↔ `roles_catalog.code` |
| موظفون | `staff_profiles` | بوابة `/staff/` |
| أعضاء هيئة | `faculty_profiles` | بوابة `/faculty-portal/` |

### أدوار `app_role` ذات صلة

`admin`, `system_admin`, `dean`, `department_head`, `registrar`, `student_affairs`, `finance_officer`, `faculty_member`, `hr_officer`

### فجوات مقابل المسميات المطلوبة

| المطلوب | موجود؟ | كيف يُمثَّل اليوم | فجوة |
|---------|--------|-------------------|------|
| المسجل العام | جزئياً | `registrar` + `registrar_department` | لا دور `registrar_general`؛ لا inbox موحّد |
| إدارة شؤون الطلاب | جزئياً | `student_affairs` + `student_activities_department` | لا فصل manager/specialist |
| مدير شؤون الطلاب | ❌ | — | لا role/mapping |
| مختص شؤون الطلاب | ❌ | — | |
| إدارة شؤون الخريجين | جزئياً | `graduate_studies_department` | لا `graduate_affairs`؛ لا فصل خريج في workflow routing |
| مدير/مختص شؤون الخريجين | ❌ | — | |
| الإرشيف | ❌ | — | لا unit ولا role |
| الإيرادات والمالية | جزئياً | `finance_officer` + `financial_affairs_equipment_department` | لا ربط طلبات |
| مسؤول المكتبة | ❌ | — | |
| مسؤول المعامل / أمين معمل | ❌ | — | `rooms`/`room_type=lab` فقط |
| رئيس القسم العلمي | جزئياً | `department_head` في workflow + `app_role` | **لا** `position_assignments` نشطة؛ لا inbox في faculty portal |
| عميد الكلية | جزئياً | `dean` + منصب `dean` | لا inbox في faculty portal؛ `position_assignments` فارغ |
| وحدات مستقبلية | جزئياً | `organizational_positions` قابل للتوسع | لا `processing_units` abstraction |

**ملاحظة بيانات:** تقارير Pilot تذكر `position_assignments = 0` — المناصب **معرَّفة** لكن **غير مُسنَدة** لأشخاص.

### role vs position vs unit

| المفهوم | الوضع |
|---------|--------|
| `role` (app_role) | ✅ مستخدم في workflow وRLS |
| `job title` (staff_profiles.job_title) | ✅ نصي فقط — غير مربوط بworkflow |
| `position` (organizational) | ✅ schema موجود — إسناد فارغ |
| `processing unit` | ❌ لا جدول مستقل |
| `permission` | ✅ عبر roles + RLS |

---

## 7. Required Stakeholders Matrix

| الجهة/المسمى | موجود؟ | النوع | أين يظهر اليوم | inbox؟ | notifications؟ | صلاحيات مقترحة |
|--------------|--------|-------|----------------|--------|----------------|----------------|
| المسجل العام | جزئياً | role+unit | `/admin/student-requests` | جزئياً (admin/registrar) | جزئياً | كل الطلبات؛ إعادة توجيه؛ audit |
| إدارة شؤون الطلاب | جزئياً | role+unit | admin + `student_affairs` | workflow pending | نعم (بعد إجراء) | طلبات `active_student` |
| مدير إدارة شؤون الطلاب | ❌ | position/role | — | ❌ | ❌ | اعتماد/إحالة ضمن الوحدة |
| مختص شؤون الطلاب | ❌ | position | — | ❌ | ❌ | معالجة أولية |
| إدارة شؤون الخريجين | ❌ | unit | — | ❌ | ❌ | طلبات `graduate` |
| مدير شؤون الخريجين | ❌ | position | — | ❌ | ❌ | |
| مختص شؤون الخريجين | ❌ | position | — | ❌ | ❌ | |
| الإرشيف | ❌ | unit | — | ❌ | ❌ | أرشفة مرفقات/وثائق |
| الإيرادات والمالية | جزئياً | role | finance في fees منفصلة | ❌ لطلبات | جزئياً | خطوات رسوم لاحقاً |
| مسؤول المكتبة | ❌ | unit+role | — | ❌ | ❌ | خطوات مكتبة |
| مسؤول المعامل | ❌ | unit+role | — | ❌ | ❌ | |
| أمين معمل | ❌ | position | — | ❌ | ❌ | |
| رئيس القسم العلمي | جزئياً | faculty+`department_head` | workflow JSON فقط | ❌ في faculty portal | ❌ | طلبات قسم الطالب |
| عميد الكلية | جزئياً | faculty+`dean` | workflow JSON؛ admin | ❌ في faculty portal | ❌ | اعتماد نهائي |
| وحدات مستقبلية | قابل | `organizational_positions` | — | حسب التصميم | حسب التصميم | قابلة للإضافة |

---

## 8. Portal Impact

### Admin Portal

| موجود | ناقص للنموذج المستقبلي |
|--------|-------------------------|
| `/admin/request-types` CRUD أساسي | محرر audience/display/workflow/form |
| `/admin/student-requests` مراجعة + workflow actions | توحيد generic؛ إزالة hardcoded panels |
| تقارير طلبات | routing حسب جهة/قسم |
| `getPendingStudentRequestsForRole` | فلترة حسب processing unit |

### Student Portal

| موجود | ناقص |
|--------|------|
| `/student/requests/*` + RPC (بعد UI consolidation) | عرض الجهة الحالية للمعالجة |
| إشعارات + `NotificationsBell` | إشعارات أغنى لكل خطوة |
| مرفقات (قراءة) | رفع في `/new` |
| رسوم | مؤجل |

### Faculty / Academic Portal

| موجود | ناقص |
|--------|------|
| `/faculty-portal/` + إشعارات عامة | **لا** inbox طلبات طلاب |
| `department_head` / `dean` في `app_role` | بطاقة «طلبات الطلاب» |
| مجالس أكاديمية (منفصلة) | فصل واضح عن طلبات الطلاب |

### Staff Portal

| موجود | ناقص |
|--------|------|
| `/staff/` dashboard أساسي | **لا** مسار طلبات |
| `staff_profiles.role_type` | inbox حسب الوحدة (شؤون طلاب/خريجين/مالية/أرشيف) |

**Gap معماري:** لا بوابة موظفين موحّدة لمعالجة الطلبات — المعالجة اليوم عبر **لوحة الأدمن** أو أدوار admin-like.

### Mobile

| موجود | مقترح |
|--------|--------|
| `/mobile/student/requests` — متابعة + روابط | إنشاء عبر `/student/requests/new` |
| لا إشعارات mobile مخصصة للطلبات | متابعة + إشعارات لاحقاً |

---

## 9. Notification Impact

### الموجود

| العنصر | الحالة |
|--------|--------|
| جدول `notifications` | ✅ `user_id`, `title`, `message`, `notification_type`, `reference_type/id`, `is_read` |
| `NotificationsBell` | ✅ طالب + faculty |
| `/student/notifications` | ✅ |
| إشعار بعد workflow action | ✅ `notify()` في `student-affairs.functions.ts` |
| بريد | ✅ `sendNotificationEmail` من admin student-requests |

### المفقود

| العنصر | الحالة |
|--------|--------|
| إشعار لجهة كاملة (unit) | ❌ — فقط `user_id` |
| إشعار لرئيس قسم حسب قسم الطالب | ❌ |
| إشعار للعميد تلقائياً عند خطوة dean | ❌ — يعتمد على مستخدم بدور dean يفتح admin |
| إشعارات faculty portal لطلبات | ❌ |
| ربط `workflow_schema` بـ notification triggers | ❌ |
| unread per unit/inbox | ❌ |

---

## 10. Recommended Future Architecture

### أ. `request_types` (master data — توسيع)

يبقى المصدر الرئيسي مع:

- `code`, `name_ar`, `description_ar`, `title_en`
- `is_active`, `student_visible`, `sort_order`
- `request_audience`, `ineligible_display_mode` (من migration معلّق)
- `requires_attachment`, `required_documents`, `form_schema`
- `primary_processing_unit_id` (جديد — اختياري)
- `requires_workflow`, `requires_fee`, `produces_document` (flags جديدة — لاحقاً)
- `workflow_definition_id` أو `workflow_schema` حتى انتقال لجدول منفصل

### ب. `processing_units` (مقترح — جدول جديد)

```text
code, name_ar, unit_type (registrar|student_affairs|graduate_affairs|archive|finance|library|labs|academic|other)
parent_unit_id, is_active, sort_order
```

ربط اختياري بـ `organizational_positions.code`.

### ج. `processing_roles` / position mappings

```text
code, name_ar, processing_unit_id, maps_to_app_role?, maps_to_position_code?, is_assignable_to_staff, is_faculty_position
```

أمثلة: `student_affairs_specialist`, `department_chair`, `dean` → `position_assignments` + `faculty_profiles`.

### د. `request_type_workflow_steps` (مقترح — بديل/تكميل JSON)

```text
request_type_code, step_index, step_key, title_ar,
processing_unit_id, processing_role_code, app_role_fallback,
step_kind (review|approve|payment|archive|document_issue|return_to_student),
is_optional, is_terminal, notify_on_enter, allowed_actions[]
```

انتقال تدريجي من `workflow_schema` JSON إلى جداول normalised.

### هـ. Request runtime (إعادة استخدام + توسيع)

| جدول | الاستخدام |
|------|-----------|
| `student_service_request_steps` | ✅ إبقاء — runtime steps |
| `student_service_request_events` | ✅ إبقاء — audit |
| `student_requests` | ✅ `current_step_index`, `current_role_key` → إضافة `current_processing_unit_id` لاحقاً |
| `student_request_assignments` | **جديد مقترح** — تعيين مستخدم/منصب لخطوة |
| `student_request_notifications` | اختياري — أو استمرار `notifications` |

---

## 11. Security / RLS / RPC Requirements

### RPC/RLS الحالية (migrations معلّقة)

| RPC | الغرض |
|-----|--------|
| `get_available_request_types_for_current_student` | list + eligibility |
| `create_student_request` | إنشاء draft |
| `submit_student_request` | إرسال + eligibility |
| `get_my_student_requests` | قائمة الطالب |

**تكفي لطبقة الطالب فقط.**

### مطلوب مستقبلاً (لا تنفيذ الآن)

| الفئة | أمثلة |
|-------|--------|
| Admin config RPCs | `upsert_request_type_config`, `upsert_workflow_steps` — مع roles admin/registrar |
| Processor RPCs | `list_pending_requests_for_unit`, `act_on_request_step` — مع unit/role scope |
| Faculty RPCs | `list_department_requests_for_chair`, `dean_pending_requests` — مع `department_id` scope |
| RLS | فصل قراءة الطلبات: طالب (own) / unit (by step) / chair (by student department) / dean (college) |
| Audit | كل قرار → `student_service_request_events` + `audit_logs` |
| منع UI-only | نفس نمط bypass-fix — لا UPDATE مباشر لـ `status` من portals |

---

## 12. Impact on Current Migrations

### migrations الثلاثة المعلّقة

| Migration | طبقة | تعارض مع admin-config؟ |
|-----------|------|-------------------------|
| `20260710130000` SCHEMA | `request_audience`, `ineligible_display_mode`, FK NOT VALID | ❌ لا — **يخدم** admin config لاحقاً |
| `20260710140000` RPC/RLS | طالب + eligibility + block INSERT | ❌ لا — orthogonal |
| `20260710150000` BYPASS-FIX | submit عبر RPC فقط | ❌ لا — يقوّي الأمان |

### تحليل

| سؤال | جواب |
|------|------|
| هل هي طبقة طالب فقط؟ | **أساساً نعم** — لا تلمس workflow config ولا admin UI |
| هل تتعارض مع admin workflow لاحقاً؟ | **لا** — `workflow_schema` يبقى كما هو؛ يُوسَّع لاحقاً |
| هل تضيف ما نحتاجه للأهلية؟ | **نعم** — `request_audience` + RPC |
| تعديل قبل staging apply؟ | **لا ضروري** للتعارض — لكن **UI أدمن** يحتاج تحديث لاحقاً لحقول audience |
| تأجيل حتى DESIGN؟ | **اختياري** — migrations لا تمنع DESIGN؛ **إيقاف مؤقت** لقراءة هذا التقرير |
| foundation ثم admin-config؟ | **نعم — المسار الموصى به** |

---

## 13. Apply Recommendation

### **PROCEED_WITH_CURRENT_STAGING_APPLY**

**السبب:**

1. migrations الثلاثة **لا تبني** workflow admin-config ولا تمنعه.
2. تضيف **أعمدة أهلية** يحتاجها النموذج المستقبلي (`request_audience`, `ineligible_display_mode`).
3. تؤمّن **مسار الطالب** (RPC + RLS) قبل توسيع بوابات المعالجين.
4. `workflow_schema` JSON **يبقى** حتى مرحلة DESIGN/تنفيذ لاحقة — لا حذف ولا تعارض.

**شروط:**

- **لا** يُطبَّق staging حتى يُراجع المستخدم هذا التقرير ويُكمِل **DESIGN-01** (قرار المستخدم الحالي: إيقاف مؤقت).
- بعد apply: **لا** يزال الأدمن يحتاج DESIGN لتكوين workflow من UI.
- يجب **توسيع** `/admin/request-types` لحقول audience بعد apply.

**لماذا ليس HOLD_FOR_ADMIN_WORKFLOW_DESIGN للـ migrations:**

- HOLD كامل للـ migrations **يؤخر** أمان الطالب (`sr_insert_self` removal, submit bypass) دون فائدة — DESIGN لا يتطلب تغيير هذه الملفات.

**لماذا ليس NEEDS_MIGRATION_ADJUSTMENT:**

- لا تعارض schema/RPC مع processing_units المقترحة.

---

## 14. Recommended Next Phase

### **STUDENT-REQUEST-ADMIN-CONFIGURABLE-WORKFLOW-DESIGN-01**

يجب أن يحدد:

1. نموذج `processing_units` + `processing_roles`
2. انتقال من `workflow_schema` JSON إلى جداول configurable
3. ربط `department_chair` / `dean` بـ faculty portal inbox
4. staff portal vs admin consolidation
5. notification model per unit/step
6. توسيع `/admin/request-types` + محرر workflow
7. خارطة مراحل تنفيذ بعد DESIGN

**بعد DESIGN:**

- إن لم يتغيّر schema الطالب → **STUDENT-REQUEST-TYPES-STAGING-APPLY-01** (بموافقة صريحة مجدداً)
- ثم مراحل ADMIN-CONFIG-IMPLEMENTATION

---

## 15. No-Write Assurance

| العنصر | تم؟ |
|--------|-----|
| إنشاء/تعديل migration | ❌ |
| تشغيل migration / Supabase apply | ❌ |
| تعديل DB / data writes | ❌ |
| تعديل UI/server/routes | ❌ |
| service role | ❌ |
| commit / push / PR | ❌ |
| STAGING-APPLY-01 | **موقوف** بقرار المستخدم |

**الملف الوحيد المُنشأ:** `docs/STUDENT-REQUEST-ADMIN-CONFIGURABLE-WORKFLOW-AUDIT-01-REPORT.md`

---

*نهاية التقرير — STUDENT-REQUEST-ADMIN-CONFIGURABLE-WORKFLOW-AUDIT-01*
