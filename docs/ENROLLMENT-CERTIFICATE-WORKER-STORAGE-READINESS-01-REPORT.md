# ENROLLMENT-CERTIFICATE-WORKER-STORAGE-READINESS-01

## 1. القرار النهائي

`HOLD_ENROLLMENT_CERTIFICATE_WORKER_STORAGE_MULTIPLE_READINESS_BLOCKERS`

الموانع الأربعة الموثقة أدناه (B1..B4) تمنع الانتقال إلى Controlled E2E.

## 2. البيئة

| بند | قيمة |
|-----|------|
| main HEAD المستخدم | `359caffb1f558ce3d933b4a5f0334ef6d0707016` (لاحق للأساس المطلوب `d9eccedb…` — تاريخه يتضمن G3 والتدقيق والمعالجة) |
| Lovable Project | `4b291119-790f-4484-9285-c2b774e1ba6f` |
| Supabase Production | `wpmicqriltrowwonknox` |
| وقت التدقيق | 2026-07-15 (Read-only) |
| تقارير مرجعية موجودة | G3 reapply, Post-apply audit, Remediation — جميعها بقرار PASS |

## 3. G0/G1 — الحالة الأساسية (PASS)

Read-only من الإنتاج:

| فحص | نتيجة |
|-----|--------|
| `official-documents` bucket | `public=false`, files=0, file_size_limit=NULL, allowed_mime_types=NULL |
| Policy `official_documents_deny_client_select` | `RESTRICTIVE`, SELECT, roles=`{anon,authenticated}`, `USING (bucket_id <> 'official-documents')` — مطابقة للمعالجة |
| ACL على `_ec_new_verification_token()` و `_ec_sha256_hex(text)` | لا صلاحيات لـ anon/authenticated/PUBLIC (revoked) |
| الطلب التجريبي `93807768-…` | `status=in_review`, `updated_at=2026-07-13 17:59:19.782271+00`, official_documents=0, generation_attempts=0 |

الأساس مطابق للتقارير السابقة.

## 4. G2 — جرد مكونات Worker (تصنيف: B — جزئي)

**موجود في GitHub:**

- `src/lib/student-requests/enrollment-certificate-pdf-storage-saga.functions.ts` — TanStack server function `executeEnrollmentCertificatePdfStorageSaga` + `getEnrollmentCertificateDocumentSignedUrl` (session-authed via `requireSupabaseAuth`, admin-client used فقط للـstorage).
- `src/lib/documents/enrollment-certificate-pdf.ts` — production PDF builder wrapper.
- `src/lib/documents/arabic-pdf-worker-spike.ts` — محرك pdf-lib + fontkit + bidi-js (تم إثباته في spike).
- `src/lib/student-requests/enrollment-certificate-pdf-storage-generator-contract.ts` — عقد المسار/الصلاحية.
- `src/assets/fonts/cairo/Cairo-Variable.ttf` (+ OFL) — الخط مضمن.
- `src/assets/college-logo.jpg` — الشعار.
- `tools/arabic-pdf-worker-spike/` — Worker تجريبي منفصل (spike فقط، ليس مسار الإنتاج).

**غير موجود:**

- لا `supabase/functions/*` مرتبطة بشهادة القيد → لا Edge Function.
- لا أي مستدعي (`useServerFn(executeEnrollmentCertificatePdfStorageSaga)`) في أي مكوّن UI / route / زر إداري: `rg` يعيد المرجع الوحيد داخل ملف التعريف نفسه — الزر في `document_issuance` غير موصول.
- لا Cron / Queue / Webhook / GitHub Action لتشغيل التوليد.

**التصنيف:** كود التوليد + عقد Saga موجودان في GitHub، لكن غير موصولين بواجهة الموظف وغير جاهزين للتشغيل على Runtime الإنتاج (تفصيل في G3 و G10).

## 5. G3 — Runtime توليد PDF

| بند | قيمة/ملاحظة |
|-----|-------------|
| Runtime الإنتاج | TanStack Start → Nitro → **Cloudflare Workers** (`vite.config.ts` nitro/cloudflare) |
| مكتبة PDF | pdf-lib + @pdf-lib/fontkit + bidi-js + qrcode |
| العربية/RTL | مثبت في Spike (fontkit.layout + bidi runs) — PASS في `tests/documents/enrollment-certificate-arabic-pdf-worker-runtime.test.ts` (wrangler dev) |
| Puppeteer/Canvas/Chromium | لا يُستخدم — متوافق مع Workers |

### 🔴 B1 — `HOLD_ENROLLMENT_CERTIFICATE_PDF_RUNTIME_NOT_READY`

`src/lib/documents/enrollment-certificate-pdf.ts` يستخدم:

```ts
import { readFileSync } from "node:fs";
const ROOT = process.cwd();
return new Uint8Array(readFileSync(join(ROOT, "src/assets/fonts/cairo/Cairo-Variable.ttf")));
```

هذا **لن يعمل** على Cloudflare Workers Runtime — لا نظام ملفات حقيقي ولا `process.cwd()` يحوي مصادر المشروع بعد التحزيم. المرجع (`server-runtime`) يمنع الاعتماد على مسارات ملفات عشوائية. Spike الذي نجح استخدم **Data-module imports** (`import fontBytes from "…/Cairo-Variable.ttf"` مع `[[rules]] type = "Data"` في `wrangler.toml`)، لا `fs`.

**الإصلاح المطلوب (في مرحلة IMPLEMENTATION لاحقة، ليس الآن):**
- استيراد الخط والشعار كـData modules أو كـURL assets (Vite `?arraybuffer`) بحيث يُحزَّم داخل bundle الـWorker.
- إزالة `readFileSync`/`process.cwd()` من مسار Worker.
- التحقق من أن حجم bundle بعد الخط ~950 KiB gzip يبقى ضمن حد Worker (spike أثبته).

## 6. G4 — عقد Saga

`executeEnrollmentCertificatePdfStorageSaga` (سطور 45–212) يتّبع التسلسل الصحيح:

`prepare → mark_generating → build (in-memory) → SHA-256 + byteLength (حقيقيان من `built`) → upload(upsert:false) → mark_uploaded → finalize`

مع مسارات:
- Idempotent: إذا `prepared.status='finalized'` يعود بلا رفع.
- Recovery: إذا `uploaded` بدون finalize → finalize فقط.
- على فشل الرفع يفحص list قبل الاعتراف (لتفادي false-negative)، ثم `fail_…` مع `error_code=UPLOAD_FAILED`.
- على أي استثناء آخر: `fail_…` best-effort ثم rethrow.
- لا كتابة مباشرة على `official_documents` أو `enrollment_certificate_document_details` أو Workflow — كلها عبر RPCs.
- المسار من `prepared.storage_path` (وليس مدخل عميل).
- `verificationToken` من prepare (لا يولّده Worker).
- لا public URL — القراءة عبر signed URL (180 ثانية) في `getEnrollmentCertificateDocumentSignedUrl`.
- `documentNumber` أثناء التوليد: `PENDING-<attempt8>` (الرقم النهائي يصدر من `finalize`).

**تحفظ (لا يحجب E2E):** لا حد لحجم PDF ولا SHA يُتحقق منه بعد rehash المولّد — سطر واحد قد يُضاف لاحقًا.

**النتيجة:** عقد Saga مطابق لمواصفة G3 — لا مانع هنا.

## 7. G5 — هوية Worker واستدعاء RPC

النموذج: **جلسة موظف مخوّل حقيقية** — `.middleware([requireSupabaseAuth])` ثم استدعاء RPCs عبر `context.supabase` (JWT الموظف). `supabaseAdmin` (service_role) يُستخدم **فقط** لعمليات Storage والقراءة السريعة للأدوار — لا يتجاوز `can_current_user_act_on_step`.

- `auth.uid()` سيكون UUID الموظف الحقيقي.
- تدقيق RPCs يبقى فعّالاً (تحقق `can_current_user_act_on_step(..., 'issue_document')`).
- لا كلمة مرور / لا service-role مكشوف للعميل.
- لا يستطيع طالب تشغيل السّاجا (سيسقط عند `prepare` بسبب فشل تدقيق الخطوة).

### 🟠 B2 — تحفظ على middleware attach

`.middleware([requireSupabaseAuth])` يتطلب أن يُسجَّل client-side `functionMiddleware` في `src/start.ts` يلحق `Authorization: Bearer …`. لم يُتحقق من ذلك ضمن هذا التدقيق (خارج نطاق read-only للـsaga file). يجب التأكد في مرحلة IMPLEMENTATION من وجود `attachSupabaseAuth` أو المكافئ في `src/start.ts` وإلا كل استدعاء يفشل بـ `Unauthorized`.

**النتيجة:** نموذج الهوية صالح **مبدئياً**؛ يحتاج تأكيد `start.ts` قبل E2E.

## 8. G6 — Secrets

| Secret | مطلوب | موجود | Server-only | مصدر الاستخدام | مخاطرة كشف |
|--------|-------|-------|-------------|----------------|-------------|
| `SUPABASE_URL` | نعم | نعم (يُحقن تلقائياً من Lovable Cloud) | نعم | `supabaseAdmin` | لا |
| `SUPABASE_SERVICE_ROLE_KEY` | نعم (للـStorage upload) | نعم (يُحقن تلقائياً؛ عبر `client.server.ts`) | نعم — يُستورد dynamic داخل handler فقط | Storage upload/signed URL | لا (مضمون بـimport-protection على `*.server.ts`) |
| `SITE_URL` أو `VITE_PUBLIC_APP_URL` | نعم (لبناء `verify-document?code=…` داخل QR) | **لا** — `fetch_secrets` أعاد فقط `LOVABLE_API_KEY` و `RESEND_API_KEY` | يجب أن يكون `SITE_URL` (server-only) — الاسم الحالي `VITE_PUBLIC_APP_URL` يبدأ بـ`VITE_` وسيُسرَّب للـclient bundle | `publicAppOrigin()` في saga | إن أُضيف بـ`VITE_` يصبح public (لا سرّ فعلي لكنه ضد الاتفاقية) |
| Signing secret / خط / إعداد PDF | لا | — | — | مضمّن كأصل ثابت | — |

### 🔴 B3 — `HOLD_ENROLLMENT_CERTIFICATE_WORKER_SECRETS_NOT_READY`

- `SITE_URL` غير مُضاف كسر مشروع → `publicAppOrigin()` يسقط إلى `https://example.invalid` وينتهي داخل QR وverification link.
- استخدام اسم `VITE_PUBLIC_APP_URL` في server-only saga يخالف قاعدة الفصل (يجب `SITE_URL` أو قراءة `import.meta.env.VITE_…` فقط في الـclient). الأفضل: تحويل الكود إلى `SITE_URL` فقط ثم إضافة القيمة `https://quboolye.com` عبر `add_secret` قبل E2E.

## 9. G7 — Storage upload

| بند | نتيجة |
|-----|--------|
| Server-side فقط | نعم (`supabaseAdmin` داخل handler) |
| هوية الرفع | service_role — مناسبة لأن bucket خاص وجميع سياسات العميل تمنع الوصول |
| MIME | ثابت `application/pdf` — لا مدخل مستخدم |
| المسار | من `prepared.storage_path` فقط — لا path traversal |
| `upsert:false` | نعم — يمنع overwrite |
| فحص وجود بعد فشل | نعم عبر `list({search:fileName})` قبل fail |
| Public URL | لا يُستخدم — `createSignedUrl(path, 180)` |
| Client SELECT/INSERT/DELETE | مرفوض بالسياسات (RESTRICTIVE deny + لا policy تسمح) |

### 🟠 B4 — `HOLD_ENROLLMENT_CERTIFICATE_STORAGE_UPLOAD_CONTRACT_NOT_READY` (خفيف)

- `file_size_limit` = NULL و `allowed_mime_types` = NULL على bucket `official-documents`. لا يمنع الرفع لكنه يُضعف الدفاع في العمق. يُنصح قبل E2E:
  - `file_size_limit` = 2 MiB (PDF شهادة قيد ~26 KB — margin واسع).
  - `allowed_mime_types` = `{application/pdf}`.
- (يُنفَّذ في مرحلة IMPLEMENTATION عبر Migration بموافقة — ليس الآن.)

## 10. G8 — قالب المحتوى

- الحقول تُقرأ من `snapshot` الصادر من `prepare` — لا بيانات من العميل.
- الحقول المتاحة في `EnrollmentCertificateSnapshot`: `student_name_ar, academic_number, department_name_ar, program_name_ar, academic_year_name, semester_name, level_name`.
- الشعار + العائلة العربية + BiDi + QR verify → موجودة في spike engine.
- `documentNumber` النهائي والتاريخ الرسمي يصدران من `finalize` (لا يُخترعان في Worker).
- `verify-document` route موجود لعرض التحقق العام (لا يعرض PII محذوفة).
- لا قالب توقيع/ختم رسمي مُصادق — تحفظ صغير لا يحجب E2E المضبوط.

**النتيجة:** القالب جاهز وظيفياً بمستوى spike؛ يمكن تحسينه لاحقًا.

## 11. G9 — الموثوقية

| بند | حالة |
|-----|-----|
| Idempotency على `prepare` | نعم (idempotencyKey مدخل مطلوب 8–120) |
| منع تكرار وثيقة | نعم عبر `upsert:false` + finalize RPC |
| Recovery uploaded→finalized | نعم |
| Retry محدود | لا آلية backoff — يعتمد على إعادة استدعاء يدوية من الموظف |
| Timeout | لا timeout صريح داخل handler |
| Logging PII/Secrets | لا يوجد `console.log` لـtoken أو snapshot |
| تنظيف مؤقت | لا ملفات مؤقتة (in-memory Uint8Array) |
| منع تشغيل متوازي | يعتمد على قفل RPC في DB (idempotency key + attempt uniqueness) |
| حد حجم PDF | غير مفروض داخل التطبيق |
| SHA-256 حقيقي | نعم من `built.sha256` (crypto.createHash) |

مقبول للـE2E المضبوط بعد رفع B1/B3.

## 12. G10 — النشر

- الكود موجود في GitHub بالكامل ضمن `main` (بعد PR #124 + G3 fix + remediation).
- لا Edge Function → لا "publish edge function" منفصل.
- Server function جزء من bundle الـWorker الرئيسي → تنشر مع Publish العام للتطبيق.
- **لم يُنفَّذ Publish/Deploy في هذه المرحلة.**
- لا drift يمكن قياسه بين GitHub و "published" لأن الـsaga لم توصل بـUI ولا يوجد إصدار منتج فعلياً يستدعيها.

## 13. G11 — إعادة التحقق (لا Mutation)

بعد التدقيق (Read-only فقط): bucket لا يزال `public=false, files=0`. الطلب `93807768-…` بلا تغيير (`updated_at` ثابت `2026-07-13 17:59:19.782271+00`). لا generation attempt جديد. لا Publish/Deploy. لا secret أُضيف/عُدّل. لا Migration.

## 14. جدول الموانع

| # | مانع | خطورة | يحجب E2E |
|---|------|-------|----------|
| B1 | `enrollment-certificate-pdf.ts` يستخدم `readFileSync(process.cwd()…)` — لا يعمل على Workers | 🔴 حرِج | نعم |
| B2 | لم يُتحقق من `attachSupabaseAuth` في `src/start.ts` | 🟠 متوسط | نعم حتى التأكيد |
| B3 | `SITE_URL` غير موجود؛ الكود يستخدم اسمًا بادئته `VITE_` | 🔴 مهم | نعم (verify URL معطوب) |
| B4 | bucket بلا `file_size_limit`/`allowed_mime_types` | 🟠 منخفض | لا (defence-in-depth) |
| B5 | زر/مستدعي `document_issuance` غير موصول بـsaga في الـUI | 🟠 متوسط | نعم (لا مدخل تشغيل) |

## 15. نسب الجاهزية

| محور | نسبة |
|------|-----|
| G3 code fix | 100% |
| G3 runtime apply | 100% |
| G3 post-apply security | 100% |
| Worker implementation (code presence) | 80% (موجود لكن Runtime-broken + غير موصول UI) |
| PDF runtime/template | 60% (spike يعمل، production wrapper يعتمد fs) |
| Storage upload contract | 85% |
| Worker auth caller contract | 90% (بشرط تأكيد start.ts) |
| Worker deployment | 0% (لا publish منذ الدمج) |
| Enrollment certificate E2E | 0% |
| **Overall final launch readiness** | **~40%** |

## 16. التوصية للمرحلة التالية

المرحلة القادمة يجب أن تكون:

`ENROLLMENT_CERTIFICATE_WORKER_STORAGE_IMPLEMENTATION_01`

بنطاق محدود لرفع B1 + B3 + B5 (و اختيارياً B4 عبر migration + B2 عبر مراجعة `start.ts`) — **ثم** الانتقال إلى `ENROLLMENT_CERTIFICATE_CONTROLLED_E2E_EXECUTION_01`.

## 17. المراحل المتبقية حتى الإطلاق

1. Worker/Storage IMPLEMENTATION (رفع B1/B3/B5 + B4 اختياري).
2. Controlled E2E لشهادة القيد على طلب اختبار مخصص (ليس التجريبي المحظور).
3. اعتماد شهادة القيد.
4. الأساس المشترك للخدمات الطلابية الثماني.
5. النماذج والـWorkflows لبقية الخدمات.
6. E2E لكل خدمة + تفعيل تدريجي.
7. نقل ميزة المواد التعليمية إلى GitHub + دمج.
8. تدقيق أمن/بيانات/واجهات نهائي.
9. Publish/Deploy نهائي واحد.
10. اختبار ما بعد الإطلاق والتسليم.

## 18. Publish/Deploy

`PUBLISH_DEPLOY_FORBIDDEN` — لم يُنفَّذ Publish ولا Deploy ولا تشغيل Worker ولا توليد PDF ولا رفع ملف ولا لمس الطلب التجريبي ضمن هذه المرحلة.
