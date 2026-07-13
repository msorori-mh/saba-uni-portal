# ENROLLMENT-CERTIFICATE-PDF-STORAGE-GENERATOR-01

## القرار

`HOLD_APPROVED_ARABIC_FONT_ASSET_REQUIRED`

قرار ثانوي مثبت أيضاً:

`HOLD_PDF_RUNTIME_COMPATIBILITY_NOT_PROVEN`

---

## 1. Executive

طُلب مولّد PDF خادمي + Storage خاص + عقد Prepare/Finalize/Failure.

توقّف التنفيذ عند بوابات G0/G1 الإلزامية:

1. **لا يوجد ملف خط عربي معتمد** (`.ttf` / `.otf` + ترخيص OFL أو ما يعادله) داخل المستودع للتضمين في PDF.
2. خطوط الواجهة (`Cairo` / `Tajawal`) تُحمَّل من **Google Fonts CDN** في `__root.tsx` — لا تصلح للتضمين الآمن في مولّد خادمي دون موافقة أصول وترخيص.
3. تعليمات المرحلة: **لا تضف خطاً عشوائياً** عند غياب خط معتمد → إيقاف.

بالتالي لم يُنفَّذ دمج مكتبة PDF، ولم يُرفع `assert_enrollment_certificate_pdf_generation_ready`، ولم تُفعَّل أزرار الإصدار.

---

## 2. G0 — تدقيق البيئة

| بند | النتيجة |
|-----|---------|
| Runtime الإنتاج | **TanStack Start → Nitro → Cloudflare Workers** (`src/server.ts`, `vite.config.ts`, تقارير Publish) |
| Chromium / Puppeteer | غير متوفر |
| Server Functions | `createServerFn` + `requireSupabaseAuth`؛ استخدام `Buffer` موجود لرفع ملفات |
| `supabaseAdmin` | `src/integrations/supabase/client.server.ts` — خادم فقط |
| Edge Functions | **لا يوجد** `supabase/functions/*` |
| Buckets الخاصة الحالية | `student-request-attachments`, `payment-receipts`, `council-topic-attachments`, … |
| Bucket `official-documents` | **غير موجود** |
| شعار الكلية | موجود: `src/assets/college-logo.jpg` |
| شعار الجامعة | مؤشر R2 فقط: `university-logo.jpeg.asset.json` — **لا بايتات محلية** |
| مكتبات PDF في package.json | **لا** (`qrcode` فقط) |

### اختيار Runtime (مخطَّط لاحقاً بعد فك HOLD)

| خيار | الحكم |
|------|-------|
| Edge Function + محرك عربي | غير موجود اليوم؛ يحتاج قناة نشر جديدة |
| **Nitro/Worker + pdf-lib + fontkit** | الأنسب *بعد* توفر خط + PoC عربي ناجح |
| Client / window.print | **ممنوع** بنص المهمة |

---

## 3. G1 — بوابة الخط

| فحص | نتيجة |
|-----|--------|
| عدد `.ttf/.otf/.woff` تحت `src`/`public`/`assets` | **0** |
| ترخيص مجاور للخط | لا يوجد |
| تضمين من CDN وقت الإصدار | **ممنوع** (متطلبات المرحلة + عدم الاعتماد على الشبكة) |

**القرار:** `HOLD_APPROVED_ARABIC_FONT_ASSET_REQUIRED`

ما يلزم لفك القفل (مرحلة لاحقة بموافقة صريحة):

1. إضافة ملف خط عربي معتمد إلى المستودع (مثلاً Amiri أو Noto Naskh Arabic بترخيص OFL).
2. إرفاق `LICENSE`/`OFL.txt` بجانب الملف.
3. Spike محلي يثبت: نص عربي متصل + RTL + A4 + شعارات + QR في Runtime الهدف دون تحميل خطوط من الإنترنت وقت الإصدار.

---

## 4. ما لم يُنفَّذ عمداً (Fail-closed)

| بند | سبب |
|-----|-----|
| إضافة pdf-lib / توليد PDF | بلا خط معتمد = مخرجات عربية غير مقبولة أو خط عشوائي |
| Bucket `official-documents` Migration | تُجهَّز مع المولّد الحقيقي؛ لا تطبيق جزئي مضلِّل |
| Prepare/Finalize/Failure RPCs كاملة | تعتمد على نجاح الملف؛ التصميم موثَّق أدناه للمرحلة التالية |
| تفعيل زر الإصدار للموظفين | `canExecuteStaffIssue = false` |
| رفع PDF أو Signed URL | لا ملف حقيقي |
| إزالة `assert_enrollment_certificate_pdf_generation_ready` | تبقى قائمة حتى فك القفل |

---

## 5. التصميم المخطَّط بعد فك HOLDs (مرجع فقط)

### Saga من مرحلتين

1. `prepare_enrollment_certificate_document_generation` — Transaction: تحقق + وثيقة `generating` + snapshot + path حتمي + token؛ **لا** إكمال Runtime.
2. Server generator — PDF bytes + SHA-256 + رفع خاص `upsert=false`.
3. `finalize_enrollment_certificate_document_generation` — تحقق object/MIME/size/SHA → `issued` → انتقال `document_issuance → archive`.
4. `fail_enrollment_certificate_document_generation` — يبقي الخطوة نشطة، ينظّف object جزئي، لا يصدر `issued`.

المسار المخطَّط:

`enrollment-certificates/{request_id}/{official_document_id}.pdf`

Bucket مخطَّط: `official-documents` (`public=false`, PDF only).

---

## 6. الملفات في هذه المرحلة

| ملف | دور |
|-----|-----|
| `src/lib/student-requests/enrollment-certificate-pdf-storage-generator-contract.ts` | سياسة FAIL-CLOSED + قرارات HOLD |
| `tests/student-requests/enrollment-certificate-pdf-storage-generator-01.test.ts` | إثبات البوابات وغياب الخط/المكتبة |
| `docs/ENROLLMENT-CERTIFICATE-PDF-STORAGE-GENERATOR-01-REPORT.md` | هذا التقرير |
| `docs/ENROLLMENT-CERTIFICATE-DOCUMENT-ISSUANCE-AND-ARCHIVE-CONTRACT-01-REPORT.md` | تحديث سلسلة القرار |

---

## 7. نتائج الاختبارات

| فحص | نتيجة |
|-----|--------|
| اختبارات المرحلة + عقود سابقة ذات صلة | **54 pass / 0 fail** |
| `tsc --noEmit` | **PASS** |
| `build` | **PASS** |
| Migration apply | **لم يُنفَّذ** |
| Deploy / Publish | **لم يُنفَّذ** |
| Production DB writes | **لم تُنفَّذ** |
| الطلب التجريبي `93807768-…` | **لم يُمس** |

---

## 8. توصية المرحلة التالية (بعد موافقة أصول)

1. اعتماد خط عربي رسمي + ترخيص داخل المستودع.
2. Spike `pdf-lib`+`fontkit` على Worker (أو Edge) يثبت G1 بنود 1–10.
3. عند نجاح الـ Spike فقط: تنفيذ Bucket + Prepare/Finalize/Failure + المولّد + UI + اختبارات بصرية بـFixtures وهمية.

---

## 9. Git / PR

يُرفع إلى فرع:

`fix/enrollment-certificate-post-zero-fee-execution-contract-01`

PR #124 — **لا دمج**.
