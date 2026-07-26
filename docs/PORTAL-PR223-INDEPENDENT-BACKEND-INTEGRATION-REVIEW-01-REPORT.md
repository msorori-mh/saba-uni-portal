# PORTAL-PR223-INDEPENDENT-BACKEND-INTEGRATION-REVIEW-01

## القرار

`HOLD_PR223_ATTACHMENT_DOWNLOAD_STORAGE_PATH_EXPOSURE_AND_NONAUTHORITATIVE_ACTION_RESULTS`

## Remediation Execution

### العيوب الأصلية والسبب الجذري

- HIGH: كان wrapper التنزيل يعيد `storage_bucket` و`storage_object_path` عبر حد server/client. السبب الجذري هو تمرير ناتج RPC التفويض مباشرة بدل استهلاكه داخل الخادم.
- MEDIUM: كانت نتائج `actOnB1RequestStep` و`confirmB1RevenueReceipt` تنشئ `actedAt` محليًا وتدّعي نتيجة عرض أوسع من عقد القراءة المتاح. السبب الجذري هو محاولة تشكيل view model بعد mutation دون read contract خلفي آمن.
- MEDIUM: ملفات PR #223 كانت CRLF بينما Prettier يفرض LF، مما أنتج 1534 مخالفة EOL.

### الملفات المعدلة

- `src/lib/student-requests/b1-ui/adapter.live.ts`
- `src/lib/student-requests/b1-ui/adapter.mock.ts`
- `src/lib/student-requests/b1-ui/adapter.types.ts`
- `src/lib/student-requests/b1-ui/b1-ui.functions.ts`
- `tests/student-requests/b1-ui/adapter-live-integration.test.ts`
- `tests/student-requests/b1-ui/adapter-mock-staff.test.ts`
- `docs/PORTAL-PR223-INDEPENDENT-BACKEND-INTEGRATION-REVIEW-01-REPORT.md`

### تصميم signed download

التدفق بعد الإصلاح:

1. العميل يرسل `attachmentId` فقط عبر schema صارم.
2. server function يستخدم `context.supabase` لجلسة المستخدم الحالية.
3. الخادم يستدعي `authorize_student_request_attachment_download(p_attachment_id)`.
4. عند الرفض، يُعاد `ATTACHMENT_ACCESS_DENIED` منقح ولا يُستدعى Storage.
5. عند النجاح فقط، تبقى إحداثيات التخزين داخل helper الخادمي وتُستخدم مع `createSignedUrl`.
6. مدة الصلاحية ثابتة خادميًا عبر `SECURE_ATTACHMENT_SIGNED_URL_SECONDS=300`.
7. DTO العام يعيد `{ url, expiresInSeconds }` فقط.

لا يوجد `getPublicUrl`، ولا بناء URL يدوي، ولا expiry من العميل، ولا service-role storage bypass، ولا logging للرابط أو object path.

### إثبات عدم عبور bucket/path

- النوع العام `B1AttachmentDownload` لا يحتوي إلا `url`, `expiresInSeconds`, وmetadata اختيارية غير داخلية.
- `LiveB1UiAdapterDeps.authorizeDownload` يعيد `B1AttachmentDownload` ولا يذكر bucket/path.
- اختبار regression يفشل إذا ظهرت `storage_bucket`, `storage_object_path`, `objectPath`, أو `object_key` في `adapter.types.ts` أو `adapter.live.ts`.
- اختبار التنفيذ يثبت أن RPC التفويض يسبق `createSignedUrl`.
- اختبار denial يثبت أن Storage لا يُستدعى وأن تفاصيل SQL/Storage لا تصل إلى المستدعي.
- مصفوفة authorization الموجودة ما زالت تثبت رفض cross-student/cross-request ورفض الموظف غير المعيّن داخل RPC.

### تصميم mutation acknowledgment

تم اختيار المسار B لعدم وجود read contract آمن للـdetails/inbox:

```ts
{
  accepted: true;
  stepId: string;
  requestId?: string;
  action: B1StaffAction;
}
```

لا يحتوي acknowledgment على status أو current step أو transition أو actor أو timestamp. تظل طرق القراءة غير المضمونة `BACKEND_CONTRACT_PENDING`، وتستمر الواجهة في محاولة refresh بعد النجاح دون mutation متفائل.

### إثبات إزالة local timestamps

- أزيلت `new Date().toISOString()` من نتيجتي act وconfirm.
- أزيلت `actedAt` و`outcomeAr` من `B1StepActionResult`.
- اختبار source-level يفشل عند ظهور `new Date(` أو `Date.now(` أو `toISOString(` داخل mutation handlers.
- الاختبار نفسه يمنع حقول الحالة/الخطوة/timestamps/actor المتفائلة.
- `confirm_payment` ما زالت تمر فقط عبر RPC المتخصصة وبـ`stepId + optional note`.

### lint قبل وبعد

- قبل الإصلاح: FAIL، عدد 1534 مخالفة `prettier/prettier` من نوع CRLF/EOL في ملفات PR.
- بعد الإصلاح: PASS على جميع ملفات TypeScript المعدلة.
- تم تحويل الملفات المملوكة فقط إلى LF باستخدام Prettier؛ لم تتغير `.gitattributes` أو إعدادات Prettier العامة ولم يُنسق المستودع كاملًا.

### نتائج الاختبارات بعد الإصلاح

| command                                    | result                                               |
| ------------------------------------------ | ---------------------------------------------------- |
| `bun install --frozen-lockfile`            | PASS؛ no changes                                     |
| `bun test tests/student-requests/b1-ui`    | PASS؛ 101 passed, 0 failed                           |
| `bun test tests/student-requests`          | PASS؛ 699 passed, 0 failed                           |
| `bun test tests`                           | PASS؛ 1636 passed, 0 failed                          |
| `bunx tsc --noEmit`                        | PASS                                                 |
| ESLint المحدد على ملفات TypeScript المعدلة | PASS                                                 |
| `bun run build`                            | PASS؛ Vite build and route-tree validation completed |
| `git diff --check`                         | PASS                                                 |

### المخاطر المتبقية

- runtime المرفقات ما زال fail-closed لأن `SECURE_ATTACHMENTS_RUNTIME_AVAILABLE=false`.
- read contracts الخاصة بالتفاصيل/inbox ما زالت غير متوفرة عمدًا؛ لذلك acknowledgment محدود ولا يدعي حالة Backend.
- لا توجد findings متبقية من درجات CRITICAL/HIGH/MEDIUM ضمن diff الإصلاح بعد المراجعة الذاتية النهائية.

### أثر الإنتاج

لم يحدث Migration أو Deploy أو Publish أو workflow activation أو تعديل `student_visible` أو وصول إلى Production/Staging. لم تتغير SQL أو migrations أو generated Supabase types أو `enrollment_certificate`.

### قرار الإصلاح

`PASS_PR223_SECURE_DOWNLOAD_AND_AUTHORITATIVE_RESULTS_REMEDIATION_READY`

لا يُوصى بدمج PR #223 إلى فرع PR #221 قبل إغلاق الـHIGH والـMEDIUM أدناه وإعادة تشغيل مصفوفة التحقق.

## النطاق والمراجع

- المستودع: `msorori-mh/saba-uni-portal`
- PR: `#223`
- base: `origin/feat/b1-five-services-ui-kimi-01` عند `fca1ef8e76ca99fa417f79c4b8e5fc8b4b72829e`
- head: `origin/feat/b1-five-services-ui-backend-integration-01` عند `175fbf8eca76f2b82442ef2f5f1097c8df79faaa`
- نوع المراجعة: مستقلة، SOURCE-ONLY
- لم تُطبق migrations، ولم يحدث Deploy أو workflow activation أو تعديل production/staging أو `student_visible`.

## الملفات التي تمت مراجعتها

ملفات diff الثمانية كاملة:

- `docs/PORTAL-B1-FIVE-SERVICES-UI-BACKEND-INTEGRATION-BRIDGE-01-REPORT.md`
- `src/lib/student-requests/b1-ui/adapter.live.ts`
- `src/lib/student-requests/b1-ui/availability.ts`
- `src/lib/student-requests/b1-ui/b1-rpc.ts`
- `src/lib/student-requests/b1-ui/b1-ui.functions.ts`
- `src/lib/student-requests/b1-ui/index.ts`
- `tests/student-requests/b1-ui/adapter-live-integration.test.ts`
- `tests/student-requests/b1-ui/adapter-selector.test.ts`

كما تمت مطابقة العقود مع generated types والمصادر المرجعية التالية دون تعديلها:

- `src/integrations/supabase/types.ts`
- `src/lib/student-request-rpc.ts`
- `src/lib/student-requests/external-payment-confirmation-contract.ts`
- `src/lib/student-requests/secure-attachments-contract.ts`
- `src/lib/student-requests/secure-attachments.functions.ts`
- `supabase/migrations/20260724061333_abf1bbb5-1bd0-4a7b-a805-866a3b98a61a.sql`
- `supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql`
- `supabase/migrations/20260725110500_b1_12_transfer_secure_attachment_05a.sql`
- `supabase/migrations/20260725120000_b1_confirm_payment_predecessor_guard_01.sql`

## RPC mapping

| UI operation                      | Backend RPC                                                                        | exact RPC arguments                                                                                               | النتيجة                               |
| --------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| available request types           | `get_available_request_types_for_current_student()`                                | none                                                                                                              | PASS                                  |
| submit B1 request                 | `submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])`             | `p_request_id`, `p_canonical_code`, `p_form_data`, `p_expected_updated_at`, `p_attachment_ids`                    | PASS                                  |
| general staff action              | `act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)`                      | `p_step_id`, `p_action`, `p_comment`, `p_payload={}`                                                              | PASS                                  |
| external payment confirmation     | `record_external_university_payment_confirmation(uuid,text)`                       | `p_step_id`, `p_note`                                                                                             | PASS                                  |
| attachment upload intent          | `create_student_request_attachment_upload_intent(uuid,text,text,text,bigint,text)` | `p_student_request_id`, `p_field_key`, `p_original_file_name`, `p_mime_type`, `p_size_bytes`, `p_checksum_sha256` | PASS                                  |
| attachment upload lookup          | `get_owned_student_request_attachment_upload(uuid)`                                | `p_attachment_id`                                                                                                 | PASS                                  |
| attachment completion             | `complete_student_request_attachment_upload(uuid)`                                 | `p_attachment_id`                                                                                                 | PASS                                  |
| attachment list                   | `list_my_student_request_attachments(uuid)`                                        | `p_student_request_id`                                                                                            | PASS                                  |
| attachment removal/rejection      | `reject_student_request_attachment(uuid,text)`                                     | `p_attachment_id`, server-fixed `REMOVED_BY_STUDENT`                                                              | PASS                                  |
| attachment download authorization | `authorize_student_request_attachment_download(uuid)`                              | `p_attachment_id`                                                                                                 | RPC call PASS; response boundary HOLD |

## Server/client boundary

- PASS: React B1 components contain no direct Supabase imports.
- PASS: session-scoped RPC calls use authenticated server-function context.
- PASS: client schemas are strict and do not accept actor IDs or actor timestamps.
- PASS: general actions send an empty `p_payload`; no optimistic workflow transition is written in the adapter.
- PASS: `confirm_payment`, `issue_document`, and `sign` are rejected by the general action wrapper.
- PASS: the underlying atomic action RPC remains the authorization authority; no admin/registrar/dean wrapper bypass was found.
- HOLD: the attachment download server function returns private storage coordinates across the server/client boundary instead of consuming them server-side.
- HOLD: successful staff action/payment responses use `new Date().toISOString()` rather than an authoritative post-success read.

## confirm_payment verification

PASS:

- Public adapter input is only `stepId` plus optional note.
- Strict server input is only `{ stepId, note }`.
- RPC arguments are exactly `{ p_step_id, p_note }`.
- No `amount`, `currency`, `invoice`, `gateway`, payment reference, client status, `confirmed_by`, or `confirmed_at` is accepted or sent.
- `actOnB1RequestStep(..., "confirm_payment", ...)` fails before invoking the general RPC.
- `act_on_b1_student_request_step_atomic` also rejects specialized actions server-side.
- The specialized RPC enforces the exact direct finance assignee and exact finance processing binding; no broad role bypass was found.

HOLD:

- `confirmB1UiRevenueReceiptFn` returns a locally generated `actedAt` and performs no authoritative post-success read.

## Attachment verification

PASS:

- Upload intent accepts request ID, allowlisted field key, file metadata, and content only; no client storage bucket/path is accepted.
- Upload storage bucket/path are obtained from the ownership-checked RPC.
- Completion uses the opaque attachment ID.
- List uses the ownership-scoped RPC.
- Remove accepts only attachment ID from the client and fixes the rejection code server-side.
- Download authorization calls the dedicated authorization RPC.
- Secure attachment methods fail closed while `SECURE_ATTACHMENTS_RUNTIME_AVAILABLE` is false.
- No public bucket URL is created.
- Database RPC authorization prevents attaching/listing/removing/downloading another student's attachment.

HOLD:

- `src/lib/student-requests/b1-ui/b1-rpc.ts:277-293` materializes and returns `storage_bucket` and `storage_object_path`.
- `src/lib/student-requests/b1-ui/b1-ui.functions.ts:347-356` forwards that result through a server function.
- `src/lib/student-requests/b1-ui/adapter.live.ts:72-77,187-189` models those private coordinates in the client-facing dependency boundary.
- The established safe implementation at `src/lib/student-requests/secure-attachments.functions.ts:93-104` consumes the authorized coordinates inside the server handler and returns a short-lived signed URL instead.

Required remediation:

1. Replace the B1 download boundary with a server-only `authorize -> createSignedUrl` sequence.
2. Return only `{ signedUrl, expiresInSeconds }` (or reuse the existing signed-download server function).
3. Remove `storage_bucket` and `storage_object_path` from `LiveB1UiAdapterDeps` and all client-reachable return types.
4. Add an independent contract test asserting that the server-function response contains neither storage coordinate and that signed URL creation happens only after successful authorization.

## Fail-closed and availability verification

- PASS: `runtimeAvailable` resolves false for all five services with the current frozen adapters.
- PASS: `studentVisible` is derived only from rows returned by `get_available_request_types_for_current_student`.
- PASS: final UI gating requires both `studentVisible` and `runtimeAvailable`.
- PASS: form-options, create/get/save draft, details, assigned inbox, and assigned details remain `BACKEND_CONTRACT_PENDING`.
- PASS: no mock path exists outside development plus `VITE_B1_UI_MOCK=1`.
- PASS: unavailable attachment runtime fails before intent/upload/list/remove/download operations.
- PASS: no fallback to generic mutation RPCs was found.

## Enrollment certificate regression review

- PASS: no `enrollment_certificate` file or wrapper changed in the eight-file diff.
- PASS: `submit_student_request` was not changed.
- PASS: fee machinery was not changed.
- PASS: route files were not changed.
- PASS: no migration, SQL file, or generated types file changed.

## Findings

### HIGH — Private attachment storage coordinates cross the server/client boundary

Evidence:

- `src/lib/student-requests/b1-ui/b1-rpc.ts:277-293`
- `src/lib/student-requests/b1-ui/b1-ui.functions.ts:347-356`
- `src/lib/student-requests/b1-ui/adapter.live.ts:72-77,187-189`

Impact:

- Authorized private bucket/object coordinates are exposed to client-reachable code.
- The implementation diverges from the repository's established signed-download boundary and leaves download consumption outside the reviewed authorization wrapper.
- Current tests explicitly accept the raw coordinate response instead of proving the safe boundary.

Exact remediation is listed in “Attachment verification”.

### MEDIUM — Action/payment success results are not authoritative post-action reads

Evidence:

- `src/lib/student-requests/b1-ui/b1-ui.functions.ts:205-218`
- `src/lib/student-requests/b1-ui/b1-ui.functions.ts:231-241`

Impact:

- `actedAt` is fabricated with the server process clock rather than read from the completed runtime step/event.
- Payment confirmation performs no re-read at all.
- The generic action re-reads only `student_request_id`, ignores query errors, and still fabricates `actedAt`.
- This violates the required post-success re-read contract even though page-level query invalidation avoids optimistic UI mutation.

Required remediation:

1. After RPC success, re-read the acted step/request using a safe authorized read contract.
2. Fail closed on re-read error or missing row.
3. Return authoritative `requestId`, decision/outcome, and `completed_at/updated_at`; do not use `new Date()` fallbacks.
4. Add tests that make the post-read fail/miss and assert the wrapper fails closed.

### MEDIUM — Targeted lint verification fails on the reviewed files

Command:

`bunx eslint src/lib/student-requests/b1-ui/adapter.live.ts src/lib/student-requests/b1-ui/availability.ts src/lib/student-requests/b1-ui/b1-rpc.ts src/lib/student-requests/b1-ui/b1-ui.functions.ts src/lib/student-requests/b1-ui/index.ts tests/student-requests/b1-ui/adapter-live-integration.test.ts tests/student-requests/b1-ui/adapter-selector.test.ts`

Result: FAIL, 1534 `prettier/prettier` errors, all reported as `Delete ␍` (CRLF versus configured LF) on this Windows checkout.

Required remediation:

- Normalize the PR-owned text files to repository LF policy in Cursor's branch and rerun the exact targeted lint command.

## Test and verification results

| command                                        | result                                               |
| ---------------------------------------------- | ---------------------------------------------------- |
| `bun install --frozen-lockfile`                | PASS; 595 packages installed; no tracked changes     |
| `bun test tests/student-requests/b1-ui`        | PASS; 95 passed, 0 failed                            |
| `bun test tests/student-requests`              | PASS; 693 passed, 0 failed                           |
| `bun test tests`                               | PASS; 1630 passed, 0 failed                          |
| `bunx tsc --noEmit`                            | PASS                                                 |
| targeted ESLint on seven PR runtime/test files | FAIL; 1534 CRLF/Prettier errors                      |
| `bun run build`                                | PASS; Vite build and route-tree validation completed |
| `git diff --check`                             | PASS                                                 |
| `git diff --check base..head`                  | PASS                                                 |

لم يُشغّل `bun run security:test`: لا توجد في هذه المراجعة بيئة Supabase آمنة مصرح بها للاختبارات المباشرة، وتعليمات المهمة تمنع لمس بيانات production/staging أو البيانات التجريبية الموجودة.

## الاختبارات المستقلة

لم تُضف اختبارات إلى فرع المراجعة. الفجوتان مثبتتان مباشرة من حدود الأنواع والتنفيذ، وتعليمات المهمة تمنع تعديل ملفات Cursor وتسمح باختبار مستقل فقط ضمن ملكية المراجع. الاختبارات المطلوبة للإغلاق موصوفة بدقة في findings أعلاه.

## الافتراضات

- generated types والمigrations الموجودة هي مرجع العقد المدمج، لا هدف تعديل.
- `SECURE_ATTACHMENTS_RUNTIME_AVAILABLE=false` هو وضع التفعيل الحقيقي الحالي.
- server functions مستوردة من adapter قابلة للاستدعاء عبر حد client/server؛ لذلك شكل استجابتها جزء من السطح الذي يجب تدقيقه.

## المخاطر والعوائق

- المخاطر: كشف إحداثيات التخزين الخاصة، وعدم موثوقية metadata المعادة بعد الإجراء.
- العائق: targeted lint لا يمر على checkout المراجع بسبب line endings.
- لا توجد صلاحية لتطبيق migrations أو تشغيل مصفوفة RPC مباشرة على production/staging.

## أثر الإنتاج

لا أثر إنتاجي لهذه المراجعة: لم يحدث Deploy أو Publish أو Migration أو كتابة Supabase أو workflow activation أو تغيير `student_visible`. التقرير فقط هو التغيير المحلي الوحيد.

## القرار النهائي

`HOLD_PR223_ATTACHMENT_DOWNLOAD_STORAGE_PATH_EXPOSURE_AND_NONAUTHORITATIVE_ACTION_RESULTS`
