# PORTAL-B1-FIVE-SERVICES-UI-BACKEND-INTEGRATION-BRIDGE-01

## القرار

`PASS_B1_UI_BACKEND_INTEGRATION_BRIDGE_READY`

الحالة SOURCE-ONLY. لا Production/Staging write، ولا Migration apply، ولا Deploy/Publish، ولا تغيير `student_visible`، ولا workflow activation، ولا E2E.

## الهدف

ربط Live B1 UI Adapter بعقود Backend المجمّدة في
`docs/B1-FIVE-SERVICES-BACKEND-CONTRACT-FREEZE-01.md` (PR #219 / PR #220)، دون
تعديل مكونات الواجهة البصرية ودون تعديل authorization أو migrations.

## جدول Mapping: B1UiAdapter → Backend

| Adapter method | Backend contract | الحالة |
|---|---|---|
| `getAvailableB1RequestTypes` | `get_available_request_types_for_current_student()` + `submit.runtimeAvailable` | **موصول** — `studentVisible` من Backend فقط؛ `runtimeAvailable` يبقى `false` حتى دليل تفعيل لاحق |
| `getB1RequestFormOptions` | لا يوجد عقد B1 UI كامل (أقسام/برامج/excuse types) | **fail-closed** `BACKEND_CONTRACT_PENDING` |
| `createB1RequestDraft` | لا مسار B1 UI مخصص آمن دون تفعيل/`student_visible` | **fail-closed** |
| `getB1RequestDraft` | لا RPC قراءة مسودة B1 مطابق لشكل `B1Draft` | **fail-closed** |
| `saveB1RequestDraft` | لا RPC حفظ مسودة B1 مطابق | **fail-closed** |
| `uploadB1RequestAttachment` | `create_student_request_attachment_upload_intent` + storage upload + `complete_student_request_attachment_upload` | **موصول** — يخضع لـ `SECURE_ATTACHMENTS_RUNTIME_AVAILABLE=false` |
| `removeB1RequestAttachment` | `reject_student_request_attachment(uuid,text)` | **موصول** — نفس بوابة runtime |
| `submitB1Request` | `submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])` | **موصول** |
| `getB1RequestDetails` | لا شكل قراءة طالب B1 مطابق لـ `B1RequestDetails` | **fail-closed** |
| `getAssignedB1Requests` | `get_my_request_actor_inbox` موجود لكن بلا mapping آمن لـ `allowedAction` دون تخمين | **fail-closed** (فجوة موثّقة) |
| `getAssignedB1RequestDetails` | `get_student_request_detail_for_actor` موجود لكن يحتاج إثراء/تشكيل UI غير مجمّد هنا | **fail-closed** (فجوة موثّقة) |
| `actOnB1RequestStep` | `act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)` مع `p_payload={}` | **موصول** — يرفض `confirm_payment` ويحلّ `clear/apply_decision/archive` من `action_type` في الخطوة |
| `confirmB1RevenueReceipt` | `record_external_university_payment_confirmation(uuid,text)` | **موصول** — `stepId` + `note` فقط |

## عقود موصولة (signatures)

- `submit_b1_student_request_atomic`: `p_request_id`, `p_canonical_code`, `p_form_data`, `p_expected_updated_at`, `p_attachment_ids`
- `act_on_b1_student_request_step_atomic`: `p_step_id`, `p_action`, `p_comment`, `p_payload: {}`
- `record_external_university_payment_confirmation`: `p_step_id`, `p_note` فقط — ممنوع amount/currency/invoice/confirmed_by/confirmed_at/client status
- Attachments: intent (6-arg) / complete / list / owned / reject / authorize download

## الظهور والتفعيل

- `runtimeAvailable` لا يُثبَّت `true`؛ يُشتق من `adapter.submit.runtimeAvailable` (حاليًا `false`) مع blockers.
- `studentVisible` يأتي فقط من ظهور النوع في RPC المتاح للطالب.
- لا mock خارج `DEV + VITE_B1_UI_MOCK=1`.
- لا activation ولا E2E في هذه المرحلة.

## الملفات المعدّلة / المضافة

- `src/lib/student-requests/b1-ui/adapter.live.ts`
- `src/lib/student-requests/b1-ui/b1-rpc.ts` (جديد)
- `src/lib/student-requests/b1-ui/b1-ui.functions.ts` (جديد)
- `src/lib/student-requests/b1-ui/availability.ts` (جديد)
- `src/lib/student-requests/b1-ui/index.ts`
- `tests/student-requests/b1-ui/adapter-live-integration.test.ts` (جديد)
- `tests/student-requests/b1-ui/adapter-selector.test.ts`
- هذا التقرير

لم تُعدَّل: `src/components/student-requests/b1/**`، authorization matrix، migrations، docs/migration-drafts، RPC SQL، `student_visible`، `routeTree.gen.ts` يدويًا.

## الاختبارات والنتائج

| أمر | النتيجة |
|---|---|
| `bun test tests/student-requests/b1-ui` | PASS — 95 |
| `bun test tests/student-requests` | PASS — 693 |
| `bun test tests` | PASS — 1630 |
| `bunx tsc --noEmit` | PASS |
| ESLint المحدد لملفات المهمة | PASS بعد `--fix` |
| `bun run build` | PASS — client/SSR + TanStack Register |
| `git diff --check` | PASS |

## الافتراضات

- Contract Freeze هو المرجع الوحيد للـsignatures.
- قراءة inbox/details وdraft/form-options تحتاج عقود UI قراءة إضافية قبل الربط الحي.
- `SECURE_ATTACHMENTS_RUNTIME_AVAILABLE` يبقى `false` حتى بوابة تفعيل منفصلة؛ الرفع الموصول يفشل بأمان.

## المخاطر

- مسارات draft/read ما زالت fail-closed؛ الواجهة الحيّة تبقى غير قابلة للاستخدام الكامل حتى تُغلق تلك الفجوات + activation.
- تطابق إجراء UI (`approve`) مع `clear|apply_decision|archive` يعتمد على قراءة `action_type` من الخطوة — صحيح تشغيليًا لكنه يعتمد على صفوف workflow runtime.

## العوائق

- لا يوجد عقد Backend جاهز لـ form options الكاملة أو تفاصيل الطالب/الموظف بشكل `B1UiAdapter` دون تخمين mapping.

## أثر الإنتاج

لا يوجد. لا migrations، لا بيانات، لا Deploy، لا تفعيل خدمة.
