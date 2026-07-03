# COUNCILS-MODULE-DESIGN-01 — تقرير التصميم المعماري لبوابة إدارة المجالس الأكاديمية

> **مرحلة تصميم فقط.** لم يُنفَّذ أي كود، ولا migration، ولا تعديل DB/RLS/Storage/Triggers، ولا نشر جديد، ولا إرسال إيميلات، ولا استخدام بيانات حقيقية، ولا توسيع Pilot، ولا فتح صلاحيات جديدة. المسار المبدئي `/admin/academic-councils` يبقى محصوراً كما هو على `system_admin/admin/dean`.

---

## 1. ملخص التصميم

تصميم بوابة مؤسسية لإدارة **مجلس الكلية** و**مجالس الأقسام** ضمن كلية تكنولوجيا المعلومات وعلوم الحاسوب، بمعمارية معزولة تعتمد على:

- **نموذج بيانات مركزي حول `academic_councils`** يفصل نوع المجلس (كلية / قسم) ويربطه بـ `departments.id` عند الحاجة.
- **RBAC ثنائي المستوى**: أدوار عامة عبر `user_roles` + عضويات مجلسية دقيقة عبر `academic_council_members`.
- **RLS صارم** لكل جدول مع عزل حسب `department_id` وعضوية المجلس، ومنع الحذف النهائي (soft archive فقط).
- **Storage خاص (private)** بـ signed URLs قصيرة العمر + audit لكل فتح/تحميل.
- **Workflows موسومة** للموضوع والاجتماع والقرار مع سجلات انتقال (event log).
- **جدولة وتنبيهات** داخل البوابة أولاً (in-app)، مع مسار مُخطط للبريد لاحقاً خلف feature flag.
- **تكامل ناعم** مع البنية القائمة (departments, faculty_profiles, user_roles, audit_logs, notifications, admin shell) دون تعديل أي منها.

**MVP آمن ممكن** بنطاق مقيّد: مجلس الكلية + مجلس قسم تجريبي واحد، بدون بريد وبدون تصويت، مع RLS + audit من اليوم الأول.

---

## 2. الهيكل العام للبوابة (Information Architecture)

```
/admin/academic-councils
├── /                                (Dashboard)
├── /college                         (مجلس الكلية)
│   ├── /meetings
│   ├── /meetings/$meetingId
│   ├── /topics
│   ├── /decisions
│   └── /archive
├── /departments                     (قائمة مجالس الأقسام المخوّل رؤيتها)
│   └── /$departmentId
│       ├── /meetings
│       ├── /meetings/$meetingId
│       ├── /topics
│       ├── /decisions
│       └── /archive
├── /meetings/$meetingId/agenda
├── /meetings/$meetingId/minutes
├── /topics/new
├── /topics/$topicId
├── /decisions/$decisionId
├── /follow-up                       (متابعة القرارات)
├── /archive                         (أرشيف موحد بحسب صلاحية المستخدم)
├── /reports
└── /settings                        (قواعد الجدولة والتنبيهات)
```

كل مسار محمي بـ `beforeLoad` يستدعي server function تتحقق من: (1) الدور العام، (2) عضوية المجلس، (3) `department_id` عند اللزوم.

---

## 3. نموذج البيانات المقترح (Proposed Schema)

> **لن يُنشأ أي جدول في هذه المرحلة.** ما يلي مقترح مرجعي للمرحلة `COUNCILS-DB-RLS-DESIGN-REVIEW-01`.

### 3.1 `academic_councils`

- **الهدف**: تعريف كل مجلس (كلية أو قسم) وضبط إعداداته.
- **الحقول الرئيسية**: `id`, `council_type ENUM('faculty','department')`, `department_id FK→departments.id NULL`, `name_ar`, `name_en`, `code`, `is_active`, `default_recurrence_rule JSONB`, `settings JSONB`, `created_by`, `updated_by`, `created_at`, `updated_at`.
- **قيد سلامة**: `council_type='department' ⇒ department_id NOT NULL`، `council_type='faculty' ⇒ department_id NULL` (Trigger لأن CHECK قد لا يكفي).
- **العلاقات**: `departments`, `profiles` (created_by/updated_by).
- **status/audit**: `is_active` + سجل audit عام.

### 3.2 `academic_council_members`

- **الهدف**: العضويات الفعّالة داخل كل مجلس وأدوار الأعضاء فيه.
- **الحقول**: `id`, `council_id FK`, `user_id FK→auth.users`, `member_role ENUM('chair','vice_chair','secretary','member','viewer')`, `active_from`, `active_to NULL`, `is_active`, `created_by`, `created_at`, `updated_at`.
- **يرتبط بـ**: `academic_councils`, `profiles`/`faculty_profiles` (عبر `user_id`).
- **قيود**: فريد على `(council_id, user_id, member_role, active_from)`؛ Trigger يمنع تداخل فترات نفس الدور.
- **audit**: نعم (تغيير عضوية = حدث مؤسسي).

### 3.3 `academic_council_meetings`

- **الهدف**: كل اجتماع (دوري أو استثنائي).
- **الحقول**: `id`, `council_id FK`, `meeting_number INT`, `academic_year_id FK→academic_years NULL`, `kind ENUM('regular','extraordinary')`, `scheduled_at TIMESTAMPTZ`, `location`, `status ENUM(...دورة الاجتماع)`, `topics_intake_opens_at`, `topics_intake_closes_at`, `notes`, `created_by`, `updated_by`, timestamps.
- **قيد**: فريد `(council_id, academic_year_id, meeting_number)`؛ الترقيم يُولَّد عبر Trigger.
- **audit**: نعم.

### 3.4 `academic_council_topics`

- **الهدف**: الموضوعات المرفوعة لأي مجلس.
- **الحقول**: `id`, `council_id FK`, `meeting_id FK NULL` (يُعيَّن عند القبول للأجندة), `submitted_by FK→auth.users`, `title`, `body`, `category`, `priority`, `status ENUM(...دورة الموضوع)`, `rejection_reason NULL`, `postponed_to_meeting_id NULL`, `created_at`, `updated_at`.
- **audit**: نعم عبر `academic_council_topic_events` (سجل انتقالات).

### 3.5 `academic_council_agenda_items`

- **الهدف**: ترتيب بنود جدول الأعمال لكل اجتماع.
- **الحقول**: `id`, `meeting_id FK`, `topic_id FK`, `order_no INT`, `is_approved`, `approved_at`, `approved_by`, timestamps.
- **قيد**: فريد `(meeting_id, order_no)` و `(meeting_id, topic_id)`.

### 3.6 `academic_council_minutes`

- **الهدف**: مسودة واعتماد محضر الاجتماع.
- **الحقول**: `id`, `meeting_id FK UNIQUE`, `body_richtext`, `attendees JSONB`, `drafted_by`, `drafted_at`, `approved_by`, `approved_at`, `is_locked BOOLEAN`, timestamps.
- **قاعدة**: بعد `is_locked=true` لا يُعدَّل الجسم إلا عبر revision موثّق (Trigger).
- **audit**: نعم.

### 3.7 `academic_council_decisions`

- **الهدف**: القرارات الرسمية المنبثقة من كل موضوع.
- **الحقول**: `id`, `meeting_id FK`, `topic_id FK`, `decision_number`, `text`, `responsible_type ENUM('user','department','entity')`, `responsible_user_id NULL`, `responsible_entity_label NULL`, `due_date DATE NULL`, `status ENUM(...دورة القرار)`, `created_by`, `created_at`, `updated_at`.
- **قيد**: فريد `(meeting_id, decision_number)`.
- **audit**: نعم عبر `academic_council_decision_history` (سجل تغييرات القرار).

### 3.8 `academic_council_decision_followups`

- **الهدف**: تحديثات التنفيذ من الجهة المسؤولة.
- **الحقول**: `id`, `decision_id FK`, `reported_by`, `progress_note`, `progress_status ENUM('in_progress','partially_completed','completed','blocked')`, `attachment_id NULL`, `reported_at`, timestamps.
- **audit**: نعم.

### 3.9 `academic_council_attachments`

- **الهدف**: ربط المرفقات بأي كيان (موضوع/محضر/قرار/تنفيذ).
- **الحقول**: `id`, `owner_type ENUM('topic','minutes','decision','followup')`, `owner_id UUID`, `storage_path TEXT UNIQUE`, `file_name`, `mime_type`, `size_bytes`, `uploaded_by`, `uploaded_at`.
- **قيد**: مسار التخزين ضمن bucket محدد فقط (يتحقق في server fn قبل الإدراج).

### 3.10 `academic_council_notifications`

- **الهدف**: تنبيهات داخل البوابة (in-app) لأعضاء المجالس.
- **الحقول**: `id`, `recipient_user_id FK`, `council_id FK`, `meeting_id NULL`, `topic_id NULL`, `decision_id NULL`, `kind ENUM('intake_open','intake_closing','agenda_ready','reminder_meeting','decision_due','decision_overdue','minutes_ready',...)`, `payload JSONB`, `sent_at`, `read_at NULL`, `delivery_channel ENUM('in_app','email')`, `delivery_status ENUM('queued','delivered','failed')`, `error_note NULL`.

### 3.11 `academic_council_schedule_rules`

- **الهدف**: قواعد الجدولة الدورية وإعدادات التنبيهات لكل مجلس.
- **الحقول**: `id`, `council_id FK UNIQUE`, `recurrence_rule JSONB` (مثل أول أحد شهرياً)، `intake_open_days_before INT`, `intake_close_days_before INT`, `first_reminder_days_before INT`, `pre_close_reminder_hours INT`, `agenda_dispatch_days_before INT`, `decision_reminder_days_before INT`, `enable_email BOOLEAN DEFAULT false`, `updated_by`, timestamps.

### 3.12 جداول مساعدة (تدقيق وانتقالات)

- `academic_council_topic_events` — سجل انتقال حالة الموضوع.
- `academic_council_decision_history` — سجل تغيير القرار.
- `academic_council_audit_log` — سجل عام لكل عملية كتابة/قراءة حساسة (يمكن دمجه مع `audit_logs` القائم عبر `entity_type` مخصص لتفادي تضخم الجداول).

### 3.13 خلاصة الحقول العرضية

- **`created_by`/`updated_by`**: نعم لكل الجداول القابلة للتعديل بشرياً.
- **`status`**: نعم للجداول ذات دورة حياة (councils/meetings/topics/decisions).
- **`audit`**: نعم لكل عمليات الكتابة الحساسة (عضويات، اعتماد أجندة/محضر/قرار، تعديل قرار مقفول).

---

## 4. الصلاحيات المقترحة

### 4.1 أدوار جديدة مقترحة (لن تُضاف الآن)

| الدور | الغرض | النطاق |
| --- | --- | --- |
| `council_admin` | إدارة كاملة للبوابة | كل المجالس |
| `college_council_chair` | رئاسة مجلس الكلية | مجلس الكلية |
| `college_council_secretary` | مقرر مجلس الكلية | مجلس الكلية |
| `college_council_member` | عضوية مجلس الكلية | مجلس الكلية |
| `department_council_chair` | رئاسة مجلس قسم | قسم واحد |
| `department_council_secretary` | مقرر مجلس قسم | قسم واحد |
| `department_council_member` | عضوية مجلس قسم | قسم واحد |
| `council_viewer` | عرض للاطلاع فقط | حسب التخصيص |

### 4.2 الخيار المفضّل معمارياً

استخدام **عضويات المجلس** (`academic_council_members.member_role`) بدلاً من ضخ 8 أدوار عامة، مع الاكتفاء بدور عام واحد `council_admin` لأغراض الإدارة الفنية. يقلل هذا من مخاطر تضخم الصلاحيات ويسهل الفصل حسب المجلس. أدوار `system_admin`/`admin`/`dean`/`department_head` القائمة تُعاد استخدامها كما هي.

---

## 5. قواعد الوصول

- **مجلس الكلية**: يظهر فقط لمن لديه عضوية نشطة في المجلس أو دور `system_admin`/`admin`/`council_admin`/`dean` (باعتبار العميد رئيساً افتراضياً).
- **مجلس قسم**: يظهر فقط لأعضاء المجلس النشطين في نفس `department_id` + `system_admin`/`admin`/`council_admin`.
- **عزل بين الأقسام**: عضو قسم A لا يستطيع مطلقاً استعلام سجلات قسم B — يُفرض RLS على `department_id` عبر join مع `academic_councils`.
- **الطلاب**: بلا وصول (لا يوجد أي مسار للطالب).
- **الموظف غير المخول**: بلا وصول.
- **admin/system_admin**: إدارة كاملة مع تسجيل كل فعل في `audit_log`.

---

## 6. RLS المقترح لاحقاً (Design Sketch)

> صياغة نهائية جاهزة للمراجعة تكون في `COUNCILS-DB-RLS-DESIGN-REVIEW-01`. المخطط العام:

- دالة أمنية `public.is_council_member(_user uuid, _council uuid) RETURNS boolean SECURITY DEFINER` تفحص `academic_council_members`.
- دالة `public.is_council_admin(_user uuid) RETURNS boolean` تفحص `has_role(_user,'admin'|'system_admin'|'council_admin')`.
- **SELECT** لكل جدول: `is_council_admin(auth.uid()) OR is_council_member(auth.uid(), council_id)`.
  - في الجداول الفرعية (topics/meetings/minutes/decisions) يُشتق `council_id` عبر join أو حقل مكرر.
- **INSERT/UPDATE**: مقيّد بالأدوار داخل المجلس (`member_role IN ('chair','secretary')`) حسب العملية.
- **DELETE**: **ممنوع تماماً** على مستوى RLS؛ يُستخدم `status='archived'` أو `is_deleted=false` (soft delete) مع audit.
- **Cross-department**: `USING` يفرض `department_id` مطابقاً لأقسام المستخدم.
- **Public/Anon**: لا `GRANT` مطلقاً لـ `anon`.
- **Storage RLS**: على bucket خاص، مع سياسات تتحقق من عضوية المجلس المرتبط بالمسار (مسار يتضمن `council_id/entity_type/entity_id/filename`).

### GRANT policy summary (للتنفيذ لاحقاً)

```sql
-- كل جدول من جداول المجالس:
GRANT SELECT, INSERT, UPDATE ON public.<t> TO authenticated;
GRANT ALL ON public.<t> TO service_role;
-- لا GRANT للـ anon على أي جدول من هذه الوحدة.
-- REVOKE DELETE ON public.<t> FROM authenticated;   -- تأكيد رفض الحذف
```

---

## 7. تصميم Storage

- **Bucket واحد خاص**: `academic-council-attachments` — **private**.
- **بنية المسار**: `councils/{council_id}/{owner_type}/{owner_id}/{uuid}-{filename}`.
- **الوصول**: فقط عبر server functions تُصدر **signed URLs بمدة قصيرة** (≤ 5 دقائق) بعد التحقق من عضوية المجلس.
- **قيود الرفع** (server-side): mime whitelist (`pdf`, `docx`, `xlsx`, `png`, `jpg`), max 20 MB (قابل للضبط), منع `exe/js/html`.
- **Audit**: كل فتح/تحميل يُقيَّد في `academic_council_audit_log` بحقول `actor`, `attachment_id`, `action`, `ip`, `ua`, `at`.
- **لا public URLs مطلقاً.**

---

## 8. Workflows

### 8.1 دورة الموضوع

```
draft → submitted → under_secretary_review
       ├─ needs_completion (returned to author) → submitted
       ├─ accepted_for_agenda → discussed → decision_issued → closed
       ├─ rejected(reason) → closed
       └─ postponed(next_meeting_id) → submitted (new meeting)
```

- كل انتقال يسجل في `academic_council_topic_events`.
- الانتقال محكوم بـ RLS + دور العضوية (secretary/chair فقط للانتقالات الحساسة).

### 8.2 دورة الاجتماع

```
scheduled → open_for_topics → topic_submission_closed
          → agenda_preparation → agenda_approved
          → held → minutes_drafting → minutes_approved
          → archived
```

- `open_for_topics` و`topic_submission_closed` قابلان للأتمتة بحسب `schedule_rules`.
- `agenda_approved` يقفل ترتيب البنود.
- `minutes_approved` يقفل جسم المحضر (Trigger على `is_locked`).

### 8.3 دورة القرار

```
issued → assigned → in_progress ─┬─ partially_completed → completed → archived
                                 ├─ delayed (auto إذا تجاوز due_date)
                                 └─ cancelled → archived
```

- كل تعديل نصي على القرار بعد `issued` = سطر في `decision_history`.
- `delayed` يُحدَّث بواسطة scheduled job يومي (لاحقاً).

---

## 9. الجدولة والتنبيهات

### 9.1 قواعد الجدولة

- تُخزَّن في `academic_council_schedule_rules.recurrence_rule` بصيغة JSONB مثل:
  ```json
  { "freq": "MONTHLY", "byday": "SU", "bysetpos": 1, "time": "10:00", "tz": "Asia/Aden" }
  ```
- **مجلس الكلية**: افتراضي "أول أحد من كل شهر" (قابل للتعديل عبر الإعدادات).
- **مجالس الأقسام**: يحدده رئيس القسم/المقرر (JSONB مماثل).

### 9.2 حزمة التنبيهات

| الحدث | القناة | المصدر |
| --- | --- | --- |
| فتح استقبال الموضوعات | in-app | Job (وقت `intake_opens_at`) |
| تذكير قبل إغلاق الاستقبال | in-app | Job (`pre_close_reminder_hours`) |
| اعتماد جدول الأعمال | in-app | Event عند `agenda_approved` |
| تذكير بموعد الاجتماع | in-app | Job (`first_reminder_days_before`) |
| اقتراب استحقاق القرار | in-app | Job (`decision_reminder_days_before`) |
| تجاوز استحقاق القرار | in-app | Job يومي |
| المحضر جاهز للاعتماد | in-app | Event عند `minutes_drafting→minutes_approved` |

- **البريد الإلكتروني**: خلف feature flag `enable_email=false` افتراضياً على مستوى كل `schedule_rules` — لا إرسال في MVP.
- **سجل التنبيهات**: `academic_council_notifications.delivery_status` يحفظ `queued/delivered/failed` + `error_note` (نجاح/فشل).

---

## 10. التقارير المقترحة

| التقرير | مصدر البيانات | الفلاتر |
| --- | --- | --- |
| اجتماعات مجلس الكلية | meetings (faculty) | سنة/فصل/حالة |
| اجتماعات كل قسم | meetings (department) | قسم/سنة/حالة |
| الموضوعات المرفوعة | topics | مجلس/سنة/حالة/مقدم |
| الموضوعات المؤجلة | topics(status=postponed) | مجلس/فترة |
| القرارات | decisions | مجلس/سنة/مسؤول/حالة |
| القرارات غير المنفذة | decisions(status IN issued/assigned/in_progress) | جهة مسؤولة |
| القرارات المتأخرة | decisions(due_date<now AND status≠completed) | مجلس/جهة |
| تنفيذ القرارات حسب المسؤول | decisions + followups | responsible_user_id |
| أرشيف المحاضر | minutes(is_locked=true) | مجلس/سنة |

- تصدير PDF/Excel عبر مسار موحد شبيه بـ `src/lib/reports/export.ts` القائم (بدون تعديله).

---

## 11. تصميم الشاشات

- **Dashboard**: بطاقات موجزة (اجتماعاتي القادمة، موضوعاتي، قراراتي المستحقة، تنبيهات).
- **صفحة مجلس (كلية/قسم)**: بيانات المجلس، الأعضاء، الاجتماعات القادمة/السابقة، إحصائيات.
- **صفحة اجتماع**: تفاصيل، حالة الدورة، أزرار انتقال محكومة بالدور، جدول الأعمال، المحضر، القرارات.
- **صفحة رفع موضوع**: نموذج (عنوان، نص، تصنيف، أولوية، مرفقات، مجلس/اجتماع مقترح).
- **صفحة جدول الأعمال**: ترتيب بنود (drag-drop) لصلاحية المقرر فقط، زر اعتماد لصلاحية الرئيس.
- **صفحة المحضر**: محرر نصي، الحاضرون، إرفاق PDF المحضر النهائي، اعتماد.
- **صفحة القرار والمتابعة**: بيانات القرار، سجل التنفيذ، رفع مستند تنفيذ، حالة، سجل التغييرات.
- **صفحة الأرشيف**: بحث موحد + فلاتر + تصدير.
- **صفحة الإعدادات**: قواعد الجدولة، فترات التنبيه، تفعيل البريد (لاحقاً)، إدارة العضويات.

جميع الشاشات: RTL، Cairo/Tajawal، تلتزم design tokens في `src/styles.css` الحالي.

---

## 12. التكامل مع النظام الحالي

| النظام الحالي | نقطة التكامل | التأثير |
| --- | --- | --- |
| `departments` | مصدر `department_id` لمجالس الأقسام | قراءة فقط، بلا تعديل |
| `profiles` / `faculty_profiles` | معرفات المستخدمين ومعلومات العرض | قراءة فقط |
| `user_roles` + `has_role` | RBAC العام | إضافة دور `council_admin` لاحقاً فقط |
| `audit_logs` | يمكن كتابة أحداث المجالس فيه عبر `entity_type='academic_council_*'` | ملاحق فقط، لا تعديل بنية |
| `notifications` | يمكن أن تكون وعاءً موحداً لو دُمج التصميم؛ الأفضل جدول مستقل `academic_council_notifications` لضبط RLS ضيقاً | لا تعديل على الجدول الحالي |
| Storage (buckets حالية) | لا تعديل؛ إنشاء bucket جديد مخصص لاحقاً | معزول |
| `AdminShell` + `admin-nav.ts` | إضافة مسارات فرعية تحت نفس المجموعة | لا تعديل على مسارات أخرى |
| Server functions + `requireSupabaseAuth` | استخدام نفس النمط | لا تعديل على البنية القائمة |

---

## 13. المخاطر

| # | المخاطرة | الأثر | التخفيف |
| --- | --- | --- | --- |
| R1 | خطأ في RLS يكشف بيانات مجلس آخر | تسريب بين الأقسام | دوال `SECURITY DEFINER` مركزية + اختبارات RLS مسبقة |
| R2 | تسريب مرفقات حساسة | تسرب محاضر/قرارات | private bucket + signed URLs قصيرة + audit |
| R3 | إرسال بريد بالخطأ | إزعاج/إفشاء | feature flag OFF افتراضياً + مسار قناة `in_app` أولاً |
| R4 | رؤية عضو قسم لمجلس قسم آخر | خرق عزل | فرض `department_id` في كل policy + اختبار cross-department |
| R5 | فقد الأرشيف بحذف نهائي | فقد ذاكرة مؤسسية | REVOKE DELETE + soft archive + backups |
| R6 | تضخم الصلاحيات (8 أدوار) | فوضى إدارية | استخدام `academic_council_members.member_role` بدل الأدوار العامة |
| R7 | تأثير على Pilot الحالي | إرباك تشغيلي | عزل تام: مسارات جديدة، جداول جديدة، bucket جديد، RLS خاصة |
| R8 | تعديل المحضر بعد الاعتماد | تلاعب موثق | `is_locked` + Trigger + `decision_history` |
| R9 | تعارض ترقيم الاجتماعات/القرارات | فوضى مرجعية | Trigger توليد + قيد فريد |
| R10 | حمل مهام مجدولة كبيرة | مشاكل أداء | jobs خفيفة + فهرسة `due_date`, `status`, `council_id` |

---

## 14. المتطلبات لاحقاً

| المتطلب | مطلوب؟ | السبب |
| --- | --- | --- |
| Migration | **نعم** | إنشاء ~12 جدولاً + دوال + قيود + Triggers. |
| DB | **نعم** | نموذج بيانات مؤسسي لا يمكن بدونه. |
| RLS | **نعم** | لعزل الأقسام، منع cross-access، حماية المرفقات، منع الحذف. |
| Storage | **نعم** | Bucket خاص للمرفقات مع signed URLs. |
| Triggers | **نعم** | `updated_at`، توليد ترقيم، decision_history، minutes lock، delayed decisions، audit. |
| MVP آمن؟ | **نعم** | ممكن بنطاق مقيّد (مجلس الكلية + قسم تجريبي)، بدون بريد، بدون تصويت، بـ RLS + audit من اليوم الأول. |
| تأثير على Pilot الحالي؟ | **لا** | معزول تماماً: مسارات/جداول/bucket جديدة، لا يمس مسارات الطالب أو الطلبات أو التقارير أو الخطط أو الجداول. |

---

## 15. خطة تنفيذ مقترحة على دفعات

| # | المرحلة | المخرج | تعتمد على |
| --- | --- | --- | --- |
| 1 | `COUNCILS-DB-RLS-DESIGN-REVIEW-01` | SQL نهائي مراجَع (بدون تنفيذ) لكل الجداول + RLS + Triggers + GRANTs | التصميم الحالي |
| 2 | `COUNCILS-MVP-SCAFFOLD-01` | migration الجداول الأساسية (councils, members, meetings, topics, agenda, minutes, decisions, followups, attachments, notifications, schedule_rules, audit) + GRANTs + RLS + Triggers | (1) |
| 3 | `COUNCILS-MEMBERSHIP-RBAC-01` | شاشات إدارة العضويات + دور `council_admin` + دوال أمنية | (2) |
| 4 | `COUNCILS-TOPICS-AGENDA-01` | رفع موضوعات + مراجعة + جدول أعمال + اعتماد | (2)(3) |
| 5 | `COUNCILS-MEETINGS-MINUTES-01` | إدارة الاجتماعات + المحاضر + قفل المحضر | (4) |
| 6 | `COUNCILS-DECISIONS-FOLLOWUP-01` | القرارات + المتابعة + سجل التغييرات | (5) |
| 7 | `COUNCILS-ATTACHMENTS-01` | Bucket + upload + signed URLs + audit | (2) |
| 8 | `COUNCILS-SCHEDULING-NOTIFICATIONS-01` | schedule_rules + scheduled jobs + in-app notifications (بلا بريد) | (5)(6) |
| 9 | `COUNCILS-REPORTS-ARCHIVE-01` | التقارير + التصدير + أرشيف موحد | (5)(6) |

كل مرحلة تنتهي بـ typecheck + build + مراجعة أمنية + تقرير مستقل.

---

## 16. القرار النهائي

**PASS**

- التصميم مكتمل ومغطٍ لكل المتطلبات المطلوبة.
- MVP آمن ممكن التنفيذ لاحقاً بنطاق مقيّد.
- لا تأثير على Pilot الحالي.
- التزام كامل بقواعد المرحلة: لا كود، لا نشر، لا migration، لا DB/RLS/Storage/Trigger، لا إيميلات، لا بيانات حقيقية، لا توسيع Pilot، لا فتح صلاحيات جديدة.

**التوصية للمرحلة التالية**: `COUNCILS-DB-RLS-DESIGN-REVIEW-01` — مراجعة SQL نهائي (بدون تنفيذ) لكل الجداول والسياسات والدوال قبل الانتقال إلى `COUNCILS-MVP-SCAFFOLD-01`.
