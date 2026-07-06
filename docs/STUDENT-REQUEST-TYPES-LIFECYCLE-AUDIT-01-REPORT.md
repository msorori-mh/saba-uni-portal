# STUDENT-REQUEST-TYPES-LIFECYCLE-AUDIT-01 Report

**التاريخ:** 2026-07-06 (إعادة تنفيذ)  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**GitHub:** [msorori-mh/saba-uni-portal](https://github.com/msorori-mh/saba-uni-portal)  
**القرار:** **PASS_WITH_NOTES**  
**المرحلة التالية المقترحة:** **STUDENT-REQUEST-TYPES-LIFECYCLE-DESIGN-01**

---

## 1. Executive Summary

| البند | النتيجة |
|-------|---------|
| **القرار** | **PASS_WITH_NOTES** |
| **الملخص** | نظام طلبات الطلاب **موجود ومتقدم**: `request_types`, `student_requests`, مرفقات، workflow (`workflow_schema` + steps/events)، RLS أساسي، وواجهات طالب/إدارة. **لا يوجد** في schema المطبّق حالياً (حسب `types.ts`) `request_audience` أو `ineligible_display_mode`. لا فصل خريج/مستمر في DB/RPC عموماً. مصدر التخرج: `student_profiles.status = 'graduated'`. |
| **جاهزية التصميم/التنفيذ** | **نعم — لمرحلة التصميم** مع قرارات حول الجمهور، توحيد الواجهات، ومزامنة أكواد الطلبات. |

**لماذا PASS_WITH_NOTES:** ازدواجية واجهتين، غياب جمهور الطلبات، تعارض `sr_type_chk` مع أكواد workflow (`reenrollment`, `department_transfer`, `enrollment_certificate`).

**لماذا ليس NO-GO:** البنية التحتية كافية للبناء التدريجي على `request_types` + RPCs.

> **ملاحظة قراءة المستودع:** يوجد في `supabase/migrations/` ملف `20260710130000_student_request_types_schema.sql` (مرحلة SCHEMA لاحقة) **لم يُطبَّق** — `types.ts` لا يزال بلا `request_audience`. هذا التقرير يصف **الوضع قبل تطبيق** ذلك الملف.

---

## 2. Scope

- مرحلة **فحص وتحليل فقط** من ملفات المستودع.
- **الكتابة الوحيدة:** هذا التقرير.
- لا Supabase/Lovable ولا استعلامات على الإنتاج.

---

## 3. Repository & Git State

| البند | القيمة |
|-------|--------|
| **المسار المحلي** | `C:\projects\saba-uni-portal-git` |
| **الفرع** | `main` (متوقع — لم يُغيَّر خلال الفحص) |
| **Remote** | `origin` → `https://github.com/msorori-mh/saba-uni-portal.git` |
| **آخر commits (مرجع)** | `b044459` · `f98252d` · `5728214` · `5191940` · `98daec1` Merge PR #96 |
| **git status --short** | ملفات غير متتبعة تشمل على الأقل: `docs/PILOT-TEST-ACCOUNTS-MATRIX-01-REPORT.md`, `docs/STUDENT-REQUEST-TYPES-LIFECYCLE-AUDIT-01-REPORT.md`, `docs/STUDENT-REQUEST-TYPES-LIFECYCLE-DESIGN-01.md`, `supabase/migrations/20260710130000_student_request_types_schema.sql` — **لم تُلمس** أثناء هذا الفحص |

> أوامر `git`/`gh` نُفّذت؛ إن تعذّر إخراج الطرفية، استُخدم فحص الملفات مباشرة.

### PR #96

| الحقل | القيمة |
|-------|--------|
| **الرقم** | 96 |
| **الحالة** | MERGED |
| **الفرع** | `councils/agenda-ui-01` → `main` |
| **تاريخ الدمج** | 2026-07-06T01:28:04Z |
| **الرابط** | https://github.com/msorori-mh/saba-uni-portal/pull/96 |

خارج نطاق طلبات الطلاب (مجالس/أجندة).

---

## 4. Existing Student Request Schema

| العنصر | موجود؟ | الملف / المصدر | أعمدة / ملاحظات |
|--------|--------|----------------|-----------------|
| **request_types** | ✅ | `20260601000207`, `20260630230114`, `20260706120000` | `code` UNIQUE, `name_ar`, `is_active`, `student_visible`, `requires_attachment`, `required_documents`, `form_schema`, `workflow_schema`, `category`, `sort_order` — **لا** `request_audience` / `ineligible_display_mode` في `types.ts` |
| **student_requests** | ✅ | `20260531235203` + توسعات | `student_profile_id`, `request_type`, `status`, `form_data`, `request_number`, `current_step_index`, `current_role_key`, … |
| **student_request_attachments** | ✅ | `20260531235203` | `request_id`, `file_url`, `file_name`, bucket `student-request-attachments` |
| **request_workflows** | ✅ جزئياً | `workflow_schema` + `student_service_request_steps` + `student_service_request_events` | ليس جدول `request_workflows` منفصل |
| **request_statuses** | ✅ | `student_requests.status` + CHECK `sr_status_chk` | لا جدول `request_statuses` |
| **fees/payments للطلب** | ❌ | `student_fees`, `fee_types`, `student_payments`, `payment_receipts` | منفصلة — بدون `request_id` |
| **documents/output** | ✅ | `official_documents`, `official_transcript_request_details` | إصدار عند اعتماد بعض الأنواع |
| ***_details** | ✅ | migrations متعددة | غياب، وقف قيد، إعادة قيد، فرصة، تحويل، مقاصة، تظلم، كشف رسمي |

### أعمدة مقترحة لاحقاً — قابلية الاستيعاب

| العمود | قابل على schema الحالي؟ |
|--------|-------------------------|
| `request_audience` | ✅ على `request_types` — **مُعدّ في migration معلّق** |
| `ineligible_display_mode` | ✅ على `request_types` — **مُعدّ في migration معلّق** |

### تعارض أكواد

- **`sr_type_chk`** (آخر: `20260627120000`): `absence_excuse`, `enrollment_suspension`, `enrollment_reinstatement`, `extra_chance`, `transfer`, `equivalency`, `grade_appeal`, `official_transcript`
- **seed workflow** (`20260706120000`): `reenrollment`, `department_transfer`, `enrollment_certificate` — **غير مدرجة** في `sr_type_chk`

### RPCs / SECURITY DEFINER

`is_owner_of_request`, `protect_student_request`, `can_access_student_service_request`, `can_act_on_student_service_request`, `validate_official_transcript_request`, `apply_*_on_approval`, `issue_official_document`

---

## 5. Student Eligibility Source

| الفئة | التعريف في النظام |
|-------|-------------------|
| **طالب مستمر** | `student_profiles.status = 'active'` (+ غالباً `student_academic_status.enrollment_status = 'active'`) |
| **خريج** | `student_profiles.status = 'graduated'` |
| **قيد التخرج** | `getGraduationCandidates` — أهلية أكاديمية **لا تغيّر** `status` |
| **غير مؤهل** | `suspended`, `withdrawn`, `transferred` |

| عمود | موجود؟ |
|------|--------|
| `graduation_status` | ❌ |
| `is_graduated` | ❌ |
| جدول `graduates` | ❌ |

### قاعدة «لا خريج إلا بعد اعتماد التخرج»

| الجانب | الحالة |
|--------|--------|
| مدعوم منطقياً | ✅ — `graduated` ≠ إكمال المواد فقط |
| تلقائي عند إكمال الخطة | ❌ |
| RPC اعتماد تخرج | ⚠️ غير واضح — مرشحو التخرج للعرض؛ التحديث يدوي/إداري |
| **يحتاج لاحقاً** | سير اعتماد تخرج + ربط طلبات الخريجين |

**المصدر الرسمي للطلبات:** `student_profiles.status`

---

## 6. Current Lifecycle Support

**حالات موجودة:** `draft`, `submitted`, `in_review`, `under_review`, `returned`, `returned_for_completion`, `approved`, `rejected`, `cancelled`, `completed`

| حالة مطلوبة | موجودة؟ |
|-------------|---------|
| draft | ✅ |
| submitted | ✅ |
| under_review | ✅ |
| needs_payment | ❌ |
| needs_attachment | ❌ (جزئي عبر `returned_for_completion`) |
| approved | ✅ |
| rejected | ✅ |
| completed | ✅ |
| cancelled | ✅ |

**Workflow منفصل ضروري** — موجود عبر `workflow_schema` + steps/events؛ enum وحده لا يكفي.

---

## 7. Attachments & Fees Support

| القدرة | الحالة |
|--------|--------|
| مرفقات الطلب | ✅ |
| أنواع مرفقات حسب النوع | ⚠️ `required_documents` jsonb — بدون تحقق إلزامي عند الإرسال |
| رسوم حسب نوع الطلب | ❌ |
| إثبات دفع للطلب | ❌ (مرتبط بـ `student_fee_id`) |
| وثيقة/كشف ناتج | ✅ لـ `official_transcript` ومسار `issue_official_document` |

---

## 8. RLS / RPC / Security Findings

| السؤال | الجواب |
|--------|--------|
| الحماية كافية لجمهور الطلبات؟ | **لا** |
| أين الحماية؟ | RLS ملكية، `protect_student_request`, workflow helpers؛ **جزئياً** `validate_official_transcript_request` |
| منع مستمر من طلب خريج؟ | **لا** في DB/RPC عام |
| منع خريج من طلب مستمر؟ | **لا** |
| UI فقط؟ | `student_visible` + server fn — **لا يفحص** `status`/`audience` |
| مخاطر UI فقط | تجاوز محتمل عبر INSERT مباشر |
| مطلوب لاحقاً | RPCs أهلية + تضييق INSERT + `request_audience` |

---

## 9. UI / Routes Findings

**طالب:** `/student/requests/*` (جديد), `StudentRequestsSection` في `/student` (قديم), `/mobile/student/requests`

**إدارة:** `/admin/student-requests`, `/admin/request-types`, `/admin/graduation-candidates`

**مكتبات:** `student-affairs.functions.ts`, `admin-student-requests.functions.ts`, `admin-request-types.functions.ts`, `StudentRequestsSection.tsx`, `RequestTimelinePanel.tsx`

**نصوص عربية:** طلبات شؤون الطلاب، طلب، مرفقات، رسوم، وثيقة، كشف درجات، تخرج/خريج — **لا بوابة خريج منفصلة**

---

## 10. Proposed Architecture Direction

| العنصر | التوصية |
|--------|---------|
| Master data | `request_types` — إضافة `request_audience`, `ineligible_display_mode` |
| الطلبات | الإبقاء على `student_requests` + مرفقات |
| التاريخ | `student_service_request_events` + `audit_logs` |
| الرسوم | `request_type_fees` لاحقاً + `needs_payment` |
| RPCs | قائمة مؤهلة، إنشاء، إرسال — SECURITY DEFINER مع تحقق `active`/`graduated` |
| RLS | تضييق INSERT؛ الاعتماد على RPC للإنشاء |
| الظهور | مستمر يرى active+both؛ خريج يرى graduate+both؛ حماية في RPC وليس UI فقط |

**قابلية الإضافة بأقل تعديل:** ✅ أعمدة على `request_types` + RPCs + RLS

---

## 11. Gaps

1. لا `request_audience` / `ineligible_display_mode` في schema المطبّق (`types.ts`)
2. لا فصل خريج/مستمر في RLS/RPC (استثناء: `official_transcript` → `active`)
3. ازدواجية UI قديم/جديد
4. تعارض أكواد `sr_type_chk` vs workflow seed
5. لا رسوم مرتبطة بالطلبات
6. لا تحقق إلزامي للمرفقات عند الإرسال
7. اعتماد التخرج غير مؤتمت
8. لا بوابة خريج منفصلة
9. إدارة أنواع الطلبات لا تغطي audience/workflow كاملاً
10. أنواع خريجين في الكتالوج غير نشطة

---

## 12. Recommended Next Phase

### **STUDENT-REQUEST-TYPES-LIFECYCLE-DESIGN-01**

1. نموذج `request_audience` + `ineligible_display_mode`
2. مصفوفة أنواع (مستمر/خريج/مشترك) وتوحيد أكواد
3. تعريف اعتماد التخرج
4. عقد RPCs وRLS
5. قرار توحيد UI
6. خطة `sr_type_chk` → FK
7. تسلسل حالات شامل

---

## 13. No-Write Assurance

| العنصر | تم؟ |
|--------|-----|
| migrations (تشغيل) | ❌ |
| تعديل DB | ❌ |
| data writes | ❌ |
| RLS / UI / server / routes | ❌ |
| seed / delete / cleanup / service role | ❌ |
| commit / push / PR | ❌ |
| **الملف المُعدَّل** | ✅ `docs/STUDENT-REQUEST-TYPES-LIFECYCLE-AUDIT-01-REPORT.md` فقط |

---

*نهاية التقرير — STUDENT-REQUEST-TYPES-LIFECYCLE-AUDIT-01*
