# STUDENT-REQUEST-ACTOR-RPC-RLS-01 Report

**التاريخ:** 2026-07-07  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**GitHub:** [msorori-mh/saba-uni-portal](https://github.com/msorori-mh/saba-uni-portal)  
**المصدر:** [STUDENT-REQUEST-ACTOR-RPC-RLS-DESIGN-01.md](./STUDENT-REQUEST-ACTOR-RPC-RLS-DESIGN-01.md) (READY_FOR_RPC_RLS_SCHEMA)  
**القرار:** **PASS_WITH_NOTES**  
**المرحلة التالية:** **STUDENT-REQUEST-WORKFLOW-RUNTIME-01**

---

## 1. Executive Summary

| البند | النتيجة |
|-------|---------|
| **القرار** | **PASS_WITH_NOTES** |
| **ما تم إنشاؤه** | migration واحد: 12 دالة (helpers + RPCs) |
| **جاهزية المرحلة التالية** | **نعم** — RPC/RLS foundation جاهز؛ يحتاج apply + RUNTIME-01 لإنشاء خطوات عند submit |

**الخلاصة:** تم إنشاء helper functions وRPCs لـ inbox/detail/action/admin-read مع SECURITY DEFINER، وبدون إضافة broad RLS policies. الجداول 160000/170000 تبقى مغلقة. `admin_save_request_workflow_config` **مؤجل**. الملاحظات: مرفقات في detail مؤجلة؛ إشعارات غير مُفعّلة؛ ربط `department_head` عبر `position_assignments` يعتمد جزئياً على `is_department_head_of` لأن `organizational_positions.code = 'department_head'` غير مُزروع حالياً.

---

## 2. Scope

| ضمن النطاق | خارج النطاق |
|------------|-------------|
| إنشاء migration (تعريف دوال فقط) | تشغيل / apply migration |
| تقرير المرحلة | DB writes فعلية |
| | seed |
| | UI / server / routes |
| | commit / push / PR |

---

## 3. Git State

| البند | القيمة |
|-------|--------|
| **الفرع** | `main` |
| **آخر commits** | `b044459` → `f98252d` → `5728214` → `5191940` → `98daec1` |
| **ملفات سابقة** | لم تُلمس |
| **commit / push / PR** | ❌ |

---

## 4. Migration Created

| البند | القيمة |
|-------|--------|
| **الملف** | `supabase/migrations/20260710180000_student_request_actor_rpc_rls.sql` |
| **Policies مُضافة** | ❌ لا — الجداول تبقى مغلقة |
| **RLS** | ✅ يبقى مفعّلاً بدون policies جديدة |
| **Data writes عند التنفيذ المحلي** | ❌ |

---

## 5. Helper Functions

| الدالة | الغرض | SECURITY DEFINER | Grant |
|--------|--------|------------------|-------|
| `current_user_app_roles()` | أدوار `user_roles` للمستخدم الحالي | ✅ | authenticated |
| `current_user_processing_assignments()` | تعيينات processing عبر user/staff/faculty/position | ✅ | authenticated |
| `is_current_user_registrar()` | مسجل أو admin أو unit registrar | ✅ | authenticated |
| `is_current_user_admin_actor()` | admin / system_admin | ✅ | authenticated |
| `is_current_user_department_head_for_student(uuid)` | رئيس قسم لقسم الطالب | ✅ | authenticated |
| `is_current_user_dean_for_student(uuid)` | عميد الكلية | ✅ | authenticated |
| `user_matches_workflow_runtime_step(uuid)` | هل المستخدم يطابق خطوة runtime | ✅ | authenticated |
| `can_current_user_access_request(uuid)` | صلاحية عرض الطلب | ✅ | authenticated |
| `is_valid_actor_request_action(text)` | تحقق اسم الإجراء | ❌ IMMUTABLE | authenticated |
| `can_current_user_act_on_step(uuid, text)` | صلاحية تنفيذ إجراء | ✅ | authenticated |

### TODOs / قيود

| TODO | السبب |
|------|-------|
| `department_head` في `organizational_positions` | الكود غير مُزروع في seed الحالي — يُعتمد على `is_department_head_of()` + `user_roles.department_head` |
| `graduate_affairs` | لا `app_role` مخصص — يعتمد على `request_processing_assignments` عند seed لاحق |
| `is_current_user_student_affairs()` / `graduate_affairs()` | دُمجتا في `user_matches_workflow_runtime_step` عبر assignments — دوال منفصلة مؤجلة |

---

## 6. Actor Inbox RPC

### `get_my_request_actor_inbox(p_filters, p_limit, p_offset)`

| الفاعل | ما يراه |
|--------|---------|
| **registrar / admin** | كل الخطوات `pending`/`active` (أو حسب filter) |
| **مدير وحدة** | خطوات وحدته (`is_managerial` عبر assignments) |
| **مختص** | خطوات وحدته المسندة إليه + unassigned pool (`assigned_user_id IS NULL`) |
| **رئيس قسم** | خطوات تطابق `user_matches_workflow_runtime_step` + قسم الطالب |
| **عميد** | خطوات `dean` / `college_position` strategy |
| **طالب** | ❌ — يستخدم RPCs الطالب |

**Filters:** `status`, `processing_unit_code`, `request_type_code`, `department_id`, `search`

**ملاحظة:** بدون runtime steps يُرجع نتيجة فارغة طبيعياً.

---

## 7. Actor Detail RPC

### `get_student_request_detail_for_actor(p_request_id)`

- يستدعي `can_current_user_access_request` — يرفض بـ `42501` إن لم يُسمح.
- يُرجع jsonb: `request`, `student`, `workflow_steps`, `events`.
- الطالب يرى events حيث `visible_to_student = true` فقط.
- **attachments:** `[]` مؤجل — لم يُدمج `student_request_attachments` لتجنب تسريب غير مؤكد.

---

## 8. Actor Action RPC

### `act_on_student_request_step(p_step_id, p_action, p_comment, p_payload)`

| البند | التفاصيل |
|-------|----------|
| **أفعال مدعومة** | approve, reject, return, comment, request_attachment, request_payment, archive, issue_document, complete, skip |
| **التحقق** | `can_current_user_act_on_step` + comment إلزامي لـ reject/return |
| **يمنع** | الطالب كمعالج؛ خطوات مكتملة (إلا comment/skip admin) |
| **يكتب** | UPDATE `student_request_workflow_steps` + INSERT `student_request_workflow_events` |
| **transitions** | يقرأ `request_type_workflow_transitions`؛ يفعّل الخطوة التالية أو ينهي الطلب |
| **بدون transition** | يحدّث `student_requests.status` حسب نوع الإجراء |
| **audit** | `log_audit` عند `skip` من admin |
| **إشعارات** | ❌ مؤجلة — events فقط |

---

## 9. Admin Workflow Config RPC

| RPC | الحالة |
|-----|--------|
| `admin_get_request_workflow_config(p_request_type_id)` | ✅ مُنفَّذ — admin/system_admin/registrar |
| `admin_save_request_workflow_config(...)` | ⏳ **مؤجل** |

**سبب تأجيل save:** يتطلب DML معقد على workflows/steps/transitions + validation + audit + قرارات UI؛ يُنفَّذ في **ADMIN-CONFIG-UI** أو **WORKFLOW-CONFIG-RPC** لاحقاً.

---

## 10. RLS / Policies

| البند | الحالة |
|-------|--------|
| Policies جديدة | ❌ |
| جداول 160000/170000 | RLS مفعّل، **مغلق** (لا permissive policies) |
| Direct write من العميل | مرفوض عبر RLS |
| المعالجة | عبر `act_on_student_request_step` فقط |

---

## 11. Grants

| البند | الحالة |
|-------|--------|
| `REVOKE ALL ... FROM PUBLIC` | ✅ لكل دالة |
| `GRANT EXECUTE TO authenticated` | ✅ |
| anon | ❌ |
| service_role | implicit owner access |

---

## 12. Deferred Items

| العنصر | المرحلة |
|--------|---------|
| `admin_save_request_workflow_config` | ADMIN-CONFIG-UI / WORKFLOW-CONFIG-RPC |
| إشعارات من events | NOTIFICATIONS-01 |
| runtime generator عند submit | **WORKFLOW-RUNTIME-01** |
| مرفقات في detail RPC | مرحلة attachments |
| faculty/staff inbox UI | FACULTY/STAFF-INBOX-01 |
| admin config UI | ADMIN-CONFIG-UI-01 |
| smoke tests | ACTOR-SMOKE-01 |
| staging apply (130000–180000) | STAGING-APPLY-REVIEW-02 |
| helpers منفصلة لـ student_affairs / graduate_affairs | اختياري |

---

## 13. Compatibility

| Migration | علاقة |
|-----------|--------|
| `20260710160000` | **مطلوب** |
| `20260710170000` | **مطلوب** |
| `20260710130000`–`150000` | ❌ لا تعارض — orthogonal |
| Legacy `student_service_request_*` | `can_current_user_access_request` fallback عبر `can_access_student_service_request` |

### ترتيب apply المقترح

```text
130000 → 140000 → 150000 → 160000 → 170000 → 180000
```

---

## 14. Recommended Next Phase

### **STUDENT-REQUEST-WORKFLOW-RUNTIME-01**

**لماذا:**

1. RPCs inbox/action **جاهزة** لكن لا runtime steps تُنشأ عند submit.
2. بدون RUNTIME-01 inbox يبقى فارغاً.
3. يُكمّل: generate `student_request_workflow_steps` من config + ربط `submit_student_request`.

**بديل:** `STUDENT-REQUEST-ACTOR-RPC-RLS-REVIEW-01` — إن أراد المستخدم مراجعة يدوية قبل runtime (غير ضروري افتراضياً).

---

## 15. No-Write Assurance

| العنصر | تم؟ |
|--------|-----|
| تشغيل migration | ❌ |
| DB changes فعلية | ❌ |
| seed / data writes | ❌ |
| service role | ❌ |
| تعديل UI/server/routes | ❌ |
| تعديل migrations سابقة | ❌ |
| commit / push / PR | ❌ |

**الملفات الوحيدة المنشأة:**

1. `supabase/migrations/20260710180000_student_request_actor_rpc_rls.sql`
2. `docs/STUDENT-REQUEST-ACTOR-RPC-RLS-01-REPORT.md`

---

*نهاية التقرير — STUDENT-REQUEST-ACTOR-RPC-RLS-01*
