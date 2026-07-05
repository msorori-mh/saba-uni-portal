# COUNCILS-MEETINGS-FUNCTIONS-01 — تقرير

**التاريخ:** 2026-07-05  
**القرار:** **PASS**  
**التوصية التالية:** **READY_FOR_COUNCILS_MEETINGS_FUNCTIONS_PR**

---

## تأكيد النطاق

| العنصر | الحالة |
|--------|--------|
| migrations جديدة / تطبيق migration | ❌ |
| DB writes أثناء التنفيذ / seed | ❌ |
| UI / routes / admin UI / faculty UI | ❌ |
| service role في دوال الاجتماعات الجديدة | ❌ |
| DELETE / RLS changes | ❌ |

---

## الملفات المعدّلة

| الملف | التغيير |
|-------|---------|
| `src/lib/faculty-councils.functions.ts` | قراءة V2 + مساعدات مشتركة + إصلاح `TOPIC_SUBMIT_ROLES` |
| `src/lib/admin-councils.functions.ts` | قراءة admin + جدولة + تعديل |

**لم تُضف:** migrations، routes، UI.

---

## الدوال المضافة

### قراءة — `faculty-councils.functions.ts`

| الدالة | الوصف |
|--------|--------|
| `getMyCouncilMeetingsV2` | اجتماعات مجالس العضو (RLS) → `upcomingMeetings` / `previousMeetings` مع حقول إضافية: `meeting_number`, `intake_opens_at`, `intake_closes_at`, `notes`, `created_at`, `updated_at` |

**الدوال المحفوظة دون كسر:** `getMyAcademicCouncilMemberships`, `getMyAcademicCouncilMembershipsV2`, `getMyCouncilMeetings`, `getMyCouncilTopics`, `submitCouncilTopic`, مرفقات الموضوعات.

### قراءة + كتابة — `admin-councils.functions.ts`

| الدالة | الوصف |
|--------|--------|
| `getCouncilMeetingsForAdmin` | اجتماعات لمجلس محدد (`councilId` اختياري) أو كل ما يسمح RLS للأدمن |
| `scheduleCouncilMeeting` | إدراج في `academic_council_meetings` |
| `updateCouncilMeeting` | تعديل حقول مسموحة فقط |

**كلها تستخدم `context.supabase` فقط** — لا `supabaseAdmin` في دوال الاجتماعات الجديدة.

---

## أنواع TypeScript المضافة

- `CouncilMeetingV2Item`, `MyCouncilMeetingsV2Result` (faculty)
- `AdminCouncilMeetingItem`, `GetCouncilMeetingsForAdminResult` (admin)
- `ScheduleCouncilMeetingResult`, `UpdateCouncilMeetingResult` (admin)

---

## اعتماد الجدولة على RLS / helpers

### طبقة التطبيق (`assertCanScheduleCouncilMeeting`)

1. **أولاً:** RPC `can_schedule_council_meeting(_user, _council)` — بعد تطبيق migration `20260710120000_council_meeting_schedule_helpers.sql`.
2. **Fallback** (قبل تطبيق migration): `is_council_admin` **أو** `has_council_role(..., 'chair')` — **لا secretary**.

### طبقة DB (RLS)

- `INSERT` / `UPDATE` على `academic_council_meetings` → `can_schedule_council_meeting` (بعد تطبيق migration).
- حالياً على Supabase غير المُحدَّث: RLS قد لا يزال `can_write_council_agenda` — **يُوصى بتطبيق migration RLS قبل الإنتاج**.

### `scheduleCouncilMeeting`

- `created_by = context.userId` — لا يُقبل من الواجهة.
- `meeting_number` يُحسب تلقائياً (`max + 1` لكل مجلس).
- `status` افتراضي `scheduled` — لا يُقبل من الواجهة عند الإنشاء.
- رفض حقول: `created_by`, `meeting_number`, `status`, `council_id`, `updated_by`.

### `updateCouncilMeeting`

- لا تغيير `council_id`, `created_by`, `meeting_number`.
- التحقق من صلاحية الجدولة على `council_id` الحالي للاجتماع.
- حقول قابلة للتعديل: `title`, `scheduledAt`, `location`, `intakeOpensAt`, `intakeClosesAt`, `notes`, `status` (enum كامل).

---

## تأكيد: لا bypass لـ secretary

| الدور | `assertCanScheduleCouncilMeeting` | RLS (بعد migration) |
|-------|-----------------------------------|---------------------|
| secretary | ❌ | ❌ |
| member | ❌ | ❌ |
| viewer | ❌ | ❌ |
| chair | ✅ (نفس المجلس) | ✅ |
| admin / system_admin | ✅ | ✅ |

لا فحص يمنح secretary صلاحية جدولة أو تعديل اجتماع.

---

## رسائل الأخطاء العربية

| الحالة | الرسالة |
|--------|---------|
| فشل جدولة / RLS insert | لا تملك صلاحية جدولة اجتماع لهذا المجلس. |
| فشل تعديل / RLS update | لا تملك صلاحية تعديل هذا الاجتماع. |
| JWT منتهٍ | انتهت جلسة تسجيل الدخول، يرجى تسجيل الدخول مرة أخرى. |
| فشل تحميل | تعذر تحميل الاجتماعات. |
| فشل حفظ عام | تعذر حفظ الاجتماع. |

---

## build / typecheck

| الأمر | النتيجة |
|-------|---------|
| `npm run build` | ✅ exit 0 |
| `npx tsc --noEmit` | ✅ exit 0 |

---

## المخاطر والملاحظات

| # | ملاحظة |
|---|--------|
| N-01 | migration `can_schedule_council_meeting` في main لكن **غير مُطبَّقة** على Supabase — secretary قد يجدول مؤقتاً حتى التطبيق. |
| N-02 | `updateCouncilMeeting` يقيّد كل التعديلات على admin+chair؛ فتح استقبال بواسطة secretary يحتاج `COUNCILS-MEETINGS-OPERATIONS-RLS-01`. |
| N-03 | `getCouncilMeetingsForAdmin` يتطلب `assertCouncilsReader` (admin/dean/system_admin) — الرئيس خارج هذه الأدوار يستخدم `getMyCouncilMeetingsV2`. |
| N-04 | أُصلحت ثغرة `TOPIC_SUBMIT_ROLES` غير المعرّفة سابقاً في faculty (كانت تسبب خطأ compile). |

---

## المرحلة التالية المقترحة

1. **PR:** `READY_FOR_COUNCILS_MEETINGS_FUNCTIONS_PR`
2. تطبيق migration `20260710120000_council_meeting_schedule_helpers.sql` على Supabase
3. **COUNCILS-MEETINGS-ADMIN-UI-01** — تفعيل جدولة/عرض الاجتماعات في `/admin/academic-councils`
4. **COUNCILS-MEETINGS-FACULTY-UI-01** — عرض V2 في `/faculty-portal/academic-councils`

---

*نهاية التقرير — COUNCILS-MEETINGS-FUNCTIONS-01*
