# إصلاح أزرار بطاقة «الاجتماع القادم» في المجالس الأكاديمية

HOLD_FACULTY_COUNCILS_NEXT_MEETING_ACTIONS_UX_01 — إصلاح Source-only فقط: لا Migration، لا كتابة إنتاجية، لا Publish، ولا تغيير في أي RPC أو صلاحية.

## الوضع المؤكد من المصدر

- `src/routes/faculty-portal.academic-councils.tsx` سطر 327: `onOpenMeeting={() => setWorkspaceTab("meetings")}` — لا يفتح الاجتماع المحدد.
- `NextMeetingPriorityCard` في `CouncilMeetingsWorkspace.tsx`: زر «عرض جدول الأعمال» (فرع العضو غير المخوّل) يستدعي نفس `onOpenMeeting`.
- جدول الأعمال متاح فعلاً داخل `MeetingAgendaExpandable` (بطاقة الاجتماع، سطر 449 من `CouncilMeetingCard.tsx`) ويستدعي `getAgendaItemsForMeeting` عند التوسيع فقط.
- زر «تقديم موضوع» يظهر بناءً على `submitEligibleMemberships` فقط، ثم تكتشف النافذة عبر `getOpenIntakeMeetingsForMember` أنه لا توجد اجتماعات باستقبال مفتوح فتعرض رسالة فارغة.

## التصحيح المطلوب

### 1. «فتح الاجتماع» يفتح الاجتماع المحدد
- إضافة حالة `focusMeetingId` في صفحة المجالس.
- الزر: تبديل التبويب إلى `meetings` + ضبط `focusMeetingId` + تمرير الصفحة (scroll) إلى بطاقة الاجتماع `council-meeting-card-{id}` مع `focus()` وإبراز مؤقت (ring) لثانيتين.
- تمرير `focusMeetingId` عبر `CouncilMeetingsWorkspace` إلى `CouncilMeetingCard`، وضمان اختيار التبويب الصحيح (القادمة/السابقة) حسب موقع الاجتماع.

### 2. «عرض جدول الأعمال» يفتح جدول أعمال الاجتماع نفسه
- إضافة `expandAgendaMeetingId` يمرَّر بنفس المسار حتى `MeetingAgendaExpandable`.
- `MeetingAgendaExpandable` يقبل خاصية `autoExpand`؛ عند تفعيلها يفتح القائمة تلقائياً (فيُطلق `getAgendaItemsForMeeting`) بدل مجرد تبديل التبويب، مع scroll إلى نفس البطاقة.
- يبقى الزر لدى صاحب صلاحية الكتابة كما هو (`CouncilAgendaDialog`).

### 3. رسالة صحيحة لزر «تقديم موضوع»
- جلب `getOpenIntakeMeetingsForMember` على مستوى الصفحة (نفس مفتاح الاستعلام المستخدم في النافذة، لتفادي طلب مكرر).
- إذا كانت النتيجة فارغة: الزر معطّل مع سبب واضح بدل فتح نافذة فارغة، ونص تحت بطاقة الاجتماع القادم عندما تكون حالته `agenda_ready` أو أبعد:
  «أُغلق استقبال الموضوعات لهذا الاجتماع بعد اعتماد جدول الأعمال.»
- إذا وُجد اجتماع واحد على الأقل بحالة استقبال مفتوح في أي مجلس، يبقى الزر فعّالاً ويفتح النافذة كالمعتاد.
- أثناء التحميل: الزر يبقى ظاهراً بحالة انتظار قصيرة دون رسالة مضللة.

## ملاحظات تقنية

- الملفات المتأثرة: `src/routes/faculty-portal.academic-councils.tsx`، `src/components/portal/councils/CouncilMeetingsWorkspace.tsx`، `CouncilMeetingCard.tsx`، `MeetingAgendaExpandable.tsx` (خاصية اختيارية فقط)، وربما `shared.tsx` لثابت نصي.
- لا تغيير في أي server function أو استعلام خلفي؛ الاستدعاءات القائمة فقط.
- الحفاظ على جميع `data-testid` الحالية لتفادي كسر `tests/academic-councils`.
- التحقق: `bunx tsc --noEmit` + `bun test tests/academic-councils` + `git diff --check`.
- بدون نشر: يبقى القرار مفتوحاً للمراجعة قبل أي Deploy.
