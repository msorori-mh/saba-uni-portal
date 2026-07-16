# BATCH B1 — التصميم الموحّد للأساس المشترك لطلبات الطلاب

## A. القرار التنفيذي

القرار التصميمي هو **البدء بأساس مشترك صغير ومغلق افتراضياً قبل تنفيذ الخدمات الخمس بالتوازي**. لا يمكن دمج عقود `enrollment_suspension` و`excused_absence` و`department_transfer` و`final_chance` و`file_withdrawal` بأمان عبر تعديلات خدمة منفصلة فقط؛ فمسار النموذج، إنشاء الطلب، حفظ جدول التفاصيل، إنشاء workflow runtime، وحسم المكلّف المباشر كلها نقاط مشتركة.

المشترك: تطبيع الأكواد، سجل نماذج قابل للتمديد، محولات المرجع والتفاصيل، عملية إرسال ذرية، منشئ workflow، حسم المكلّف المباشر، مفردات الإجراءات، وسياسة الرسوم. الخاص بالخدمة: الحقول، جدول التفاصيل، validators، تعريف الخطوات والانتقالات، شروط الاكتمال، وآثار التطبيق الأكاديمي. بعد تثبيت واجهات الأساس واختبارها يمكن تنفيذ الخدمات بالتوازي مع ملكية ملفات غير متداخلة.

هذا التقرير **DESIGN-ONLY**. لا يفعّل خدمة ولا يعدّل runtime أو UI أو SQL أو قاعدة بيانات.

## B. جرد التنفيذ الحالي والفجوات

| الملف/الرمز | السلوك الحالي | الفجوة المؤثرة في B1 |
|---|---|---|
| `request-type-registry.ts` / `normalizeStudentRequestTypeCode` | يطبّع aliases مع إبقاء DB كما هي | لا يعرّف `final_chance -> extra_chance`، وتوصيف الرسوم/الوثائق لبعض B1 يخالف السياسة الملزمة |
| `request-form-registry.ts` | تعريفات ثابتة وvalidation عام؛ الخيارات المرجعية Placeholders؛ التخزين `form_data` staging | لا `referenceResolver` ولا `detailBinding` ولا حقول repeatable ولا validation خاص بالخدمة |
| `DynamicStudentRequestForm.tsx` | renderer عام للحقول الثابتة | لا تحميل خيارات آمنة ولا repeatable rows ولا رفع مرفقات متكامل؛ يعرض schema pending |
| `student.requests.new.tsx` | يطبّع الكود، يتحقق واجهياً، ثم يستدعي server function | يعطّل الأنواع ذات المرفقات ولا يجوز اعتباره بوابة تفويض أو صحة نهائية |
| `student-request-submit-contract.ts` | sanitization وnormalization وبناء payload | لا يحوّل الحقول إلى جدول تفاصيل ولا يضمن الذرية بين الطلب والتفاصيل/workflow |
| `student-request-rpc.ts` | `create_student_request` ثم `submit_student_request` | RPC العام يحمل `form_data` فقط ولا يثبت تفاصيل الخدمات الخمس |
| `request-workflow-preview-registry.ts` | معاينة ثابتة؛ `enrollment_certificate` موثق بدقة نسبية | مسارات B1 الحالية قديمة: رسوم/وثائق/أرشفة زائدة، توازٍ قديم للسحب، ولا `final_chance` |
| `request-workflow-save-contract.ts` | يتحقق من draft workflow ومفردات حالية | يحتاج تعريفات B1 النهائية وتوافق action vocabulary دون توسيع صامت |
| `staff-action-contract.ts` | حواجز واجهة/عقد محلي للإجراءات | لا يغني عن اختبار RPC المباشر ولا يمنح bypass لأي دور |
| `StudentRequestsSection.tsx` | يحتوي نماذج وشروطاً خاصة تاريخية | يجب نقل شروط B1 إلى registry/adapters مع إبقاء واجهة القسم مستهلكاً فقط |
| migrations الأساسية | `create_student_request`, `submit_student_request`, `initialize_student_request_workflow`, runtime و`act_on_student_request_step` موجودة | أي تعديل لاحق يكون migration جديدة مراجعة، لا تعديل migrations مطبقة؛ لا migration في هذه المرحلة |
| مخطط `extra_chance`/`department_transfer` | جداول وvalidators وآثار قديمة موجودة | اختلاف code/value contracts، وحاجة تعيين مباشر لرئيسي القسم، وسياسة رسوم غير محسومة |

الخدمات المتأثرة مباشرة: الخدمات الخمس كلها. يجب حماية `enrollment_certificate` باختبارات regression وعدم تعديل مساره إلا لتوافق موثق.

## C. الأكواد المعيارية والتوافق الرجعي

- الكود المعياري في المصدر والواجهة والتقارير هو `final_chance`.
- الكود المخزن التاريخي هو `extra_chance` ويظل كما هو؛ لا rename ولا backfill ولا migration تحويلية.
- يضاف alias قراءة: `extra_chance -> final_chance`. المقارنة، العرض، اختيار النموذج، نافذة الخدمة، والمعاينة تعمل على canonical.
- عند الكتابة/الترشيح: adapter يعيد canonical إلى الأكواد الفعلية المتاحة في DB؛ ما دام الصف المخزن هو `extra_chance` تكتب RPC القيمة المخزنة وتوسّع filters إلى `final_chance|extra_chance` حسب السياق. لا يرسل العميل قرار التخزين.
- لا ينشأ صف نوع جديد ولا يتغير `student_visible` ضمن الأساس.
- قيم `chance_type` الجديدة المطلوبة هي `additional_exam|grade_recovery`، بينما القيد القديم يقبل `final_chance|additional_chance`. **لا يوجد mapping دلالي آمن تلقائي**؛ تبقى خدمة الإرسال معطلة fail-closed حتى قرار المستخدم وتحديث مخطط لاحق معتمد.

## D. سجل النموذج والمحولات

يقترح توسيع `RequestFormDefinition` بعقد typed خارج renderer:

```ts
type RequestServiceAdapter = {
  canonicalCode: string;
  storedCodes: readonly string[];
  fields: readonly FieldDefinition[];
  referenceResolvers: readonly ReferenceResolver[];
  validate(input, trustedContext): ValidationResult;
  detailBinding: DetailBinding;
  workflow: WorkflowDefinition;
  feePolicy: FeePolicy;
};
```

`ReferenceResolver` معرّف بالاسم لا بنص query من العميل، ويعيد فقط بيانات الطالب المسموح بها: الأعوام والفصول الفعلية، تسجيلات المقررات في الفصل النشط، الأقسام/البرامج المسموحة، والسياق الأكاديمي. عند فشل resolver أو غياب السياق أو وجود قيمة خارج القائمة يفشل الإرسال؛ لا fallback إلى placeholder أو قيمة client.

`detailBinding` يحدد table، mapping، repeatability، والتحويلات المسموحة. أمثلة: تعليق `terms_acknowledgment` في `form_data` فقط؛ ربط `target_academic_year/target_semester` إلى معرفات تفاصيل الوقف؛ صف لكل غياب؛ تحويل `target_*` إلى `requested_*` في التحويل؛ وحفظ سبب السحب والإقرار. الـrenderer يبقى عاماً ويضاف له repeatable group وresolved select وattachment slot دون شروط خدمة مكتوبة داخله.

التحقق ذو طبقتين: UX محلي مطابق للعقد، ثم تحقق server/DB نهائي باستخدام هوية وسياق موثوقين. لا يقبل أي ID لم يرجعه resolver للطالب الحالي.

## E. الإرسال الذري وحفظ التفاصيل

التصميم المستهدف RPC واحدة service-aware أو wrapper transaction واحد: يقفل هوية الطالب والنوع، يطبّع canonical إلى stored code، يتحقق من الأهلية/النافذة/التكرار والمراجع، ينشئ أو يقفل الطلب، يحفظ `form_data` المنظف، يكتب تفاصيل الخدمة، يربط المرفقات المرفوعة فعلياً، ثم ينشئ workflow بعد نجاح كل validators. أي فشل يلغي الطلب والتفاصيل والمرفقات المنطقية والخطوات في المعاملة نفسها.

لإعادة الإرسال، يسمح فقط بطلب يملكه الطالب وحالته `draft` أو `returned_to_student` وبـversion/lock يمنع السباق؛ تستبدل التفاصيل ضمن المعاملة أو تحدّث حسب مفتاحها، ثم تعاد validation كاملة. لا ينشأ workflow مكرر، ولا يستأنف workflow قبل اكتمال التفاصيل.

العميل لا يحدد `student_profile_id` ولا processing unit/role/assignee ولا fee state ولا completion status. `enrollment_certificate` يستمر عبر عقده الحالي وتغطية regression؛ لا يُنقل إنشاء الوثيقة من `document_issuance` ولا يشارك في adapter جديد قبل إثبات توافق كامل.

## F. دورات الحياة النهائية

القاعدة العامة: `submit` يدخل أول خطوة فقط؛ كل خطوة مطلوبة ومتسلسلة ما لم يذكر خلاف ذلك. `reject` ينهي مرفوضاً، و`return_to_student` يعيد للطالب ثم يعيد التحقق عند الإرسال. لا bypass عام.

### `enrollment_suspension` — مجاني

| step_key | unit / role | action | نجاح وانتقال |
|---|---|---|---|
| `initial_review` | `student_affairs / student_affairs_specialist` | `review` | `reviewed -> manager_approval` |
| `manager_approval` | `student_affairs / student_affairs_manager` | `approve` | `approved -> registrar_apply` |
| `registrar_apply` | `registrar / registrar_general` | `apply_decision` | بعد تطبيق الحالة: `applied -> completed` |

لا رسوم ولا مالية ولا وثيقة ولا PDF ولا storage ولا archive artifact. الاكتمال بعد تسجيل أثر الحالة الأكاديمية فقط.

### `excused_absence` — مجاني ومرفق حقيقي إلزامي

| step_key | unit / role | action | نجاح وانتقال |
|---|---|---|---|
| `student_affairs_intake` | `student_affairs / student_affairs_specialist` | `review` | `reviewed -> manager_review` |
| `manager_review` | `student_affairs / student_affairs_manager` | `approve` | `approved -> record_apply` |
| `record_apply` | `student_affairs / student_affairs_specialist` | `apply_decision` | بعد `record_applied_at` لكل صف: `applied -> completed` |

لا مالية أو وثيقة أو archive artifact. كل صف غياب يرتبط بمقرر مسجل وتاريخ ضمن النافذة، مع مرفق في `student_request_attachments`.

### `department_transfer` — دفع خارجي مع تأكيد يدوي

| step_key | unit / role | action | نجاح وانتقال |
|---|---|---|---|
| `student_affairs_intake` | `student_affairs / student_affairs_specialist` | `review` | `reviewed -> source_department_head_approval` |
| `source_department_head_approval` | `department / department_head` | `approve` | `approved -> target_department_head_approval` |
| `target_department_head_approval` | `department / department_head` | `approve` | `approved -> dean_approval` |
| `dean_approval` | `dean / dean` | `approve` | `approved -> payment_confirmation` |
| `payment_confirmation` | `finance / revenue_finance_officer` | `confirm_payment` | `payment_confirmed -> registrar_apply` |
| `registrar_apply` | `registrar / registrar_general` | `apply_decision` | بعد تحديث موثق للقسم/البرنامج: `applied -> completed` |

رئيسا القسم مثبتان مباشرة. لا `fee_assessment` ينتج مبلغاً؛ الخطوة المالية تؤكد سداداً خارجياً فقط بعد وجود إعداد `fee_type.code` معتمد.

### `final_chance` (stored alias: `extra_chance`) — دفع خارجي مع تأكيد يدوي

| step_key | unit / role | action | نجاح وانتقال |
|---|---|---|---|
| `student_affairs_intake` | `student_affairs / student_affairs_specialist` | `review` | `reviewed -> manager_review` |
| `manager_review` | `student_affairs / student_affairs_manager` | `approve` | `approved -> dean_decision` |
| `dean_decision` | `dean / dean` | `approve` | `approved -> payment_confirmation` |
| `payment_confirmation` | `finance / revenue_finance_officer` | `confirm_payment` | `payment_confirmed -> registrar_apply` |
| `registrar_apply` | `registrar / registrar_general` | `apply_decision` | بعد `chance_applied_at`: `applied -> completed` |

التفعيل محجوز حتى حسم `chance_type` و`fee_type.code`.

### `file_withdrawal` — مجاني ومتسلسل

| step_key | unit / role | action | نجاح وانتقال |
|---|---|---|---|
| `student_affairs_intake` | `student_affairs / student_affairs_specialist` | `review` | `reviewed -> library_clearance` |
| `library_clearance` | `library / library_officer` | `clear` | timestamp ثم `cleared -> labs_clearance` |
| `labs_clearance` | `labs / labs_manager` | `clear` | timestamp ثم `cleared -> activities_clearance` |
| `activities_clearance` | `student_affairs / student_affairs_manager` | `clear` | timestamp ثم `cleared -> finance_clearance` |
| `finance_clearance` | `finance / revenue_finance_officer` | `clear` | تحقق مخالصة خارجية بلا مال ثم `cleared -> registrar_apply` |
| `registrar_apply` | `registrar / registrar_general` | `apply_decision` | يضبط `withdrawn` و`records_transferred_at` ثم `applied -> archive` |
| `archive` | `archive / archive_officer` | `archive` | بعد كل timestamps والحالة: `archived -> completed` |

لا دفع ولا مبلغ ولا عملة ولا وثيقة/PDF/storage. `archive` سجل workflow/حفظ فقط وليس إصدار artifact.

## G. حسم رئيس القسم

عند إرسال التحويل، يقرأ الخادم `current_department_id` من ملف الطالب الموثوق و`requested_department_id` من تفاصيل تم التحقق منها. لكل قسم يبحث عن **تعيين processing نشط واحد فقط** لوحدة `department` ودور `department_head` ومتطابق مع القسم، ثم يثبت `faculty_profiles.id` في `assigned_faculty_profile_id` للخطوة المناسبة.

يفشل الإرسال قبل إنشاء workflow عند: عدم وجود رئيس، تعدد رؤساء نشطين، تعيين غير نشط، عدم تطابق القسم، تساوي القسمين حيث يمنعه العقد، أو عدم قدرة الربط إلى profile واحد. يمنع fallback إلى role pool. اختبارات العزل: رئيس المصدر لا يعمل على الهدف، رئيس الهدف لا يعمل على المصدر، رئيس قسم ثالث مرفوض، ونفس unit/role بلا direct assignment مرفوض.

## H. مفردات الإجراءات

النوع الحالي يدعم `review|approve|reject|return_to_student|request_attachment|request_payment|assess_fee|confirm_payment|sign|archive|issue_document|complete`. B1 يحتاج إضافة `clear` و`apply_decision` إلى TypeScript validation وDB whitelist/runtime mapping في تغيير لاحق متزامن.

خريطة نتائج النجاح: `review -> reviewed`، `approve -> approved`، `clear -> cleared`، `apply_decision -> applied`، `confirm_payment -> payment_confirmed`، `archive -> archived`. تبقى `sign -> signed` و`issue_document -> issued` خاصة بمسارات الوثائق؛ لا تستخدمها B1. أي action غير مطابق لـ`action_type` أو transition غير معرف يرفض، ولا يُترجم `complete` تلقائياً إلى تطبيق قرار.

## I. سياسة الرسوم

| الخدمة | السياسة | النتيجة التشغيلية التصميمية |
|---|---|---|
| `enrollment_suspension` | `FREE_NO_PAYMENT` | لا خطوة مالية ولا بيانات مالية |
| `excused_absence` | `FREE_NO_PAYMENT` | لا خطوة مالية ولا بيانات مالية |
| `file_withdrawal` | `FREE_NO_PAYMENT` | `finance_clearance` مخالصة خارجية فقط وليست دفعاً |
| `department_transfer` | `PAID_EXTERNAL_MANUAL_CONFIRMATION` | `payment_confirmation` فقط، لا gateway/amount/currency |
| `final_chance` | `PAID_EXTERNAL_MANUAL_CONFIRMATION` | `payment_confirmation` فقط، لا gateway/amount/currency |

رمزا `fee_type.code` للخدمتين المدفوعتين غير مثبتين في التقارير/المصدر. يمكن بناء الأساس والأنواع والاختبارات، لكن لا تفعيل إرسال الخدمتين ولا إنشاء خطواتهما المالية قبل القرار والتهيئة المعتمدة. يمنع اختراع مبلغ أو عملة أو صف مالي وهمي. الدفع يحدث في النظام الجامعي الرئيسي، والبوابة تسجل تأكيد الموظف اليدوي فقط.

## J. ثوابت سحب الملف

السلسلة الملزمة هي: `student_affairs_intake -> library_clearance -> labs_clearance -> activities_clearance -> finance_clearance -> registrar_apply -> archive`. ملكية الأنشطة `student_affairs/student_affairs_manager`. لا توازٍ ولا تخطٍ. كل clearance يكتب timestamp خاصاً به. `registrar_apply` يجب أن يثبت الحالة `withdrawn` و`records_transferred_at` قبل فتح archive. archive يفشل إن غاب أي timestamp أو لم تكن الحالة withdrawn. لا تنشأ وثيقة أو PDF أو storage artifact.

## K. مصفوفة التفويض الملزمة

تطبق على **كل خطوة من كل خدمة** عبر استدعاء RPC مباشر:

| الحالة | المتوقع |
|---|---|
| `auth.uid` صاحب `assigned_faculty_profile_id` + unit + role الصحيحان + action الصحيح + predecessor مكتمل | ALLOW |
| نفس role لكن ليس المكلّف المباشر | DENY |
| unit صحيح/role خطأ أو العكس | DENY |
| بلا تعيين processing نشط | DENY |
| admin أو registrar أو dean خارج خطوته المحددة | DENY |
| action غير action_type | DENY |
| predecessor غير مكتمل أو خطوة ليست active | DENY |
| محاولة العمل على طلب قسم آخر | DENY |

التعيين المباشر له الأولوية المطلقة ولا يوجد bypass عام. إخفاء زر أو validation في TypeScript ليس تفويضاً.

## L. خطة SQL/المصدر اللاحقة

لا migration الآن. الترتيب المستقبلي المقترح:

1. مصدر عقد مشترك للأكواد/action vocabulary وسياسات الخدمة، مع اختبارات source-only.
2. migration جديدة توسع الوحدات/الأدوار المطلوبة فقط وتتحقق من التعيينات الموجودة دون إنشاء أشخاص.
3. migration تفاصيل/constraints/validators لكل خدمة، مع حسم `chance_type` أولاً.
4. migration إرسال ذري service-aware وحسم رئيس القسم fail-closed.
5. migration تعريف workflows/transitions ثم runtime authorization hardening.
6. تفعيل مدروس لكل نوع بعد RPC matrix في بيئة آمنة؛ لا تغيير `student_visible` ضمن هذه الخطة تلقائياً.

بوابات rollback: كل مرحلة مستقلة، idempotent قدر الإمكان، لا تعدل migration مطبقة، ولا تحذف بيانات. لا تفعّل workflow إن غابت جداول التفاصيل أو resolvers أو fee config. مراجعة constraints الحالية واجبة قبل أي DDL، خصوصاً `chance_type` وحالات الطلب.

## M. خطة الواجهة

- يجعل `request-form-registry` تعريفاً فقط، وطبقة adapters مسؤولة عن resolvers/validation/detail binding.
- ينقل منطق B1 الخاص من `StudentRequestsSection.tsx` إلى adapters، وتصبح `student.requests.new.tsx` و`DynamicStudentRequestForm` مستهلكين عامين.
- routing يقبل canonical code ويطبعه؛ lookup/submit يختاران stored code على الخادم.
- resolved selects وrepeatable absence rows والمرفقات تعرض حالات loading/error، وتغلق الإرسال عند الفشل.
- UI لا يوسّع التفويض ولا يرسل assignee/status/fee truth. رسائل التعطيل تشرح سبب عدم الجاهزية دون الادعاء بالتفعيل.

## N. خطة الاختبارات

1. Unit: aliases، filter expansion، form definitions، resolvers، validators، bindings، fee policies، workflow definitions، action mapping.
2. Source tests: وجود SQL objects/constraints/transitions وعدم وجود مبلغ/عملة/gateway أو document/storage paths في B1.
3. RPC آمن: حالة ALLOW واحدة وحالات DENY في مصفوفة K لكل خطوة، بما فيها العزل بين الأقسام.
4. transaction: فشل detail/attachment/workflow يعيد كل شيء؛ resubmit لا يكرر runtime.
5. خدمة: نافذة الوقف والغياب، صفوف غياب متعددة ومرفق حقيقي، transfer heads، chance values، وسلسلة withdrawal/timestamps.
6. regression: `enrollment_certificate` يبقى 259 baseline وعقد sign/document_issuance/archive؛ التوقيع لا ينشئ artifact.
7. سلبية: الخدمات المجانية لا تنشئ payment data، والمدفوعة لا تقبل amount/currency من العميل؛ B1 لا ينشئ وثائق.
8. aliases/windows: `final_chance/extra_chance` في القراءة والكتابة/filter/window، ومسارات الاختبار مستقلة عن نظام التشغيل.

## O. مشكلة البيئة المنفصلة

الخط الأساسي المعتمد في المستودع الرئيسي: `259 pass / 0 fail` وTypecheck ناجح. Agent 01 وAgent 02 حصلا على `183 pass` مع أربعة أخطاء تحميل (`@pdf-lib/fontkit` و`lucide-react` و`@tanstack/react-start` وEPERM في React runtime)، مع نجاح Typecheck و`git diff --check`. Agent 03 حصل على `265 pass` لأن ملفه أضاف 6 اختبارات، وTypecheck ناجح.

هذا نمط resolver/HardLinks/صلاحيات محلي في Bun/node_modules ويجب تشخيصه كمسار مستقل دون `reset` أو `clean` أو `stash`. لا تنسب الأخطاء إلى خدمات B1 بلا دليل، ولا تخفض بوابة الاختبارات بسببها.

## P. تفكيك التنفيذ وملكية الملفات

1. **Foundation contracts**: مالك واحد لـ`request-type-registry`, action types، adapter interfaces والاختبارات.
2. **Form/reference foundation**: مالك واحد لـ`request-form-registry`, renderer، server resolvers؛ لا يعمل مالك خدمة على هذه الملفات.
3. **Submit transaction design/source**: مالك واحد لعقد الإرسال ومصدر SQL المستقبلي والاختبارات الذرية.
4. **Workflow/auth foundation**: مالك واحد للpreview/save/runtime source ومصفوفة RPC.
5. بعد دمج 1–4، فروع خدمة منفصلة تملك ملفات adapters/details/tests الخاصة بها: suspension+absence، transfer+final chance، withdrawal.
6. **Integration owner** فقط يربط registrations في الملفات المشتركة، ثم regression شامل. لا يشترك وكيلان في ملف قابل للتعديل في الوقت نفسه.

## Q. القرارات المفتوحة

1. **NEEDS_USER_DECISION:** ما `fee_type.code` المعتمد لكل من `department_transfer` و`final_chance`؟ حتى الحسم تبقيان disabled قبل الإرسال المالي.
2. **NEEDS_USER_DECISION:** ما المطابقة الأكاديمية الصحيحة بين `additional_exam|grade_recovery` والقيم القديمة `final_chance|additional_chance`؟ لا تحويل تلقائي.
3. يلزم تأكيد أسماء حالات الطلب/قيودها المقبولة لنتائج `withdrawn`, `applied`, وcompletion قبل migration؛ إن كانت الحالة الأكاديمية في جدول الطالب وليست status الطلب يجب الفصل بينهما صراحة.

## R. أثر الإنتاج والقرار النهائي

لا أثر إنتاجي. لم يجر اتصال كتابي بـSupabase، ولم تنشأ أو تطبق migration، ولم يتغير runtime أو UI أو SQL أو `student_visible` أو `enrollment_certificate`، ولم يحدث Publish أو Deploy أو Push أو PR. الناتج الوحيد هو هذا التقرير التصميمي المحلي.

`PASS_BATCH_B1_SHARED_FOUNDATION_CONSOLIDATED_DESIGN_READY`
