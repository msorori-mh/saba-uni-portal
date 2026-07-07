# STUDENT-REQUEST-TYPES-RLS-SUBMIT-BYPASS-FIX-01 Report

**التاريخ:** 2026-07-06  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**القرار:** **PASS**  
**المرحلة التالية:** **STUDENT-REQUEST-TYPES-UI-CONSOLIDATION-01**

---

## 1. Executive Summary

| البند | النتيجة |
|-------|---------|
| **القرار** | **PASS** |
| **إغلاق bypass** | ✅ تم — لا يمكن `draft`/`returned` → `submitted` عبر UPDATE مباشر |
| **الإرسال عبر RPC فقط** | ✅ `submit_student_request()` مع إعادة فحص الأهلية + flag للـ trigger |

**نهج:** تقييد `sr_update_self` (منع `submitted` في WITH CHECK) + `protect_student_request` يرفض submit المباشر + RPC يضبط `student_request.submit_via_rpc` قبل UPDATE.

---

## 2. Scope

- migration + تقرير فقط (+ توثيق SCHEMA-01 المفقود).
- ❌ لم يُطبَّق على Supabase.

---

## 3. Git State

| البند | القيمة |
|-------|--------|
| **الفرع** | `main` (متوقع) |
| **ملفات جديدة** | `20260710150000_student_request_types_rls_submit_bypass_fix.sql`, هذا التقرير, `STUDENT-REQUEST-TYPES-SCHEMA-01-REPORT.md` |
| **تعديل migrations سابقة** | ❌ |
| **commit / push / PR** | ❌ |

---

## 4. Migration Created

| البند | التفاصيل |
|-------|----------|
| **الملف** | `supabase/migrations/20260710150000_student_request_types_rls_submit_bypass_fix.sql` |
| **يعتمد على** | `20260710140000_student_request_types_rpc_rls.sql` |

### سياسات / دوال

| العنصر | الإجراء |
|--------|---------|
| `sr_update_self` | DROP + CREATE — WITH CHECK **بدون** `submitted`/`under_review`/`in_review` |
| `sr_update_priv` | **بدون تغيير** |
| `sr_select_*` | **بدون تغيير** |
| `protect_student_request` | CREATE OR REPLACE — رفض submit المباشر؛ السماح فقط مع `submit_via_rpc` |
| `submit_student_request` | CREATE OR REPLACE — `set_config` قبل UPDATE |

### قرار التقييد vs المنع الكامل

**تقييد** — وليس منع UPDATE بالكامل:

- الطالب ما زال يعدّل **مسودة** (`draft`→`draft`) أو **returned** أو **يلغي** (`cancelled`).
- **ممنوع** فقط تحويل الحالة إلى `submitted` (أو `under_review`/`in_review`) مباشرة.

---

## 5. Bypass Fixed

| المسار | قبل | بعد |
|--------|-----|-----|
| UPDATE `draft` → `submitted` | مسموح (RLS + trigger) | **مرفوض** (RLS WITH CHECK + trigger EXCEPTION) |
| UPDATE `returned*` → `submitted` | مسموح | **مرفوض** |
| `submit_student_request()` | يفحص الأهلية | نفسه + `set_config` للسماح للـ trigger |

---

## 6. Ineligible Student Protection

| الحالة | create | submit RPC | UPDATE→submitted |
|--------|--------|------------|------------------|
| `active` / `graduated` (حسب audience) | حسب RPC السابق | ✅ مع `assert_student_can_use_request_type` | عبر RPC فقط |
| `NOT IN ('active','graduated')` | ممنوع | ممنوع | **ممنوع** (لا مسار bypass) |

الرسالة: «لا يمكنك تقديم طلبات حالياً بسبب حالة القيد الأكاديمي…»

---

## 7. RLS Impact

| الفئة | التأثير |
|-------|---------|
| **الطالب** | قراءة طلباته ✅؛ تعديل مسودة/returned ✅؛ إرسال **RPC فقط** |
| **الإدارة** | `sr_update_priv` و`sr_insert_priv` **بدون تغيير** |
| **واجهة حالية** | `submitStudentServiceRequest` عبر UPDATE المباشر **ستفشل** — يجب استدعاء RPC → **UI-CONSOLIDATION-01** |
| **حفظ مسودة** | UPDATE `draft`→`draft` **ما زال يعمل** عبر `sr_update_self` |

---

## 8. Deferred Items

- VALIDATE FK
- DATA-NORMALIZATION
- seed / fees
- UI consolidation
- E2E smoke
- تهيئة workflow steps في submit RPC

---

## 9. Safety Assurance

| العنصر | تم؟ |
|--------|-----|
| تشغيل migration | ❌ |
| تعديل DB | ❌ |
| data writes | ❌ |
| service role | ❌ |
| تعديل UI/server | ❌ |
| تعديل migrations سابقة | ❌ |
| commit / push | ❌ |

**الملفات المُنشأة:**

- `supabase/migrations/20260710150000_student_request_types_rls_submit_bypass_fix.sql`
- `docs/STUDENT-REQUEST-TYPES-RLS-SUBMIT-BYPASS-FIX-01-REPORT.md`
- `docs/STUDENT-REQUEST-TYPES-SCHEMA-01-REPORT.md` (توثيق — كان مفقوداً)

---

## 10. Recommended Next Phase

### **STUDENT-REQUEST-TYPES-UI-CONSOLIDATION-01**

الواجهة يجب أن تعتمد على:

- `get_available_request_types_for_current_student()`
- `create_student_request()`
- `submit_student_request()` ← **إلزامي للإرسال**
- `get_my_student_requests()`

---

*نهاية التقرير — STUDENT-REQUEST-TYPES-RLS-SUBMIT-BYPASS-FIX-01*
