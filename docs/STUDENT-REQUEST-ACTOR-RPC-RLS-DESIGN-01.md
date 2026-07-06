# STUDENT-REQUEST-ACTOR-RPC-RLS-DESIGN-01

**التاريخ:** 2026-07-07  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**GitHub:** [msorori-mh/saba-uni-portal](https://github.com/msorori-mh/saba-uni-portal)  
**المصادر:**
- [STUDENT-REQUEST-ADMIN-CONFIGURABLE-WORKFLOW-DESIGN-01.md](./STUDENT-REQUEST-ADMIN-CONFIGURABLE-WORKFLOW-DESIGN-01.md)
- [STUDENT-REQUEST-PROCESSING-UNITS-SCHEMA-01-REPORT.md](./STUDENT-REQUEST-PROCESSING-UNITS-SCHEMA-01-REPORT.md)
- [STUDENT-REQUEST-ADMIN-WORKFLOW-SCHEMA-01-REPORT.md](./STUDENT-REQUEST-ADMIN-WORKFLOW-SCHEMA-01-REPORT.md)  
**القرار التصميمي:** **READY_FOR_RPC_RLS_SCHEMA**  
**المرحلة التالية:** **STUDENT-REQUEST-ACTOR-RPC-RLS-01**

---

## 1. Executive Summary

| البند | القرار |
|-------|--------|
| **القرار التصميمي** | **READY_FOR_RPC_RLS_SCHEMA** |
| **الحاجة** | الجداول الجديدة (160000–170000) لديها RLS مفعّل **بدون policies** — أي وصول مباشر مرفوض؛ المعالجة تتطلب RPCs + helpers آمنة |
| **الانتقال للتنفيذ** | **ممكن** بعد موافقة على القرارات في §16 (سياسات تشغيلية، ليست مانعة للـ schema) |

### الخلاصة

النظام الحالي يعتمد على:
- `has_any_role()` + `user_roles` + `user_role_assignments` + `roles_catalog`
- helpers قديمة: `can_access_student_service_request`, `can_act_on_student_service_request` — مرتبطة بـ `student_service_request_steps` و`role_key` نصي
- RPCs طالب (migration 140000 معلّق): `get_available_request_types_for_current_student`, `create_student_request`, `submit_student_request`, `get_my_student_requests`

التصميم المقترح يبني **طبقة actor جديدة** فوق:
- `request_processing_units/roles/assignments` (160000)
- `request_type_workflows/steps/transitions` + `student_request_workflow_steps/events` (170000)

**المبدأ المركزي:** القراءة والمعالجة الحساسة عبر **SECURITY DEFINER RPCs**؛ RLS تبقى **مغلقة** على جداول config وruntime الجديدة؛ لا broad SELECT policies.

قرارات المستخدم في §16 تؤثر على **سلوك inbox** (مدير vs مختص، إشعارات الوحدة) لكنها **لا تمنع** كتابة migration RPC/RLS.

---

## 2. Scope

| ضمن النطاق | خارج النطاق |
|------------|-------------|
| تصميم RPCs وRLS وhelpers مستقبلية | migrations جديدة أو تعديل الحالية |
| مصفوفة وصول الأطراف | DB apply / Supabase apply |
| قواعد أفعال workflow | UI / server / routes |
| متطلبات البوابات والإشعارات | seed / data writes |
| مخاطر أمنية وخارطة تنفيذ | commit / push / PR |

**الكتابة الوحيدة:** هذا الملف.

---

## 3. Actor Model

### 3.1 الطالب (`student`)

| القدرة | القاعدة |
|--------|---------|
| القائمة | طلباته فقط عبر `get_my_student_requests` |
| التفاصيل | طلبه فقط + events حيث `visible_to_student = true` |
| الإنشاء/الإرسال | RPCs الطالب فقط — لا INSERT مباشر |
| المعالجة | **لا** — لا `act_on_student_request_step` |
| التجاوز | ممنوع — لا UPDATE لـ `status` أو خطوات |

### 3.2 المسجل العام (`registrar`)

| القدرة | القاعدة |
|--------|---------|
| القائمة | **كل** الطلبات (توصية: نعم — §16) |
| التفاصيل | كل الطلبات + كل الخطوات + events |
| المعالجة | خطوات موجهة لـ unit `registrar` + إجراءات إدارية (forward/escalate) |
| التكوين | قراءة config؛ تعديل workflow بصلاحية admin/registrar |

### 3.3 شؤون الطلاب

| الدور | النطاق المقترح |
|-------|----------------|
| **الوحدة** (`student_affairs`) | خطوات حيث `processing_unit.code = 'student_affairs'` |
| **المدير** (`student_affairs_manager`) | كل خطوات الوحدة النشطة (توصية) |
| **المختص** (`student_affairs_specialist`) | خطوات الوحدة المسندة له أو pool الوحدة (قرار §16) |
| **الجمهور** | طلبات `active_student` audience عند الخطوة فقط — لا مراقبة كلية لكل طلبات المستمرين |

### 3.4 شؤون الخريجين

نفس منطق شؤون الطلاب مع `graduate_affairs` وaudience `graduate`.

### 3.5 الإرشيف (`archive`)

- خطوات `processing_unit = archive` أو `action_type = archive` فقط.
- لا وصول لخطوات أكاديمية أو مالية غير مطلوبة (يُعرض ملخص الطلب فقط).

### 3.6 المالية (`finance`)

- خطوات `processing_unit = finance` فقط.
- بيانات الطلب: ما يلزم للتحقق من الرسوم — لا سجلات أكاديمية تفصيلية (مرحلة FEES لاحقة).

### 3.7 المكتبة (`library`)

- خطوات `processing_unit = library` فقط (إخلاء طرف مكتبة).

### 3.8 المعامل (`labs`)

- `lab_manager`: خطوات وحدة labs.
- `lab_keeper`: خطوات مسندة إليه أو معمل محدد في `metadata`.

### 3.9 رئيس القسم العلمي (`department_chair`)

| القاعدة | التفاصيل |
|---------|----------|
| الهوية | `faculty_profiles` + `position_assignments` لمنصب `department_head` — **ليس** staff منفصل |
| النطاق | طلبات طلاب **قسمه** فقط (`student_profiles.department_id`) |
| الخطوات | `assignment_strategy IN ('requester_department_head','department_position')` أو unit `department_chair` |
| البوابة | `/faculty-portal/student-requests` — منفصل عن المجالس |

### 3.10 عميد الكلية (`dean`)

| القاعدة | التفاصيل |
|---------|----------|
| الهوية | `position_assignments` لـ `organizational_positions.code = 'dean'` |
| النطاق | خطوات `assignment_strategy = 'dean'` أو `college_position` أو unit `dean` |
| الرؤية | اعتمادات العميد — **ليس** كل طلبات الكلية (توصية §16) |

### 3.11 الأدمن العام (`system_admin` / `admin`)

| القدرة | القاعدة |
|--------|---------|
| التكوين | CRUD units/roles/assignments/workflows عبر admin RPCs |
| المعالجة | اختياري — ليس افتراضياً لكل طلب |
| Override | `skip`, reassign, cancel — بصلاحية `system_admin` فقط مع audit إلزامي |

---

## 4. Access Rules Matrix

| actor | portal | can_list_requests | can_view_detail | can_act_on_step | can_configure_request_types | can_configure_workflow | can_assign_processing_roles | scope | notes |
|-------|--------|-------------------|-----------------|-----------------|------------------------------|------------------------|----------------------------|-------|-------|
| **student** | student | own only | own only | ❌ | ❌ | ❌ | ❌ | own requests | via student RPCs |
| **registrar** | admin | ✅ all | ✅ all | ✅ registrar steps + escalate | ✅ read/write | ✅ read/write | ✅ | college-wide | registrar_general role |
| **student_affairs_manager** | staff/admin | unit steps | unit steps | ✅ | ❌ | ❌ | ❌ (unit only) | student_affairs steps | all unit queue (recommended) |
| **student_affairs_specialist** | staff | unit/assigned | assigned | ✅ | ❌ | ❌ | ❌ | student_affairs | pool vs assigned — §16 |
| **graduate_affairs_manager** | staff | unit steps | unit steps | ✅ | ❌ | ❌ | ❌ | graduate_affairs | |
| **graduate_affairs_specialist** | staff | unit/assigned | assigned | ✅ | ❌ | ❌ | ❌ | graduate_affairs | |
| **archive_officer** | staff | archive steps | archive steps | ✅ archive | ❌ | ❌ | ❌ | archive only | |
| **finance_officer** | staff | finance steps | finance steps | ✅ payment verify | ❌ | ❌ | ❌ | finance only | fees later |
| **library_officer** | staff | library steps | library steps | ✅ | ❌ | ❌ | ❌ | library only | |
| **lab_manager** | staff | labs steps | labs steps | ✅ | ❌ | ❌ | ❌ | labs unit | |
| **lab_keeper** | staff | assigned labs | assigned | ✅ limited | ❌ | ❌ | ❌ | assigned lab | |
| **department_chair** | faculty | dept steps | dept requests | ✅ per step config | ❌ | ❌ | ❌ | student dept = chair dept | position-based |
| **dean** | faculty | dean steps | dean scope | ✅ approve/reject | ❌ | ❌ | ❌ | dean steps only | not all requests |
| **super_admin** | admin | ✅ all | ✅ all | ✅ override | ✅ full | ✅ full | ✅ full | global | audit mandatory |

---

## 5. RLS Strategy

### 5.1 المبدأ العام

```text
┌─────────────────────────────────────────────────────────┐
│  Client (portals)                                       │
│       ↓ RPC only (SECURITY DEFINER)                   │
│  Helper functions (actor resolution, scope checks)      │
│       ↓ controlled writes                               │
│  Tables with RLS ENABLED, minimal/no direct policies    │
└─────────────────────────────────────────────────────────┘
```

| النمط | متى |
|-------|-----|
| **RPC-only write** | config tables, step actions, events |
| **RPC-only read (حساس)** | inbox, detail for actors |
| **RLS SELECT ضيق** | `student_requests` (own), `notifications` (own) — موجود |
| **لا broad policies** | جداول 160000/170000 |

### 5.2 جدول لكل جدول

#### Config — `request_processing_units`, `request_processing_roles`, `request_processing_assignments`

| العملية | من | الآلية |
|---------|-----|--------|
| SELECT | ❌ direct | `admin_list_processing_units()` RPC |
| INSERT/UPDATE/DELETE | ❌ direct | `admin_upsert_processing_*()` RPC |
| RLS | deny all | policies لا تُضاف أو policy واحدة `false` |

**الفاعلون:** `system_admin`, `admin`, `registrar` (قراءة فقط للـ units إن لزم).

#### Config — `request_type_workflows`, `request_type_workflow_steps`, `request_type_workflow_transitions`

| العملية | من | الآلية |
|---------|-----|--------|
| SELECT | ❌ direct | `admin_get_request_workflow_config()` |
| WRITE | ❌ direct | `admin_save_request_workflow_config()` |
| RLS | deny all | RPC فقط |

**الفاعلون:** `system_admin`, `admin`, `registrar`.

#### Runtime — `student_requests` (موجود)

| العملية | السياسة الحالية | التوسيع المقترح |
|---------|-----------------|-----------------|
| SELECT طالب | own via `is_owner_of_request` | يبقى |
| SELECT actors | عبر RPC | **لا** توسيع broad SELECT |
| UPDATE status | RPC فقط (150000 bypass-fix) | يبقى + يمنع direct على خطوات جديدة |
| INSERT | RPC `create_student_request` | يبقى |

#### Runtime — `student_request_workflow_steps`

| العملية | الآلية |
|---------|--------|
| SELECT | ❌ direct — `get_student_request_detail_for_actor()` يُرجع الخطوات المصرح بها |
| INSERT | RPC فقط — `generate_workflow_steps_on_submit()` (RUNTIME-01) |
| UPDATE | RPC فقط — `act_on_student_request_step()` |

**RLS:** enabled، **لا policies** (أو policy تمنع كل شيء لـ authenticated).

#### Runtime — `student_request_workflow_events`

| العملية | الآلية |
|---------|--------|
| SELECT | RPC — detail للفاعل؛ طالب يرى `visible_to_student` فقط |
| INSERT | RPC فقط — داخل `act_on_*` وsubmit |

#### Legacy coexistence

| جدول قديم | سياسة |
|-----------|--------|
| `student_service_request_steps` | يبقى حتى cutover — helpers القديمة تبقى للطلبات القديمة |
| `student_service_request_events` | يبقى |

**Cutover:** RPC جديد يتحقق: إن وُجدت `student_request_workflow_steps` استخدمها؛ وإلا fallback للقديم.

---

## 6. Helper Functions Design

### 6.1 `current_user_app_roles()`

| البند | القيمة |
|-------|--------|
| **الغرض** | قائمة أدوار `app_role` للمستخدم الحالي |
| **المدخلات** | لا (يستخدم `auth.uid()`) |
| **المخرجات** | `text[]` |
| **SECURITY DEFINER** | نعم |
| **المصدر** | `user_roles` + `user_role_assignments` → `roles_catalog.app_role_mapping` |
| **ملاحظة** | يُكمّل `has_any_role` — لا يستبدله |

### 6.2 `current_user_processing_assignments()`

| البند | القيمة |
|-------|--------|
| **الغرض** | صفوف نشطة من `request_processing_assignments` للمستخدم |
| **المخرجات** | TABLE: `unit_id`, `unit_code`, `role_id`, `role_code`, `assignment_type`, `department_id` |
| **SECURITY DEFINER** | نعم |
| **المصدر** | join: assignments ↔ units ↔ roles؛ يحل `user_id`, `staff_profile_id`, `faculty_profile_id`, `position_assignment_id` |
| **شروط** | `is_active = true` AND (`ends_at` IS NULL OR `ends_at > now()`) |

### 6.3 `is_current_user_registrar()`

- `RETURNS boolean`
- `has_any_role(auth.uid(), ARRAY['registrar','admin','system_admin'])` OR processing role `registrar_general`

### 6.4 `is_current_user_student_affairs()`

- `app_role = student_affairs` OR assignment على unit `student_affairs`

### 6.5 `is_current_user_graduate_affairs()`

- assignment على unit `graduate_affairs` (لا `app_role` مخصص حالياً)

### 6.6 `is_current_user_department_head_for_student(p_student_profile_id uuid)`

| البند | القيمة |
|-------|--------|
| **الغرض** | هل المستخدم الحالي رئيس قسم الطالب؟ |
| **المنطق** | 1) `faculty_profiles.department_id` = `student_profiles.department_id` للطالب **و** 2) `position_assignments` نشط لمنصب `department_head` (عبر `organizational_positions.code`) **و** 3) `position_assignments.user_id = auth.uid()` |
| **SECURITY DEFINER** | نعم |
| **لا يعتمد على** | اسم، email، `user_roles.department_head` وحده |

**بديل/تكميل:** `is_department_head_of(auth.uid(), dept_id)` موجود — يُوسَّع ليشمل `position_assignments`.

### 6.7 `is_current_user_dean_for_student(p_student_profile_id uuid)`

| البند | القيمة |
|-------|--------|
| **المنطق** | `position_assignments` نشط حيث `organizational_positions.code = 'dean'` AND `user_id = auth.uid()` |
| **النطاق** | college-wide — لا يحتاج قسم الطالب |
| **SECURITY DEFINER** | نعم |

### 6.8 `can_current_user_access_request(p_request_id uuid)`

| البند | القيمة |
|-------|--------|
| **الغرض** | هل يمكن للمستخدم **رؤية** تفاصيل الطلب؟ |
| **المخرجات** | `boolean` |
| **SECURITY DEFINER** | نعم |
| **المنطق (OR):** | |
| 1 | مالك الطلب (`is_owner_of_request`) |
| 2 | `is_current_user_registrar()` |
| 3 | `system_admin` / `admin` |
| 4 | EXISTS خطوة نشطة/معلقة يمكن للمستخدم الوصول إليها عبر `can_current_user_access_step(step_id)` |
| 5 | legacy: `can_access_student_service_request` إن لم يُقطع بعد |

### 6.9 `can_current_user_act_on_step(p_step_id uuid, p_action text)`

| البند | القيمة |
|-------|--------|
| **الغرض** | هل يمكن تنفيذ `p_action` على الخطوة؟ |
| **الشروط (AND):** | |
| 1 | `student_request_workflow_steps.status = 'active'` |
| 2 | `p_action` مسموح في `request_type_workflow_steps` (من config) |
| 3 | المستخدم يطابق assignment_strategy للخطوة |
| 4 | `can_skip` فقط لـ `system_admin` ما لم يُفعَّل في config |

**حل assignment_strategy:**

| strategy | التحقق |
|----------|--------|
| `role_pool` | `current_user_processing_assignments()` يطابق unit+role |
| `specific_user` | `assigned_user_id = auth.uid()` |
| `requester_department_head` | `is_current_user_department_head_for_student(...)` |
| `dean` / `college_position` | `is_current_user_dean_for_student(...)` |
| `department_position` | chair لقسم محدد في config/metadata |
| `manual` | `assigned_user_id` OR admin override |

---

## 7. RPCs for Actor Inbox

### 7.1 `get_my_request_actor_inbox(p_filters jsonb DEFAULT '{}', p_limit int DEFAULT 50, p_offset int DEFAULT 0)`

**الغرض:** inbox موحّد لكل الفاعلين غير الطالب.

**`p_filters` (اختياري):**

```json
{
  "status": ["active", "pending"],
  "processing_unit_code": "student_affairs",
  "request_type_code": "absence_excuse",
  "department_id": "uuid",
  "submitted_from": "2026-01-01",
  "submitted_to": "2026-12-31",
  "search": "اسم أو رقم طلب"
}
```

**منطق الحل:**

1. تحديد «نمط الفاعل» من assignments + app_roles + positions.
2. بناء query على `student_request_workflow_steps` WHERE `status IN ('active','pending')` AND يطابق نطاق الفاعل.
3. registrar/admin: بدون فلتر unit (الكل).
4. faculty chair: JOIN `student_profiles.department_id` = chair dept.
5. dean: خطوات `dean` strategy فقط.

**المخرجات (TABLE):**

| عمود | الوصف |
|------|--------|
| `request_id` | uuid |
| `request_number` | text |
| `student_name_ar` | text |
| `student_department_name_ar` | text |
| `request_type_code` / `name_ar` | text |
| `step_id` | uuid — runtime step |
| `step_key` / `step_name_ar` | text |
| `processing_unit_code` / `name_ar` | text |
| `request_status` | text |
| `step_status` | text |
| `submitted_at` | timestamptz |
| `priority` | int (من metadata — اختياري) |
| `is_actionable` | boolean — `status = active` AND `can_current_user_act_on_step` |

**SECURITY DEFINER:** نعم. **REVOKE** من PUBLIC. **GRANT** لـ `authenticated`.

### 7.2 `get_student_request_detail_for_actor(p_request_id uuid)`

**يُرجع (jsonb أو TABLE متعددة):**

- بيانات الطلب الأساسية (حسب صلاحية الفاعل)
- `form_data` (كامل للمعالجين؛ ملخص للطالب)
- المرفقات (metadata — روابط عبر RPC منفصل إن لزم)
- خطوات workflow مع حالة كل خطوة (يخفي تفاصيل جهات غير مصرح بها)
- events حيث `visible_to_student` OR فاعل داخلي
- الخطوة النشطة + الإجراءات المسموحة

**التحقق:** `can_current_user_access_request(p_request_id)` — وإلا `42501`.

### 7.3 `act_on_student_request_step(p_step_id uuid, p_action text, p_comment text DEFAULT NULL, p_payload jsonb DEFAULT '{}')`

**التحقق (بالترتيب):**

1. `auth.uid()` NOT NULL
2. الخطوة موجودة و`status = 'active'`
3. `can_current_user_act_on_step(p_step_id, p_action)`
4. `p_action` في `allowed_actions` من config الخطوة
5. إن `requires_comment` للفعل — `p_comment` NOT NULL

**الآثار (transaction واحدة):**

1. UPDATE `student_request_workflow_steps`: `decision`, `comment`, `completed_by`, `completed_at`, `status`
2. INSERT `student_request_workflow_events`
3. قراءة `request_type_workflow_transitions` — تحديد الخطوة التالية
4. تفعيل الخطوة التالية (أو إنهاء الطلب)
5. UPDATE `student_requests.status` عبر helper داخلي (ليس من العميل)
6. استدعاء `create_notification()` (مرحلة NOTIFICATIONS — stub الآن)
7. `log_audit()` للإجراءات الحساسة (reject, skip, override)

**أفعال `p_action`:**

`approve`, `reject`, `return`, `comment`, `request_attachment`, `request_payment`, `archive`, `issue_document`, `complete`, `skip`

**لا يسمح:** تخطي transitions؛ تحديث خطوة غير نشطة؛ تجاوز غير مصرح.

### 7.4 Admin config RPCs

| RPC | الغرض | الفاعلون |
|-----|--------|----------|
| `admin_get_request_workflow_config(p_request_type_id uuid)` | workflow + steps + transitions | admin, registrar, system_admin |
| `admin_save_request_workflow_config(p_request_type_id uuid, p_workflow jsonb, p_steps jsonb, p_transitions jsonb)` | حفظ draft | admin, system_admin |
| `admin_publish_request_workflow(p_workflow_id uuid)` | `status = active`, retire السابق | system_admin |
| `admin_assign_processing_actor(p_assignment jsonb)` | CRUD assignment | admin, system_admin |
| `admin_list_processing_units()` | قائمة units+roles | admin, registrar |
| `registrar_reassign_request_step(p_step_id uuid, p_user_id uuid, p_reason text)` | إعادة تعيين | registrar, system_admin |

---

## 8. Department Chair / Dean Access Design

### 8.1 رئيس القسم

```text
student_profiles.department_id
        ↓
organizational_positions (department_head per dept — مستقبلياً per-dept assignment)
        ↓
position_assignments (user_id, position_id, is_active)
        ↓
faculty_profiles (user_id, department_id)  — للتحقق الإضافي
```

**قواعد صريحة:**

- ❌ لا اعتماد على `full_name` أو `email`
- ❌ لا إنشاء `staff_profiles` لرئيس القسم للمعالجة
- ✅ inbox في **faculty portal**
- ✅ الخطوة تُحل عند submit: `assigned_position_assignment_id` أو يُقيَّم عند كل `get_inbox`

**RPC inbox filter:**

```sql
WHERE step.assignment_strategy IN ('requester_department_head','department_position')
  AND student.department_id IN (SELECT dept_ids FROM current_user_chair_departments())
```

`current_user_chair_departments()` — من `position_assignments` + ربط قسم (من `faculty_profiles.department_id` أو `request_processing_assignments.department_id`).

### 8.2 العميد

```text
organizational_positions.code = 'dean'
        ↓
position_assignments (is_active, user_id = auth.uid())
```

- inbox: خطوات `assignment_strategy = 'dean'` OR `processing_unit.code = 'dean'`
- لا خلط مع `academic_councils` — مسار RPC منفصل

---

## 9. Registrar / Staff Access Design

### 9.1 ربط المسجل العام

| المصدر | الاستخدام |
|--------|-----------|
| `user_roles.role = registrar` | RLS/RPC gate |
| `request_processing_assignments` | unit `registrar`, role `registrar_general` |
| `staff_profiles` | اختياري — للعرض في البوابة |

### 9.2 ربط شؤون الطلاب / الخريجين

| المصدر | الاستخدام |
|--------|-----------|
| `staff_profiles` | هوية الموظف |
| `request_processing_assignments` | `assignment_type = staff_profile`, unit, role |
| `app_role = student_affairs` | fallback للـ RLS القديم |

**مدير vs مختص (§16):**

| السياسة | المدير | المختص |
|---------|--------|--------|
| **A: pool الوحدة** (موصى به للمدير) | كل خطوات unit | — |
| **B: assigned only** (موصى به للمختص) | — | `assigned_user_id = self` OR unassigned pool |
| **C: كل الوحدة للجميع** | ✅ | ✅ — أبسط لكن أضعف فرقاً |

**التوصية:** A للمدير (`is_managerial = true`)، B للمختص.

### 9.3 المالية / الأرشيف / المكتبة / المعامل

- ربط عبر `request_processing_assignments` + `staff_profiles`
- inbox مفلتر بـ `processing_unit_id` فقط
- لا وصول لخطوات وحدات أخرى حتى مع `app_role` عام

---

## 10. Workflow Action Rules

| action | من ينفذ | comment مطلوب؟ | يظهر للطالب؟ | ينقل workflow؟ | event_type | إشعار |
|--------|---------|----------------|--------------|----------------|------------|-------|
| **approve** | معالج الخطوة | اختياري | ✅ ملخص | → transition `approve` | `approved` | طالب + الجهة التالية |
| **reject** | معالج (إن `can_reject`) | **نعم** | ✅ | → terminal `reject` | `rejected` | طالب |
| **return** | معالج (إن `can_return_to_student`) | **نعم** | ✅ | → returned / خطوة سابقة | `returned` | طالب |
| **comment** | أي معالج على الخطوة | **نعم** | حسب config | لا ينقل | `commented` | اختياري |
| **request_attachment** | معالج | نعم | ✅ | قد يبقى active | `attachment_requested` | طالب |
| **request_payment** | finance | نعم | ✅ | يبقى active | `payment_requested` | طالب (لاحقاً) |
| **archive** | archive | اختياري | ❌ | → archive step | `archived` | داخلي |
| **issue_document** | registrar | اختياري | ✅ | → complete/doc | `document_issued` | طالب |
| **complete** | معالج terminal | اختياري | ✅ | terminal | `completed` | طالب |
| **skip** | system_admin OR (`can_skip` في config) | **نعم** | ❌ | → transition `skip` | `approved`+payload | داخلي |

**قواعد إضافية:**

- لا `act` على خطوة `pending` — يجب `active` فقط
- `comment` لا يُكمل الخطوة افتراضياً
- `reject` نهائي — يتطلب `can_reject = true` في config (الرفض النهائي محصور — §16)

---

## 11. Events / Audit Design

### 11.1 `student_request_workflow_events` (عرض تشغيلي)

| حقل | مصدر |
|-----|------|
| `event_type` | من جدول §10 |
| `actor_user_id` | `auth.uid()` |
| `actor_unit_id` / `actor_role_id` | من `current_user_processing_assignments()` |
| `workflow_step_runtime_id` | الخطوة |
| `message_ar` | قالب + تعليق المستخدم |
| `payload` | `{ action, old_status, new_status, transition_id, ... }` |
| `visible_to_student` | حسب الفعل — reject/return/complete = true؛ skip/assign داخلي = false |

### 11.2 `audit_logs` (أمان داخلي)

| متى | ماذا |
|-----|------|
| `skip`, `registrar_reassign`, admin config change | `log_audit()` |
| reject على طلب حساس | audit |
| override status | audit إلزامي |

**الفرق:**

| | events | audit_logs |
|---|--------|------------|
| **الجمهور** | طالب + معالجون في timeline | إدارة/أمن فقط |
| **الغرض** | تتبع الطلب | امتثال وأمان |
| **الحذف** | لا | لا |

---

## 12. Notification Requirements

| الحدث | المستلمون | آلية |
|-------|-----------|------|
| دخول خطوة جديدة | pool الوحدة أو `assigned_user_id` | `create_notification` + لاحقاً unit broadcast |
| تعيين لمستخدم | `assigned_user_id` | مباشر |
| طلب مرفق/دفع | الطالب | مباشر |
| إرجاع | الطالب | مباشر |
| اعتماد/رفض | الطالب + الجهة التالية | متسلسل |
| اكتمال | الطالب | مباشر |

**توسيع مقترح (NOTIFICATIONS-01):**

- `notification_recipients` للوحدات
- unread per inbox في staff/faculty portal
- لا إشعار anon

**القرار §16:** إشعار الوحدة كاملة vs المكلف فقط — يؤثر على helper `resolve_notification_recipients(step_id)`.

---

## 13. Portal Integration Requirements

### Admin (`/admin/`)

| الميزة | RPC |
|--------|-----|
| إدارة units/roles/assignments | `admin_*` |
| workflow builder | `admin_get/save/publish_request_workflow_config` |
| متابعة كل الطلبات | `get_my_request_actor_inbox` (registrar scope) |
| إعادة توجيه | `registrar_reassign_request_step` |
| audit | `audit_logs` + events |

### Staff (`/staff/student-requests`)

| الميزة | RPC |
|--------|-----|
| inbox | `get_my_request_actor_inbox` |
| تفاصيل | `get_student_request_detail_for_actor` |
| إجراء | `act_on_student_request_step` |

### Faculty (`/faculty-portal/student-requests`)

| الميزة | RPC |
|--------|-----|
| بطاقة + عداد | `get_my_request_actor_inbox` (count) |
| inbox chair/dean | نفس RPC — فلتر تلقائي |
| إشعارات | `notifications` + `reference_type = student_request_step` |

### Student (`/student/requests/`)

| الميزة | RPC |
|--------|-----|
| progress | `get_my_student_requests` + detail مع steps `visible_to_student` |
| ملاحظات | events `visible_to_student` |
| مرفق/دفع | `act` طالب لاحق أو upload RPC |
| returned | إعادة submit عبر `submit_student_request` |

---

## 14. Security Risks

| الخطر | التخفيف |
|-------|---------|
| broad RLS SELECT على workflow tables | لا policies — RPC only |
| الاعتماد على UI للفلترة | كل inbox عبر SECURITY DEFINER مع scope داخلي |
| رئيس قسم بالاسم | `position_assignments` إلزامي |
| موظف يرى طلبات خارج وحدته | فلتر `processing_unit_id` في inbox RPC |
| معالجة خطوة غير `active` | تحقق في `act_on_*` |
| bypass عبر UPDATE مباشر | RLS deny + triggers على `student_requests.status` (موجود 150000) |
| عدم تسجيل event | `act_on_*` يرفض إن فشل INSERT event |
| تسريب `form_data` للمالية | projection في detail RPC حسب unit |
| legacy + new dual write | cutover واضح في RUNTIME-01 |

---

## 15. Implementation Phases

| # | المرحلة | المحتوى | تبعيات |
|---|---------|---------|--------|
| 1 | **STUDENT-REQUEST-ACTOR-RPC-RLS-01** | helpers + RPCs inbox/detail/act + admin config RPCs + RLS يبقى مغلقاً | 160000, 170000 applied |
| 2 | **STUDENT-REQUEST-WORKFLOW-RUNTIME-01** | generate steps on submit + transitions engine + cutover flag | #1 |
| 3 | **STUDENT-REQUEST-NOTIFICATIONS-01** | ربط events → notifications + unit recipients | #2 |
| 4 | **STUDENT-REQUEST-ADMIN-CONFIG-UI-01** | workflow builder + units UI | #1 |
| 5 | **STUDENT-REQUEST-STAFF-INBOX-01** | `/staff/student-requests` | #1, #2 |
| 6 | **STUDENT-REQUEST-FACULTY-INBOX-01** | `/faculty-portal/student-requests` | #1, #2 |
| 7 | **STUDENT-REQUEST-ACTOR-SMOKE-01** | E2E لكل فاعل | #1–#6 |

**ملاحظة:** staging apply للـ migrations 130000–170000 يمكن أن يسبق #1 بموافقة منفصلة.

---

## 16. User Decisions Needed

| # | القرار | خيارات | توصية التصميم | مانع؟ |
|---|--------|--------|----------------|-------|
| 1 | المسجل يرى كل الطلبات؟ | نعم / لا | **نعم** | لا |
| 2 | مدير الوحدة يرى كل طلبات وحدته؟ | نعم / لا | **نعم** | لا |
| 3 | المختص يرى كل الوحدة أم المسند فقط؟ | الكل / المسند | **المسند + unassigned pool** | لا |
| 4 | رئيس القسم approve أم comment فقط؟ | per step config | **يحدده الأدمن** في `action_type` | لا |
| 5 | العميد approve نهائي أم اطلاع؟ | per type | **approve في خطوة dean** | لا |
| 6 | أي جهة تُرجع للطالب؟ | الكل / المحدد | **من له `can_return_to_student`** | لا |
| 7 | الرفض النهائي لمن؟ | محدد / الجميع | **من له `can_reject`** | لا |
| 8 | skip مسموح ولمن؟ | admin فقط / config | **system_admin + `can_skip`** | لا |
| 9 | إشعارات الوحدة كاملة أم المكلف؟ | وحدة / فرد / كلاهما | **كلاهما** | لا |
| 10 | Staff Portal منفصلة؟ | staff / admin | **staff منفصلة** | لا |
| 11 | الطالب يرى اسم الجهة؟ | اسم / حالة فقط | **حالة + اسم عام** («شؤون الطلاب») | لا |

**الحكم:** القرارات **تشغيلية** — يمكن تنفيذ RPC-RLS-01 بافتراضات التوصية وتعديلها لاحقاً دون كسر schema.

---

## 17. Recommended Next Phase

### **STUDENT-REQUEST-ACTOR-RPC-RLS-01**

**لماذا وليس POLICY-DECISIONS-01:**

1. القرارات في §16 **ليست مانعة** — التوصيات واضحة وقابلة للتطبيق.
2. Schema 160000/170000 + RLS مغلق **ينتظر** helpers وRPCs.
3. التنفيذ يمكن أن يُضيف feature flags أو تعليقات TODO للقرارات المفتوحة.

**مخرجات RPC-RLS-01 (تنفيذ لاحق):**

- migration واحد: helpers (§6) + RPCs (§7) + REVOKE direct table access
- لا تغيير UI
- لا seed
- يتطلب apply لـ 160000 و170000 (ويفضل 130000–150000 للطالب)

---

## 18. No-Write Assurance

| العنصر | تم؟ |
|--------|-----|
| إنشاء migration | ❌ |
| تعديل migration | ❌ |
| تشغيل migration | ❌ |
| تعديل قاعدة البيانات | ❌ |
| إدخال / تعديل / حذف بيانات | ❌ |
| تعديل RLS/RPC فعلي | ❌ |
| تعديل UI/server/routes | ❌ |
| service role | ❌ |
| commit / push / PR | ❌ |

**الملف الوحيد المنشأ/المعدّل:**

`docs/STUDENT-REQUEST-ACTOR-RPC-RLS-DESIGN-01.md`

---

*نهاية التصميم — STUDENT-REQUEST-ACTOR-RPC-RLS-DESIGN-01*
