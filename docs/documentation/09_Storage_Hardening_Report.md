# 09 — تقرير تأمين التخزين (Storage Hardening Report)

**المرحلة:** STORAGE-HARDENING-01
**التاريخ:** 2026-06-11

---

## 1) جرد Buckets الحالية

| Bucket | عام/خاص | حد الحجم (خادم) | الأنواع المسموحة (خادم) | الاستخدام |
|---|---|---|---|---|
| `news-images` | عام | 5 م.ب | image/jpeg, png, webp, svg, gif | صور الأخبار |
| `events-images` | عام | 5 م.ب | image/jpeg, png, webp, svg, gif | صور الفعاليات |
| `department-images` | عام | 5 م.ب | image/jpeg, png, webp, svg, gif | صور الأقسام |
| `faculty-images` | عام | 5 م.ب | image/jpeg, png, webp, svg, gif | صور الكلية |
| `research-pdfs` | عام | 20 م.ب | application/pdf | الأبحاث المنشورة |
| `payment-receipts` | **خاص** | 10 م.ب | image/jpeg, png, webp, pdf | سندات دفع الطلاب |
| `student-request-attachments` | **خاص** | 10 م.ب | image/jpeg, png, webp, pdf | مرفقات طلبات الطلاب |

> ملاحظة: حدود/أنواع Bucket لا يمكن تعديلها عبر SQL على Supabase Managed Storage. الحدود الأشد تُفرض في طبقة الواجهة قبل الرفع.

---

## 2) التصنيف حسب الحساسية

**PUBLIC (لا تحوي بيانات شخصية حساسة):**
- `news-images`, `events-images`, `department-images`, `research-pdfs`

**PUBLIC ولكن قد يحوي صور أشخاص:** `faculty-images` (صور أعضاء الكلية – موافقة ضمنية بنشرها).

**PRIVATE:** `payment-receipts`, `student-request-attachments`.

---

## 3) التغييرات المنفّذة

### A. إغلاق LIST العام للـ Buckets العامة (Migration)

تم استبدال سياسة `SELECT TO public` بسياسة `SELECT TO authenticated` على:
- `news-images`, `events-images`, `department-images`, `faculty-images`, `research-pdfs`.

**النتيجة:** لم يعد بإمكان أي مستخدم غير مسجل إجراء `list` على هذه الـ Buckets.
عرض الصور والملفات عبر الـ Public URL (`/object/public/...`) **يستمر بالعمل** لأن العرض العام لا يمر عبر RLS عندما يكون `bucket.public = true`.

### B. تطبيق سياسات أشد في الواجهة (Client-side)

ملف جديد: `src/lib/storage-validation.ts` يفرض قبل الرفع:

| السياسة | الحد الأقصى | الصيغ المسموحة | الصيغ المحظورة |
|---|---|---|---|
| `public_image` | 2 م.ب | jpg, jpeg, png, webp, gif | svg + كل التنفيذية |
| `student_attachment` | 5 م.ب | pdf, jpg, jpeg, png | كل ما عداها |
| `payment_receipt` | 5 م.ب | pdf, jpg, jpeg, png | كل ما عداها |
| `research_pdf` | 10 م.ب | pdf | كل ما عداها |

**قائمة الامتدادات المحظورة دائماً:**
`exe, js, mjs, cjs, ts, html, htm, php, phtml, sh, bash, zsh, bat, cmd, ps1, jar, war, svg, vbs, wsf, msi, dll, so`

التحقق يجمع بين:
- امتداد الملف (allowlist)
- `Content-Type` المُعلَن من المتصفح
- حجم الملف
- اسم آمن (إزالة المحارف الخطرة + قص المسار)
- رفض الملفات الفارغة

### C. تكامل نقاط الرفع الحساسة (واجهة الطالب)

| المكون | السياسة المطبَّقة |
|---|---|
| `StudentFinanceSection` (سندات الدفع) | `payment_receipt` + `contentType` + امتداد آمن |
| `StudentRequestsSection` (مرفقات الطلبات) | `student_attachment` + `safeFileName()` |

مسارات الرفع تستخدم `<uid>/<entity-id>/<file>` وهو ما تفرضه أصلاً سياسات RLS الحالية على `storage.objects` (`auth.uid()::text = storage.foldername(name)[1]`)، فلا يمكن لطالب الكتابة في مجلد طالب آخر.

> **واجهات الإدارة** (`admin/news.tsx`, `admin/research.tsx`, …) لم تُعدَّل سلوكياً؛ تعتمد على حدود الـ Bucket من جهة الخادم وعلى صلاحيات المسؤول.

---

## 4) Path Security — حالة المسارات

- ✅ `payment-receipts`: `<uid>/<receiptId>/receipt.<ext>` (UUID)
- ✅ `student-request-attachments`: `<uid>/<requestId>/<timestamp>-<safeName>`
- ✅ منع الكتابة فوق الملفات: `upsert: false`
- ✅ Path traversal مستبعد عبر `safeFileName()` + استخدام `crypto.randomUUID()`
- ✅ لا يُكشف الرقم الأكاديمي في أي مسار

---

## 5) الوصول للملفات الخاصة

| العملية | الآلية |
|---|---|
| قراءة سند دفع | `createSignedUrl(path, 300)` — 5 دقائق |
| قراءة مرفق طلب | `createSignedUrl(path, 300)` — 5 دقائق |
| لا يوجد أي `getPublicUrl` على Buckets خاصة | ✓ |

RLS على `storage.objects` يحصر القراءة في صاحب الملف + الأدوار الإدارية المخوّلة (`admin`, `system_admin`, `registrar`, `student_affairs`, `dean`).

---

## 6) ما لم يُنفَّذ ولماذا

| البند | السبب |
|---|---|
| تخفيض `file_size_limit` على مستوى Bucket | Supabase لا يسمح بتعديل `storage.buckets` عبر SQL. تم التعويض بفرض الحد في الواجهة. |
| إزالة `image/svg+xml` من Buckets الصور على مستوى الخادم | نفس السبب أعلاه. الواجهة تمنع `svg` عبر `BLOCKED_EXT`. |
| التحقق من Magic Bytes | غير عملي في المتصفح بدون قراءة كاملة للملف؛ Supabase يفرض MIME عند الرفع. مرشَّح لمرحلة لاحقة عبر Edge Function. |
| Audit Logs لكل رفع/تنزيل | الرفع يولّد `payment_receipts.INSERT` و `student_request_attachments.INSERT` التي تدخل عبر Triggers لـ `audit_logs` للأحداث المالية. تفصيل أحداث `signed_url_generated` مؤجَّل لتجنّب ضوضاء التدقيق. |

---

## 7) التوصيات لمرحلة Pilot

1. **تثبيت حدود الـ Bucket من لوحة Supabase**: 2 م.ب للصور العامة، 5 م.ب للسندات/المرفقات، 10 م.ب لـ PDF. (إجراء يدوي على Console).
2. **إزالة `image/svg+xml` من `allowed_mime_types`** يدوياً لنفس Buckets الصور العامة.
3. مراقبة `audit_logs` بحثاً عن أحداث `rate_limit_triggered` المرتبطة بحماية المرفقات.

---

## 8) خلاصة

- ✅ لا يمكن لأي مجهول إدراج (`list`) محتويات الـ Buckets العامة.
- ✅ Buckets الخاصة لا تُقرأ إلا بـ Signed URL مع RLS.
- ✅ تم سدّ رفع امتدادات تنفيذية + svg في الواجهة.
- ✅ حدود الحجم الأشد مفروضة في الواجهة برسائل عربية.
- ✅ لا path traversal، لا overwrite، لا كشف للأرقام الأكاديمية.
- ✅ لم يُحذف أي ملف، لم تتعطل أي صورة عامة، لم يتغيّر منطق الأعمال.

**جاهز للانتقال إلى `PILOT-LAUNCH-01`.**
