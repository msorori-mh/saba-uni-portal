# COUNCILS-TOPIC-ATTACHMENTS-DESIGN-01 — تقرير تحليل وتصميم

**التاريخ:** 2026-07-05  
**النطاق:** تحليل وتصميم فقط — **لم يُنفَّذ أي تعديل** على الكود أو DB أو RLS أو Storage.  
**القرار:** **PASS**

**التوصية التالية:** **READY_FOR_COUNCILS_TOPIC_ATTACHMENTS_DB_01**

---

## تأكيد النطاق (لم يُنفَّذ)

| العنصر | الحالة |
|--------|--------|
| migrations | ❌ لم تُنشأ |
| DB changes | ❌ |
| RLS changes | ❌ |
| Storage bucket فعلي | ❌ |
| UI changes | ❌ |
| server function changes | ❌ |
| service role | ❌ |
| رفع ملفات فعلي / data writes | ❌ |
| route جديد | ❌ |
| admin UI changes | ❌ |

**المخرج الوحيد لهذه المرحلة:** هذا التقرير.

---

## 1. ملخص الحاجة

عضو المجلس الأكاديمي يحتاج عند تقديم موضوع جديد (مجلس الكلية أو القسم) إلى إرفاق ملفات داعمة — صور، PDF، Word، Excel — لعرضها على المجلس أثناء المراجعة. النظام الحالي يدعم تقديم الموضوع نصياً فقط (`submitCouncilTopic` → `academic_council_topics`) **بدون** جدول مرفقات أو bucket مخصص.

**الوضع الحالي (بعد فحص الكود والـ schema):**

| القدرة | DB | Storage | RLS | Server Functions | Faculty UI |
|--------|-----|---------|-----|------------------|------------|
| تقديم موضوع نصي | ✅ `academic_council_topics` | — | ✅ `can_submit_council_topic` | ✅ `submitCouncilTopic` | ✅ `SubmitTopicForm` |
| مرفقات موضوعات المجالس | ❌ لا جدول | ❌ لا bucket | ❌ | ❌ | ❌ |

**أنماط مرجعية في المشروع (للاقتداء):**

| النمط | الجدول | Bucket | الرفع | القراءة |
|-------|--------|--------|-------|---------|
| مرفقات طلبات الطلاب | `student_request_attachments` | `student-request-attachments` (private) | client `supabase.storage.upload` ثم INSERT | signed URL عبر `supabaseAdmin` (admin) / RLS-scoped SELECT |
| سندات الدفع | — | `payment-receipts` (private) | client upload بمسار `{uid}/{receipt_id}/...` | signed URL |
| التحقق من الملفات | — | — | `src/lib/storage-validation.ts` (`validateUpload`, `safeFileName`, allowlist MIME+ext) | — |

**قرار تصميمي أساسي:** مسار faculty councils يبقى على **`context.supabase` فقط** (بدون `supabaseAdmin`)، مع signed URLs عبر جلسة المستخدم وRLS على `storage.objects` — بخلاف admin لطلبات الطلاب.

---

## 2. الجدول المقترح: `academic_council_topic_attachments`

### 2.1 DDL مقترح (للمرحلة DB-01، دون تنفيذ الآن)

```sql
CREATE TABLE public.academic_council_topic_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id        uuid NOT NULL
                    REFERENCES public.academic_council_topics(id) ON DELETE RESTRICT,
  council_id      uuid NOT NULL
                    REFERENCES public.academic_councils(id) ON DELETE RESTRICT,
  uploaded_by     uuid NOT NULL
                    REFERENCES auth.users(id) ON DELETE RESTRICT,
  file_name       text NOT NULL,          -- الاسم الأصلي للعرض (UTF-8)
  file_path       text NOT NULL,          -- المسار داخل الـ bucket (فريد)
  file_size       bigint NOT NULL CHECK (file_size > 0),
  mime_type       text NOT NULL,
  file_ext        text NOT NULL,          -- امتداد مُستخرَج ومُتحقَّق (ليس مصدر الحقيقة الوحيد)
  storage_bucket  text NOT NULL DEFAULT 'council-topic-attachments',
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz             -- اختياري — مُؤجَّل وظيفياً في MVP
);

CREATE UNIQUE INDEX uq_acta_file_path
  ON public.academic_council_topic_attachments(file_path)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_acta_topic
  ON public.academic_council_topic_attachments(topic_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_acta_council
  ON public.academic_council_topic_attachments(council_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_acta_uploader
  ON public.academic_council_topic_attachments(uploaded_by);
```

### 2.2 تبرير الحقول

| الحقل | الغرض |
|-------|--------|
| `topic_id` | ربط المرفق بالموضوع (FK إلزامي) |
| `council_id` | **مُوصى به** — يُسرِّع سياسات RLS وstorage دون JOIN إضافي على كل طلب؛ يُملأ من `academic_council_topics.council_id` عند الإدراج ويُتحقَّق من تطابقه |
| `uploaded_by` | تدقيق ومسار صلاحيات الرفع |
| `file_name` | اسم العرض للمستخدم (الأصلي بعد تنظيف بسيط) |
| `file_path` | المسار الكامل داخل الـ bucket |
| `file_size` / `mime_type` / `file_ext` | تدقيق، عرض، وتتبع |
| `storage_bucket` | مرونة مستقبلية إن تعددت الـ buckets |
| `deleted_at` | حذف منطقي **لاحقاً** — انظر §2.3 |

**قيود إضافية مقترحة (DB-01):**

- `REVOKE DELETE` من `authenticated` (متسق مع `academic_council_topics`).
- `GRANT SELECT, INSERT` فقط لـ `authenticated` في MVP (لا UPDATE حتى لـ soft delete).
- Trigger أو CHECK: `council_id` يطابق `topic.council_id` عند INSERT.
- دالة مساعدة `count_active_topic_attachments(_topic_id)` للحد الأقصى (5).

### 2.3 soft delete في MVP؟

**القرار: لا soft delete فعّال في MVP.**

| الخيار | التوصية |
|--------|---------|
| حذف فعلي (DELETE) | ❌ مرفوض في MVP |
| soft delete (`deleted_at`) | ⚠️ **العمود يُضاف في الـ schema** للجاهزية، لكن **لا مسار حذف** (لا UPDATE ولا DELETE) في المراحل الأولى |
| عدم دعم الحذف إطلاقاً في MVP | ✅ **السلوك الافتراضي** — المرفقات تبقى للأرشيف والمراجعة |

**المبرر:** موضوعات المجالس مسار مراجعة رسمي؛ إزالة المرفقات تُعرِّض سجلاً إدارياً للتناقض. تأجيل `removeCouncilTopicAttachment` لمرحلة لاحقة بعد اعتماد سياسة حذف واضحة (soft delete + إخفاء من UI فقط).

---

## 3. Storage bucket المقترح

### 3.1 التعريف

| الخاصية | القيمة |
|---------|--------|
| `id` / `name` | `council-topic-attachments` |
| `public` | `false` (private) |
| public URLs | ❌ ممنوعة |
| الوصول | **signed URLs فقط** عبر `context.supabase.storage.createSignedUrl` |
| حد حجم الـ bucket (Supabase) | 10 MB لكل ملف (متسق مع سياسة التطبيق) |

### 3.2 هيكل المسارات

```
council-topics/{council_id}/{topic_id}/{attachment_id}-{safe_filename}
```

**مثال:**
```
council-topics/a1b2c3.../d4e5f6.../f7g8h9...-تقرير_القسم.pdf
```

| جزء المسار | الغرض |
|------------|--------|
| `council_id` | تجميع وRLS |
| `topic_id` | ربط مباشر بالموضوع |
| `attachment_id` | UUID مُسبق الإنشاء قبل الرفع — يمنع التصادم ويربط DB↔Storage |
| `safe_filename` | من `safeFileName()` في `storage-validation.ts` |

**لا يُستخدم** `auth.uid()` كجذر للمسار (بخلاف `student-request-attachments`) لأن قراءة المرفقات مشتركة بين أعضاء المجلس وليست ملكية فردية فقط.

### 3.3 تسجيل الـ bucket

يُضاف إلى قوائم الـ private buckets في:
- `src/routes/admin/security-status.tsx`
- `src/routes/admin/index.lazy.tsx`
- `src/lib/admin-operations.functions.ts`
- `src/lib/admin-system-readiness.functions.ts`

(في مرحلة UI/ops لاحقة — **خارج نطاق DB-01** إن لم تُلمس تلك الملفات في نفس الـ PR).

---

## 4. RLS المقترحة

### 4.1 Helpers جديدة (migration DB-01)

```sql
-- قراءة مرفق: يعكس منطق topics_select الحالي + COUNCILS-FACULTY-HISTORY-RLS-01
CREATE OR REPLACE FUNCTION public.can_read_council_topic_attachment(
  _user uuid, _topic_id uuid, _council_id uuid
) RETURNS boolean ...

-- رفع مرفق: مقدّم الموضوع + حالة تسمح + ليس viewer
CREATE OR REPLACE FUNCTION public.can_upload_council_topic_attachment(
  _user uuid, _topic_id uuid, _council_id uuid
) RETURNS boolean ...
```

#### `can_read_council_topic_attachment`

يعيد `true` إذا كان المستخدم يستطيع قراءة الموضوع الأب وفق السياسة الموسَّعة:

```sql
SELECT EXISTS (
  SELECT 1 FROM public.academic_council_topics t
  WHERE t.id = _topic_id AND t.council_id = _council_id
    AND (
      public.is_council_admin(_user)
      OR public.is_council_member(_user, t.council_id)
      OR t.submitted_by = _user
      OR EXISTS (
        SELECT 1 FROM public.academic_council_meetings mt
        WHERE mt.id = t.meeting_id
          AND public.was_council_member_on(
            _user, t.council_id,
            (mt.scheduled_at AT TIME ZONE 'UTC')::date
          )
      )
    )
);
```

> **ملاحظة `dean`:** `is_council_admin` الحالية = `admin` + `system_admin` فقط (سلوك قائم). العميد يرى المرفقات إذا كان عضواً في المجلس أو مقدّم الموضوع — وليس تلقائياً لكل المجالس.

#### `can_upload_council_topic_attachment`

```sql
SELECT EXISTS (
  SELECT 1 FROM public.academic_council_topics t
  WHERE t.id = _topic_id AND t.council_id = _council_id
    AND t.submitted_by = _user
    AND t.status IN (
      'draft'::public.academic_council_topic_status,
      'needs_completion'::public.academic_council_topic_status,
      'submitted'::public.academic_council_topic_status
    )
    AND (
      public.is_council_admin(_user)
      OR public.can_submit_council_topic(_user, t.council_id)
    )
);
```

| الدور | رفع | قراءة |
|-----|-----|-------|
| chair / secretary / member (فعّال) | ✅ لموضوعاته في الحالات المسموحة | ✅ حسب `can_read_council_topic_attachment` |
| viewer | ❌ (`can_submit_council_topic` يستبعده) | ✅ قراءة فقط إن كان الموضوع مرئياً له |
| مقدّم الموضوع (حتى بعد إنهاء العضوية لموضوعاته) | ✅ فقط في الحالات المسموحة وأثناء كونه مقدّماً | ✅ `submitted_by = _user` |
| عضو سابق | ❌ رفع | ✅ فقط موضوعات/اجتماعات ضمن فترة عضويته (`was_council_member_on`) أو موضوعاته الخاصة |
| admin / system_admin | ✅ عبر `is_council_admin` | ✅ |
| dean (بدون عضوية مجلس) | ❌ | ❌ (ما لم يُضف لاحقاً لـ RLS المجالس) |

**لا DELETE ولا UPDATE** على الجدول في MVP.

### 4.2 سياسات جدول `academic_council_topic_attachments`

```sql
-- SELECT
CREATE POLICY acta_select ON public.academic_council_topic_attachments
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.can_read_council_topic_attachment(auth.uid(), topic_id, council_id)
  );

-- INSERT
CREATE POLICY acta_insert ON public.academic_council_topic_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND deleted_at IS NULL
    AND public.can_upload_council_topic_attachment(auth.uid(), topic_id, council_id)
    AND (SELECT count(*) FROM public.academic_council_topic_attachments a
         WHERE a.topic_id = academic_council_topic_attachments.topic_id
           AND a.deleted_at IS NULL) < 5  -- أو عبر trigger
  );
```

### 4.3 سياسات `storage.objects`

**INSERT** — يتحقق من صلاحية الرفع وتطابق المسار:

```sql
CREATE POLICY acta_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'council-topic-attachments'
    AND (storage.foldername(name))[1] = 'council-topics'
    AND public.can_upload_council_topic_attachment(
      auth.uid(),
      ((storage.foldername(name))[3])::uuid,  -- topic_id
      ((storage.foldername(name))[2])::uuid   -- council_id
    )
  );
```

**SELECT** — نمط `sra_storage_select_priv` (ربط بصف الجدول + صلاحية قراءة):

```sql
CREATE POLICY acta_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'council-topic-attachments'
    AND EXISTS (
      SELECT 1 FROM public.academic_council_topic_attachments att
      WHERE att.file_path = storage.objects.name
        AND att.deleted_at IS NULL
        AND public.can_read_council_topic_attachment(
          auth.uid(), att.topic_id, att.council_id
        )
    )
  );
```

**لا سياسات DELETE** على `storage.objects` في MVP.

---

## 5. أنواع الملفات والتحقق

### 5.1 Allowlist (MIME + امتداد)

| النوع | الامتدادات | MIME |
|-------|------------|------|
| صور | jpg, jpeg, png, webp | `image/jpeg`, `image/png`, `image/webp` |
| PDF | pdf | `application/pdf` |
| Word | doc, docx | `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| Excel | xls, xlsx | `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |

### 5.2 ضوابط مقترحة

| الضابط | القيمة MVP | ملاحظة |
|--------|------------|--------|
| حجم الملف الواحد | **10 MB** | متسق مع `research_pdf`؛ 20 MB خيار لـ NEEDS_APPROVAL لاحقاً |
| عدد المرفقات لكل موضوع | **5** | يُفرض في server function + DB trigger/CHECK |
| الملفات التنفيذية | **محظورة** | `BLOCKED_EXT` في `storage-validation.ts` |
| SVG | محظور | XSS (موجود في الكود الحالي) |
| اسم الملف | `safeFileName()` | إزالة مسارات وم chars خطرة |
| الاعتماد على الامتداد فقط | ❌ | MIME **و** امتداد معاً؛ رفض إذا تعارضا أو MIME فارغ مع امتداد مشبوه |
| `contentType` عند الرفع | من `file.type` بعد التحقق | يُمرَّر لـ `storage.upload` |

### 5.3 سياسة تطبيق جديدة (مرحلة FUNCTIONS/UI)

إضافة مفتاح في `storage-validation.ts`:

```typescript
| "council_topic_attachment"  // 10 MB, pdf/images/office allowlist
```

مع رسائل عربية صريحة عبر `validateUpload` و`policyHint` (نفس نمط `STORAGE-HARDENING-01`).

---

## 6. دوال server المقترحة (`faculty-councils.functions.ts`)

**جميعها:** `createServerFn` + `requireSupabaseAuth` + **`context.supabase` فقط** — بدون service role، بدون bypass لـ RLS.

### 6.1 `uploadCouncilTopicAttachment`

**Input (zod):**
```typescript
{ topic_id: uuid, council_id: uuid, file_name: string, file_size: number,
  mime_type: string, file_ext: string, file_path: string }
```

**التدفق:**
1. `assertActiveFacultyProfile`
2. التحقق من العدد (< 5) عبر SELECT count
3. التحقق من `can_upload` ضمنياً عبر INSERT (RLS)
4. INSERT في `academic_council_topic_attachments`
5. **ملاحظة:** الرفع الفعلي إلى Storage يحدث من **العميل** قبل أو بعد INSERT — يُوصى بـ:
   - توليد `attachment_id` في server (دالة `prepareCouncilTopicAttachment` اختيارية) أو
   - العميل: INSERT عبر server بعد `storage.upload` ناجح

**النمط الآمن (مقترح):**
1. Client يستدعي server لتسجيل المرفق بعد نجاح `storage.upload`
2. أو server يُعيد `{ attachment_id, file_path }` والعميل يرفع ثم يؤكد

للبساطة في MVP: **العميل يرفع إلى Storage ثم يستدعي server لإدراج الصف** (مثل `StudentRequestsSection.uploadAttachment`).

### 6.2 `getCouncilTopicAttachments`

```typescript
input: { topic_id: string }
output: Array<{ id, file_name, file_size, mime_type, file_ext, created_at, uploaded_by }>
```

- SELECT من الجدول حيث `topic_id` و`deleted_at IS NULL`
- RLS يحدّد المرئي
- **لا يُرجع** `file_path` للعميل إن أردنا إخفاءه — أو يُرجع للتدقيق الداخلي فقط عند طلب signed URL

### 6.3 `getCouncilTopicAttachmentSignedUrl`

```typescript
input: { attachment_id: string }
output: { signedUrl: string, expiresIn: number }  // 300 ثانية مثل باقي النظام
```

```typescript
const { data, error } = await context.supabase.storage
  .from("council-topic-attachments")
  .createSignedUrl(file_path, 300);
```

- يتحقق أولاً من وجود الصف وصلاحية القراءة (عبر SELECT — RLS)
- يفتح في تبويب جديد / تنزيل من الواجهة

### 6.4 `removeCouncilTopicAttachment` (لاحقاً — خارج MVP)

- soft delete: `UPDATE deleted_at = now()` — يتطلب سياسة UPDATE مُقيدة
- **لا تُنفَّذ في المراحل الأربع الأولى**

### 6.7 أخطاء عربية

| الحالة | الرسالة |
|--------|---------|
| RLS | `تعذّر تنفيذ العملية بسبب قيود الصلاحيات الحالية.` |
| viewer يحاول الرفع | `دور المطّلع لا يسمح برفع مرفقات.` |
| تجاوز العدد | `لا يمكن إرفاق أكثر من 5 ملفات لكل موضوع.` |
| حالة موضوع لا تسمح | `لا يمكن إرفاق ملفات لهذا الموضوع في حالته الحالية.` |

---

## 7. تعديل `submitCouncilTopic` — التدفق المقترح

### الخيارات

| الخيار | الوصف | المخاطر |
|--------|--------|---------|
| **أ — موضوع ثم مرفقات (مُوصى به)** | `submitCouncilTopic` → `topic_id` → رفع كل مرفق على حدة | فشل جزئي ممكن (موضوع بدون مرفقات) — يُعالج في UI |
| ب — عملية واحدة | multipart في دالة واحدة | معقد، حدود حجم server، صعب مع RLS/storage |

### قرار MVP: **الخيار أ — إنشاء الموضوع أولاً ثم رفع المرفقات**

**التسلسل في UI:**

```
1. المستخدم يملأ النموذج ويختار ملفات (تحقق client مسبق)
2. submitCouncilTopic({ council_id, title, description }) → topic_id
3. لكل ملف (بالتتابع أو محدود التوازي):
   a. validateUpload(file, "council_topic_attachment")
   b. توليد attachment_id (crypto.randomUUID)
   c. storage.upload → council-topics/{council_id}/{topic_id}/{attachment_id}-{safeName}
   d. server: registerCouncilTopicAttachment (INSERT)
4. invalidateQueries + toast نجاح/تحذير جزئي
```

**معالجة الفشل الجزئي:**
- إن نجح الموضوع وفشل مرفق: `toast.warning` «تم إرسال الموضوع؛ تعذّر رفع بعض المرفقات»
- إعادة محاولة رفع لاحقاً من «مواضيعي المقدمة» إن كانت الحالة `submitted` / `needs_completion`

**لا تغيير على `submitCouncilTopic` في DB-01** — التكامل في مرحلة FUNCTIONS/UI.

---

## 8. واجهة faculty المقترحة (`/faculty-portal/academic-councils`)

### 8.1 نموذج تقديم الموضوع (`SubmitTopicForm`)

```
┌─ تقديم موضوع جديد للمجلس ─────────────────────────────┐
│  المجلس: [select]                                      │
│  العنوان: [input]                                      │
│  الوصف: [textarea]                                     │
│  المرفقات الداعمة (اختياري — حتى 5 ملفات، 10 م.ب لكل ملف): │
│  [اختيار ملفات]  (multiple, accept حسب allowlist)      │
│  ┌ قائمة الملفات المختارة ─────────────────────────┐  │
│  │ 📄 تقرير.pdf · 2.1 م.ب  [إزالة]                  │  │
│  │ 🖼 صورة.png · 800 ك.ب   [إزالة]                  │  │
│  └──────────────────────────────────────────────────┘  │
│  تلميح: PDF، Word، Excel، JPG/PNG/WebP                 │
│  [إرسال الموضوع]                                       │
└────────────────────────────────────────────────────────┘
```

**سلوك:**
- تحقق فوري عند الاختيار: `validateUpload` + حد 5 ملفات
- رسائل عربية من `storage-validation.ts`
- `viewerOnly` → النموذج مخفي (موجود حالياً)
- شريط تقدم أثناء الرفع (اختياري MVP+)
- بعد النجاح: مسح الحقول والملفات

### 8.2 «مواضيعي المقدمة» (`TopicCard`)

```
┌─ عنوان الموضوع ─────────────── [مُرسَل] ─┐
│  المجلس · التاريخ                          │
│  الوصف...                                  │
│  المرفقات (2):                             │
│    📎 تقرير.pdf  [فتح]  [تحميل]             │
│    📎 جدول.xlsx  [فتح]  [تحميل]             │
│  (+ زر «إضافة مرفق» إن status يسمح — لاحقاً)│
└────────────────────────────────────────────┘
```

- `[فتح]` / `[تحميل]` → `getCouncilTopicAttachmentSignedUrl` → `window.open` أو `<a download>`
- لا عرض مسار storage الخام

### 8.3 «موضوعات المجلس»

- نفس عرض المرفقات للقراءة فقط (بدون رفع)
- viewer يرى المرفقات إن رأى الموضوع

---

## 9. واجهة admin المقترحة لاحقاً (`/admin/academic-councils`)

**لا تنفيذ في هذه المرحلة.** التصميم للمرحلة `COUNCILS-ADMIN-TOPIC-ATTACHMENTS-REVIEW-01`:

```
┌─ مراجعة الموضوعات ─────────────────────────────────────┐
│  فلتر: مجلس · حالة · تاريخ                              │
│  ┌ موضوع: «تطوير الخطة الدراسية» ─── [قيد المراجعة] ─┐ │
│  │  مقدّم: د. أحمد · التاريخ · الوصف                   │ │
│  │  المرفقات:                                          │ │
│  │    📎 خطة.docx  [معاينة]  [تحميل]                   │ │
│  │    📎 ملحق.pdf  [معاينة]  [تحميل]                   │ │
│  │  [قبول للأجندة] [طلب استكمال] [تأجيل] [رفض]        │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

- المعاينة عبر signed URL (قد يستخدم `context.supabase` لـ chair/secretary إن كانوا أعضاء، أو `supabaseAdmin` لـ admin فقط — **قرار مرحلة ADMIN:** يُفضَّل البقاء على نمط المجالس الحالي `is_council_admin` + session supabase حيث أمكن)
- عداد مرفقات في KPIs (`submitted_topics` مع مرفقات)
- لا حذف مرفق من admin في MVP

---

## 10. المراحل التنفيذية المقترحة

| # | معرّف المرحلة | النطاق | تبعيات |
|---|---------------|--------|--------|
| 1 | **COUNCILS-TOPIC-ATTACHMENTS-DB-01** | جدول + indexes + helpers + RLS جدول + bucket + storage policies + grants | هذا التقرير (PASS) |
| 2 | **COUNCILS-TOPIC-ATTACHMENTS-FUNCTIONS-01** | `getCouncilTopicAttachments`, `getCouncilTopicAttachmentSignedUrl`, تسجيل مرفق بعد الرفع؛ سياسة `council_topic_attachment` في `storage-validation.ts` | DB-01 |
| 3 | **COUNCILS-FACULTY-TOPIC-ATTACHMENTS-UI-01** | `SubmitTopicForm` + `TopicCard` + تدفق submit ثم upload؛ توسيع `MyCouncilTopicItem` بـ `attachments_count` أو قائمة | FUNCTIONS-01 |
| 4 | **COUNCILS-ADMIN-TOPIC-ATTACHMENTS-REVIEW-01** | عرض مرفقات في مراجعة الموضوعات admin | FUNCTIONS-01 + admin topics UI |

**ترتيب داخل كل مرحلة:** migration → types regen → functions → UI → تقرير PASS.

---

## 11. مخاطر وملاحظات

| # | المخاطرة | التخفيف |
|---|----------|---------|
| 1 | فشل رفع بعد إنشاء الموضوع | UI يوضح الحالة الجزئية؛ إعادة رفع من «مواضيعي» |
| 2 | تسريب مسار storage | عدم إرجاع `file_path` للواجهة؛ signed URLs قصيرة (300ث) |
| 3 | MIME مزيف من المتصفح | امتداد + MIME + حجم؛ رفض التعارض |
| 4 | عضو سابق يرى مرفقات خارج فترته | `can_read_council_topic_attachment` يعكس `topics_select` |
| 5 | viewer يرفع | محظور في DB (`can_submit_council_topic`) + UI (`viewerOnly`) |
| 6 | orphan files في storage دون صف DB | قبول مؤقت في MVP؛ تنظيف batch لاحق (ops) |
| 7 | `dean` بدون عضوية | سلوك RLS قائم — خارج نطاق المرفقات |

---

## 12. مراجع الكود والـ schema المُفحوصة

| المورد | الملاحظة |
|--------|----------|
| `supabase/migrations/20260703192337_...sql` | `academic_council_topics` — لا مرفقات |
| `supabase/migrations/20260704200326_...sql` | `was_council_member_on`, `can_submit_council_topic`, `topics_select` موسَّع |
| `supabase/migrations/20260531235203_...sql` | نمط `student_request_attachments` + storage |
| `src/lib/faculty-councils.functions.ts` | `submitCouncilTopic`, `getMyCouncilTopics` |
| `src/routes/faculty-portal.academic-councils.tsx` | `SubmitTopicForm`, `TopicCard` |
| `src/lib/storage-validation.ts` | `validateUpload`, `safeFileName`, `BLOCKED_EXT` |
| `src/components/portal/StudentRequestsSection.tsx` | `uploadAttachment` — نمط رفع مرجعي |

---

## 13. الخلاصة

| البند | القرار |
|-------|--------|
| **القرار** | **PASS** |
| **التوصية** | **READY_FOR_COUNCILS_TOPIC_ATTACHMENTS_DB_01** |
| جدول جديد | `academic_council_topic_attachments` (+ `council_id` للـ RLS) |
| bucket | `council-topic-attachments` — private، signed URLs فقط |
| soft delete | عمود `deleted_at` في الـ schema؛ **لا وظيفة حذف في MVP** |
| حجم / عدد | 10 MB × 5 ملفات |
| تدفق submit | موضوع أولاً → مرفقات ثانياً |
| service role | **لا** في مسار faculty |

---

*نهاية التقرير — COUNCILS-TOPIC-ATTACHMENTS-DESIGN-01*
