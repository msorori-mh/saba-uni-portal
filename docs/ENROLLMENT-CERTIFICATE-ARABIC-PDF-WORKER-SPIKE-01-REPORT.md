# ENROLLMENT-CERTIFICATE-ARABIC-PDF-WORKER-SPIKE-01

## القرار النهائي

`PASS_ARABIC_PDF_WORKER_SPIKE_READY_FOR_STORAGE_SAGA_IMPLEMENTATION`

---

## 1. Executive

Spike معزول لإثبات توليد PDF عربي على Cloudflare Workers باستخدام خط Cairo المرخّص محلياً.

| قيد المرحلة | الالتزام |
|-------------|---------|
| لا Migration apply | ملتزَم |
| لا Production DB / Storage writes | ملتزَم |
| لا Prepare/Finalize تنفيذية | ملتزَم |
| لا تفعيل زر الإصدار | ملتزَم |
| لا إزالة `assert_enrollment_certificate_pdf_generation_ready` | ملتزَم |
| لا Deploy / Publish / دمج PR | ملتزَم |
| لا مسّ الطلب `93807768-…` | ملتزَم |

---

## 2. G0 — Runtime

| بند | النتيجة |
|-----|---------|
| الهدف | **TanStack Start → Nitro → Cloudflare Workers** (`vite.config.ts` nitro/cloudflare، `src/server.ts`) |
| Chromium / Puppeteer / Canvas / DOM | **غير متوفرة**؛ لا تُستخدم في التوليد |
| ArrayBuffer | مدعوم (Data modules لـ TTF/JPG) |
| Web Crypto | متوفر في Workers (`crypto.subtle`) — غير مطلوب لهذا الـ Spike |
| تضمين TTF | استيراد كـ **Data module** (`[[rules]] type = "Data"` في Wrangler) ثم تمرير `Uint8Array` للمولّد |
| Bundle بعد الخط | **Total Upload ≈ 2924 KiB / gzip ≈ 949 KiB** (`wrangler deploy --dry-run`) — ضمن حد Workers الاعتيادي (~3 MiB gzip مجاني) |
| توافق PDF | **pdf-lib + @pdf-lib/fontkit** يعمل داخل Wrangler/Miniflare |

تقدير قبل/بعد الخط (~599 KiB خام):

| | تقريبي |
|--|--------|
| قبل تضمين Cairo | ~2325 KiB upload / gzip أقل من 949 |
| بعد Cairo | **2924.31 KiB / gzip 949.32 KiB** |

القرار على الحجم: **مقبول** (لا `HOLD_PDF_FONT_BUNDLE_SIZE_UNACCEPTABLE`).

---

## 3. الخط (معتمد)

| حقل | قيمة |
|-----|------|
| العائلة | **Cairo** |
| المصدر | [google/fonts](https://github.com/google/fonts) `ofl/cairo/` |
| الأصلي | `ofl/cairo/Cairo[slnt,wght].ttf` |
| المضمَّن | `src/assets/fonts/cairo/Cairo-Variable.ttf` (إعادة تسمية ملف فقط؛ البايتات بلا تعديل) |
| الترخيص | **OFL-1.1** (`OFL.txt`) |
| SHA-256 | `667C987182391C91F4E57A2F455B1794FB5E3EE6CA4EF3383E86BB690FA9C964` |
| الأوزان | الهدف 400 نص / 700 عناوين؛ **pdf-lib لا يختار محور `wght` بصورة موثوقة** → العناوين بـ **حجم أكبر** كتمييز بصري |
| CDN وقت التوليد | **ممنوع** — البايتات محلية فقط |

---

## 4. المولّد (Spike)

| بند | قيمة |
|-----|------|
| المسار | `src/lib/documents/arabic-pdf-worker-spike.ts` |
| محرك PDF | `pdf-lib` + `@pdf-lib/fontkit` |
| تشكيل العربية | **`fontkit.layout` (OpenType GSUB)** عبر `CustomFontEmbedder.encodeText` — **بدون** Presentation-Forms reshape السطحي (تجربة reshape فشلت بصرياً مع Cairo) |
| BiDi | `bidi-js` لتقسيم المقاطع؛ القيم LTR (أرقام / أكواد) تُرسم منفصلة عن التسميات العربية |
| QR | `qrcode.create` → رسم مربعات في PDF (**بدون Canvas**) |
| الشعار | `src/assets/college-logo.jpg` بايتات محلية |
| بيانات | وهمية فقط (`طالب الاختبار` / `TEST-2026-001` / …) |
| Worker تجريبي | `tools/arabic-pdf-worker-spike/` + `wrangler.toml` |

---

## 5. النتائج البصرية (محلية، غير ملتزمة)

| فحص | نتيجة |
|-----|--------|
| اتصال الحروف العربية | **PASS** |
| RTL للتسميات والفقرات | **PASS** |
| ترتيب الأرقام / `TEST-2026-001` / `2025-2026` | **PASS** (مقاطع LTR منفصلة) |
| نص مختلط AR/EN | **PASS** |
| تداخل النص | لا |
| وضوح الخط | جيد |
| QR | مضمَّن كأشعة متجهة |
| الشعار | مضمَّن |
| الصفحات | **1** (A4) |
| حجم PDF | **≈ 26 KB** (بعد subset) |

ملف المعاينة (gitignored): `.tmp/enrollment-certificate-arabic-pdf-worker-spike.pdf` — **لم يُرفع إلى GitHub**.

---

## 6. G4 — Worker

| فحص | نتيجة |
|-----|--------|
| Runtime | `wrangler dev --local` (Miniflare/workerd) |
| اختبار | `tests/documents/enrollment-certificate-arabic-pdf-worker-runtime.test.ts` |
| `%PDF` + غير فارغ | **PASS** |
| لا `fs` / `path` / DOM / Canvas / Chromium داخل handler | **PASS** |
| فشل سابق: `QRCode.toDataURL` → "You need to specify a canvas element" | أُصلِح برسم المصفوفة مباشرة |

---

## 7. الاختبارات الآلية

| مجموعة | نتيجة |
|--------|--------|
| `tests/documents/enrollment-certificate-arabic-pdf-worker-spike.test.ts` | **PASS** |
| `tests/documents/enrollment-certificate-arabic-pdf-worker-runtime.test.ts` | **PASS** |
| عقود Storage / Issuance / Post-zero-fee محدَّثة | **PASS** |
| Typecheck / Lint / Build | **PASS** (`tsc --noEmit`, scoped eslint، `bun run build`) |

تغطية G6: وجود الخط + OFL + SHA + لا CDN + Worker + `%PDF` + حجم + QR/شعار + لا DB/Storage/network + fixtures وهمية فقط.

---

## 8. ما تبقى للمجزّئ التالي (Storage Saga)

- إنشاء bucket `official-documents` (Migration + apply لاحقاً بموافقة).
- Prepare / Finalize / Failure RPCs.
- رفع `assert_enrollment_certificate_pdf_generation_ready` بعد العقد الحقيقي.
- تفعيل زر الإصدار للموظفين.
- محاذاة أوزان Cairo 400/700 إن لزم عبر مثيلات ثابتة أو محور `wght`.

**حالة الإصدار الحالية:** `HOLD_PDF_STORAGE_SAGA_NOT_IMPLEMENTED` (fail-closed).

---

## 9. Git / PR

فرع: `fix/enrollment-certificate-post-zero-fee-execution-contract-01`  
PR: **#124** — تحديث الوصف فقط — **لا دمج**.
