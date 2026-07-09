# STUDENT-REQUEST-WORKFLOW-RUNTIME-01 Report

**التاريخ:** 2026-07-07  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**GitHub:** [msorori-mh/saba-uni-portal](https://github.com/msorori-mh/saba-uni-portal)  
**المصدر:** migrations 130000–180000 + تقارير ACTOR-RPC-RLS-01 / ADMIN-WORKFLOW-SCHEMA-01  
**القرار:** **PASS_WITH_NOTES**  
**المرحلة التالية الموصى بها:** **STUDENT-REQUEST-WORKFLOW-RUNTIME-REVIEW-01**

---

## 1. Executive Summary

| البند | النتيجة |
|-------|---------|
| **القرار** | **PASS_WITH_NOTES** |
| **ما تم إنشاؤه** | migration واحد: 3 دوال (helper + initializer + submit replace) |
| **جاهزية runtime generator** | **نعم** — التعريف جاهز؛ لن يُنشئ خطوات فعلياً حتى يوجد `request_type_workflows` نشط |

**الخلاصة:** أُضيف `initialize_student_request_workflow` لإنشاء `student_request_workflow_steps` و`student_request_workflow_events` من config نشط عند الإرسال. تم تعديل `submit_student_request(uuid)` بنفس التوقيع لاستدعاء المُهيّئ بعد submit ناجح دون كسر الإرسال عند غياب workflow. لا seed ولا workflow فعلي. الملاحظات: انتقال `status_on_enter` / `in_review` مؤجل؛ حل التعيين (`assigned_user_id`) مؤجل؛ inbox يبقى فارغاً بدون config + assignments.

---

## 2. Scope

| ضمن النطاق | خارج النطاق |
|------------|-------------|
| إنشاء migration (تعريف دوال فقط) | تشغيل / apply migration |
| تقرير المرحلة | DB writes فعلية |
| `CREATE OR REPLACE` لـ `submit_student_request` | seed / workflow config فعلي |
| | UI / server / routes / TypeScript |
| | commit / push / PR |
| | policies جديدة |
| | لمس migrations سابقة أو جداول legacy |

---

## 3. Git State

| البند | القيمة |
|-------|--------|
| **الفرع** | `main` |
| **آخر commits** | `b044459` → `f98252d` → `5728214` → `5191940` → `98daec1` |
| **قبل التنفيذ** | تعديلات UI غير مُلتزَمة + migrations/docs غير متتبعة (130000–180000) |
| **بعد التنفيذ** | إضافة ملفين جديدين فقط ضمن نطاق المرحلة (انظر §13) |
| **commit / push / PR** | ❌ |

---

## 4. Migration Created

| البند | القيمة |
|-------|--------|
| **الملف** | `supabase/migrations/20260710190000_student_request_workflow_runtime.sql` |
| **دوال جديدة** | `get_active_workflow_for_request_type(uuid)` |
| **دوال جديدة** | `initialize_student_request_workflow(uuid)` → `jsonb` |
| **دوال مُستبدلة** | `submit_student_request(uuid)` → `boolean` |
| **Policies مُضافة** | ❌ لا |
| **RLS** | ✅ بدون تغيير — الجداول تبقى مغلقة |
| **Data writes عند التنفيذ المحلي** | ❌ |

---

## 5. initialize_student_request_workflow

### الهدف

إنشاء runtime steps لطلب طالب بعد الإرسال، انساخاً من `request_type_workflow_steps` للـ workflow النشط لنوع الطلب.

### متى تُنشئ steps

1. الطلب موجود في `student_requests`.
2. لا توجد صفوف سابقة في `student_request_workflow_steps` لنفس `student_request_id`.
3. يوجد workflow في `request_type_workflows` حيث:
   - `request_type_id` يطابق نوع الطلب (عبر `request_types.code`),
   - `is_active = true`,
   - `status = 'active'`.
4. الـ workflow يحتوي خطوة واحدة على الأقل في `request_type_workflow_steps`.

### إذا لا يوجد workflow نشط

- لا تُرفع استثناء.
- تُرجع:

```json
{ "initialized": false, "reason": "no_active_workflow" }
```

- لا تُنشأ steps ولا events (باستثناء حالة `request_type_not_found` أو `workflow_has_no_steps` في `detail`).

### إذا steps موجودة مسبقاً

- لا تُنشأ مكررات (idempotent).
- تُرجع:

```json
{ "initialized": false, "reason": "already_initialized", "existing_steps": N }
```

### أول خطوة active

- أقل `step_order` في config → `status = 'active'`, `entered_at = now()`.
- بقية الخطوات → `status = 'pending'`, `entered_at = NULL`.
- تُنسخ: `workflow_id`, `workflow_step_id`, `step_key`, `step_name_ar`, `step_order`, `processing_unit_id`, `processing_role_id`.
- `metadata` يتضمن: `assignment_strategy`, `action_type`, flags (`visible_to_student`, `can_return_to_student`, …), `config`.

### Events المسجلة

| الترتيب | `event_type` | ملاحظات |
|---------|--------------|---------|
| 1 | `submitted` | `workflow_step_runtime_id = NULL`, `visible_to_student = true` |
| 2 | `step_entered` | للخطوة الأولى فقط (`active`) |

- لا إشعارات.
- لا كتابة في `notifications`.

### الأمان

- `SECURITY DEFINER`, `set search_path = public`.
- لا تقبل `user_id` خارجي.
- **Auth gate صريح:** `IF v_uid IS NULL` → `ERRCODE 28000` قبل أي استعلام حساس (G7 security remediation).
- تحقق ملكية/صلاحية: مالك الطلب أو registrar أو admin actor (يُطبَّق دائماً بعد auth gate).
- **لا GRANT** للعميل — داخلية تُستدعى من `submit_student_request`.
- **REVOKE صريح** من `PUBLIC`, `anon`, `authenticated` للدوال الداخلية (انظر §9 و§15).

---

## 15. G7 Security Remediation (PORTAL-PRODUCTION-MIGRATIONS-G7-PRE-APPLY-SECURITY-REMEDIATION-01)

| البند | التفاصيل |
|-------|----------|
| **السبب** | default privileges في المشروع تمنح `anon` صلاحية EXECUTE على دوال جديدة |
| **المخاطرة** | `initialize_student_request_workflow` كانت تتخطى فحص المالك عند `auth.uid() IS NULL` |
| **الإصلاح** | auth gate `28000` + REVOKE صريح من `anon`/`authenticated` للدوال الداخلية |
| **ملاحظة** | `REVOKE FROM PUBLIC` وحده **غير كافٍ** — يجب سحب `anon` و`authenticated` صراحة |
| **submit** | `REVOKE FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated` فقط |
| **التطبيق** | ❌ لم يُطبَّق على DB — تصحيح مصدر فقط |
| **التقرير** | `docs/PORTAL-PRODUCTION-MIGRATIONS-G7-PRE-APPLY-SECURITY-REMEDIATION-01-REPORT.md` |

---

## 6. submit_student_request Integration

| البند | الحالة |
|-------|--------|
| **التوقيع** | ✅ محفوظ: `submit_student_request(p_request_id uuid) RETURNS boolean` |
| **فحص الأهلية** | ✅ `assert_student_can_use_request_type` + `current_student_profile_for_auth` |
| **حالات مسموحة** | ✅ `draft`, `returned`, `returned_for_completion` |
| **flag bypass** | ✅ `set_config('student_request.submit_via_rpc', '1', true)` قبل UPDATE |
| **حماية direct submit** | ✅ يعتمد على trigger/policy من 150000 — لم يُمس |
| **استدعاء runtime** | ✅ بعد UPDATE ناجح إلى `submitted` |

```sql
v_init_result := public.initialize_student_request_workflow(p_request_id);
RETURN true;
```

| سيناريو | سلوك submit |
|---------|-------------|
| `no_active_workflow` | ✅ ناجح — `RETURN true` |
| `already_initialized` | ✅ ناجح |
| خطأ بنيوي (طلب غير موجود، غير مصرح، …) | ❌ استثناء — submit يفشل |

---

## 7. Legacy Compatibility

| البند | الحالة |
|-------|--------|
| **لمس `student_service_request_steps`** | ❌ لا |
| **لمس `student_service_request_events`** | ❌ لا |
| **لمس `request_types.workflow_schema`** | ❌ لا |
| **تعارض مع `actOnStudentServiceRequest`** | ❌ لا — مسار منفصل |
| **تعارض مع `getPendingStudentRequestsForRole`** | ❌ لا — يعتمد legacy steps |

**التعايش:** runtime الجديد (`student_request_workflow_*`) يعمل بالتوازي مع legacy. بدون active workflow config، سلوك الإرسال يبقى كما في 150000 (status = `submitted` فقط). **cutover** وطبقة توافق موحّدة → مرحلة لاحقة.

---

## 8. RLS / Policies

| الجدول | RLS | Policies |
|--------|-----|----------|
| `request_type_workflows` | enabled | مغلق (من 170000) |
| `student_request_workflow_steps` | enabled | مغلق |
| `student_request_workflow_events` | enabled | مغلق |
| `student_requests` | unchanged | policies 150000 |

الكتابة في runtime tables تتم عبر `SECURITY DEFINER` functions فقط.

---

## 9. Grants

| الدالة | PUBLIC | anon | authenticated | ملاحظة |
|--------|--------|------|---------------|--------|
| `get_active_workflow_for_request_type(uuid)` | REVOKE ALL | REVOKE ALL | REVOKE ALL | داخلية — لا GRANT |
| `initialize_student_request_workflow(uuid)` | REVOKE ALL | REVOKE ALL | REVOKE ALL | داخلية — لا GRANT |
| `submit_student_request(uuid)` | REVOKE ALL | REVOKE ALL | GRANT EXECUTE | RPC للطالب المسجّل فقط |

**G7 remediation:** سحب صريح من `anon` و`authenticated` للدوال الداخلية لأن default privileges تمنح `anon` EXECUTE تلقائياً. `REVOKE FROM PUBLIC` وحده لا يكفي في هذا المشروع.

---

## 10. Deferred Items

| البند | المرحلة |
|-------|---------|
| `admin_save_request_workflow_config` | لاحق |
| admin workflow config UI | لاحق |
| notifications (`STUDENT-REQUEST-NOTIFICATIONS-01`) | مؤجل |
| faculty / staff inbox UI | مؤجل |
| attachments / fees | مؤجل |
| حل `assigned_user_id` عند init | مؤجل |
| `status_on_enter` → تحديث `student_requests.status` | مؤجل (تجنب تعارض trigger) |
| cutover / compatibility layer مع legacy | مؤجل |
| staging apply | `STUDENT-REQUEST-STAGING-APPLY-REVIEW-02` أو بعد REVIEW |

---

## 11. Compatibility

### يتطلب migrations (بالترتيب)

1. `20260710130000_student_request_types_schema.sql`
2. `20260710140000_student_request_types_rpc_rls.sql`
3. `20260710150000_student_request_types_rls_submit_bypass_fix.sql` (**لا توقف بين 140000 و150000**)
4. `20260710160000_student_request_processing_units_schema.sql`
5. `20260710170000_student_request_admin_workflow_schema.sql`
6. `20260710180000_student_request_actor_rpc_rls.sql`
7. `20260710190000_student_request_workflow_runtime.sql` (**هذه المرحلة**)

### سلوك فعلي

- **لا يعمل** حتى يُنشأ workflow config نشط (`is_active=true`, `status='active'`) مع خطوات.
- **لا يتعارض** مع النظام القديم عند غياب config.

---

## 12. Recommended Next Phase

**STUDENT-REQUEST-WORKFLOW-RUNTIME-REVIEW-01**

السبب: التعديل على مسار `submit_student_request` حساس (أمان + تعايش legacy + سلوك trigger). يُفضّل مراجعة SQL يدوياً قبل أي staging apply.

بديل لاحقاً بعد REVIEW + apply chain: **STUDENT-REQUEST-STAGING-APPLY-REVIEW-02**.

---

## 13. No-Write Assurance

| البند | الحالة |
|-------|--------|
| تشغيل migration | ❌ |
| تطبيق DB changes | ❌ |
| INSERT / UPDATE / DELETE بيانات | ❌ |
| seed | ❌ |
| service role | ❌ |
| تعديل UI / server / routes | ❌ |
| تعديل migrations سابقة | ❌ |
| commit | ❌ |
| push | ❌ |
| PR | ❌ |

**الملفات الوحيدة المُنشأة في هذه المرحلة:**

- `supabase/migrations/20260710190000_student_request_workflow_runtime.sql`
- `docs/STUDENT-REQUEST-WORKFLOW-RUNTIME-01-REPORT.md`

---

## 14. PASS_WITH_NOTES — الملاحظات

1. **لا workflow config فعلي** — inbox actor يبقى فارغاً بعد apply حتى seed/config لاحق.
2. **`status_on_enter` مؤجل** — الطلب يبقى `submitted` بعد init لتجنب تعارض `protect_student_request` مع انتقال الطالب إلى `in_review`.
3. **لا حل تعيين** — `assigned_user_id` / position resolution عند init مؤجل؛ الخطوات تُنشأ بـ `processing_unit_id` / `processing_role_id` فقط.
4. **`get_active_workflow_for_request_type`** — عند تعدد صفوف نشطة (يجب ألا يحدث)، يُختار أعلى `version`.
5. **اختبار تكامل** — يتطلب staging بعد REVIEW؛ لا اختبار DB في هذه المرحلة.
