# STUDENT-REQUEST-PROCESSING-UNITS-SCHEMA-01 Report

**التاريخ:** 2026-07-06  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**GitHub:** [msorori-mh/saba-uni-portal](https://github.com/msorori-mh/saba-uni-portal)  
**المصدر:** [STUDENT-REQUEST-ADMIN-CONFIGURABLE-WORKFLOW-DESIGN-01.md](./STUDENT-REQUEST-ADMIN-CONFIGURABLE-WORKFLOW-DESIGN-01.md) (READY_FOR_SCHEMA_DESIGN)  
**القرار:** **PASS_WITH_NOTES**  
**المرحلة التالية:** **STUDENT-REQUEST-ADMIN-WORKFLOW-SCHEMA-01**

---

## 1. Executive Summary

| البند | النتيجة |
|-------|---------|
| **القرار** | **PASS_WITH_NOTES** |
| **ما تم إنشاؤه** | migration واحد يُنشئ 3 جداول: `request_processing_units`, `request_processing_roles`, `request_processing_assignments` |
| **جاهزية المرحلة التالية** | **نعم** — schema الأساس جاهز لـ ADMIN-WORKFLOW-SCHEMA-01 |

**الخلاصة:** تم إنشاء migration idempotent يؤسس طبقة الجهات والمسميات والتعيينات لمعالجة طلبات الطلاب، مع RLS مفعّل وبدون سياسات (مغلق افتراضياً)، وبدون أي seed أو data writes. الملاحظات: تأجيل CHECK «هدف التعيين إلزامي» لأن `department_position` و`college_position` قد لا يحملان مستخدماً محدداً عند الإنشاء؛ و`app_role`/`default_app_role` مراجع نصية وليست FK لأن `app_role` enum.

---

## 2. Scope

| ضمن النطاق | خارج النطاق |
|------------|-------------|
| إنشاء ملف migration | تشغيل migration |
| تقرير المرحلة | Supabase / Lovable apply |
| | DB changes فعلية |
| | seed / INSERT / UPDATE / DELETE |
| | تعديل UI / server / routes |
| | commit / push / PR |

---

## 3. Git State

| البند | القيمة |
|-------|--------|
| **الفرع** | `main` |
| **آخر commits** | `b044459` → `f98252d` → `5728214` → `5191940` → `98daec1` |
| **قبل المرحلة** | ملفات غير متتبعة سابقة (migrations 130000–150000، تقارير، UI consolidation) — **لم تُلمس** |
| **بعد المرحلة** | ملفان جديدان فقط (انظر §13) |
| **commit / push / PR** | ❌ |

---

## 4. Migration Created

| البند | القيمة |
|-------|--------|
| **اسم الملف** | `supabase/migrations/20260710160000_student_request_processing_units_schema.sql` |
| **Timestamp** | `20260710160000` — أعلى من `20260710150000` (آخر migration طلبات الطلاب) |
| **الجداول** | `request_processing_units`, `request_processing_roles`, `request_processing_assignments` |
| **RLS** | ✅ مفعّل على الجداول الثلاثة |
| **Policies** | ❌ لا توجد — مغلق افتراضياً |
| **Triggers** | ✅ `update_updated_at_column` على الجداول الثلاثة |
| **Indexes** | ✅ 12 index |
| **Data writes** | ❌ لا INSERT / UPDATE / DELETE |

---

## 5. request_processing_units

### الغرض

تمثيل **الجهات/الوحدات** التي تُوجَّه إليها خطوات workflow طلبات الطلاب (مثل شؤون الطلاب، المالية، رئيس القسم، العميد).

### الأعمدة

| العمود | النوع | ملاحظة |
|--------|-------|--------|
| `id` | uuid PK | `gen_random_uuid()` |
| `code` | text NOT NULL | فريد — معرّف ثابت |
| `name_ar` | text NOT NULL | |
| `name_en` | text | |
| `description_ar` | text | |
| `portal_scope` | text DEFAULT `'staff'` | admin / staff / faculty / mixed |
| `default_app_role` | text | مرجع نصي لـ `app_role` |
| `is_academic_unit` | boolean DEFAULT false | true لـ department_chair/dean |
| `is_active` | boolean DEFAULT true | |
| `sort_order` | integer DEFAULT 0 | |
| `created_at` / `updated_at` | timestamptz | trigger على update |

### Constraints

- `UNIQUE (code)`
- `CHECK (portal_scope IN ('admin','staff','faculty','mixed'))`

### تمثيل الجهات لاحقاً

| code مستقبلي (مثال) | portal_scope | is_academic_unit |
|---------------------|--------------|------------------|
| `registrar` | admin | false |
| `student_affairs` | staff | false |
| `graduate_affairs` | staff | false |
| `archive`, `finance`, `library`, `labs` | staff | false |
| `department_chair` | faculty | **true** |
| `dean` | faculty | **true** |

**لا بيانات الآن** — تُنشأ لاحقاً من الأدمن أو seed بموافقة صريحة.

---

## 6. request_processing_roles

### الغرض

تمثيل **المسميات التشغيلية** داخل كل وحدة معالجة.

### الأعمدة

| العمود | النوع | ملاحظة |
|--------|-------|--------|
| `id` | uuid PK | |
| `unit_id` | uuid FK → units | ON DELETE RESTRICT |
| `code` | text NOT NULL | فريد ضمن الوحدة |
| `name_ar` / `name_en` / `description_ar` | text | |
| `app_role` | text | مرجع نصي لـ enum `app_role` |
| `position_code` | text | FK → `organizational_positions(code)` |
| `is_managerial` | boolean DEFAULT false | مدير vs مختص |
| `is_active` | boolean DEFAULT true | |
| `sort_order` | integer | |
| `created_at` / `updated_at` | timestamptz | |

### Constraints

- `UNIQUE (unit_id, code)`
- `FK position_code → organizational_positions(code) ON DELETE SET NULL`

### تمثيل المسميات لاحقاً

| code مستقبلي | unit | app_role (مثال) | position_code (مثال) |
|--------------|------|-----------------|----------------------|
| `registrar_general` | registrar | `registrar` | `registrar_department` |
| `student_affairs_manager` | student_affairs | — | — |
| `student_affairs_specialist` | student_affairs | `student_affairs` | — |
| `graduate_affairs_manager` | graduate_affairs | — | — |
| `archive_officer` | archive | — | — |
| `finance_officer` | finance | `finance_officer` | — |
| `library_officer` | library | — | — |
| `lab_manager` / `lab_keeper` | labs | — | — |
| `department_chair` | department_chair | `department_head` | `department_head` (من organizational) |
| `dean` | dean | `dean` | `dean` |

**لماذا لا FK لـ `app_role`:** `app_role` نوع ENUM في PostgreSQL؛ الربط النصي أكثر أماناً ولا يكسر عند إضافة قيم enum لاحقاً.

---

## 7. request_processing_assignments

### الغرض

ربط وحدة/مسمى بمُعالِج فعلي: موظف، عضو هيئة، مستخدم، أو منصب تنظيمي.

### الأعمدة

| العمود | النوع | FK |
|--------|-------|-----|
| `id` | uuid PK | |
| `unit_id` | uuid NOT NULL | → `request_processing_units` RESTRICT |
| `role_id` | uuid | → `request_processing_roles` RESTRICT |
| `assignment_type` | text NOT NULL | CHECK (6 قيم) |
| `user_id` | uuid | → `auth.users` SET NULL |
| `staff_profile_id` | uuid | → `staff_profiles` SET NULL |
| `faculty_profile_id` | uuid | → `faculty_profiles` SET NULL |
| `position_assignment_id` | uuid | → `position_assignments` SET NULL |
| `department_id` | uuid | → `departments` SET NULL |
| `is_active` | boolean | |
| `starts_at` / `ends_at` | timestamptz | فترة صلاحية |
| `created_at` / `updated_at` | timestamptz | |

### assignment_type

| القيمة | الاستخدام المستقبلي |
|--------|---------------------|
| `user` | مستخدم محدد |
| `staff_profile` | موظف شؤون طلاب/خريجين/مالية/مكتبة/معامل |
| `faculty_profile` | عضو هيئة (نادر — يُفضَّل position_assignment) |
| `position_assignment` | ربط مباشر بمنصب تنظيمي |
| `department_position` | رئيس قسم — يُحل من قسم الطالب + `position_assignments` |
| `college_position` | عميد — يُحل من `position_assignments` لمنصب dean |

### FKs المُضافة vs المؤجلة

| FK | الحالة | السبب |
|----|--------|-------|
| `unit_id` → units | ✅ | |
| `role_id` → roles | ✅ | |
| `user_id` → auth.users | ✅ | |
| `staff_profile_id` → staff_profiles | ✅ | |
| `faculty_profile_id` → faculty_profiles | ✅ | |
| `position_assignment_id` → position_assignments | ✅ | |
| `department_id` → departments | ✅ | |
| CHECK «هدف واحد على الأقل» | ⏳ مؤجل | `department_position` / `college_position` قد تُعرَّف كقواعد توجيه بلا مستخدم محدد مسبقاً |

### سيناريوهات لاحقة

- **موظف شؤون طلاب:** `assignment_type = staff_profile`, `staff_profile_id` = …
- **رئيس قسم:** `assignment_type = department_position`, `role_id` = department_chair, `department_id` = قسم (أو null للحل الديناميكي)
- **عميد:** `assignment_type = college_position`, `position_assignment_id` أو حل runtime من `organizational_positions.code = 'dean'`

---

## 8. RLS / Security

| البند | الحالة |
|-------|--------|
| RLS مفعّل | ✅ على الجداول الثلاثة |
| Policies | ❌ لا توجد — **deny all** لـ authenticated حتى مرحلة RPC |
| anon | ❌ لا GRANT |
| service_role | ✅ GRANT ALL (للاستخدام الإداري المستقبلي عبر RPC SECURITY DEFINER) |
| الوصول التفصيلي | مؤجل → **STUDENT-REQUEST-ACTOR-RPC-RLS-01** |

---

## 9. No Seed Assurance

| العنصر | تم؟ |
|--------|-----|
| إنشاء وحدات (registrar, student_affairs, …) | ❌ |
| إنشاء مسميات (manager, specialist, dean, …) | ❌ |
| تعيين مستخدمين/مناصب | ❌ |
| أي INSERT / UPDATE / DELETE | ❌ |

---

## 10. Compatibility with Current Student Request Migrations

### migrations الطالب المعلّقة

| Migration | تعارض؟ |
|-----------|--------|
| `20260710130000` SCHEMA | ❌ لا |
| `20260710140000` RPC/RLS | ❌ لا |
| `20260710150000` BYPASS-FIX | ❌ لا |

### التحليل

- migration الجديد **orthogonal** — جداول master data جديدة لا تلمس `request_types` ولا `student_requests` ولا workflow runtime.
- **لا تعارض schema** مع أي migration موجود.

### ترتيب التطبيق المقترح على staging (لاحقاً — بموافقة)

```text
1. 20260710130000  (student request types schema)
2. 20260710140000  (student RPC/RLS)
3. 20260710150000  (submit bypass fix)     ← لا توقف بين 2 و 3
4. 20260710160000  (processing units schema) ← هذا الملف
5. [لاحقاً] ADMIN-WORKFLOW-SCHEMA
```

يمكن تطبيق #4 **بعد** الثلاثة أو **بالتوازي** — لا تبعية hard بينها.

---

## 11. Deferred Items

| العنصر | المرحلة المستقبلية |
|--------|-------------------|
| Admin UI — إدارة الوحدات | ADMIN-CONFIG-UI-01 |
| Admin UI — إدارة المسميات | ADMIN-CONFIG-UI-01 |
| Admin UI — التعيينات | ADMIN-CONFIG-UI-01 |
| Workflow schema (`request_type_workflow_steps`) | **ADMIN-WORKFLOW-SCHEMA-01** |
| Actor RPC/RLS + policies للجداول الجديدة | ACTOR-RPC-RLS-01 |
| Faculty inbox | FACULTY-INBOX-01 |
| Staff inbox | STAFF-INBOX-01 |
| Notifications per unit/step | NOTIFICATIONS-01 |
| Seed/config للوحدات والمسميات | بموافقة صريحة لاحقاً |
| تطبيق migrations على staging | STAGING-APPLY-REVIEW-02 |
| CHECK «هدف تعيين إلزامي» | ACTOR-RPC-RLS-01 أو مرحلة assignments hardening |
| FK لـ `app_role` enum | غير مطلوب — مرجع نصي كافٍ |

---

## 12. Recommended Next Phase

### **STUDENT-REQUEST-ADMIN-WORKFLOW-SCHEMA-01**

**لماذا:**

1. وحدات المعالجة والمسميات والتعيينات **جاهزة schema-wise**.
2. الخطوة التالية الطبيعية: جدول/عقد **خطوات workflow لكل نوع طلب** يربط بـ `processing_unit` + `processing_role`.
3. يُكمّل مسار DESIGN-01 §9 و§10.

**بديل:** `STUDENT-REQUEST-PROCESSING-UNITS-SCHEMA-REVIEW-01` — فقط إن أراد المستخدم مراجعة يدوية قبل workflow schema (غير ضروري افتراضياً).

---

## 13. No-Write Assurance

| العنصر | تم؟ |
|--------|-----|
| تشغيل migration | ❌ |
| تطبيق تغيير على قاعدة البيانات | ❌ |
| إدخال / تعديل / حذف بيانات | ❌ |
| seed | ❌ |
| service role | ❌ |
| تعديل UI / server / routes | ❌ |
| تعديل migrations سابقة | ❌ |
| commit | ❌ |
| push | ❌ |
| PR | ❌ |

**الملفات الوحيدة المنشأة:**

1. `supabase/migrations/20260710160000_student_request_processing_units_schema.sql`
2. `docs/STUDENT-REQUEST-PROCESSING-UNITS-SCHEMA-01-REPORT.md`

---

*نهاية التقرير — STUDENT-REQUEST-PROCESSING-UNITS-SCHEMA-01*
