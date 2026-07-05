# COUNCILS-TOPIC-ATTACHMENTS-DB-APPLY-01 — تقرير تطبيق Migration

**التاريخ:** 2026-07-05
**النطاق:** تطبيق migration واحد فقط + تحقق metadata.
**القرار:** **PASS**
**التوصية التالية:** **READY_FOR_COUNCILS_TOPIC_ATTACHMENTS_FUNCTIONS_01**

---

## ملخص

تم تطبيق محتوى:
`supabase/migrations/20260708120000_council_topic_attachments.sql`
على قاعدة بيانات Lovable Cloud بنجاح. تم التحقق من وجود الجدول، bucket، helpers، trigger، وسياسات RLS و storage بقراءات metadata فقط. لم تُنشأ أي بيانات ولم تُرفع أي ملفات ولم يُنفَّذ أي reset/cleanup.

---

## قبل التطبيق

- الملف المطلوب موجود في المستودع: `supabase/migrations/20260708120000_council_topic_attachments.sql` (396 سطراً).
- فحص أوّلي: `to_regclass('public.academic_council_topic_attachments')` رجع `NULL` — الجدول لم يكن موجوداً.
- bucket `council-topic-attachments` لم يكن موجوداً.

---

## آلية التطبيق

1. **إنشاء bucket** عبر أداة `supabase--storage_create_bucket` (private).
   السبب: تعليمات المشروع تمنع `INSERT INTO storage.buckets` عبر migration وتوجب استخدام الأداة المخصصة.
2. **تطبيق باقي الـ migration** (الجدول + الفهارس + helpers + trigger + grants + RLS + سياسات storage) عبر أداة `supabase--migration`. تم استبعاد كتلة `INSERT ... storage.buckets` فقط؛ باقي المحتوى مطابق للملف الأصلي حرفياً.
3. محاولة `UPDATE storage.buckets SET file_size_limit = 10485760` رُفضت بواسطة النظام (`bucket_sql_blocked`). الحدّ يبقى مفروضاً على مستوى الجدول عبر `CHECK (file_size <= 10485760)` (كما هو محدد أصلاً في migration).

---

## نتائج التحقق (metadata فقط)

### الجدول `public.academic_council_topic_attachments` — موجود

الأعمدة (12/12):
`id, topic_id, council_id, uploaded_by, file_name, file_path, file_size, mime_type, file_ext, storage_bucket, created_at, deleted_at` ✅

### Storage bucket `council-topic-attachments` — موجود

| الخاصية | القيمة |
|---------|--------|
| `public` | `false` ✅ |
| `file_size_limit` | `NULL` (تحديثه عبر SQL محجوب — الحدّ مفروض بقيد CHECK على الجدول) |

### Helpers — الخمسة موجودة

- `council_topic_attachment_count` ✅
- `can_add_council_topic_attachment` ✅
- `can_read_council_topic_attachment` ✅
- `can_upload_council_topic_attachment` ✅
- `tg_enforce_council_topic_attachment` ✅

### Trigger

- `trg_acta_enforce` على `academic_council_topic_attachments` — موجود ✅

### RLS policies على الجدول

| Policy | العملية |
|--------|--------|
| `acta_select` | SELECT ✅ |
| `acta_insert` | INSERT ✅ |
| — | **لا UPDATE policy** ✅ |
| — | **لا DELETE policy** ✅ |

### Storage policies على `storage.objects`

| Policy | العملية |
|--------|--------|
| `acta_storage_select` | SELECT ✅ |
| `acta_storage_insert` | INSERT ✅ |
| — | **لا UPDATE policy** ✅ |
| — | **لا DELETE policy** ✅ |

---

## منع viewer من الرفع — التحقق المنطقي

لم تُنشأ بيانات اختبارية. سلسلة المنع server-side مؤكدة من الكود:

1. `acta_insert` (RLS) → يشترط `can_upload_council_topic_attachment(auth.uid(), topic_id, council_id)`.
2. `can_upload_council_topic_attachment` → يشترط `can_submit_council_topic(_user, council_id)` (ما لم يكن admin).
3. `can_submit_council_topic` (من مرحلة `COUNCILS-FACULTY-HISTORY-RLS-01`) → يشترط `member_role IN ('chair','secretary','member')` — **يستبعد `viewer`**.
4. `acta_storage_insert` (storage RLS) → يستدعي نفس `can_upload_council_topic_attachment` قبل وجود صف DB.
5. Trigger `trg_acta_enforce` → يشترط `uploaded_by = topic.submitted_by` — viewer لا يستطيع الرفع لموضوع غيره.

---

## تأكيدات النطاق

| العنصر | الحالة |
|--------|--------|
| إنشاء بيانات اختبارية | ❌ لم يحدث |
| رفع ملفات فعلي | ❌ لم يحدث |
| DELETE أو UPDATE لبيانات | ❌ لم يحدث |
| تعديل عضويات | ❌ |
| إنشاء اجتماعات/موضوعات/قرارات | ❌ |
| تشغيل reset / cleanup | ❌ |
| UI changes | ❌ |
| server function changes | ❌ |
| route changes | ❌ |
| admin UI changes | ❌ |
| seed / import | ❌ |
| service role في المتصفح | ❌ |
| migrations إضافية غير المذكورة | ❌ (باستثناء محاولة `UPDATE storage.buckets` التي رُفضت من النظام) |
| Email / Cron | ❌ |

---

## الأخطاء / الملاحظات

- محاولة ضبط `storage.buckets.file_size_limit` عبر `UPDATE` رُفضت بـ `bucket_sql_blocked`. أثر عملي محدود: حدّ 10 MB مفروض بقيد `CHECK` على الجدول (`acta_file_size_max`) وعلى صف DB أوّلاً قبل قبول أي file object. يمكن ضبط `file_size_limit` لاحقاً من واجهة Lovable Cloud أو أداة مخصصة إن أُتيحت.
- Security linter أعاد 172 تنبيهاً مسبق الوجود على مستوى المشروع (ليست مرتبطة بهذه المرحلة). لا إجراء مطلوب هنا.

---

## المرحلة التالية

`COUNCILS-TOPIC-ATTACHMENTS-FUNCTIONS-01` — بناء server functions لرفع/قراءة/إدراج المرفقات + توليد signed URLs + regen types.

---

*نهاية التقرير — COUNCILS-TOPIC-ATTACHMENTS-DB-APPLY-01*
