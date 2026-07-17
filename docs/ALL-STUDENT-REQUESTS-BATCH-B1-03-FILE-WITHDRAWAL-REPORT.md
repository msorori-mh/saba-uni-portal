# BATCH-B1-AGENT-03 — FILE WITHDRAWAL SOURCE REPORT

## Decision

`PASS_BATCH_B1_AGENT_03_SOURCE_READY` ضمن نطاق SOURCE-ONLY. لا توجد migration مطبقة، والتفعيل الإنتاجي مؤجل.

## Lifecycle and clearance chain

`student_affairs_intake` → `library_clearance` → `labs_clearance` → `activities_clearance` → `finance_clearance` → `registrar_apply` → `archive`.

جميع الخطوات إلزامية ومتتابعة. لا يجوز إنشاء الخطوة التالية أو تنفيذها قبل اكتمال السابقة. الأرشفة لا تُسمح قبل اكتمال المخالصات، تطبيق قرار المسجل، وتحويل الحالة الأكاديمية إلى `withdrawn`. لا تنشئ الخدمة وثيقة أو PDF أو Storage artifact.

| step | processing_unit | processing_role | expected existing assignee |
|---|---|---|---|
| student_affairs_intake | student_affairs | student_affairs_specialist | هيثم الشبلي |
| library_clearance | library | library_officer | ناجي الروقي |
| labs_clearance | labs | labs_manager | محمد حيدر |
| activities_clearance | student_affairs | student_affairs_manager | ياسمين الولص — تعيين مؤقت معتمد |
| finance_clearance | finance | revenue_finance_officer | فارس اليوسفي |
| registrar_apply | registrar | registrar_general | عبدالله طعيمان |
| archive | archive | archive_officer | التعيين المباشر القائم للدور |

لم تُنشأ حسابات أو ملفات موظفين أو تعيينات. المكتبة والمعامل يعتمدان على `REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql` الموجودة كمسودة منفصلة.

## Authorization matrix

| case | result |
|---|---|
| صاحب التعيين المباشر + الوحدة الصحيحة + الدور الصحيح | ALLOW |
| الدور الصحيح في وحدة خاطئة | DENY |
| الوحدة الصحيحة بدور خاطئ | DENY |
| موظف بلا تعيين مباشر | DENY |
| admin / dean / registrar على خطوة مجال آخر | DENY |
| تنفيذ خطوة مع عدم اكتمال السابقة | DENY |
| archive قبل المخالصات أو registrar_apply | DENY |

اختبارات المصدر تغطي الحالات السابقة مباشرة. يظل اختبار RPC ضد قاعدة آمنة مؤجلًا إلى حين تحويل المسودة إلى migration مشتركة معتمدة وتطبيقها في بيئة غير إنتاجية.

## Student form and fee policy

- `withdrawal_reason`: مطلوب، نص غير فارغ لا يقل عن 10 أحرف.
- `impact_acknowledgment`: مطلوب ويجب أن يساوي `true`.
- الخدمة مجانية وفق العقد؛ لا بوابة دفع، ولا مبلغ، ولا عملة، ولا بيانات مالية وهمية.

## Files changed

- `src/lib/student-requests/file-withdrawal-contract.ts`
- `tests/student-requests/file-withdrawal-source-01.test.ts`
- `docs/migration-drafts/FILE-WITHDRAWAL-SOURCE-01.sql`
- `docs/ALL-STUDENT-REQUESTS-BATCH-B1-03-FILE-WITHDRAWAL-REPORT.md`

## Shared changes deferred

- استبدال تعريف `file_withdrawal` القديم داخل `request-workflow-preview-registry.ts` بالسلسلة المتتابعة المعتمدة؛ الملف مشترك وخارج الملكية.
- تحويل مسودة SQL الخاصة بالخدمة ومسودة توسعة المجالات إلى migration مشتركة معتمدة، بما يشمل الجدول وRPCs وصفوف workflow.
- ربط validator الخاص بالخدمة بمسار submit المشترك بعد اعتماد أساس persistence.
- تنفيذ مصفوفة RPC الإيجابية والسلبية في قاعدة اختبار آمنة بعد تطبيق الأساس.

لا يمنع ذلك جاهزية عقد المصدر، لكنه يمنع الادعاء بأن الخدمة مفعلة runtime أو إنتاجيًا.

## Assumptions, risks, blockers

- الافتراض: التعيينات المذكورة في عقد الخدمة ومسودة توسعة المجالات هي التعيينات الفعلية المعتمدة؛ لم يتم الاتصال بالإنتاج للتحقق منها.
- الخطر: المعاينة المشتركة القديمة تعرض تدفقًا ورسومًا مخالفين للعقد حتى يُنجز التغيير المشترك.
- الخطر: مسودة SQL توثّق ضوابط التنفيذ ولا تُطبقها؛ لا حماية RPC جديدة قبل اعتماد migration.
- العائق المؤجل: تغييرات الأساس المشتركة المذكورة أعلاه.

## Verification

- Service test: PASS — 6 tests.
- Full `bun test tests/student-requests`: PASS — 265 tests, 0 failures.
- `bunx tsc --noEmit`: PASS.
- `git diff --check`: PASS.

Independent review remediation:

- Removed the legacy parallel-clearance special case; `file_withdrawal` now has no parallel group contract.
- Workflow-save validation now requires the exact seven-step order and rejects every parallel group.
- Removed the obsolete file-withdrawal grade-statement, clearance-summary, and archive-package document definitions. The service has no document/PDF/Storage generation contract.
- Added an integration regression covering the disabled parallel and document contracts.
- Independent review round 1: HOLD (two HIGH integration conflicts); both findings were remediated before round 2.
- Build: غير مطلوب؛ التغيير عقد TypeScript واختبارات ومسودة SQL فقط.

## Production impact

لا أثر إنتاجي. لم تُطبق migration، ولم يحدث اتصال كتابي بـSupabase، ولم تتغير بيانات أو طلبات أو وثائق أو `student_visible`، ولم يُعدل `enrollment_certificate`، ولم يحدث deploy أو push.

## Resume after shared-foundation merge — 2026-07-17

- Merged `origin/main` at `2834e577` into the isolated feature branch without rebase, reset, or force.
- The shared foundation now supplies the B1 form, service adapter, strict direct-assignee authorization contract, fee policy, and ordered workflow.
- Replaced the stale `file_withdrawal` preview that showed dean/department steps, parallel clearance, a fee, and document issuance. The preview now exactly follows the seven-step sequential source contract and sets `processingUnitCode`, `roleKey`, and `actionType` on every staff step.
- Added a regression assertion that compares the shared preview to `FILE_WITHDRAWAL_STEPS` and rejects fee, document, parallel, admin, and dean semantics.
- The source-only SQL remains a draft under `docs/migration-drafts`; it was not applied.

Current decision: `PASS_BATCH_B1_AGENT_03_READY_FOR_INDEPENDENT_REVIEW` after the mandatory verification gates below complete successfully.

Verification after merge and preview correction:

- `bun test tests/student-requests`: PASS.
- `bunx tsc --noEmit`: PASS.
- `bun run build`: PASS (dependency bundler warnings only).
- `git diff --check`: PASS.
