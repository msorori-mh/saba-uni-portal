# الخطة **قوية ومناسبة للتنفيذ**، وأعتمدها كحزمة **Source + Migration Drafts فقط**. راجعت العقود الحالية، وما بنيت عليه الخطة صحيح: إغلاق التصويت الحالي لا يشترط اكتمال الأصوات، وبنية الإشعارات الحالية لا تعرف أحداث التصويت، وقواعد مواعيد الاجتماع لا تفرض العلاقة الزمنية بين الفتح والإغلاق وموعد الاجتماع.

```text
APPROVED_COUNCILS_VOTING_COMPLETION_NOTIFICATIONS_AND_DATE_INVARIANTS_04

SCOPE=SOURCE_AND_MIGRATION_DRAFTS_ONLY
PRODUCTION_APPLY=DENY
DEPLOY=DENY
PUBLISH=DENY
PRODUCTION_WRITE=0
TEST_DATA_WRITE=0
LEGACY_DATA_AUTOFIX=DENY

```

لكن أثبّت **6 ضوابط مهمة** أثناء التنفيذ حتى لا نخلق فجوة جديدة:

1. **تعريف ELIGIBLE يجب أن يكون موحدًا في مكان واحد** ويُستخدم في `cast_council_vote` و`get_agenda_item_vote_progress` و`close_agenda_item_vote` والإشعارات. لا أريد أن تحسب دالة التقدم مجموعة مختلفة عن المجموعة التي يستطيع الـRPC قبول أصواتها. الأفضل helper خلفي واحد مثل `council_agenda_item_eligible_voters(...)`. هذا مهم أيضًا لأن واجهة التصويت الحالية تستبعد `viewer` بينما الحماية الخلفية الحالية ترتكز أساسًا على الحضور؛ لا يجوز أن يصبح لدينا شخص محسوب ضمن `ELIGIBLE` ولا يستطيع التصويت، فيستحيل إغلاق البند.
2. **حارس الإغلاق يجب أن يبقى تحت نفس قفل الـagenda item الحالي.** سيناريو آخر صوت وإغلاق الرئيس في نفس اللحظة يجب أن يكون آمنًا: إما يُسجل آخر صوت أولًا ثم يسمح بالإغلاق، أو يسبق الإغلاق ويرفض بـ`COUNCIL_VOTING_INCOMPLETE` ثم ينجح الصوت. لا race يسمح بإغلاق 4/5.
3. أضف حالة `ELIGIBLE=0` صراحةً. لا أريد أن تكون `0 = 0` وبالتالي `can_close=true`. إذا فُتح التصويت بدون أي ناخب مؤهل فليكن:  
`can_close=false` مع خطأ مثل `COUNCIL_VOTING_NO_ELIGIBLE_VOTERS`.
4. `vote_closed_result` **لا يُرسل بمجرد الضغط على إغلاق التصويت.** المسار الحالي يفصل `close_agenda_item_vote` عن `calculate_agenda_item_result`. لذلك:
  - عند الإغلاق يمكن إرسال حالة «أُغلق التصويت».
  - `vote_closed_result` يُرسل فقط بعد وجود نتيجة محسوبة فعلًا، أو غيّر الاسم إلى `vote_result_ready`.
  لا نرسل «النتيجة النهائية» قبل أن تُحسب فعليًا.
5. بالنسبة لتذكير 5 دقائق: لا تربطه حرفيًا بكل Poll مدته ثانيتان. استخدم mutation/sweep خادميًا **محدودًا ومُعطّلًا في الخلفية** مثل مرة كل 30–60 ثانية، مع dedupe خادمي. الـ2s polling يبقى للعرض فقط. كما يجب أن يكون `council_dispatch_due_vote_reminders()` **غير قابل للاستدعاء المباشر من authenticated/anon**؛ owner/service_role فقط، والمسار الخارجي محمي بسر.
  ونقطة مهمة: إنشاء endpoint محمي يجعل النظام **جاهزًا للجدولة**، لكنه لا يضمن تذكيرًا بعد 5 دقائق إذا لم يكن أي مستخدم داخل الجلسة حتى يتم ربط scheduler خارجي فعليًا. لا نسميه guaranteed background reminder قبل وجود scheduler.
6. `CHECK ... NOT VALID` للتواريخ اختيار صحيح، لكن تذكّر أنه سيُطبق على **أي صف جديد وأي UPDATE جديد**؛ أي اجتماع قديم مخالف لن يستطيع حتى تعديل حقل آخر إلا إذا صُححت مواعيده في نفس العملية. أعتبر هذا مقبولًا وآمنًا، فقط وثّقه. ولا تجعل فساد مواعيد استقبال قديمة يمنع إغلاق جلسة أصبحت أصلًا `in_session` أو استكمال المحضر؛ الحظر الزمني يكون على مراحل ما قبل الجلسة التي تعتمد على هذه المواعيد، حتى لا نحبس سجلًا تاريخيًا في منتصف lifecycle.

وأريد أن يكون مفتاح منع تكرار الإشعار **DB-backed** وليس ذاكرة تطبيق. مثلًا `dedupe_key` فريد، أو جدول deliveries منفصل. أمثلة:

```text
vote_opened:<agenda_item_id>:<user_id>
vote_reminder_5m:<agenda_item_id>:<user_id>
vote_completed:<agenda_item_id>:<user_id>
vote_result_ready:<agenda_item_id>:<user_id>

```

كما أن payload المسموح للإشعارات يحتاج توسيعًا آمنًا ليشمل فقط معلومات مثل `agenda_item_id`, `agenda_title`, `eligible`, `cast`, `pending`, `outcome`، **ولا يتضمن vote_value لأي شخص**.

مصفوفة الإغلاق المطلوبة قبل أن أعطي PASS:

```text
VOTE_PROGRESS_0_OF_3=PASS
VOTE_CLOSE_0_OF_3=DENY
VOTE_CLOSE_2_OF_3=DENY
VOTE_CLOSE_3_OF_3=PASS
ABSTAIN_COUNTS_AS_CAST=PASS

LAST_CAST_VS_CLOSE_CONCURRENCY=SERIALIZED
DOUBLE_VOTE=DENY
NON_ELIGIBLE_VOTE=DENY
VIEWER_ELIGIBILITY_CONTRACT=CONSISTENT

VOTE_OPENED_NOTIFICATION=PASS
VOTE_REMINDER_PENDING_ONLY=PASS
VOTE_REMINDER_DUPLICATE=ZERO
VOTE_COMPLETED_NOTIFICATION=PASS
VOTE_RESULT_NOTIFICATION_AFTER_RESULT_ONLY=PASS
INDIVIDUAL_VOTE_DIRECTION_LEAK=ZERO

REMINDER_SWEEP_ANON=DENY
REMINDER_SWEEP_AUTHENTICATED_DIRECT=DENY
REMINDER_SWEEP_SERVICE_ROLE=ALLOW
VOTE_PROGRESS_NON_MEMBER=DENY
VOTE_PROGRESS_MEMBER=ALLOW

DATE_VALID_OPEN_CLOSE_MEETING=PASS
DATE_CLOSE_BEFORE_OPEN=DENY
DATE_OPEN_AFTER_MEETING=DENY
DATE_CLOSE_AFTER_MEETING=DENY
NULL_INTAKE_WINDOW=PASS

LEGACY_INVALID_ROWS_REPORTED=PASS
LEGACY_INVALID_ROWS_AUTOFIXED=0
PRE_SESSION_INVALID_DATE_TRANSITION=DENY
ALREADY_IN_SESSION_LEGACY_COMPLETION_NOT_STRANDED=PASS

TSC=PASS
ACADEMIC_COUNCILS_SOURCE_TESTS=PASS
PG17_DRAFT_VERIFIER=PASS
DIFF_CHECK=PASS

MIGRATION_DRAFTS_ONLY=YES
PRODUCTION_CHANGE=0
DEPLOY=0
PUBLISH=0

```

وعند اكتمالها تكون النتيجة التي سأعتمدها:

```text
PASS_COUNCILS_VOTING_AND_DATE_INVARIANTS_04_SOURCE_AND_DRAFTS
PRODUCTION_CHANGE_AUTHORIZED=NO

```

ثم أراجع **مسودة الـSQL نفسها** قبل أي تصريح منفصل لتطبيقها على الإنتاج.COUNCILS_VOTING_COMPLETION_NOTIFICATIONS_AND_DATE_INVARIANTS_04

وضع التنفيذ: **SOURCE + MIGRATION DRAFT ONLY** — لا تطبيق إنتاجي، لا نشر، لا كتابة بيانات اختبارية، ولا تصحيح تلقائي لأي اجتماع قائم.

## ما تم التحقق منه فعليًا قبل الخطة

- `close_agenda_item_vote` تتحقق فقط من: وجود البند، أن الاجتماع `in_session`، أن المستدعي `chair`، وأن حالة البند `voting_open` — **لا يوجد أي مقارنة بين عدد الأصوات وعدد المؤهلين**. الإغلاق المبكر ممكن فعلًا عبر استدعاء RPC مباشر.
- `cast_council_vote` تشترط كشف حضور بحالة `finalized`، وحساب الحضور الفعلي في التقارير يستخدم `attendance_state IN ('present','present_remote')` — وهذا يطابق تعريف الأهلية المعتمد.
- قائمة أحداث الإشعارات المسموحة في العقد الخادمي هي: meeting_scheduled, intake_opened, intake_closing, intake_closed, topic_submitted, needs_completion, accepted, rejected, agenda_ready, attendance_requested, session_ready, decision_assigned, decision_nearing_deadline, decision_overdue, meeting_archived. **لا يوجد أي حدث تصويت**، وأي محاولة إرسال ترفض بـ `COUNCIL_NOTIFICATION_EVENT_TYPE_NOT_ALLOWED`.
- تعديل الاجتماع يستخدم `COALESCE` على `intake_opens_at` / `intake_closes_at` دون أي تحقق من ترتيبها، ولا يوجد CHECK على الجدول.
- فحص إنتاجي للقراءة فقط على `academic_council_meetings` (6 اجتماعات): **2 سجلات إغلاق قبل الفتح، 2 سجلات إغلاق بعد موعد الاجتماع، 1 سجل فتح بعد موعد الاجتماع.** أي أن السجلات المخالفة موجودة فعلًا وليست حالة عرض.
- لا توجد بنية جدولة قائمة (لا pg_cron ولا مسارات `api/public`) — لذلك تذكير الـ5 دقائق يحتاج آلية خادمية جديدة، لا مؤقّت في المتصفح.

## 1. حارس اكتمال التصويت (خادمي)

العقد:

```text
ELIGIBLE = أعضاء كشف الحضور النهائي بحالة present أو present_remote
CAST     = عدد أصوات البند (yes | no | abstain)
CLOSE_OK = CAST = ELIGIBLE
```

- دالة قراءة جديدة `get_agenda_item_vote_progress(agenda_item_id)` تُرجع `eligible`, `cast`, `pending`, `can_close` دون كشف اتجاه صوت أي عضو.
- تعديل `close_agenda_item_vote` (forward-only) لرفع:
`COUNCIL_VOTING_INCOMPLETE CAST=<n> ELIGIBLE=<n> PENDING=<n>` عند النقص. الامتناع يُحتسب صوتًا مكتملًا.
- الواجهة: شريط تقدم «صوّت 3 من 5 — متبقٍ 2»، وزر «إغلاق التصويت» معطّل حتى الاكتمال مع تعليل نصي. الزر المعطّل طبقة UX فقط؛ الحماية الفعلية في الـRPC.

## 2. إشعارات دورة التصويت

توسيع قائمة الأحداث المسموحة بأربعة أحداث: `vote_opened`, `vote_reminder`, `vote_completed`, `vote_closed_result` مع عناوين ونصوص عربية في نفس دالة البناء الحالية، وقواعد مستقبِلين:


| الحدث                   | المستقبلون                             |
| ----------------------- | -------------------------------------- |
| فتح التصويت             | كل عضو مؤهل (حاضر في الكشف النهائي)    |
| تذكير بعد 5 دقائق       | المؤهلون الذين لم يصوّتوا فقط          |
| اكتمال الأصوات          | الرئيس وأمين السر، وإشعار حالة للأعضاء |
| الإغلاق واعتماد النتيجة | المشاركون                              |


لا يكشف أي إشعار كيف صوّت شخص بعينه؛ الحالة والتقدم والنتيجة النهائية فقط.

## 3. تذكير الـ5 دقائق (خادمي وموثوق)

- تسجيل `vote_opened_at` عند فتح التصويت.
- دالة كنس idempotent `council_dispatch_due_vote_reminders()` ترسل تذكيرًا واحدًا فقط لكل (بند، عضو) عبر مفتاح تفرّد، لمن مضى على فتح تصويتهم ≥ 5 دقائق ولم يصوّتوا.
- مسار تشغيل مزدوج: استدعاء آمن ضمن الاستطلاع الحي للجلسة (خادمي، محكوم، غير مكرر) + مسار `api/public` محمي بسر للجدولة الخارجية لاحقًا. لا `setTimeout` في المتصفح.

## 4. التحديث الحي

مكتمل جزئيًا في التسليم السابق (استطلاع 2 ثانية أثناء `in_session`، 5 ثوانٍ للمؤشرات، توقّف عند إخفاء الصفحة، وقراءة صوت العضو من الخادم). يُستكمل هنا: تقدم التصويت وعدّاد الإشعارات ضمن نفس دورة الاستطلاع، وإيقافها فور مغادرة مساحة الاجتماع.

## 5. ثوابت مواعيد الاجتماع

القاعدة: `intake_opens_at < intake_closes_at <= scheduled_at` مع السماح بـNULL عند عدم استخدام نافذة استقبال.

ثلاث طبقات:

1. **UI**: تحقق في نموذج الإنشاء/التعديل مع رسائل عربية واضحة قبل الإرسال.
2. **Server function**: تحقق العلاقة الزمنية في Zod/المتحقق قبل استدعاء الـRPC.
3. **DB**: حارس داخل RPC الإنشاء والتعديل يرفع `COUNCIL_MEETING_DATE_INVARIANT_VIOLATION`، بالإضافة إلى CHECK على الجدول يُطبّق **NOT VALID** حتى لا يكسر السجلات القديمة، ويُصادق لاحقًا بعد تصحيح البيانات بتصريح منفصل.

## 6. السجلات القديمة المخالفة

- تقرير قراءة فقط يسرد كل اجتماع مخالف ونوع المخالفة (إغلاق قبل فتح / استقبال بعد موعد الاجتماع).
- في الواجهة: شريط تحذير على بطاقة الاجتماع المخالف:
«⚠️ توجد مشكلة في مواعيد هذا الاجتماع: فترة استقبال الموضوعات غير متوافقة مع موعد الاجتماع. يلزم تصحيح المواعيد قبل متابعة دورة الاجتماع.»
- تعطيل مؤقت لاعتماد جدول الأعمال وفتح الجلسة وأي انتقال lifecycle يعتمد على هذه المواعيد، لهذه السجلات فقط.
- **لا تصحيح تلقائي لأي تاريخ.** التصحيح يحتاج قرارًا بشريًا لكل سجل وتصريح إنتاجي منفصل.

## المخرجات

- مسودات ترحيل تحت `docs/migration-drafts/` (حارس الإغلاق، أحداث الإشعارات + التذكير، ثوابت التواريخ) — غير مطبّقة.
- تعديلات مصدر للواجهة وخوادم الدوال (تقدم التصويت، التحذيرات، تحقق التواريخ).
- اختبارات عقد مصدرية + مصفوفة تفويض سلبية للـRPC الجديد/المعدّل.
- تقرير قراءة فقط بالسجلات المخالفة.

## قرار الإغلاق المتوقع

`PASS_COUNCILS_VOTING_AND_DATE_INVARIANTS_04_SOURCE_AND_DRAFTS` — مع بقاء `PRODUCTION_CHANGE_AUTHORIZED=NO` حتى صدور تصريح تطبيق منفصل.