# PORTAL-B1-FIVE-SERVICES-AUTHORIZATION-AND-VERIFICATION-01

التاريخ: 2026-07-25
الفرع: `test/b1-five-services-security-matrix-02`
السياسة: SOURCE-ONLY — لا Migration apply، لا Production write، لا Deploy/Publish، لا تغيير `student_visible`، ولا تفعيل Workflows.

## القرار

`HOLD_B1_FIVE_SERVICES_AUTHORIZATION_CONFIRM_PAYMENT_PREDECESSOR_BYPASS`

## Post-PR219 execution — 2026-07-25

- Main merge commit: `b63725e02d4199b46dee604be8f8c03f72c5d414`.
- Test branch was rebased successfully without conflicts.
- PostgreSQL: disposable `postgres:17-alpine`; no host PostgreSQL, cloud endpoint, Production, or Staging connection.
- PR #219 promoted migrations orders 7–18 compiled successfully in the local PG17 compile harness.
- Full real-RPC matrix stopped at the first security failure, as required.

### Security failure

`final_chance / payment_confirmation / incomplete_predecessor` unexpectedly
returned success through the real
`record_external_university_payment_confirmation(uuid,text)` RPC while the
synthetic predecessor runtime step was `pending`.

Exact harness failure:

```text
B1_NEGATIVE_ALLOWED:final_chance:payment_confirmation:incomplete_predecessor
```

The specialized payment RPC verifies active payment step, exact direct
assignee, finance binding, action type, and payment transition, but does not
invoke `workflow_runtime_predecessors_satisfied(p_step_id)` or an equivalent
locked predecessor assertion before mutation. A malformed or directly-created
active payment runtime step can therefore advance despite an incomplete
predecessor.

Zero-mutation assertions passed for preceding denied cells. The failing cell
was an authorization allow, so execution stopped before counting a complete
matrix or running subsequent attachment/enrollment-certificate/full repository
gates.

### Required Cursor forward patch

Do not edit the applied migration. Add a reviewed forward migration that
updates `record_external_university_payment_confirmation(uuid,text)` to:

1. lock/read the target runtime step;
2. call `workflow_runtime_predecessors_satisfied(p_step_id)` (or the exact
   canonical equivalent) before any UPDATE/INSERT;
3. raise a stable error such as `PAYMENT_CONFIRMATION_PREDECESSOR_INCOMPLETE`;
4. preserve the two-argument contract and all existing exact-assignee and
   finance-binding checks;
5. preserve server-derived actor/time and the no-financial-payload contract;
6. add direct RPC regression cases for both `department_transfer` and
   `final_chance`, including complete predecessor ALLOW and incomplete
   predecessor DENY with full zero mutation.

After that patch merges, rerun
`tests/b1-five-services-authorization/run-full-matrix.ps1`.

PR #219 مدمج في المصدر، لكن تفعيل الخدمات والإنتاج ما زالا محظورين. القرار الحالي يمنع الانتقال إلى E2E أو activation حتى إصلاح predecessor guard وإعادة المصفوفة كاملة.

## الملفات التي تمت مراجعتها

- `AGENTS.md`
- `docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json`
- `docs/b1/B1-RPC-AUTHORIZATION-MATRIX-01.json`
- اختبارات `tests/student-requests` الحالية، خصوصًا authorization وatomic RPC وattachments وpayment وenrollment certificate.
- `tests/b1-rpc-matrix` و`scripts/b1-safe-rpc-matrix-harness-01`.
- مصادر `can_current_user_act_on_step` و`initialize_b1_request_workflow_strict` و`submit_b1_student_request_atomic` و`act_on_b1_student_request_step_atomic`.
- `record_external_university_payment_confirmation(uuid,text)`.
- عقد المرفقات الآمنة.
- مسار `enrollment_certificate` المحمي.
- PR #219 (`feat/b1-five-services-backend-01`, commit `916d7ec8`) وعقده المجمد والملفات المتغيرة. كان PR مفتوحًا وغير مدمج وقت المراجعة.

## الملفات المضافة

- `tests/b1-five-services-authorization/authorization-matrix.json`
- `tests/b1-five-services-authorization/rpc-authorization-harness.sql`
- `tests/student-requests/b1-five-services-authorization-verification-01.test.ts`
- هذا التقرير.

لم تُعدّل ملفات `docs/migration-drafts` أو `supabase/migrations` أو generated types أو الواجهة.

## مصفوفة الخدمات والخطوات

| الخدمة | الخطوات والأدوار |
|---|---|
| `enrollment_suspension` | initial review / student affairs specialist؛ manager approval / student affairs manager؛ registrar apply / registrar |
| `excused_absence` | intake / student affairs specialist؛ manager review / student affairs manager؛ record apply / student affairs specialist |
| `department_transfer` | intake؛ source department head؛ target department head؛ dean؛ payment confirmation / assigned revenue officer؛ registrar apply |
| `final_chance` | intake؛ manager؛ dean؛ payment confirmation / assigned revenue officer؛ registrar apply |
| `file_withdrawal` | intake؛ library؛ labs؛ activities؛ finance clearance؛ registrar apply؛ archive |

المصفوفة تحتوي 24 خطوة موظف. كل صف يثبت `step_key + processing_unit + processing_role + legal action`.

## Positive coverage

- exact active direct assignee فقط.
- exact active processing unit وprocessing role.
- الإجراء المطابق لـ`action_type` فقط.
- عزل رئيس القسم المصدر عن الهدف.
- عزل رئيس القسم الهدف عن المصدر.
- revenue officer المعيّن مباشرة يستطيع `confirm_payment` فقط.
- registrar وdean مسموحان داخل خطوتهما المحددة فقط.

## Negative coverage

تثبت المصفوفة 22 فئة رفض لكل خطوة:

`anon`، الطالب المالك، طالب آخر، مستخدم بلا profile، موظف غير معيّن، نفس الدور في وحدة أخرى، رئيس قسم آخر، actor سابق، actor لاحق، admin غير معيّن، registrar خارج خطوته، dean خارج خطوته، assignment غير فعال، assignment منتهي، duplicate assignment، wrong position assignment، forged step id، طلب خدمة أخرى، action غير قانوني، predecessor غير مكتمل، replay لخطوة مكتملة، وdirect RPC bypass.

لا يوجد broad bypass لـadmin أو registrar أو dean.

## Zero mutation

يعرف harness snapshot موحدًا قبل وبعد كل رفض، ويقارن مساواة JSONB كاملة للأسطح التالية:

- `student_requests`
- current/runtime workflow steps
- جداول تفاصيل الخدمات الخمس
- attachments
- revenue confirmation events
- workflow events
- audit logs
- notifications

أي اختلاف يرمي `B1_ZERO_MUTATION_FAILED:<service>:<step>:<case>`. كل التنفيذ داخل transaction تنتهي بـ`ROLLBACK`.

## عقد PostgreSQL harness

- مغلق افتراضيًا؛ يتطلب `SET b1.authorization_harness='local-only'`.
- يتطلب PostgreSQL محليًا قابلًا للتخلص منه وBackend PR #219.
- يبدأ بـ`BEGIN`.
- يستخدم `SET LOCAL ROLE authenticated`.
- يضبط `request.jwt.claims` محليًا، ولا يعتمد كلمات مرور متعددة.
- يستخدم fixtures معزولة فقط عبر عقد `pg_temp`.
- يستدعي RPC الحقيقي مباشرة.
- يفشل إذا غابت RPCs المطلوبة أو fixture executor.
- آخر statement هو `ROLLBACK`.
- لا يحتوي بيانات اتصال سحابية أو مفاتيح أو حسابات إنتاجية.

## Revenue confirmation

التغطية تثبت:

- signature ثنائي: workflow step id + optional note.
- actor من `auth.uid()`.
- timestamp من `now()`.
- exactly one direct assignee.
- exact finance/revenue processing binding.
- لا `payment_not_confirmed` ولا رفض تلقائي؛ عدم الإجراء يبقي الخطوة معلقة.
- لا amount أو currency أو invoice أو gateway أو payment reference أو balance.
- لا client-supplied actor/status/time.

## المرفقات

تغطية source-contract تثبت:

- owner-only upload intent للطلب القابل للتحرير.
- عدم ربط attachment بطلب طالب آخر.
- تنزيل الموظف يتطلب active direct assignment وexact processing binding.
- non-assignee يرفض.
- bucket خاص و`public=false` ولا public URLs.
- object path يُنشأ خادميًا من UUIDs وامتداد مشتق من MIME؛ لا يقبل path من العميل، وبذلك يفشل path traversal بنيويًا.
- MIME `{pdf,jpeg,png}` والحجم `1..5 MiB` وعدد الملفات تتحقق خادميًا.
- forged attachment/object mismatch يرفض.
- رفض attachment يدخل ضمن zero-mutation snapshot.

## حماية enrollment_certificate

لم يُعدّل مسار `enrollment_certificate`. المصفوفة تقصر authorization الصارم الجديد على الخدمات الخمس، وتحتفظ باختبارات المستودع الحالية لمسار workflow v2 والرسوم والوثائق.

يثبت harness عدم اصطدام fixtures بالسجلات:

- `SR-20260713-2DE64041`
- `SR-20260715-FEDCB3E1`
- `SR-20260716-26BAD4C8`
- `USR-2026-000001`
- `USR-2026-000002`

يجب أخذ before/after hash لهذه السجلات في البيئة المحلية المستنسخة قبل أي Hidden E2E، ولا يجوز استعمالها كfixtures أو تعديلها.

## Hidden E2E runbook — غير منفذ

1. ادمج PR #219 في فرع اختبار معزول، دون تطبيقه على production.
2. أنشئ PostgreSQL محليًا قابلًا للتخلص منه وطبّق schema/migrations وفق الترتيب المعتمد محليًا فقط.
3. ثبّت fixture package اختبارية في `pg_temp` تنشئ طلابًا وموظفين وتعيينات UUID معزولة، وتوفر:
   - `pg_temp.b1_authz_fixture_step(service,step_key)`
   - `pg_temp.b1_authz_execute_denial(case_name,service,step_key)`
4. تحقق أن workflow drafts محلية فقط؛ لا تغيّر `student_visible`.
5. نفذ `SET b1.authorization_harness='local-only';` ثم شغّل `rpc-authorization-harness.sql`.
6. لا تبدأ browser E2E حتى تكون كل Positive/Negative RPC rows وzero-mutation assertions خضراء.
7. شغّل Hidden E2E على fixtures المحلية فقط: submit → كل خطوة exact assignee → payment confirmation للخدمتين → registrar.
8. تحقق أن enrollment certificate baseline hashes لم تتغير.
9. احتفظ بالـlogs دون أسرار ثم أتلف قاعدة الاختبار كاملة.

## ما يعمل الآن وما ينتظر PR #219

يعمل الآن:

- اختبار Bun لبنية المصفوفة (5 خدمات، 24 خطوة، 22 negative cases).
- عقود transaction/JWT/ROLLBACK/local-only.
- عقود zero mutation surfaces.
- عقد payment المبسط الموجود على base.
- عقود المرفقات الآمنة.
- التكامل المشروط الذي لا يدعي وجود ملفات PR #219 قبل الدمج.

ينتظر PR #219:

- تشغيل PostgreSQL الفعلي ضد promoted migrations orders 7–18.
- ACL/RLS الفعلي لجداول التفاصيل والمرفقات بعد cutover.
- fixture executor المحلي واختبار direct RPC لكل خلية.
- Hidden E2E؛ محظور قبل اكتمال النتائج التنفيذية للمصفوفة.

## Findings

### CRITICAL

لا findings مؤكدة في المصدر الذي تمت مراجعته.

### HIGH

لا findings مؤكدة. عدم دمج PR #219 حالة dependency متوقعة، وليس bypass مثبتًا.

### MEDIUM

1. المصفوفة التنفيذية الكاملة غير قابلة للتشغيل على base الحالي لأن PR #219 غير مدمج. الـharness يفشل مغلقًا بـ`B1_PR219_RPC_CONTRACT_NOT_INSTALLED`.
2. fixture executor متروك عمدًا لطبقة اختبار محلية بعد الدمج حتى لا تُنشأ حسابات أو تعيينات وهمية في المصدر الإنتاجي. غيابه يفشل بـ`B1_TEST_FIXTURE_EXECUTOR_REQUIRED`.

تعليمات Cursor: لا تعديل مباشر من هذا المسار. بعد دمج PR #219، يجب توفير fixture package محلية فقط تطبق عقد `pg_temp` أعلاه؛ وإذا اختلف signature أو اسم جدول، يُحدّث Backend أو يقدم compatibility patch دون تغيير قواعد التفويض أو إضافة bypass.

## اختبارات التحقق

| الأمر | النتيجة |
|---|---|
| `bun test tests/student-requests/b1-five-services-authorization-verification-01.test.ts` | PASS — 7/7 |
| `bun test tests/b1-rpc-matrix` | PASS — 22/22 |
| `bun test tests/student-requests` | ENVIRONMENT BLOCKED بعد 514 PASS؛ أربعة import errors قديمة بسبب غياب `react/jsx-dev-runtime` و`@tanstack/react-start` محليًا، دون assertion failure من الملفات المضافة |
| `bunx tsc --noEmit` | ENVIRONMENT BLOCKED — Bun لا يستطيع الكتابة إلى tempdir، ولا يوجد local `node_modules/.bin/tsc` |
| `bun run security:test` | NOT RUN — runner يتصل بـstaging وحسابات خارجية؛ لا تتوفر بيئة آمنة محلية مصرح بها |
| `git diff --check` | PASS |

## تعليمات الدمج بعد Backend

1. ادمج PR #219 أولًا أو أعد base لهذا الفرع فوق commit المعتمد منه.
2. حل التعارضات في ملفات الاختبار والتقرير فقط؛ لا تُعدّل migrations المملوكة لـCursor من هذا الفرع.
3. شغّل source tests ثم PostgreSQL harness المحلي.
4. لا تفعّل Workflows ولا `student_visible` ولا E2E قبل اكتمال المصفوفة الخضراء.
5. أي failure في positive/negative أو zero mutation يحول القرار إلى `HOLD_AUTHORIZATION_MATRIX_<EXACT_SOURCE_BLOCKER>`.

## الافتراضات والمخاطر والعوائق وأثر الإنتاج

- الافتراض: عقد PR #219 عند commit `916d7ec8` هو عقد التكامل المستهدف.
- المخاطر: تغيير PR قبل الدمج قد يتطلب تحديث matrix/harness.
- العائق المتبقي للتنفيذ الكامل: PR #219 وfixture executor المحلي.
- أثر الإنتاج: صفر؛ لم يحدث اتصال أو كتابة أو Migration apply أو Deploy/Publish.

---

## نتيجة التنفيذ الكاملة بعد PR #220 — 2026-07-25

هذا القسم هو النتيجة النهائية المعتمدة، ويلغي حالات الانتظار التاريخية أعلاه.

### خط الأساس والبيئة

- الفرع: `test/b1-five-services-security-matrix-02`.
- `origin/main`: `19a4d9dcd7c9fbf5437597f47b6a18196f96a422`.
- PostgreSQL: `17.10` داخل حاوية `postgres:17-alpine` عشوائية وقابلة للتخلص منها.
- قاعدة البيانات والحسابات والتعيينات: fixtures صناعية محلية فقط.
- لم يُستخدم Production أو Staging أو endpoint أو مفتاح سحابي.
- كل مصفوفة RPC نُفذت داخل transaction واحدة انتهت بـ`ROLLBACK`.
- أُوقفت الحاوية وأزيلت بعد التشغيل.
- بقي `runtimeAvailable=false`، ولم يحدث activation أو تغيير `student_visible`.

### migrations المطبقة محليًا

طبق runner المستقل 15 ملف schema/migration مدمجًا لازمًا للعقد المحلي فقط، بما فيها سلسلة B1 ذات الصلة و:

- `supabase/migrations/20260725120000_b1_confirm_payment_predecessor_guard_01.sql`

لم تُعدّل migrations ولم تُطبق على قاعدة سحابية.

### نتائج مصفوفة RPC

| التغطية | العدد | النتيجة |
|---|---:|---|
| Positive RPC cells | 24 | PASS |
| Negative RPC cells | 528 (22 لكل خطوة) | PASS |
| Zero-mutation assertions | 528 | PASS |
| Specialized checks | 9 | PASS |
| Security failures | 0 | PASS |

غطت النتائج كل خطوات الخدمات الخمس، مع exact active direct assignee، وتطابق processing unit/role/action، واكتمال predecessor، وعزل source/target department heads، ومنع أي broad bypass لـadmin أو registrar أو dean.

كل رفض قارن before/after لـ`student_requests`، والخطوة الحالية، وجميع runtime steps، وجداول تفاصيل الخدمات، والمرفقات، وتأكيد الإيراد، وworkflow events، وaudit logs، وnotifications. لم يحدث أي mutation في حالات الرفض.

### confirm_payment

- PASS للخدمتين المدفوعتين: `department_transfer` و`final_chance`.
- يقبل RPC معرف الخطوة وoptional note فقط، ويستمد actor من `auth.uid()` والوقت من قاعدة البيانات.
- exact direct revenue assignee وfinance/revenue binding مطلوبان.
- predecessor guard من PR #220 يرفض الخطوة غير المكتملة دون mutation.
- replay وnon-assignee وpayload/action غير القانوني مرفوضة.
- لا amount أو currency أو invoice أو gateway أو payment reference أو balance أو client status/actor/time.
- عدم التأكيد يبقي الطلب والخطوة active بلا mutation أو رفض تلقائي.

### المرفقات الآمنة

PASS فعلي مباشر لـRPC في: owner-only upload intent، object path الخادمي، رفض traversal وMIME والحجم غير القانوني، exact-assignee download، رفض non-assignee، رفض forged attachment id، وprivate bucket دون public URL. كل رفض متخصص شمل zero-mutation.

### حماية enrollment_certificate

نجح submit الفعلي للعقد القديم `submit_student_request` داخل rollback، وبقي workflow v2 وfee machinery ومسار ACL الحي دون تعديل. لم تُستخدم السجلات المحمية كfixtures ولم تتغير:

- `SR-20260713-2DE64041`
- `SR-20260715-FEDCB3E1`
- `SR-20260716-26BAD4C8`
- `USR-2026-000001`
- `USR-2026-000002`

### أوامر التحقق

| الأمر | النتيجة |
|---|---|
| `run-full-matrix.ps1` على PostgreSQL 17 disposable | PASS — 24 positive، 528 negative، 528 zero mutation، 0 failures |
| `bun test tests/student-requests/b1-five-services-authorization-verification-01.test.ts` | PASS — 7/7 |
| `bun test tests/b1-rpc-matrix` | PASS — 22/22 |
| `bun test tests/student-requests` | PASS — 605/605 |
| `bun test tests` | PASS — 1542/1542 |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `bun run lint` | BASELINE FAILURE — أخطاء Prettier/CRLF واسعة في ملفات غير معدلة، منها `capacitor.config.ts` و`eslint.config.js` و`public/sw.js`؛ لا finding أمني ولا تعديل تلقائي خارج النطاق |
| `git diff --check` | PASS |

### Findings

- CRITICAL: لا يوجد.
- HIGH: لا يوجد.
- MEDIUM: lint العام غير أخضر بسبب تنسيق CRLF سابق خارج ملفات هذه المهمة؛ لم يُوسّع نطاق التغيير لإعادة تنسيق المستودع.

### الملفات المعدلة في تنفيذ ما بعد PR #220

- `tests/b1-five-services-authorization/rpc-authorization-harness.sql`
- `tests/b1-five-services-authorization/run-full-matrix.ps1`
- هذا التقرير.

### الافتراضات والمخاطر والعوائق وأثر الإنتاج

- الافتراض: merge commit المحدد أعلاه وmigration الخاصة بـPR #220 هما العقد المدمج المطلوب اختباره.
- المخاطر المتبقية: لا finding أمني؛ إعادة تشغيل runner مطلوبة إذا تغير Backend بعد هذا commit.
- العوائق: لا عائق لمصفوفة التفويض. فشل lint العام baseline وغير متعلق بالمصفوفة.
- أثر الإنتاج: صفر؛ لا اتصال أو كتابة أو migration سحابية أو activation أو Deploy/Publish.

## القرار النهائي

`PASS_B1_FIVE_SERVICES_FULL_RPC_AUTHORIZATION_MATRIX`
