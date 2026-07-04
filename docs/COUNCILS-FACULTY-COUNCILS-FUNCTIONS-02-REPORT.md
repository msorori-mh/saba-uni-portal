# COUNCILS-FACULTY-COUNCILS-FUNCTIONS-02 — تقرير تنفيذ دوال بوابة هيئة التدريس

**التاريخ:** 2026-07-04  
**القرار:** **PASS**  
**التوصية التالية:** **READY_FOR_COUNCILS_FACULTY_TOPICS_HISTORY_UI_01**

---

## 1. الملفات المعدّلة

| الملف | التغيير |
|-------|---------|
| `src/lib/faculty-councils.functions.ts` | توسيع كامل: أنواع + 4 دوال جديدة + helpers مشتركة |

**لم يُمس:** UI، routes، migrations، RLS، Storage، admin، service role.

---

## 2. الدوال المضافة / الموسّعة

| الدالة | النوع | الغرض |
|--------|-------|--------|
| `getMyAcademicCouncilMemberships` | **محفوظة** | عضويات فعّالة فقط — للصفحة الحالية |
| `getMyAcademicCouncilMembershipsV2` | **جديدة** | `currentMemberships` + `previousMemberships` |
| `getMyCouncilMeetings` | **جديدة** | `upcomingMeetings` + `previousMeetings` |
| `getMyCouncilTopics` | **جديدة** | `mySubmittedTopics` + `councilVisibleTopics` |
| `submitCouncilTopic` | **جديدة** | تقديم موضوع — **لم تُستدعَ أثناء التنفيذ** |

---

## 3. توافق الدالة القديمة

`getMyAcademicCouncilMemberships` **بقيت كما هي** من حيث الشكل والسلوك:

- نفس النوع `MyAcademicCouncilMembership`
- نفس الفلتر: `is_active=true` و`active_to IS NULL`
- الصفحة `/faculty-portal/academic-councils` **لا تتأثر**

تم استخراج `assertActiveFacultyProfile` كـ helper مشترك دون تغيير منطق الدالة القديمة.

---

## 4. تقسيم العضويات (V2)

**المصدر:** `academic_council_members` حيث `user_id = المستخدم الحالي` — RLS يحدد ما يُرجع.

| المجموعة | المعيار |
|----------|---------|
| `currentMemberships` | `is_active = true` و`active_to IS NULL` |
| `previousMemberships` | أي صف لا يحقق شرط العضوية الفعّالة (`is_active=false` أو `active_to` معيّن) |

**حقول إضافية في V2:** `department_name` (من `departments.name_ar`)، `active_to`، `created_at`، الحقل `role` بدل `member_role`.

---

## 5. تقسيم الاجتماعات

**المصدر:** `academic_council_meetings` — RLS يفلتر حسب العضوية الفعّالة أو الفترة التاريخية (بعد `COUNCILS-FACULTY-HISTORY-RLS-01`).

| المجموعة | المعيار |
|----------|---------|
| `upcomingMeetings` | `scheduled_at >= now()` — ترتيب تصاعدي |
| `previousMeetings` | `scheduled_at < now()` — ترتيب تنازلي |

**ملخصات مُشتقة (قراءة فقط عبر RLS):**

- `agenda_summary` من `academic_council_agenda_items`
- `minutes_summary` من `academic_council_minutes.body` (مختصر)
- `user_membership_role` من صف العضوية الذي يغطي `scheduled_at` ضمن `[active_from, active_to]`

---

## 6. التعامل مع الموضوعات

**المصدر:** `academic_council_topics` — RLS يحدد المرئي (عضو مجلس / مقدّم / إدارة).

| المجموعة | المعيار |
|----------|---------|
| `mySubmittedTopics` | `submitted_by = auth.uid()` |
| `councilVisibleTopics` | باقي الصفوف المرئية عبر RLS |

**تعيين الحقول:**

- `description` ← `body`
- `admin_notes` ← `review_note` (إن سمحت RLS)
- `agenda_order` ← أقل `order_index` من `academic_council_agenda_items` المرتبطة بـ `topic_id`

لا تُجلب موضوعات خارج نطاق RLS — الاستعلام يمر عبر `context.supabase` فقط.

---

## 7. منع viewer من تقديم موضوع

طبقتان في `assertCanSubmitCouncilTopic`:

1. **RPC** `can_submit_council_topic(_user, _council)` إن وُجد بعد migration RLS — يُستخدم أولاً.
2. **Fallback تطبيقي** (بدون service role):
   - عضوية فعّالة في المجلس (`is_active=true`, `active_to IS NULL`)
   - `member_role` ضمن `{chair, secretary, member, vice_chair}`
   - رفض صريح لـ `viewer` برسالة: *«دور المطّلع لا يسمح بتقديم موضوعات للمجلس.»*

`submitCouncilTopic` يرفض أيضاً أي مدخلات إضافية في الـ payload:

- `meeting_id`
- `status`
- `admin_notes` / `review_note`

**الإدراج الثابت:** `status = submitted`، `meeting_id = null`، `submitted_by = context.userId`.

---

## 8. نتائج الاختبار

| الفحص | النتيجة |
|-------|---------|
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** (exit 0) |
| تعديل UI | ❌ لم يُنفَّذ |
| تعديل routes | ❌ لم يُنفَّذ |
| migration | ❌ |
| RLS changes | ❌ |
| service role | ❌ |
| seed/import | ❌ |
| حذف | ❌ |
| إنشاء بيانات فعلية | ❌ — `submitCouncilTopic` مُعرَّفة فقط |
| Storage / Email / Cron | ❌ |

---

## 9. تأكيدات الامتثال

| البند | الحالة |
|-------|--------|
| `context.supabase` فقط | ✅ |
| لا admin bypass | ✅ |
| لا DELETE / UPDATE موضوعات في هذه المرحلة | ✅ |
| لا إنشاء اجتماعات أو قرارات | ✅ |
| لا تعطيل عضويات | ✅ |

---

## 10. التوصية التالية

**READY_FOR_COUNCILS_FACULTY_TOPICS_HISTORY_UI_01**

المرحلة القادمة:

1. تحديث `/faculty-portal/academic-councils` لاستخدام `getMyAcademicCouncilMembershipsV2`.
2. إضافة أقسام الاجتماعات والموضوعات عبر `getMyCouncilMeetings` و`getMyCouncilTopics`.
3. ربط نموذج تقديم الموضوع بـ `submitCouncilTopic` (بعد اختبار يدوي محدود).
4. التأكد من تطبيق `COUNCILS-FACULTY-HISTORY-RLS-01` في الإنتاج قبل تفعيل الأرشيف التاريخي.
