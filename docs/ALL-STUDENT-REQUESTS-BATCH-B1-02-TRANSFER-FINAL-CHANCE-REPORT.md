# BATCH-B1-AGENT-02 — Department Transfer + Final Chance

## القرار

`PASS_B1_02_SOURCE_SAFE_CONTRACT_HOLD_RUNTIME_DECISIONS`

السبب الحاكم: `HOLD_SHARED_FOUNDATION_CHANGE_REQUIRED`. لا يمكن تنفيذ العقدين كاملين ضمن ملكية ملفات الخدمتين ومن دون Migration تطبيقية، بسبب تعارضات موثقة بين العقود والمخطط/الواجهة المشتركة الحالية.

## التحقق الأولي — لقطة تاريخية قبل الاستئناف

> البنود في هذا القسم توثق حالة الجولة الأولى عند `1905844`. الحالة النهائية بعد دمج `bb48c3a` موثقة في قسم «استئناف 2026-07-17» و«نتائج الاستئناف» أدناه.

- الفرع: `feat/request-b1-transfer-final-chance`.
- نقطة الأساس و`HEAD`: `1905844289536de9040557d8317bbe1f09341193`.
- كانت الشجرة نظيفة قبل العمل.
- روجع عقدا `docs/request-services/department_transfer.md` و`docs/request-services/final_chance.md`.
- روجعت وحدات وأدوار المعالجة الفعلية ومسودة توسيع المجالات ومصدر تفويض خطوات runtime.

## دورة حياة `department_transfer` المطلوبة

1. `student_affairs_intake`: وحدة `student_affairs`، دور `student_affairs_specialist`، إجراء `review`.
2. `source_department_head_approval`: وحدة `department`، دور `department_head`، إجراء `approve`، مع تثبيت مباشر لرئيس القسم الحالي في `assigned_faculty_profile_id`.
3. `target_department_head_approval`: وحدة `department`، دور `department_head`، إجراء `approve`، مع تثبيت مباشر لرئيس القسم الهدف في `assigned_faculty_profile_id`.
4. `dean_approval`: وحدة `dean`، دور `dean`، إجراء `approve`.
5. `fee_assessment`: وحدة `finance`، دور `revenue_finance_officer`، إجراء `assess_fee`.
6. `payment_confirmation`: وحدة `finance`، دور `revenue_finance_officer`، إجراء `confirm_payment`.
7. `registrar_apply`: وحدة `registrar`، دور `registrar_general`، إجراء `apply_decision`.

خطوتا الرسوم تتجاوزان فقط عندما تكون الخدمة مجانية وفق إعداد رسوم معتمد، من دون إنشاء مبلغ أو عملة أو بيانات مالية وهمية. الاكتمال التعاقدي يتطلب تحديث ملف الطالب وتهيئة مراجعة المعادلة، وهي متابعة منفصلة مذكورة في العقد.

## دورة حياة `final_chance` المطلوبة

1. `student_affairs_intake`: وحدة `student_affairs`، دور `student_affairs_specialist`، إجراء `review`.
2. `manager_review`: وحدة `student_affairs`، دور `student_affairs_manager`، إجراء `approve`.
3. `dean_decision`: وحدة `dean`، دور `dean`، إجراء `approve`.
4. `fee_assessment`: وحدة `finance`، دور `revenue_finance_officer`، إجراء `assess_fee` عند عدم المجانية.
5. `payment_confirmation`: وحدة `finance`، دور `revenue_finance_officer`، إجراء `confirm_payment` عند عدم المجانية.
6. `registrar_apply`: وحدة `registrar`، دور `registrar_general`، إجراء `apply_decision`.

لا يسمح العقد للمسجل أو العميد أو الأدمن بتجاوز الخطوات السابقة. اكتمال الخدمة يتطلب ضبط `extra_chance_details.chance_applied_at` ثم إكمال الطلب.

## مصفوفة الأدوار والوحدات

| الوحدة | الدور | `department_transfer` | `final_chance` |
|---|---|---|---|
| `student_affairs` | `student_affairs_specialist` | استقبال | استقبال |
| `student_affairs` | `student_affairs_manager` | — | مراجعة واعتماد |
| `department` | `department_head` | اعتماد المصدر والهدف، كل خطوة مثبتة مباشرة | — |
| `dean` | `dean` | اعتماد | قرار |
| `finance` | `revenue_finance_officer` | تقييم/تأكيد خارجي | تقييم/تأكيد خارجي |
| `registrar` | `registrar_general` | تطبيق القرار فقط | تطبيق القرار فقط |

## اختبارات العزل والتفويض المطلوبة

لم تُضف اختبارات خدمة تدّعي نجاحًا غير قابل للتنفيذ. مصفوفة الاختبار المباشر المطلوبة عند توفير الأساس المشترك هي:

| الحالة | النتيجة المطلوبة |
|---|---|
| رئيس القسم الحالي يستدعي RPC على خطوة قسمه المثبتة له | سماح |
| رئيس القسم الهدف يستدعي RPC على خطوة قسمه المثبتة له | سماح |
| رئيس قسم آخر يستدعي RPC على أي من الخطوتين | رفض |
| موظف بلا تعيين مباشر أو تعيين معالجة مطابق | رفض |
| العميد/المسجل/الأدمن يحاول تجاوز خطوة سابقة | رفض |
| المعيّن مباشرةً مع وجود مستخدم آخر يحمل الوحدة والدور نفسيهما | السماح للمثبت مباشرةً والرفض للآخر |

التفويض العام الحالي يعطي التعيين المباشر أولوية مطلقة، لكن لا يوجد منشئ runtime خاص بالخدمة يثبت رئيسي القسمين من `current_department_id` و`requested_department_id`، لذلك لا يمكن إثبات العزل المطلوب عبر RPC لهذه الخدمة.

## التغييرات المشتركة المطلوبة

1. إضافة منشئ runtime مشترك يقرأ تفاصيل التحويل ويحل رئيس القسم الحالي والهدف إلى `faculty_profiles.id` ثم يملأ `assigned_faculty_profile_id` في الخطوتين. يجب أن يفشل الإرسال إذا لم يوجد تعيين وحيد فعال، وألا يسقط إلى role pool.
2. توحيد هوية `final_chance`: العقد يستخدم `request_types.code='final_chance'` بينما المصدر/المخطط الحاليان يستخدمان `extra_chance`.
3. توحيد قيم `chance_type`: العقد يطلب `additional_exam|grade_recovery` بينما قيد الجدول الحالي يقبل `final_chance|additional_chance`.
4. ربط نماذج الطالب في `src/components/portal/StudentRequestsSection.tsx`، وهو ملف مشترك خارج ملكية هذا الوكيل؛ النموذج الحالي يستخدم الرمزين والقيم القديمة.
5. حسم إعداد رسوم الخدمتين قبل تفعيل خطوات الرسوم. لا يجوز افتراض مبلغ أو عملة.
6. تحديد آلية تهيئة سجل مراجعة المعادلة عند تطبيق قرار التحويل، وهي متابعة منفصلة حسب العقد.

## التحقق من نماذج البيانات الحالية

- جدول التحويل الفعلي يستخدم `requested_department_id` و`requested_program_id` مقابل أسماء `target_*` في واجهة العقد؛ يمكن عمل mapping في مصدر خاص، لكن الربط الفعلي حاليًا داخل ملف مشترك.
- جدول الفرصة الفعلي موجود، لكن قيم `chance_type` لا تطابق القيم الملزمة في العقد.
- دالتا التحقق `validate_transfer_request` و`validate_extra_chance_request` موجودتان في migrations مطبقة، ولا يجوز تعديل تلك migrations.
- وحدة `department` ودور `department_head` موجودان في المصدر المطبق، وكذلك تعيينات رؤساء الأقسام، لكن ذلك لا يغني عن تثبيت الرئيس الصحيح على خطوة runtime.

## المخاطر والافتراضات

- أي اعتماد على تطابق الوحدة والدور فقط يسمح لرئيس قسم بمعالجة طلب قسم آخر؛ لذلك هو غير مقبول.
- تحويل قيم الفرصة صامتًا قد يغير المعنى الأكاديمي، لذلك لم يُفترض mapping غير موثق.
- تفعيل دورة الرسوم قبل قرار الرسوم قد ينشئ سلوكًا ماليًا غير معتمد.
- يفترض التقرير أن العقود المعطاة هي المرجع الأعلى، وأن أسماء الأعمدة الفعلية تحتاج mapping لا تغييرًا رجعيًا.

## العوائق

- أساس runtime مشترك مطلوب لتثبيت رؤساء الأقسام.
- تعارض عقد/مخطط في كود ونوع `final_chance`.
- قرار الرسوم غير محسوم في العقدين.
- ملف واجهة الطالب المطلوب للربط مشترك وخارج الملكية.

## أثر الإنتاج

لا يوجد أثر إنتاجي. لم تُطبق Migration، ولم تُكتب بيانات إلى Supabase، ولم يُغير `student_visible`، ولم يُعدل `enrollment_certificate`، ولم يحدث نشر أو Deploy.

## استئناف 2026-07-17

- دُمج `origin/main` عند `bb48c3acd7123268cfb73c5c9817200a356f4520` بطريقة fast-forward، مع حفظ هذا التقرير.
- أضيف عقد source-only للخدمتين واختبارات مباشرة لأولوية التعيين المباشر ورفض الأدوار العامة ومنع تجاوز ترتيب الخطوات.
- تحويل الأقسام يفشل مغلقاً إذا غاب قسم المصدر/الهدف، تطابقا، غاب رئيس قسم وحيد وفعال، أو تعدد المرشحون.
- بقيت الخدمتان غير متاحتين في runtime، وحالتهما `NEEDS_USER_DECISION` للرسوم وmapping الأكاديمي.
- لم يُعتمد أو يُخترع `fee_type.code` أو مبلغ أو عملة أو mapping لـ `chance_type`.
- القرارات المطلوبة موثقة في `docs/PROJECT-DECISIONS-NEEDED.md`.

## الملفات المعدلة

- `src/lib/student-requests/transfer-final-chance-contract.ts`.
- `tests/student-requests/transfer-final-chance-source-01.test.ts`.
- `docs/PROJECT-DECISIONS-NEEDED.md`.
- `docs/ALL-STUDENT-REQUESTS-BATCH-B1-02-TRANSFER-FINAL-CHANCE-REPORT.md`.

## بوابات التحقق — الجولة الأولى التاريخية

- `bun test tests/student-requests`: **فشل بيئي** — نجح 183 اختبارًا، وتعذر تحميل 4 ملفات بسبب تبعيات/صلاحيات محلية موجودة في خط الأساس: `@pdf-lib/fontkit` و`lucide-react` و`@tanstack/react-start` و`EPERM` عند قراءة `node_modules/react/jsx-dev-runtime.js`.
- `bunx tsc --noEmit`: **نجح**.
- `git diff --check`: **نجح**.
- `bun run build`: لم يُشغّل؛ لا توجد تغييرات runtime ولا حاجة فعلية له في تقرير HOLD.
- `git status --short`: ملف التقرير غير متتبع فقط.
- Commit: لم يُنشأ لأن بوابات الجاهزية لم تنجح ولأن القرار `HOLD`.

### نتائج الاستئناف

- `bun test tests/student-requests/transfer-final-chance-source-01.test.ts`: **نجح** — 4 اختبارات، 55 assertion.
- `bun test tests/student-requests`: **نجح** — 351 اختباراً، 1386 assertion.
- `bunx tsc --noEmit`: **نجح**.
- `git diff --check`: **نجح**.
- `bun run build`: **نجح** بمهلة ممتدة — 3146 وحدة client، واكتمل client وSSR build خلال 179 ثانية تقريباً.
- تحقق القائد أن علامة `src/routeTree.gen.ts` السابقة كانت metadata فقط: blob العمل والفهرس متطابقان ولا يوجد diff؛ أزيلت العلامة دون discard أو تغيير محتوى.
- القرار المصدرّي: `PASS_B1_02_SOURCE_SAFE_CONTRACT`.
- قرار التفعيل: `HOLD_B1_02_RUNTIME_NEEDS_FEE_AND_CHANCE_DECISIONS`.
