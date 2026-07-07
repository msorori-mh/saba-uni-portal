# STUDENT-REQUEST-ADMIN-WORKFLOW-SCHEMA-01 Report

**التاريخ:** 2026-07-06  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**GitHub:** [msorori-mh/saba-uni-portal](https://github.com/msorori-mh/saba-uni-portal)  
**المصدر:** [STUDENT-REQUEST-ADMIN-CONFIGURABLE-WORKFLOW-DESIGN-01.md](./STUDENT-REQUEST-ADMIN-CONFIGURABLE-WORKFLOW-DESIGN-01.md)  
**التبعية:** [STUDENT-REQUEST-PROCESSING-UNITS-SCHEMA-01-REPORT.md](./STUDENT-REQUEST-PROCESSING-UNITS-SCHEMA-01-REPORT.md) (`20260710160000`)  
**القرار:** **PASS_WITH_NOTES**  
**المرحلة التالية:** **STUDENT-REQUEST-ACTOR-RPC-RLS-DESIGN-01**

---

## 1. Executive Summary

| البند | النتيجة |
|-------|---------|
| **القرار** | **PASS_WITH_NOTES** |
| **ما تم إنشاؤه** | migration واحد يُنشئ 5 جداول: config (3) + runtime (2) |
| **جاهزية المرحلة التالية** | **نعم** — schema جاهز لتصميم RPC/RLS ثم runtime generator |

**الخلاصة:** تم إنشاء migration idempotent يؤسس نموذج workflow قابل للإعداد من الأدمن (تعريفات + خطوات + انتقالات) وجداول runtime للخطوات والأحداث عند تقديم الطلب. لا seed، لا تعديل على `workflow_schema` JSON القديم، ولا حذف لـ `student_service_request_steps/events`. الملاحظات: تعايش مع الجداول القديمة يتطلب مرحلة runtime/compatibility؛ RLS بدون policies؛ تبعية صريحة على migration `160000`.

---

## 2. Scope

| ضمن النطاق | خارج النطاق |
|------------|-------------|
| إنشاء ملف migration | تشغيل / apply migration |
| تقرير المرحلة | DB changes فعلية |
| | seed / data writes |
| | workflow فعلي أو خطوات runtime |
| | تعديل UI / server / routes |
| | commit / push / PR |

---

## 3. Git State

| البند | القيمة |
|-------|--------|
| **الفرع** | `main` |
| **آخر commits** | `b044459` → `f98252d` → `5728214` → `5191940` → `98daec1` |
| **ملفات سابقة غير متتبعة** | لم تُلمس (migrations 130000–160000، تقارير، UI) |
| **commit / push / PR** | ❌ |

---

## 4. Migration Created

| البند | القيمة |
|-------|--------|
| **الملف** | `supabase/migrations/20260710170000_student_request_admin_workflow_schema.sql` |
| **الجداول** | `request_type_workflows`, `request_type_workflow_steps`, `request_type_workflow_transitions`, `student_request_workflow_steps`, `student_request_workflow_events` |
| **RLS** | ✅ مفعّل على الجداول الخمسة |
| **Policies** | ❌ لا توجد |
| **Triggers** | ✅ `update_updated_at_column` على 3 جداول (التي تحتوي `updated_at`) |
| **Indexes** | ✅ 28 index |
| **Data writes** | ❌ |

---

## 5. request_type_workflows

### الغرض

تعريف **workflow مُدار من الأدمن** لكل نوع طلب، مع إصدارات وحالات.

### الأعمدة الرئيسية

| العمود | الوصف |
|--------|--------|
| `request_type_id` | FK → `request_types(id)` CASCADE |
| `code` | معرّف workflow ضمن النوع |
| `name_ar` / `name_en` / `description_ar` | وصف |
| `version` | رقم إصدار (افتراضي 1) |
| `status` | `draft` / `active` / `retired` |
| `is_active` | workflow نشط للإرسالات الجديدة |
| `created_by` | FK → `auth.users` |

### Constraints

- `UNIQUE (request_type_id, code, version)`
- `CHECK (status IN ('draft','active','retired'))`

### علاقة بـ `request_types`

- كل workflow مرتبط بـ `request_types.id` (وليس `code` فقط).
- **`request_types.workflow_schema` JSON لم يُحذف ولم يُعدَّل** — يبقى للتوافق العكسي حتى مرحلة migration/data منفصلة.

---

## 6. request_type_workflow_steps

### الغرض

خطوات مرتبة لكل workflow، مربوطة بجهات ومسميات المعالجة.

### الربط بـ processing units/roles

| العمود | الغرض |
|--------|--------|
| `processing_unit_id` | FK → `request_processing_units` (nullable لخطوات نظامية) |
| `processing_role_id` | FK → `request_processing_roles` (nullable لاستراتيجيات منصب) |
| `assignment_strategy` | كيف يُحل المُعالِج عند runtime |

### دعم رئيس القسم والعميد

| assignment_strategy | السلوك |
|---------------------|--------|
| `requester_department_head` | رئيس قسم **قسم الطالب** — لا مستخدم ثابت |
| `dean` | عميد الكلية — عبر `position_assignments` |
| `department_position` | منصب قسم محدد |
| `college_position` | منصب كلية (عميد) |

`processing_role_id` قد يكون **null** عندما تكفي الاستراتيجية وحدها.

### أهم القيود

- `UNIQUE (workflow_id, step_key)`
- `UNIQUE (workflow_id, step_order)`
- `assignment_strategy`: 7 قيم (`role_pool` … `manual`)
- `action_type`: 10 قيم (`review` … `complete`)
- flags: `can_return_to_student`, `can_reject`, `can_skip`, `notify_*`, `visible_to_student`, `requires_*`, `produces_document`

---

## 7. request_type_workflow_transitions

### الغرض

انتقالات موجهة بين الخطوات حسب **نتيجة الإجراء**.

### بداية/نهاية workflow

| العمود | NULL يعني |
|--------|-----------|
| `from_step_id` | بداية workflow (مثلاً عند `submit`) |
| `to_step_id` | نهاية (complete / reject / cancel) |

### action_result

`submit`, `approve`, `reject`, `return`, `request_attachment`, `request_payment`, `skip`, `complete`, `cancel`

### حقول إضافية

- `condition_schema` jsonb — شروط مستقبلية
- `is_default` — مسار افتراضي عند تعدد الانتقالات
- `label_ar` — تسمية للواجهة

---

## 8. Runtime Workflow Tables

### `student_request_workflow_steps`

| البند | التفاصيل |
|-------|----------|
| **الغرض** | مثيلات خطوات لكل طالب عند submit |
| **FKs** | `student_requests`, `request_type_workflows`, `request_type_workflow_steps`, processing units/roles |
| **تعيين** | `assigned_user_id`, `assigned_staff_profile_id`, `assigned_faculty_profile_id`, `assigned_position_assignment_id` |
| **الحالة** | `pending`, `active`, `completed`, `returned`, `rejected`, `skipped`, `cancelled` |
| **القرار** | `approved`, `rejected`, `returned`, `skipped`, `completed` |

### `student_request_workflow_events`

| البند | التفاصيل |
|-------|----------|
| **الغرض** | audit + أساس للإشعارات |
| **event_type** | 14 نوعاً (`created` … `cancelled`) |
| **الفاعل** | `actor_user_id`, `actor_unit_id`, `actor_role_id` |
| **الطالب** | `visible_to_student` |

### علاقة بالجداول القديمة

| قديم | جديد | تعارض؟ |
|------|------|--------|
| `student_service_request_steps` | `student_request_workflow_steps` | **لا schema conflict** — جداول منفصلة |
| `student_service_request_events` | `student_request_workflow_events` | **لا schema conflict** |

**ملاحظة:** مرحلة **WORKFLOW-RUNTIME-01** ستحدد:
- استخدام الجديد فقط، أو
- compatibility layer يقرأ/يكتب كليهما، أو
- ترحيل تدريجي من JSON seed القديم.

**لم يُحذف ولم يُعدَّل** أي جدول قديم في هذا migration.

---

## 9. RLS / Security

| البند | الحالة |
|-------|--------|
| RLS مفعّل | ✅ 5 جداول |
| Policies | ❌ — deny all لـ authenticated |
| anon | ❌ لا GRANT |
| service_role | ✅ GRANT ALL |
| RPC/RLS تفصيلي | مؤجل → **STUDENT-REQUEST-ACTOR-RPC-RLS-01** |

---

## 10. No Seed Assurance

| العنصر | تم؟ |
|--------|-----|
| workflows فعلية | ❌ |
| steps فعلية | ❌ |
| transitions فعلية | ❌ |
| runtime steps/events | ❌ |
| أي INSERT/UPDATE/DELETE | ❌ |

---

## 11. Compatibility

### تبعية migration

| Migration | علاقة |
|-----------|--------|
| `20260710160000` | **مطلوب** — FKs إلى `request_processing_units` و `request_processing_roles` |

### migrations الطالب (130000–150000)

| Migration | تعارض؟ |
|-----------|--------|
| `20260710130000` SCHEMA | ❌ لا |
| `20260710140000` RPC/RLS | ❌ لا |
| `20260710150000` BYPASS-FIX | ❌ لا |

### الجداول القديمة

- **لا تعارض schema** — أسماء مختلفة، لا DROP، لا ALTER على القديم.

### ترتيب التطبيق المقترح على staging (بموافقة لاحقة)

```text
1. 20260710130000  (student types schema)
2. 20260710140000  (student RPC/RLS)
3. 20260710150000  (submit bypass fix)     ← لا توقف بين 2 و 3
4. 20260710160000  (processing units)
5. 20260710170000  (admin workflow schema) ← هذا الملف
```

---

## 12. Deferred Items

| العنصر | المرحلة |
|--------|---------|
| Admin UI workflow builder | ADMIN-CONFIG-UI-01 |
| RPC admin (create/update workflow, steps, transitions) | ACTOR-RPC-RLS-01 |
| Runtime generator عند submit | WORKFLOW-RUNTIME-01 |
| Compatibility / cutover من `workflow_schema` JSON | migration/data منفصلة |
| Faculty inbox | FACULTY-INBOX-01 |
| Staff inbox | STAFF-INBOX-01 |
| Notifications من events | NOTIFICATIONS-01 |
| seed/config للوحدات والـ workflows | بموافقة صريحة |
| staging apply | STAGING-APPLY-REVIEW-02 |
| فرض «workflow نشط واحد لكل نوع» | RPC لاحق |
| ربط `notifications` / `audit_logs` | مراحل لاحقة |

---

## 13. Recommended Next Phase

### **STUDENT-REQUEST-ACTOR-RPC-RLS-DESIGN-01**

**لماذا وليس SCHEMA-REVIEW فقط:**

1. Schema config + runtime **مكتمل** — الخطوة المنطقية هي **تصميم** RPCs وRLS policies قبل التنفيذ.
2. يغطي: admin config RPCs، actor inbox RPCs، سياسات RLS للجداول المغلقة، وقواعد الوصول لرئيس القسم/العميد/الموظفين.
3. يمهّد لـ WORKFLOW-RUNTIME-01 (إنشاء `student_request_workflow_steps` عند submit).

**بديل:** `STUDENT-REQUEST-WORKFLOW-SCHEMA-REVIEW-01` — مراجعة يدوية إن أراد المستخدم قبل تصميم RPC.

---

## 14. No-Write Assurance

| العنصر | تم؟ |
|--------|-----|
| تشغيل migration | ❌ |
| DB changes | ❌ |
| seed / data writes | ❌ |
| service role | ❌ |
| تعديل UI/server/routes | ❌ |
| تعديل migrations سابقة | ❌ |
| commit / push / PR | ❌ |

**الملفات الوحيدة المنشأة:**

1. `supabase/migrations/20260710170000_student_request_admin_workflow_schema.sql`
2. `docs/STUDENT-REQUEST-ADMIN-WORKFLOW-SCHEMA-01-REPORT.md`

---

*نهاية التقرير — STUDENT-REQUEST-ADMIN-WORKFLOW-SCHEMA-01*
