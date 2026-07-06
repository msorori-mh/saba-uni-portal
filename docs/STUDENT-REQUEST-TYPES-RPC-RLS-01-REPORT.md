# STUDENT-REQUEST-TYPES-RPC-RLS-01 Report

**التاريخ:** 2026-07-06  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**القرار:** **PASS_WITH_NOTES**  
**المرحلة التالية المقترحة:** **STUDENT-REQUEST-TYPES-UI-CONSOLIDATION-01**

---

## 1. Executive Summary

| البند | النتيجة |
|-------|---------|
| **القرار** | **PASS_WITH_NOTES** |
| **ما تم** | migration يضيف 4 RPCs رئيسية + helpers، يزيل `sr_insert_self`، يشدّد `sra_insert` |
| **جاهزية التطبيق** | **نعم** بعد تطبيق `20260710130000` ثم هذا الملف — مع اختبار حسابات active/graduated/غير مؤهل |

**ملاحظة (PASS_WITH_NOTES):** الواجهات الحالية (`StudentRequestsSection`, `createStudentServiceRequest` عبر INSERT مباشر) **ستتعطل** لإنشاء الطلبات حتى UI-CONSOLIDATION. لم يُمنع UPDATE المباشر للمسودات بعد.

---

## 2. Scope

- **migration + تقرير فقط** — لم يُطبَّق على Supabase.
- لا data writes، لا VALIDATE FK، لا توحيد أكواد، لا seed، لا UI.

---

## 3. Git State

| البند | القيمة |
|-------|--------|
| **الفرع** | `main` (متوقع) |
| **ملفات هذه المرحلة** | `supabase/migrations/20260710140000_student_request_types_rpc_rls.sql`, `docs/STUDENT-REQUEST-TYPES-RPC-RLS-01-REPORT.md` |
| **ملفات سابقة غير متتبعة** | لم تُلمس (تقارير PILOT، AUDIT، DESIGN، SCHEMA، …) |
| **commit / push / PR** | ❌ |

---

## 4. Migration Created

| البند | التفاصيل |
|-------|----------|
| **الملف** | `supabase/migrations/20260710140000_student_request_types_rpc_rls.sql` |
| **يعتمد على** | `20260710130000_student_request_types_schema.sql` |
| **لم يُنفَّذ** | VALIDATE FK، data normalization، seed، storage policies |

### دوال مُضافة

| الدالة | النوع |
|--------|-------|
| `student_request_ineligible_status_message()` | helper |
| `current_student_profile_for_auth()` | helper |
| `student_request_type_is_eligible(text, text)` | helper |
| `assert_student_can_use_request_type(text, text)` | helper |
| `get_available_request_types_for_current_student()` | RPC |
| `create_student_request(text, text, jsonb, text)` | RPC |
| `submit_student_request(uuid)` | RPC |
| `get_my_student_requests(integer, integer)` | RPC |

### سياسات RLS

| الإجراء | التفاصيل |
|---------|----------|
| `DROP sr_insert_self` | منع INSERT المباشر للطلاب |
| `REPLACE sra_insert` | مرفقات: مالك + `status IN (active, graduated)` + طلب قابل للتعديل |

---

## 5. Eligibility Rules Implemented

### `active` (`student_profiles.status = 'active'`)

- إنشاء/إرسال: `request_audience IN ('active_student', 'both')` فقط.
- عرض: نفس الأنواع eligible؛ أنواع `graduate` + `disabled` → تظهر معطّلة؛ `hidden` → لا تُرجع.

### `graduated`

- إنشاء/إرسال: `graduate`, `both` فقط.
- عرض: `active_student` **مخفية** (لا تُرجع في القائمة).

### غير `active` وغير `graduated`

- **جميع** الأنواع النشطة (`is_active`, `student_visible`) تُرجع **disabled** مع:
  > لا يمكنك تقديم طلبات حالياً بسبب حالة القيد الأكاديمي. يرجى مراجعة شؤون الطلاب.
- `create_student_request` / `submit_student_request` → **EXCEPTION** (نفس الرسالة).

يشمل منطقياً: موقوف، منسحب، محوّل، مفصول، أو أي `status` آخر — دون enum ثابت إضافي.

### لا ملف طالب

- RPCs القائمة/الإنشاء: empty أو exception «لا يوجد ملف طالب مرتبط بحسابك».

---

## 6. RPCs

### `get_available_request_types_for_current_student()`

| البند | القيمة |
|-------|--------|
| **المدخلات** | لا شيء (`auth.uid()`) |
| **المخرجات** | `id`, `code`, `name_ar`, `description_ar`, `request_audience`, `ineligible_display_mode`, `requires_attachment`, `sort_order`, `is_eligible`, `is_disabled`, `disabled_reason` |
| **SECURITY DEFINER** | ✅ `SET search_path = public` |
| **Grants** | `REVOKE PUBLIC` → `GRANT authenticated` |

### `create_student_request(p_request_type, p_title, p_form_data, p_student_notes)`

| البند | القيمة |
|-------|--------|
| **المخرجات** | `uuid` (request id) |
| **الحالة الأولية** | `draft` |
| **لا يقبل** | `student_profile_id` من العميل |
| **SECURITY DEFINER** | ✅ |

### `submit_student_request(p_request_id)`

| البند | القيمة |
|-------|--------|
| **من** | `draft` / `returned` / `returned_for_completion` |
| **إلى** | `submitted` |
| **إعادة فحص** | أهلية النوع + حالة الطالب |
| **TODO** | تحقق `required_documents` — مرحلة لاحقة |
| **ملاحظة** | لا يهيئ `student_service_request_steps` (يبقى على server fn الحالي أو مرحلة لاحقة) |

### `get_my_student_requests(p_limit, p_offset)`

| البند | القيمة |
|-------|--------|
| **المخرجات** | ملخص الطلبات + `request_type_name_ar` |
| **العزل** | `student_profile_id` من `auth.uid()` فقط |

---

## 7. RLS Changes

| الجدول | التغيير |
|--------|---------|
| `student_requests` | **منع INSERT المباشر للطلاب** (`sr_insert_self` مُسقَط) |
| `student_requests` | SELECT/UPDATE للطالب + staff **بدون تغيير** |
| `student_request_attachments` | `sra_insert` أضيق: قيد أكاديمي `active`/`graduated` + حالة طلب قابلة للتعديل |

### لماذا لم يُمنع UPDATE المباشر؟

- `protect_student_request` + `sr_update_self` يدعمان مسودات/إعادة إرسال عبر server fn الحالي.
- الإنشاء هو نقطة الاختراق الأخطر — رُكّز المنع عليه.
- التوحيد الكامل عبر RPC → **UI-CONSOLIDATION-01**.

---

## 8. Deferred Items

| البند | الحالة |
|-------|--------|
| `VALIDATE CONSTRAINT student_requests_type_request_types_code_fk` | ❌ مؤجّل |
| توحيد `reenrollment` / `department_transfer` | ❌ → DATA-NORMALIZATION-01 |
| seed `request_audience` per type | ❌ |
| رسوم / `needs_payment` | ❌ |
| UI consolidation | ❌ |
| storage bucket policies | ❌ |
| تهيئة workflow steps عند submit RPC | ⚠️ جزئي — server fn الحالي |

---

## 9. Risks / Notes

1. **INSERT مباشر** من `student-affairs.functions.ts` و`StudentRequestsSection` **يفشل** بعد تطبيق migration.
2. يجب تطبيق **SCHEMA-01 قبل RPC-RLS-01**.
3. اختبار: active، graduated، `suspended`/`withdrawn`/غيرهما.
4. قبل `VALIDATE FK`: فحص orphan `request_type` codes.
5. `submit_student_request` لا يستبدل كامل منطق `initializeSteps` — قد تحتاج دمج لاحق.

---

## 10. Recommended Next Phase

### **STUDENT-REQUEST-TYPES-UI-CONSOLIDATION-01**

1. استدعاء RPCs من `/student/requests/*`
2. عرض `disabled` / إخفاء `hidden`
3. إيقاف INSERT المباشر في server functions
4. ترحيل `StudentRequestsSection`

**بديل إن فشل التطبيق بسبب أكواد:**  
**STUDENT-REQUEST-TYPES-DATA-NORMALIZATION-01** ثم VALIDATE FK.

---

## 11. No-Write Assurance

| العنصر | تم؟ |
|--------|-----|
| تشغيل migration على DB | ❌ |
| تعديل DB فعلياً | ❌ |
| data writes / seed | ❌ |
| service role | ❌ |
| UI / server / routes | ❌ |
| commit / push / PR | ❌ |
| **الملفات المُنشأة** | migration + هذا التقرير فقط |

---

*نهاية التقرير — STUDENT-REQUEST-TYPES-RPC-RLS-01*
