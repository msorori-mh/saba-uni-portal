# COUNCILS-TOPIC-ATTACHMENTS-DB-01 — تقرير تجهيز Migration

**التاريخ:** 2026-07-05  
**النطاق:** إنشاء ملف migration داخل المستودع فقط — **لم يُطبَّق على Supabase**.  
**القرار:** **PASS**

**التوصية التالية:** **READY_FOR_COUNCILS_TOPIC_ATTACHMENTS_DB_PR**

**المرجع التصميمي:** `docs/COUNCILS-TOPIC-ATTACHMENTS-DESIGN-01-REPORT.md`

---

## ملخص

تم تجهيز migration كاملة لدعم مرفقات موضوعات المجالس الأكاديمية: جدول `academic_council_topic_attachments`، helpers، trigger، RLS على الجدول، bucket خاص `council-topic-attachments`، وسياسات storage. الملف موجود في المستودع وجاهز لمراجعة PR وتطبيق لاحق عبر pipeline معتمد.

---

## ملف Migration

| البند | القيمة |
|-------|--------|
| **المسار** | `supabase/migrations/20260708120000_council_topic_attachments.sql` |
| **المعرّف** | `COUNCILS-TOPIC-ATTACHMENTS-DB-01` |
| **طُبِّق على Supabase؟** | **لا** |

---

## الجداول المضافة

### `public.academic_council_topic_attachments`

| الحقل | النوع | ملاحظات |
|-------|-------|---------|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `topic_id` | `uuid` NOT NULL | FK → `academic_council_topics(id)` **ON DELETE RESTRICT** |
| `council_id` | `uuid` NOT NULL | FK → `academic_councils(id)` **ON DELETE RESTRICT** |
| `uploaded_by` | `uuid` NOT NULL | FK → `auth.users(id)` **ON DELETE RESTRICT** |
| `file_name` | `text` NOT NULL | اسم العرض |
| `file_path` | `text` NOT NULL | مسار داخل الـ bucket |
| `file_size` | `bigint` NOT NULL | `> 0` و `<= 10485760` |
| `mime_type` | `text` NOT NULL | allowlist |
| `file_ext` | `text` NOT NULL | allowlist (يُطبَّع إلى lowercase في trigger) |
| `storage_bucket` | `text` NOT NULL | default `'council-topic-attachments'`، CHECK ثابت |
| `created_at` | `timestamptz` NOT NULL | `now()` |
| `deleted_at` | `timestamptz` NULL | للحذف المنطقي لاحقاً — **لا UPDATE policy في MVP** |

**قيود CHECK:**
- `acta_file_size_positive` — `file_size > 0`
- `acta_file_size_max` — `file_size <= 10485760` (10 MB)
- `acta_storage_bucket_fixed` — `storage_bucket = 'council-topic-attachments'`
- `acta_mime_allowlist` — MIME مسموحة فقط
- `acta_ext_allowlist` — امتدادات مسموحة فقط

---

## الفهارس

| الفهرس | الغرض |
|--------|--------|
| `uq_acta_file_path` | UNIQUE على `file_path` حيث `deleted_at IS NULL` |
| `idx_acta_topic` | `topic_id` (نشط فقط) |
| `idx_acta_council` | `council_id` (نشط فقط) |
| `idx_acta_uploader` | `uploaded_by` |
| `idx_acta_created_at` | `created_at` |
| `idx_acta_deleted_at` | `deleted_at` (صفوف محذوفة منطقياً لاحقاً) |

---

## Storage Bucket

| الخاصية | القيمة |
|---------|--------|
| `id` / `name` | `council-topic-attachments` |
| `public` | `false` (private) |
| `file_size_limit` | `10485760` (10 MB) |
| `allowed_mime_types` | 8 أنواع (انظر § MIME) |
| الإنشاء | `INSERT ... ON CONFLICT (id) DO UPDATE` (idempotent) |
| public URLs | ❌ غير مدعومة |
| الوصول لاحقاً | signed URLs فقط |

**هيكل المسار:**
```
council-topics/{council_id}/{topic_id}/{attachment_id}-{safe_filename}
```

---

## الدوال المضافة (SECURITY DEFINER)

| الدالة | الغرض |
|--------|--------|
| `council_topic_attachment_count(_topic_id)` | عدد المرفقات النشطة (`deleted_at IS NULL`) |
| `can_add_council_topic_attachment(_topic_id)` | `count < 5` |
| `can_read_council_topic_attachment(_user, _topic_id, _council_id)` | يعكس `topics_select` + أرشيف `was_council_member_on` |
| `can_upload_council_topic_attachment(_user, _topic_id, _council_id)` | مالك الموضوع + حالة مسموحة + `can_submit_council_topic` أو admin |
| `tg_enforce_council_topic_attachment()` | trigger function — تكامل council/topic/count/path |

**Grants:** `REVOKE` من `anon`/`PUBLIC`؛ `GRANT EXECUTE` لـ `authenticated` و`service_role`.

---

## Trigger

| العنصر | التفاصيل |
|--------|----------|
| الاسم | `trg_acta_enforce` |
| التوقيت | `BEFORE INSERT` |
| يفرض | تطابق `council_id` مع الموضوع؛ `uploaded_by = submitted_by`؛ حالة الموضوع ∈ `{draft, needs_completion, submitted}`؛ حد 5 مرفقات؛ صيغة `file_path`؛ `deleted_at IS NULL`؛ تطبيع `file_ext` |

---

## سياسات RLS — الجدول

### `acta_select` (SELECT)

```
deleted_at IS NULL
AND can_read_council_topic_attachment(auth.uid(), topic_id, council_id)
```

يسمح لمن يستطيع قراءة الموضوع الأب: admin/system_admin (`is_council_admin`)، عضو مجلس فعّال، مقدّم الموضوع، عضو سابق ضمن فترة عضويته لموضوع مرتبط باجتماع.

> **ملاحظة `dean`:** `is_council_admin` الحالية = `admin` + `system_admin` فقط (سلوك قائم). العميد يرى المرفقات إن كان عضواً في المجلس أو مقدّم الموضوع.

### `acta_insert` (INSERT)

```
uploaded_by = auth.uid()
AND deleted_at IS NULL
AND can_upload_council_topic_attachment(auth.uid(), topic_id, council_id)
AND can_add_council_topic_attachment(topic_id)
```

### UPDATE / DELETE

- **لا UPDATE policy** — لا soft delete فعّال في MVP.
- **لا DELETE policy** — متسق مع `academic_council_topics`.

**Grants الجدول:** `SELECT, INSERT` لـ `authenticated`؛ `REVOKE DELETE`؛ `GRANT ALL` لـ `service_role`.

---

## سياسات Storage (`storage.objects`)

| السياسة | العملية | المنطق |
|---------|---------|--------|
| `acta_storage_select` | SELECT | EXISTS صف في `academic_council_topic_attachments` حيث `file_path = name` + `can_read_council_topic_attachment` |
| `acta_storage_insert` | INSERT | bucket صحيح + مسار `council-topics/{council_id}/{topic_id}/...` (4 أجزاء) + `can_upload_council_topic_attachment` |
| UPDATE | — | **لم تُضف** |
| DELETE | — | **لم تُضف** |

---

## حدود الملفات

| الضابط | القيمة | أين يُفرض |
|--------|--------|-----------|
| حجم الملف | **10 MB** (`10485760`) | CHECK على الجدول + `storage.buckets.file_size_limit` |
| عدد المرفقات / موضوع | **5** | `can_add_council_topic_attachment` + trigger + INSERT policy |
| soft delete | عمود `deleted_at` فقط | لا مسار حذف في MVP |

---

## أنواع MIME والامتدادات المسموحة

| الفئة | الامتدادات | MIME |
|-------|------------|------|
| صور | jpg, jpeg, png, webp | `image/jpeg`, `image/png`, `image/webp` |
| PDF | pdf | `application/pdf` |
| Word | doc, docx | `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| Excel | xls, xlsx | `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |

تُفرض على مستوى: CHECK constraints في الجدول + `allowed_mime_types` في الـ bucket.

---

## كيف تم منع viewer من الرفع

1. **`can_upload_council_topic_attachment`** تستدعي **`can_submit_council_topic`** التي تشترط `member_role IN (chair, secretary, member)` — **تستبعد `viewer`**.
2. **سياسة `acta_insert`** تتطلب `can_upload_council_topic_attachment`.
3. **سياسة `acta_storage_insert`** تستخدم نفس الدالة قبل وجود صف DB.
4. **Trigger** يشترط `uploaded_by = topic.submitted_by` — viewer لا يملك موضوعات مقدّمة من غيره.

---

## كيف تم فرض حد 5 مرفقات

| الطبقة | الآلية |
|--------|--------|
| Helper | `council_topic_attachment_count` يحسب `deleted_at IS NULL` فقط |
| Helper | `can_add_council_topic_attachment` → `count < 5` |
| RLS INSERT | `WITH CHECK (... AND can_add_council_topic_attachment(topic_id))` |
| Trigger | `BEFORE INSERT` يرفض إذا `count >= 5` |

لا يعتمد على العميل — كله server-side (DB).

---

## كيف تم ضمان private bucket

- `public = false` عند الإنشاء وفي `ON CONFLICT DO UPDATE`.
- **لا** سياسات تسمح بقراءة عامة.
- SELECT على `storage.objects` مربوط بصف attachment + `can_read_council_topic_attachment`.
- الوصول لاحقاً عبر **signed URLs** فقط (مرحلة FUNCTIONS).

---

## Supabase Generated Types

| البند | الحالة |
|-------|--------|
| تحديث `src/integrations/supabase/types.ts` | **NOT RUN** |
| السبب | لا يوجد أمر `gen types` في `package.json`؛ التوليد يتطلب اتصال Supabase — ممنوع في هذه المرحلة |
| التوصية | تشغيل `supabase gen types` بعد تطبيق migration في بيئة staging ضمن PR أو مرحلة FUNCTIONS |

---

## الاختبارات المحلية

| الاختبار | النتيجة |
|----------|---------|
| SQL syntax على DB | **NOT RUN** — لا اتصال Supabase (ممنوع) |
| `npm run build` | **PASS** (exit 0) |
| `npx tsc --noEmit` | **PASS** (exit 0) |

---

## تأكيدات النطاق

| العنصر | الحالة |
|--------|--------|
| تطبيق migration على Supabase | ❌ **لا** |
| `supabase db push` / `db reset` | ❌ لم يُشغَّل |
| data writes فعلية | ❌ |
| UI changes | ❌ |
| server function changes | ❌ |
| route changes | ❌ |
| admin UI changes | ❌ |
| service role في client | ❌ |
| رفع ملفات فعلي | ❌ |
| DELETE policy (جدول أو storage) | ❌ |
| لمس `src/routeTree.gen.ts` | ❌ |

---

## Idempotency

| العنصر | النمط |
|--------|-------|
| الجدول | `CREATE TABLE IF NOT EXISTS` |
| الفهارس | `CREATE INDEX IF NOT EXISTS` |
| الدوال | `CREATE OR REPLACE FUNCTION` |
| Trigger | `DROP TRIGGER IF EXISTS` ثم `CREATE` |
| Policies | `DROP POLICY IF EXISTS` ثم `CREATE` |
| Bucket | `ON CONFLICT (id) DO UPDATE` |

---

## المرحلة التالية

1. **PR:** `READY_FOR_COUNCILS_TOPIC_ATTACHMENTS_DB_PR` — مراجعة SQL وتطبيق على staging.
2. **بعد الدمج:** `COUNCILS-TOPIC-ATTACHMENTS-FUNCTIONS-01` — دوال faculty + `council_topic_attachment` في `storage-validation.ts` + regen types.
3. **ثم:** `COUNCILS-FACULTY-TOPIC-ATTACHMENTS-UI-01`.

---

*نهاية التقرير — COUNCILS-TOPIC-ATTACHMENTS-DB-01*
