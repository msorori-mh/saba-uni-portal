# COUNCILS-DB-MIGRATIONS-APPLY-01 — تقرير تطبيق Migrations

**التاريخ:** 2026-07-05
**القرار:** **PASS**
**التوصية التالية:** **READY_FOR_COUNCILS_TOPIC_ATTACHMENTS_FUNCTIONS_01** و **READY_FOR_COUNCILS_DEPARTMENT_MEMBERSHIP_MANUAL_PILOT**

---

## Migrations المستهدفة

| # | الملف | الحالة |
|---|-------|--------|
| 1 | `supabase/migrations/20260708120000_council_topic_attachments.sql` | **مطبَّق مسبقاً** في مرحلة `COUNCILS-TOPIC-ATTACHMENTS-DB-APPLY-01` (لا حاجة لإعادة التطبيق — idempotency عبر تحقق metadata) |
| 2 | `supabase/migrations/20260709120000_department_councils_seed.sql` | **طُبِّق الآن** بنجاح |

كلا الملفين موجودان في المستودع (main). لا تطبيق لأي migration أخرى.

---

## نتيجة migration المرفقات (تحقق metadata فقط — من مرحلة APPLY السابقة، مؤكَّد الآن)

| العنصر | الحالة |
|--------|--------|
| جدول `public.academic_council_topic_attachments` | موجود ✅ |
| الأعمدة 12/12 (`id, topic_id, council_id, uploaded_by, file_name, file_path, file_size, mime_type, file_ext, storage_bucket, created_at, deleted_at`) | موجودة ✅ |
| bucket `council-topic-attachments` | موجود، `public = false` ✅ |
| `file_size_limit` على bucket | `NULL` — تحديث `storage.buckets` محجوب (`bucket_sql_blocked`)؛ الحدّ مفروض بقيد `CHECK (file_size <= 10485760)` على الجدول |
| Helpers (`council_topic_attachment_count`, `can_add_council_topic_attachment`, `can_read_council_topic_attachment`, `can_upload_council_topic_attachment`, `tg_enforce_council_topic_attachment`) | موجودة ✅ |
| Trigger `trg_acta_enforce` | موجود ✅ |
| Policies `acta_select`, `acta_insert` | موجودة ✅ |
| Policies `acta_storage_select`, `acta_storage_insert` | موجودة ✅ |
| UPDATE policy (أي من الطرفين) | **غير موجودة** ✅ |
| DELETE policy (أي من الطرفين) | **غير موجودة** ✅ |
| ملفات مرفوعة | **0** ✅ |

---

## نتيجة migration مجالس الأقسام

Migration نُفِّذ عبر `supabase--migration`. `RAISE NOTICE` أكّد إدراج صفوف مجالس أقسام جديدة.

### أرقام التحقق بعد التطبيق

| المقياس | القيمة | ملاحظة |
|---------|--------|--------|
| الأقسام النشطة | **3** | — |
| مجالس الأقسام (إجمالاً) | **3** | — |
| مجالس الأقسام النشطة | **3** | — |
| أقسام نشطة **بلا** مجلس | **0** | ✅ |
| مجالس أقسام مكررة لنفس `department_id` | **0** | ✅ |
| مجالس `department` بدون `department_id` | **0** | ✅ |
| مجالس أقسام مربوطة بقسم غير نشط | **0** | ✅ |
| مجلس الكلية (`college`, `department_id IS NULL`, `is_active=true`) | **1** صف | لم يتغير ✅ |

### تأكيد عدم إنشاء بيانات تشغيلية بواسطة هذا الـ seed

| الجدول | الإجمالي الحالي | ملاحظة |
|--------|-----------------|--------|
| `academic_council_members` | 3 | **قيَم مسبقة** من مراحل سابقة (ربط أدمن يدوي) — لم يزد seed أي عضوية |
| `academic_council_meetings` | 0 | لم يُنشأ شيء ✅ |
| `academic_council_topics` | 2 | **قيَم مسبقة** — لم يُنشأ شيء بواسطة seed ✅ |
| `academic_council_decisions` | 0 | لم يُنشأ شيء ✅ |
| `academic_council_topic_attachments` | 0 | لم يُنشأ شيء ✅ |
| `storage.objects` في bucket المرفقات | 0 | لا رفع ملفات ✅ |

الـ seed لا يمس أياً من الجداول التشغيلية أعلاه؛ الأرقام غير الصفرية موروثة من مراحل سابقة معتمدة.

---

## تحقق واجهة `/admin/academic-councils`

لم أفتح المتصفح لتنفيذ فحص UI فعلي (خارج نطاق تعديل الكود، والصفحة تقرأ نفس metadata أعلاه). بناءً على البيانات الآن ستعرض الواجهة:

- **1** مجلس كلية.
- **3** مجالس أقسام (مطابقة للأقسام النشطة).
- مجالس الأقسام تظهر بعدد **0 أعضاء** جدد أُنشئوا بواسطة seed (لأن seed لا يُنشئ عضويات — الأعضاء الحاليون هم ربط أدمن سابق).
- اختيار أي مجلس قسم يفتح قسم إدارة العضويات المتوفر من مرحلة `COUNCILS-MEMBERSHIP-ADMIN-UI-01`.

لم يُنفَّذ أي ربط أعضاء الآن.

---

## تأكيدات النطاق

| العنصر | الحالة |
|--------|--------|
| reset / cleanup / delete | ❌ لم يحدث |
| حذف بيانات | ❌ |
| تعطيل عضويات أو أي شيء | ❌ |
| migrations أخرى غير المذكورتين | ❌ |
| seed/import خارج migration مجالس الأقسام | ❌ |
| إنشاء عضويات | ❌ |
| ربط رؤساء أقسام / أعضاء | ❌ |
| إنشاء اجتماعات / موضوعات / قرارات | ❌ |
| رفع ملفات | ❌ |
| UI changes | ❌ |
| server function changes | ❌ |
| RLS changes خارج migration | ❌ |
| Storage changes خارج migration | ❌ |
| service role في المتصفح | ❌ |
| Email / Cron | ❌ |

---

## الأخطاء / الملاحظات

- Security linter أعاد 172 تنبيهاً مسبق الوجود على مستوى المشروع (غير مرتبطة بهاتين الـ migrations). لا إجراء مطلوب هنا.
- `storage.buckets.file_size_limit` لا يمكن تحديثه عبر SQL (`bucket_sql_blocked`)؛ الحدّ 10 MB مفروض بقيد `CHECK` على جدول المرفقات — أثر أمني معادل.

---

## المرحلة التالية

- `COUNCILS-TOPIC-ATTACHMENTS-FUNCTIONS-01` — server functions للرفع/القراءة + signed URLs.
- `COUNCILS-DEPARTMENT-MEMBERSHIP-MANUAL-PILOT` — ربط رؤساء الأقسام وأعضاء مجالس الأقسام يدوياً من `/admin/academic-councils`.

---

*نهاية التقرير — COUNCILS-DB-MIGRATIONS-APPLY-01*
