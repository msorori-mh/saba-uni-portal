# STUDENT-REQUESTS-WORKFLOW-CANONICAL-SPEC-01

**التاريخ:** 2026-07-07  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**النوع:** مواصفة تنفيذية مُلزمة — تصميم وتدقيق فقط  
**القرار:** **READY_FOR_GAP_AUDIT**

---

## 1. Executive Summary

| البند | القرار |
|-------|--------|
| **القرار** | **READY_FOR_GAP_AUDIT** |
| **نطاق هذه الوثيقة** | 8 أنواع طلبات معتمدة حالياً (انظر §2) |
| **الغرض** | مصدر حقيقة واحد للتنفيذ: أهلية، فورم، workflow، رسوم، إشعارات، مستندات، أرشفة، schema/RPC/UI |

### ملخص عام

هذه الوثيقة تُلزم فرق التنفيذ بمواصفة دورة حياة طلبات الطلاب وفق آلية الكلية المعتمدة. البنية التحتية **جزئياً موجودة** (`request_types`, `student_requests`, `enrollment_suspension_details`, migrations workflow 130000–190000, actor RPCs) لكن:

- أكواد legacy (`absence_excuse` ≠ `excused_absence`, `transfer` aliases) تحتاج توحيد.
- 4 أنواع من الـ 8 **غير موجودة** في seed/DB: `grade_statement_non_graduate`, `file_withdrawal`, `october_exam_entry_form`, وربما `excused_absence` ككود canonical.
- لا parallel workflow steps، لا fee/hafiza tables، لا document generation pipeline، لا central university signatories.
- UI الطالب generic — لا form renderer per-type.

### لماذا لا يُنفَّذ مباشرة قبل Gap Audit

1. **Gap audit** يقارن كل صف في §13 Traceability Checklist مع الكود/migrations الفعلية.
2. **Code normalization** (`absence_excuse` → `excused_absence`, إلخ) قبل seed.
3. **Schema foundations** (service windows, fees, parallel gates, import fields) قبل أي UI.
4. **Workflow engine** يجب أن يثبت parallel_all_required و auto-doc قبل `file_withdrawal`.

---

## 2. Canonical Request Codes (Scope)

| # | الكود المعتمد | الاسم العربي | كود legacy في المستودع (إن وُجد) |
|---|---------------|--------------|----------------------------------|
| 1 | `enrollment_suspension` | وقف القيد | ✅ نفسه |
| 2 | `grade_statement_non_graduate` | شهادة تقديرات لغير الخريجين | ❌ جديد |
| 3 | `enrollment_certificate` | شهادة قيد | ✅ (workflow seed) |
| 4 | `file_withdrawal` | سحب ملف | ❌ جديد |
| 5 | `excused_absence` | غياب بعذر | ⚠️ `absence_excuse` |
| 6 | `grade_appeal` | تظلم | ✅ نفسه |
| 7 | `department_transfer` | تحويل من قسم إلى قسم | ✅ (alias `transfer` في details) |
| 8 | `october_exam_entry_form` | استمارة دخول دور أكتوبر | ❌ جديد |

**قاعدة التوحيد:** الكود في عمود «المعتمد» هو `request_types.code` الوحيد بعد DATA-NORMALIZATION.

---

## 3. Request Audience Matrix

| الكود | الاسم | `request_audience` | `ineligible_display_mode` (عند عدم الأهلية الجمهوري) | مرفقات | رسوم | مستند ناتج | أرشفة |
|-------|------|-------------------|--------------------------------------------------------|--------|------|------------|-------|
| `enrollment_suspension` | وقف القيد | `active_student` | `hidden` للخريج | لا | نعم | استمارة وقف قيد | نعم |
| `grade_statement_non_graduate` | شهادة تقديرات | `active_student` | `hidden` للخريج | لا | نعم | شهادة تقديرات | نعم |
| `enrollment_certificate` | شهادة قيد | `active_student` | `hidden` للخريج | لا | نعم | شهادة قيد | نعم |
| `file_withdrawal` | سحب ملف | `active_student` | `hidden` للخريج | لا* | نعم | بيان تقديرات + ملف | نعم |
| `excused_absence` | غياب بعذر | `active_student` | `hidden` للخريج | **نعم (متعدد)** | نعم | استمارة غياب بعذر | نعم |
| `grade_appeal` | تظلم | `active_student` | `hidden` للخريج | لا | نعم | كشف تظلمات (دفعة) | نعم |
| `department_transfer` | تحويل قسم | `active_student` | `hidden` للخريج | **نعم** (ثانوية) + auto | نعم | مقاصة + استمارة تحويل | نعم |
| `october_exam_entry_form` | دور أكتوبر | `active_student` | `hidden` للخريج | لا | نعم | استمارة أكتوبر | نعم |

\* سحب الملف: مرفقات الطالب = لا؛ مستندات آلية تُولَّد من النظام.

### قواعد العرض العامة (مُلزمة)

| حالة الطالب | السلوك |
|-------------|--------|
| **غير خريج** (`status=active`, `enrollment_status=active`, لم يُعتمد تخرجه) | طلبات `active_student` = مفعّلة حسب الأهلية؛ طلبات `graduate` = **باهتة/disabled** |
| **خريج** (`status=graduated` أو `request_audience` graduate-only) | طلبات `graduate` فقط؛ `active_student` = **مخفية** (`hidden`) |
| **غير نشط أكاديمياً** | الخدمات **باهتة**؛ **منع التقديم في RPC** (ليس UI فقط) |

---

## 4. Eligibility Matrix

| الكود | قواعد الأهلية (مُلزمة) | مصدر بيانات | RPC/UI |
|-------|------------------------|-------------|--------|
| **enrollment_suspension** | E-S1: مستوى ≥2 · E-S2: `student_study_status=new` · E-S3: `transferred_current_year=false` · E-S4: وقف سابق ≤1 سنة متتالية و≤3 فصول متفرقة · E-S5: نافذة خدمة (بداية فصل → قبل exams−14d) · E-S6: قبل بدء الاختبارات · E-S7: لا طلب مفتوح · E-S8: غير موقوف · E-S9: active enrollment | profiles + academic_status + service_windows + semesters.exams_start_date + suspension counts/history | `assert_student_eligible_enrollment_suspension` |
| **grade_statement_non_graduate** | G-1: active_student · G-2: enrollment active · G-3: غير خريج · G-4: لا مانع مالي/إداري (اختياري لاحقاً) | profiles + academic_status | RPC عام + نوع |
| **enrollment_certificate** | C-1: active_student · C-2: enrollment active · C-3: غير خريج | profiles | RPC عام |
| **file_withdrawal** | W-1: active_student · W-2: enrollment active · W-3: غير موقوف/منسحب · W-4: لا طلب سحب مفتوح | profiles + requests | RPC نوع |
| **excused_absence** | A-1: active_student · A-2: **نافذة خدمة من الأدمن** · A-3: مواد الفصل الحالي فقط · A-4: enrollment active | service_windows + enrollments | RPC + form filter |
| **grade_appeal** | AP-1: active_student · AP-2: **فترة تظلم مفتوحة** (admin) · AP-3: مواد الفصل المفتوح للتظلم فقط · AP-4: **نتائج المادة ظاهرة** | appeal_windows + grades | RPC + form filter |
| **department_transfer** | T-1: active_student · T-2: enrollment active · T-3: قسم/برنامج هدف ≠ الحالي · T-4: لا تحويل مفتوح | profiles + departments | RPC + form |
| **october_exam_entry_form** | O-1: active_student · O-2: **نافذة admin** · O-3: عدد مواد راسبة/متبقية ≤ admin max · O-4: enrollment active | failed_courses count + config | RPC |

### حقول استيراد انتقالية (وقف القيد + مشتركة لاحقاً)

| الحقل | النوع | القيم | افتراضي | ملاحظة |
|-------|------|-------|---------|--------|
| `student_study_status` | text | `new`/`repeat` | `new` | مستجد/باقي — **افتتاحي** |
| `transferred_current_year` | boolean | true/false | false | **افتتاحي** |
| `previous_suspension_semesters_count` | int ≥0 | — | 0 | **افتتاحي** → لاحقاً `enrollment_suspension_history` |
| `consecutive_suspension_years_count` | int ≥0 | — | 0 | **افتtاحي** |

---

## 5. Form Schema Matrix

| الكود | ترتيب الفورم | حقول إلزامية | قواعد UI |
|-------|-------------|--------------|----------|
| **enrollment_suspension** | 1 snapshot · 2 eligibility · 3 duration (semester/year) · 4 target period · 5 reason · 6 ack · 7 submit | duration, year, semester, reason, ack | إخفاء first sem إذا current=second |
| **grade_statement_non_graduate** | 1 snapshot · 2 purpose/notes (optional) · 3 ack · 4 submit | ack | — |
| **enrollment_certificate** | 1 snapshot · 2 purpose · 3 ack · 4 submit | ack | — |
| **file_withdrawal** | 1 snapshot · 2 reason · 3 ack · 4 submit | reason, ack | — |
| **excused_absence** | 1 snapshot · 2 course(s) current sem only · 3 excuse desc · 4 attachments (1+) · 5 ack · 6 submit | courses, desc, ≥1 file, ack | multi-attach |
| **grade_appeal** | 1 snapshot · 2 appeal semester · 3 course(s) allowed · 4 statement · 5 submit | semester, courses, statement | filter by appeal window |
| **department_transfer** | 1 snapshot (dept/program RO) · 2 target dept · 3 target program · 4 secondary school form img · 5 ack · 6 submit | target dept/program, attachment, ack | exclude current dept |
| **october_exam_entry_form** | 1 snapshot · 2 remaining/failed courses (RO) · 3 submit | implicit eligibility | max courses enforced server-side |

---

## 6. Workflow Matrix

### 6.1 `enrollment_suspension`

| # | المفتاح | الجهة | processing_unit | إجراء | موافقة/رفض | رسوم | موازي | التالي | يراه الطالب |
|---|---------|-------|-----------------|-------|-------------|------|-------|--------|-------------|
| 0 | submit | الطالب | — | تقديم | — | — | — | dept_head | «مُرسَل» |
| 1 | dept_head | رئيس القسم | `department_chair` | مراجعة + سجل أكاديمي | ✓/✗ | — | — | dean | «رئيس القسم» |
| 2 | dean | عميد الكلية | `dean` | موافقة | ✓/✗ | — | — | student_affairs_fees | «العميد» |
| 3 | sa_fees | مدير شؤون الطلاب | `student_affairs` | رسوم + حافظة | fee set | ✓ | — | finance | «سداد مطلوب» |
| 4 | finance | الإيرادات | `finance` | تأكيد سداد | confirm | — | — | registrar | «بانتظار تأكيد السداد» |
| 5 | registrar | مسجل الكلية | `registrar` | اعتماد نهائي + suspended + تواريخ | ✓ | — | — | archive | «اعتماد نهائي» |
| 6 | archive | الأرشيف | `archive` | أرشفة + استمارة | — | — | — | completed | «تحميل الاستمارة» |
| 7 | completed | — | — | — | — | — | — | — | «مكتمل» |

**إعادة قيد:** job عند `suspension_end_date` → `enrollment_status=active` (§12).

---

### 6.2 `grade_statement_non_graduate`

| # | الجهة | رسوم | التالي | ملاحظة |
|---|-------|------|--------|--------|
| 1 | الطالب | — | SA | |
| 2 | مدير إدارة شؤون الطلاب | ✓ حافظة | finance | تحقق + رسوم |
| 3 | الإيرادات | confirm | grad_affairs_mgr | |
| 4 | مدير شؤون الخريجين | — | **central: university_registrar** | جهة مركزية |
| 5 | **المسجل العام للجامعة** | — | dean | **ليس staff_profiles** |
| 6 | عميد الكلية | ✓ **اعتماد آلي** | college_registrar | بدون توقيع يدوي |
| 7 | مسجل الكلية | طباعة | archive | |
| 8 | الأرشيف | — | completed | |
| 9 | completed | — | — | إشعار: استلام من مكتب المسجل |

**توقيعات النموذج (4):** مسجل الكلية · عميد (آلي) · المسجل العام · **نائب رئيس الجامعة لشؤون الطلاب** (central — ليس موظف كلية).

---

### 6.3 `enrollment_certificate`

| # | الجهة | التالي |
|---|-------|--------|
| 1 | الطالب | SA |
| 2 | مدير إدارة شؤون الطلاب | finance |
| 3 | الإيرادات | grad_affairs_or_admin |
| 4 | مدير شؤون الخريجين / جهة إدارية | dean |
| 5 | عميد الكلية (**اعتماد آلي**) | college_registrar |
| 6 | مسجل الكلية | archive |
| 7 | الأرشيف | completed |

**قرار يحتاج تأكيد (U-CERT-1):** خطوة «المسجل العام للجامعة» **غير موجودة** في workflow شهادة القيد — الاعتماد **داخل الكلية فقط** (مسجل + عميد آلي). التوقيع على النموذج: **لا** للمسجل العام ولا لنائب الرئيس.

---

### 6.4 `file_withdrawal`

| # | الجهة | موازي | التالي |
|---|-------|-------|--------|
| 1 | الطالب | — | dept_head |
| 2 | رئيس القسم | — | dean |
| 3 | عميد | — | **auto: grade_statement_non_graduate child** |
| 4 | SA (مراجعة + حافظة) | — | **parallel gate** |
| 5a | finance | **parallel_all_required** | gate |
| 5b | library | **parallel_all_required** | gate |
| 5c | labs | **parallel_all_required** | gate |
| 5d | student_activities | **parallel_all_required** | gate |
| 6 | registrar (بعد اكتمال 5a–5d) | — | archive |
| 7 | archive | — | completed |

**Auto-doc:** بعد موافقة العميد → إنشاء **بيان شهادة تقديرات** كـ sub-request/linked artifact (ليس طلباً يدوياً من الطالب).

---

### 6.5 `excused_absence`

| # | الجهة | التالي |
|---|-------|--------|
| 1 | الطالب (+ attachments) | dean |
| 2 | عميد | ✓/✗ → SA fees |
| 3 | SA | حافظة → finance |
| 4 | finance | confirm → registrar |
| 5 | registrar | اعتماد + استمارة | archive |
| 6 | archive | completed |
| 7 | completed | download |

---

### 6.6 `grade_appeal`

| # | الجهة | التالي |
|---|-------|--------|
| 1 | الطالب | SA (fee) |
| 2 | SA | حافظة → finance |
| 3 | finance | confirm → registrar |
| 4 | registrar | اعتماد + إدراج كشف التظلمات | **period_end batch** |
| END | registrar (نهاية الفترة) | **تصدير كشف** جماعي |

**كشف نهاية الفترة:** طالب، مادة، فصل، بيان، حالة سداد، حالة اعتماد.

---

### 6.7 `department_transfer`

| # | الجهة | التالي |
|---|-------|--------|
| 1 | الطالب (+ ثانوية + auto docs) | **target_dept_head** |
| 2 | رئيس القسم **الهدف** | ✓/✗ → dean |
| 3 | عميد | ✓ → **target_dept_equivalency** |
| 4 | رئيس الهدف: **المقاصة UI** | → source_dept_head |
| 5 | رئيس **المحوّل منه** | ✓ → SA |
| 6 | SA | fees → finance |
| 7 | finance | confirm → registrar |
| 8 | registrar | **تحديث dept/program/level** + audit | archive |
| 9 | archive | مقاصة + استمارة + notify | completed |

**Equivalency UI (faculty):** درجات، مقررات مقبولة، درجات معتمدة، مستوى تسكين، ملاحظات.

---

### 6.8 `october_exam_entry_form`

| # | الجهة | التالي |
|---|-------|--------|
| 1 | الطالب | SA (fee) |
| 2 | SA | finance |
| 3 | finance | student_affairs_review |
| 4 | SA review | registrar |
| 5 | registrar | form + archive |
| 6 | archive | student download |
| 7 | completed | — |

**نهاية الفترة:** registrar → export all + **send scoped report to each dept head** (قسمه فقط).

---

## 7. Payment Matrix

| الكود | من يحدد الرسوم | خطوة الحافظة | انتقال للإيرادات | بعد السداد |
|-------|----------------|--------------|------------------|------------|
| enrollment_suspension | مدير شؤون الطلاب | step 3 | step 4 | registrar |
| grade_statement_non_graduate | SA | step 2 | step 3 | grad affairs chain |
| enrollment_certificate | SA | step 2 | step 3 | downstream |
| file_withdrawal | SA | step 4 | parallel finance | gate then registrar |
| excused_absence | SA | step 3 | step 4 | registrar |
| grade_appeal | SA | step 2 | step 3 | registrar |
| department_transfer | SA | step 6 | step 7 | registrar |
| october_exam_entry_form | SA | step 2 | step 3 | SA review |

**قاعدة مُلزمة:** لا `approve` للخطوة التالية التي بعد finance إلا `payment_status=confirmed`.

**Schema لاحق:** `student_request_fee_assessments`, `payment_receipts` link, hafiza id.

---

## 8. Notification Matrix

| الحدث | للطالب | للمعالج | قناة |
|-------|--------|---------|------|
| طلب مُرسَل | ✓ | inbox step owner | in-app + optional email |
| **قيد السداد** | ✓ «توجّه للإيرادات» | — | in-app |
| سداد مؤكد | ✓ | next actor | in-app |
| رفض | ✓ + سبب | — | in-app |
| إرجاع للاستكمال | ✓ | — | in-app |
| اعتماد مرحلي | ✓ (optional) | — | in-app |
| **مكتمل** | ✓ | — | in-app |
| **مستند جاهز** | ✓ download/استلام | — | in-app |
| كشف أكتوبر/تظلم لرئيس قسم | — | dept head faculty inbox | in-app |
| parallel gate متبقي | ✓ (file_withdrawal) | unit owners | in-app |

---

## 9. Document Output Matrix

| المستند | الطلب | ينشئه | يعتمد | يستلمه |
|---------|-------|--------|-------|--------|
| استمارة وقف القيد | enrollment_suspension | registrar + archive | registrar | طالب (download) |
| شهادة تقديرات | grade_statement_non_graduate | college_registrar | dean auto + central refs | طالب (مكتب مسجل) |
| شهادة قيد | enrollment_certificate | college_registrar | dean auto | طالب |
| بيان تقديرات (تابع) | file_withdrawal | **auto** post-dean | — | internal + archive |
| استمارة غياب بعذر | excused_absence | registrar | registrar | طالب |
| كشف التظلمات | grade_appeal | registrar (batch) | — | internal + export |
| وثيقة المقاصة | department_transfer | target dept head UI | both dept heads + registrar | طالب + archive |
| استمارة التحويل | department_transfer | archive/registrar | registrar | طالب |
| استمارة دور أكتوبر | october_exam_entry_form | registrar | registrar | طالب |

**Central signatories (workflow only — not staff_profiles):**

| المرجع | النوع | يُستخدم في |
|--------|------|------------|
| `university_registrar_general` | central_reference | grade_statement |
| `university_vp_student_affairs` | central_reference | grade_statement (توقيع نموذج) |

---

## 10. Archive Matrix

| الكود | ما يُؤرشف | أثر على ملف الطالب |
|-------|-----------|-------------------|
| enrollment_suspension | استمارة + request bundle | enrollment_status=suspended |
| grade_statement_non_graduate | شهادة + request | official_documents row |
| enrollment_certificate | شهادة + request | official_documents row |
| file_withdrawal | ملف كامل + بيان | status withdrawn (registrar) |
| excused_absence | استمارة + attachments | student_excused_absences rows |
| grade_appeal | request + batch export refs | grades appeal flag (later) |
| department_transfer | مقاصة + استمارة | dept/program/level update |
| october_exam_entry_form | استمارة | exam registration record (later) |

---

## 11. Required Import Template Updates

إضافة إلى sheet **Students** (`templates.ts` / `master-templates.ts` — تنفيذ لاحق):

```text
student_study_status, transferred_current_year,
previous_suspension_semesters_count, consecutive_suspension_years_count
```

| العمود | Excel | Validation |
|--------|-------|------------|
| student_study_status | مستجد/باقي أو new/repeat | required for suspension eligibility |
| transferred_current_year | نعم/لا | boolean |
| previous_suspension_semesters_count | integer | ≥0, default 0 |
| consecutive_suspension_years_count | integer | ≥0, default 0 |

**سياسة:** حقول **افتتاحية/انتقالية** — تُستبدل بـ `enrollment_suspension_history` و`student_transfer_events` بعد ≥1 سنة تشغيل.

---

## 12. Required Workflow Engine Capabilities

| Capability | مطلوب لـ | موجود؟ |
|------------|----------|--------|
| خطوات خطية (sequential) | جميع الطلبات | ⚠️ partial (legacy JSON) |
| **parallel_all_required** | file_withdrawal | ❌ |
| steps conditional | dept-specific routing | ❌ |
| **auto document generation** | file_withdrawal, dept_transfer | ❌ |
| fee step | 7/8 requests | ❌ |
| payment confirmation gate | 7/8 | ❌ |
| final report/export | grade_appeal, october | ❌ |
| dept-head scoped inbox | transfer, october export | ⚠️ actor RPC partial |
| dean approval | multiple | ⚠️ |
| **central university signature refs** | grade_statement | ❌ |
| service window (admin) | suspension, absence, appeal, october | ❌ |
| child/sub-request link | file_withdrawal → grade statement | ❌ |
| equivalency UI step | department_transfer | ❌ |
| auto reinstatement job | enrollment_suspension | ❌ |
| student tracking timeline | all | ⚠️ partial |

---

## 13. Required Schema/RPC/UI Changes

### 13.1 موجود حالياً

| العنصر |
|--------|
| `request_types`, `student_requests`, `student_request_attachments` |
| `enrollment_suspension_details` |
| `request_audience`, `ineligible_display_mode` (migration 130000) |
| RPCs: create/submit/list types (140000–190000) |
| `request_processing_units`, `request_type_workflows` (160000–170000) |
| Actor RPCs (180000) |
| `student_excused_absences` (legacy absence_excuse) |
| Document templates: `enrollment_certificate` |

### 13.2 يحتاج تعديل بسيط

| العنصر | التعديل |
|--------|---------|
| `request_types` seed | `requires_attachment` false for suspension; rename absence_excuse |
| `apply_enrollment_suspension_on_approval` | defer to registrar step only |
| `get_available_request_types_for_current_student` | per-type eligibility RPC hooks |

### 13.3 يحتاج migration لاحقاً

| العنصر |
|--------|
| `student_profiles`: 4 import fields |
| `request_type_service_windows` |
| `request_type_appeal_windows` |
| `semesters.exams_start_date` |
| `student_request_fee_assessments` / payment link |
| `workflow_step_parallel_groups` |
| `enrollment_suspension_history`, suspension dates on details |
| Detail tables: `grade_statement_request_details`, `file_withdrawal_details`, `department_transfer_details`, `october_exam_details`, `grade_appeal_details` |
| `central_signatory_references` |
| `student_request_linked_documents` / sub-requests |
| `department_equivalency_records` |

### 13.4 يحتاج UI خاص

| UI |
|----|
| Form renderer per request type |
| Equivalency workspace (faculty dept head) |
| Parallel clearance dashboards (library/labs/activities) |
| Fee/hafiza admin on SA step |
| Document preview/download student |
| October/appeal batch export (registrar) |
| Dept-head scoped report viewer |

### 13.5 يحتاج report/export

| Report |
|--------|
| grade_appeal period-end roster |
| october_exam dept-scoped roster → faculty inbox |
| file_withdrawal clearance status |

### 13.6 يحتاج scheduled job

| Job |
|-----|
| `check_due_reinstatements` (enrollment_suspension) |
| appeal/october period close triggers (optional) |

---

## 14. Traceability Checklist

**Legend:** ✅ مغطى في هذه الوثيقة · ⚙️ يحتاج تنفيذ لاحق

### 14.1 قواعد العرض حسب حالة الطالب

| # | الشرط | مغطى؟ | أين | تنفيذ لاحق؟ |
|---|-------|-------|-----|-------------|
| T-01 | غير خريج يرى طلبات active_student | ✅ | §3 | ⚙️ |
| T-02 | غير خريج يرى graduate باهت/disabled | ✅ | §3 | ⚙️ |
| T-03 | غير خريج لا يقدّم graduate | ✅ | §3 + RPC | ⚙️ |
| T-04 | خريج يرى graduate فقط | ✅ | §3 | ⚙️ |
| T-05 | خريج لا يرى active_student | ✅ | §3 hidden | ⚙️ |
| T-06 | غير نشط: باهت + منع RPC | ✅ | §3 | ⚙️ |
| T-07 | request_audience + ineligible_display_mode | ✅ | §3 | ⚙️ |

### 14.2 enrollment_suspension

| # | الشرط | مغطى؟ | أين | تنفيذ لاحق؟ |
|---|-------|-------|-----|-------------|
| S-01 | كود enrollment_suspension | ✅ | §2 | ⚙️ |
| S-02 | غير خريج فقط | ✅ | §3–4 | ⚙️ |
| S-03 | لا مرفقات | ✅ | §3 | ⚙️ |
| S-04 | لا مستوى أول | ✅ | §4 E-S1 | ⚙️ |
| S-05 | مستوى ≥2 | ✅ | §4 | ⚙️ |
| S-06 | مستجد not باقي | ✅ | §4 + §11 | ⚙️ |
| S-07 | لا تحويل سنوي (قسم/كلية/جامعة) | ✅ | §4 transferred_current_year | ⚙️ |
| S-08 | حدود وقف 2 سنة / 4 فصول | ✅ | §4 + §11 | ⚙️ |
| S-09 | نافذة admin بداية فصل → exams−14d | ✅ | §4 + §12 | ⚙️ |
| S-10 | لا بعد بدء الاختبارات | ✅ | §4 | ⚙️ |
| S-11 | فصل ثاني: لا خيار فصل أول | ✅ | §5 | ⚙️ |
| S-12 | إعادة قيد تلقائية | ✅ | §6.1 + §13.6 | ⚙️ |
| S-13 | حقول استيراد 4 | ✅ | §11 | ⚙️ |
| S-14 | فورم 7 خطوات | ✅ | §5 | ⚙️ |
| S-15 | workflow 8 جهات | ✅ | §6.1 | ⚙️ |
| S-16 | تتبع الطالب | ✅ | §8 + §6 | ⚙️ |

### 14.3 grade_statement_non_graduate

| # | الشرط | مغطى؟ | أين | تنفيذ لاحق؟ |
|---|-------|-------|-----|-------------|
| GS-01 | كود جديد | ✅ | §2 | ⚙️ |
| GS-02 | workflow 9 خطوات | ✅ | §6.2 | ⚙️ |
| GS-03 | 4 توقيعات نموذج | ✅ | §6.2 + §9 | ⚙️ |
| GS-04 | central university roles ليست staff | ✅ | §6.2 + §9 | ⚙️ |
| GS-05 | dean اعتماد آلي | ✅ | §6.2 | ⚙️ |
| GS-06 | إشعار استلام مكتب مسجل | ✅ | §8 | ⚙️ |

### 14.4 enrollment_certificate

| # | الشرط | مغطى؟ | أين | تنفيذ لاحق؟ |
|---|-------|-------|-----|-------------|
| EC-01 | workflow مشابه grade_statement | ✅ | §6.3 | ⚙️ |
| EC-02 | لا توقيع مسجل عام / نائب رئيس | ✅ | §6.3 U-CERT-1 | ⚙️ |
| EC-03 | اعتماد داخل الكلية (مسجل+عميد) | ✅ | §6.3 | ⚙️ |
| EC-04 | **U-CERT-1:** خطوة مسجل عام في workflow؟ | ⚠️ | §6.3 — **NEEDS_USER_INPUT: لا خطوة workflow** | ⚙️ |

### 14.5 file_withdrawal

| # | الشرط | مغطى؟ | أين | تنفيذ لاحق؟ |
|---|-------|-------|-----|-------------|
| FW-01 | workflow كامل | ✅ | §6.4 | ⚙️ |
| FW-02 | parallel_all_required | ✅ | §6.4 + §12 | ⚙️ |
| FW-03 | auto grade statement after dean | ✅ | §6.4 + §9 | ⚙️ |
| FW-04 | لا registrar قبل اكتمال parallel | ✅ | §6.4 | ⚙️ |

### 14.6 excused_absence

| # | الشرط | مغطى؟ | أين | تنفيذ لاحق؟ |
|---|-------|-------|-----|-------------|
| EA-01 | rename from absence_excuse | ✅ | §2 | ⚙️ |
| EA-02 | admin service window | ✅ | §4 + §12 | ⚙️ |
| EA-03 | مواد الفصل الحالي فقط | ✅ | §4–5 | ⚙️ |
| EA-04 | مرفقات إلزامية متعددة | ✅ | §3–5 | ⚙️ |
| EA-05 | workflow | ✅ | §6.5 | ⚙️ |

### 14.7 grade_appeal

| # | الشرط | مغطى؟ | أين | تنفيذ لاحق؟ |
|---|-------|-------|-----|-------------|
| GA-01 | admin toggle timing | ✅ | §4 AP-2 | ⚙️ |
| GA-02 | مواد فصل التظلم المفتوح فقط | ✅ | §4–5 | ⚙️ |
| GA-03 | نتائج ظاهرة | ✅ | §4 AP-4 | ⚙️ |
| GA-04 | كشف نهاية الفترة | ✅ | §6.6 + §13.5 | ⚙️ |

### 14.8 department_transfer

| # | الشرط | مغطى؟ | أين | تنفيذ لاحق؟ |
|---|-------|-------|-----|-------------|
| DT-01 | فورم 8 خطوات | ✅ | §5 | ⚙️ |
| DT-02 | مرفق ثانوية إلزامي | ✅ | §5 | ⚙️ |
| DT-03 | auto docs (كشف حالة + درجات) | ✅ | §5 | ⚙️ |
| DT-04 | workflow + مقاصة | ✅ | §6.7 | ⚙️ |
| DT-05 | equivalency UI | ✅ | §6.7 + §13.4 | ⚙️ |
| DT-06 | تحديث dept/program/level + audit | ✅ | §6.7 | ⚙️ |

### 14.9 october_exam_entry_form

| # | الشرط | مغطى؟ | أين | تنفيذ لاحق؟ |
|---|-------|-------|-----|-------------|
| O-01 | admin window + max courses | ✅ | §4 O-2/O-3 | ⚙️ |
| O-02 | eligibility if exceeds max | ✅ | §4 | ⚙️ |
| O-03 | workflow | ✅ | §6.8 | ⚙️ |
| O-04 | export + dept-head scoped send | ✅ | §6.8 + §13.5 | ⚙️ |

### 14.10 متطلبات عامة

| # | الشرط | مغطى؟ | أين | تنفيذ لاحق؟ |
|---|-------|-------|-----|-------------|
| G-01 | تتبع مرحلة/جهة/تاريخ/إجراء/سداد/مستند/رفض | ✅ | §8 + §6 | ⚙️ |
| G-02 | إشعارات (6+ حالات) | ✅ | §8 | ⚙️ |
| G-03 | رسوم + حافظة + gate | ✅ | §7 | ⚙️ |
| G-04 | أرشفة لكل طلب ينتج مستنداً | ✅ | §10 | ⚙️ |
| G-05 | 9 مستندات ناتجة | ✅ | §9 | ⚙️ |

**نتيجة Checklist:** **100% مغطى في المواصفة** — **0** شرط بدون تغطية؛ **1** يحتاج تأكيد مستخدم (U-CERT-1).

---

## 15. Recommended Implementation Phases

| Phase | الاسم | المخرج |
|-------|------|--------|
| **P0** | **Gap Audit** | تقرير diff: spec vs code/migrations لكل §13 |
| **P1** | Schema/RPC Foundations | service windows, fees, parallel groups, import fields, detail tables |
| **P2** | Code Normalization | absence_excuse→excused_absence; register 3 new types |
| **P3** | Admin Request Setup UI | `/admin/request-types` + workflow builder |
| **P4** | Student Form Renderer | per-type forms from `form_schema` |
| **P5** | Workflow Runtime v2 | sequential + parallel + payment gates |
| **P6** | Payment/Hafiza Integration | finance confirm RPC |
| **P7** | Document Generation | templates + auto child docs |
| **P8** | Reports/Exports | appeal + october batch |
| **P9** | Per-Request Rollout | 1 type at a time: suspension → certificate → … |
| **P10** | Reinstatement + History | jobs; replace import fields |

---

## 16. No-Write Assurance

* لا DB writes
* لا migrations applied
* لا Supabase apply
* لا Lovable publish
* لا UI/server code changes
* لا seed
* لا commit / push / PR

**الكتابة الوحيدة:** هذا الملف.

---

## Appendix A — Student Tracking (All Requests)

كل طلب **يجب** أن يعرض في `/student/requests/$id`:

| عنصر | مصدر |
|------|------|
| المرحلة الحالية | `student_request_workflow_steps` / legacy steps |
| الجهة الحالية | step → processing_unit |
| Timeline | `student_request_workflow_events` |
| إجراء مطلوب من الطالب | step metadata (payment, resubmit) |
| مبلغ مطلوب | fee assessment |
| مستند قابل للتحميل | linked documents |
| سبب الرفض | request.rejection_reason |

---

## Appendix B — Open Decisions (NEEDS_USER_INPUT)

| ID | السؤال | توصية spec |
|----|--------|------------|
| U-CERT-1 | هل workflow شهادة القيد يمر بالمسجل العام؟ | **لا** — داخلي كلية فقط |
| U-SUSP-1 | «سنتان متتاليتان» = full_year×2 أم أي وقفين متتاليين؟ | يُحدد في gap audit مع الشؤون الأكاديمية |
| U-OCT-1 | تعريف «مواد راسبة/متبقية» | failed grades + remaining requirements RPC |
