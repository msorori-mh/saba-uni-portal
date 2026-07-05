# COUNCILS-FACULTY-TOPIC-ATTACHMENTS-UI-01 — تقرير واجهة مرفقات الموضوعات

**التاريخ:** 2026-07-05  
**القرار:** **PASS**

**التوصية التالية:** **READY_FOR_COUNCILS_FACULTY_TOPIC_ATTACHMENTS_UI_PR**

---

## 1. الملفات المعدّلة

| الملف | التغيير |
|-------|---------|
| `src/routes/faculty-portal.academic-councils.tsx` | نموذج مرفقات + عرض + signed URL |

**لم يُمس:** migrations، DB، RLS، Storage policies، server functions، routes، admin.

---

## 2. دمج اختيار المرفقات في نموذج التقديم

داخل `SubmitTopicForm`:

- حقل `<input type="file" multiple>` مع `accept` للصيغ المسموحة
- عدّاد `{n}/5` ملفات
- تلميح من `policyHint("council_topic_attachment")`
- قائمة الملفات المختارة: الاسم، الحجم، MIME، زر **إزالة**
- تحقق فوري عبر `validateUpload(file, "council_topic_attachment")` عند الاختيار

---

## 3. تدفق الإرسال

```
1. submitCouncilTopic → topic_id
2. إن لم توجد مرفقات → toast نجاح عادي
3. لكل ملف:
   a. prepareCouncilTopicAttachmentUpload({ topic_id, council_id, file_name, file_size, mime_type, file_ext })
   b. supabase.storage.from(bucket).upload(file_path, file, { contentType, upsert: false })
4. invalidateQueries: my-council-topics + council-topic-attachments
5. إفراغ النموذج والملفات
```

**نمط:** prepare ثم `storage.upload` من client — **لا service role**.

---

## 4. عرض المرفقات

مكوّن `TopicAttachmentsList` داخل `TopicCard` (مواضيعي + موضوعات المجلس):

- `getCouncilTopicAttachments({ topic_id })`
- حالة فارغة: «لا توجد مرفقات.»
- لكل مرفق: الاسم، الحجم، النوع، تاريخ الرفع
- زر **فتح / تحميل** — بدون عرض `file_path`

---

## 5. signed URL

```
getCouncilTopicAttachmentSignedUrl({ attachment_id })
→ window.open(signedUrl, "_blank", "noopener,noreferrer")
```

- لا public URL
- خطأ عربي: `تعذر فتح المرفق حالياً.`

---

## 6. منع viewer من الرفع

- `viewerOnly` → لا يظهر `SubmitTopicForm` (سلوك قائم)
- لا حقل ملفات لـ viewer
- يمكنه فقط فتح مرفقات الموضوعات المرئية عبر RLS في `TopicAttachmentsList`

---

## 7. الحدود والأنواع

| الضابط | القيمة |
|--------|--------|
| حجم الملف | 10 MB |
| عدد المرفقات | 5 |
| الصيغ | jpg, jpeg, png, webp, pdf, doc, docx, xls, xlsx |

التحقق: client (`validateUpload`) + server (`prepareCouncilTopicAttachmentUpload`) + RLS/trigger.

---

## 8. فشل رفع مرفق بعد إنشاء الموضوع (محدودية MVP)

إذا نجح `submitCouncilTopic` وفشل رفع ملف واحد أو أكثر:

- **لا** حذف للموضوع
- **لا** UPDATE/DELETE للمرفقات
- **لا** cleanup تلقائي
- `toast.warning`: «تم إنشاء الموضوع، لكن تعذر رفع بعض المرفقات…»

**سبب:** لا مسار حذف/تصحيح مرفقات في MVP — قد يبقى سجل DB بدون ملف في storage إذا فشل `upload` بعد `prepare`.

---

## 9. رسائل الأخطاء العربية

| الحالة | الرسالة |
|--------|---------|
| نوع/حجم غير مسموح | من `validateUpload` |
| أكثر من 5 ملفات | `لا يمكن رفع أكثر من 5 مرفقات للموضوع.` |
| صلاحية رفع | `لا تملك صلاحية رفع مرفقات لهذا الموضوع.` |
| انتهاء الجلسة | `انتهت جلسة تسجيل الدخول…` |
| فتح مرفق | `تعذر فتح المرفق حالياً.` |
| فشل جزئي رفع | `تم إنشاء الموضوع، لكن تعذر رفع بعض المرفقات…` |

لا عرض رسائل تقنية خام (ASCII → رسالة عامة).

---

## 10. المحافظة على الموجود

| القدرة | الحالة |
|--------|--------|
| مجالس حالية / أرشيف | ✅ |
| اجتماعات | ✅ |
| تقديم بدون مرفقات | ✅ |
| معالجة JWT منتهي | ✅ |
| viewer قراءة فقط | ✅ |
| أزرار DELETE/UPDATE مرفقات | ❌ غير موجودة |

---

## 11. الاختبارات

| الاختبار | النتيجة |
|----------|---------|
| `npm run build` | **PASS** |
| `npx tsc --noEmit` | **PASS** |
| رفع ملفات فعلي | **لم يُنفَّذ** (يدوي عبر الواجهة لاحقاً) |

### تحقق منطقي

| السيناريو | متوقع |
|-----------|--------|
| عضو (غير viewer) | يرى النموذج + اختيار ملفات |
| viewer فقط | لا نموذج، لا رفع؛ فتح مرفقات مرئية فقط |
| ملف غير مسموح | toast خطأ عند الاختيار |
| > 5 ملفات | toast خطأ |
| موضوع بدون مرفقات | يعمل كما قبل |

---

## 12. تأكيدات النطاق

| العنصر | الحالة |
|--------|--------|
| migrations / DB / RLS / Storage policies | ❌ |
| server function changes | ❌ |
| route جديد / admin UI | ❌ |
| service role | ❌ |
| DELETE / UPDATE مرفقات | ❌ |
| إنشاء اجتماعات / قرارات / عضويات | ❌ |

---

## 13. المرحلة التالية

**READY_FOR_COUNCILS_FACULTY_TOPIC_ATTACHMENTS_UI_PR** — مراجعة يدوية واختبار رفع من المتصفح.

اختياري لاحقاً: `COUNCILS-ADMIN-TOPIC-ATTACHMENTS-REVIEW-01`.

---

*نهاية التقرير — COUNCILS-FACULTY-TOPIC-ATTACHMENTS-UI-01*
