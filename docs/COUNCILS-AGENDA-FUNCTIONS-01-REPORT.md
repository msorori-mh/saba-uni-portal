# COUNCILS-AGENDA-FUNCTIONS-01 — تقرير

**التاريخ:** 2026-07-06  
**القرار:** **PASS**  
**التوصية التالية:** **READY_FOR_COUNCILS_AGENDA_FUNCTIONS_PR**

---

## ملخص

أُضيفت دوال إدارة جدول أعمال اجتماعات المجالس في طبقة server functions فقط، باستخدام `context.supabase` وRLS، دون UI ودون migrations ودون service role.

---

## الملفات المعدّلة

| الملف | التغيير |
|-------|---------|
| `src/lib/admin-councils.functions.ts` | 7 دوال كتابة/مراجعة + قراءة أدمن + أنواع ومُساعِدات |
| `src/lib/faculty-councils.functions.ts` | `getAgendaItemsForMeeting` لقراءة أعضاء هيئة التدريس |

**لم يُمس:** migrations، DB/RLS، UI، routes، Storage.

---

## الدوال المضافة

### في `admin-councils.functions.ts`

| الدالة | الغرض |
|--------|-------|
| `getAgendaItemsForMeeting` | بنود أجندة اجتماع + بيانات موضوع/اجتماع/مجلس — مع `assertCouncilsReader` |
| `getAvailableTopicsForAgenda` | موضوعات `accepted_for_agenda` غير المضافة بعد لنفس الاجتماع |
| `reviewCouncilTopic` | مراجعة موضوع (حالة + `review_note` + `meeting_id` اختياري عند القبول) |
| `addTopicToAgenda` | إدراج موضوع مقبول كبند أجندة |
| `addManualAgendaItem` | بند يدوي `topic_id = null` |
| `updateAgendaItem` | تعديل عنوان/ملاحظات/ترتيب/`is_approved` |
| `reorderAgendaItems` | تحديث دفعي لـ `order_index` (مرحلتان لتجنب UNIQUE) |
| `finalizeMeetingAgenda` | اعتماد البنود + `meetings.status = agenda_ready` |

### في `faculty-councils.functions.ts`

| الدالة | الغرض |
|--------|-------|
| `getAgendaItemsForMeeting` | نفس شكل النتيجة — لأعضاء المجلس عبر `assertActiveFacultyProfile` + RLS |

**لم تُنفَّذ:** `removeAgendaItem` — مؤجَّلة كما طُلب.

---

## اشتقاق `added_to_agenda`

- **لا يُستخدم** كقيمة enum في أي دالة.
- الحالة المشتقة للعرض لاحقاً في UI:
  - إذا وُجد صف في `academic_council_agenda_items` حيث `topic_id = topics.id` → «مُضاف إلى جدول الأعمال».
  - وإلا تُعرض `topics.status` كما هي (`accepted_for_agenda`، `submitted`، …).
- `getMyCouncilTopics` الحالية تستخدم بالفعل `agenda_order` مشتقاً من `agenda_items` — لم تُكسر.

---

## منع تكرار الموضوع في نفس الاجتماع

1. **`getAvailableTopicsForAgenda`:** يستبعد `topic_id` الموجودة مسبقاً في `academic_council_agenda_items` لنفس `meeting_id`.
2. **`addTopicToAgenda`:** قبل INSERT يستدعي `assertTopicNotAlreadyInMeetingAgenda` — استعلام `meeting_id + topic_id`؛ عند الوجود يرمي: «هذا الموضوع مضاف مسبقاً إلى جدول الأعمال.»

---

## التفريق بين إعداد الأجندة واعتمادها

| الطبقة | الإعداد (ترتيب/إضافة/تعديل) | الاعتماد النهائي |
|--------|------------------------------|------------------|
| **RLS** | `can_write_council_agenda` — admin + chair + secretary | `can_schedule_council_meeting` على `meetings_update` — admin + chair فقط |
| **الدوال** | `add*` / `update*` / `reorder*` → `assertCanWriteCouncilAgenda` | `finalizeMeetingAgenda` → `assertCanScheduleCouncilMeeting` ثم `agenda_ready` |
| **MVP** | secretary يستطيع إعداد وترتيب البنود | secretary **لا** يستطيع `finalizeMeetingAgenda` — رسالة: «لا تملك صلاحية اعتماد جدول الأعمال.» |

`updateAgendaItem` يسمح بتعيين `isApproved` لمن يملك `can_write_council_agenda` (بما فيه secretary عبر RLS) — لكن **إعلان** `agenda_ready` محصور في `finalizeMeetingAgenda` على chair/admin.

---

## الموضوعات المتاحة — قرار الحالة

- enum يدعم **`accepted_for_agenda`** ✅
- `getAvailableTopicsForAgenda` يفلتر على هذه الحالة فقط.
- `addTopicToAgenda` يرفض غير `accepted_for_agenda` برسالة عربية واضحة.

---

## رسائل الأخطاء العربية

| الرسالة | الاستخدام |
|---------|-----------|
| تعذر تحميل جدول الأعمال. | فشل قراءة الأجندة/الاجتماع |
| تعذر تحميل الموضوعات المتاحة. | `getAvailableTopicsForAgenda` |
| لا تملك صلاحية إدارة جدول أعمال هذا المجلس. | RLS/كتابة أجندة |
| لا يمكن إضافة موضوع من مجلس مختلف. | عدم تطابق `council_id` |
| هذا الموضوع مضاف مسبقاً إلى جدول الأعمال. | تكرار `topic_id` |
| تعذر حفظ ترتيب جدول الأعمال. | `reorderAgendaItems` |
| لا تملك صلاحية اعتماد جدول الأعمال. | `finalizeMeetingAgenda` / secretary |
| انتهت جلسة تسجيل الدخول، يرجى تسجيل الدخول مرة أخرى. | JWT منتهٍ |

---

## المحافظة على الموجود

- دوال الاجتماعات (`scheduleCouncilMeeting`، `updateCouncilMeeting`، …) — **لم تُمس**.
- دوال الموضوعات (`submitCouncilTopic`، `getMyCouncilTopics`) — **لم تُمس**.
- دوال المرفقات والعضويات — **لم تُمس**.
- واجهات admin/faculty — **لم تُمس**.

---

## نتائج build / typecheck

| الأمر | النتيجة |
|-------|---------|
| `npm run build` | ✅ exit 0 (~33s) |
| `npx tsc --noEmit` | ✅ exit 0 |

---

## تأكيد النطاق

| العنصر | الحالة |
|--------|--------|
| migrations جديدة | ❌ |
| DB/RLS changes | ❌ |
| UI changes | ❌ |
| route changes | ❌ |
| service role | ❌ |
| DELETE | ❌ |
| seed | ❌ |
| data writes أثناء التنفيذ | ❌ |

---

## ملاحظات

- N-01: `reorderAgendaItems` يتطلب قائمة كاملة بكل بنود الاجتماع (نفس العدد ونفس المعرفات) لتجنب ترتيب جزئي خاطئ.
- N-02: إعادة الترتيب تستخدم مرحلتين (`order_index` مؤقت 100000+ ثم القيم النهائية) لتجاوز `UNIQUE (meeting_id, order_index)`.
- N-03: `reviewCouncilTopic` يقبل `meetingId` اختيارياً عند `accepted_for_agenda` لربط الموضوع بالاجتماع قبل الإدراج.
- N-04: دوال الكتابة في admin يمكن لبوابة الرئيس استيرادها لاحقاً (نفس نمط `scheduleCouncilMeeting`).
- N-05: `finalizeMeetingAgenda` يعتمد البنود حتى لو كانت القائمة فارغة — يضبط `agenda_ready` فقط.

---

## المرحلة التالية

**READY_FOR_COUNCILS_AGENDA_FUNCTIONS_PR** → ثم `COUNCILS-AGENDA-ADMIN-UI-01` و`COUNCILS-AGENDA-FACULTY-UI-01`.

---

*نهاية التقرير — COUNCILS-AGENDA-FUNCTIONS-01*
