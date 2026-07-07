# STUDENT-REQUESTS-WORKFLOW-GAP-AUDIT-01-REPORT

**التاريخ:** 2026-07-07  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**النوع:** Gap Audit — spec vs codebase  
**المواصفة المرجعية:** `docs/STUDENT-REQUESTS-WORKFLOW-CANONICAL-SPEC-01.md`

---

## 1. Executive Summary

| البند | القرار |
|-------|--------|
| **القرار** | **READY_FOR_P1_FOUNDATIONS** |
| **نطاق التدقيق** | 8 أنواع طلبات معتمدة |
| **U-CERT-1** | **مُعتمد رسمياً** — شهادة القيد داخل الكلية فقط |
| **U-SUSP-1** | **NEEDS_USER_INPUT** |
| **U-OCT-1** | **NEEDS_USER_INPUT** |
| **هل يمكن بدء أول migration آمن؟** | **نعم** — P1 foundations additive فقط (بدون seed/cutover) |

### ملخص الفجوات الكبرى

- **4/8** أكواد غير جاهزة canonical: 3 أنواع مفقودة بالكامل (`grade_statement_non_graduate`, `file_withdrawal`, `october_exam_entry_form`) + كود legacy `absence_excuse` ≠ `excused_absence`.
- **Workflow مزدوج:** legacy JSON (`workflow_schema` + `student_service_request_steps`) هو المسار الفعلي في `src/lib/student-affairs.functions.ts`؛ الجداول/RPCs الجديدة (migrations `20260710160000`–`20260710190000`) موجودة **schema-only بدون seed ولا cutover**.
- **لا** parallel gates، fee/hafiza، payment confirmation gate، auto-document generation، scheduled reinstatement.
- **UI:** فورم generic (`subject`/`details` فقط) في `src/routes/student.requests.new.tsx`؛ لا inbox للمعالجين في `/staff` أو `/faculty-portal`.
- **Import:** حقول الأهلية الافتتاحية لوقف القيد **غير موجودة** في `templates.ts` / `validators.ts` / `student_profiles`.

---

## 2. Source of Truth

| المصدر | المسار |
|--------|--------|
| المواصفة الملزمة | `docs/STUDENT-REQUESTS-WORKFLOW-CANONICAL-SPEC-01.md` |
| تصميم وقف القيد | `docs/STUDENT-REQUEST-ENROLLMENT-SUSPENSION-DESIGN-01.md` |

### اعتماد U-CERT-1 (رسمي — يُطبَّق في التنفيذ)

**`enrollment_certificate` workflow المعتمد بعد Gap Audit:**

| # | الجهة | الإجراء | التالي |
|---|-------|---------|--------|
| 1 | الطالب | تقديم | مدير إدارة شؤون الطلاب |
| 2 | مدير إدارة شؤون الطلاب | تحقق + رسوم + حافظة | الإيرادات والمالية |
| 3 | الإيرادات والمالية | تأكيد سداد | عميد الكلية (**اعتماد آلي**) |
| 4 | عميد الكلية | اعتماد آلي | مسجل الكلية |
| 5 | مسجل الكلية | طباعة/إصدار | الأرشيف |
| 6 | الأرشيف | أرشفة + إشعار | مكتمل |

**مستبعد صراحة:**

- المسجل العام للجامعة — **لا خطوة workflow ولا توقيع نموذج**.
- نائب رئيس الجامعة لشؤون الطلاب — **لا خطوة workflow ولا توقيع نموذج**.

> **ملاحظة:** `grade_statement_non_graduate` يبقى يحتاج جهات مركزية (مسجل عام + نائب رئيس) كـ `central_signatory_references` فقط — خارج نطاق شهادة القيد.

---

## 3. Current System Inventory

### 3.1 Request Types (seed / DB)

**Migration seed:** `supabase/migrations/20260706120000_student_service_requests_workflow.sql`

| الكود في DB | الاسم | `request_audience` | ملاحظة |
|-------------|-------|-------------------|--------|
| `enrollment_suspension` | وقف القيد | default `active_student` | workflow legacy 6 خطوات |
| `enrollment_certificate` | شهادة قيد | default | workflow legacy 2 خطوات |
| `absence_excuse` | عذر غياب | default | ≠ canonical `excused_absence` |
| `grade_appeal` | تظلم | default | workflow legacy 5 خطوات |
| `transfer` | تحويل | default | ≠ canonical `department_transfer` |
| `enrollment_reinstatement` | إعادة قيد | default | خارج نطاق الـ 8 |
| `extra_chance` | فرصة إضافية | default | خارج النطاق |
| + أنواع أخرى | official transcript, etc. | — | خارج النطاق |

**غير موجود في seed:** `grade_statement_non_graduate`, `file_withdrawal`, `october_exam_entry_form`, `excused_absence`.

**حقول audience/display:** migration `20260710130000_student_request_types_audience_rpc_rls.sql` — أعمدة `request_audience`, `ineligible_display_mode` على `request_types`؛ RPC `get_available_request_types_for_current_student` يطبّق hidden/disabled حسب حالة profile.

### 3.2 Workflow Tables

| الجدول | Migration | حالة |
|--------|-----------|------|
| `student_service_request_steps` | `20260706120000` | **legacy runtime — مستخدم** |
| `student_service_request_events` | `20260706120000` | **legacy runtime — مستخدم** |
| `request_processing_units` | `20260710160000` | schema فقط — **بدون seed** |
| `request_processing_roles` | `20260710160000` | schema فقط |
| `request_processing_role_assignments` | `20260710160000` | schema فقط |
| `request_type_workflows` | `20260710170000` | schema فقط — **بدون active config** |
| `request_type_workflow_steps` | `20260710170000` | schema — `requires_payment`, `produces_document` flags |
| `request_type_workflow_transitions` | `20260710170000` | schema |
| `student_request_workflow_steps` | `20260710170000` | runtime جديد — **فارغ عملياً** |
| `student_request_workflow_events` | `20260710170000` | runtime جديد — **فارغ عملياً** |

### 3.3 Detail Tables

| الجدول | الطلب | ملاحظة |
|--------|-------|--------|
| `enrollment_suspension_details` | `enrollment_suspension` | duration/year/semester/reason |
| `absence_excuse_details` | `absence_excuse` | legacy single-course model |
| `student_excused_absences` | post-approval effect | `20260625150000` |
| `grade_appeal_details` | `grade_appeal` | SR-C1 migrations |
| `transfer_request_details` | `transfer` | alias لـ `department_transfer` |

### 3.4 RPCs (student requests)

| RPC | Migration | حالة |
|-----|-----------|------|
| `get_available_request_types_for_current_student` | `20260710140000` | audience فقط — لا per-type eligibility |
| `create_student_request` | `20260710140000` | |
| `submit_student_request` | `20260710190000` | + `initialize_student_request_workflow` |
| `initialize_student_request_workflow` | `20260710190000` | no-op إذا لا active workflow |
| `get_my_student_requests` | `20260710140000` | |
| `get_my_request_actor_inbox` | `20260710180000` | **لا UI مستهلك** |
| `act_on_student_request_step` | `20260710180000` | linear transitions فقط |
| `admin_get_request_workflow_config` | `20260710180000` | read-only |
| `admin_save_request_workflow_config` | — | **DEFERRED** (`20260710180000` comment) |
| `apply_enrollment_suspension_on_approval` | `20260601001137` | trigger عند `approved` — **مبكر** vs spec |
| `apply_absence_excuse_on_approval` | `20260625150000` | |
| `apply_grade_appeal_on_approval` | `20260625120000` | |
| `issue_official_document` | `20260601034915` | manual admin — ليس workflow-linked |

### 3.5 Admin Workflow UI

| المسار | الملف | حالة |
|--------|-------|------|
| `/admin/request-types` | `src/routes/admin/request-types.tsx` | CRUD basic — لا audience editor |
| `/admin/request-types/$id/workflow` | `src/routes/admin/request-types.$id.workflow.tsx` | read UI؛ save معطّل |
| Save flag | `src/lib/admin-request-workflow-rpc.ts` | `ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE = false` |

### 3.6 Student Request Forms

| المسار | الملف | حالة |
|--------|-------|------|
| `/student/requests/new` | `src/routes/student.requests.new.tsx` | generic `formData: { subject, details }` |
| `/student/requests/$id` | `src/routes/student.requests.$id.tsx` | legacy events/steps display |
| Legacy (deprecated) | `src/components/portal/StudentRequestsSection.tsx` | per-type modals + direct DB |

### 3.7 Imports / Templates

| الملف | محتوى relevant |
|-------|----------------|
| `src/lib/imports/templates.ts` | Students sheet — **لا** حقول suspension |
| `src/lib/imports/validators.ts` | StudentRow — **لا** حقول suspension |
| `src/lib/imports/engine.server.ts` | mapping إلى `student_profiles` — **لا** حقول جديدة |

### 3.8 Payment / Fees

| العنصر | حالة |
|--------|------|
| `student_request_fee_assessments` | ❌ غير موجود |
| Hafiza link on request | ❌ |
| `student_payments` / `payment_receipts` | ⚠️ موجودة في finance module — **لا ربط بطلب** |
| `requires_payment` on workflow steps | ⚠️ column فقط — لا runtime |

### 3.9 Document / Archive

| العنصر | حالة |
|--------|------|
| `official_documents` + `issue_official_document` | ⚠️ manual admin path |
| `DocumentTemplates.tsx` | ⚠️ template UI — enrollment_certificate label |
| Workflow-linked document generation | ❌ |
| Archive step in workflow engine | ❌ |

### 3.10 Staff / Faculty Roles

`src/lib/staff-functional-roles.ts` — يغطي: `registrar_general`, `student_affairs_manager`, `graduate_affairs_manager`, `archive_officer`, `revenue_finance_officer`, `library_officer`, labs roles.

**فجوات:** لا `student_activities` role؛ library/labs `appRoleFallback: null` (login blocked).

---

## 4. Request Code Gap Matrix

| # | الكود المعتمد | موجود في DB/seed | كود legacy | workflow seed (legacy JSON) | الإجراء المطلوب |
|---|---------------|------------------|------------|----------------------------|-----------------|
| 1 | `enrollment_suspension` | ✅ | — | 6 خطوات ≠ spec 8 | إعادة seed workflow + eligibility RPC |
| 2 | `grade_statement_non_graduate` | ❌ | — | — | **INSERT type + detail table + workflow + central refs** |
| 3 | `enrollment_certificate` | ✅ | — | 2 خطوات registrar→SA | **إعادة seed** per U-CERT-1 (6 خطوات داخلية) |
| 4 | `file_withdrawal` | ❌ | — | — | **INSERT type + parallel workflow + auto-doc** |
| 5 | `excused_absence` | ❌ | ✅ `absence_excuse` | 4 خطوات dean→… | **rename/migrate code** + workflow + multi-attach |
| 6 | `grade_appeal` | ✅ | — | 5 خطوات dept→faculty→dean | إعادة seed (SA fee first) + appeal windows |
| 7 | `department_transfer` | ⚠️ seed as `transfer` | `transfer` + `transfer_request_details` | 7 خطوات admission-centric | alias normalize + equivalency UI + workflow |
| 8 | `october_exam_entry_form` | ❌ | — | — | **INSERT type + detail + admin max config** |

**FK normalization:** `student_requests_type_request_types_code_fk` marked NOT VALID in `20260710130000` — يحتاج code normalization قبل `VALIDATE CONSTRAINT`.

---

## 5. Eligibility Gap Matrix

| الكود | قواعد Spec | موجود في الكود | RPC / mechanism | الحالة |
|-------|------------|----------------|-----------------|--------|
| **enrollment_suspension** | E-S1: مستوى ≥2 | ❌ | — | ❌ |
| | E-S2: `student_study_status=new` | ❌ (no column) | — | ❌ |
| | E-S3: `transferred_current_year=false` | ❌ | — | ❌ |
| | E-S4: وقف سابق ≤ limits | ❌ | — | ❌ |
| | E-S5–E-S6: service window + قبل exams | ❌ | — | ❌ |
| | E-S7: لا طلب مفتوح | ⚠️ partial | `validate_enrollment_suspension_request` | ⚠️ |
| | E-S8–E-S9: غير موقوف + active enrollment | ⚠️ partial | same validator | ⚠️ |
| **grade_statement_non_graduate** | G-1…G-4: active, non-graduate | ⚠️ audience only | `student_request_type_is_eligible` | ⚠️ |
| **enrollment_certificate** | C-1…C-3 | ⚠️ audience only | same | ⚠️ |
| **file_withdrawal** | W-1…W-4 | ❌ | — | ❌ |
| **excused_absence** | A-1: active_student | ⚠️ audience | — | ⚠️ |
| | A-2: admin service window | ❌ | — | ❌ |
| | A-3: مواد الفصل الحالي | ❌ | legacy single course | ❌ |
| | A-4: enrollment active | ❌ | — | ❌ |
| **grade_appeal** | AP-1: admin toggle | ❌ | — | ❌ |
| | AP-2: فصل التظلم المفتوح | ❌ | — | ❌ |
| | AP-3–AP-4: مواد + نتائج ظاهرة | ❌ | — | ❌ |
| **department_transfer** | T-1…T-4 | ❌ | — | ❌ |
| **october_exam_entry_form** | O-1: active | ⚠️ audience | — | ⚠️ |
| | O-2: admin window | ❌ | — | ❌ |
| | O-3: failed/remaining ≤ max | ❌ | **U-OCT-1** | ❌ |
| | O-4: enrollment active | ❌ | — | ❌ |

**RPC حالي (`20260710140000`):** `student_request_type_is_eligible` + `assert_student_can_use_request_type` — **حالة profile فقط** (`active`/`graduated`)، لا `enrollment_status` ولا level ولا service windows.

### Audience / Display (خريج vs غير خريج)

| Rule | Spec | Code | الحالة |
|------|------|------|--------|
| `active_student` + graduate → hidden | ✅ | `get_available_request_types_for_current_student` | ✅ |
| `graduate` + non-graduate → disabled | ✅ | same RPC | ✅ |
| inactive academic → disabled backend | ✅ spec | ⚠️ partial — UI only for some | ⚠️ |

---

## 6. Import Template Gap Matrix

| الحقل | Spec §11 | `templates.ts` | `validators.ts` | `student_profiles` (types.ts) | الإجراء |
|-------|----------|----------------|-----------------|------------------------------|---------|
| `student_study_status` | ✅ | ❌ | ❌ | ❌ | migration + template + validation |
| `transferred_current_year` | ✅ | ❌ | ❌ | ❌ | migration + template + validation |
| `previous_suspension_semesters_count` | ✅ | ❌ | ❌ | ❌ | migration + template + validation |
| `consecutive_suspension_years_count` | ✅ | ❌ | ❌ | ❌ | migration + template + validation |

**ملفات للتحديث لاحقاً (بعد migration):** `src/lib/imports/templates.ts`, `src/lib/imports/validators.ts`, `src/lib/imports/engine.server.ts`, `src/lib/imports/master-templates.ts`.

---

## 7. Workflow Engine Gap Matrix

| Capability | Spec requirement | Legacy runtime | New runtime (`190000`) | Gap |
|------------|------------------|----------------|------------------------|-----|
| Sequential steps | all 8 types | ✅ `workflow_schema` JSON in `student_requests` | ✅ schema + `act_on_student_request_step` | ⚠️ **dual path — no cutover** |
| Approve/reject | all | ✅ legacy role_key steps | ✅ RPC actions | ⚠️ no UI inbox |
| `parallel_all_required` | `file_withdrawal` | ❌ | ❌ no `workflow_step_parallel_groups` | ❌ |
| Conditional routing | dept target/source | ❌ | ⚠️ strategy columns partial | ❌ |
| `auto_document` | FW, DT | ❌ | ⚠️ `produces_document` flag only | ❌ |
| Fee assessment step | 7/8 types | ❌ | ⚠️ `requires_payment` column | ❌ |
| Payment confirmation gate | post-finance | ❌ | ❌ not in `act_on_student_request_step` | ❌ |
| Archive step | all producing docs | ❌ | ❌ | ❌ |
| Document output pipeline | 9 docs | ❌ | ❌ | ❌ |
| Final report/export | appeal, october | ❌ | ❌ | ❌ |
| Central signatory refs | grade_statement | ❌ | ❌ | ❌ |
| Service windows | suspension, absence, appeal, october | ❌ | ❌ | ❌ |
| Child/sub-request link | file_withdrawal → grade statement | ❌ | ❌ | ❌ |
| Equivalency UI step | department_transfer | ❌ | ❌ | ❌ |
| Scheduled reinstatement | enrollment_suspension | ❌ (manual `enrollment_reinstatement` type exists) | ❌ | ❌ |
| Student tracking timeline | all | ⚠️ partial legacy events | ⚠️ tables empty | ⚠️ |

**Dual runtime risk:** `submitStudentServiceRequest` (`src/lib/student-affairs.functions.ts`) يستدعي `rpcSubmitStudentRequest` **و** `initializeSteps` على `student_service_request_steps`؛ بينما RPC يستدعي `initialize_student_request_workflow` على جداول جديدة **فارغة** (no active workflow config).

---

## 8. Actor / Role Gap Matrix

| الجهة (Spec) | processing_unit key | staff-functional-roles | Legacy `role_key` | Actor RPC | Staff/Faculty UI |
|--------------|---------------------|------------------------|-------------------|-----------|------------------|
| الطالب | — | — | — | owner RPCs | ✅ `/student/requests` |
| رئيس القسم (مصدر/هدف) | `department_chair` | faculty positions | `department_head` | `is_current_user_department_head_for_student` | ⚠️ admin inbox only |
| عميد الكلية | `dean` | dean position | `dean` | `is_current_user_dean_for_student` | ⚠️ |
| مدير إدارة شؤون الطلاب | `student_affairs` | `student_affairs_manager` | `student_affairs` | assignments table **empty** | ❌ |
| مختص شؤون الطلاب | `student_affairs` | `student_affairs_specialist` | — | assignments empty | ❌ |
| مدير شؤون الخريجين | `graduate_affairs` | `graduate_affairs_manager` | maps to SA | ❌ dedicated | ❌ |
| الإيرادات والمالية | `finance` | `revenue_finance_officer` | `finance_officer` | partial | ❌ |
| مسجل الكلية | `registrar` | `registrar_general` | `registrar` | `is_current_user_registrar` | ⚠️ admin |
| الأرشيف | `archive` | `archive_officer` | — | ❌ | ❌ |
| مسؤول المكتبة | `library` | `library_officer` (**no app_role**) | — | ❌ | ❌ |
| مسؤول المعامل | `labs` | labs roles (**no app_role**) | — | ❌ | ❌ |
| مسؤول الأنشطة الطلابية | `student_activities` | ❌ **not in STAFF_FUNCTIONAL_ROLES** | org ref only | ❌ | ❌ |
| المسجل العام للجامعة | central ref | N/A | — | ❌ | ❌ central_reference |
| نائب رئيس الجامعة | central ref | N/A | — | ❌ | ❌ central_reference |

**Legend:** ✅ = representable today · ⚠️ = partial · ❌ = missing

---

## 9. Payment / Hafiza Gap Matrix

| البند | Spec §7 | موجود | فجوة |
|-------|---------|--------|------|
| من يحدد الرسوم | مدير شؤون الطلاب (per type step) | ❌ | لا RPC `set_request_fee_assessment` |
| أين تُخزَّن الرسوم | `student_request_fee_assessments` | ❌ | جدول غير موجود |
| إنشاء حافظة سداد | hafiza ID on request | ❌ | — |
| انتقال للإيرادات | step routing to `finance` unit | ⚠️ | legacy role_key فقط |
| تأكيد السداد | finance officer RPC | ❌ | — |
| gate قبل الخطوة التالية | `payment_status=confirmed` | ❌ | `act_on_student_request_step` لا يفحص |
| إشعار «قيد السداد» | required | ⚠️ | generic notifications فقط |
| ربط `student_payments` | required | ⚠️ tables exist | **no FK to student_requests** |

---

## 10. Form Renderer Gap Matrix

| الكود | حقول Spec | UI حالي | Detail table | Attachments | Special UI |
|-------|-----------|---------|--------------|-------------|------------|
| enrollment_suspension | duration, period, reason, ack | generic + deprecated modal | `enrollment_suspension_details` | لا | eligibility panel |
| grade_statement_non_graduate | snapshot, ack | — | ❌ | لا | — |
| enrollment_certificate | snapshot, purpose, ack | generic | ❌ | لا | — |
| file_withdrawal | snapshot, reason, ack | — | ❌ | لا | — |
| excused_absence | courses (current sem), desc, multi-attach, ack | legacy single course | `absence_excuse_details` | ⚠️ single | course picker |
| grade_appeal | semester, courses (filtered), statement | legacy | `grade_appeal_details` | لا | appeal window filter |
| department_transfer | dept/program RO, target pick, secondary img, ack | legacy `transfer` | `transfer_request_details` | ⚠️ partial | exclude current dept |
| october_exam_entry_form | snapshot, failed/remaining RO | — | ❌ | لا | max courses gate |

**Active student path:** `student.requests.new.tsx` — `formData: { subject, details }` only for all types.

---

## 11. Document Output / Archive Gap Matrix

| # | المستند | الطلب | Spec creator | Generator موجود | Storage | Student download | Archive | يحتاج تصميم |
|---|---------|-------|--------------|-----------------|---------|------------------|---------|-------------|
| 1 | استمارة وقف القيد | enrollment_suspension | registrar+archive | ❌ | ❌ | ❌ | ❌ | ✅ |
| 2 | شهادة تقديرات | grade_statement_non_graduate | college_registrar + central | ❌ type missing | ❌ | ❌ | ❌ | ✅ |
| 3 | شهادة قيد | enrollment_certificate | college_registrar | ⚠️ manual `issue_official_document` | ⚠️ `official_documents` | ⚠️ | ❌ workflow | ✅ |
| 4 | بيان تقديرات (auto) | file_withdrawal | auto post-dean | ❌ | ❌ | ❌ | ❌ | ✅ |
| 5 | استمارة غياب بعذر | excused_absence | registrar | ❌ PDF | ⚠️ DB effect only | ❌ | ❌ | ✅ |
| 6 | كشف التظلمات | grade_appeal | registrar batch | ❌ | ❌ | ❌ | ❌ | ✅ |
| 7 | وثيقة المقاصة | department_transfer | target dept head | ❌ | ❌ | ❌ | ❌ | ✅ |
| 8 | استمارة التحويل | department_transfer | archive/registrar | ❌ | ❌ | ❌ | ❌ | ✅ |
| 9 | استمارة دور أكتوبر | october_exam_entry_form | registrar | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 12. Reports / Exports Gap Matrix

| Report | Spec reference | Code found | Gap |
|--------|----------------|------------|-----|
| كشف التظلمات (نهاية الفترة) | §6.6 | `src/routes/admin/reports.tsx` — label `grade_appeal` only | ❌ no export RPC |
| كشف دور أكتوبر (scoped per dept head) | §6.8 | — | ❌ |
| إرسال لرئيس القسم via faculty portal | §6.8 | `src/routes/faculty-portal.index.tsx` — no request inbox | ❌ |
| Excel/PDF export | implied | admin reports generic | ❌ per-type |
| file_withdrawal parallel clearance status | §6.4 | — | ❌ |

---

## 13. Scheduled Jobs Gap Matrix

| Job | Spec | Code | Recommendation |
|-----|------|------|----------------|
| Auto reinstatement after suspension end | §6.1, §12 | ❌ — exists manual `enrollment_reinstatement` request type (`20260625120100`) | **Scheduled job** `check_due_reinstatements` daily — safer than manual request |
| Appeal period close → batch export | §6.6 | ❌ | RPC admin trigger at period end (job optional) |
| October registration close → dept reports | §6.8 | ❌ | RPC admin trigger + scoped send |

**أول تصميم آمن:** migration table `enrollment_suspension_schedule` (start/end dates on approval) + pg_cron or edge scheduled function calling SECURITY DEFINER RPC — **لا** side effects في P1.

---

## 14. Security / RLS Gap Notes

| Area | Observation | Risk |
|------|-------------|------|
| New workflow tables | RLS enabled, **no policies** — access via SECURITY DEFINER RPCs | Medium — OK if all paths go through RPCs |
| Legacy steps/events | Broad SELECT for participant roles | Medium |
| `student_requests` FK NOT VALID | orphan codes possible | High until P2 normalization |
| Dual write paths | Legacy direct UPDATE in `student-affairs.functions.ts` vs RPC actor path | **High — inconsistent auth** |
| Eligibility bypass | Generic form accepts any eligible type code — no server-side per-type validation on create | **High** |
| Attachments | `get_student_request_detail_for_actor` returns `attachments: []` — deferred | Medium |
| Library/labs actors | No `app_role` — cannot authenticate for parallel gates | **Blocker for file_withdrawal** |
| Early suspension trigger | `apply_enrollment_suspension_on_approval` fires on `approved` not registrar step | Medium — premature status change |
| Audit logging | workflow events table exists but empty | Low until runtime cutover |

---

## 15. First Safe Implementation Slice (P1 — proposal only)

**Name:** `P1-FOUNDATIONS-01`  
**Safe because:** additive schema only; no seed; no legacy cutover; no UI changes; no `routeTree.gen.ts`.

### P1 migration bundle (ordered)

1. **`student_profiles` columns:** `student_study_status`, `transferred_current_year`, `previous_suspension_semesters_count`, `consecutive_suspension_years_count` (CHECK + defaults).
2. **`request_type_service_windows`** — admin-configurable open/close per request type.
3. **`request_type_appeal_windows`** — semester + open/close for grade appeals.
4. **`semesters.exams_start_date`** (nullable) — suspension window rule E-S5/E-S6.
5. **`student_request_fee_assessments`** — amount, currency, hafiza_ref, status; FK to `student_requests`.
6. **`workflow_step_parallel_groups`** + `parallel_group_id` on `request_type_workflow_steps`.
7. **`central_signatory_references`** — for `grade_statement_non_graduate` only (not enrollment_certificate per U-CERT-1).
8. **Stub detail tables** (empty schema): `grade_statement_request_details`, `file_withdrawal_details`, `october_exam_details` (no seed rows).
9. **RPC stubs:** `assert_student_eligible_enrollment_suspension`, hooks wired from `create_student_request` / `submit_student_request` / `get_available_request_types_for_current_student` — **fail-closed** with Arabic messages.

### Explicitly OUT of P1

- Rename `absence_excuse` → `excused_absence`
- Register missing request types in seed
- Activate `request_type_workflows` seed data
- Enable `admin_save_request_workflow_config`
- Import template updates (after column migration lands)
- Legacy runtime cutover

---

## 16. Recommended Phases

| Phase | Scope | Key deliverables |
|-------|-------|------------------|
| **P1** | Foundations schema/RPC stubs | §15 bundle |
| **P2** | Code normalization | `excused_absence`, register 3 missing types, VALIDATE FK, deactivate out-of-scope types from student portal |
| **P3** | Admin request config | seed processing units/roles/assignments, `admin_save_request_workflow_config`, workflow builder save |
| **P4** | Student form renderer | per-type forms from `form_schema`; multi-attach; course pickers |
| **P5** | Workflow runtime v2 | cutover to `student_request_workflow_*`; deprecate legacy init in `student-affairs.functions.ts` |
| **P6** | Payment/Hafiza | fee RPC + finance confirmation gate in `act_on_student_request_step` |
| **P7** | Documents/Archive | templates + auto child doc for `file_withdrawal`; archive step |
| **P8** | Reports/exports + jobs | appeal/october batch exports; `check_due_reinstatements`; per-request rollout |

### Per-request rollout order (post-P5)

1. `enrollment_certificate` — simplest internal workflow (U-CERT-1 closed)
2. `grade_appeal` — fee + registrar batch
3. `excused_absence` — rename + service window + multi-attach
4. `enrollment_suspension` — full eligibility + reinstatement job
5. `october_exam_entry_form` — needs U-OCT-1
6. `department_transfer` — equivalency UI
7. `grade_statement_non_graduate` — central signatories
8. `file_withdrawal` — parallel gates (last — most dependencies)

---

## 17. Risks / Blockers

| # | Blocker | Severity | Mitigation |
|---|---------|----------|------------|
| 1 | **Dual runtime** — divergent state on submit | High | P5 cutover plan; disable legacy init after seed |
| 2 | **No processing unit seed** — actor inbox empty | High | P3 before staff inbox UI |
| 3 | **Library/labs/student_activities app_role gap** | High | enum expansion before `file_withdrawal` |
| 4 | **U-SUSP-1 unresolved** — consecutive year definition | Medium | confirm with academic affairs before suspension RPC |
| 5 | **U-OCT-1 unresolved** — failed/remaining courses definition | Medium | confirm before october type |
| 6 | **Early suspension trigger** — status change before registrar | Medium | move trigger to registrar step in P5 |
| 7 | **Migrations 130000–190000 unapplied in staging** | Medium | apply + verify before UI work |
| 8 | **FK NOT VALID** on request_type codes | Medium | P2 normalization |

---

## 18. No-Write Assurance

هذا التدقيق **لم ينفّذ:**

- migrations apply / DB writes / seed
- تعديل UI / RPC / src (عدا هذا التقرير)
- commit / push / PR
- `src/routeTree.gen.ts`

**الكتابة الوحيدة:** `docs/STUDENT-REQUESTS-WORKFLOW-GAP-AUDIT-01-REPORT.md`

---

## Appendix — Git Check (post-report)

```
git status --short
git diff --check
```

*(يُحدَّث بعد إنشاء الملف — انظر §19)*

---

## 19. Post-Create Verification

```
git status --short
 M src/routeTree.gen.ts
?? docs/STUDENT-REQUEST-ENROLLMENT-SUSPENSION-DESIGN-01.md
?? docs/STUDENT-REQUESTS-WORKFLOW-CANONICAL-SPEC-01.md
?? docs/STUDENT-REQUESTS-WORKFLOW-GAP-AUDIT-01-REPORT.md

git diff --check
warning: in the working copy of 'src/routeTree.gen.ts', LF will be replaced by CRLF the next time Git touches it
```

**نتيجة:** PASS — لا أخطاء whitespace؛ `src/routeTree.gen.ts` معدّل محلياً و**لم يُضمَّ** لهذا التقرير.
