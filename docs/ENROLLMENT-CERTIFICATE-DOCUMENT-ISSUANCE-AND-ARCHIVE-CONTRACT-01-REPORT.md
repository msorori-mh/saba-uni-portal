# ENROLLMENT-CERTIFICATE-DOCUMENT-ISSUANCE-AND-ARCHIVE-CONTRACT-01

## القرار

`HOLD_ENROLLMENT_CERTIFICATE_PDF_GENERATION_CONTRACT_MISSING`

**تحديث لاحق (PDF-STORAGE-GENERATOR-01):**

`HOLD_APPROVED_ARABIC_FONT_ASSET_REQUIRED`

(+ ثانوي: `HOLD_PDF_RUNTIME_COMPATIBILITY_NOT_PROVEN`)

انظر: `docs/ENROLLMENT-CERTIFICATE-PDF-STORAGE-GENERATOR-01-REPORT.md`

---

## 1. القرار (Executive)

المسار المطلوب (`registrar_signature → dean_signature → document_issuance → archive → completed`) جاهز على مستوى **العقد والربط والمخطط وRPCs المتخصصة**، لكن **لا يوجد مولّد PDF/Storage خادم قابل لإعادة الاستخدام** في المستودع.

إنشاء صف في `official_documents` وحده **لا يُعد إصداراً كاملاً** وفق G4. لذلك لا يمكن إصدار قرار `PASS_READY_FOR_MIGRATION_REVIEW_AND_SEQUENTIAL_PRODUCTION_APPLY`.

---

## 2. G0 — تدقيق البنية (ملخص)

| عنصر | الحالة |
|------|--------|
| `official_documents` | موجود؛ statuses: draft/issued/cancelled؛ **بدون** `student_request_id` سابقاً |
| `official_transcript_request_details` | نمط Typed details موجود للسجل فقط |
| تفاصيل شهادة قيد | **لم تكن موجودة** |
| `act_on_student_request_step` | remediation (PR #124) يضيف `sign→signed` وHOLD لإصدار/أرشفة |
| `generate_document_number` / `generate_verification_code` | موجودان |
| مولّد PDF/Storage للوثائق الرسمية | **غير موجود** (لا bucket رسمي؛ لا jspdf/puppeteer/pdf-lib) |
| عرض الوثيقة | HTML/`/document-view` + طباعة المتصفح فقط |
| `/verify-document` | موجود عبر `verify_document` (كان بلا اسم طالب/رقم أكاديمي) |

---

## 3. الملفات المعدّلة / الجديدة

| ملف | دور |
|-----|-----|
| `supabase/migrations/20260713210000_enrollment_certificate_document_issuance_and_archive_contract_01.sql` | **جديد** — schema + RPCs + verify |
| `src/lib/student-requests/enrollment-certificate-document-issuance-archive-contract.ts` | **جديد** — سياسة FAIL-CLOSED |
| `src/lib/student-requests/post-zero-fee-execution-contract.ts` | بوابات issue/archive → PDF HOLD |
| `src/lib/student-requests/request-document-archive-contract.ts` | رسالة واجهة شهادة القيد |
| `src/components/student-requests/RequestDocumentArchivePanel.tsx` | Fail-closed + رسالة HOLD |
| `src/routes/verify-document.tsx` | عرض اسم الطالب + الرقم الأكاديمي |
| `tests/student-requests/enrollment-certificate-document-issuance-and-archive-contract-01.test.ts` | **جديد** |
| `tests/student-requests/enrollment-certificate-post-zero-fee-execution-contract.test.ts` | مواءمة أكواد HOLD |
| `docs/ENROLLMENT-CERTIFICATE-DOCUMENT-ISSUANCE-AND-ARCHIVE-CONTRACT-01-REPORT.md` | هذا التقرير |

---

## 4. ما تم تجهيزه في المخطط (للمراجعة — غير مطبَّق)

### G1 — الربط
- `official_documents.student_request_id` → FK nullable
- فهرس + **Unique جزئي**: وثيقة فعّالة واحدة لكل طلب (`status <> cancelled`)
- لا Backfill للبيانات القديمة

### G2 — تفاصيل شهادة القيد
جدول `enrollment_certificate_document_details` بلقطة إصدار كاملة (اسم، رقم أكاديمي، قسم، برنامج، عام، فصل، مستوى، حالة قيد، …).

### G3 — التوقيع
- امتداد CHECK لـ `decision` / `event_type` لتشمل `signed` / `issued` / `archived`
- مسار `sign → signed` يبقى من remediation السابق داخل `act_on`

### G4 / G6 — إصدار وأرشفة
RPCs:
- `issue_enrollment_certificate_from_workflow_step`
- `archive_enrollment_certificate_from_workflow_step`

تتحقق من: خطوة نشطة، توقيعان، رسوم settled، لقطة كاملة، عدم التكرار، ثم تستدعي:

`assert_enrollment_certificate_pdf_generation_ready()` → **RAISE** `HOLD_ENROLLMENT_CERTIFICATE_PDF_GENERATION_CONTRACT_MISSING`

قبل أي INSERT/UPDATE إلى issued.

### G5 — التحقق
`verify_document` يعيد: valid, document_number, document_type, student_name_ar, academic_number, issued_at, status (يفضّل اللقطة عند وجودها).

### G7 — الأمان
- `auth.uid()` إلزامي
- REVOKE من PUBLIC/anon
- Unique يمنع وثيقتين للطلب
- طلبات cancelled/rejected/completed تُرفض
- Fail قبل mutate عند غياب Transition / PDF

### G8 — الواجهة
أزرار التنفيذ لشهادة القيد **تبقى معطّلة** (Fail-closed) مع رسالة PDF HOLD صريحة.

---

## 5. لماذا ليس PASS

| متطلب G4 | واقع |
|---------|------|
| إنشاء الملف الفعلي عبر مولّد قائم قابل لإعادة الاستخدام | **لا يوجد** |
| اعتبار صف `official_documents` إصداراً كاملاً | **ممنوع صراحة** |

المطلوب قبل PASS لاحقاً:
1. مولّد PDF/Storage خادم رسمي للوثائق (bucket + دالة قابلة للاستدعاء من RPC).
2. استبدال `assert_enrollment_certificate_pdf_generation_ready` بالتنفيذ الحقيقي.
3. مراجعة Migration ثم تطبيق تسلسلي على بيئة آمنة (لا production من هذه المرحلة).

---

## 6. نتائج الاختبارات / Build

| فحص | نتيجة |
|-----|--------|
| اختبارات العقد الجديد | **21 pass / 0 fail** |
| اختبارات post-zero-fee | **23 pass / 0 fail** |
| المجموع | **44 pass / 0 fail** |
| `tsc --noEmit` | **PASS** (exit 0) |
| `build` | **PASS** (exit 0) |

---

## 7. تأكيدات نطاق

- ❌ لا تطبيق Migration
- ❌ لا Production DB writes
- ❌ لا Deploy / Publish
- ❌ لا مسّ الطلب `93807768-a281-42de-bfb4-0c0c03786b20`
- ❌ لا Cleanup / Reset / حذف بيانات
- ❌ لا دمج PR #124

---

## 8. Git

Commits على فرع PR #124:

`fix/enrollment-certificate-post-zero-fee-execution-contract-01`

| SHA | الرسالة |
|-----|---------|
| `ae79ff6` | remediation (HOLD issuance سابقاً) |
| `d6a00ce` | إعداد عقد الإصدار/الأرشفة (PDF HOLD) |
| `a455e35` | إزالة DROP POLICY لتوافق فحص CI |

PR: https://github.com/msorori-mh/saba-uni-portal/pull/124  
**لم يُدمج.**
