# COUNCILS-MIGRATION-PREP-01 — إعداد مسودة migration للمراجعة فقط

> **مرحلة إعداد نص SQL فقط.** لم يُنفَّذ أي migration ولم تُعدَّل قاعدة البيانات أو RLS أو Storage أو Triggers، ولم تُضف بيانات seed، ولم يُنشأ bucket، ولم يُغيَّر أي كود واجهة. لم يُوسَّع Pilot ولم تُفتَح صلاحيات جديدة. `/admin/academic-councils` يبقى محصوراً على `system_admin/admin/dean`.

---

## 1. ملف Migration المقترح

- **المسار**: `docs/drafts/20260703000000_councils_mvp_schema_rls.draft.sql`
- **الاسم المنطقي**: `20260703000000_councils_mvp_schema_rls`
- **الحالة**: مسودة نصية للمراجعة البشرية فقط.
- **سبب وضعه في `docs/drafts/`**: منع أي تشغيل تلقائي عبر أدوات Supabase. عند اعتماد المراجعة، يُقدَّم نفس النص عبر أداة migration في مرحلة `COUNCILS-MVP-SCAFFOLD-01`.

---

## 2. الجداول التي سيُنشئها (MVP — 7)

1. `public.academic_councils`
2. `public.academic_council_members`
3. `public.academic_council_meetings`
4. `public.academic_council_topics`
5. `public.academic_council_agenda_items`
6. `public.academic_council_minutes`
7. `public.academic_council_decisions`

**ENUMs جديدة**:
- `academic_council_type` (`college`, `department`)
- `academic_council_member_role` (`chair`, `vice_chair`, `secretary`, `member`, `viewer`)
- `academic_council_meeting_status` (9 قيم)
- `academic_council_topic_status` (9 قيم)
- `academic_council_decision_status` (7 قيم)

**كل الجداول تحتوي**:
- `id uuid PK DEFAULT gen_random_uuid()`
- `created_at`, `updated_at` (timestamptz + Trigger)
- `created_by` (NOT NULL) و `updated_by` (nullable) حيث يلزم
- FKs إلى `auth.users(id)` مع `ON DELETE RESTRICT` أو `SET NULL`
- FKs بين جداول المجالس مع `ON DELETE RESTRICT` (منع الحذف الشلالي)
- حقل `status` بديل صريح عن الحذف (soft archive)
- **REVOKE DELETE من `authenticated`** — لا حذف فعلي، فقط أرشفة
- **GRANT SELECT/INSERT/UPDATE إلى `authenticated`** و **GRANT ALL إلى `service_role`**
- **لا GRANT إلى `anon` مطلقاً**
- `ENABLE ROW LEVEL SECURITY` على كل جدول

---

## 3. الجداول المؤجَّلة (لن تُنشأ الآن)

| الجدول | مرحلة التنفيذ اللاحقة |
| --- | --- |
| `academic_council_decision_followups` | `COUNCILS-DECISIONS-FOLLOWUP-01` |
| `academic_council_attachments` + bucket | `COUNCILS-ATTACHMENTS-01` |
| `academic_council_notifications` | `COUNCILS-SCHEDULING-NOTIFICATIONS-01` |
| `academic_council_schedule_rules` | `COUNCILS-SCHEDULING-NOTIFICATIONS-01` |
| جداول تدقيق مستقلة | يُعاد استخدام `audit_logs` القائم لاحقاً |

---

## 4. RLS Policies المقترحة (ملخص)

| الجدول | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `academic_councils` | admin أو عضو | admin فقط | admin/chair | REVOKED |
| `academic_council_members` | admin أو عضو | admin/chair | admin/chair | REVOKED |
| `academic_council_meetings` | admin أو عضو | admin/chair/secretary | admin/chair/secretary | REVOKED |
| `academic_council_topics` | admin/عضو/صاحب الموضوع | عضو المجلس نفسه (submitted_by=auth.uid) | صاحب الموضوع (draft/needs_completion) أو chair/secretary | REVOKED |
| `academic_council_agenda_items` | admin أو عضو المجلس | chair/secretary | chair/secretary | REVOKED |
| `academic_council_minutes` | admin أو عضو المجلس | secretary فقط | secretary قبل القفل فقط | REVOKED |
| `academic_council_decisions` | admin/عضو/المسؤول | chair/secretary | chair لكل الحقول، والمسؤول لحقول التنفيذ فقط (يُقيَّد بطبقة التطبيق) | REVOKED |

كل السياسات:
- `TO authenticated` فقط.
- تعتمد helper functions `SECURITY DEFINER` لتجنّب recursion.
- تفرض `created_by = auth.uid()` أو `submitted_by = auth.uid()` في `WITH CHECK` عند الإنشاء.
- لا سياسة تسمح لـ `anon`.

---

## 5. Helper Functions المقترحة (5)

كلها `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public`:

1. `public.is_council_admin(_user uuid)` — يعتمد على `has_role` القائم (`system_admin`, `admin`).
2. `public.is_council_member(_user uuid, _council uuid)` — يتحقق من عضوية نشطة.
3. `public.has_council_role(_user uuid, _council uuid, _role academic_council_member_role)`.
4. `public.can_manage_council(_user uuid, _council uuid)` — admin أو chair.
5. `public.can_write_council_agenda(_user uuid, _council uuid)` — admin أو chair أو secretary.

جميعها معزولة عن جداول أخرى قائمة (فقط `academic_council_members` + `has_role` الحالي).

---

## 6. Triggers المقترحة (ضمن نفس الملف)

1. `tg_academic_councils_touch_updated_at` — لتحديث `updated_at` تلقائياً على 7 جداول.
2. `tg_minutes_block_locked_edits` — منع أي تعديل بعد قفل المحضر + ضبط `locked_at` عند القفل.
3. `tg_councils_validate_department_binding` — تفعيل قاعدة `council_type ↔ department_id`.

Triggers الترقيم المتسلسل والتدقيق (`audit_logs`) وأرشفة الاجتماع مؤجَّلة إلى migration منفصل (M4 في الخطة) لتبسيط المراجعة الأولى.

---

## 7. القيود والعلاقات مع النظام القائم

| العلاقة | النوع | التأثير |
| --- | --- | --- |
| `academic_councils.department_id → departments.id` | FK RESTRICT | قراءة فقط، لا تعديل على `departments` |
| `academic_council_meetings.academic_year_id → academic_years.id` | FK RESTRICT | قراءة فقط، لا تعديل على `academic_years` |
| كل `*_by → auth.users.id` | FK RESTRICT/SET NULL | لا تعديل على `auth` |
| `is_council_admin` يعتمد `public.has_role` | استدعاء دالة قائمة | لا تعديل على `user_roles` |
| `audit_logs` | لا يُلمس في هذه الـ migration | استخدامه مؤجَّل إلى M4 اللاحقة |

**لا يُلمس أي جدول موجود ببنية `ALTER`/`DROP`/`TRUNCATE`.**

---

## 8. Audit Requirements

- في مسودة migration الحالية لا Triggers للتدقيق (مؤجَّلة عن M1 لتخفيف المراجعة).
- عند تفعيلها لاحقاً: كتابة إلى `audit_logs` عبر `entity_type` مخصص لكل جدول (`academic_council`, `academic_council_topic`, ...)، بلا تعديل على بنية `audit_logs`.
- الحذف ممنوع أصلاً (REVOKE)، فلا حاجة لتدقيقه.
- كل تعديل مصحوب بـ `updated_by` (سيُملأ عبر server functions لاحقاً).

---

## 9. أسئلة الحوكمة

| السؤال | الإجابة |
| --- | --- |
| هل تم تطبيق migration؟ | **لا** |
| هل تم تعديل DB؟ | **لا** |
| هل تم تعديل RLS فعلياً؟ | **لا** |
| هل تم تعديل Storage؟ | **لا** — Storage مؤجَّل كلياً |
| هل تم إنشاء bucket؟ | **لا** |
| هل تم تعديل Trigger على قاعدة البيانات؟ | **لا** — Triggers موصوفة نصياً فقط |
| هل توجد seed data؟ | **لا** |
| هل تم تعديل كود واجهة؟ | **لا** |
| هل تم توسيع Pilot؟ | **لا** |
| هل تم فتح صلاحيات جديدة؟ | **لا** |
| هل تم إرسال إيميلات؟ | **لا** |
| هل استُخدمت بيانات حقيقية؟ | **لا** |
| هل هناك تغيير قابل للنشر؟ | **لا** — فقط ملفان توثيقيان (`docs/drafts/*.draft.sql`, هذا التقرير) |

---

## 10. المخاطر المتبقية

| # | المخاطرة | التخفيف |
| --- | --- | --- |
| R1 | الاعتماد على وجود `public.app_role` بقيم `system_admin` و`admin` والدالة `public.has_role` | موجودة فعلاً في المشروع الحالي، لكن يجب التحقق البشري قبل التطبيق |
| R2 | سياسة تحديث القرار تسمح لـ `responsible_user_id` بتعديل أي حقل — لكن التطبيق سيُقيَّد بطبقة server function (allowlist للحقول) | سيُضاف Trigger صريح للتقييد في migration لاحقة M4 |
| R3 | لا Trigger لترقيم `meeting_number` و`decision_number` — يجب على طبقة التطبيق التوليد بحذر أو تُضاف Trigger في M4 | مقبول لمرحلة المراجعة |
| R4 | إذا لم يُنشأ `dean` كعضو `chair` في مجلس الكلية عبر seed لاحق، لن يستطيع رؤية المجلس ما لم يكن `system_admin`/`admin` | مقصود — seed منفصل في مرحلة لاحقة |
| R5 | جميع سياسات SELECT تُنفَّذ helper functions تستعلم `academic_council_members` عند كل صف — قد يتطلب مراجعة أداء لاحقاً | فهارس مضافة (`idx_acm_active`)، يمكن التحسين لاحقاً |

**لا مخاطر تشغيلية على النظام الحالي** لأن لا شيء طُبِّق فعلياً.

---

## 11. الفحص الساكن

- **راجعة SQL syntax** بصرياً: كل كتلة `CREATE TABLE` تتبع النمط الرباعي CREATE→GRANT→ENABLE RLS→POLICY.
- كل `$$` مغلقة، كل `CREATE POLICY` تحدد `TO authenticated` صراحة.
- لم يُعدَّل TypeScript ولم يُضف أي import — **typecheck/build غير مطلوب** لهذه المرحلة.

---

## 12. هل SQL جاهز للمراجعة البشرية؟

**نعم — READY FOR REVIEW.**

نقاط تستحق تركيز المراجع:
1. صحة الاعتماد على `public.has_role` و`public.app_role`.
2. مصفوفة صلاحيات تعديل القرار (chair vs responsible_user_id).
3. تأكيد أن `ON DELETE RESTRICT` هو السلوك المرغوب على FKs إلى `auth.users` و`departments`.
4. مراجعة اسم `has_council_role` لتفادي تعارض مستقبلي مع أسماء موجودة.

---

## 13. التوصية

**READY FOR REVIEW** — الانتقال إلى `COUNCILS-MVP-SCAFFOLD-01` بعد اعتماد المراجع البشري لنص SQL، وذلك بتقديم نفس النص عبر أداة migration الرسمية (لا نسخ يدوي).

---

## 14. القرار النهائي

**PASS**

- المسودة كاملة وموثقة.
- كل قواعد المرحلة التزم بها: لا تطبيق migration، لا DB، لا RLS، لا Storage، لا Triggers، لا bucket، لا seed، لا كود واجهة، لا نشر، لا توسيع Pilot، لا فتح صلاحيات، لا إيميلات، لا بيانات حقيقية.
- لا تأثير على Pilot الحالي ولا على أي مسار (`/admin`, `/admin/reports`, `/admin/student-requests`, `/student/requests`, `/student/requests/new`).
- جاهز للمراجعة البشرية ثم الانتقال إلى `COUNCILS-MVP-SCAFFOLD-01`.
