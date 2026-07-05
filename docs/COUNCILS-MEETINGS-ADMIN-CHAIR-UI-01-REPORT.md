# COUNCILS-MEETINGS-ADMIN-CHAIR-UI-01 — تقرير

**التاريخ:** 2026-07-06  
**القرار:** **PASS**  
**التوصية التالية:** **READY_FOR_COUNCILS_MEETINGS_ADMIN_CHAIR_UI_PR**

---

## ملخص

تمت إضافة واجهات جدولة وعرض وتعديل اجتماعات المجالس في لوحة الإدارة وبوابة عضو هيئة التدريس، مع الاعتماد على الدوال والـ RLS الموجودة دون تغيير server functions أو schema.

---

## الملفات المعدّلة

| الملف | التغيير |
|-------|---------|
| `src/routes/admin/academic-councils.tsx` | قسم «الاجتماعات» + جدولة + تعديل |
| `src/routes/faculty-portal.academic-councils.tsx` | V2 للعرض + جدولة chair + تعديل chair |

**لم يُمس:** migrations، DB/RLS، server functions، routes جديدة، Storage.

---

## لوحة الإدارة `/admin/academic-councils`

### عرض الاجتماعات

- قسم **«الاجتماعات»** بعد إدارة العضويات.
- يتطلب اختيار مجلس من القائمة.
- يستدعي `getCouncilMeetingsForAdmin({ councilId })`.
- جدول يعرض: `meeting_number`, العنوان, `scheduled_at`, المكان, الحالة, نافذة الاستقبال, الملاحظات.

### جدولة اجتماع (admin)

- نموذج داخل `CouncilMeetingsPanel` للمجلس المحدد.
- الحقول: عنوان، موعد، مكان، فتح/إغلاق الاستقبال، ملاحظات.
- الحفظ عبر `scheduleCouncilMeeting` — **لا** `created_by` ولا `meeting_number` من الواجهة.
- رسائل نجاح/خطأ عربية.

### تعديل اجتماع (admin)

- زر «تعديل» لكل صف → حوار تعديل.
- الحقول: title, scheduledAt, location, intakeOpensAt/ClosesAt, notes, status.
- عبر `updateCouncilMeeting`.
- **لا** حذف — **لا** أزرار delete.

---

## بوابة عضو هيئة التدريس `/faculty-portal/academic-councils`

### عرض الاجتماعات (V2)

- استبدال `getMyCouncilMeetings` بـ **`getMyCouncilMeetingsV2`**.
- أقسام: اجتماعات قادمة + سابقة.
- حقول إضافية: رقم الاجتماع، نافذة الاستقبال، الملاحظات، ملخص الأجندة/المحضر.

### واجهة الرئيس (chair)

- قسم **«جدولة اجتماع (رئيس المجلس)»** يظهر فقط إذا `role === 'chair'` في `currentMemberships`.
- اختيار مجلس إذا كان رئيساً لأكثر من مجلس.
- `scheduleCouncilMeeting` مع `councilId` لمجلس الرئيس فقط.
- زر **تعديل** على بطاقة الاجتماع إذا `chairCouncilIds.has(meeting.council_id)`.

### secretary / member / viewer

| الدور | الجدولة | التعديل | العرض |
|-------|---------|---------|-------|
| secretary | ❌ لا نموذج | ❌ لا زر | ✅ قراءة |
| member | ❌ | ❌ | ✅ قراءة |
| viewer | ❌ | ❌ | ✅ قراءة |
| chair | ✅ مجلسه فقط | ✅ مجلسه فقط | ✅ |

---

## الحماية النهائية (RLS)

- الواجهة تخفي النماذج عن غير المؤهلين.
- **الحاجز النهائي:** `can_schedule_council_meeting` على `meetings_insert/update` + دوال `scheduleCouncilMeeting` / `updateCouncilMeeting`.
- عند فشل RLS: «لا تملك صلاحية جدولة/تعديل اجتماع لهذا المجلس».

---

## build / typecheck

| الأمر | النتيجة |
|-------|---------|
| `npm run build` | ✅ exit 0 |
| `npx tsc --noEmit` | ✅ exit 0 |

---

## تأكيد النطاق

| العنصر | الحالة |
|--------|--------|
| migrations / DB / RLS | ❌ |
| server function changes | ❌ |
| routes جديدة | ❌ |
| Storage / service role | ❌ |
| DELETE / seed / اجتماعات اختبارية | ❌ |

---

## ملاحظات

- N-01: تغيير `status` الاجتماع من الواجهة متاح للأدمن والرئيس — يُنصح بمراجعة سياسة تشغيل لاحقاً إن رُغب تقييد secretary لفتح الاستقبال فقط (`COUNCILS-MEETINGS-OPERATIONS-RLS-01`).
- N-02: `datetime-local` يُحوَّل إلى ISO قبل الإرسال لتتوافق مع validators في الدوال.

---

## المرحلة التالية

- **PR:** `READY_FOR_COUNCILS_MEETINGS_ADMIN_CHAIR_UI_PR`
- **COUNCILS-TOPICS-REVIEW-ADMIN-UI-01** — مراجعة الموضوعات في admin
- **COUNCILS-MEETINGS-OPERATIONS-RLS-01** — فصل تشغيل الاستقبال عن الجدولة لـ secretary (اختياري)

---

*نهاية التقرير — COUNCILS-MEETINGS-ADMIN-CHAIR-UI-01*
