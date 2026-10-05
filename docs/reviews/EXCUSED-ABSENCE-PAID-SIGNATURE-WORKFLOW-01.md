# EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 — غياب بعذر: قرار الرسوم والتوقيعات والإرجاع والرفض

- **النطاق:** SOURCE-ONLY. لا يوجد أي تطبيق على قاعدة البيانات، ولا نشر، ولا كتابة في Supabase.
- **الفرع:** `feat/excused-absence-paid-signature-workflow`
- **مسودة قاعدة البيانات:** `docs/migration-drafts/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.sql` (مسودة مراجعة فقط، لا تُطبَّق من هذا المسار).
- **المراجعة الثانية:** تنفّذ قرارات المالك السبعة على الأسئلة المفتوحة في المراجعة الأولى.
- **المراجعة الثالثة:** استعلامات جاهزية التطبيق (فحص مسبق وتحقق لاحق) وملف تراجع مُبرهن (القسم 13 و14)، وفحص الخدمتين المدفوعتين الأخريين (`docs/reviews/B1-PAID-SERVICES-ZERO-FEE-CHECK-01.md`).
- **المراجعة الرابعة:** المبلغ المستحق كقيمة **للعرض فقط** أُدمج في المسودة نفسها بعد إضافة استثناء المالك إلى `AGENTS.md` (2026-10-06).
- **القرار:** المصدر **PASS**. التطبيق على الإنتاج بعد اخضرار CI (PostgreSQL 17 و`tsc`) ونجاح الفحص المسبق في القسم 13.

## 1. الملخص

الطالب يقدّم الطلب مع المرفقات ← العميد يراجع ← **مسجل الكلية يقرّر الرسوم لكل طلب** ← (إن كانت الرسوم مستحقة) تأكيد السداد خارج البوابة ← توقيع رئيس قسم الطالب ← توقيع العميد ← توقيع مدير شؤون الطلاب ← مسجل الكلية (تسجيل العذر) ← الأرشيف.

الجديد في هذه المراجعة: قرار رسوم بنتيجتين فقط، تخطّي تأكيد السداد عند «لا رسوم»، الرفض والإرجاع لهذه الخدمة وحدها، إشعار الطالب بقرار الرسوم، وشرط القسم برسالة عربية للطالب.

## 2. جدول الخطوات

سير العمل: `excused_absence_external_payment_workflow` — الإصدار التالي لنوع الطلب. كل الخطوات `assignment_strategy = specific_user` و`config.authorization = exactly_one_direct_assignee`.

| # | مفتاح الخطوة | الاسم الظاهر | الوحدة / الدور | الإجراء / الكتالوج | رفض | إرجاع للطالب |
|---|---|---|---|---|---|---|
| 1 | `dean_review` | مراجعة العميد وإحالة الطلب | `dean` / `dean` | `review` / `REVIEW` | نعم | نعم |
| 2 | `registrar_fee_referral` | قرار مسجل الكلية بشأن الرسوم | `registrar` / `registrar_general` | `review` / `REVIEW` عبر RPC قرار الرسوم فقط | نعم | نعم |
| 3 | `payment_confirmation` | تأكيد استلام الرسوم خارج البوابة | `finance` / `revenue_finance_officer` | `confirm_payment` / `PAYMENT_CONFIRMATION` | لا | لا |
| 4 | `department_head_signature` | توقيع رئيس القسم على استمارة الغياب | `department` / `department_head` (قسم الطالب) | `approve` / `APPROVE` | نعم | لا |
| 5 | `dean_signature` | توقيع العميد | `dean` / `dean` | `approve` / `APPROVE` | نعم | لا |
| 6 | `student_affairs_manager_signature` | توقيع مدير شؤون الطلاب | `student_affairs` / `student_affairs_manager` | `approve` / `APPROVE` | نعم | لا |
| 7 | `record_apply` | تسجيل العذر لدى مسجل الكلية | `registrar` / `registrar_general` | `apply_decision` / `REGISTER_EXCUSED_ABSENCE` | لا | لا |
| 8 | `archive` | الأرشفة | `archive` / `archive_officer` | `archive` / `ARCHIVE` | لا | لا |

الانتقالات 17: تسعة خطية، واحد مشروط (المسجل ← رئيس القسم بشرط `EXCUSED_ABSENCE_FEE_NOT_REQUIRED`، أولوية 100)، خمسة للرفض، واثنان للإرجاع. المسودة ترفض أي انتقال مشروط آخر، وأي انتقال `skip` يدوي، وأي عدم تطابق بين أعلام الخطوة وانتقالات الخروج.

ملاحظات ثابتة من المراجعة الأولى: المفتاح `record_apply` مُبقى لأن `apply_b1_excused_absence_effect` تبحث عنه حرفياً (تسجيل العذر عند هذه الخطوة مؤكَّد من المالك). التوقيعات خطوات `approve` لأن المنفّذ الذري لا يدعم `SIGN`؛ التوقيع لا ينشئ وثيقة أو PDF.

## 3. قرار الرسوم

**نتيجة الفحص:** المحرّك يدعم التفرّع المشروط فعلاً (`resolve_b1_workflow_transition` + كتالوج مغلق للشروط + تعليم الخطوات المتجاوَزة `skipped`). استُعملت الآلية نفسها ولم تُبنَ آلية جديدة. الشرطان الموجودان (`FEE_IS_ZERO` / `FEE_GREATER_THAN_ZERO`) يقرآن مبلغاً من جدول الرسوم `student_request_fee_assessments`، لذلك **لم يُستعملا**؛ أُضيف شرط كتالوج واحد يقرأ قرار المسجل لا مبلغاً.

- المسجل يسجّل نتيجة واحدة من اثنتين عبر `record_excused_absence_fee_decision`:
  - `FEE_REQUIRED`: الطالب يسدّد في النظام الجامعي الرئيسي، ثم يؤكد موظف الإيرادات في `payment_confirmation`.
  - `FEE_NOT_REQUIRED` مع سبب إلزامي: `FREE_SERVICE` (خدمة مجانية) أو `EXEMPTION` (إعفاء). تُتجاوز `payment_confirmation` (حالتها `skipped`) وينتقل الطلب مباشرة إلى `department_head_signature`.
- الـRPC تتحقق من المدخلات، ثم من التفويض بـ`can_current_user_act_on_step` نفسها (مطابق تماماً لتنفيذ الخطوة)، ثم تكتب القرار وتنفّذ الخطوة وتتحقق أن التوجيه طابق القرار (`…_ROUTING_MISMATCH` وإلا تراجع كامل)، ثم حدثاً في سجل الطلب وإشعاراً واحداً.
- **لا أحد غير المسجل:** الجدول `excused_absence_fee_decisions` بلا أي صلاحية لـ`authenticated`/`anon`، ومشغّل حارس يرفض أي إدراج خارج الـRPC. المنفّذ العام يرفض إتمام خطوة المسجل بلا قرار (`B1_EXCUSED_ABSENCE_FEE_DECISION_REQUIRED`).
- **غير قابل للتعديل:** قيد فريد على الطلب وعلى الخطوة، وأي `UPDATE` يُرفض دائماً (`B1_EXCUSED_ABSENCE_FEE_DECISION_IS_IMMUTABLE`).
- **المالية لا تؤكد سداداً غير مطلوب:** الخطوة لا تُفعَّل أصلاً في مسار «لا رسوم»، فترفض RPC التأكيد (`INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP`).
- **تفصيل في المحرّك:** فحص اكتمال السوابق لا يقبل خطوة `skipped` إلا إذا كان `can_skip = true`، لذلك ضُبط على `payment_confirmation` وحدها. لا يوجد انتقال `skip`، فلا تخطٍّ يدوي لأحد.
- **المبلغ المستحق (للعرض فقط — استثناء معتمد من المالك في `AGENTS.md`، 2026-10-06):** عند `FEE_REQUIRED` يُدخل المسجل المبلغ في العمود `amount_due numeric(12,2)`:
  - إلزامي، أكبر من صفر، بحد أقصى 9999999.99، وبخانتين عشريتين على الأكثر؛ وإلا `B1_EXCUSED_ABSENCE_FEE_DECISION_INPUT_INVALID:amount_due`.
  - عند `FEE_NOT_REQUIRED` يجب أن يكون فارغاً (`NULL`)؛ إدخال مبلغ يُرفض بالرمز نفسه.
  - قيد `CHECK` في الجدول يفرض القاعدتين، والمبلغ غير قابل للتعديل مع القرار.
  - **الوحدة:** كلمة «ريال» ثابتة في النص العربي. لا عمود عملة، ولا تحويل، ولا جمع أو خصم؛ القيمة تُخزَّن وتُعرض كما أُدخلت (العدد الصحيح بلا كسور: «5000 ريال»، وغيره بخانتين: «12500.50 ريال»)، وتنتقل نصاً عشرياً في الواجهة.
- البوابة لا تعالج أي سداد: لا بوابة دفع، لا أرصدة، لا إيصالات، ولا صف في `student_request_fee_assessments`.

## 4. الإرجاع والرفض

**نتيجة الفحص:** في المنفّذ كود خامل للإرجاع والرفض (حالتا `rejected` و`returned_for_completion`، تعليق إلزامي)، لكن بوابة `B1_ACTION_TYPE_MISMATCH` تمنعه، و`can_current_user_act_on_step` تعيد `false` لهما. أي أن الخدمات الخمس لا تستطيع الرفض أو الإرجاع اليوم.

المنفَّذ — **لهذه الخدمة فقط**، والحارس هو رمز سير العمل الجديد + نوع الطلب:

- بوابة `b1_excused_absence_step_decision_allowed`: تسمح بـ`reject`/`return` فقط إذا كانت الخطوة نشطة على الدورة الجديدة، وعلَمها (`can_reject` / `can_return_to_student`) مفعّل، ولها انتقال خروج واحد بالضبط. الخدمات الأربع الأخرى والدورة المتقاعدة لـ`excused_absence` تبقى مرفوضة كما كانت (مُثبت).
- التفويض مطابق لتنفيذ الخطوة: البوابة تُفحص **بعد** أن يثبت المنفّذ أن المستدعي هو المكلّف المباشر الوحيد. لا مسار ثانٍ ولا تجاوز.
- السبب إلزامي (5–2000 حرف) وإلا `B1_EXCUSED_ABSENCE_DECISION_REASON_REQUIRED`، ويُحفظ في الخطوة وفي `student_requests.rejection_reason`.
- الحالات من المفردات القائمة: `rejected` (نهائية) و`returned_for_completion`.
- **الرفض نهائي:** لا إجراء لأحد بعده، ولا إعادة تقديم (`B1_RUNTIME_RESUBMIT_STATE_INVALID`)، ولا يُسجَّل العذر.
- **الإرجاع:** الطلب يتجمّد للموظفين؛ الطالب يعدّل ويعيد التقديم فيبدأ من `dean_review` **على الإصدار نفسه** (حتى لو كان الإرجاع من خطوة المسجل: تُعاد الخطوات إلى `pending` ويراجع العميد من جديد). الدورة السابقة تبقى في سجل الأحداث.
- كل رفض أو إرجاع يُسجَّل في `student_request_workflow_events` بالفاعل والسبب.

## 5. الإشعارات

الآلية القائمة فقط: `create_notification` والمشغّل `trg_notify_student_request`. لا إدراج مباشر في `notifications`.

| الحدث | العنوان | النص |
|---|---|---|
| `FEE_REQUIRED` | رسوم مستحقة على طلب غياب بعذر | قرّر مسجل الكلية أن طلبك رقم … يستلزم سداد رسوم الخدمة. المبلغ المستحق: … ريال. سدّد الرسوم في النظام الجامعي الرئيسي، وبعد أن يؤكد موظف الإيرادات الاستلام يُستكمل الطلب. لا يتم أي سداد داخل البوابة. |
| `FEE_NOT_REQUIRED` | لا يلزم سداد رسوم لطلب غياب بعذر | قرّر مسجل الكلية أن طلبك رقم … لا يستلزم سداد رسوم (خدمة مجانية / إعفاء)، وانتقل الطلب إلى توقيع رئيس القسم. |
| إرجاع | طلب غياب بعذر يحتاج استكمال | أُعيد طلبك رقم … لاستكماله. الملاحظات: … — عدّل الطلب ثم أعد إرساله ليبدأ من مراجعة العميد. |
| رفض (المشغّل القائم) | تم رفض طلب غياب بعذر | سبب الرفض: … |

المُثبت في البروفة: إشعار واحد بالضبط لكل حدث، موجَّه لطالب الطلب فقط، بالنص المتوقع. رُقِّع المشغّل القائم بسطر واحد لإضافة الاسم العربي للخدمة (كان يعرض الرمز الخام). إشعار `FEE_REQUIRED` يذكر المبلغ **مرة واحدة بالضبط** مع كلمة «ريال» وتوجيه السداد في النظام الرئيسي؛ وإشعار `FEE_NOT_REQUIRED` لا يحمل أي مبلغ (مُثبتان).

## 6. ما يراه الطالب

- قبل التقديم: إن لم يكن له قسم مسجّل يظهر تنبيه «لا يمكن تقديم طلب غياب بعذر قبل تسجيل قسمك العلمي في ملفك الطلابي. راجع شؤون الطلاب…»، والخادم يرفض التقديم بالرسالة نفسها (`B1_EXCUSED_ABSENCE_STUDENT_DEPARTMENT_REQUIRED`). قسم بلا رئيس واحد فعّال يبقى فشلاً مغلقاً برسالة موجَّهة للموظفين (`B1_EXCUSED_ABSENCE_DEPARTMENT_HEAD_ASSIGNMENT_REQUIRED`) دون الرجوع لرئيس قسم آخر.
- في التفاصيل: بطاقة قرار الرسوم (مستحقة مع **المبلغ المستحق** وإرشاد السداد في النظام الرئيسي، أو غير مستحقة مع السبب)، وتُخفى خطوة تأكيد السداد من الخط الزمني عند «لا رسوم».
- عند الإرجاع أو الرفض: يظهر السبب في رسائل الطلب (المسار القائم لتعليقات الخطوات المُرجَعة/المرفوضة).
- لا زر دفع، لا عملة، لا رصيد، لا إيصال، ولا وثيقة تصدر من هذه الدورة. المبلغ نص للعرض فقط.
- للموظف: بطاقة «قرار الرسوم» في خطوة المسجل (قرار + المبلغ المستحق عند استحقاق الرسوم أو السبب عند عدمه + ملاحظة اختيارية؛ التحقق في الواجهة والعقد والخادم)، ولوحات الرفض/الإرجاع تظهر فقط في الخطوات التي يسمح بها العقد. إخفاء الزر ليس تفويضاً؛ الخادم هو الحكم.

## 7. الطلبات القائمة (in-flight)

- **قرار المالك:** الطلب التجريبي القائم يُترك على الإصدار المتقاعد. المسودة لا تكتب في `student_requests` ولا في خطوات التشغيل، ولا backfill.
- مُثبت: يكمل خطواته الثلاث القديمة بلا سداد ولا قرار رسوم ولا توقيعات، والرفض/الإرجاع يبقيان مرفوضين عليه حتى لمكلّفيه.
- **المسودات المُنشأة قبل التحويل** تُهيَّأ على الدورة الجديدة عند تقديمها (مقبول من المالك).
- قيد معروف (قائم قبل هذه الحزمة): طلب مُرجَع على الإصدار المتقاعد يفشل مغلقاً عند إعادة التقديم ولا يُنقل للدورة الجديدة. المحرّك لا يتيح الإرجاع على الدورة القديمة، فالحالة نظرية.

## 8. مصفوفة التفويض

القاعدة: يُسمح فقط للمكلّف المباشر الوحيد على الخطوة النشطة، بوحدة الخطوة ودورها، وبالإجراء المهيأ (أو خروج يسمح به علَم الخطوة). التعيين المباشر له الأولوية المطلقة. لا تجاوز للأدمن أو المسجل أو العميد.

| الخطوة | المسموح له | كيف |
|---|---|---|
| `dean_review` | العميد المعيّن | `review`، أو رفض/إرجاع بسبب |
| `registrar_fee_referral` | مسجل الكلية المعيّن | RPC قرار الرسوم فقط، أو رفض/إرجاع بسبب |
| `payment_confirmation` | مسؤول الإيرادات المعيّن | RPC تأكيد السداد فقط، وفقط عند `FEE_REQUIRED` |
| `department_head_signature` | رئيس **قسم الطالب** | `approve` أو رفض بسبب |
| `dean_signature` | العميد المعيّن | `approve` أو رفض بسبب |
| `student_affairs_manager_signature` | مدير شؤون الطلاب المعيّن | `approve` أو رفض بسبب |
| `record_apply` | مسجل الكلية المعيّن | `apply_decision` |
| `archive` | مسؤول الأرشيف المعيّن | `archive` |

**المُثبت عبر RPC مباشرة** (`scripts/excused-absence-paid-signature-01-pg17`): لكل خطوة 18 هوية (مجهول، الطالب صاحب الطلب، طلاب آخرون، أدمن بلا تعيين، صاحب الدور نفسه غير المعيّن، رئيس قسم آخر، فاعلو الخطوات الأخرى) × كل الإجراءات على المنفّذ العام + RPC السداد + RPC قرار الرسوم + بوابة التفويض، ثم المكلّف نفسه بكل إجراء غير مهيأ، ثم منع إعادة التنفيذ. بعد كل مجموعة رفض: تطابق تام لحالة الطلب والقرارات والإشعارات (صفر تغيير).

| السيناريو | الرفض المُثبت |
|---|---|
| `FEE_REQUIRED` — 8 خطوات | 2956 |
| `FEE_NOT_REQUIRED` — 7 خطوات | 2590 |
| الطلب القائم على الدورة المتقاعدة — 3 خطوات | 1005 |

سيناريوهات إضافية ناجحة: إرجاع من العميد ثم إعادة تقديم؛ إرجاع من المسجل ثم إعادة البدء من العميد؛ رفض من رئيس القسم (نهائي، غير قابل للتغيير)؛ خطوة توقيع لا تستطيع الإرجاع؛ قراءة القرار (الطالب المالك ومكلّفو الطلب فقط؛ طالب آخر، أدمن بلا تعيين، رئيس قسم آخر والمجهول لا يقرأون شيئاً)؛ طالب بلا قسم؛ قسم بلا رئيس؛ تغيّر قسم الطالب أثناء الدورة.

## 9. الافتراضات

1. «رئيس القسم» هو رئيس القسم المسجّل في `student_profiles.department_id`.
2. `request_types.code` في الإنتاج هو `excused_absence` (المسودة تتوقف إن اختلف).
3. تعيينات رؤساء الأقسام من نوع `position_assignment` وتحمل `department_id`.
4. أجسام الدوال الست المرقّعة في الإنتاج تطابق نقاط الارتكاز؛ وإلا تتوقف المسودة دون أي تغيير.
5. سببا «لا رسوم» اثنان فقط كما حدّدهما المالك.
6. `returned_for_completion` هي حالة الإرجاع المعتمدة في المنفّذ القائم (وليست `returned`).

## 10. المخاطر

| الخطر | الأثر | المعالجة |
|---|---|---|
| ترقيع 6 دوال `SECURITY DEFINER` (11 رقعة) منها المنفّذ الذري | سطح أوسع من المراجعة الأولى | كل رقعة بنقطة ارتكاز تطابق مرة واحدة، علامة `EAWF01`، وخاملة خارج الدورة الجديدة؛ 12 مجسّ فشل-مغلق؛ بصمات الدوال تُعاد بعد التطبيق |
| المسجل يختار «لا رسوم» أو يُدخل مبلغاً خطأً | لا تراجع عن القرار ولا عن المبلغ (غير قابلين للتعديل) | مقصود بقرار المالك؛ القرار مسجَّل بالفاعل والسبب في سجل الأحداث |
| طالب بلا قسم / قسم بلا رئيس | لا يستطيع التقديم | رسالة واضحة؛ استعلام قراءة قبل التطبيق؛ `WARNING` في المسودة |
| إعادة التقديم بعد تغيّر رئيس القسم | تُرفض (`B1_RUNTIME_RESUBMIT_CONTRACT_INVALID`) | فشل مغلق؛ يُعالج إدارياً |
| تفاصيل الطلب لا تكشف حالة `skipped` | الواجهة تخفي خطوة السداد اعتماداً على القرار | مغطّى في الواجهة؛ لم نعدّل RPC التفاصيل |
| **خارج النطاق — مؤكَّد:** فرع «لا رسوم» في `department_transfer`/`final_chance` v2 يتجاوز خطوة سداد `can_skip=false` | كل طلب يتوقف عند `registrar_apply` (`B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED`) | مُثبت وله مسودة إصلاح مستقلة: `docs/reviews/B1-PAID-SERVICES-ZERO-FEE-CHECK-01.md`. هذه المسودة لا تغيّر سلوك الخدمتين (مُثبت) |
| البروفة على PostgreSQL 16 | فرق محتمل مع 17 | ساق CI «PG 17 verifier» |

## 11. ما لم يُنفَّذ (ولماذا)

1. لم تُعدَّل RPC تفاصيل الطلب للطالب لكشف حالة `skipped` (القسم 10).
2. لا مسار وثائق: الأرشفة إغلاق للمعاملة فقط.
3. لم تُعَد توليد المصفوفات والبصمات التاريخية للسلسلة المطبّقة (تُعاد بعد الترقية والتطبيق، كما في المراجعة الأولى).
4. المبلغ لا يُعدَّل بعد تسجيله ولا تُجرى عليه أي عملية؛ تصحيح مبلغ خاطئ يكون خارج البوابة (في النظام الجامعي الرئيسي) أو برفض/إرجاع لاحق من خطوة لها هذا الحق.

> بند «المبلغ المستحق للعرض» الذي كان معلّقاً في المراجعتين الثانية والثالثة **نُفِّذ** في هذه المراجعة بعد أن أضافت الجلسة الرئيسية استثناء المالك إلى `AGENTS.md`.

## 12. تغييرات المسودة

**دوال جديدة (7):** `b1_excused_absence_student_department`، `b1_excused_absence_paid_cycle_step`، `b1_excused_absence_step_decision_allowed`، `guard_excused_absence_fee_decision_write` (مشغّل)، `b1_excused_absence_before_step_action`، `record_excused_absence_fee_decision` و`get_excused_absence_fee_decision` (الاثنتان الوحيدتان الممنوحتان لـ`authenticated`).

**جدول جديد:** `excused_absence_fee_decisions` (RLS مفعّل، بلا صلاحيات مباشرة؛ يحوي `amount_due` للعرض فقط وقيد `excused_absence_fee_decisions_amount_due_chk`). توقيع RPC المسجل: `record_excused_absence_fee_decision(uuid, text, text, text, numeric)`. **صف كتالوج:** الشرط `EXCUSED_ABSENCE_FEE_NOT_REQUIRED`.

**رقع (11) على 6 دوال قائمة:**

| الدالة | الرقع |
|---|---|
| `initialize_b1_request_workflow_strict` | نطاق قسم الطالب عند التهيئة، وعند إعادة التقديم، وإعادة البدء من الخطوة الأولى |
| `assert_b1_runtime_step_row_assignee_effective` | إعادة حل نطاق القسم عند التفعيل |
| `act_on_b1_student_request_step_atomic` | الأثر قبل الأرشفة، بوابة الرفض/الإرجاع، خطّاف ما قبل الإجراء، حفظ السبب على الطلب |
| `record_external_university_payment_confirmation` | إضافة الخدمة لقائمة السداد الخارجي |
| `evaluate_workflow_transition_condition` | تنفيذ شرط «لا رسوم» |
| `trg_notify_student_request` | الاسم العربي للخدمة |

**لم تُعدَّل:** `can_current_user_act_on_step`، `user_matches_workflow_runtime_step`، `apply_b1_excused_absence_effect`، `protect_student_request`.

## 13. إجراء التطبيق (جاهزية الإنتاج)

الملفات بجوار المسودة:

| الملف | النوع | الغرض |
|---|---|---|
| `docs/migration-drafts/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.preflight.sql` | قراءة فقط، عبارة `SELECT` واحدة | يطابق كل حارس ونقطة ارتكاز في المسودة ويعيد صفاً واحداً من القيم المنطقية |
| `docs/migration-drafts/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.sql` | المسودة (معاملة واحدة) | التغيير نفسه |
| `docs/migration-drafts/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.verify.sql` | قراءة فقط، عبارة `SELECT` واحدة | تحقق لاحق: صف واحد من القيم المنطقية |
| `docs/migration-drafts/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.rollback-by-forward.sql` | مسودة تراجع (معاملة واحدة) | القسم 14 |

**الخطوات:**

1. CI أخضر: `tsc --noEmit`، `bun test tests/student-requests`، وساق «PG 17 verifier · excused-absence-paid-signature-workflow».
2. شغّل **الفحص المسبق** أدناه من أي لوحة SQL. لا تطبّق إلا إذا كان `ready_to_apply = true`. إن كان `false` فالأعمدة المنطقية تحدد الحارس الفاشل، و`failing_anchors` و`roles_without_single_assignee` يسمّيان السبب. سجّل قيم `request_type_student_visible` و`processing_assignment_count` و`open_requests_of_this_service` للمقارنة بعد التطبيق. الأعمدة `student_departments_without_head` و`students_without_department` معلوماتية: هؤلاء الطلاب لن يستطيعوا التقديم بعد التحويل.
3. الترقية: انسخ المسودة حرفياً إلى `supabase/migrations/<timestamp>_excused_absence_paid_signature_workflow_01.sql` مع حذف سطر «DRAFT ONLY» فقط.
4. التطبيق: ترحيل واحد في نافذة هدوء. أي حارس يفشل يتراجع عن كل شيء.
5. شغّل **التحقق اللاحق** أدناه. التطبيق سليم فقط إذا كان `applied_correctly = true`، و`requests_on_the_new_cycle = 0`، و`fee_decisions_recorded = 0`، وقيم `request_type_student_visible` و`processing_assignment_count` و`open_requests_of_this_service` مطابقة لما سُجِّل في الخطوة 2.
6. انشر الواجهة **بعد** نجاح الترحيل مباشرة (ترتيب معكوس يعرض للطالب دورة لا يعرفها الخادم).
7. E2E بحساب اختبار واحد للمسارين (رسوم / لا رسوم) وللإرجاع والرفض.

الاستعلامان مُبرهنان في البروفة: الفحص المسبق أخضر قبل التطبيق، أحمر عند انحراف نقطة ارتكاز أو غياب مكلّف (ويسمّي السبب)، ولا يكتب شيئاً؛ والتحقق اللاحق أخضر بعد التطبيق وبعد حركة طلبات حقيقية.

### الفحص المسبق (قراءة فقط)

```sql
-- EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 — production PRE-FLIGHT.
-- READ-ONLY: one SELECT, no writes, no locks beyond ordinary reads. Safe to
-- run from any SQL console. It mirrors every guard of
-- docs/migration-drafts/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.sql and
-- returns ONE row. Apply the draft only when `ready_to_apply` is true.
--
-- If a relation or function the draft needs does not exist at all, this query
-- fails with the missing object's name instead of returning a row — that is
-- also a NO-GO.
--
-- The anchor list below is generated from the draft; a test keeps both in sync.
WITH anchors(fn, marker, anchor) AS (
  VALUES
    ('public.initialize_b1_request_workflow_strict(uuid,text)', 'EAWF01:init-student-department-scope',
      'ELSIF v_is_p1 THEN'),
    ('public.initialize_b1_request_workflow_strict(uuid,text)', 'EAWF01:resubmit-student-department-scope',
      'ELSE public.p1_runtime_step_department_scope(p_canonical_code,s.step_key,p_request_id) END'),
    ('public.assert_b1_runtime_step_row_assignee_effective(public.student_request_workflow_steps)', 'EAWF01:activation-student-department-scope',
      'IF v_canonical = ''department_transfer'''),
    ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:effect-before-archive',
      'v_action=''apply_decision'' AND v_canonical=''file_withdrawal'''),
    ('public.record_external_university_payment_confirmation(uuid,text)', 'EAWF01:external-payment-service',
      '''october_exam_entry_form'',''replacement_student_card'')'),
    ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:step-decision-gate',
      'IF v_config.action_type IS NULL OR p_action IS DISTINCT FROM v_config.action_type THEN'),
    ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:before-step-action-hook',
      'IF COALESCE(p_payload,''{}''::jsonb)<>''{}''::jsonb THEN RAISE EXCEPTION ''B1_CLIENT_ACTION_PAYLOAD_FORBIDDEN''; END IF;'),
    ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:decision-reason-on-request',
      'UPDATE public.student_requests SET status=CASE v_action WHEN ''reject'' THEN ''rejected'''),
    ('public.evaluate_workflow_transition_condition(uuid,jsonb)', 'EAWF01:fee-not-required-condition',
      'IF v_code = ''FEE_IS_ZERO'' THEN'),
    ('public.initialize_b1_request_workflow_strict(uuid,text)', 'EAWF01:resubmit-restart-at-first-step',
      'RETURN jsonb_build_object(''initialized'',false,''resumed'',true,''active_step_id'',v_active_step_id);'),
    ('public.trg_notify_student_request()', 'EAWF01:notification-service-label',
      'WHEN ''absence_excuse'' THEN ''عذر غياب''')
),
anchor_state AS (
  SELECT a.marker,
         d.def IS NOT NULL AS fn_exists,
         COALESCE(position(a.marker in d.def) > 0, false) AS already_patched,
         CASE WHEN d.def IS NULL THEN 0
              ELSE (length(d.def) - length(replace(d.def, a.anchor, ''))) / length(a.anchor) END AS hits
  FROM anchors a
  LEFT JOIN LATERAL (SELECT pg_get_functiondef(to_regprocedure(a.fn)) AS def) d ON true
),
rt AS (
  SELECT rt.* FROM public.request_types rt WHERE rt.code = ANY (ARRAY['excused_absence','absence_excuse'])
),
pairs(unit_code, role_code) AS (
  VALUES ('dean','dean'), ('registrar','registrar_general'), ('finance','revenue_finance_officer'),
         ('student_affairs','student_affairs_manager'), ('archive','archive_officer'), ('department','department_head')
),
pair_state AS (
  SELECT p.unit_code, p.role_code,
         (SELECT count(*) FROM public.request_processing_units u WHERE u.code = p.unit_code AND u.is_active) AS units,
         (SELECT count(*) FROM public.request_processing_roles r
            JOIN public.request_processing_units u ON u.id = r.unit_id AND u.code = p.unit_code AND u.is_active
           WHERE r.code = p.role_code AND r.is_active) AS roles,
         (SELECT count(*) FROM public.request_processing_assignments a
            JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = p.unit_code AND u.is_active
            JOIN public.request_processing_roles r ON r.id = a.role_id AND r.unit_id = u.id AND r.code = p.role_code AND r.is_active
           WHERE a.is_active
             AND (a.starts_at IS NULL OR a.starts_at <= now())
             AND (a.ends_at IS NULL OR a.ends_at > now())
             AND public.is_valid_b1_direct_assignment(a.id, NULL, false)) AS direct_assignees
  FROM pairs p
),
heads AS (
  SELECT a.department_id, count(*) AS n
  FROM public.request_processing_assignments a
  JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'department' AND u.is_active
  JOIN public.request_processing_roles r ON r.id = a.role_id AND r.unit_id = u.id AND r.code = 'department_head' AND r.is_active
  WHERE a.is_active
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND a.department_id IS NOT NULL
    AND a.assignment_type = 'position_assignment'
    AND a.position_assignment_id IS NOT NULL
    AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL
    AND public.is_valid_b1_direct_assignment(a.id, a.department_id, false)
  GROUP BY a.department_id
),
wf AS (
  SELECT w.* FROM public.request_type_workflows w JOIN rt ON rt.id = w.request_type_id
),
checks AS (
  SELECT
    (SELECT bool_and(to_regclass(x) IS NOT NULL) FROM unnest(ARRAY[
      'public.request_types','public.request_type_workflows','public.request_type_workflow_steps',
      'public.request_type_workflow_transitions','public.request_type_workflow_change_log',
      'public.request_workflow_publish_validations','public.request_workflow_action_catalog',
      'public.request_processing_units','public.request_processing_roles','public.request_processing_assignments',
      'public.b1_workflow_runtime_contract_snapshot','public.student_profiles','public.student_requests',
      'public.student_request_workflow_steps','public.student_request_workflow_events',
      'public.absence_excuse_details','public.request_workflow_transition_condition_catalog',
      'public.notifications']) x) AS relations_ok,
    (SELECT bool_and(to_regprocedure(x) IS NOT NULL) FROM unnest(ARRAY[
      'public.initialize_b1_request_workflow_strict(uuid,text)',
      'public.assert_b1_runtime_step_row_assignee_effective(public.student_request_workflow_steps)',
      'public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)',
      'public.record_external_university_payment_confirmation(uuid,text)',
      'public.apply_b1_excused_absence_effect(uuid)',
      'public.apply_b1_academic_effect_for_request(uuid)',
      'public.can_current_user_act_on_step(uuid,text)',
      'public.user_matches_workflow_runtime_step(uuid)',
      'public.is_valid_b1_direct_assignment(uuid,uuid,boolean)',
      'public.b1_runtime_step_contract_ok(text,uuid,text,text,text,text)',
      'public.validate_request_workflow_publish(uuid)',
      'public.resolve_b1_workflow_transition(uuid,uuid,text,uuid)',
      'public.evaluate_workflow_transition_condition(uuid,jsonb)',
      'public.create_notification(uuid,text,text,text,text,uuid)',
      'public.trg_notify_student_request()']) x) AS functions_ok,
    (SELECT count(*) = 16 FROM information_schema.columns ic
      WHERE ic.table_schema = 'public' AND (ic.table_name, ic.column_name) IN (
        ('request_type_workflows','published_at'), ('request_type_workflows','superseded_at'),
        ('request_type_workflows','change_note'), ('request_type_workflow_steps','action_code'),
        ('request_type_workflow_steps','config'), ('request_type_workflow_transitions','priority'),
        ('request_type_workflow_transitions','condition_schema'),
        ('request_processing_assignments','department_id'),
        ('request_processing_assignments','position_assignment_id'),
        ('student_profiles','department_id'), ('student_requests','student_profile_id'),
        ('student_requests','rejection_reason'), ('student_requests','request_number'),
        ('request_type_workflow_steps','can_reject'), ('request_type_workflow_steps','can_return_to_student'),
        ('student_request_workflow_steps','workflow_id'))) AS columns_ok,
    (SELECT count(*) = 1 AND bool_and(code = 'excused_absence') FROM rt) AS request_type_ok,
    (SELECT count(*) = 5 FROM public.request_workflow_action_catalog c
      WHERE c.is_active AND (c.code, c.action_type, c.kind) IN (
        ('REVIEW','review','neutral'), ('APPROVE','approve','neutral'),
        ('PAYMENT_CONFIRMATION','confirm_payment','neutral'), ('ARCHIVE','archive','neutral'),
        ('REGISTER_EXCUSED_ABSENCE','apply_decision','effect'))
        AND c.effect_function IS NOT DISTINCT FROM
            CASE c.code WHEN 'REGISTER_EXCUSED_ABSENCE' THEN 'apply_b1_excused_absence_effect' END
        AND c.restricted_request_type_code IS NOT DISTINCT FROM
            CASE c.code WHEN 'REGISTER_EXCUSED_ABSENCE' THEN 'excused_absence' END) AS catalog_actions_ok,
    (SELECT position('record_apply' in p.prosrc) > 0 FROM pg_proc p
      WHERE p.oid = to_regprocedure('public.apply_b1_excused_absence_effect(uuid)')) AS effect_step_key_binding_ok,
    (SELECT bool_and(units = 1 AND roles = 1) FROM pair_state) AS units_and_roles_ok,
    (SELECT bool_and(direct_assignees = 1) FROM pair_state WHERE role_code <> 'department_head') AS single_direct_assignee_per_role_ok,
    (SELECT count(*) >= 1 FROM heads) AS department_head_assignment_exists,
    NOT EXISTS (
      SELECT 1 FROM public.request_processing_assignments a
      JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'department' AND u.is_active
      JOIN public.request_processing_roles r ON r.id = a.role_id AND r.unit_id = u.id AND r.code = 'department_head' AND r.is_active
      WHERE a.is_active
        AND (a.starts_at IS NULL OR a.starts_at <= now())
        AND (a.ends_at IS NULL OR a.ends_at > now())
        AND a.department_id IS NOT NULL
        AND public.is_valid_b1_direct_assignment(a.id, a.department_id, false)
      GROUP BY a.department_id HAVING count(*) > 1) AS no_ambiguous_department_head,
    (SELECT count(*) = 1 FROM wf WHERE status = 'active' AND is_active) AS single_active_workflow,
    (SELECT count(*) = 1 FROM wf WHERE status = 'active' AND is_active
        AND code IN ('excused_absence_free_workflow','excused_absence_external_payment_workflow')) AS active_workflow_code_expected,
    (SELECT count(*) <= 1 FROM wf WHERE code = 'excused_absence_external_payment_workflow') AS no_duplicate_target_workflow,
    NOT EXISTS (SELECT 1 FROM public.request_workflow_transition_condition_catalog c
                WHERE c.code = 'EXCUSED_ABSENCE_FEE_NOT_REQUIRED' AND NOT c.is_active) AS fee_condition_code_free_or_active,
    (SELECT bool_and(fn_exists AND (already_patched OR hits = 1)) FROM anchor_state) AS all_eleven_patch_anchors_ok
)
SELECT
  c.*,
  (c.relations_ok AND c.functions_ok AND c.columns_ok AND c.request_type_ok AND c.catalog_actions_ok
   AND c.effect_step_key_binding_ok AND c.units_and_roles_ok AND c.single_direct_assignee_per_role_ok
   AND c.department_head_assignment_exists AND c.no_ambiguous_department_head AND c.single_active_workflow
   AND c.active_workflow_code_expected AND c.no_duplicate_target_workflow
   AND c.fee_condition_code_free_or_active AND c.all_eleven_patch_anchors_ok) IS TRUE AS ready_to_apply,
  -- ---- informational (do not block the apply) ------------------------------
  (SELECT count(*) = 11 AND bool_and(already_patched) FROM anchor_state) AS draft_already_applied,
  (SELECT array_agg(marker || ':' || hits ORDER BY marker) FROM anchor_state
    WHERE NOT (fn_exists AND (already_patched OR hits = 1))) AS failing_anchors,
  (SELECT array_agg(unit_code || '/' || role_code || ':' || direct_assignees ORDER BY unit_code)
     FROM pair_state WHERE role_code <> 'department_head' AND direct_assignees <> 1) AS roles_without_single_assignee,
  (SELECT code || ' v' || version FROM wf WHERE status = 'active' AND is_active) AS active_workflow,
  (SELECT student_visible FROM rt) AS request_type_student_visible,
  (SELECT count(DISTINCT sp.department_id) FROM public.student_profiles sp
    WHERE sp.department_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM heads h WHERE h.department_id = sp.department_id)) AS student_departments_without_head,
  (SELECT count(*) FROM public.student_profiles sp WHERE sp.department_id IS NULL) AS students_without_department,
  (SELECT count(*) FROM public.student_requests r
    WHERE r.request_type::text IN ('excused_absence','absence_excuse')
      AND r.status::text NOT IN ('completed','rejected','cancelled','draft')) AS open_requests_of_this_service,
  (SELECT count(*) FROM public.request_processing_assignments) AS processing_assignment_count
FROM checks c;
```

### التحقق اللاحق (قراءة فقط)

```sql
-- EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 — production POST-APPLY verification.
-- READ-ONLY: one SELECT, no writes. Run it right after the migration, from any
-- SQL console (as the migration owner, so privilege checks are meaningful).
-- Returns ONE row; the apply is good only when `applied_correctly` is true.
WITH rt AS (
  SELECT rt.* FROM public.request_types rt WHERE rt.code = 'excused_absence'
),
wf AS (
  SELECT w.* FROM public.request_type_workflows w JOIN rt ON rt.id = w.request_type_id
),
new_wf AS (
  SELECT * FROM wf WHERE code = 'excused_absence_external_payment_workflow'
),
steps AS (
  SELECT s.*, u.code AS unit_code, r.code AS role_code
  FROM public.request_type_workflow_steps s
  JOIN new_wf ON new_wf.id = s.workflow_id
  JOIN public.request_processing_units u ON u.id = s.processing_unit_id
  JOIN public.request_processing_roles r ON r.id = s.processing_role_id AND r.unit_id = u.id
),
tr AS (
  SELECT t.*, fs.step_key AS from_key, ts.step_key AS to_key
  FROM public.request_type_workflow_transitions t
  JOIN new_wf ON new_wf.id = t.workflow_id
  LEFT JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id
  LEFT JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
),
markers(fn, marker) AS (
  VALUES
    ('public.initialize_b1_request_workflow_strict(uuid,text)', 'EAWF01:init-student-department-scope'),
    ('public.initialize_b1_request_workflow_strict(uuid,text)', 'EAWF01:resubmit-student-department-scope'),
    ('public.initialize_b1_request_workflow_strict(uuid,text)', 'EAWF01:resubmit-restart-at-first-step'),
    ('public.assert_b1_runtime_step_row_assignee_effective(public.student_request_workflow_steps)', 'EAWF01:activation-student-department-scope'),
    ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:effect-before-archive'),
    ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:step-decision-gate'),
    ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:before-step-action-hook'),
    ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:decision-reason-on-request'),
    ('public.record_external_university_payment_confirmation(uuid,text)', 'EAWF01:external-payment-service'),
    ('public.evaluate_workflow_transition_condition(uuid,jsonb)', 'EAWF01:fee-not-required-condition'),
    ('public.trg_notify_student_request()', 'EAWF01:notification-service-label')
),
new_functions(sig, exposed) AS (
  VALUES
    ('public.b1_excused_absence_student_department(uuid)', false),
    ('public.b1_excused_absence_paid_cycle_step(uuid)', false),
    ('public.b1_excused_absence_step_decision_allowed(uuid,text)', false),
    ('public.guard_excused_absence_fee_decision_write()', false),
    ('public.b1_excused_absence_before_step_action(uuid,text,text)', false),
    ('public.record_excused_absence_fee_decision(uuid,text,text,text,numeric)', true),
    ('public.get_excused_absence_fee_decision(uuid)', true)
),
checks AS (
  SELECT
    (SELECT count(*) = 1 FROM wf WHERE status = 'active' AND is_active) AS single_active_workflow,
    (SELECT count(*) = 1 AND bool_and(status = 'active' AND is_active AND published_at IS NOT NULL)
       FROM new_wf) AS new_workflow_active,
    (SELECT count(*) >= 1 AND bool_and(status = 'retired' AND NOT is_active)
       FROM wf WHERE code = 'excused_absence_free_workflow') AS free_workflow_retired,
    (SELECT (SELECT version FROM new_wf) = max(version) + 1 FROM wf WHERE code = 'excused_absence_free_workflow')
       AS new_version_follows_the_free_cycle,
    (SELECT array_agg(step_key || ':' || unit_code || '/' || role_code || ':' || action_type || ':' || action_code
                      ORDER BY step_order) FROM steps) = ARRAY[
       'dean_review:dean/dean:review:REVIEW',
       'registrar_fee_referral:registrar/registrar_general:review:REVIEW',
       'payment_confirmation:finance/revenue_finance_officer:confirm_payment:PAYMENT_CONFIRMATION',
       'department_head_signature:department/department_head:approve:APPROVE',
       'dean_signature:dean/dean:approve:APPROVE',
       'student_affairs_manager_signature:student_affairs/student_affairs_manager:approve:APPROVE',
       'record_apply:registrar/registrar_general:apply_decision:REGISTER_EXCUSED_ABSENCE',
       'archive:archive/archive_officer:archive:ARCHIVE'] AS eight_steps_exact,
    (SELECT bool_and(assignment_strategy = 'specific_user'
                     AND config ->> 'authorization' = 'exactly_one_direct_assignee') FROM steps)
       AS every_step_single_direct_assignee,
    (SELECT array_agg(step_key ORDER BY step_order) FILTER (WHERE can_skip) FROM steps)
       = ARRAY['payment_confirmation'] AS only_payment_step_skippable,
    (SELECT array_agg(step_key ORDER BY step_order) FILTER (WHERE can_reject) FROM steps)
       = ARRAY['dean_review','registrar_fee_referral','department_head_signature','dean_signature',
               'student_affairs_manager_signature'] AS reject_steps_exact,
    (SELECT array_agg(step_key ORDER BY step_order) FILTER (WHERE can_return_to_student) FROM steps)
       = ARRAY['dean_review','registrar_fee_referral'] AS return_steps_exact,
    (SELECT count(*) = 17
        AND count(*) FILTER (WHERE action_result = 'reject' AND to_key IS NULL) = 5
        AND count(*) FILTER (WHERE action_result = 'return' AND to_key IS NULL) = 2
        AND count(*) FILTER (WHERE action_result = 'skip') = 0
        AND count(*) FILTER (WHERE COALESCE(condition_schema, '{}'::jsonb) <> '{}'::jsonb) = 1
        AND count(*) FILTER (WHERE from_key = 'registrar_fee_referral' AND to_key = 'department_head_signature'
                               AND condition_schema ->> 'code' = 'EXCUSED_ABSENCE_FEE_NOT_REQUIRED'
                               AND NOT is_default) = 1
        AND count(*) FILTER (WHERE from_key = 'registrar_fee_referral' AND to_key = 'payment_confirmation'
                               AND is_default) = 1
       FROM tr) AS seventeen_transitions_exact,
    (SELECT count(*) = 8 FROM public.b1_workflow_runtime_contract_snapshot c JOIN new_wf ON new_wf.id = c.workflow_id)
       AS runtime_contract_pinned,
    (SELECT count(*) >= 1 FROM public.request_workflow_publish_validations v JOIN new_wf ON new_wf.id = v.workflow_id
      WHERE v.is_valid) AS publish_validation_recorded,
    (SELECT count(*) >= 1 FROM public.request_type_workflow_change_log l JOIN new_wf ON new_wf.id = l.workflow_id
      WHERE l.change_kind = 'workflow_published') AS change_log_recorded,
    (SELECT count(*) = 1 FROM public.request_workflow_transition_condition_catalog c
      WHERE c.code = 'EXCUSED_ABSENCE_FEE_NOT_REQUIRED' AND c.is_active) AS fee_condition_in_catalog,
    (SELECT bool_and(to_regprocedure(sig) IS NOT NULL) FROM new_functions) AS seven_new_functions_exist,
    (SELECT bool_and(has_function_privilege('authenticated', to_regprocedure(sig), 'EXECUTE') = exposed
                     AND NOT has_function_privilege('anon', to_regprocedure(sig), 'EXECUTE'))
       FROM new_functions WHERE to_regprocedure(sig) IS NOT NULL) AS function_exposure_exact,
    (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass('public.excused_absence_fee_decisions'))
       AS fee_decision_table_rls_enabled,
    (SELECT NOT has_table_privilege('authenticated', to_regclass('public.excused_absence_fee_decisions'), 'SELECT,INSERT,UPDATE,DELETE')
        AND NOT has_table_privilege('anon', to_regclass('public.excused_absence_fee_decisions'), 'SELECT,INSERT,UPDATE,DELETE'))
       AS fee_decision_table_not_exposed,
    (SELECT count(*) = 1 AND bool_and(ic.column_name = 'amount_due' AND ic.data_type = 'numeric'
                                      AND ic.numeric_precision = 12 AND ic.numeric_scale = 2)
       FROM information_schema.columns ic
      WHERE ic.table_schema = 'public' AND ic.table_name = 'excused_absence_fee_decisions'
        AND ic.column_name ~* 'amount|currency|price|balance|invoice|receipt')
       AS display_only_amount_column_exact,
    EXISTS (SELECT 1 FROM pg_constraint k
            WHERE k.conrelid = to_regclass('public.excused_absence_fee_decisions')
              AND k.conname = 'excused_absence_fee_decisions_amount_due_chk' AND k.contype = 'c')
       AS amount_due_check_exists,
    EXISTS (SELECT 1 FROM pg_trigger t
            WHERE t.tgrelid = to_regclass('public.excused_absence_fee_decisions')
              AND t.tgname = 'trg_guard_excused_absence_fee_decision_write' AND NOT t.tgisinternal)
       AS fee_decision_guard_trigger_exists,
    (SELECT count(*) = 11 AND bool_and(position(m.marker in pg_get_functiondef(to_regprocedure(m.fn))) > 0)
       FROM markers m) AS eleven_patch_markers_present,
    NOT EXISTS (SELECT 1 FROM public.student_request_workflow_steps s
                JOIN new_wf ON new_wf.id = s.workflow_id
                JOIN public.student_requests r ON r.id = s.student_request_id
                WHERE r.submitted_at < new_wf.published_at
                  AND r.status::text NOT IN ('returned','returned_for_completion'))
       AS no_existing_request_moved_to_new_cycle
)
SELECT
  c.*,
  (c.single_active_workflow AND c.new_workflow_active AND c.free_workflow_retired
   AND c.new_version_follows_the_free_cycle AND c.eight_steps_exact AND c.every_step_single_direct_assignee
   AND c.only_payment_step_skippable AND c.reject_steps_exact AND c.return_steps_exact
   AND c.seventeen_transitions_exact AND c.runtime_contract_pinned AND c.publish_validation_recorded
   AND c.change_log_recorded AND c.fee_condition_in_catalog AND c.seven_new_functions_exist
   AND c.function_exposure_exact AND c.fee_decision_table_rls_enabled AND c.fee_decision_table_not_exposed
   AND c.display_only_amount_column_exact AND c.amount_due_check_exists
   AND c.fee_decision_guard_trigger_exists AND c.eleven_patch_markers_present
   AND c.no_existing_request_moved_to_new_cycle) IS TRUE AS applied_correctly,
  -- ---- informational --------------------------------------------------------
  (SELECT code || ' v' || version FROM wf WHERE status = 'active' AND is_active) AS active_workflow,
  (SELECT student_visible FROM rt) AS request_type_student_visible,
  (SELECT count(*) FROM public.excused_absence_fee_decisions) AS fee_decisions_recorded,
  (SELECT count(*) FROM public.student_requests r
    WHERE r.request_type::text IN ('excused_absence','absence_excuse')
      AND r.status::text NOT IN ('completed','rejected','cancelled','draft')) AS open_requests_of_this_service,
  (SELECT count(DISTINCT s.student_request_id) FROM public.student_request_workflow_steps s
     JOIN new_wf ON new_wf.id = s.workflow_id) AS requests_on_the_new_cycle,
  (SELECT count(*) FROM public.request_processing_assignments) AS processing_assignment_count
FROM checks c;
```

## 14. إجراء التراجع

لا حذف ولا reset. التراجع **إلى الأمام** فقط، بملف واحد مُبرهن في البروفة:
`docs/migration-drafts/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.rollback-by-forward.sql` (مسودة؛ تُرقّى وتُطبَّق بتفويض مستقل).

- **ماذا يفعل:** يقاعد `excused_absence_external_payment_workflow` ويعيد تفعيل أعلى إصدار من `excused_absence_free_workflow` بالأعمدة نفسها التي يستعملها مسار النشر، ويكتب صفاً في `request_type_workflow_change_log` بـ`change_kind = 'workflow_rolled_back'`.
- **ماذا يترك:** تعريف الدورة الجديدة وصفوف تثبيت عقدها، جدول القرارات، الدوال السبع، والرقع الإحدى عشرة. كلها خاملة خارج الدورة الجديدة (كل فرع جديد مشروط برمز سير العمل الجديد). إزالة الرقع — إن طُلبت — رقعة عكسية بنقاط الارتكاز نفسها.
- **متى يرفض (فشل مغلق):** إذا وُجد أي طلب له خطوات على الدورة الجديدة ← `EXCUSED_ABSENCE_WF01_ROLLBACK_BLOCKED_REQUESTS_EXIST_ON_NEW_CYCLE:<n>`. تلك الطلبات يجب أن تكمل على دورتها (إعادة التقديم بعد الإرجاع تشترط أن يكون إصدارها هو النشط)؛ في هذه الحالة لا تراجع عن سير العمل، بل إصلاح إلى الأمام.
- **المُثبت:** بعد التراجع يُهيَّأ طلب جديد على الدورة المجانية ذات الخطوات الثلاث؛ تشغيل ثانٍ لا يغيّر شيئاً؛ إعادة تطبيق المسودة بعد التراجع تنجح (`applied_correctly = true`)؛ والرفض عند وجود طلبات لا يترك أي أثر.
- **الواجهة:** إعادة نشر الإصدار السابق من المصدر.

## 15. التحقق المنفَّذ وما لم يُتحقق منه

**نُفِّذ محلياً (بلا شبكة):**
- `bun build --no-bundle` لكل ملف TypeScript معدَّل أو جديد.
- `bun test tests` قبل وبعد: لا إخفاقات جديدة؛ الإخفاقات السابقة كلها لغياب Docker/الحزم.
- البروفة الكاملة على PostgreSQL 16 مؤقت: 12 مجسّاً، مجسّ الضرورة، تطبيق مرتين ببصمة متطابقة، كل السيناريوهات، استعلاما الفحص المسبق والتحقق اللاحق، وبروفة التراجع.
- بروفة الخدمتين المدفوعتين `scripts/b1-paid-services-zero-fee-check-01-pg17/run.sh` بدون هذه المسودة ومعها: سجل متطابق.
- محاكاة ساق CI (الملفات نفسها بالترتيب نفسه في قاعدة واحدة).

**لم يُتحقق منه:**
- `tsc --noEmit` و`vite build` (لا `node_modules`).
- PostgreSQL 17 (المتاح محلياً 16).
- عرض مكوّنات React فعلياً (اختبارات المكوّنات تستورد حزماً غير مثبتة)؛ التحقق من الواجهة قراءةً للمصدر واختبارات عقد ومحاكي.
- مطابقة أجسام الدوال في الإنتاج لنقاط الارتكاز، وأعمدة `request_workflow_transition_condition_catalog` و`notifications` في الإنتاج (البروفة تعتمد على صور مأخوذة من الترحيلات المطبّقة؛ الحراس توقف التطبيق عند الاختلاف).

## 16. تقرير الوكيل

- **أثر الإنتاج:** لا شيء. لا ترحيل مطبّق عُدِّل، ولا `enrollment_certificate`، ولا `request_types.student_visible`. (`AGENTS.md` عدّلته الجلسة الرئيسية بتفويض المالك، لا هذا الوكيل.)
- **العوائق:** غياب `node_modules` وPostgreSQL 17 محلياً.
- **القرار:** المصدر **PASS**؛ التطبيق على الإنتاج بعد اخضرار CI ونجاح الفحص المسبق.
