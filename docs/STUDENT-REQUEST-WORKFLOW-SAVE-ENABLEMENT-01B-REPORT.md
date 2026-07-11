# STUDENT-REQUEST-WORKFLOW-SAVE-ENABLEMENT-01B

## القرار

`PASS_STUDENT_REQUEST_WORKFLOW_SAVE_REFRESH_REMEDIATION_READY_FOR_FINAL_REVIEW`

(السابق: `PASS_STUDENT_REQUEST_WORKFLOW_SAVE_ENABLEMENT_REMEDIATION_READY_FOR_REREVIEW`)

---

## سبب التفعيل

بعد دمج PR #115 وتطبيق migrations على الإنتاج:

- `20260711040000_enrollment_certificate_workflow_foundation_01a.sql`
- `20260711050000_enrollment_certificate_workflow_round3_hardening.sql`

تم التحقق من وجود RPCs:

- `admin_save_request_workflow_config`
- `assess_student_request_fee`
- `confirm_student_request_fee_payment`
- `get_student_request_fee_processing_context`

على Supabase ref: `wpmicqriltrowwonknox`

لذلك أصبح من الآمن تفعيل علم الواجهة:

`ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE = true`

---

## البيئة

| البند | القيمة |
|-------|--------|
| Repository | `msorori-mh/saba-uni-portal` |
| Base | `origin/main` @ `ca3f73c` (يشمل merge `ec371a8` #115) |
| Branch | `feature/student-request-workflow-save-enablement-01b` |
| PR | [#117](https://github.com/msorori-mh/saba-uni-portal/pull/117) |
| Worktree | `C:\projects\saba-uni-portal-workflow-save-01b` |

---

## الملفات المعدّلة (01B + remediation)

| الملف | التغيير |
|-------|---------|
| `src/lib/admin-request-workflow-rpc.ts` | تفعيل العلم + عقود قراءة موسّعة + `mergeWorkflowStepPaymentDocumentFlags` |
| `src/lib/admin-request-workflow.functions.ts` | إثراء خطوات من `request_type_workflow_steps` بعد GET RPC |
| `src/lib/student-requests/request-workflow-editor-mappers.ts` | mappers + `selectWorkflowForEditor` (جديد) |
| `src/lib/student-requests/request-workflow-save-contract.ts` | رسالة capability بعد التفعيل |
| `src/routes/admin/request-types.$id.workflow.tsx` | `selectedWorkflowId` + round-trip mappers + حماية المسودة |
| `tests/student-requests/enrollment-certificate-workflow-foundation.test.ts` | 01B + اختبارات round-trip |
| `docs/STUDENT-REQUEST-WORKFLOW-SAVE-ENABLEMENT-01B-REPORT.md` | هذا التقرير |

---

## سلوك الحفظ

- **حفظ كمسودة:** `status=draft`, `is_active=false` — لا يفعّل تلقائيًا.
- **حفظ وتفعيل:** يتطلب Dry Run ناجحًا؛ `status=active`, `is_active=true`.
- أثناء `saveLoading` تُعطّل أزرار الحفظ.
- عند خطأ RPC (function_not_found / schema cache): رسالة عربية مؤقتة، **بدون** retry تلقائي، **بدون** مسح مسودة المحرر.
- حماية `if (!ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE)` داخل `rpcAdminSaveRequestWorkflowConfig` **باقية**.
- فتح الصفحة لا يستدعي حفظًا ولا يكتب على قاعدة البيانات بسبب العلم.

---

## PR #117 remediation — round-trip integrity

### سبب المشكلة

مسار `load → edit/no-op → save` كان يفقد حقولًا لأن:

1. عقد قراءة الخطوات/الانتقالات لم يشمل كل حقول عقد الحفظ.
2. محوّلات الصفحة (`configToDraft*`) أسقطت flags و`label_ar` والشروط واستبدلتها ضمنيًا بقيم افتراضية عند إعادة الحفظ عبر RPC.
3. بعد حفظ مسودة، إعادة التحميل كانت تفضّل الـ active workflow بدل الإصدار المحفوظ للتو.

### الحقول التي كان يمكن فقدها

**خطوات:** `assignment_strategy`, `is_required`, `notify_on_complete`, `requires_payment`, `produces_document`, وبقية flags غير المنقولة.

**انتقالات:** `label_ar`, `condition_config` / `condition_schema`, والحفاظ الدقيق على `is_default`.

### طريقة enrichment server-side

في `getAdminRequestWorkflowConfig` بعد `assertRequestWorkflowAdmin` و`rpcAdminGetRequestWorkflowConfig`:

- إذا وُجدت workflows وsteps: قراءة محدودة من `request_type_workflow_steps`
  (`id, workflow_id, requires_payment, produces_document`) عبر `supabaseAdmin` (قراءة فقط).
- الدمج عبر `mergeWorkflowStepPaymentDocumentFlags` — عند غياب صف لخطوة يُرمى خطأ واضح؛ **لا** قيم افتراضية صامتة.
- لا تعديل RPC ولا RLS ولا service-role في مسار الحفظ.

### إصلاح اختيار workflow المحفوظ

- state صريح: `selectedWorkflowId`.
- `selectWorkflowForEditor`: preferred → active → أحدث draft → أول متاح.
- بعد نجاح الحفظ: `setSelectedWorkflowId(result.workflowId)` ثم `refetchQueries` ثم `setInitialized(false)` فقط بعد نجاح refresh.
- فشل الحفظ أو فشل refresh: لا مسح لـ `draftSteps` / `draftTransitions` ولا قفز تلقائي إلى active.

### نتائج اختبارات round-trip

انظر قسم التحقق أدناه (يشمل mapper / selector / enrichment policy).

### تأكيدات النطاق (remediation)

- ❌ لا migration جديدة
- ❌ لا SQL / DB writes / Lovable
- ❌ لا تعديل `types.ts` يدويًا
- ❌ لا Publish / Deploy
- ❌ لا PR جديد — نفس #117

---

## PR #117 refresh integrity remediation

### المشكلة

بعد نجاح `admin_save_request_workflow_config`، كان `refetchQueries` قد يكتمل بدون رمي خطأ حتى لو فشل الاستعلام، أو يعيد بيانات لا تتضمن `result.workflowId` بعد. في هذه الحالة كان استدعاء `setInitialized(false)` يعيد تهيئة المحرر من cache ناقص وقد يقفز إلى active ويفقد المسودة المحلية بصريًا، مع إظهار رسالة نجاح مضللة.

### الإصلاح

- `refetchQueries(..., { throwOnError: true })` مع `type: "active"`.
- بعد refetch: قراءة `getQueryData` والتحقق عبر `hasWorkflowId` / `decideWorkflowEditorRemap`.
- `setInitialized(false)` ورسالة النجاح النهائية **فقط** بعد وجود `result.workflowId` في `refreshedConfig.workflows`.
- عند فشل refresh أو غياب الإصدار: رسالة خطأ واضحة، `setSaveSuccess(null)`، الإبقاء على `draftSteps` / `draftTransitions` / `selectedWorkflowId = result.workflowId`، بدون retry أو حفظ ثانٍ.

### مزامنة الفرع مع main

تم `git merge origin/main` داخل الفرع (بدون rebase / force push). أحدث main عند الدمج: `4160d5a`.

### تأكيدات النطاق

- ❌ لا migrations
- ❌ لا DB writes
- ❌ لا Publish / Deploy
- ❌ لا تعديل `types.ts`
- ❌ لا PR جديد

---

## Supabase types

`src/integrations/supabase/types.ts` **لم يُعدَّل يدويًا**.

توليد الأنواع من الإنتاج عبر Lovable مؤجّل لمرحلة مستقلة بعد مراجعة هذا PR.

---

## ضمانات النطاق

- ❌ لا migration جديدة
- ❌ لا SQL / db push / Lovable DB writes
- ❌ لا seed / طلبات تجريبية / تفعيل workflow فعلي في هذه المرحلة
- ❌ لا Publish / Deploy
- ❌ لا تعديل بيانات الإنتاج
- ❌ لا stash pop/apply/drop

---

## نتائج التحقق

| الفحص | النتيجة |
|-------|---------|
| `bun test tests/student-requests/enrollment-certificate-workflow-foundation.test.ts` | **55 pass / 0 fail** |
| `bunx tsc --noEmit` | **pass** |
| `bun run build` | **pass** |
| `git diff --check` | **pass** |
| مزامنة مع `origin/main` | merge `4160d5a` — بدون تعارضات |
