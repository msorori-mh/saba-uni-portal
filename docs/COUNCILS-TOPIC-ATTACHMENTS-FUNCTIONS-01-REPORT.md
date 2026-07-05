# COUNCILS-TOPIC-ATTACHMENTS-FUNCTIONS-01 — تقرير تنفيذ دوال المرفقات

**التاريخ:** 2026-07-05  
**القرار:** **PASS**

**التوصية التالية:** **READY_FOR_COUNCILS_FACULTY_TOPIC_ATTACHMENTS_UI_01**

---

## 1. الملفات المعدّلة

| الملف | التغيير |
|-------|---------|
| `src/lib/faculty-councils.functions.ts` | 3 دوال server + أنواع + helpers للمرفقات |
| `src/lib/storage-validation.ts` | سياسة `council_topic_attachment` + `validateUploadMetadata` |

**لم يُمس:** migrations، DB، RLS، Storage policies، UI، routes، admin، service role.

---

## 2. الدوال المضافة

| الدالة | الغرض |
|--------|--------|
| `getCouncilTopicAttachments` | قائمة مرفقات موضوع (RLS-scoped)، بدون `file_path` |
| `getCouncilTopicAttachmentSignedUrl` | signed URL قصير عبر `context.supabase.storage` |
| `prepareCouncilTopicAttachmentUpload` | تحقق + INSERT سجل + إرجاع `attachment_id` / `bucket` / `file_path` |

**لم تُضف:** `uploadCouncilTopicAttachment` (رفع مباشر)، `completeCouncilTopicAttachmentUpload`، `removeCouncilTopicAttachment`.

---

## 3. نمط الرفع المختار (خطوتان)

**الخيار المعتمد للـ MVP:** `prepareCouncilTopicAttachmentUpload` ثم رفع من العميل.

```
1. prepareCouncilTopicAttachmentUpload({ topic_id, council_id, file_name, file_size, mime_type, file_ext })
   → { attachment_id, bucket, file_path }
2. الواجهة (لاحقاً):
   supabase.storage.from(bucket).upload(file_path, file, { contentType: mime_type, upsert: false })
```

**لماذا:** server functions لا تمرّر `File/Blob` بأمان في نمط المشروع الحالي؛ نفس أسلوب `StudentRequestsSection` (سجل/مسار من server أو client ثم upload).

**لا service role** — كل العمليات عبر `context.supabase`.

---

## 4. الأنواع المُصدَّرة

| النوع | الاستخدام |
|-------|-----------|
| `CouncilTopicAttachmentItem` | عنصر قائمة المرفقات |
| `PrepareCouncilTopicAttachmentUploadResult` | نتيجة التحضير |
| `CouncilTopicAttachmentSignedUrlResult` | `signedUrl`, `expiresIn`, `fileName`, `mimeType` |

---

## 5. التحقق من MIME / الامتداد / الحجم

| الطبقة | الآلية |
|--------|--------|
| Zod | `file_size` ≤ 10MB، حقول مطلوبة |
| `validateUploadMetadata(..., "council_topic_attachment")` | allowlist MIME + ext، `BLOCKED_EXT`، حجم |
| تطابق الامتداد | `file_ext` يجب أن يطابق امتداد `file_name` |
| DB CHECK + trigger | طبقة إضافية عند INSERT |
| bucket | `file_size_limit` + `allowed_mime_types` |

**الصيغ المدعومة:** jpg, jpeg, png, webp, pdf, doc, docx, xls, xlsx.

---

## 6. فرض حد 5 مرفقات

| الطبقة | الآلية |
|--------|--------|
| Server | `count` على `academic_council_topic_attachments` حيث `deleted_at IS NULL` قبل INSERT |
| RLS INSERT | `can_add_council_topic_attachment` |
| Trigger | `council_topic_attachment_count >= 5` → رسالة عربية عبر `mapAttachmentDbError` |

---

## 7. منع viewer من الرفع

| الطبقة | الآلية |
|--------|--------|
| RPC | `can_upload_council_topic_attachment` → `can_submit_council_topic` (يستبعد `viewer`) |
| Fallback | تحقق `submitted_by` + `assertCanSubmitCouncilTopic` |
| رسالة | `لا تملك صلاحية رفع مرفقات لهذا الموضوع.` |

---

## 8. signed URL

```typescript
context.supabase.storage
  .from(storage_bucket)
  .createSignedUrl(file_path, 300)
```

- **المدة:** 300 ثانية (5 دقائق)
- **لا public URL**
- **لا service role**
- SELECT على سجل المرفق أولاً (RLS) — إن فشل: `لا تملك صلاحية فتح هذا المرفق.`

---

## 9. أمان المسار

- يُبنى server-side فقط:
  `council-topics/{council_id}/{topic_id}/{attachment_id}-{safe_filename}`
- `safeFileName()` من `storage-validation.ts`
- **لا** قبول `file_path` من الواجهة (`inputValidator` يرفض `file_path` / `attachment_id` / `storage_bucket`)

---

## 10. `getCouncilTopicAttachments`

**Input:** `{ topic_id: uuid }`

**Output:** مصفوفة بدون `file_path` — الحقول: `id`, `topic_id`, `council_id`, `file_name`, `file_size`, `mime_type`, `file_ext`, `created_at`, `uploaded_by`

**فلتر:** `deleted_at IS NULL` (استعلام صريح + RLS)

---

## 11. الاختبارات

| الاختبار | النتيجة |
|----------|---------|
| `npm run build` | **PASS** |
| `npx tsc --noEmit` | **PASS** |
| رفع ملفات فعلي | **لم يُنفَّذ** |
| إنشاء بيانات | **لم يُنفَّذ** |

---

## 12. تأكيدات النطاق

| العنصر | الحالة |
|--------|--------|
| migrations | ❌ |
| DB / RLS changes | ❌ |
| Storage policy changes | ❌ |
| UI / route / admin changes | ❌ |
| service role | ❌ |
| DELETE / UPDATE للمرفقات | ❌ |
| `completeCouncilTopicAttachmentUpload` | ❌ (غير مطلوب في MVP) |

---

## 13. تدفق UI المقترح (المرحلة التالية)

```
submitCouncilTopic → topic_id
prepareCouncilTopicAttachmentUpload (لكل ملف)
client storage.upload(bucket, file_path, file)
getCouncilTopicAttachments → عرض القائمة
getCouncilTopicAttachmentSignedUrl → فتح/تحميل
```

**ملاحظة:** إن فشل `storage.upload` بعد `prepare`، قد يبقى سجل DB بدون ملف (مقبول مؤقتاً في MVP — موثّق في التصميم).

---

## 14. المرحلة التالية

**READY_FOR_COUNCILS_FACULTY_TOPIC_ATTACHMENTS_UI_01**

- توسيع `SubmitTopicForm` و`TopicCard` في `faculty-portal.academic-councils.tsx`
- استخدام `validateUpload` (client) + `prepareCouncilTopicAttachmentUpload` + `storage.upload`

---

*نهاية التقرير — COUNCILS-TOPIC-ATTACHMENTS-FUNCTIONS-01*
