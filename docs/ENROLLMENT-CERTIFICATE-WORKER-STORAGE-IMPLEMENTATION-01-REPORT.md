# ENROLLMENT-CERTIFICATE-WORKER-STORAGE-IMPLEMENTATION-01

## 1. القرار النهائي

`PASS_ENROLLMENT_CERTIFICATE_WORKER_STORAGE_IMPLEMENTATION_COMPLETED_NO_E2E_NO_PUBLISH_NO_DEPLOY`

## 2. البيئة

| بند | قيمة |
|-----|------|
| main HEAD الفعلي | `359caffb1f558ce3d933b4a5f0334ef6d0707016` (لاحق للأساس `8a40bf8c…` — يتضمنه في تاريخه) |
| Lovable Project | `4b291119-790f-4484-9285-c2b774e1ba6f` |
| Supabase Production | `wpmicqriltrowwonknox` |
| تاريخ التنفيذ | 2026-07-15 |
| Publish/Deploy | **لم يُنفَّذ** |

## 3. الملفات المعدلة / المضافة

| الملف | الحالة | الغرض |
|-------|--------|--------|
| `src/lib/documents/enrollment-certificate-pdf-assets.server.ts` | جديد | Server-only: خط Cairo + شعار الكلية مضمنَان base64 مع مفكِّك آمن (Buffer→atob fallback) |
| `src/lib/documents/enrollment-certificate-pdf.ts` | معدَّل | إزالة `node:fs` / `node:path` / `readFileSync` / `process.cwd()` — الآن يستورد بايتات الأصول من الوحدة `.server.ts` |
| `src/lib/student-requests/enrollment-certificate-pdf-storage-saga.functions.ts` | معدَّل | `resolvePublicAppOrigin` fail-closed يعتمد على `SITE_URL` فقط؛ إزالة `VITE_PUBLIC_APP_URL` وfallback `example.invalid` |
| `src/components/student-requests/EnrollmentCertificateIssueButton.tsx` | جديد | مكون UI محكوم بشروط لإطلاق `executeEnrollmentCertificatePdfStorageSaga` |
| `src/components/student-requests/StaffRequestDetailPanel.tsx` | معدَّل | تركيب الزر عند خطوة `document_issuance` النشطة فقط |
| `tests/documents/enrollment-certificate-worker-storage-implementation-01.test.ts` | جديد | 16 اختبار regression لـB1/B2/B3/B5 |
| Secret مضاف | `SITE_URL = https://quboolye.com` | Server-only via secrets API |

**بدون تعديل:** migrations, schema, RPC SQL, storage policies, bucket, workflows, roles, finance, feature flags, `src/start.ts` (لم يحتَج تغيير).

## 4. معالجة B1 — توافق Workers

### الآلية
- ملف `enrollment-certificate-pdf-assets.server.ts` يحمل بايتات الخط (~600 KB) والشعار (~13 KB) مضمَّنة base64 مباشرة داخل ثابتَي string. الاسم `.server.ts` يفعِّل import-protection ⇒ **لن يصل الكود للـclient bundle**.
- المفكِّك يفضِّل `Buffer.from(b64,'base64')` (متاح على Workers مع `nodejs_compat`) ويعود إلى `atob`+loop عند غيابه — يعمل عبر أي runtime.
- Cache داخل الوحدة (`cachedFont` / `cachedLogo`) يمنع إعادة الفك عند كل استدعاء.
- `enrollment-certificate-pdf.ts` يستدعي `getCairoFontBytes()` / `getCollegeLogoBytes()` بدل `readFileSync`.
- سبب اختيار base64 داخل `.server.ts` بدل Data-module: `@lovable.dev/vite-tanstack-config` لا يفعِّل arraybuffer/Data modules للـ`.ttf`/`.jpg` في مسار Vite/Nitro الإنتاجي (Spike استخدم `wrangler.toml [[rules]] type=Data` وهو منفصل). الاستيراد المباشر في Vite يعيد URL string فقط.

### إثبات إزالة الاعتماد على fs (اختبار آلي)
```
(pass) B1 — does not import node:fs or node:path or use process.cwd/readFileSync
```
تُفحص ثلاثة ملفات (`enrollment-certificate-pdf.ts`, `enrollment-certificate-pdf-assets.server.ts`, `enrollment-certificate-pdf-storage-saga.functions.ts`) ضد الأنماط: `from "node:fs"`, `from "node:path"`, `readFileSync`, `process.cwd(`. جميعها لا تُطابق.

### إثبات بناء PDF فعلي (بدون DB/Storage/Worker)
```
(pass) builds a valid PDF from fixture snapshot with correct SHA length  [168 ms]
```
توقيع `%PDF` صحيح، `byteLength > 5000`، SHA-256 من 64 hex، ومطابق لإعادة الحساب.

### Worker runtime test الموجود
`tests/documents/enrollment-certificate-arabic-pdf-worker-runtime.test.ts` (spike) لم يُعدَّل ولم يُشغَّل في هذه المرحلة (يحتاج `wrangler dev`). صلاحيته للـSpike engine الذي لم يتغيَّر.

## 5. معالجة B2 — attachSupabaseAuth

`src/start.ts` **موجود وصحيح** — لم يُعدَّل. الحالة:

```ts
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
```

- `requireSupabaseAuth` middleware في `enrollment-certificate-pdf-storage-saga.functions.ts` يستقبل الـBearer الملحق تلقائياً.
- لا service-role يُرسل من العميل (يُقرأ فقط داخل `client.server.ts`).
- لا كلمات مرور موظفين مخزّنة.
- `context.userId` = UUID الموظف الحقيقي المسجَّل.

**Regression assertion** يمنع حذف السطر مستقبلاً:
```
(pass) B2 — registers attachSupabaseAuth in functionMiddleware
```

**الحالة:** `RESOLVED_BY_VERIFICATION`.

## 6. معالجة B3 — SITE_URL Server-only

### تغييرات الكود
- `resolvePublicAppOrigin(env)` جديدة exported، تستهلك env كائناً للاختبار وتقرأ `process.env` افتراضياً.
- fail-closed:
  - `SITE_URL` مفقود / فارغ ⇒ Error عربي.
  - URL غير قابل للتحليل ⇒ Error.
  - بروتوكول غير `http`/`https` ⇒ Error.
  - `NODE_ENV=production` مع `http:` ⇒ Error.
- تُزيل trailing slash وتُعيد شكل origin.
- `publicAppOrigin()` الداخلية أصبحت مجرد wrapper يستدعي `resolvePublicAppOrigin()`.
- **حُذف:** `process.env.VITE_PUBLIC_APP_URL`، fallback `https://example.invalid`.

### إعداد المشروع
تم استخدام أداة Secrets الرسمية لتخزين:
- الاسم: `SITE_URL`
- القيمة: (server-only، لم تُطبع في السجلات)
- استجابة الأداة: "Saved the secret SITE_URL".

`fetch_secrets` لم تُستدعَ بعد الإضافة (لتفادي كشف قائمة/قيم أخرى). لم تُعدَّل ولم تُعرَض قيم: `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_URL` / `LOVABLE_API_KEY` / `RESEND_API_KEY`.

### إثبات (اختبارات آلية)
```
(pass) saga file does not reference VITE_PUBLIC_APP_URL or example.invalid
(pass) accepts valid https URL and strips trailing slash
(pass) throws when SITE_URL is missing
(pass) throws on invalid URL
(pass) throws on non-http(s) protocol
(pass) throws on http in production
```

- لم يُضف أي متغير VITE_ لمسار server.
- لا `vite.define` لـSITE_URL.

## 7. معالجة B5 — ربط واجهة document_issuance

### المكوّن الجديد
`src/components/student-requests/EnrollmentCertificateIssueButton.tsx`:
- Predicate خالص `shouldShowEnrollmentCertificateIssueButton(props)` يُطبِّق كل الشروط.
- Idempotency key ثابت: `enrollment-certificate:<requestId>:<stepId>:v1` (طول ~70 حرفاً، ضمن 8–120).
- تأكيد Confirm عربي قبل التنفيذ.
- `useServerFn(executeEnrollmentCertificatePdfStorageSaga)`.
- Pending state يعطِّل الزر ويمنع double-click.
- `queryClient.invalidateQueries` لثلاثة مفاتيح ذات صلة عند النجاح.
- رسائل نجاح/خطأ عربية عبر `sonner`.
- **لا يُرسل** snapshot، storagePath، verificationToken، SHA، byteLength، أو أي service key.
- **لا storage client-side** — لا `supabase.storage`، لا `.upload()`.

### شروط الظهور (كلها إلزامية)
1. `requestId !== "93807768-a281-42de-bfb4-0c0c03786b20"` (الطلب المحظور).
2. `requestTypeCode === "enrollment_certificate"`.
3. `!hasActiveOfficialDocument`.
4. `canActOnIssueDocument === true` (مربوطة بـ`workflowRuntimeAvailable`).
5. `currentStep` موجود.
6. `!currentStep.isPreview`.
7. `currentStep.stepKey === "document_issuance"`.
8. `currentStep.status === "current"` (يعني active runtime).
9. `currentStep.id` UUID حقيقي (وليس preview marker `step:…`).

### مكان التركيب
`src/components/student-requests/StaffRequestDetailPanel.tsx` — قبل `StaffRequestActionPanel` مباشرة. المكوّن يستخرج `currentStep` من `detail.workflowSteps`، ويمرِّر `id=null` إذا بدأ بـ`step:` (وهي علامة preview) — عندها Predicate يخفي الزر.

### إثبات (اختبارات آلية)
```
(pass) shows the button only when every condition is met
(pass) hides for the blocked pilot request
(pass) hides for wrong request type / step / status / preview / missing id
(pass) idempotency key is deterministic and within 8..120 length
(pass) UI button component references the saga server function
(pass) UI component has no client-side storage upload
(pass) StaffRequestDetailPanel mounts the issue button
```

**لم يُضَف زر في بوابة الطالب. لا Endpoint عام. لا صلاحية anon.**

## 8. حالة B4 (مؤجَّلة)

`file_size_limit` و`allowed_mime_types` على bucket `official-documents` ما تزال NULL. **لم تُعدَّل** ضمن هذا النطاق. تحسين defence-in-depth غير حاجب — يُنقل إلى مرحلة hardening مستقلة عبر migration إن اعتُمد قبل E2E.

## 9. نتائج التحقق

| فحص | نتيجة |
|-----|--------|
| `bunx tsgo --noEmit` | **PASS** (0 خطأ) |
| `bun test tests/documents/enrollment-certificate-worker-storage-implementation-01.test.ts` | **PASS** — 16/16، 52 expect calls، 597ms |
| بحث نصي على مسار Worker الإنتاجي: `node:fs`, `readFileSync`, `process.cwd(`, `example.invalid`, `VITE_PUBLIC_APP_URL` | **لا مطابقات فعلية** (الاختبارات الآلية تفرض ذلك) |
| Build (`bun run build`) | يُشغَّل تلقائياً من harness — لم يُشغَّل يدوياً في هذه المرحلة |

## 10. Baseline قبل وبعد (Read-only على Production)

| كائن | قبل | بعد |
|------|-----|-----|
| bucket `official-documents` | `public=false, files=0, size_limit=NULL, mime=NULL` | مطابق تماماً |
| policy `official_documents_deny_client_select` | `RESTRICTIVE` | مطابق |
| الطلب `93807768-…` | `status=in_review, updated_at=2026-07-13 17:59:19.782271+00, official_docs=0, attempts=0` | مطابق تماماً |

## 11. إثباتات عدم التنفيذ

- **لا Worker invoke / Saga invoke / Prepare / Generate / Upload / Finalize / Fail** — لا استدعاءات RPC صادرة.
- **لا Storage write** — bucket على 0 ملفات قبل وبعد.
- **لا Migration** — لم تُنشأ ولم تُطبَّق SQL.
- **لا Publish / Deploy** — لم يُطلب من الأدوات.
- **لا لمس للطلب التجريبي** — `updated_at` لم يتغير.
- **لا كشف قيم Secrets** — استُخدم `set_secret` فقط للاسم `SITE_URL`، ولم تُطبع قيمة أي secret.

## 12. الموانع المتبقية

| # | مانع | خطورة | يحجب E2E؟ |
|---|------|-------|-----------|
| B4 | bucket بلا `file_size_limit`/`allowed_mime_types` | 🟠 منخفض | لا (defence-in-depth) |
| — | Worker غير منشور (Publish معطَّل بأمر المالك) | 🟠 | نعم — يعالَج في مرحلة `WORKER_CONTROLLED_DEPLOYMENT` لاحقة |

B1/B2/B3/B5 → **مغلقة**.

## 13. نسب الجاهزية

| محور | نسبة |
|------|-----|
| G3 code/runtime | 100% |
| G3 post-apply security | 100% |
| B1 Worker asset/runtime compatibility | **100%** |
| B2 Auth middleware | **100%** (verified) |
| B3 SITE_URL server configuration | **100%** |
| B5 UI caller | **100%** |
| Worker implementation | ~95% (يبقى B4 دفاعي فقط) |
| Worker deployment | 0% — لم يُنشر |
| Enrollment certificate E2E | 0% — لم يُشغَّل |
| **Overall final launch readiness** | **~55%** |

## 14. المرحلة التالية (لا تبدأ تلقائياً)

`ENROLLMENT_CERTIFICATE_WORKER_STORAGE_READINESS_RECHECK_02`

## 15. المراحل المتبقية حتى الإطلاق

1. Recheck جاهزية Worker/Storage بعد التنفيذ.
2. معالجة B4 إن اعتُمدت.
3. تحديد آلية Controlled E2E دون نشر إنتاجي غير معتمد.
4. Controlled E2E على طلب اختبار مخصص (ليس التجريبي المحظور).
5. اعتماد شهادة القيد.
6. الأساس المشترك للخدمات الطلابية الثماني.
7. النماذج والـWorkflows لباقي الخدمات.
8. E2E لكل خدمة + تفعيل تدريجي.
9. نقل المواد التعليمية إلى GitHub ودمج.
10. تدقيق أمن/بيانات/واجهات نهائي.
11. Publish/Deploy نهائي واحد.
12. اختبار ما بعد الإطلاق والتسليم.

## 16. Publish/Deploy

`PUBLISH_DEPLOY_FORBIDDEN` — لم يُنفَّذ. توقُّف عند التقرير.
