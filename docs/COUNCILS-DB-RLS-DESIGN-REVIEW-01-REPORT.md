# COUNCILS-DB-RLS-DESIGN-REVIEW-01 — مراجعة تصميم قاعدة البيانات وRLS

> **مرحلة مراجعة وتصميم فقط.** لم يُنفَّذ أي migration أو تعديل DB/RLS/Storage/Trigger، ولم يُشغَّل أي نشر، ولم تُدخل بيانات، ولم تُرسل إيميلات، ولم يُوسَّع Pilot، ولم تُفتَح صلاحيات جديدة. `/admin/academic-councils` يبقى محصوراً على `system_admin/admin/dean`.

---

## 1. ملخص المراجعة

تم فحص الجداول الأحد عشر المقترحة في `COUNCILS-MODULE-DESIGN-01`، واختصارها إلى **7 جداول MVP** + **5 جداول مؤجلة** لتقليل السطح الأمني والتشغيلي. جميع الجداول جديدة تماماً ولا تعدّل بنية أي جدول قائم؛ التكامل مع البنية الحالية قراءة فقط (`departments`, `faculty_profiles`, `user_roles`, `audit_logs`). الحذف النهائي ممنوع على مستوى GRANT/RLS، والبديل soft archive عبر `status`. Storage مؤجَّل عن MVP الأول لتقليل السطح.

**MVP آمن ممكن.** **لا تأثير على Pilot الحالي.** يتطلب لاحقاً migration + RLS + Triggers، ولا يتطلب Storage في MVP الأول (يؤجَّل إلى `COUNCILS-ATTACHMENTS-01`).

---

## 2. الجداول المعتمدة للـ MVP (7)

| # | الجدول | السبب |
| --- | --- | --- |
| 1 | `academic_councils` | تعريف المجلس (كلية/قسم) — أساس كل شيء |
| 2 | `academic_council_members` | العضويات وأدوار الأعضاء — أساس RLS |
| 3 | `academic_council_meetings` | الاجتماع نفسه ودورته |
| 4 | `academic_council_topics` | الموضوعات المرفوعة |
| 5 | `academic_council_agenda_items` | ترتيب بنود الجلسة |
| 6 | `academic_council_minutes` | المحضر ومصادقته |
| 7 | `academic_council_decisions` | القرارات المنبثقة |

هذه السبعة تكفي لإدارة دورة كاملة من الجدولة إلى القرار.

## 3. الجداول المؤجَّلة إلى ما بعد MVP (5)

| # | الجدول | مبرر التأجيل | المرحلة اللاحقة |
| --- | --- | --- | --- |
| 1 | `academic_council_decision_followups` | يمكن الاكتفاء بحقول `status/execution_note` داخل `decisions` في MVP | `COUNCILS-DECISIONS-FOLLOWUP-01` |
| 2 | `academic_council_attachments` | Storage bucket + signed URLs + audit — سطح أمني كبير | `COUNCILS-ATTACHMENTS-01` |
| 3 | `academic_council_notifications` | يكفي مؤقتاً استخدام جدول `notifications` القائم بـ `entity_type='academic_council'` | `COUNCILS-SCHEDULING-NOTIFICATIONS-01` |
| 4 | `academic_council_schedule_rules` | لا حاجة لأتمتة قبل ثبات الدورة يدوياً | `COUNCILS-SCHEDULING-NOTIFICATIONS-01` |
| 5 | جداول التدقيق المستقلة (`topic_events`, `decision_history`, `council_audit_log`) | يُعاد استخدام `audit_logs` القائم عبر `entity_type` مخصص لتفادي تضخم الجداول | `COUNCILS-MEETINGS-MINUTES-01` |

---

## 4. العلاقات المقترحة

```
departments ──────────────────► academic_councils (department_id, NULLABLE)
auth.users ──────────────────► academic_council_members (user_id)
                              └► academic_councils (created_by/updated_by)
                              └► academic_council_meetings (created_by/updated_by)
                              └► academic_council_topics (submitted_by)
                              └► academic_council_minutes (drafted_by/approved_by)
                              └► academic_council_decisions (created_by/responsible_user_id NULLABLE)

academic_councils ──1..N──► academic_council_members
                    ──1..N──► academic_council_meetings

academic_council_meetings ──1..N──► academic_council_topics (meeting_id NULLABLE — يُعيَّن عند القبول)
                          ──1..N──► academic_council_agenda_items
                          ──1..1──► academic_council_minutes
                          ──1..N──► academic_council_decisions

academic_council_topics ──1..N──► academic_council_agenda_items
                        ──1..N──► academic_council_decisions

faculty_profiles: قراءة فقط عبر user_id للاستخدام في العرض والتحقق من عضوية القسم.
user_roles: قراءة فقط عبر has_role للتحقق من admin/system_admin/council_admin.
audit_logs: كتابة فقط عبر Trigger أو server fn (entity_type مخصص).
```

**قواعد سلامة إضافية:**
- `academic_councils`: Trigger يمنع `council_type='department' AND department_id IS NULL` والعكس.
- `academic_council_members`: فريد على `(council_id, user_id, member_role, active_from)`.
- `academic_council_meetings`: فريد على `(council_id, academic_year_id, meeting_number)`؛ الترقيم مسلسل عبر Trigger.
- `academic_council_decisions`: فريد على `(meeting_id, decision_number)`.
- **REVOKE DELETE** لكل الجداول من `authenticated`.

---

## 5. RLS Matrix مفصلة

**تسميات مختصرة:**
- `SA` = `system_admin`/`admin`/`council_admin` (عبر `has_role`)
- `M(c)` = عضو مجلس `c` نشط (`academic_council_members.is_active=true`)
- `M_role(c, r)` = عضو المجلس `c` بدور `r` (chair/secretary/member)
- `DEPT(c)` = المستخدم من نفس `department_id` للمجلس (لمجالس الأقسام)
- `TOPIC_OWNER(t)` = `topics.submitted_by = auth.uid()`
- `RESP(d)` = `decisions.responsible_user_id = auth.uid()`

| الجدول | العملية | الشرط المسموح | ملاحظة |
| --- | --- | --- | --- |
| `academic_councils` | SELECT | `SA OR M(id)` | `dean` يُمنح عضوية chair تلقائياً في مجلس الكلية عبر seed منفصل — لا يُشفَّر داخل RLS |
| `academic_councils` | INSERT | `SA` | إنشاء المجلس إداري بحت |
| `academic_councils` | UPDATE | `SA OR M_role(id,'chair')` | تغيير اسم/إعدادات |
| `academic_councils` | DELETE | **مرفوض** (REVOKE) | soft archive عبر `is_active=false` |
| `academic_council_members` | SELECT | `SA OR M(council_id)` | كل عضو يرى قائمة زملائه |
| `academic_council_members` | INSERT | `SA OR M_role(council_id,'chair')` | إضافة عضوية |
| `academic_council_members` | UPDATE | `SA OR M_role(council_id,'chair')` | تعطيل/تفعيل |
| `academic_council_members` | DELETE | **مرفوض** | تعطيل عبر `is_active=false` |
| `academic_council_meetings` | SELECT | `SA OR M(council_id)` | |
| `academic_council_meetings` | INSERT | `SA OR M_role(council_id,'chair') OR M_role(council_id,'secretary')` | |
| `academic_council_meetings` | UPDATE | `SA OR M_role(council_id,'chair') OR M_role(council_id,'secretary')` | مع منع تعديل بعد `status='archived'` (Trigger) |
| `academic_council_meetings` | DELETE | **مرفوض** | |
| `academic_council_topics` | SELECT | `SA OR M(council_id) OR TOPIC_OWNER` | العضو يرى موضوعات مجلسه؛ المقدم يرى موضوعه دائماً |
| `academic_council_topics` | INSERT | `SA OR M(council_id)` مع `submitted_by=auth.uid()` | مع WITH CHECK صارم |
| `academic_council_topics` | UPDATE | `TOPIC_OWNER AND status IN ('draft','needs_completion')` — أو — `SA OR M_role(council_id,'secretary'|'chair')` للانتقالات الرسمية | |
| `academic_council_topics` | DELETE | **مرفوض** | `status='rejected'`/`closed` بديلاً |
| `academic_council_agenda_items` | SELECT | `SA OR M(council_id_of_meeting)` | |
| `academic_council_agenda_items` | INSERT | `SA OR M_role(council_id,'secretary'|'chair')` | |
| `academic_council_agenda_items` | UPDATE | `SA OR M_role(council_id,'secretary'|'chair')` قبل `is_approved=true` | |
| `academic_council_agenda_items` | DELETE | **مرفوض** | |
| `academic_council_minutes` | SELECT | `SA OR M(council_id_of_meeting)` | |
| `academic_council_minutes` | INSERT | `SA OR M_role(council_id,'secretary')` | |
| `academic_council_minutes` | UPDATE | `SA OR M_role(council_id,'secretary')` قبل `is_locked=true`؛ **مرفوض بعد القفل** (Trigger) | |
| `academic_council_minutes` | DELETE | **مرفوض** | |
| `academic_council_decisions` | SELECT | `SA OR M(council_id_of_meeting) OR RESP` | المسؤول يرى قراره دائماً حتى بعد أرشفة المجلس |
| `academic_council_decisions` | INSERT | `SA OR M_role(council_id,'secretary'|'chair')` | |
| `academic_council_decisions` | UPDATE | `SA OR M_role(council_id,'chair')` لتعديل النص/المسؤول؛ `RESP` لتحديث `execution_note/status→in_progress/partially/completed` فقط (Trigger يقيّد الحقول) | |
| `academic_council_decisions` | DELETE | **مرفوض** | `status='cancelled'` بديلاً |

**قواعد عامة لكل الجداول:**
- **لا GRANT لـ `anon`** على أي جدول من هذه الوحدة.
- `service_role` كامل الصلاحية للاستخدام الإداري.
- كل السياسات تستخدم `SECURITY DEFINER` helper functions لتجنب recursion وتوحيد المنطق.

---

## 6. Helper Functions المقترحة (تصميم، بلا تنفيذ)

```sql
-- كلها SECURITY DEFINER + SET search_path = public + STABLE

public.is_council_admin(_user uuid) RETURNS boolean
  -- true إذا كان للمستخدم أي دور من: system_admin, admin, council_admin

public.is_council_member(_user uuid, _council uuid) RETURNS boolean
  -- true إذا وُجدت صف نشط في academic_council_members
  -- (council_id=_council, user_id=_user, is_active=true, active_to IS NULL OR active_to > now())

public.has_council_role(_user uuid, _council uuid, _role text) RETURNS boolean
  -- true إذا كان عضواً بالدور المعطى (chair/secretary/member/viewer)

public.can_manage_council(_user uuid, _council uuid) RETURNS boolean
  -- is_council_admin(_user) OR has_council_role(_user,_council,'chair')

public.can_view_council_topic(_user uuid, _topic uuid) RETURNS boolean
  -- is_council_admin OR is_council_member(_user, topics.council_id) OR topics.submitted_by = _user

public.can_view_council_meeting(_user uuid, _meeting uuid) RETURNS boolean
  -- is_council_admin OR is_council_member(_user, meetings.council_id)

public.can_write_minutes(_user uuid, _meeting uuid) RETURNS boolean
  -- is_council_admin OR has_council_role(_user, meetings.council_id, 'secretary')

public.can_approve_agenda(_user uuid, _meeting uuid) RETURNS boolean
  -- is_council_admin OR has_council_role(_user, meetings.council_id, 'chair')

public.can_edit_decision(_user uuid, _decision uuid) RETURNS boolean
  -- is_council_admin OR has_council_role(_user, decisions.council_id, 'chair')

-- (لاحقاً، مع المرفقات)
public.can_view_council_attachment(_user uuid, _attachment uuid) RETURNS boolean
```

**مبررات:**
- تجنّب recursion (لا استعلامات على نفس الجدول داخل سياسته).
- تجميع منطق الأذونات في مكان واحد يسهل تدقيقه.
- استخدامها في server functions قبل استدعاء Data API لتحسين الرسائل والأداء.

---

## 7. تصميم Storage (مؤجَّل عن MVP الأول)

**قرار المرحلة**: **تأجيل المرفقات كلياً عن MVP الأول** لتقليل السطح الأمني.

عند تفعيلها في `COUNCILS-ATTACHMENTS-01`:

| البند | التصميم |
| --- | --- |
| Bucket | `academic-council-attachments` — **private** |
| Naming | `councils/{council_id}/{owner_type}/{owner_id}/{uuid}-{filename}` |
| Access | فقط عبر server functions تُصدر signed URLs (≤ 5 دقائق) |
| Validate | mime whitelist (pdf/docx/xlsx/png/jpg), max 20MB، منع exe/js/html، فحص magic bytes |
| RLS | سياسات على `storage.objects` تفرض `can_view_council_attachment` |
| Audit | كل فتح/تحميل يُقيَّد في `audit_logs` بـ `entity_type='academic_council_attachment'` |
| لا public URL | مطلقاً — لا `getPublicUrl` |
| هل يمكن تأجيلها؟ | **نعم** — MVP يعمل بنص فقط للموضوع والمحضر والقرار |

---

## 8. Audit Requirements

**لا جدول تدقيق جديد في MVP.** يُعاد استخدام `audit_logs` القائم عبر:

| الحدث | entity_type | ما يُسجَّل |
| --- | --- | --- |
| إنشاء/تعديل مجلس | `academic_council` | actor, action, before/after |
| إضافة/تعطيل عضوية | `academic_council_member` | actor, action, target_user |
| انتقال حالة موضوع | `academic_council_topic` | from_status, to_status, reason |
| اعتماد جدول أعمال | `academic_council_agenda` | actor, meeting_id |
| قفل محضر | `academic_council_minutes` | actor, meeting_id |
| إصدار/تعديل قرار | `academic_council_decision` | actor, decision_id, diff |
| تحديث تنفيذ قرار | `academic_council_decision` | actor, from_status, to_status |

يتم عبر **Triggers** على الجداول (AFTER INSERT/UPDATE) تكتب إلى `audit_logs` بصمت. لا تعديل على بنية `audit_logs`.

---

## 9. Migration Plan المستقبلي

| # | migration | يحوي | يعتمد على | seed/backfill | آمن في Lovable؟ |
| --- | --- | --- | --- | --- | --- |
| M1 | `create_academic_councils_core` | جداول MVP الـ 7 + ENUMs + GRANTs + RLS enable | لا شيء | لا | نعم — جداول جديدة فقط |
| M2 | `create_academic_councils_helpers` | Helper functions (SECURITY DEFINER) | M1 | لا | نعم |
| M3 | `create_academic_councils_policies` | كل CREATE POLICY حسب المصفوفة | M2 | لا | نعم |
| M4 | `create_academic_councils_triggers` | updated_at، ترقيم مسلسل، قفل المحضر، audit hooks، منع تعديل بعد archive | M1 | لا | نعم |
| M5 | `seed_college_council_only` | إنشاء **مجلس الكلية فقط** (INSERT سطر واحد) — عبر **insert tool** لاحقاً وليس migration | M1..M4 | نعم (سطر واحد) | نعم |
| M6 (لاحق) | `create_academic_council_notifications` | جدول التنبيهات + RLS | M3 | لا | نعم |
| M7 (لاحق) | `create_academic_council_schedule_rules` | جدول قواعد الجدولة + RLS | M6 | لا | نعم |
| M8 (لاحق) | `create_academic_council_attachments` | جدول المرفقات + bucket + policies | M3 | لا | نعم |
| M9 (لاحق) | `create_academic_council_followups` | جدول متابعة القرارات | M3 | لا | نعم |

**خصائص الخطة:**
- كل migration جديدة تماماً، لا `ALTER` لأي جدول قائم، لا `DROP`، لا `TRUNCATE`.
- لا `backfill` لبيانات إنتاج.
- لا `production data changes` (باستثناء seed سطر واحد لمجلس الكلية عبر insert tool).
- كل جدول جديد يتبع النمط الرباعي: CREATE TABLE → GRANT → ENABLE RLS → CREATE POLICY.
- كل التبعيات صريحة؛ يمكن التراجع بحذف الجداول الجديدة فقط دون أثر على أي جدول قائم.

---

## 10. المخاطر والضوابط

| # | المخاطرة | الضابط |
| --- | --- | --- |
| R1 | Cross-department access | كل جداول الأقسام تربط بـ `council_id` الذي يربط بـ `department_id`؛ helper functions تفرض العزل، ولا سياسة تسمح بـ SELECT بلا `is_council_member` |
| R2 | Dean/admin overexposure | `dean` **ليس** له صلاحية عامة على مجالس الأقسام؛ يُمنح عضوية chair لمجلس الكلية فقط عبر seed. `admin`/`system_admin` يبقيان بصلاحية كاملة مع audit كامل |
| R3 | Public leakage | لا `GRANT` لـ `anon` مطلقاً؛ لا مسارات عامة؛ `noindex` |
| R4 | Service role misuse | استخدام `service_role` محصور في server functions موثقة، لا في المتصفح، لا في `client.ts` |
| R5 | Attachment leakage | تأجيل المرفقات إلى مرحلة مستقلة + private bucket + signed URLs + audit |
| R6 | Soft vs hard delete | REVOKE DELETE على مستوى GRANT لكل الجداول؛ soft archive عبر `status`/`is_active` |
| R7 | صلاحيات المقرر ورئيس المجلس | فصل واضح: secretary يعد ويوثق؛ chair يعتمد. لا يمكن أن يعتمد نفسه (Trigger يمنع `approved_by=drafted_by` للمحضر). ملاحظة: قد يُخفَّف الشرط لمجالس صغيرة عبر إعداد `settings.allow_secretary_approval=false` افتراضياً |
| R8 | بيانات حساسة في المواضيع | حقول نصية فقط في MVP؛ لا PII للطلاب؛ RLS صارم |
| R9 | تعارض مع Pilot الحالي | لا يوجد — الجداول جديدة، RLS مستقل، مسارات معزولة، لا تعديل على `student_*` أو `student_requests` أو `reports` |
| R10 | تسمم seed | seed محصور بمجلس الكلية فقط عبر insert tool مع مراجعة يدوية |
| R11 | Infinite recursion في RLS | كل السياسات تعتمد helper `SECURITY DEFINER` — لا استعلام مباشر على نفس الجدول داخل سياسته |
| R12 | تحايل عبر nullable user_id | كل `user_id`/`created_by`/`submitted_by` في MVP `NOT NULL` مع FK إلى `auth.users` |

---

## 11. أسئلة القرار

| السؤال | الإجابة | السبب |
| --- | --- | --- |
| هل التنفيذ آمن كمرحلة MVP؟ | **نعم** | 7 جداول جديدة معزولة، RLS كامل، helper functions، منع DELETE، لا Storage في MVP، seed مقيّد بسطر واحد |
| هل يؤثر على Pilot الحالي؟ | **لا** | جداول جديدة، RLS مستقل، مسارات جديدة، لا `ALTER` لأي جدول قائم، لا تعديل على مسارات الطالب/الطلبات/التقارير |
| هل يتطلب migration لاحقاً؟ | **نعم** | إنشاء 7 جداول + ENUMs + helpers + policies + triggers |
| هل يتطلب DB؟ | **نعم** | لا يمكن العمل بلا نموذج بيانات |
| هل يتطلب RLS؟ | **نعم** | لعزل الأقسام + عضوية المجلس + منع cross-access |
| هل يتطلب Storage؟ | **لا في MVP** — نعم في مرحلة `COUNCILS-ATTACHMENTS-01` | تأجيل لتقليل السطح |
| هل يتطلب Triggers؟ | **نعم** | updated_at، ترقيم مسلسل، قفل المحضر، audit، منع تعديل بعد archive |

---

## 12. أول MVP آمن — النطاق الحاسم

**الجداول المطلوبة (7 فقط):**
`academic_councils`, `academic_council_members`, `academic_council_meetings`, `academic_council_topics`, `academic_council_agenda_items`, `academic_council_minutes`, `academic_council_decisions`.

**الشاشات المطلوبة (لا أكثر):**
1. Dashboard مبسط (مجالسي / اجتماعاتي القادمة / قراراتي).
2. صفحة مجلس (عرض + قائمة الاجتماعات + قائمة الأعضاء للـ chair).
3. صفحة اجتماع (تفاصيل + بنود + محضر + قرارات).
4. رفع موضوع + تحرير مسودة.
5. جدول أعمال (ترتيب + اعتماد).
6. محضر (تحرير + قفل).
7. قرار (إنشاء + تحديث تنفيذ نصياً فقط).

**الصلاحيات المطلوبة (الحد الأدنى):**
- إعادة استخدام `system_admin`, `admin`.
- إضافة دور واحد جديد فقط: `council_admin` (اختياري في MVP — يمكن الاكتفاء بـ admin).
- **بدون** أدوار عامة للعضوية؛ العضويات تُدار عبر `academic_council_members.member_role`.

**ما يُؤجَّل صراحة:**
- المرفقات (Storage bucket + سياسات).
- التنبيهات المخصصة (استخدام جدول notifications الحالي بلا تعديل).
- قواعد الجدولة الآلية (تحديد الاجتماعات يدوياً).
- متابعة القرارات كجدول منفصل (يبقى داخل `decisions`).
- البريد الإلكتروني.
- التصويت الإلكتروني.
- التوقيع الرقمي المعتمد.
- التقارير المتقدمة (تكتفي بشاشات بحث بسيطة).

---

## 13. التوصية للمرحلة التالية

**`COUNCILS-MIGRATION-PREP-01`** — إعداد ملفات SQL كاملة (CREATE TABLE + GRANT + RLS + Triggers + Helpers) في **صيغة نصية للمراجعة النهائية داخل المستودع فقط**، بدون تنفيذ. بعد الموافقة النهائية على النص، تنتقل الوحدة إلى `COUNCILS-MVP-SCAFFOLD-01` للتنفيذ الفعلي عبر migration tool.

## 14. القرار النهائي

**PASS**

- المراجعة مكتملة؛ النموذج المختصر (7 جداول MVP) آمن ومعزول.
- كل قواعد المرحلة تم الالتزام بها: لا كود، لا نشر، لا migration، لا DB/RLS/Storage/Trigger، لا إيميلات، لا بيانات حقيقية، لا توسيع Pilot، لا فتح صلاحيات جديدة.
- لا تأثير على Pilot الحالي.
- جاهز للانتقال إلى `COUNCILS-MIGRATION-PREP-01`.
