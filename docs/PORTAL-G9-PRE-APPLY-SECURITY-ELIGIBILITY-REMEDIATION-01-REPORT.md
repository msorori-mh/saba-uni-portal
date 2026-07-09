# PORTAL-G9-PRE-APPLY-SECURITY-ELIGIBILITY-REMEDIATION-01 Report

**التاريخ:** 2026-07-10  
**المستودع:** [msorori-mh/saba-uni-portal](https://github.com/msorori-mh/saba-uni-portal)  
**المسار المحلي:** `C:\projects\saba-uni-portal-git`  
**الفرع المرجعي:** `main`  
**القرار:** **PASS_G9_SOURCE_REMEDIATED_PUSHED_READY_FOR_REVIEW**

---

## 1. Executive Summary

| البند | الحالة |
|-------|--------|
| **نطاق العمل** | تصحيح مصدر migration G9 (P1 foundations) فقط |
| **تطبيق G9 على DB** | ❌ لم يُنفَّذ |
| **كتابة على الإنتاج** | ❌ لم تُنفَّذ |
| **Publish / Deploy** | ❌ لم يُنفَّذ |
| **G7 / G8 re-apply** | ❌ لم يُنفَّذ |
| **seed / default privileges DB** | ❌ لم يُنفَّذ |

تمت معالجة ثغرتين في مصدر `20260711020000_student_requests_p1_foundations.sql`:

1. **ACL:** الدالة الداخلية `assert_can_read_student_eligibility_context` كانت مُمنَحة لـ `authenticated` — يمكن استدعاؤها مباشرة متجاوزةً بوابة الدوال القابلة للقراءة. كما أن `REVOKE FROM PUBLIC` وحده لا يكفي بسبب default privileges في Supabase.
2. **NULL logic:** `student_study_status IS NULL` كان يمرّ شرط الأهلية لـ `enrollment_suspension` — أصبح `IS DISTINCT FROM 'new'` لرفض القيم الناقصة.

---

## 2. Git Reference

| البند | القيمة |
|-------|--------|
| **commit SHA (HEAD @ remediation start)** | `0c81c7790b4dad1aae4d93d20223553af3c22c73` |
| **blob SHA (قبل)** | `6af9b56a0dea25a2ecf4c3fdc48cc4bbfe3308f7` |
| **blob SHA (بعد)** | `b8c5cdd0435eb4c5fd3716f797037372c70f0b1d` |
| **SHA256 (بعد)** | `9569EAFB42AE733ACE0C8AB5D911604D146759D2D89BEF792DC17A08A4D62B27` |

**الملفات المُعدَّلة (3 فقط):**

1. `supabase/migrations/20260711020000_student_requests_p1_foundations.sql`
2. `docs/STUDENT-REQUESTS-P1-FOUNDATIONS-01-REPORT.md`
3. `docs/PORTAL-G9-PRE-APPLY-SECURITY-ELIGIBILITY-REMEDIATION-01-REPORT.md`

---

## 3. سبب الحجب الأصلي

1. **default privileges** في Supabase قد تمنح `anon` و`authenticated` صلاحية `EXECUTE` على الدوال الجديدة تلقائياً — `REVOKE FROM PUBLIC` وحده لا يسحب هذه المنح الصريحة.
2. `assert_can_read_student_eligibility_context(uuid)` كانت `GRANT EXECUTE TO authenticated` — استدعاء مباشر من العميل يتجاوز نية "دالة داخلية فقط".
3. شرط `v_study_status IS NOT NULL AND v_study_status <> 'new'` يعامل `NULL` كمؤهل — يتعارض مع متطلبات U-SUSP-1 قبل اكتمال بيانات الاستيراد.

---

## 4. التعديلات المُطبَّقة

### 4.1 ACL — الدالة الداخلية

```sql
REVOKE ALL ON FUNCTION public.assert_can_read_student_eligibility_context(uuid)
  FROM PUBLIC, anon, authenticated;
```

- **لا GRANT** لـ `authenticated`.
- الاستدعاء الداخلي من `get_*` / `check_*` يبقى ممكناً بصلاحيات مالك الدالة (SECURITY DEFINER).

### 4.2 ACL — الدوال القابلة للقراءة من العميل

```sql
REVOKE ALL ON FUNCTION public.get_student_request_eligibility_context(uuid)
  FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.check_student_request_basic_eligibility(text, uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_student_request_eligibility_context(uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.check_student_request_basic_eligibility(text, uuid)
  TO authenticated;
```

### 4.3 NULL study status fix

**قبل:**

```sql
IF v_study_status IS NOT NULL AND v_study_status <> 'new' THEN
  ...
  'وقف القيد متاح للطلاب المستجدين فقط (student_study_status = new).'
```

**بعد:**

```sql
IF v_study_status IS DISTINCT FROM 'new' THEN
  ...
  'وقف القيد متاح للطلاب المستجدين فقط، ويجب استكمال student_study_status بقيمة new.'
```

- `NULL` → غير مؤهل لـ `enrollment_suspension`.
- `'repeat'` → غير مؤهل.
- `'new'` → يمرّ هذا الشرط (باقي قواعد U-SUSP-1 دون تغيير).

### 4.4 ما لم يُمس

- الأعمدة الأربعة وأنواعها وdefaults
- الجداول الخمسة الجديدة
- Constraints, indexes, comments
- منطق `consecutive_suspension_years_count >= 2` و `previous_suspension_semesters_count >= 4`
- فحص الطالب المحوّل (`transferred_current_year`)
- قائمة الأدوار: `system_admin`, `admin`, `student_affairs`, `registrar`
- RLS مفعّل بدون policies
- لا seed، لا ربط بـ `create_student_request` / `submit_student_request`

---

## 5. ACL Matrix

### قبل

| Function | PUBLIC | anon | authenticated |
|----------|--------|------|---------------|
| `assert_can_read_student_eligibility_context` | no (REVOKE) | **yes** (default priv) | **yes** (GRANT) |
| `get_student_request_eligibility_context` | no (REVOKE) | **yes** (default priv) | yes (GRANT) |
| `check_student_request_basic_eligibility` | no (REVOKE) | **yes** (default priv) | yes (GRANT) |

### بعد

| Function | PUBLIC | anon | authenticated |
|----------|--------|------|---------------|
| `assert_can_read_student_eligibility_context` | no | no | no |
| `get_student_request_eligibility_context` | no | no | yes |
| `check_student_request_basic_eligibility` | no | no | yes |

---

## 6. Diff الكامل (migration)

```diff
diff --git a/supabase/migrations/20260711020000_student_requests_p1_foundations.sql b/supabase/migrations/20260711020000_student_requests_p1_foundations.sql
index 6af9b56..b8c5cdd 100644
--- a/supabase/migrations/20260711020000_student_requests_p1_foundations.sql
+++ b/supabase/migrations/20260711020000_student_requests_p1_foundations.sql
@@ -620,11 +620,11 @@ BEGIN
       );
     END IF;
 
-    IF v_study_status IS NOT NULL AND v_study_status <> 'new' THEN
+    IF v_study_status IS DISTINCT FROM 'new' THEN
       v_is_eligible := false;
       v_reasons := array_append(
         v_reasons,
-        'وقف القيد متاح للطلاب المستجدين فقط (student_study_status = new).'
+        'وقف القيد متاح للطلاب المستجدين فقط، ويجب استكمال student_study_status بقيمة new.'
       );
     END IF;
 
@@ -685,10 +685,17 @@ ALTER TABLE public.student_request_parallel_groups ENABLE ROW LEVEL SECURITY;
 ALTER TABLE public.student_request_parallel_group_members ENABLE ROW LEVEL SECURITY;
 ALTER TABLE public.central_signatory_references ENABLE ROW LEVEL SECURITY;
 
-REVOKE ALL ON FUNCTION public.assert_can_read_student_eligibility_context(uuid) FROM PUBLIC;
-REVOKE ALL ON FUNCTION public.get_student_request_eligibility_context(uuid) FROM PUBLIC;
-REVOKE ALL ON FUNCTION public.check_student_request_basic_eligibility(text, uuid) FROM PUBLIC;
+REVOKE ALL ON FUNCTION public.assert_can_read_student_eligibility_context(uuid)
+  FROM PUBLIC, anon, authenticated;
 
-GRANT EXECUTE ON FUNCTION public.assert_can_read_student_eligibility_context(uuid) TO authenticated;
-GRANT EXECUTE ON FUNCTION public.get_student_request_eligibility_context(uuid) TO authenticated;
-GRANT EXECUTE ON FUNCTION public.check_student_request_basic_eligibility(text, uuid) TO authenticated;
+REVOKE ALL ON FUNCTION public.get_student_request_eligibility_context(uuid)
+  FROM PUBLIC, anon;
+
+REVOKE ALL ON FUNCTION public.check_student_request_basic_eligibility(text, uuid)
+  FROM PUBLIC, anon;
+
+GRANT EXECUTE ON FUNCTION public.get_student_request_eligibility_context(uuid)
+  TO authenticated;
+
+GRANT EXECUTE ON FUNCTION public.check_student_request_basic_eligibility(text, uuid)
+  TO authenticated;
```

---

## 7. التحقق الساكن

| # | الفحص | النتيجة |
|---|-------|---------|
| 1 | 3 دوال فقط بالتوقيعات المقصودة | ✅ `assert_can_read_student_eligibility_context(uuid)`, `get_student_request_eligibility_context(uuid)`, `check_student_request_basic_eligibility(text, uuid)` |
| 2 | جميعها `SECURITY DEFINER` | ✅ |
| 3 | جميعها `SET search_path = public, pg_temp` | ✅ |
| 4 | بوابة auth تُرجع `28000` | ✅ `auth.uid() IS NULL` → `28000` |
| 5 | غير المالك/غير الدور يُرفض بـ `42501` | ✅ |
| 6 | الدالة الداخلية بلا GRANT للعميل | ✅ لا `GRANT` لـ `assert_can_read_*` |
| 7 | `anon` مُسحوب صراحة من الدوال الثلاث | ✅ `FROM PUBLIC, anon` (و`authenticated` للداخلية) |
| 8 | `authenticated` لديه EXECUTE للدالتين القابلتين للقراءة فقط | ✅ `get_*` و `check_*` |
| 9 | شرط study status هو `IS DISTINCT FROM 'new'` | ✅ |
| 10 | لا policies جديدة / seed / data statements | ✅ |

---

## 8. سيناريوهات الأمان المتوقعة (بعد التطبيق المستقبلي)

| السيناريو | النتيجة المتوقعة |
|-----------|------------------|
| `anon` → `get_student_request_eligibility_context` | مرفوض ACL |
| `anon` → `check_student_request_basic_eligibility` | مرفوض ACL |
| `anon` → `assert_can_read_student_eligibility_context` | مرفوض ACL |
| `authenticated` بدون JWT (`auth.uid()` NULL) | `28000` داخل الدالة |
| `authenticated` طالب يستدعي سياق طالب آخر | `42501` |
| `authenticated` طالب يستدعي سياقه | ناجح — JSON context |
| `authenticated` admin/SA/registrar | ناجح — JSON context |
| `authenticated` → `assert_can_read_*` مباشرة | مرفوض ACL |
| `enrollment_suspension` + `student_study_status` NULL | `is_eligible: false` — رسالة استكمال الحقل |
| `enrollment_suspension` + `student_study_status = 'repeat'` | `is_eligible: false` |
| `enrollment_suspension` + `student_study_status = 'new'` + باقي الشروط | يمرّ شرط study status (باقي U-SUSP-1 دون تغيير) |
| استدعاء `assert_can_read_*` من داخل `get_*` / `check_*` | ناجح — SECURITY DEFINER + `auth.uid()` للمستخدم الأصلي |

---

## 9. No-Write / No-Apply Assurance

| البند | الحالة |
|-------|--------|
| تطبيق G9 على staging/production | ❌ |
| تنفيذ SQL على الإنتاج | ❌ |
| تعديل default privileges (على DB) | ❌ |
| G7 / G8 re-apply | ❌ |
| Publish / Deploy | ❌ |
| seed / data writes | ❌ |
| تعديل بيانات حالية | ❌ |

---

## 10. قرار المرحلة

**PASS_G9_SOURCE_REMEDIATED_PUSHED_READY_FOR_REVIEW**

لا يُطبَّق G9 على أي بيئة DB حتى مراجعة الملف المصحح وإصدار أمر تطبيق مستقل.
