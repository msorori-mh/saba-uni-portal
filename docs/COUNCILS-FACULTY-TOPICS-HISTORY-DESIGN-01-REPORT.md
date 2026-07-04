# COUNCILS-FACULTY-TOPICS-HISTORY-DESIGN-01 — تقرير تحليل وتصميم

**التاريخ:** 2026-07-04
**النطاق:** تحليل وتصميم فقط — **لم يُنفَّذ أي تعديل** على الكود أو DB أو RLS أو Storage.
**القرار:** **PASS** (مع متطلب RLS لاحق قبل تفعيل الأرشيف التاريخي)

**التوصية التالية:** **READY_FOR_COUNCILS_FACULTY_TOPICS_HISTORY_UI**
مع ترتيب التنفيذ: **ابدأ بـ RLS/helpers أولاً** ثم server functions ثم UI.

> ملاحظة: جداول الموضوعات والاجتماعات **موجودة وكافية لـ MVP**. لا حاجة لجداول جديدة لتقديم الموضوع الأساسي. مرحلة `COUNCILS-TOPIC-SUBMISSIONS-DB-01` مُوصى بها **فقط** لتصلية RLS + helpers للأرشيف، واختيارياً لمرفقات الموضوعات لاحقاً.

---

## 1. ملخص الوضع الحالي

| القدرة | DB Schema | RLS | Server Functions | UI |
|--------|-----------|-----|------------------|-----|
| عضويات فعّالة (faculty) | ✅ | ✅ جزئياً | ✅ `getMyAcademicCouncilMemberships` | ✅ قائمة بسيطة |
| عضويات سابقة / أرشيف | ✅ (`active_to`, `is_active`) | ❌ | ❌ | ❌ |
| اجتماعات قادمة/سابقة (faculty) | ✅ | ⚠️ أعضاء فعّالون فقط | ❌ | ❌ |
| تقديم موضوع | ✅ `academic_council_topics` | ⚠️ ثغرة viewer | ❌ | ❌ (`LockedAction`) |
| متابعة موضوع مقدّم | ✅ | ✅ `submitted_by = auth.uid()` | ❌ | ❌ |
| مراجعة موضوعات (admin) | ✅ | ✅ `can_write_council_agenda` | ❌ | ❌ (`LockedAction`) |
| إضافة لجدول أعمال | ✅ `academic_council_agenda_items` | ✅ | ❌ | ❌ |

**الوضع العام:** البنية التحتية لقاعدة البيانات **جاهزة منذ** `COUNCILS-MVP-DB-APPLY-01`. التطبيق يغطي حالياً **عضويات فعّالة + إدارة عضويات admin** فقط. باقي المسارات واجهة معطّلة (`LockedAction`) وقراءة فقط.

---

## 2. إجابات المطلوب التحليلي

### أولاً — عضويات العضو الحالية والسابقة

#### الدالة الحالية `getMyAcademicCouncilMemberships`

**الملف:** `src/lib/faculty-councils.functions.ts`

```typescript
.eq("user_id", context.userId)
.eq("is_active", true)
.is("active_to", null)
```

| السؤال | الجواب |
|--------|--------|
| هل ترجع العضويات الفعالة فقط؟ | **نعم** — فلتر صريح على `is_active=true` و`active_to IS NULL` |
| هل يمكن تعديلها لاحقاً؟ | **نعم** — بإزالة/توسيع الفلتر وتقسيم النتائج في التطبيق |
| معيار العضوية السابقة | **`is_active = false` و`active_to IS NOT NULL`** (كما يضبطها `deactivateCouncilMembership` في admin: يضع `active_to = اليوم`) |
| معيار العضوية الفعّالة | `is_active = true` و`active_to IS NULL` (متسق مع `isActiveMembership()` و`is_council_member()` في DB) |

**فجوة RLS حرجة:** سياسة `council_members_select` تسمح بالقراءة فقط إذا `is_council_admin` أو `is_council_member` (عضو **فعّال**). العضو السابق **لا يرى** سجل عضويته المعطّلة عبر RLS حتى لو عدّلنا الدالة.

**تعديل RLS مقترح لاحقاً (دون تنفيذ):**
- السماح بـ `SELECT` على صفوف `academic_council_members` حيث `user_id = auth.uid()` (قراءة سجل العضوية الخاصة بغض النظر عن `is_active`).

#### تصميم واجهة مقترح — `/faculty-portal/academic-councils`

```
┌─────────────────────────────────────────────────────────┐
│  مجالسي الأكاديمية                                      │
├─────────────────────────────────────────────────────────┤
│  [تبويب: مجالسي الحالية]  [تبويب: الأرشيف]              │
├─────────────────────────────────────────────────────────┤
│  مجالسي الحالية (N)                                     │
│  ┌─ بطاقة مجلس ─────────────────────────────────────┐  │
│  │ اسم المجلس · نوع · دور · منذ active_from          │  │
│  │ [عرض المجلس →]  (ينقل لتفاصيل المجلس)            │  │
│  └───────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│  الأرشيف (M) — عضويات سابقة                           │
│  ┌─ بطاقة أرشيف ────────────────────────────────────┐  │
│  │ اسم المجلس · دور سابق · من active_from إلى active_to│
│  │ شارة «عضوية منتهية» — قراءة تاريخية فقط           │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**مسار تفصيلي مقترح (لاحقاً):** `/faculty-portal/academic-councils/$councilId` يجمع الاجتماعات والموضوعات لمجلس واحد.

---

### ثانياً — الاجتماعات السابقة والقادمة

#### الجداول والحقول المتوفرة

**الجدول:** `academic_council_meetings` (migration `20260703192337_...`)

| الحقل | الغرض |
|-------|--------|
| `council_id` | ربط بالمجلس |
| `scheduled_at` | موعد الاجتماع |
| `status` | دورة حياة الاجتماع (انظر أدناه) |
| `title`, `location`, `meeting_number` | عرض |
| `intake_opens_at` / `intake_closes_at` | نافذة تقديم الموضوعات |
| `academic_year_id` | ربط سنة أكاديمية |
| `notes` | ملاحظات داخلية |

**حالات الاجتماع (`academic_council_meeting_status`):**
`scheduled` → `intake_open` → `intake_closed` → `agenda_ready` → `in_session` → `minutes_draft` → `minutes_locked` → `archived` | `cancelled`

**جداول مرتبطة:**
- `academic_council_agenda_items` — جدول الأعمال
- `academic_council_minutes` — المحضر (`is_locked`)
- `academic_council_decisions` — القرارات

**لا يوجد حقل `visibility` صريح** — الرؤية تُشتق من RLS + دور العضو + فترة العضوية.

#### ما الذي يراه العضو؟

| نوع العضو | الاجتماعات القادمة | الاجتماعات السابقة | المحاضر/القرارات |
|-----------|-------------------|-------------------|------------------|
| **عضو فعّال** (chair/secretary/member/viewer) | كل اجتماعات المجلس (حسب RLS الحالي) | نفس النطاق | حسب RLS الحالي (عضو مجلس يرى قرارات مجلسه) |
| **عضو سابق** | **لا شيء** (ليس عضواً فعّالاً) | **فترة عضويته فقط** (الخيار الآمن المقترح) | نفس نطاق فترة العضوية فقط، وبحد أقصى ما كان مرئياً أثناء العضوية |

**الخيار الآمن المقترح للعضو السابق:**
يرى اجتماعات حيث `scheduled_at::date` بين `active_from` و`COALESCE(active_to, CURRENT_DATE)` **لصف عضويته** — **وليس** أرشيف المجلس الكامل. يمنع تسريب محاضر/قرارات ما بعد انتهاء العضوية.

**Helper مقترح لاحقاً (migration، دون تنفيذ):**
```sql
is_council_member_during(_user uuid, _council uuid, _at timestamptz)
-- EXISTS membership row for user+council where
-- active_from <= _at::date AND (active_to IS NULL OR active_to >= _at::date)
-- AND (for historical-only queries: is_active can be false if active_to covers _at)
```

**توسيع `meetings_select` مقترح:**
```sql
USING (
  is_council_admin(auth.uid())
  OR is_council_member(auth.uid(), council_id)  -- فعّال
  OR is_council_member_during(auth.uid(), council_id, scheduled_at)  -- تاريخي
)
```

**تصنيف UI مقترح:**

| القسم | معيار |
|-------|--------|
| قادمة | `scheduled_at >= now()` و`status NOT IN ('cancelled','archived')` |
| سابقة | `scheduled_at < now()` أو `status IN ('archived','minutes_locked','cancelled')` |

**عرض للعضو الفعّال:** عنوان، موعد، مكان، حالة، هل استقبال الموضوعات مفتوح (`intake_open` + نافذة زمنية).
**لا يعرض:** مسودات محاضر غير مقفلة لغير secretary/chair (طبقة تطبيق لاحقة).

---

### ثالثاً — تقديم موضوع للمجلس

#### الجدول `academic_council_topics`

| المطلوب في التصميم | Schema الحالي | ملاحظة |
|-------------------|---------------|--------|
| `title` | ✅ | |
| `description` | ✅ `body` | تسمية UI عربية «الوصف» |
| `submitted_by` | ✅ | FK → `auth.users` |
| `council_id` | ✅ | |
| `meeting_id` nullable | ✅ | يُملأ عند الإضافة لاجتماع |
| `status` | ✅ enum | انظر جدول التعيين |
| `admin_notes` | ✅ `review_note` | + `reviewed_by` |
| `attachments` | ❌ | يحتاج Storage + جدول metadata لاحقاً |
| `created_at` / `updated_at` | ✅ | |

#### تعيين حالات الموضوع (مطلوب التصميم ↔ schema)

| مطلوب التصميم | قيمة Schema | ملاحظة |
|--------------|-------------|--------|
| `draft` | `draft` | مسودة محلية |
| `submitted` | `submitted` | بعد الإرسال |
| `under_review` | `under_review` | قيد مراجعة أمين/رئيس |
| `returned` | `needs_completion` | **إرجاع للتعديل** — الاسم في DB مختلف |
| `accepted` | `accepted_for_agenda` | مقبول مبدئياً |
| `rejected` | `rejected` | |
| `added_to_agenda` | `accepted_for_agenda` + `meeting_id` + صف في `academic_council_agenda_items` | الحالة + الربط بالاجتماع |
| (إضافي) | `deferred`, `decided`, `closed` | مراحل ما بعد الجلسة — للعرض لاحقاً |

**الخلاصة:** Schema **يكفي لـ MVP تقديم ومتابعة الموضوعات** دون جدول جديد. الفجوة الوحيدة الجوهرية: **المرفقات** (اختياري لاحقاً).

#### RLS الحالي للموضوعات

| العملية | السياسة | ملاحظة |
|---------|---------|--------|
| SELECT | admin أو عضو مجلس أو `submitted_by` | العضو السابق يرى مواضيعه عبر `submitted_by` ✅ |
| INSERT | `submitted_by = auth.uid()` وعضو مجلس | **يشمل viewer** — ثغرة يجب إغلاقها |
| UPDATE (مالك) | `draft` / `needs_completion` فقط | يمكن إعادة الإرسال كـ `submitted` |
| UPDATE (إدارة) | `can_write_council_agenda` | قبول/رفض/إضافة لأجندة |

**RLS مقترح لاحقاً لـ INSERT:**
```sql
WITH CHECK (
  submitted_by = auth.uid()
  AND (is_council_admin(...) OR (
    is_council_member(...) AND NOT has_council_role(..., 'viewer')
  ))
)
```

#### تدفق تقديم موضوع (تصميم)

```
[عضو] يختار مجلساً فعّالاً (دور ≠ viewer)
  → نموذج: عنوان + وصف + (فئة اختيارية)
  → حفظ مسودة (status=draft) أو إرسال (status=submitted, submitted_at=now)
[عضو] يتابع في «مواضيعي»
  → شارات حالة + review_note عند الإرجاع
[أمين/رئيس/admin] يراجع (لاحقاً في admin)
  → needs_completion | rejected | accepted_for_agenda
  → عند القبول: ربط meeting_id + agenda_item
```

---

### رابعاً — مصفوفة صلاحيات الأدوار (مقترحة)

| القدرة | chair | secretary | member | viewer |
|--------|:-----:|:---------:|:------:|:------:|
| عرض مجالسي (فعّالة) | ✅ | ✅ | ✅ | ✅ |
| عرض أرشيف عضوياتي | ✅ | ✅ | ✅ | ✅ |
| عرض اجتماعات قادمة | ✅ | ✅ | ✅ | ✅ |
| عرض اجتماعات سابقة (نطاق العضوية) | ✅ | ✅ | ✅ | ✅ (فترة العضوية فقط) |
| عرض جدول أعمال معتمد | ✅ | ✅ | ✅ | ✅ |
| عرض محضر مقفل | ✅ | ✅ | ✅ | ✅ |
| **تقديم موضوع** | ✅ | ✅ | ✅ | **❌** |
| تعديل مسودتي / إعادة بعد إرجاع | ✅ | ✅ | ✅ | ❌ |
| متابعة مواضيعي | ✅ | ✅ | ✅ | ❌ (لم يقدّم) |
| مراجعة موضوعات الأعضاء (admin portal) | ✅ | ✅ | ❌* | ❌ |
| قبول / رفض / إرجاع | ✅ | ✅** | ❌ | ❌ |
| إضافة لجدول أعمال | ✅ | ✅ | ❌ | ❌ |
| إنشاء اجتماع | admin/chair/secretary*** | | | |

\* **member** لا يراجع موضوعات الآخرين — فقط مواضيعه.
\** **secretary** عبر `can_write_council_agenda` في RLS الحالي.
\*** إنشاء الاجتماعات من **لوحة الإدارة** (`system_admin`/`admin`/`dean`) أو أدوار مجلس `chair`/`secretary` حسب سياسة تشغيل لاحقة.

**تطبيق الطبقات المقترحة:**
1. **RLS** — حد أدنى أمان (منع viewer من INSERT موضوع، نطاق اجتماعات تاريخية).
2. **Server functions** — تحقق دور + حالة faculty `active`.
3. **UI** — إخفاء أزرار التقديم لـ viewer وعرض شارة «مطّلع — قراءة فقط».

---

### خامساً — تصميم لوحة الإدارة (لاحقاً)

**القسم المقترح:** «المواضيع المقدمة» داخل `/admin/academic-councils`

```
┌──────────────────────────────────────────────────────────────┐
│  المواضيع المقدمة                                            │
│  فلتر: [المجلس ▼] [الحالة ▼] [من تاريخ] [بحث بالعنوان]      │
├──────────────────────────────────────────────────────────────┤
│  جدول: العنوان | المجلس | مقدّم | الحالة | تاريخ الإرسال | إجراء │
│  ─────────────────────────────────────────────────────────── │
│  موضوع X | مجلس الكلية | د. أحمد | submitted | ... | [مراجعة] │
├──────────────────────────────────────────────────────────────┤
│  لوحة مراجعة (drawer/modal):                                 │
│  - تفاصيل الموضوع + review_note سابقة                        │
│  - [قبول] [إرجاع للتعديل] [رفض] [إضافة إلى اجتماع ▼]        │
│  - عند الإضافة: اختيار اجتماع + order_index في الأجندة       │
└──────────────────────────────────────────────────────────────┘
```

**حالات الفلترة:** `submitted`, `under_review`, `needs_completion`, `accepted_for_agenda`, `rejected`, `deferred`

**الصلاحية:** `COUNCILS_READ_ROLES` + `can_write_council_agenda` على مستوى المجلس (أو admin عام).

**لا يُنفَّذ الآن** — يبقى القسم الحالي `LockedAction` + empty state.

---

## 3. تصميم واجهة عضو هيئة التدريس (مقترح كامل)

### الصفحة الرئيسية `/faculty-portal/academic-councils`

1. **مجالسي الحالية** — بطاقات قابلة للنقر.
2. **الأرشيف** — عضويات منتهية (`active_to` معروض).
3. **تنبيه:** «مطّلع» — لا يمكن تقديم موضوعات.

### صفحة مجلس `/faculty-portal/academic-councils/$councilId` (جديدة — لاحقاً)

| القسم | المحتوى |
|-------|---------|
| الاجتماعات القادمة | قائمة + شارة حالة استقبال الموضوعات |
| الاجتماعات السابقة | قائمة مُصفّاة بفترة العضوية للسابق |
| مواضيعي | قائمة بمواضيع `submitted_by = me` مع شارات الحالة |
| تقديم موضوع | زر → نموذج (معطّل لـ viewer) |

### نموذج تقديم موضوع

- حقول: عنوان (مطلوب)، وصف (مطلوب)، فئة (اختياري)
- أزرار: «حفظ مسودة» | «إرسال للمجلس»
- بعد الإرسال: redirect إلى «مواضيعي» مع toast

### متابعة الحالة

| الحالة | ما يراه العضو |
|--------|---------------|
| `draft` | يعدّل / يرسل |
| `submitted` / `under_review` | «قيد المراجعة» |
| `needs_completion` | `review_note` + زر «تعديل وإعادة إرسال» |
| `accepted_for_agenda` | «مقبول — مجدول لاجتماع» + اسم الاجتماع إن وُجد |
| `rejected` | سبب الرفض |
| `deferred` | «مؤجّل» |

---

## 4. هل نحتاج migration لاحقاً؟

| الحاجة | migration؟ | اسم مرحلة مقترح |
|--------|-----------|-----------------|
| تقديم موضوع أساسي (بدون مرفقات) | **لا جداول جديدة** | — |
| RLS: عضوياتي التاريخية + اجتماعات بفترة العضوية + منع viewer من INSERT | **نعم** (سياسات + helpers) | `COUNCILS-TOPIC-SUBMISSIONS-DB-01` أو `COUNCILS-FACULTY-HISTORY-RLS-01` |
| مرفقات الموضوعات | **نعم** (جدول metadata + Storage bucket) | `COUNCILS-TOPIC-ATTACHMENTS-DB-01` |
| إعادة تسمية enum `needs_completion` → `returned` | **اختياري** | غير موصى به — التعيين في UI كافٍ |

---

## 5. المراحل التنفيذية المقترحة التالية

| # | المرحلة | النطاق |
|---|---------|--------|
| 1 | `COUNCILS-FACULTY-HISTORY-RLS-01` | helpers + سياسات RLS للأرشيف وviewer |
| 2 | `COUNCILS-FACULTY-COUNCILS-FUNCTIONS-02` | دوال قراءة: عضويات (فعّالة+سابقة)، اجتماعات، مواضيعي |
| 3 | `COUNCILS-FACULTY-TOPIC-SUBMIT-FUNCTIONS-01` | `submitCouncilTopic`, `saveCouncilTopicDraft`, `updateReturnedTopic` |
| 4 | `COUNCILS-FACULTY-TOPICS-HISTORY-UI-01` | واجهة faculty: تبويبات، اجتماعات، مواضيعي، نموذج تقديم |
| 5 | `COUNCILS-ADMIN-TOPIC-REVIEW-FUNCTIONS-01` | قبول/رفض/إرجاع/ربط بأجندة |
| 6 | `COUNCILS-ADMIN-TOPICS-REVIEW-UI-01` | قسم «المواضيع المقدمة» في admin |
| 7 | `COUNCILS-TOPIC-ATTACHMENTS-DB-01` | اختياري — مرفقات |

---

## 6. الملفات والجداول التي تم فحصها

### ملفات تطبيق

| الملف | الغرض |
|-------|--------|
| `src/lib/faculty-councils.functions.ts` | `getMyAcademicCouncilMemberships` |
| `src/routes/faculty-portal.academic-councils.tsx` | واجهة faculty الحالية |
| `src/routes/faculty-portal.index.tsx` | بطاقة دخول المجالس |
| `src/lib/admin-councils.functions.ts` | ملخص admin، عضويات، KPIs موضوعات |
| `src/routes/admin/academic-councils.tsx` | واجهة admin — أقسام مقفلة |
| `src/integrations/supabase/types.ts` | أنواع الجداول والـ enums |

### migrations / schema

| الملف / الجدول | الغرض |
|----------------|--------|
| `supabase/migrations/20260703192337_...sql` | schema + RLS + helpers |
| `supabase/migrations/20260703194033_...sql` | GRANT hardening |
| `academic_councils` | تعريف المجالس |
| `academic_council_members` | العضويات (`active_from`/`active_to`) |
| `academic_council_meetings` | الاجتماعات |
| `academic_council_topics` | الموضوعات |
| `academic_council_agenda_items` | جدول الأعمال |
| `academic_council_minutes` | المحاضر |
| `academic_council_decisions` | القرارات |

---

## 7. تأكيدات الامتثال

| البند | الحالة |
|-------|--------|
| migrations | ❌ لم تُنفَّذ |
| DB changes | ❌ |
| RLS changes | ❌ |
| Storage | ❌ |
| service role في المتصفح | ❌ |
| كتابة بيانات | ❌ |
| تعديل UI | ❌ |
| تعديل server functions | ❌ |
| ربط أعضاء / إنشاء اجتماعات أو موضوعات | ❌ |

---

## 8. الخلاصة والتوصية

| البند | الحكم |
|-------|-------|
| العضويات السابقة | Schema ✅ — **التطبيق وRLS ❌** |
| الاجتماعات سابقة/قادمة | Schema ✅ — **التطبيق ❌** — RLS للأعضاء الفعّالين فقط |
| تقديم المواضيع | Schema ✅ — **التطبيق ❌** — RLS يحتاج منع viewer |
| قرار المرحلة | **PASS** |
| التوصية التالية | **READY_FOR_COUNCILS_FACULTY_TOPICS_HISTORY_UI** |

**ترتيب التنفيذ الموصى به:** ابدأ بـ `COUNCILS-FACULTY-HISTORY-RLS-01` (أو سياسات ضمن `COUNCILS-TOPIC-SUBMISSIONS-DB-01`) **قبل** نشر واجهة الأرشيف التاريخي في الإنتاج؛ واجهة تقديم الموضوع لعضو فعّال يمكن بناؤها بالتوازي لأن RLS الحالي يدعم INSERT لغير viewer مع ضبط طبقة التطبيق.
