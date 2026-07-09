# PORTAL-PRODUCTION-MIGRATIONS-G7-PRE-APPLY-SECURITY-REMEDIATION-01 Report

**التاريخ:** 2026-07-10  
**المستودع:** [msorori-mh/saba-uni-portal](https://github.com/msorori-mh/saba-uni-portal)  
**المسار المحلي:** `C:\projects\saba-uni-portal-git`  
**الفرع المرجعي:** `main`  
**القرار:** **PASS_G7_SOURCE_SECURITY_REMEDIATED_READY_FOR_REVIEW**

---

## 1. Executive Summary

| البند | الحالة |
|-------|--------|
| **نطاق العمل** | تصحيح مصدر migration G7 فقط |
| **تطبيق migration على DB** | ❌ لم يُنفَّذ |
| **كتابة على الإنتاج** | ❌ لم تُنفَّذ |
| **Publish / Deploy** | ❌ لم يُنفَّذ |
| **الملف المُعدَّل** | `supabase/migrations/20260710190000_student_request_workflow_runtime.sql` |

تمت معالجة ثغرة تسمح لـ`anon` باستدعاء `initialize_student_request_workflow` (SECURITY DEFINER) دون JWT صالح، مع سحب صريح لصلاحيات EXECUTE من الدوال الداخلية و`anon` على `submit_student_request`.

---

## 2. Git Reference (قبل التعديل)

| البند | القيمة |
|-------|--------|
| **commit SHA (HEAD @ remediation)** | `bf7c0335cdb15ae23bd4e2f4dfdeed55bfa8c4fe` |
| **blob SHA (قديم)** | `1d4e99f89ac9078cf2558db123cdb01f614f6b45` |
| **blob SHA (جديد)** | `a91af19853042922541729c6f8f78f895b83d62a` |
| **SHA256 (ملف كامل)** | `A61AB7511F435941FFE1521352615D451338F5D54F159C3EC703682D780F8795` |

---

## 3. سبب الحجب الأصلي

1. **default privileges** في المشروع تمنح `anon` صلاحية `EXECUTE` على الدوال الجديدة تلقائياً.
2. `initialize_student_request_workflow(uuid)` هي `SECURITY DEFINER` لكنها كانت تتخطى فحص المالك/registrar/admin عند `auth.uid() IS NULL`.
3. استدعاء بلا JWT يمكن أن ينشئ runtime steps وevents عند توفر workflow نشط.
4. `get_active_workflow_for_request_type(uuid)` يجب ألا تكون قابلة للاستدعاء المباشر من `anon` أو `authenticated`.

---

## 4. التعديلات المُطبَّقة

### 4.1 Auth gate داخل `initialize_student_request_workflow`

بعد التحقق من `p_request_id` وقبل `SELECT` من `student_requests`:

```sql
IF v_uid IS NULL THEN
  RAISE EXCEPTION 'يجب تسجيل الدخول'
    USING ERRCODE = '28000';
END IF;
```

- فحص المالك/registrar/admin يُطبَّق **دائماً** بعد auth gate (أُزيلت الحلقة `IF v_uid IS NOT NULL THEN`).
- لا اعتماد على ACL وحده — الدالة نفسها ترفض الجلسة المجهولة.

### 4.2 REVOKE صريح للدوال الداخلية

```sql
REVOKE ALL ON FUNCTION public.get_active_workflow_for_request_type(uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.initialize_student_request_workflow(uuid)
  FROM PUBLIC, anon, authenticated;
```

- لا `GRANT` لأي من الدالتين الداخليتين.
- الاستدعاء الداخلي من `submit_student_request` / `initialize_student_request_workflow` يبقى ممكناً بصلاحيات مالك الدالة (SECURITY DEFINER).

### 4.3 حماية `submit_student_request` من `anon`

```sql
REVOKE ALL ON FUNCTION public.submit_student_request(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_student_request(uuid)
  TO authenticated;
```

- التوقيع والإرجاع (`boolean`) لم يتغيّرا.

---

## 5. Diff الكامل

```diff
diff --git a/supabase/migrations/20260710190000_student_request_workflow_runtime.sql b/supabase/migrations/20260710190000_student_request_workflow_runtime.sql
index 1d4e99f..a91af19 100644
--- a/supabase/migrations/20260710190000_student_request_workflow_runtime.sql
+++ b/supabase/migrations/20260710190000_student_request_workflow_runtime.sql
@@ -68,6 +68,11 @@ BEGIN
       USING ERRCODE = '22023';
   END IF;
 
+  IF v_uid IS NULL THEN
+    RAISE EXCEPTION 'يجب تسجيل الدخول'
+      USING ERRCODE = '28000';
+  END IF;
+
   SELECT * INTO v_req
   FROM public.student_requests sr
   WHERE sr.id = p_request_id;
@@ -78,13 +83,11 @@ BEGIN
   END IF;
 
   -- Callable from submit_student_request (student owner) or privileged staff path.
-  IF v_uid IS NOT NULL THEN
-    IF NOT public.is_owner_of_request(v_uid, p_request_id)
-       AND NOT public.is_current_user_registrar()
-       AND NOT public.is_current_user_admin_actor() THEN
-      RAISE EXCEPTION 'غير مصرح بتهيئة workflow لهذا الطلب'
-        USING ERRCODE = '42501';
-    END IF;
+  IF NOT public.is_owner_of_request(v_uid, p_request_id)
+     AND NOT public.is_current_user_registrar()
+     AND NOT public.is_current_user_admin_actor() THEN
+    RAISE EXCEPTION 'غير مصرح بتهيئة workflow لهذا الطلب'
+      USING ERRCODE = '42501';
   END IF;
 
   SELECT count(*)::integer INTO v_existing_count
@@ -354,17 +357,19 @@ COMMENT ON FUNCTION public.submit_student_request(uuid) IS
   'Legacy workflow tables are not modified in this RPC.';
 
 -- =============================================================================
--- 4. Grants
+-- 4. Grants — explicit REVOKE from anon/authenticated (default privileges)
 -- =============================================================================
 
-REVOKE ALL ON FUNCTION public.get_active_workflow_for_request_type(uuid) FROM PUBLIC;
--- Internal helper: no GRANT to authenticated.
+REVOKE ALL ON FUNCTION public.get_active_workflow_for_request_type(uuid)
+  FROM PUBLIC, anon, authenticated;
 
-REVOKE ALL ON FUNCTION public.initialize_student_request_workflow(uuid) FROM PUBLIC;
--- Internal: invoked only from submit_student_request (same SECURITY DEFINER owner).
+REVOKE ALL ON FUNCTION public.initialize_student_request_workflow(uuid)
+  FROM PUBLIC, anon, authenticated;
 
-REVOKE ALL ON FUNCTION public.submit_student_request(uuid) FROM PUBLIC;
-GRANT EXECUTE ON FUNCTION public.submit_student_request(uuid) TO authenticated;
+REVOKE ALL ON FUNCTION public.submit_student_request(uuid)
+  FROM PUBLIC, anon;
+GRANT EXECUTE ON FUNCTION public.submit_student_request(uuid)
+  TO authenticated;
 
 -- =============================================================================
 -- 5. RLS — no new policies
```

---

## 6. التحقق الساكن

| # | الفحص | النتيجة |
|---|-------|---------|
| 1 | auth gate صريح داخل `initialize_student_request_workflow` (`28000`) | ✅ |
| 2 | `REVOKE` صريح من `anon` و`authenticated` للدالتين الداخليتين | ✅ |
| 3 | `REVOKE` صريح من `anon` لـ`submit_student_request` | ✅ |
| 4 | عدم وجود `GRANT` للدالتين الداخليتين | ✅ |
| 5 | `get_active_workflow_for_request_type` — داخلية فقط | ✅ |
| 6 | `initialize_student_request_workflow` — داخلية فقط | ✅ |
| 7 | `submit_student_request` — `authenticated` فقط | ✅ |
| 8 | منطق workflow / idempotency / no-active-workflow / first step active / events | ✅ لم يتغيّر |
| 9 | submit ينجح عند غياب workflow | ✅ لم يتغيّر |
| 10 | legacy tables / `workflow_schema` | ✅ لم تُمس |
| 11 | policies / seed / notifications | ✅ لم تُضف |

---

## 7. سيناريوهات SQL المتوقعة (بعد التطبيق المستقبلي)

| السيناريو | النتيجة المتوقعة |
|-----------|------------------|
| `anon` → `initialize_student_request_workflow` | مرفوض ACL؛ وإذا تجاوز ACL في سياق owner → `28000` |
| `authenticated` student owner → `submit_student_request` | مسموح |
| `authenticated` → `initialize_student_request_workflow` مباشرة | مرفوض ACL |
| استدعاء initializer من داخل `submit_student_request` | ناجح — SECURITY DEFINER + `auth.uid()` للمستخدم الأصلي |
| `anon` → `get_active_workflow_for_request_type` | مرفوض ACL |
| `anon` → `submit_student_request` | مرفوض ACL |

---

## 8. No-Write / No-Apply Assurance

| البند | الحالة |
|-------|--------|
| تطبيق G7 على staging/production | ❌ |
| تنفيذ SQL على الإنتاج | ❌ |
| تعديل default privileges (على DB) | ❌ |
| تطبيق G8 | ❌ |
| Publish / Deploy | ❌ |
| seed / workflow config | ❌ |
| تعديل بيانات حالية | ❌ |
| commit / push / PR | ❌ (ما لم يُطلب صراحة) |

**الملفات المُعدَّلة في هذه المرحلة:**

- `supabase/migrations/20260710190000_student_request_workflow_runtime.sql`
- `docs/STUDENT-REQUEST-WORKFLOW-RUNTIME-01-REPORT.md` (تحديث §9 و§15)
- `docs/PORTAL-PRODUCTION-MIGRATIONS-G7-PRE-APPLY-SECURITY-REMEDIATION-01-REPORT.md` (هذا التقرير)

---

## 9. قرار المرحلة

**PASS_G7_SOURCE_SECURITY_REMEDIATED_READY_FOR_REVIEW**

لا يُطبَّق G7 على أي بيئة DB حتى مراجعة الملف المصحح وإصدار أمر تطبيق مستقل.
