# REQUEST-TYPES-PILOT-WORKFLOW-CONFIGURATION-DESIGN-01 — REPORT

المرحلة: قراءة وتصميم فقط. لم يُنفَّذ أي UPDATE / INSERT / DELETE / Migration / Deploy / Publish.
`enrollment_certificate` يبقى `is_active=false, student_visible=false` بدون أي تغيير.

## G1 — مصفوفة الأنواع الـ12

مصدر: `public.request_types` (كل الصفوف: `request_audience=active_student`, `ineligible_display_mode=hidden`, `student_visible=false`).

| # | code | الاسم | is_active | requires_attachment | typed details table | ملاحظة |
|---|------|-------|-----------|---------------------|---------------------|--------|
| 1 | enrollment_certificate | شهادة قيد | false | false | — | نافذة E2E مغلقة، خارج نطاق الدفعة |
| 2 | enrollment_suspension | وقف قيد | true | false | `enrollment_suspension_details` | **دفعة تجريبية** |
| 3 | excused_absence | غياب بعذر | true | true | `absence_excuse_details` | **دفعة تجريبية** |
| 4 | grade_statement_non_graduate | شهادة تقديرات لغير الخريجين | true | false | — | جمهور مقترح: active_student |
| 5 | file_withdrawal | سحب ملف | true | false | — | خارج الدفعة |
| 6 | october_exam_entry_form | استمارة دور أكتوبر | true | false | — | خارج الدفعة |
| 7 | final_chance | فرصة أخيرة | true | false | — | خارج الدفعة |
| 8 | replacement_student_card | بدل فاقد بطاقة | true | false | — | **دفعة تجريبية — لا يوجد جدول Typed** |
| 9 | department_transfer | تحويل قسم | true | true | `transfer_request_details` | **دفعة تجريبية** |
| 10 | academic_record | السجل الأكاديمي | true | false | — | جمهور مقترح: both |
| 11 | grade_statement | شهادة تقديرات | true | false | — | جمهور مقترح: both |
| 12 | graduation_certificate | شهادة تخرج | true | false | — | جمهور مقترح: graduate |

## البنية التنظيمية المتاحة فعلياً

الوحدات النشطة (`request_processing_units`):
`student_affairs`, `finance`, `registrar`, `dean`, `archive`.

الأدوار النشطة (`request_processing_roles`) — لكل دور تعيين واحد نشط:

| الوحدة | role_code | الاسم | managerial |
|--------|-----------|-------|------------|
| student_affairs | student_affairs_specialist | مختص شؤون الطلاب | no |
| student_affairs | student_affairs_manager | مدير شؤون الطلاب | yes |
| finance | revenue_finance_officer | مسؤول الإيرادات والمالية | no |
| registrar | registrar_general | المسجل العام | yes |
| dean | dean | عميد الكلية | yes |
| archive | archive_officer | مسؤول الأرشيف | no |

**فجوة تنظيمية حرجة:** لا يوجد دور "رئيس قسم" ولا "مسجل كلية" منفصل عن المسجل العام. أي تصميم لتحويل الأقسام يجب أن يعتمد على `registrar_general` و/أو `dean` فقط، أو ينتظر إضافة أدوار جديدة (خارج نطاق هذه المرحلة).

## عقد Runtime الحالي

`action_type` المدعومة في `request_type_workflow_steps`:
`review`, `sign`, `assess_fee`, `confirm_payment`, `issue_document`, `archive`.

`action_result` المدعومة في `request_type_workflow_transitions`:
`submit`, `approve`, `signed`, `archived`, `issued`, `fee_not_required`, `payment_required`, `payment_confirmed`.

**ملاحظة مهمة:** لا يوجد حالياً أي انتقال بنتيجة `rejected` أو `returned` أو `completed` في الإنتاج. أي خطوة "رفض" أو "إرجاع للطالب" أو "Complete" ضمن التصاميم أدناه تحتاج إضافة `action_result` جديدة في Runtime قبل التفعيل. حالياً "Complete" تُنمذج ضمنياً بوصول الطلب إلى خطوة `archive` بنجاح.

## G2 — تصميم Workflows الأربعة

### 1) `excused_absence` — غياب بعذر

| # | step_key | الاسم | unit | role | action_type | ملاحظة |
|---|----------|-------|------|------|-------------|--------|
| 1 | initial_review | مراجعة أولية | student_affairs | student_affairs_specialist | review | التحقق من المرفق الطبي/الرسمي |
| 2 | manager_approval | اعتماد مدير شؤون الطلاب | student_affairs | student_affairs_manager | review | نتيجة: approve |
| 3 | archive | الأرشفة | archive | archive_officer | archive | نهاية المسار |

الانتقالات: `initial_review --submit--> manager_approval` (من الطالب)، `initial_review --approve--> manager_approval`، `manager_approval --approve--> archive`، `archive --archived--> (end)`.

**عدم إضافة رئيس قسم/مدرّس المادة تخمينياً** — الدور غير موجود في `request_processing_roles`.

### 2) `department_transfer` — تحويل قسم

قاعدة البيانات تدعم القسم/البرنامج المطلوب عبر `transfer_request_details` (`current_program_id`, `requested_program_id`, `current_department_id`, `requested_department_id`, `transfer_reason`).

| # | step_key | الاسم | unit | role | action_type |
|---|----------|-------|------|------|-------------|
| 1 | initial_review | مراجعة مختص شؤون الطلاب | student_affairs | student_affairs_specialist | review |
| 2 | manager_approval | اعتماد مدير شؤون الطلاب | student_affairs | student_affairs_manager | review |
| 3 | dean_approval | اعتماد عميد الكلية (بديل عن رئيسي القسم) | dean | dean | review |
| 4 | registrar_signature | توقيع المسجل العام | registrar | registrar_general | sign |
| 5 | archive | الأرشفة | archive | archive_officer | archive |

**تحفظ:** التصميم الأصلي يتطلب موافقة "رئيس القسم الحالي" و"رئيس القسم المطلوب" و"مسجل الكلية". لا يوجد أي من هذه الأدوار في `request_processing_roles` الإنتاجية. لا تُنفَّذ خطوات لأدوار غير موجودة. → **HOLD — REQUEST_TYPE_PROCESSING_ASSIGNMENTS_INCOMPLETE** لهذا النوع حتى إنشاء أدوار `department_head` (وربما `college_registrar`) وربطها بالأقسام.

### 3) `enrollment_suspension` — وقف قيد

| # | step_key | الاسم | unit | role | action_type |
|---|----------|-------|------|------|-------------|
| 1 | initial_review | مراجعة مختص شؤون الطلاب | student_affairs | student_affairs_specialist | review |
| 2 | manager_approval | اعتماد مدير شؤون الطلاب | student_affairs | student_affairs_manager | review |
| 3 | registrar_signature | اعتماد المسجل العام | registrar | registrar_general | sign |
| 4 | archive | الأرشفة | archive | archive_officer | archive |

**أثر على حالة الطالب:** الاعتماد النهائي يجب أن يُنتج تحديث `student_academic_status`/`student_profiles.study_status` إلى موقوف قيد للفترة المطلوبة. لا يُنفَّذ ذلك في هذه المرحلة؛ يحتاج Trigger أو RPC ما بعد الأرشفة (خارج نطاق التصميم الحالي).

### 4) `replacement_student_card` — بدل فاقد بطاقة

| # | step_key | الاسم | unit | role | action_type |
|---|----------|-------|------|------|-------------|
| 1 | initial_review | مراجعة مختص شؤون الطلاب + التحقق من البلاغ/المرفق | student_affairs | student_affairs_specialist | review |
| 2 | registrar_signature | اعتماد المسجل العام | registrar | registrar_general | sign |
| 3 | issue_card | إصدار/تسليم البطاقة | student_affairs | student_affairs_specialist | issue_document |
| 4 | archive | الأرشفة | archive | archive_officer | archive |

المالية مجمدة → لا خطوة `assess_fee`/`confirm_payment`.

## G3 — الإجراءات والانتقالات

كل خطوة review تنتقل بـ `approve` إلى التالية. خطوة `sign` تنتقل بـ `signed`. خطوة `issue_document` تنتقل بـ `issued`. خطوة `archive` تنهي بـ `archived`. الحالة المرئية للطالب: `submitted → in_review → approved/signed → issued (عند الحاجة) → archived (مكتمل)`.

**قيود عقد Runtime الحالي (يجب معالجتها قبل التفعيل):**
- لا يوجد `action_result = rejected` → خطوات "الرفض" غير مدعومة عبر transitions.
- لا يوجد `action_result = returned` → "إرجاع للطالب لاستكمال البيانات" غير مدعوم حالياً.
- لا يوجد `action_result = completed` صريح؛ الاكتمال يُستنتج من الوصول إلى `archive`.

المرفقات: إلزامية قبل الإرسال في `excused_absence` (RT.requires_attachment=true) و`department_transfer` (RT.requires_attachment=true). `replacement_student_card` مرفقه اختياري (نموذج بلاغ) لأن RT.requires_attachment=false.

## G4 — الجمهور والأهلية (توصية بدون تعديل)

| code | current audience | recommended audience |
|------|------------------|-----------------------|
| enrollment_certificate | active_student | active_student |
| enrollment_suspension | active_student | active_student |
| excused_absence | active_student | active_student |
| grade_statement_non_graduate | active_student | active_student |
| file_withdrawal | active_student | active_student |
| october_exam_entry_form | active_student | active_student |
| final_chance | active_student | active_student |
| replacement_student_card | active_student | active_student |
| department_transfer | active_student | active_student |
| academic_record | active_student | **both** |
| grade_statement | active_student | **both** |
| graduation_certificate | active_student | **graduate** |

## G5 — الحقول المطلوبة في الطلب

- **excused_absence** — مدعوم Typed جزئياً: `absence_excuse_details` يحفظ `course_section_id`, `absence_date`, `reason_type`. **ينقص:** `absence_date_from/to` (فترة)، `notes/reason_text`، مرجع للمرفق. الحل الحالي: صف واحد لكل يوم غياب + مرفق مطلوب على مستوى الطلب. توصية Migration مستقبلية لإضافة `absence_date_to`, `reason_text`.
- **department_transfer** — مدعوم Typed كامل: `transfer_request_details` (current/requested program+department, transfer_reason, notes). لا حاجة Migration.
- **enrollment_suspension** — مدعوم Typed كامل: `enrollment_suspension_details` (requested_from_academic_year_id, requested_from_semester_id, suspension_reason, suspension_duration_type, notes). لا حاجة Migration.
- **replacement_student_card** — **لا يوجد جدول Typed**. البيانات (نوع: فاقد/تالف، رقم البلاغ، سبب) لا يمكن حفظها بصورة Typed حالياً. الخيارات: (أ) استخدام `student_requests.form_data JSONB` مؤقتاً، (ب) إنشاء `replacement_card_details` لاحقاً. → **HOLD — REQUEST_TYPE_TYPED_DETAILS_SCHEMA_REQUIRED** لهذا النوع إذا كان الشرط Typed صارماً.

## G6 — جاهزية التفعيل

| النوع | البيانات مكتملة | Workflow ممكن الآن | يحتاج Migration | جاهز للإنشاء | جاهز للإظهار |
|-------|:---:|:---:|:---:|:---:|:---:|
| excused_absence | نعم (كافٍ) | نعم | مستحسن (فترة/سبب) | نعم | لا (بعد إنشاء + اختبار) |
| department_transfer | نعم | **لا** — أدوار رؤساء الأقسام مفقودة | لا (بيانات)، نعم (أدوار) | لا | لا |
| enrollment_suspension | نعم | نعم | لا (تصميم)، لاحقاً لأثر الحالة | نعم | لا |
| replacement_student_card | لا (Typed مفقود) | نعم بنيوياً | نعم (جدول Typed) أو قبول JSONB | مشروط | لا |

قاعدة القرار محفوظة: لا `student_visible=true` قبل: اكتمال التعريف، Workflow نشط صالح، الحقول، اختبار إرسال، تحقق Inbox.

## G7 — خطة التنفيذ الآمن (لاحقاً بموافقة المالك)

1. **excused_absence** أولاً (أبسط + Typed كافٍ):
   - إنشاء Workflow (3 خطوات) → تحقق صحة → `student_visible=true` → اختبار بحساب واضح → تحقق Inbox المختص/المدير → أرشفة تجريبية.
2. **enrollment_suspension** ثانياً بنفس النمط، مع تأجيل أثر تحديث حالة الطالب.
3. **replacement_student_card** ثالثاً بعد قرار المالك: (أ) Migration لجدول Typed، أو (ب) قبول `form_data` JSONB.
4. **department_transfer** أخيراً بعد إنشاء أدوار `department_head` (وربطها بالأقسام) وربما `college_registrar`.

بعد كل نوع: إن فشل الاختبار → إغلاق نافذة الإظهار فوراً قبل الانتقال. ممنوع تفعيل الأربعة دفعة واحدة.

## المخاطر

- تفعيل Workflow بدون transitions لـ reject/return يعني أن الطلب لا يمكن رفضه أو إعادته للطالب — يبقى معلقاً حتى approve أو archive. يجب توسيع عقد Runtime قبل الإنتاج الفعلي.
- department_transfer بدون رؤساء أقسام يعني تصميم غير مطابق للسياسة الأكاديمية؛ لا يُفعَّل بديلاً مبسطاً بدون قرار المالك.
- replacement_student_card عبر JSONB يفقد التحقق النوعي؛ الأفضل Migration.

## تأكيد عدم تنفيذ أي كتابة

استُخدم `supabase--read_query` فقط. لم تُستدعَ `supabase--migration` ولا أي أداة كتابة. `enrollment_certificate` لم يُمس. لا تغيير على Auth/Roles/بيانات الطلاب.

## القرار

اثنان من الأنواع الأربعة يواجهان فجوات هيكلية:
- `department_transfer` → **HOLD — REQUEST_TYPE_PROCESSING_ASSIGNMENTS_INCOMPLETE**
- `replacement_student_card` → **HOLD — REQUEST_TYPE_TYPED_DETAILS_SCHEMA_REQUIRED** (ما لم يُقبل JSONB)

`excused_absence` و`enrollment_suspension` جاهزان لإنشاء Workflow ثم تفعيل مرحلي.

**PASS_REQUEST_TYPES_PILOT_DESIGN_READY_FOR_OWNER_APPROVAL** — للاثنين الجاهزين، مع تحفظات HOLD أعلاه للنوعين الآخرين بانتظار قرارات المالك (إنشاء أدوار الأقسام، وقرار Typed vs JSONB لبطاقة البدل، وتوسيع `action_result` بـ `rejected`/`returned`).
