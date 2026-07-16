# ALL-STUDENT-REQUESTS-GO-LIVE-READINESS-AUDIT-01

مرحلة قراءة فقط. ممنوع Migration/SQL/تعديل بيانات/Publish/Deploy.

## 1. جرد أنواع الطلبات في الإنتاج

جدول `public.request_types` يحتوي **12 نوعاً** (كلها `is_active=true`، `request_audience=active_student`، `ineligible_display_mode=hidden`، `form_schema` قيمة JSON قالبية غير مستخدمة فعلياً). فقط **1** منها `student_visible=true`.

### الجدول الشامل

| # | الخدمة | كود | الظهور للطالب | نموذج UI | إرسال Draft→Submit | أهلية RPC | Workflow نشط | تعيينات نشطة | الرسوم | الوثيقة | إشعار | RLS/أمن | القرار | العائق الأساسي |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | شهادة قيد | `enrollment_certificate` | ✅ نعم | ✅ ثابت + Dynamic | ✅ يعمل (`create_student_request` + `submit_student_request`) | ✅ `get_available_request_types_for_current_student` + `assert_student_can_use_request_type` | ✅ v2 (7 مراحل، 9 انتقالات) | ✅ 7/7 مراحل بمكلَّف واحد نشط | لا رسوم فعلياً (تقييم = صفر يتخطى الدفع) | ✅ PDF Saga + Storage + verify_document | ✅ عبر `notify_student_request_decision` | ✅ RLS + دوال مشددة (Migration `20260716052558`) + منع تنزيل الملغى منشور | **READY_FOR_FINAL_E2E** | لا يوجد |
| 2 | وقف قيد | `enrollment_suspension` | ❌ مخفي | ⚠️ تعريف نموذج فقط `unavailableUntilSchemaApplied=true` | ❌ لا مسار إنشاء فعلي | ⚠️ `validate_enrollment_suspension_request` موجودة كوظيفة تحقق فقط | ❌ 0 مراحل / 0 انتقالات | ❌ لا يوجد | ❌ غير مُعرَّف | ❌ لا مخرج | ❌ | RLS OK لكن لا مسار كتابي فعلي | **HIDDEN_NOT_IN_RELEASE_1** | لا workflow، لا تعيينات، لا نموذج فعّال |
| 3 | غياب بعذر | `excused_absence` | ❌ مخفي | ⚠️ تعريف نموذج فقط | ❌ | لا | ❌ 0/0 | ❌ | ❌ | لا | ❌ | RLS OK | **HIDDEN_NOT_IN_RELEASE_1** | Workflow + تعيينات مفقودة |
| 4 | شهادة تقديرات لغير الخريجين | `grade_statement_non_graduate` | ❌ مخفي | ⚠️ تعريف نموذج فقط | ❌ | لا | ❌ 0/0 | ❌ | ❌ | ❌ (يحتاج توليد PDF) | لا | RLS OK | **HIDDEN_NOT_IN_RELEASE_1** | كل شيء غير المخطط |
| 5 | سحب ملف | `file_withdrawal` | ❌ مخفي | ⚠️ تعريف نموذج فقط | ❌ | لا | ❌ 0/0 | ❌ | ❌ محتمل | ❌ | لا | RLS OK | **HIDDEN_NOT_IN_RELEASE_1** | كل شيء |
| 6 | استمارة دخول دور أكتوبر | `october_exam_entry_form` | ❌ مخفي | ⚠️ تعريف نموذج فقط | ❌ | لا | ❌ 0/0 | ❌ | ❌ محتمل | ❌ | لا | RLS OK | **HIDDEN_NOT_IN_RELEASE_1** | كل شيء |
| 7 | فرصة أخيرة | `final_chance` | ❌ مخفي | ❌ لا نموذج | ❌ | ⚠️ `validate_extra_chance_request` فقط | ❌ 0/0 | ❌ | ❌ | ❌ | لا | RLS OK | **HIDDEN_NOT_IN_RELEASE_1** | كل شيء |
| 8 | إصدار بطاقة بدل فاقد | `replacement_student_card` | ❌ مخفي | ❌ لا نموذج | ❌ | لا | ❌ 0/0 | ❌ | ❌ | ❌ | لا | RLS OK | **HIDDEN_NOT_IN_RELEASE_1** | كل شيء |
| 9 | التحويل من قسم إلى قسم | `department_transfer` | ❌ مخفي | ⚠️ تعريف نموذج فقط | ❌ | ⚠️ `validate_transfer_request` فقط | ❌ 0/0 | ❌ | ❌ | ❌ | لا | RLS OK | **HIDDEN_NOT_IN_RELEASE_1** | كل شيء |
| 10 | السجل الأكاديمي | `academic_record` | ❌ مخفي | ❌ لا نموذج | ❌ | لا | ❌ 0/0 | ❌ | ❌ | ❌ يحتاج PDF | لا | RLS OK | **HIDDEN_NOT_IN_RELEASE_1** | كل شيء |
| 11 | شهادة تقديرات | `grade_statement` | ❌ مخفي | ❌ لا نموذج | ❌ | لا | ❌ 0/0 | ❌ | ❌ | ❌ | لا | RLS OK | **HIDDEN_NOT_IN_RELEASE_1** | كل شيء |
| 12 | شهادة تخرج | `graduation_certificate` | ❌ مخفي | ❌ لا نموذج | ❌ | لا | ❌ 0/0 | ❌ | ❌ | ❌ | لا | RLS OK | **HIDDEN_NOT_IN_RELEASE_1** | كل شيء |

### قواعد الأهلية العامة
- التصفية الأساسية عبر RPC `get_available_request_types_for_current_student` + `ineligible_display_mode='hidden'` تمنع ظهور 11 خدمة للطالب.
- كتلة الفحص المسبق في `assert_student_can_use_request_type` تحمي الإنشاء الخادم لأي طلب مقدم.

### الأمن (تخطيط عام)
- `RLS` مفعّل على كل جداول الطلبات والوثائق والتعيينات والأدوار والإشعارات.
- التفويض المشدد للخطوات مطبق: `user_matches_workflow_runtime_step`, `can_current_user_act_on_step`, `is_current_user_dean_for_student`, `get_my_request_actor_inbox` (Migration `20260716052558_*`).
- حماية تنزيل الوثائق الملغاة/غير القابلة للتنزيل منشورة في `enrollment-certificate-pdf-storage-saga.functions.ts` قبل `createSignedUrl` (Downloadable = `issued|archived`).
- لا وجود لـ admin/registrar/dean bypass عام في `execute` أو `signed URL`.
- `anon` لا يملك EXECUTE على أي `*_student_request_*` كتابية (كلها SECURITY DEFINER تفحص `auth.uid()`).

---

## 2. المسار الكامل — الحالة الفعلية

| مرحلة | enrollment_certificate | باقي الـ11 |
|---|---|---|
| Student Create → Draft | ✅ | ❌ |
| Submit | ✅ | ❌ |
| Eligibility | ✅ | جزئي (بعضها فقط validate helper) |
| Workflow Initialization | ✅ | ❌ |
| Staff Inbox | ✅ | ❌ (لا خطوات) |
| Stage Authorization | ✅ مشدد | ❌ |
| Fees | يتخطى (=0) | ❌ |
| Payment | يتخطى | ❌ |
| Approval/Rejection/Return | ✅ | ❌ |
| Completion | ✅ | ❌ |
| Notification | ✅ | ❌ |
| Document Generation | ✅ Saga | ❌ |
| Archive | ✅ | ❌ |
| Audit | ✅ (`log_audit` عبر triggers + `audit_logs`) | ❌ |

---

## 3. تصنيف تنفيذي

- **جاهز الآن (READY_FOR_FINAL_E2E)**: 1 → `enrollment_certificate`.
- **غير مكتمل جوهرياً (يجب إخفاؤها عن الإصدار الأول)**: 11.
- **مكتمل UI بدون Workflow**: 6 (لديها تعريف نموذج قالبي فقط، بدون workflow/تعيينات).
- **مكتمل Backend بدون UI**: 0.
- **ينقصها إعداد أدوار/بيانات فقط**: 0 (لا واحد منها لديه workflow أصلاً).
- **ظهور للطلاب رغم عدم الاكتمال**: 0 (كلها `student_visible=false` أو `hidden`).

---

## 4. خطة التنفيذ المضغوطة (Batches)

### Batch A — عوائق مشتركة (قبل أي خدمة جديدة)
- الخدمات: كل الـ11.
- الملفات/الجداول: `request_types.form_schema` (كقاعدة موحدة)، `request_type_workflows/steps/transitions`، `request_processing_assignments`، `fee_types` (توسيع أعمدة `currency`, حالات إعفاء)، `request-form-registry.ts` (رفع `unavailableUntilSchemaApplied`).
- Migration: **نعم** لتوحيد `fee_types` وإضافة أعمدة رسوم لكل خدمة إن لزم.
- بيانات مستخدم: قائمة الأدوار المسؤولة لكل خدمة (بمقابلة `roles_catalog`).
- زمن نسبي: قصير.
- تبعية: يسبق B.
- PASS: توفر workflow schema موحد + وحدات معالجة معتمدة لكل خدمة مستهدفة.

### Batch B — إعداد Workflows والتعيينات
- الخدمات: الترتيب المقترح للإصدار الثاني: `enrollment_suspension`, `excused_absence`, `department_transfer`, `grade_statement`/`grade_statement_non_graduate`, `academic_record`, `graduation_certificate`.
- الجداول: `request_type_workflows/steps/transitions/processing_assignments`.
- Migration: **نعم** لكل خدمة workflow + seeds تعيينات.
- بيانات مستخدم: أسماء المكلَّفين لكل مرحلة لكل خدمة.
- تبعية: بعد A.
- PASS: لكل خدمة workflow واحد نشط + مرحلة واحدة على الأقل مكلَّف نشط + اجتياز نفس مصفوفة التفويض المستخدمة في enrollment_certificate.

### Batch C — النماذج والحقول الأساسية
- الخدمات: نفس مجموعة B.
- الملفات: `src/lib/student-requests/request-form-registry.ts`, `DynamicStudentRequestForm.tsx`, `student.requests.new.tsx`, جداول تفاصيل مثل `enrollment_suspension_details`, `transfer_request_details`، إلخ (موجودة أصلاً).
- Migration: **نعم** لربط `form_schema` بجداول التفاصيل + validate RPCs.
- بيانات مستخدم: لا (المخطط موجود).
- PASS: إمكانية إنشاء Draft + Submit ينشئ صف تفاصيل + يجتاز validate RPC.

### Batch D — الرسوم والدفع
- الخدمات: `grade_statement*`, `graduation_certificate`, `replacement_student_card`, `october_exam_entry_form` (خدمات مدفوعة نمطياً).
- الجداول: `fee_types`, `student_request_fee_assessments`, `student_payments`.
- Migration: **محتمل** لإضافة عملة/رمز/متغيرات.
- بيانات مستخدم: جدول الرسوم لكل خدمة (مبلغ/عملة).
- PASS: `assess_student_request_fee` يعيد مبلغاً صحيحاً + `confirm_student_request_fee_payment` يمرر.

### Batch E — الوثائق والمخرجات
- الخدمات المنتجة: `grade_statement*`, `academic_record`, `graduation_certificate`.
- الملفات: مولد PDF موحد على نمط `enrollment-certificate-pdf-storage-saga.functions.ts` + قوالب.
- Migration: نعم (`official_documents.document_type` + سجلات محاولات لكل خدمة).
- بيانات مستخدم: قوالب رسمية موقعة (Header/Footer/QR).
- PASS: توليد وثيقة موقعة بـ verify_document لكل خدمة تنتج مستنداً.

### Batch F — E2E مجمع + UAT
- الخدمات: كل ما مرّ.
- الاختبارات: `tests/security/*`, `tests/student-requests/*` + workbook UAT.
- Migration: لا.
- بيانات: حسابات طلاب اختبار نظيفة (كما في Preflight-02 لشهادة القيد).
- PASS: كل خدمة تمر بجولة كاملة مع مصفوفة تفويض 100% مطابقة.

---

## 5. القرار النهائي

**PASS_REQUESTS_PORTFOLIO_MAPPED_READY_FOR_BATCH_EXECUTION**

### ملخص تنفيذي

- إجمالي أنواع الطلبات: **12**.
- الجاهزة الآن: **1** (`enrollment_certificate`).
- غير المكتملة: **11**.
- التي يجب إبقاؤها مخفية في الإصدار الأول: **11** (كلها بالفعل `student_visible=false` أو `hidden` — لا يوجد تسرّب واجهة).
- **أهم 5 عوائق مشتركة**:
  1. غياب أي workflow لـ 11 خدمة (0 مراحل / 0 انتقالات).
  2. غياب تعيينات معالجة (`request_processing_assignments`) لأي مرحلة خارج شهادة القيد.
  3. النماذج قوالب `unavailableUntilSchemaApplied=true` بدون ربط فعلي بجداول التفاصيل.
  4. غياب هيكل رسوم متعدد العملات/الحالات لخدمات الرسوم.
  5. غياب مولد PDF عام لخدمات المخرجات (السجل/التقديرات/التخرج).
- **ترتيب الدفعات**: A → B → C → D → E → F.
- **البيانات المطلوبة منك فقط عند الحاجة**:
  - قائمة الخدمات المعتمدة رسمياً للإصدار الأول (هل نتوسع بعد شهادة القيد أم لا).
  - أسماء المكلَّفين بكل مرحلة لكل workflow جديد.
  - جدول الرسوم/العملة لكل خدمة مدفوعة.
  - قوالب PDF الرسمية إن قررنا إضافة خدمات وثائقية.
- **أول Batch تنفيذي موصى به**: بعد إصدار شهادة القيد الحالي → **Batch A** لتوحيد أساس الرسوم/Workflow schema، ثم Batch B لأول خدمة جديدة معتمدة.

الإصدار الأول جاهز فورًا بشهادة القيد فقط، وباقي الخدمات محجوبة عن الطالب بشكل صحيح — لا ضرر إنتاجي حالي.
