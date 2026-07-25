# PORTAL-B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01

التاريخ: 2026-07-25  
الفرع: `feat/b1-five-services-secure-read-contracts-01`  
السياسة: SOURCE-ONLY — لا Migration apply، لا Production/Staging write، لا Deploy/Publish، لا تغيير `student_visible`، ولا activation، ولا merge.

## القرار

`PASS_B1_FIVE_SERVICES_SECURE_READ_CONTRACTS_SOURCE_READY`

## سياق المرحلة A (PR #226)

- PR #226 (graduation-projects) بقيت مفتوحة دون دمج.
- Web CI run `30144837523` فشل قبل بدء أي خطوات بسبب حد إنفاق/فوترة حساب GitHub Actions.
- إعادة واحدة `--failed` أعادت نفس فشل البنية التحتية بدون logs قابلة للقراءة.
- التوثيق: `HOLD_PR226_REMOTE_CI_INFRASTRUCTURE_NO_JOB_STEPS` على فرع graduation-projects.
- لم يُغيَّر كود تطبيقي لإغلاق CI؛ الانتقال إلى المرحلة B تم فورًا حسب التصريح.

## الهدف

إغلاق فجوات `BACKEND_CONTRACT_PENDING` لعقود قراءة Backend آمنة للخدمات الخمس:

1. `enrollment_suspension`
2. `excused_absence`
3. `department_transfer`
4. `final_chance`
5. `file_withdrawal`

## RPC inventory

| RPC | الغرض | جمهور التنفيذ |
| --- | --- | --- |
| `get_b1_secure_read_runtime_capability()` | readiness + قائمة الخدمات/القراءات | authenticated |
| `get_b1_request_form_options(text)` | خيارات نموذج الطالب | authenticated |
| `get_b1_request_draft_for_student(uuid)` | مسودة الطالب الحالية | authenticated |
| `get_b1_request_details_for_student(uuid)` | تفاصيل طلب الطالب | authenticated |
| `list_b1_requests_for_student(int,int)` | قائمة طلبات الطالب للخمس | authenticated |
| `get_b1_assigned_inbox_for_actor(int,int)` | صندوق الموظف المسند | authenticated |
| `get_b1_assigned_request_details_for_actor(uuid)` | تفاصيل طلب الموظف المسند + refresh بعد mutation | authenticated |
| `get_b1_step_allowed_actions(uuid)` | الإجراءات القانونية للمرحلة الحالية | authenticated |
| `list_b1_request_attachments_for_viewer(uuid)` | مرفقات مصرّح بعرضها (metadata فقط) | authenticated |

خصائص أمنية مشتركة:

- `SECURITY DEFINER` + `search_path = public, pg_temp`
- `auth.uid()` إلزامي عبر `b1_require_auth_uid()`
- رفض معتم: `B1_READ_ACCESS_DENIED` (لا كشف وجود/هوية/مرحلة)
- `REVOKE FROM PUBLIC, anon` ثم `GRANT EXECUTE TO authenticated` فقط
- لا service-role bypass، لا actor/department من العميل
- لا broad bypass لـ admin / registrar / dean / department_head
- الموظفون عبر `user_matches_workflow_runtime_step` / `can_current_user_act_on_step` (تعيين فعلي + خطوة نشطة)

كتابات عمدًا fail-closed في هذا المسار: `create_draft` / `save_draft`.

## DTO inventory (TypeScript)

المسار: `src/lib/student-requests/b1-secure-read/`

| النوع | الاستخدام |
| --- | --- |
| `B1SecureFormOptions` | `getFormOptions` |
| `B1SecureDraft` | `getDraft` |
| `B1SecureRequestDetails` | `getStudentRequestDetails` |
| `B1SecureStudentListItem` | `getStudentRequests` |
| `B1SecureAssignedRequest` | `getAssignedInbox` |
| `B1SecureAssignedRequestDetails` | `getAssignedRequestDetails` / refresh after act / confirm_payment |
| `B1SecureStepActions` | الإجراءات القانونية |
| `B1SecureAttachmentMeta` | مرفقات — `storageRef` معتم فقط |
| `B1SecureReadCapability` | runtime readiness |

ممنوع في DTO العام: `storage_bucket` / `storage_object_path` / `object_key` / مسارات التخزين / بيانات اتصال / actor UUIDs غير اللازمة / audit داخلي غير ضروري.

ربط الـadapter (للمسار اللاحق دون تعديل PR #221/#223):

- `getFormOptions` → `get_b1_request_form_options`
- `getDraft` → `get_b1_request_draft_for_student`
- `getStudentRequestDetails` → `get_b1_request_details_for_student`
- `getStudentRequests` → `list_b1_requests_for_student`
- `getAssignedInbox` → `get_b1_assigned_inbox_for_actor`
- `getAssignedRequestDetails` / refresh after act / refresh after confirm_payment → `get_b1_assigned_request_details_for_actor`
- `createDraft` / `saveDraft` → `null` (fail-closed)

## Authorization matrix (read)

بوابة الرفض المعتم: `B1_READ_ACCESS_DENIED` أو `AUTHENTICATION_REQUIRED` لغير المسجّل.

| الدور / الحالة | student details/list/draft/attachments | staff inbox/details/actions |
| --- | --- | --- |
| طالب مالك الطلب | ALLOW | DENY |
| طالب آخر | DENY | DENY |
| موظف مسند للخطوة النشطة | DENY (إلا attachments إن وُجدت صلاحية viewer) | ALLOW |
| نفس الدور غير مسند | — | DENY |
| دور خاطئ / مرحلة خاطئة | — | DENY |
| admin / dean / registrar غير مسند | — | DENY |
| رئيس قسم بلا تعيين/نطاق عقد | — | DENY |
| anon | DENY | DENY |

### PG17 disposable counts

Harness: `tests/b1-secure-read/pg/run-harness.ps1` على `postgres:17` محلي disposable فقط.

حالات PASS الموثّقة:

- إيجابية: student capability، student own details، staff assigned inbox، staff assigned details، owner attachments (بدون مسار)، form options للخدمات الخمس، grants authenticated-only.
- سلبية: anon capability، student other details، admin unassigned، student on staff RPC، other student attachment.

النتيجة النهائية: `B1_SECURE_READ_PG17_PASS` (PostgreSQL 17.10) — **16/16 PASS**. الحاوية تُوقف بعد التشغيل.

## Assignment enforcement

- صندوق الموظف يعتمد على الخطوة النشطة + `assigned_user_id = auth.uid()` عبر stub/production helper `user_matches_workflow_runtime_step`.
- لا يكفي امتلاك دور عام أو وحدة معالجة عامة.
- تفاصيل الموظف تُرجع فقط الخطوة المسندة الحالية و`allowedAction(s)` المشتقة من إعداد المرحلة دون كشف مسارات التخزين.

## Privacy / attachment checks

- DTO المرفقات يستخدم `storage_ref = 'att:' || id` فقط.
- PG أثبت غياب `storage_bucket` / `secret/path` من تفاصيل الطالب والموظف وقائمة المرفقات.
- TypeScript: `assertNoStorageCoordinates` + فحوصات المصدر في `b1-secure-read-contracts-01.test.ts`.

## enrollment_certificate regression

- لا تعديل على جداول/مسارات/migrations خاصة بـ `enrollment_certificate`.
- لا تغيير `student_visible`.
- مجموعة `bun test tests` كاملة خضراء (تشمل عقود enrollment certificate الموجودة).

## PostgreSQL 17 verification

- Schema أدنى + تطبيق مصدر الـmigration داخل حاوية disposable.
- لا اتصال Production/Staging.
- لا `supabase db push` / لا apply بيئي.

## Migrations / verifiers (source-only)

| ملف | دور |
| --- | --- |
| `docs/migration-drafts/B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01.sql` | مسودة المصدر |
| `supabase/migrations/20260725130000_b1_19_secure_read_contracts_01.sql` | ترقية معلّمة NOT APPLIED |
| `docs/migration-drafts/b1-backend-verifiers/20-B1_19_SECURE_READ_CONTRACTS_01-PREFLIGHT.sql` | preflight READ ONLY |
| `docs/migration-drafts/b1-backend-verifiers/20-B1_19_SECURE_READ_CONTRACTS_01-POST-VERIFIER.sql` | post verifier READ ONLY |
| `docs/migration-drafts/b1-backend-verifiers/PROMOTION-MAP.json` | order 20 + SHA LF pins |

ملاحظة: ترقية `B1-SEQUENTIAL-APPLY-MANIFEST.json` تبقى بوابة لاحقة منفصلة (موثّقة في ملاحظة PROMOTION-MAP).

## الاختبارات والنتائج

| الأمر | النتيجة |
| --- | --- |
| PG17 disposable harness | PASS |
| `bun test tests/student-requests` | 619 pass |
| `bun test tests` | 1556 pass |
| `bunx tsc --noEmit` | PASS |
| `bunx eslint` على الملفات المملوكة | PASS بعد تطبيع LF |
| `bun run build` | PASS |
| `git diff --check` | PASS |

## المخاطر المتبقية

1. عقود الكتابة `create_draft` / `save_draft` ما زالت fail-closed — ربط واجهة إنشاء المسودة يحتاج مسار كتابة لاحقًا.
2. لم يُطبَّق الـmigration على أي بيئة؛ التفعيل يتطلب موافقة apply منفصلة + مصفوفة RPC مباشرة على بيئة آمنة.
3. CI عن بُعد لحساب GitHub قد يبقى محجوبًا بفوترة Actions (عائق خارجي موثّق لـ PR #226).
4. Stub التعيين في harness المحلي يبسّط `user_matches_workflow_runtime_step`؛ الإنتاج يعتمد على الدالة الحقيقية الموجودة مسبقًا.

## تأكيدات الحظر

- لا Production / Staging apply
- لا Deploy / Publish
- لا activation / لا تغيير `student_visible`
- لا merge لهذا الـPR ولا لـ PR #226
- لا تعديل مباشر على PR #221 أو #223

## الملفات الأساسية المضافة/المعدّلة

- `docs/migration-drafts/B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01.sql`
- `supabase/migrations/20260725130000_b1_19_secure_read_contracts_01.sql`
- `docs/migration-drafts/b1-backend-verifiers/20-B1_19_*`
- `docs/migration-drafts/b1-backend-verifiers/PROMOTION-MAP.json`
- `src/lib/student-requests/b1-secure-read/*`
- `tests/student-requests/b1-secure-read-contracts-01.test.ts`
- `tests/student-requests/b1-five-services-backend-contract-freeze-01.test.ts` (عداد preflight/post 14)
- `tests/b1-secure-read/pg/*`
- `docs/PORTAL-B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01-REPORT.md`
