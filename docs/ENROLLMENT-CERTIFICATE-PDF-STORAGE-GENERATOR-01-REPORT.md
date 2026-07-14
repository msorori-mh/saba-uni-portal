# ENROLLMENT-CERTIFICATE-PDF-STORAGE-GENERATOR-01

## القرار الحالي (بعد Spike العربية)

**سلسلة القرارات:**

1. ~~`HOLD_APPROVED_ARABIC_FONT_ASSET_REQUIRED`~~ — **أُزيل** بعد اعتماد Cairo محلياً.
2. ~~`HOLD_PDF_RUNTIME_COMPATIBILITY_NOT_PROVEN`~~ — **أُزيل** بعد نجاح Worker Spike.
3. **`PASS_ARABIC_PDF_WORKER_SPIKE_READY_FOR_STORAGE_SAGA_IMPLEMENTATION`** — انظر:
   `docs/ENROLLMENT-CERTIFICATE-ARABIC-PDF-WORKER-SPIKE-01-REPORT.md`
4. **بوابة الإنتاج المتبقية:** `HOLD_PDF_STORAGE_SAGA_NOT_IMPLEMENTED`  
   (لا Bucket / لا Prepare-Finalize / زر الإصدار مغلقاً / `assert_enrollment_certificate_pdf_generation_ready` ما زال).

---

## 1. Executive

مرحلة PDF-STORAGE الأصلية توقّفت على غياب خط معتمد + غياب PoC على Worker.

مرحلة **ARABIC-PDF-WORKER-SPIKE-01** فكّت هاتين البوابتين تقنياً وبصرياً على Wrangler، **دون** تنفيذ Saga التخزين.

الإصدار للموظفين يبقى fail-closed حتى تنفيذ المرحلة التالية صراحةً.

---

## 2. G0 — تدقيق البيئة (محدَّث)

| بند | النتيجة |
|-----|---------|
| Runtime الإنتاج | **TanStack Start → Nitro → Cloudflare Workers** |
| Chromium / Puppeteer | غير متوفر — لا يُستخدم |
| مكتبات PDF | `pdf-lib` + `@pdf-lib/fontkit` + `bidi-js` + `qrcode` |
| خط عربي معتمد | **Cairo** `src/assets/fonts/cairo/` + OFL-1.1 |
| SHA-256 | `667C987182391C91F4E57A2F455B1794FB5E3EE6CA4EF3383E86BB690FA9C964` |
| Bucket `official-documents` | **غير موجود بعد** |
| Edge Functions | لا يوجد `supabase/functions` |
| شعار الكلية | `src/assets/college-logo.jpg` |

---

## 3. بوابة الخط / Runtime

| بوابة | حالة |
|-------|------|
| خط + OFL محلي | **OK** |
| Spike عربي على Worker | **OK** (`fontkit.layout` + مقاطع BiDi) |
| Bundle gzip ≈ 949 KiB | **مقبول** |
| Storage Saga / Upload / Issue UI | **HOLD** — غير منفَّذ |

---

## 4. ما لم يُنفَّذ عمداً (Fail-closed)

| بند | سبب |
|-----|-----|
| Bucket `official-documents` Migration apply | خارج نطاق الـ Spike |
| Prepare/Finalize/Failure RPCs كاملة | بعد نجاح الـ Spike فقط وبموافقة لاحقة |
| تفعيل زر الإصدار | `canExecuteStaffIssue = false` |
| إزالة `assert_enrollment_certificate_pdf_generation_ready` | تبقى حتى العقد الحقيقي |
| Deploy / Publish / دمج PR | ممنوع |

---

## 5. التصميم المخطَّط بعد Storage Saga

1. `prepare_enrollment_certificate_document_generation`
2. Server generator (PDF bytes + SHA-256 + رفع خاص `upsert=false`)
3. `finalize_enrollment_certificate_document_generation`
4. `fail_enrollment_certificate_document_generation`

المسار المخطَّط: `enrollment-certificates/{request_id}/{official_document_id}.pdf`  
Bucket: `official-documents` (`public=false`).

محرك الإنتاج المقترح: نفس مسار الـ Spike (`pdf-lib` + Cairo المحلي + بدون Canvas لـ QR).

---

## 6. الملفات ذات الصلة

| ملف | دور |
|-----|-----|
| `src/assets/fonts/cairo/*` | Cairo + OFL + README |
| `src/lib/documents/arabic-pdf-worker-spike.ts` | مولّد Spike معزول |
| `tools/arabic-pdf-worker-spike/` | Worker Wrangler للتحقق |
| `src/lib/student-requests/enrollment-certificate-pdf-storage-generator-contract.ts` | FAIL-CLOSED + قرار Spike |
| `docs/ENROLLMENT-CERTIFICATE-ARABIC-PDF-WORKER-SPIKE-01-REPORT.md` | تقرير الـ Spike |
| `docs/ENROLLMENT-CERTIFICATE-PDF-STORAGE-GENERATOR-01-REPORT.md` | هذا التقرير |

---

## 7. نتائج الاختبارات (محدَّثة مع الـ Spike)

| فحص | نتيجة |
|-----|--------|
| اختبارات Spike (unit + Worker) | **PASS** |
| عقود Storage / Issuance / Post-zero-fee | **PASS** |
| Migration apply | **لم يُنفَّذ** |
| Deploy / Publish | **لم يُنفَّذ** |
| Production DB writes | **لم تُنفَّذ** |
| الطلب التجريبي `93807768-…` | **لم يُمس** |

---

## 8. توصية المرحلة التالية

تنفيذ **PDF Storage Saga** (bucket + Prepare/Finalize + المولّد الإنتاجي + اختبارات fixtures وهمية) ثم فقط بعد ذلك رفع `assert_…_pdf_generation_ready` وتفعيل زر الإصدار.

---

## 9. Git / PR

فرع: `fix/enrollment-certificate-post-zero-fee-execution-contract-01`  
PR #124 — **لا دمج**.
