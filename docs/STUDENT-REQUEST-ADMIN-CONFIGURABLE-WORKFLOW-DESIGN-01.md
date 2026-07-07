# STUDENT-REQUEST-ADMIN-CONFIGURABLE-WORKFLOW-DESIGN-01

**التاريخ:** 2026-07-06  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**GitHub:** [msorori-mh/saba-uni-portal](https://github.com/msorori-mh/saba-uni-portal)  
**المصدر:** [STUDENT-REQUEST-ADMIN-CONFIGURABLE-WORKFLOW-AUDIT-01-REPORT.md](./STUDENT-REQUEST-ADMIN-CONFIGURABLE-WORKFLOW-AUDIT-01-REPORT.md) (NEEDS_DESIGN)  
**القرار التصميمي:** **READY_FOR_SCHEMA_DESIGN**  
**توصية migrations المعلّقة:** **PROCEED_WITH_CURRENT_STAGING_APPLY_AFTER_DESIGN**  
**المرحلة التالية الموصى بها:** **STUDENT-REQUEST-PROCESSING-UNITS-SCHEMA-01**

---

## 1. Executive Summary

| البند | القرار |
|-------|--------|
| **القرار التصميمي** | **READY_FOR_SCHEMA_DESIGN** |
| **الوضع الحالي** | بنية تحتية جزئية: `request_types`، `workflow_schema` JSON مُزروع، خطوات runtime، أدوار، مناصب — **بدون** محرر workflow من الأدمن |
| **الهدف** | جعل أنواع الطلبات ودورات حياتها **قابلة للإعداد بالكامل من الأدمن** دون hardcoding أو seed إلزامي |
| **migrations الطالب المعلّقة** | يمكن تطبيقها لاحقاً **كـ foundation** لطبقة الطالب والأهلية — **لا تتعارض** مع هذا التصميم |
| **تعديل migrations قبل apply** | **لا** — تبقى كما هي؛ تُطبَّق قبل أو بالتوازي مع schema workflow حسب موافقة المستخدم |

### الخلاصة

النظام الحالي يدعم **جزءاً كبيراً** من طبقة الطالب (`request_types` كـ master data، RPCs للأهلية والإنشاء والإرسال، خطوات runtime، أحداث audit) لكنه **لا يدعم** إنشاء دورة حياة كاملة لكل نوع طلب من واجهة الأدمن. الـ `workflow_schema` اليوم **مُزروع في SQL** (`20260706120000`) وليس قابلاً للتحرير من `/admin/request-types`.

التصميم المقترح يفصل بين:

1. **Master data** — أنواع الطلبات (من الأدمن).
2. **Configuration** — وحدات المعالجة، المسميات، خطوات workflow لكل نوع.
3. **Runtime** — مثيلات الطلبات، خطوات تشغيلية، تعيينات، أحداث، إشعارات.

**رئيس القسم والعميد** يُربطان عبر **مناصب أكاديمية** (`organizational_positions` + `position_assignments` + `faculty_profiles`) ويظهر أثرهما في **بوابة الأكاديميين** — وليس كموظفين إداريين منفصلين فقط.

**migrations الثلاثة المعلّقة** (`20260710130000`–`150000`) تخدم طبقة الطالب فقط (`request_audience`, `ineligible_display_mode`, RPC/RLS, submit bypass fix) ويمكن تطبيقها **بعد اكتمال هذا التصميم** دون تعديل — ثم تُبنى طبقات workflow config وprocessing units في مراحل لاحقة.

---

## 2. Scope

هذه المرحلة **تصميم فقط**:

| ضمن النطاق | خارج النطاق (ممنوع في هذه المرحلة) |
|------------|-------------------------------------|
| تصميم نموذج admin-configurable workflow | DB changes |
| تصميم جداول/ RPCs / RLS مستقبلية | migrations جديدة أو تعديل الحالية |
| تأثير على البوابات (أدمن، طالب، أكاديميين، موظفين) | تشغيل migrations / staging apply / Supabase apply |
| خارطة مراحل تنفيذ لاحقة | seed لأنواع الطلبات |
| قرارات مطلوبة من المستخدم (§19) | تعديل UI / server / routes / TypeScript |
| | commit / push / PR |
| | data writes / service role |

**الكتابة الوحيدة في هذه المرحلة:** هذا الملف.

---

## 3. Current Foundation Summary

### ما هو موجود اليوم

| العنصر | الحالة | ملاحظة |
|--------|--------|--------|
| `/admin/request-types` | ✅ أساسي | CRUD: `code`, `name_ar`, `description_ar`, `is_active`, `requires_attachment`, `sort_order` |
| `request_types` | ✅ | master data + `form_schema`, `workflow_schema` JSON |
| `workflow_schema` | ✅ JSON | **مُزروع في migration** — ليس من الأدمن |
| `student_service_request_steps` | ✅ | خطوات runtime لكل طلب |
| `student_service_request_events` | ✅ | سجل أحداث/audit |
| `actOnStudentServiceRequest` | ✅ | `student-affairs.functions.ts` — إجراءات workflow |
| `getPendingStudentRequestsForRole` | ✅ | قائمة معلّقة حسب `role_key` |
| `roles_catalog` | ✅ | كتالوج مسميات + `app_role_mapping` |
| `organizational_positions` | ✅ | هيكل مناصب الكلية |
| `position_role_mapping` | ✅ | ربط منصب ↔ دور |
| `app_role` + `user_roles` | ✅ | صلاحيات أمنية |
| `staff_profiles` | ✅ | بوابة `/staff/` |
| `faculty_profiles` | ✅ | بوابة `/faculty-portal/` |
| `position_assignments` | ⚠️ فارغ | schema موجود — **لا إسناد نشط** |
| inbox في `/faculty-portal/` | ❌ | لا طلبات طلاب لرئيس القسم/العميد |
| محرر workflow من الأدمن | ❌ | الفجوة الرئيسية |
| Staff request inbox | ❌ | المعالجة عبر `/admin/student-requests` |
| `request_audience` / `ineligible_display_mode` | ⏳ migration معلّق | `20260710130000` — غير مطبّق |

### تدفق runtime الحالي

```text
request_types.workflow_schema (JSON ثابت)
        ↓ submit_student_request
student_service_request_steps (per request)
student_service_request_events (audit)
student_requests.current_step_index / current_role_key
        ↓
getPendingStudentRequestsForRole(role_key)
actOnStudentServiceRequest(action)
```

### Hardcoding متبقٍ

- `workflow_schema` في seed SQL (`20260706120000`).
- panels نوع-محددة في `admin/student-requests.lazy.tsx`.
- `StudentRequestsSection.tsx` deprecated (~1900 سطر) — غير مُركَّب.

---

## 4. Design Principles

1. **Admin-configurable, not hardcoded** — لا أنواع طلبات ولا خطوات workflow في الكود أو seed إلا بطلب صريح لاحقاً.
2. **Request type is master data** — `request_types` المصدر الوحيد لتعريف نوع الطلب؛ الكود يقرأ فقط.
3. **Workflow is per request type** — كل نوع له دورة حياة مستقلة قابلة للإعداد.
4. **Workflow steps target processing units/roles/positions** — كل خطوة موجهة لجهة ومسمى واضحين.
5. **Runtime requests generate step instances** — عند الإرسال تُنشأ خطوات من التعريف لا من hardcode.
6. **Every action creates event/audit trail** — كل قرار → `student_service_request_events` (+ `audit_logs` عند الحاجة).
7. **Notifications are generated from workflow events** — الإشعار ناتج عن حدث خطوة وليس UI فقط.
8. **Faculty positions** (رئيس قسم، عميد) تُربط عبر `faculty_profiles` + `position_assignments` — بوابة أكاديميين.
9. **Staff/admin processing units** تُدار عبر `staff_profiles` + `user_roles` + تعيينات على الوحدات.
10. **RLS/RPC must enforce access, not UI only** — نفس نمط bypass-fix الحالي لمسار الطالب.
11. **Extensible for future units and titles** — وحدات ومسميات جديدة دون تغيير كود التطبيق.

---

## 5. Request Type Admin Configuration Design

### 5.1 صفحة الأدمن: إنشاء/تعديل نوع الطلب

المسار الحالي: `/admin/request-types` — يُوسَّع إلى **محرر متعدد التبويبات**:

| التبويب | المحتوى |
|---------|---------|
| **أساسي** | معلومات النوع والجمهور والظهور |
| **النموذج** | `form_schema` + `required_documents` |
| **Workflow** | محرر خطوات الدورة (§9) |
| **متقدم** | رسوم، وثائق، إعدادات إشعار (مراحل لاحقة) |

### 5.2 الحقول المقترحة

| الحقل | موجود DB؟ | موجود UI؟ | مطلوب إضافته | ظهور للطالب |
|-------|-----------|-----------|--------------|-------------|
| `code` | ✅ | ✅ | — | غير مباشر (معرّف داخلي) |
| `name_ar` | ✅ | ✅ | — | عنوان البطاقة/القائمة |
| `name_en` / `title_en` | ✅ عمود | ❌ | عرض في UI أدمن | اختياري لاحقاً |
| `description_ar` | ✅ | ✅ | — | وصف عند الإنشاء |
| `is_active` | ✅ | ✅ | — | يخفي النوع إن `false` |
| `student_visible` | ✅ | ❌ | **UI أدمن** | يتحكم في الظهور للطالب |
| `request_audience` | ⏳ migration | ❌ | **UI أدمن** | يحدد الأهلية (مستمر/خريج/كلاهما) |
| `ineligible_display_mode` | ⏳ migration | ❌ | **UI أدمن** | مخفي أو معطّل لغير المؤهلين |
| `sort_order` | ✅ | ✅ | — | ترتيب القائمة |
| `requires_attachment` | ✅ | ✅ | — | تنبيه/إلزام رفع مرفق |
| `requires_fee` | ❌ | ❌ | عمود + UI (مرحلة لاحقة) | خطوة دفع لاحقاً |
| `produces_document` | ❌ جزئياً | ❌ | flag + ربط `official_documents` | استلام وثيقة عند الإكمال |
| `primary_processing_unit` | ❌ | ❌ | FK → `request_processing_units` | اختياري: «الجهة الأولى» في التقدم |
| `workflow_enabled` | ضمني | ❌ | flag صريح | بدون workflow = مسار بسيط (مستقبلاً) |
| `form_schema` | ✅ JSON | ❌ | **محرر نموذج** | حقول ديناميكية في `/student/requests/new` |
| `workflow_schema` أو ربط جدول | ✅ JSON | ❌ | **محرر workflow** أو `request_type_workflow_steps` | شريط تقدم + حالة الخطوة |
| `category` | ✅ | ❌ | اختياري في UI | تجميع في القائمة |
| `required_documents` | ✅ JSON | ❌ | محرر قائمة | قائمة مستندات مطلوبة |
| `article_ref` | ✅ | ❌ | اختياري | مرجع نظامي |

### 5.3 سلوك الأدمن

1. **إنشاء نوع جديد:** يُدخل `code` + `name_ar` + `request_audience` + `is_active` → يحفظ كـ draft type.
2. **تفعيل للطلاب:** يتطلب `student_visible = true` + `is_active = true` + workflow مُعرَّف (إن `workflow_enabled`).
3. **لا seed تلقائي:** الأدمن يُنشئ كل الأنواع يدوياً؛ الـ seed الحالي في migrations يُعتبر **بيانات انتقالية** تُزال أو تُستبدل لاحقاً بقرار المستخدم.
4. **التحقق:** RPC `admin_upsert_request_type` يتحقق من `code` فريد، audience صالح، ووجود خطوة واحدة على الأقل إن workflow مفعّل.

### 5.4 سلوك بوابة الطالب

- `get_available_request_types_for_current_student` (موجود في migration معلّق) يُرجع الأنواع حسب:
  - `is_active` + `student_visible`
  - `request_audience` مقابل `student_profiles.status`
  - `ineligible_display_mode`: `hidden` = لا يظهر؛ `disabled` = يظهر معطّلاً مع سبب
- عند الإنشاء: `form_schema` يُولّد الحقول ديناميكياً.
- عند الإرسال: تُنشأ خطوات runtime من تعريف workflow (JSON أو جدول normalised).

---

## 6. Processing Units Design

### 6.1 جدول مقترح: `request_processing_units`

```sql
-- تصميم مستقبلي — لا migration في هذه المرحلة
request_processing_units (
  id              uuid PK,
  code            text UNIQUE NOT NULL,     -- registrar, student_affairs, ...
  name_ar         text NOT NULL,
  name_en         text,
  description     text,
  is_active       boolean DEFAULT true,
  portal_scope    text NOT NULL,            -- admin | staff | faculty | mixed
  default_role_key text,                    -- fallback app_role للـ RLS
  can_be_assigned_to_user    boolean DEFAULT true,
  can_be_assigned_to_position boolean DEFAULT false,
  organizational_position_code text NULL,   -- ربط اختياري بـ organizational_positions
  sort_order      int DEFAULT 0,
  created_at      timestamptz,
  updated_at      timestamptz
)
```

### 6.2 الوحدات الأولية

| code | name_ar | portal_scope | default_role_key | can_user | can_position | ملاحظة |
|------|---------|--------------|------------------|----------|--------------|--------|
| `registrar` | المسجل العام | admin | `registrar` | ✅ | ✅ | رؤية شاملة مقترحة |
| `student_affairs` | إدارة شؤون الطلاب | staff | `student_affairs` | ✅ | ✅ | طلبات `active_student` |
| `graduate_affairs` | إدارة شؤون الخريجين | staff | — (جديد) | ✅ | ✅ | طلبات `graduate` |
| `archive` | الإرشيف | staff | — | ✅ | ❌ | أرشفة وثائق |
| `finance` | الإيرادات والمالية | staff | `finance_officer` | ✅ | ❌ | خطوات رسوم لاحقة |
| `library` | المكتبة | staff | — | ✅ | ❌ | مراجعة مكتبة |
| `labs` | المعامل | staff | — | ✅ | ❌ | مراجعة معامل |
| `department_chair` | رئيس القسم العلمي | faculty | `department_head` | ❌ | ✅ | **منصب أكاديمي فقط** |
| `dean` | عميد الكلية | faculty | `dean` | ❌ | ✅ | **منصب أكاديمي فقط** |

### 6.3 تصنيف الوحدات

| الفئة | الوحدات | البوابة |
|-------|---------|---------|
| **Staff/admin units** | student_affairs, graduate_affairs, finance, archive, library, labs, registrar (إداري) | `/staff/` أو `/admin/` |
| **Academic/faculty position units** | department_chair, dean | `/faculty-portal/` |
| **مستقبلية** | وحدات جديدة عبر CRUD أدمن | حسب `portal_scope` |

### 6.4 التوسع

- إضافة وحدة جديدة = صف في `request_processing_units` + مسميات في `request_processing_roles` (§7).
- لا تغيير في كود التطبيق — workflow يشير إلى `processing_unit.code`.
- ربط اختياري بـ `organizational_positions` للتقارير والهيكل التنظيمي.

---

## 7. Processing Roles / Job Titles Design

### 7.1 جدول مقترح: `request_processing_roles`

```sql
request_processing_roles (
  id                    uuid PK,
  code                  text UNIQUE NOT NULL,
  name_ar               text NOT NULL,
  processing_unit_id    uuid FK → request_processing_units,
  role_kind             text NOT NULL,  -- staff | faculty_position | admin
  maps_to_app_role      app_role NULL,  -- للـ RLS fallback
  maps_to_position_code text NULL,      -- organizational_positions.code
  is_active             boolean DEFAULT true,
  sort_order            int DEFAULT 0
)
```

### 7.2 جدول تعيينات: `request_processing_assignments`

```sql
request_processing_assignments (
  id                    uuid PK,
  processing_role_id    uuid FK,
  user_id               uuid FK → auth.users NULL,
  position_assignment_id uuid FK → position_assignments NULL,
  department_id         uuid NULL,      -- نطاق رئيس قسم
  is_primary            boolean DEFAULT false,
  valid_from            date,
  valid_to              date NULL,
  is_active             boolean DEFAULT true
)
```

### 7.3 المسميات المطلوبة

| code | name_ar | unit | role_kind | maps_to_app_role | maps_to_position |
|------|---------|------|-----------|------------------|------------------|
| `registrar_general` | المسجل العام | registrar | admin | `registrar` | `registrar` |
| `student_affairs_manager` | مدير إدارة شؤون الطلاب | student_affairs | staff | — | — |
| `student_affairs_specialist` | مختص شؤون الطلاب | student_affairs | staff | `student_affairs` | — |
| `graduate_affairs_manager` | مدير شؤون الخريجين | graduate_affairs | staff | — | — |
| `graduate_affairs_specialist` | مختص شؤون الخريجين | graduate_affairs | staff | — | — |
| `archive_officer` | مسؤول الإرشيف | archive | staff | — | — |
| `finance_officer` | مسؤول المالية | finance | staff | `finance_officer` | — |
| `library_officer` | مسؤول المكتبة | library | staff | — | — |
| `lab_manager` | مسؤول المعامل | labs | staff | — | — |
| `lab_keeper` | أمين معمل | labs | staff | — | — |
| `department_chair` | رئيس القسم العلمي | department_chair | faculty_position | `department_head` | `department_head` |
| `dean` | عميد الكلية | dean | faculty_position | `dean` | `dean` |

### 7.4 التوصية المعمارية: لا نخلط role/security مع job title

| الطبقة | الغرض | أمثلة |
|--------|-------|-------|
| **`app_role` + `user_roles`** | صلاحيات أمنية عامة (RLS/RPC) | `admin`, `registrar`, `student_affairs`, `dean`, `department_head` |
| **`roles_catalog`** | مسميات وظيفية للهيكل التنظيمي + mapping | مرجع للتقارير والـ HR |
| **`organizational_positions`** | مناصب الكلية الرسمية | `dean`, `department_head`, `registrar` |
| **`position_assignments`** | من يشغل المنصب ومتى | user ↔ position ↔ department |
| **`request_processing_units`** | جهات توجيه workflow | student_affairs, dean, … |
| **`request_processing_roles`** | مسميات معالجة الطلبات | student_affairs_specialist, department_chair |
| **`request_processing_assignments`** | من يعالج فعلياً | user أو position_assignment |

**قاعدة:** workflow يشير إلى `processing_unit` + `processing_role`؛ RPC يحلّ **المُعالِج الفعلي** عبر:
- `role_pool` → كل مستخدمي الوحدة/المسمى
- `department_position` → `position_assignments` لقسم الطالب
- `college_position` → عميد الكلية من `position_assignments`

**رئيس القسم والعميد:** لا يُنشآن كـ `staff_profiles` منفصلين للمعالجة — يُستمدان من `faculty_profiles` + `position_assignments` حيث `maps_to_position_code` = `department_head` / `dean`.

---

## 8. Stakeholder Matrix

| الجهة/المسمى | النوع | البوابة | ما يراه | ما يستطيع فعله | inbox؟ | notifications؟ | قيود الوصول |
|--------------|-------|---------|---------|----------------|--------|----------------|-------------|
| المسجل العام | unit + role | admin | كل الطلبات، كل الخطوات | إعادة توجيه، audit، override إداري | ✅ | ✅ | `registrar` / `admin` |
| إدارة شؤون الطلاب | unit | staff/admin | طلبات/خطوات موجهة للوحدة | مراجعة، موافقة، رفض، إرجاع | ✅ | ✅ | حسب سياسة §19 |
| مدير إدارة شؤون الطلاب | role | staff | نفس الوحدة + اعتمادات | اعتماد، إحالة لمختص | ✅ | ✅ | processing_role scope |
| مختص شؤون الطلاب | role | staff | خطوات موجهة له/للوحدة | معالجة أولية، تعليق | ✅ | ✅ | processing_role scope |
| إدارة شؤون الخريجين | unit | staff | طلبات graduate / خطوات الوحدة | مراجعة، موافقة | ✅ | ✅ | audience + step scope |
| مدير شؤون الخريجين | role | staff | خطوات الوحدة | اعتماد | ✅ | ✅ | processing_role |
| مختص شؤون الخريجين | role | staff | خطوات الوحدة | معالجة | ✅ | ✅ | processing_role |
| الإرشيف | unit | staff | خطوات أرشفة | أرشفة، إغلاق | ✅ | ✅ | خطوات archive فقط |
| الإيرادات والمالية | unit + role | staff | خطوات مالية | تأكيد دفع، رفض | ✅ (لاحقاً) | ✅ | خطوات finance فقط |
| مسؤول المكتبة | role | staff | خطوات مكتبة | مراجعة، تعليق | ✅ | ✅ | خطوات library |
| مسؤول المعامل | role | staff | خطوات معامل | مراجعة | ✅ | ✅ | خطوات labs |
| أمين معمل | role | staff | خطوات معامل فرعية | مراجعة محدودة | ✅ | ✅ | حسب التعيين |
| رئيس القسم العلمي | faculty-position | faculty | طلبات قسم الطالب في خطواته | موافقة، رفض، تعليق، إرجاع | ✅ **جديد** | ✅ **جديد** | `department_id` = قسم الطالب |
| عميد الكلية | faculty-position | faculty | طلبات تحتاج اعتماد عميد | اعتماد، رفض | ✅ **جديد** | ✅ **جديد** | college scope |
| وحدات مستقبلية | unit | حسب التعريف | خطوات موجهة لها | حسب `action_type` | ✅ | ✅ | processing_unit scope |

---

## 9. Workflow Configuration Design

### 9.1 محرر الأدمن لدورة الحياة

المسار: `/admin/request-types/:code/workflow` — أو تبويب Workflow في محرر النوع.

الأدمن يُعرّف **قائمة خطوات مرتبة** لكل نوع طلب. المستخدم سيُزوّد لاحقاً دورة حياة كل طلب بالكامل؛ التصميم يستوعب أي تسلسل.

### 9.2 أمثلة خطوات (قابلة للتكوين بالكامل)

| step_key (مثال) | step_name_ar | processing_unit | processing_role |
|-----------------|--------------|-----------------|-----------------|
| `intake` | استقبال الطلب | registrar | registrar_general |
| `student_affairs_review` | مراجعة شؤون الطلاب | student_affairs | student_affairs_specialist |
| `graduate_affairs_review` | مراجعة شؤون الخريجين | graduate_affairs | graduate_affairs_specialist |
| `finance_review` | مراجعة مالية | finance | finance_officer |
| `library_review` | مراجعة مكتبة | library | library_officer |
| `lab_review` | مراجعة معمل | labs | lab_manager |
| `dept_chair_approval` | موافقة رئيس القسم | department_chair | department_chair |
| `dean_approval` | اعتماد العميد | dean | dean |
| `archive` | أرشفة | archive | archive_officer |
| `issue_document` | إصدار وثيقة | registrar | registrar_general |
| `complete` | إكمال الطلب | registrar | registrar_general |

### 9.3 إعدادات كل خطوة

| الحقل | الوصف |
|-------|--------|
| `step_key` | معرّف فريد ضمن النوع |
| `step_name_ar` | عنوان عربي للطالب/المعالج |
| `step_order` | ترتيب (1-based) |
| `processing_unit` | FK/code → `request_processing_units` |
| `processing_role` | FK/code → `request_processing_roles` |
| `assignment_strategy` | كيف يُحدد المُعالِج (انظر أدناه) |
| `action_type` | نوع الإجراء الأساسي للخطوة |
| `is_required` | هل الخطوة إلزامية |
| `can_return_to_student` | السماح بإرجاع للطالب |
| `can_reject` | السماح بالرفض |
| `can_skip` | تخطي بصلاحية admin |
| `notify_on_enter` | إشعار عند دخول الخطوة |
| `notify_on_complete` | إشعار عند إكمال الخطوة |
| `next_step_on_approve` | `step_key` التالي أو `null` = تلقائي بالترتيب |
| `next_step_on_reject` | terminal أو خطوة محددة |
| `next_step_on_return` | عادة `returned` للطالب |
| `visibility_to_student` | `full` / `status_only` / `hidden` |

#### `assignment_strategy` (قيم مقترحة)

| القيمة | السلوك |
|--------|--------|
| `role_pool` | أي مستخدم لديه `processing_role` أو `app_role` المطابق |
| `specific_user` | مستخدم محدد في `request_processing_assignments` |
| `department_position` | `position_assignments` لرئيس قسم **قسم الطالب** |
| `college_position` | عميد الكلية من `position_assignments` |
| `requester_department_head` | اختصار لـ `department_position` |
| `dean` | اختصار لـ `college_position` |

#### `action_type` (قيم مقترحة)

| القيمة | المعنى |
|--------|--------|
| `review` | مراجعة دون اعتماد نهائي |
| `approve` | موافقة/اعتماد |
| `reject` | رفض الطلب |
| `comment` | تعليق فقط |
| `return_to_student` | إرجاع للاستكمال |
| `request_attachment` | طلب مرفق إضافي |
| `request_payment` | طلب دفع (مرحلة لاحقة) |
| `archive` | أرشفة |
| `issue_document` | إصدار وثيقة رسمية |

### 9.4 تخزين التعريف

**مرحلة انتقالية:** الإبقاء على `workflow_schema` JSON مع بنية موسّعة:

```json
{
  "version": 2,
  "steps": [
    {
      "key": "student_affairs_review",
      "title_ar": "مراجعة شؤون الطلاب",
      "order": 2,
      "processing_unit": "student_affairs",
      "processing_role": "student_affairs_specialist",
      "assignment_strategy": "role_pool",
      "action_type": "review",
      "is_required": true,
      "can_return_to_student": true,
      "can_reject": true,
      "can_skip": false,
      "notify_on_enter": true,
      "notify_on_complete": true,
      "next_step_on_approve": "dept_chair_approval",
      "next_step_on_reject": null,
      "next_step_on_return": "returned",
      "visibility_to_student": "status_only",
      "allowed_actions": ["approve", "reject", "return_for_completion", "comment"]
    }
  ]
}
```

**مرحلة مستهدفة:** جدول normalised `request_type_workflow_steps` (مرحلة SCHEMA لاحقة) — يُملأ من محرر الأدمن ويُصدَّر إلى JSON للتوافق العكسي إن لزم.

### 9.5 عند submit

1. قراءة تعريف workflow من `request_types` (أو جدول الخطوات).
2. إنشاء صف لكل خطوة في `student_service_request_steps` مع:
   - `step_key`, `step_order`, `processing_unit_code`, `processing_role_code`
   - `status` = `pending` للخطوة الأولى، `waiting` للباقي
   - `assigned_user_id` / `assigned_position_id` حسب `assignment_strategy`
3. تحديث `student_requests.current_step_index`, `current_role_key`, `current_processing_unit`
4. تسجيل حدث `workflow_started` في `student_service_request_events`
5. إشعار حسب `notify_on_enter` للخطوة الأولى

---

## 10. Runtime Workflow Tables Design

### 10.1 تقييم الموجود

| جدول | الحالة | التوصية |
|------|--------|---------|
| `student_service_request_steps` | ✅ موجود | **إبقاء وتوسيع** أعمدة |
| `student_service_request_events` | ✅ موجود | **إبقاء** — audit أساسي |
| `student_requests` | ✅ موجود | إضافة `current_processing_unit`, `current_processing_role` لاحقاً |

### 10.2 جداول مقترحة/موسّعة

#### `student_service_request_steps` (توسيع)

| عمود مقترح | الغرض | موجود؟ | migration لاحق؟ |
|------------|--------|--------|----------------|
| `step_key` | معرّف الخطوة | ✅ | — |
| `step_order` | الترتيب | جزئياً | ✅ |
| `processing_unit_code` | الجهة | ❌ (`role_key` فقط) | ✅ |
| `processing_role_code` | المسمى | ❌ | ✅ |
| `assignment_strategy` | كيف حُلّت التعيين | ❌ | ✅ |
| `assigned_user_id` | معالج محدد | ❌ | ✅ |
| `assigned_position_id` | منصب محدد | ❌ | ✅ |
| `action_type` | نوع الخطوة | ❌ | ✅ |
| `status` | pending/active/completed/skipped/rejected | ✅ | — |

#### `student_request_assignments` (جديد)

| العمود | الغرض |
|--------|--------|
| `id`, `request_id`, `step_id` | ربط بطلب وخطوة |
| `assignee_user_id` | المستخدم المُعيَّن |
| `assignee_role_code` | المسمى |
| `assigned_at`, `assigned_by` | تتبع |
| `is_active` | التعيين النشط |

**الغرض:** تاريخ تعيينات متعددة (إحالة بين مختصين). **migration لاحقاً:** نعم.

#### `student_request_reviews` (جديد — اختياري)

| العمود | الغرض |
|--------|--------|
| `step_id`, `reviewer_id`, `decision`, `comment` | قرارات تفصيلية |

**البديل:** دمج القرار في `student_service_request_events` — **يُفضَّل البديل** لتقليل الجداول؛ `reviews` فقط إن احتجنا تعدد مراجعين لنفس الخطوة.

#### `student_service_request_events` (إبقاء)

| عمود | الغرض |
|--------|--------|
| موجود | `event_type`, `actor_id`, `payload`, `created_at` |
| توسيع payload | تضمين `processing_unit`, `processing_role`, `action_type` |

#### `student_request_status_history` (جديد — اختياري)

**الغرض:** تتبع تغييرات `student_requests.status`.  
**التوصية:** يمكن الاكتفاء بـ `events` — الجدول منفصل فقط إن طلبت تقارير HR/إدارية.

#### `student_request_notifications` (جديد — اختياري)

**الغرض:** ربط إشعارات الطلبات بخطوات محددة.  
**البديل:** توسيع `notifications` بـ `reference_type = 'student_request_step'` — **يُفضَّل البديل** مع جدول `notification_recipients` للوحدات.

### 10.3 ملخص

```text
[Config]  request_types + workflow steps definition
              ↓ submit
[Runtime] student_requests
              ↓
          student_service_request_steps (expanded)
              ↓ act_on_step RPC
          student_service_request_events
              ↓
          notifications (existing table)
```

---

## 11. Admin Portal Impact

| # | الصفحة/الميزة | موجود؟ | مطلوب تطويره | الأولوية |
|---|---------------|--------|--------------|----------|
| 1 | صفحة أنواع الطلبات `/admin/request-types` | ✅ أساسي | audience, visibility, flags, تبويبات | **P1** |
| 2 | محرر `form_schema` | ❌ | JSON editor / form builder | **P2** |
| 3 | محرر workflow | ❌ | خطوات، جهات، انتقالات | **P1** |
| 4 | صفحة الجهات المعالجة | ❌ | CRUD `request_processing_units` | **P1** |
| 5 | صفحة المسميات/الأدوار | ❌ | CRUD `request_processing_roles` | **P1** |
| 6 | تعيين المستخدمين على الجهات | ❌ | `request_processing_assignments` UI | **P2** |
| 7 | متابعة الطلبات | ✅ جزئياً `/admin/student-requests` | فلترة حسب unit/role | **P2** |
| 8 | تفاصيل الطلب | ✅ | عرض generic من `form_schema` بدل panels | **P2** |
| 9 | audit/events | ✅ جزئياً | عرض أحداث موحّد | **P3** |
| 10 | إعدادات الإشعارات | ❌ | قوالب per step/type | **P3** |

### ترتيب تطوير UI أدمن

1. Processing units + roles (master data).
2. توسيع request-types + workflow editor.
3. تعيينات المستخدمين/المناصب.
4. form_schema editor.
5. توحيد student-requests detail (إزالة hardcoded panels تدريجياً).

---

## 12. Student Portal Impact

| الميزة | موجود؟ | بعد التصميم |
|--------|--------|-------------|
| عرض الطلبات حسب RPC الأهلية | ⏳ migration + UI consolidation | `get_available_request_types_for_current_student` |
| عرض معطّل لغير المؤهلين | ⏳ | `ineligible_display_mode = disabled` |
| إنشاء الطلب `/student/requests/new` | ✅ | حقول من `form_schema` ديناميكياً |
| workflow progress | جزئياً | شريط خطوات من `workflow_schema` + حالة runtime |
| الجهة الحالية | ❌ | «قيد المراجعة لدى: شؤون الطلاب» (حسب `visibility_to_student`) |
| الملاحظات والتعليقات | جزئياً | عرض تعليقات من events |
| رفع المرفقات | قراءة فقط في بعض المسارات | رفع عند الإنشاء وعند `request_attachment` |
| الرد على returned request | ✅ جزئياً | إعادة إرسال بعد الاستكمال |
| متابعة الحالة | ✅ | قائمة + تفاصيل |
| استلام النتيجة / وثيقة | جزئياً | عند `issue_document` + `produces_document` |
| الرسوم | ❌ | مرحلة FEES لاحقة |

**لا hardcoding لأنواع** — القائمة كلها من `request_types` عبر RPC.

---

## 13. Faculty / Academic Portal Impact

### 13.1 الوضع الحالي

- `/faculty-portal/` موجود مع إشعارات عامة.
- **لا** inbox لطلبات الطلاب.
- `department_head` / `dean` في `app_role` لكن بدون واجهة مخصصة.

### 13.2 المطلوب (جديد)

| المكون | الوصف |
|--------|--------|
| بطاقة رئيسية | «طلبات الطلاب» مع عداد `pending` |
| `/faculty-portal/student-requests` | Inbox المعلّق |
| فلترة رئيس القسم | `department_id` = قسم الطالب فقط |
| فلترة العميد | طلبات بخطوة `dean` أو college-wide حسب السياسة |
| تفاصيل الطلب | بيانات الطالب، `form_data`, مرفقات |
| إجراءات | تعليق، موافقة، رفض، إرجاع |
| سجل الأحداث | timeline من `student_service_request_events` |
| إشعارات | عند دخول خطوة `department_chair` / `dean` |

### 13.3 RPCs مقترحة

- `get_pending_student_requests_for_faculty_actor`
- `get_student_request_detail_for_faculty_actor`
- `act_on_student_request_step` (مشترك مع staff — مع scope check)

### 13.4 قيود

- **فصل عن المجالس الأكاديمية** — مسار `/faculty-portal/student-requests` منفصل عن councils.
- المعالجة عبر **RPC فقط** — لا UPDATE مباشر.
- رئيس القسم يُستمد من `position_assignments` — لا قائمة يدوية في الكود.

---

## 14. Staff Portal Impact

### 14.1 الوضع الحالي

- `/staff/` dashboard أساسي موجود.
- **لا** مسار طلبات طلاب.
- المعالجة اليوم عبر `/admin/student-requests` بأدوار admin-like.

### 14.2 التوصية

**توسيع بوابة الموظفين** (`/staff/`) بمسار جديد:

```text
/staff/student-requests          → inbox موحّد
/staff/student-requests/:id      → تفاصيل + إجراء
```

| الوحدة | المسار الفرعي (اختياري) | ما تراه |
|--------|-------------------------|---------|
| شؤون الطلاب | `?unit=student_affairs` | خطوات موجهة للوحدة |
| شؤون الخريجين | `?unit=graduate_affairs` | خطوات graduate |
| المالية | `?unit=finance` | خطوات مالية فقط |
| الإرشيف | `?unit=archive` | خطوات أرشفة |
| المكتبة | `?unit=library` | خطوات مكتبة |
| المعامل | `?unit=labs` | خطوات معامل |

### 14.3 صلاحيات

- كل جهة ترى **فقط** الطلبات التي في خطوة موجهة لـ `processing_unit` الخاص بها (أو `processing_role`).
- RLS + RPC يفرضان النطاق — ليس فلتر UI فقط.
- المسجل العام يبقى في **admin portal** برؤية أوسع.

### 14.4 بديل (قرار مستخدم §19)

توسيع Admin Portal بـ «وضع موظف» — **أقل تفضيلاً** لأنه يخلط صلاحيات admin مع معالجة يومية.

---

## 15. Notifications Design

### 15.1 أحداث تولّد إشعارات

| الحدث | المستلمون المقترحون |
|-------|---------------------|
| إنشاء الطلب (submit) | الطالب؛ الجهة الأولى في workflow |
| دخول خطوة جديدة | معالجو الخطوة (user/role pool/position) |
| تعيين الطلب لجهة | المستخدم المُعيَّن أو pool الوحدة |
| طلب مرفق | الطالب |
| طلب دفع | الطالب (لاحقاً) |
| إرجاع للطالب | الطالب |
| موافقة جهة | الطالب + الجهة التالية |
| رفض | الطالب |
| اكتمال | الطالب |
| إصدار وثيقة | الطالب |

### 15.2 مستلمو الإشعارات

| النوع | الآلية |
|-------|--------|
| الطالب | `notifications.user_id` = `student_profiles.user_id` |
| موظف محدد | `assigned_user_id` على الخطوة |
| وحدة كاملة | `notification_recipients` → كل `request_processing_assignments` للوحدة/role |
| رئيس قسم | يُحل من `position_assignments` + `department_id` |
| العميد | يُحل من `position_assignments` لمنصب `dean` |
| المسجل العام | اختياري: كل الأحداث أو ملخص يومي |

### 15.3 بنية مقترحة (توسيع `notifications`)

```text
notifications (موجود)
  + reference_type: 'student_request' | 'student_request_step'
  + reference_id
  + processing_unit_code (اختياري)
  + metadata: { step_key, action_type, request_number }

notification_recipients (جديد — للوحدات)
  notification_id, user_id, read_at
```

### 15.4 ميزات UI

| الميزة | الطالب | Faculty | Staff | Admin |
|--------|--------|---------|-------|-------|
| `NotificationsBell` | ✅ موجود | ✅ موجود | **جديد** | ✅ |
| unread counters | ✅ | ✅ per inbox | ✅ per unit | ✅ |
| بريد إلكتروني | جزئياً | لاحقاً | لاحقاً | موجود |

### 15.5 ربط بـ workflow config

- `notify_on_enter` / `notify_on_complete` على كل خطوة.
- قوالب رسائل قابلة للتخصيص لاحقاً في صفحة إعدادات الإشعارات.

---

## 16. Security / RLS / RPC Design

### 16.1 قواعد الوصول

| الفاعل | النطاق |
|--------|--------|
| الطالب | طلباته فقط؛ إنشاء/إرسال عبر RPC؛ لا تجاوز workflow |
| المسجل العام | جميع الطلبات (قراءة + إجراءات إدارية) |
| شؤون الطلاب | خطوات `student_affairs` + (سياسة) طلبات `active_student` |
| شؤون الخريجين | خطوات `graduate_affairs` + (سياسة) طلبات `graduate` |
| المالية | خطوات `finance` فقط |
| المكتبة | خطوات `library` فقط |
| المعامل | خطوات `labs` فقط |
| رئيس القسم | طلبات قسم الطالب في خطوات `department_chair` |
| العميد | طلبات بخطوة `dean` + (سياسة) college scope |
| Admin | تكوين + override + تقارير |

### 16.2 RPCs مستقبلية

| RPC | الغرض | الفاعلون |
|-----|--------|----------|
| `admin_create_request_type` | إنشاء نوع | admin, registrar, system_admin |
| `admin_update_request_type` | تحديث نوع | admin, registrar |
| `admin_configure_request_workflow` | حفظ خطوات workflow | admin, registrar |
| `admin_upsert_processing_unit` | إدارة الوحدات | system_admin, admin |
| `admin_upsert_processing_role` | إدارة المسميات | system_admin, admin |
| `admin_assign_processing_role` | تعيين مستخدم/منصب | admin |
| `get_pending_requests_for_current_actor` | inbox موحّد | staff, faculty, admin |
| `act_on_student_request_step` | approve/reject/return/... | حسب الخطوة |
| `get_student_request_detail_for_actor` | تفاصيل مع RLS | كل الفاعلين |
| `get_request_notifications` | قائمة إشعارات | كل الفاعلين |
| `mark_request_notification_read` | تعليم مقروء | كل الفاعلين |

### 16.3 مبادئ أمنية

1. **كل action عبر RPC** — لا UPDATE مباشر لـ `student_requests.status` من portals.
2. **كل action يسجل event** — `student_service_request_events` إلزامي.
3. **التحقق من الخطوة النشطة** — لا إجراء على خطوة `waiting` أو مكتملة.
4. **التحقق من assignment** — الفاعل يطابق `processing_role` أو `assigned_user_id` أو منصب محلول.
5. **can_access_student_service_request** — توسيع الدالة الحالية لتشمل `processing_unit` وfaculty scope.

---

## 17. Impact on Existing Migrations

### 17.1 الملفات المعلّقة

| Migration | المحتوى | طبقة |
|-----------|---------|------|
| `20260710130000_student_request_types_schema.sql` | `request_audience`, `ineligible_display_mode`, FK NOT VALID | schema طالب |
| `20260710140000_student_request_types_rpc_rls.sql` | RPCs طالب، RLS، إزالة INSERT المباشر | أمان طالب |
| `20260710150000_student_request_types_rls_submit_bypass_fix.sql` | submit عبر RPC فقط | أمان طالب |

### 17.2 تحليل التعارض

| سؤال | الجواب |
|------|--------|
| هل يمكن تطبيقها كما هي؟ | **نعم** — بعد موافقة staging |
| هل هي foundation طبقة الطالب فقط؟ | **نعم** — لا تلمس workflow config ولا processing units |
| هل تتعارض مع admin-config workflow؟ | **لا** — `workflow_schema` يبقى؛ يُوسَّع لاحقاً |
| هل تحتاج تعديل قبل التطبيق؟ | **لا** — للتعارض المعماري |
| هل يجب تأجيلها حتى schema workflow؟ | **لا إلزامياً** — يمكن تطبيقها **قبل** أو **بالتوازي** مع مراحل SCHEMA workflow |

### 17.3 التوصية

## **PROCEED_WITH_CURRENT_STAGING_APPLY_AFTER_DESIGN**

**الأسباب:**

1. migrations تؤمّن مسار الطالب (RPC + RLS + audience) — **مستقل** عن workflow builder.
2. أعمدة `request_audience` و`ineligible_display_mode` **مطلوبة** في تصميم الأدمن (§5).
3. تأجيلها يُبقي ثغرة submit bypass وINSERT المباشر دون فائدة تصميمية.
4. لا حاجة لتعديل الملفات قبل apply — مراحل processing units/workflow **تضيف** جداول جديدة لا تتصادم.

**تسلسل مقترح بعد موافقة المستخدم:**

```text
1. STAGING-APPLY (الثلاث migrations الحالية) — بموافقة صريحة
2. STUDENT-REQUEST-PROCESSING-UNITS-SCHEMA-01
3. STUDENT-REQUEST-ADMIN-WORKFLOW-SCHEMA-01
4. … بقية المراحل (§18)
```

---

## 18. Implementation Roadmap

| # | المرحلة | المحتوى | تبعيات |
|---|---------|---------|--------|
| 1 | **STUDENT-REQUEST-PROCESSING-UNITS-SCHEMA-01** | `request_processing_units`, `request_processing_roles`, assignments | موافقة §19 (جدول مستقل) |
| 2 | **STUDENT-REQUEST-ADMIN-WORKFLOW-SCHEMA-01** | `request_type_workflow_steps` أو توسيع JSON contract + أعمدة runtime | #1 |
| 3 | **STUDENT-REQUEST-TYPES-STAGING-APPLY-REVIEW-02** | تطبيق migrations الطالب الثلاثة + تحقق | موافقة مستخدم؛ يمكن **قبل** #1 |
| 4 | **STUDENT-REQUEST-ACTOR-RPC-RLS-01** | RPCs المعالجين + توسيع RLS | #1, #2 |
| 5 | **STUDENT-REQUEST-ADMIN-CONFIG-UI-01** | توسيع request-types + workflow editor + units UI | #1, #2 |
| 6 | **STUDENT-REQUEST-WORKFLOW-RUNTIME-01** | submit ينشئ خطوات من config؛ act_on_step | #2, #4 |
| 7 | **STUDENT-REQUEST-STAFF-INBOX-01** | `/staff/student-requests` | #4, #6 |
| 8 | **STUDENT-REQUEST-FACULTY-INBOX-01** | `/faculty-portal/student-requests` | #4, #6 |
| 9 | **STUDENT-REQUEST-NOTIFICATIONS-01** | إشعارات per step/unit | #6 |
| 10 | **STUDENT-REQUEST-E2E-SMOKE-01** | اختبار端到端 لمسار كامل | #5–#9 |

**ملاحظة:** يمكن تنفيذ #3 (staging apply) مبكراً بموافقة المستخدم — لا يعتمد على #1/#2.

---

## 19. User Decisions Needed

يجب على المستخدم تحديد ما يلي **قبل التنفيذ**:

| # | القرار | خيارات | توصية التصميم |
|---|--------|--------|----------------|
| 1 | هل نعتمد `processing_units` كجدول مستقل؟ | نعم / لا (JSON فقط) | **نعم** — قابلية توسع وأمان أوضح |
| 2 | هل المسجل العام له رؤية شاملة على كل الطلبات؟ | كامل / محدود | **كامل** — مع audit |
| 3 | هل شؤون الطلاب ترى كل طلبات `active_student` أم فقط الخطوات الموجهة لها؟ | الكل / الخطوات فقط | **الخطوات الموجهة فقط** (أضمن) — مع inbox وليس مراقبة كلية |
| 4 | هل شؤون الخريجين ترى كل طلبات `graduate` أم فقط الخطوات الموجهة لها؟ | الكل / الخطوات فقط | **الخطوات الموجهة فقط** |
| 5 | هل العميد يعتمد فقط أم يرى كل الطلبات؟ | اعتماد فقط / رؤية كلية | **اعتماد فقط** في خطوة dean |
| 6 | هل رئيس القسم يوافق أم يعلّق فقط حسب نوع الطلب؟ | يحدده الأدمن per step | **يحدده الأدمن** عبر `action_type` و`allowed_actions` |
| 7 | هل كل خطوة workflow إلزامية أم يحددها الأدمن؟ | الكل إلزامي / per step | **يحددها الأدمن** (`is_required`, `can_skip`) |
| 8 | هل الإشعارات للجهة كاملة أم لموظف محدد؟ | وحدة / فرد / كلاهما | **كلاهما** — حسب `assignment_strategy` |
| 9 | هل نحتاج Staff Portal مستقلة أم توسيع Admin؟ | staff منفصلة / admin مشترك | **Staff Portal مستقلة** `/staff/student-requests` |
| 10 | هل `form_schema` يدار من الأدمن في نفس المرحلة أم لاحقاً؟ | مع workflow / لاحقاً | **لاحقاً** (P2) — workflow أولاً (P1) |
| 11 | هل الرسوم تدخل في workflow الآن أم مرحلة لاحقة؟ | الآن / لاحقاً | **لاحقاً** — `requires_fee` flag بدون تنفيذ |

---

## 20. Recommended Next Phase

### **STUDENT-REQUEST-PROCESSING-UNITS-SCHEMA-01**

**لماذا هذه المرحلة أولاً:**

1. وحدات المعالجة والمسميات **أساس** لكل ما يلي (workflow، inbox، RLS، إشعارات).
2. بدونها لا يمكن ربط خطوات workflow بجهات حقيقية قابلة للتوسع.
3. لا تتعارض مع migrations الطالب المعلّقة — يمكن تطبيقها بالتوازي.
4. تُمكّن ربط رئيس القسم والعميد بـ `position_assignments` بشكل صريح.

**مخرجات المرحلة التالية (تنفيذ — ليس الآن):**

- migration لـ `request_processing_units`, `request_processing_roles`, `request_processing_assignments`
- RPCs أدمن للقراءة/الكتابة
- RLS للجداول الجديدة
- **بدون seed** لأنواع الطلبات

**بديل:** إن أراد المستخدم تطبيق migrations الطالب أولاً → `STUDENT-REQUEST-TYPES-STAGING-APPLY-REVIEW-02` بموافقة صريحة.

---

## 21. No-Write Assurance

| العنصر | تم؟ |
|--------|-----|
| إنشاء migration | ❌ |
| تعديل migration | ❌ |
| تشغيل migration | ❌ |
| تعديل قاعدة البيانات | ❌ |
| إدخال / تعديل / حذف بيانات | ❌ |
| تعديل UI / server / routes | ❌ |
| staging apply / Supabase apply / Lovable apply | ❌ |
| service role | ❌ |
| seed لأنواع الطلبات | ❌ |
| commit | ❌ |
| push | ❌ |
| PR | ❌ |

**الملف الوحيد المنشأ/المعدّل:**

`docs/STUDENT-REQUEST-ADMIN-CONFIGURABLE-WORKFLOW-DESIGN-01.md`

---

*نهاية التصميم — STUDENT-REQUEST-ADMIN-CONFIGURABLE-WORKFLOW-DESIGN-01*
