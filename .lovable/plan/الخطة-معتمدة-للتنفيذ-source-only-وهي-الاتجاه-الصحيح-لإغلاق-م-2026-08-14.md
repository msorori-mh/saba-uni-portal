# الخطة **معتمدة للتنفيذ Source-only**، وهي الاتجاه الصحيح لإغلاق مشكلة الجلسة الحية وجدول الأعمال بدون فتح Migration جديدة.

```text
APPROVED_COUNCILS_LIVE_SESSION_AND_AGENDA_UX_03

SCOPE=SOURCE_ONLY
MIGRATION=DENY
RPC_CONTRACT_CHANGE=DENY
AUTHORIZATION_CHANGE=DENY
PRODUCTION_WRITE=0
DEPLOY=DENY
PUBLISH=DENY

```

لكن عندي **تصحيح تقني واحد مهم جدًا للبند 2** قبل التنفيذ:

`getCouncilVoteResultFn` الحالي **لا يعيد صوت المستخدم الحالي**؛ الـRPC يعيد فقط:

```text
has_result
yes_count
no_count
abstain_count
total_votes
outcome

```

ولا يوجد فيه `current_user_vote`.

لذلك لا أريد أن ينفذ Lovable منطقًا يفترض أن نتيجة هذا الاستعلام تحتوي صوت العضو.

ضمن شرط **Source-only** عندنا خيار صحيح بدون تعديل RPC:

- قراءة صف المستخدم نفسه من جدول `academic_council_votes` باستخدام الجلسة الحالية:  
`agenda_item_id + voter_user_id = auth user`
- واستخدام `vote_value` كحالة authoritative بعد Refresh.
- إذا تعذرت القراءة، لا نظهر «لم تصوّت»؛ نظهر حالة محايدة مثل **«جارٍ التحقق من حالة تصويتك»**.

هذا ممكن لأن الجدول موجود بالفعل وصلاحية القراءة للمستخدمين المصادقين موجودة تحت RLS الحالية. كما أن النظام يمنع التصويت المكرر خلفيًا أصلًا.

### ضوابط التنفيذ التي أريد إضافتها

التحديث كل ثانيتين يكون **فقط داخل الاجتماع المفتوح وحالته** `in_session`، وليس لكل صفحة المجالس وكل Queries. تحديدًا:

- `council-session-agenda`
- حالة التصويت/صوت المستخدم
- النصاب/الحضور إن كان ظاهرًا داخل الاجتماع

أما مؤشرات المجلس العامة فـ5 ثوانٍ كافية، وفقط عندما تكون الصفحة مرئية.

وفي `CouncilMemberWorkspace`، إزالة بطاقة «جدول الأعمال» الحالية صحيحة جدًا؛ الـRPC الحالي يجلب بنود **كل اجتماعات المجلس** ضمن `agenda_items`، ولذلك هذه البطاقة هي سبب ظهور البنود المختلطة في الصورة.

ويجب أن يصبح جدول الأعمال الكامل **Meeting-scoped فقط** داخل `CouncilMeetingWorkspacePanel`.

النتيجة المطلوبة من Lovable:

```text
PASS_COUNCILS_LIVE_SESSION_AND_AGENDA_UX_03

LIVE_SESSION_POLLING=PASS
LIVE_SESSION_INTERVAL_MS=2000
COUNCIL_LIVE_INDICATORS_INTERVAL_MS=5000
BACKGROUND_POLLING=OFF
WINDOW_FOCUS_REFETCH=ON

VOTE_OPEN_APPEARS_WITHOUT_REFRESH=PASS
VOTE_CLOSE_APPEARS_WITHOUT_REFRESH=PASS
VOTE_RESULT_REFRESHES_AUTOMATICALLY=PASS

CURRENT_USER_VOTE_SERVER_BACKED=PASS
CURRENT_USER_VOTE_SURVIVES_RELOAD=PASS
FALSE_NOT_VOTED_CLAIM=ZERO

CROSS_MEETING_AGENDA_MIXING=ZERO
OVERVIEW_AGENDA_CARD_REMOVED=PASS
MEETING_AGENDA_SCOPED_TO_ONE_MEETING=PASS

AGENDA_STATUS_PENDING=بانتظار المناقشة
AGENDA_STATUS_IN_DISCUSSION=قيد المناقشة
AGENDA_STATUS_VOTING_OPEN=التصويت مفتوح
AGENDA_STATUS_VOTING_CLOSED=انتهى التصويت
AGENDA_STATUS_RESOLVED=تم البت

ACTIVE_VOTE_VISUAL_PRIORITY=PASS
RESOLVED_ITEM_SUCCESS_STATE=PASS
PENDING_ITEM_NEUTRAL_STATE=PASS

TSC=PASS
ACADEMIC_COUNCILS_TESTS=PASS_OR_PREEXISTING_ROUTETREE_HASH_ONLY
DIFF_CHECK=PASS

MIGRATION=0
PRODUCTION_WRITE=0
DEPLOY=0
PUBLISH=0

```

وهذه المهمة تظل منفصلة عن الحزمة التالية الخاصة بـ **منع إغلاق التصويت قبل اكتمال الأصوات + إشعارات التصويت + تصحيح قواعد التواريخ**؛ تلك تحتاج Backend/Migration draft، فلا نخلطها مع UX_03.إغلاق واجهة المجالس — الجلسة الحية وجدول الأعمال (UX_03)

نطاق العمل: مصدر فقط (Source-only). لا Migration، لا تغيير تفويض خلفي، لا كتابة إنتاجية.

## 1. التحديث التلقائي أثناء الجلسة (Adaptive Live Polling)

- استعلامات الجلسة (لوحة الجلسة، بنود جدول الأعمال داخل الاجتماع، حالة التصويت، النصاب) تحصل على `refetchInterval` تكيّفي:
  - الاجتماع في حالة `in_session`: كل ثانيتين.
  - صفحة المجلس مفتوحة بدون جلسة جارية: كل 5 ثوانٍ للمؤشرات الحية فقط.
  - لا polling عندما تكون الصفحة مخفية (`refetchIntervalInBackground: false` + توقف عند `document.hidden`).
- تفعيل `refetchOnWindowFocus` للاستعلامات الحية وخفض `staleTime` بما يتوافق مع الفاصل.
- الإبقاء على `invalidateQueries()` بعد كل إجراء محلي كما هو.
- عند فتح التصويت من الرئيس يظهر لدى العضو خلال ~ثانيتين مع CTA واضح «صوّت الآن».

## 2. صوت العضو يأتي من الخادم لا من الحالة المحلية

- `CouncilVotingControl` يقرأ صوت المستخدم الحالي من نتيجة الاستعلام بدل `useState` المحلي فقط، فيبقى ظاهراً بعد التحديث أو إعادة التحميل.
- إذا لم يوفر العقد الحالي صوت المستخدم، تُستخدم الحالة المحلية كاحتياط فقط دون ادعاء «لم تصوّت».

## 3. إصلاح خلط جداول الأعمال في «نظرة المجلس»

- إزالة بطاقة «جدول الأعمال» من `CouncilMemberWorkspace` لأنها تدمج بنود اجتماعات متعددة.
- بدلاً منها ملخص للجلسة الحالية فقط: البند الحالي، حالته، وجود تصويت مطلوب، وزر «دخول الجلسة» الذي يفتح مساحة الاجتماع.
- جدول الأعمال الكامل يظهر حصراً بعد فتح اجتماع محدد داخل `CouncilMeetingWorkspacePanel`، مرقّماً 1،2،3… لهذا الاجتماع فقط.

## 4. عرض حالات البنود داخل الاجتماع

- تسلسل واضح: بانتظار المناقشة → قيد المناقشة → التصويت مفتوح → انتهى التصويت → تم البت.
- تمييز بصري: البند النشط/التصويت المفتوح بارز، المنتهي بلون النجاح، المعلّق هادئ — كلها عبر رموز التصميم الدلالية.
- تغيير التسمية «مُبت فيه» إلى «تم البت» في خرائط الحالات.

## تفاصيل تقنية

- ملفات متوقعة: `src/components/councils/CouncilMemberWorkspace.tsx`، `CouncilVotingControl.tsx`، `CouncilSessionAndGovernanceWorkspace.tsx`، `src/components/portal/councils/MeetingAgendaExpandable.tsx`، `CouncilMeetingWorkspacePanel.tsx`، `src/routes/faculty-portal.academic-councils.tsx`، وملف مساعد صغير لمنطق الفاصل الزمني الحيّ.
- لا تعديل على دوال الخادم أو صلاحياتها؛ فقط استهلاك النتائج الحالية.
- التحقق: `bunx tsc --noEmit` + اختبارات `tests/academic-councils` مع تحديث حراس الواجهة المتأثرة بالتسميات الجديدة.