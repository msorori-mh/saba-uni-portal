# STUDENT-REQUEST-WORKFLOW-SAVE-ENABLEMENT-01B

## القرار

`PASS_STUDENT_REQUEST_WORKFLOW_SAVE_ENABLEMENT_PR_READY_FOR_REVIEW`

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
| Worktree | `C:\projects\saba-uni-portal-workflow-save-01b` |

---

## الملفات المعدّلة

| الملف | التغيير |
|-------|---------|
| `src/lib/admin-request-workflow-rpc.ts` | تفعيل العلم + رسائل محدّثة + `workflowMetaForSaveMode` / `canSubmitWorkflowSave` / `mapWorkflowSaveRpcError` |
| `src/lib/admin-request-workflow.functions.ts` | استخدام `workflowMetaForSaveMode` لمسودة/تفعيل |
| `src/lib/student-requests/request-workflow-save-contract.ts` | رسالة capability بعد التفعيل |
| `src/routes/admin/request-types.$id.workflow.tsx` | أزرار عبر `canSubmitWorkflowSave` + الحفاظ على draft عند الخطأ |
| `tests/student-requests/enrollment-certificate-workflow-foundation.test.ts` | توقّع `true` + اختبارات 01B |
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
| `bun test tests/student-requests/enrollment-certificate-workflow-foundation.test.ts` | **39 pass / 0 fail** |
| `bunx tsc --noEmit` | **pass** |
| `bun run build` | **pass** |
| `git diff --check` | **pass** |
