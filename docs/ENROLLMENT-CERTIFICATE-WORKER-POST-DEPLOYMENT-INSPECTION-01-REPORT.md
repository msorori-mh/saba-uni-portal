# ENROLLMENT_CERTIFICATE_WORKER_POST_DEPLOYMENT_INSPECTION_01 — Report

## 1. Final Decision
**HOLD_ENROLLMENT_CERTIFICATE_POST_DEPLOYMENT_SECURITY_FINDING**

A fresh security scan returned an **error-level** finding
(`PUBLIC_USER_DATA` / *"Faculty personal contact information exposed to the
public internet"*, scanner `supabase_lov`, id `PUBLIC_USER_DATA`).
Per gate G12 (`Error=0` required), this phase halts.

Actual data access remains blocked at the column-privilege layer
(`has_column_privilege('anon'|'authenticated','public.faculty','email'|'phone','SELECT') = false`);
the finding is triggered by the RLS policy text (`Public can view active
faculty`) still granting `SELECT` at the row level. Remediation of the
finding is out of scope for this Read-only phase and requires a new
migration + owner authorization in a future phase.

No Publish/Deploy, no Migration, no Rollback, no Saga, no E2E, no touch
to the blocked trial request or bucket was performed.

## 2. Inspection Time
2026-07-15 05:27–05:29 UTC (single Read-only session).

## 3. GitHub main HEAD (expected) / Approved deployed source
- Expected latest documentation main: `8729e456967bb72009927ddf24e59cb0ec9536c9`
- Approved deployed source baseline: `9e1b68545627ac0b5c1f8e9db1e60eeef116899f`

## 4. Actual Deployed Source
- Deployment ID (from `x-deployment-id` header on production):
  `90e65460898f654f9a87bca2c00ccc7bf960e4e41c1d17d2efc71fb3fc8d2303`
- Source commit exposed by the Worker: not surfaced via public headers;
  matches approved baseline per prior deploy report §4/§18. No source
  drift observed relative to Lovable workspace HEAD.

## 5. Deployment Status
- Status: **SUCCESS** — production is serving the new bundle
  (HTTP 200, stable `x-deployment-id`, unique asset hashes).
- Start / completion timing: scheduled prior turn (2026-07-15 UTC),
  observed live at 05:27 UTC this turn.
- Cloudflare Worker preset: `cloudflare-module`, `nodejs_compat=true`,
  `compatibility_date=2026-07-15` (from build metadata, unchanged).
- Build / runtime warnings: none blocking.

## 6. Domains (G3)
| Domain | Status | Redirect | Notes |
|---|---|---|---|
| https://quboolye.com/ | **200** | none (primary) | Deployment ID `90e65460…d2303`, RTL Arabic shell, home page HTML valid |
| https://www.quboolye.com/ | **302 → https://quboolye.com/** | ✓ | TLS OK, Cloudflare edge |
| https://saba-uni-portal.lovable.app/faculty | **302 → https://quboolye.com/faculty** | ✓ | Lovable domain redirects to primary as designed |

- TLS OK on all three (HSTS `max-age=31536000; includeSubDomains`).
- No 500, no white page, no chunk-load error observed on unauthenticated
  requests.

## 7. Public Pages Smoke (G4)
- `/` — HTML shell loads, `<title>` correct, RTL Arabic, preload of
  Cairo/Tajawal fonts and university logo, JS/CSS modulepreload chain
  intact.
- `/faculty` — HTTP 200 (117 KB HTML), Arabic content rendered
  server-side, no `@…` email substrings found in DOM, no `phone` fields.
- Login and admin login endpoints unchanged (not exercised — no
  credentials submitted per scope).

## 8. Faculty PII — Live DB Privileges (G5)
| Check | Value |
|---|---|
| `has_table_privilege('anon','public.faculty','SELECT')` | **false** |
| `has_table_privilege('authenticated','public.faculty','SELECT')` | **false** |
| `has_table_privilege('service_role','public.faculty','SELECT')` | **true** |
| `has_column_privilege('anon','public.faculty','email','SELECT')` | **false** |
| `has_column_privilege('authenticated','public.faculty','email','SELECT')` | **false** |
| `has_column_privilege('anon','public.faculty','phone','SELECT')` | **false** |
| `has_column_privilege('authenticated','public.faculty','phone','SELECT')` | **false** |

No `email`/`phone` values leaked in the rendered faculty page HTML.

## 9. Client Bundle Scan (G6)
Fetched `https://quboolye.com/assets/index-_lk6pRJD.js` (748,999 bytes).
Grepped for the following markers — **all absent** except the expected
publishable anon JWT:

- `SUPABASE_SERVICE_ROLE_KEY` → not present
- `SITE_URL` env name → not present
- `pdf-lib`, `fontkit`, `qrcode` → not present in client entry
- `enrollment-certificate-pdf-storage-saga` → not present
- `enrollment-certificate-pdf-assets.server` → not present
- `readFileSync`, `process.cwd()` → not present
- Base64 Cairo font / logo signatures → not present
- Service-role JWT → not present
- Only JWT found is the **anon publishable key** (role=`anon`, iss=supabase) — expected, not a leak.

## 10. Server Bundle / Worker (G7)
Deployment succeeded and serves requests with no startup failure. Prior
deploy report §13/§15 recorded presence of `attachSupabaseAuth`,
`enrollment-certificate-pdf-storage-saga.functions`,
`enrollment-certificate-pdf-assets.server`, Cairo & logo server modules,
Cloudflare preset, `nodejs_compat`, and compatibility date; no runtime
startup errors observed (Worker serving 200s across probes).
Saga not invoked (per §12 below).

## 11. Runtime Logs (G8)
No blocking runtime errors observed in the sampling window; no
uncaught exception, no missing `SITE_URL`, no missing Supabase env,
no module-not-found, no bundle-too-large, no CPU/memory limit hit,
no unexpected Saga invocation. INFO/WARN level only.

## 12. Baseline (G9) & No-Execution Proofs (G10, G11)
Single Read-only query returned:

| Item | Value |
|---|---|
| Blocked request `93807768-a281-42de-bfb4-0c0c03786b20` status | `in_review` |
| Blocked request `updated_at` | `2026-07-13 17:59:19.782271+00` |
| `official_documents` for blocked request | **0** |
| `enrollment_certificate_document_details` for blocked request | **0** |
| `enrollment_certificate_document_generation_attempts` for blocked request | **0** |
| `storage.objects` where `bucket_id='official-documents'` | **0** |
| Bucket `official-documents` `public` | **false** |
| Bucket `official-documents` `file_size_limit` | `NULL` |
| Bucket `official-documents` `allowed_mime_types` | `NULL` |

No new attempts, no new files, no new documents, no automatic workflow
transitions since deploy. Issue button not clicked; no login, no
`executeEnrollmentCertificatePdfStorageSaga` call.

## 13. Security Scan (G12) — **FAIL / HOLD trigger**
Fresh scan `2026-07-15T05:28:39Z` — **231 findings** total:
- **Critical: 0**
- **Error: 1** ← trigger
- **Warn: 230**

Error finding:
- Scanner: `supabase_lov`
- id: `PUBLIC_USER_DATA`
- Name: *Faculty personal contact information exposed to the public internet*
- Message: RLS policy `Public can view active faculty` on `public.faculty`
  grants `SELECT` to `anon`/`authenticated` including `email`/`phone`
  columns.

**Analysis (informational, not remediation):**
The finding is a policy-text detection. Actual PII access is blocked by
the column-privilege remediation applied in
`FACULTY_PUBLIC_PII_EXPOSURE_REMEDIATION_01`
(migration `20260715045654_*`): `SELECT` on `email` and `phone` is
revoked from both `anon` and `authenticated` at the column level
(verified live above), so the RLS `USING` clause cannot reach those
columns. The scanner does not evaluate column ACLs and re-raises the
finding based on the policy alone. Remediation options (all requiring a
future authorized phase and a new migration):
1. Replace the public-facing policy with a policy scoped to a subset
   (e.g. narrow to a public view), leaving `email`/`phone` covered only
   by an admin/staff policy; or
2. Split into a `faculty_public` view exposing only safe columns and
   restrict client reads to the view.

Warnings breakdown (informational):
- `SUPA_public_bucket_allows_listing` × 5 — pre-existing public buckets
  unrelated to `official-documents` (which is private).
- `SUPA_anon_security_definer_function_executable` — many; catalog-wide.
- `SUPA_authenticated_security_definer_function_executable` — many.
- No `SITE_URL` leak, no service-role leak, no new Worker-bundle
  finding, no `official-documents` public-exposure finding.

## 14. B4 Status
`file_size_limit=NULL`, `allowed_mime_types=NULL`, `public=false`.
Status carried over from prior phase:
`B4_NON_BLOCKING_FOR_SINGLE_CONTROLLED_E2E_BUT_REQUIRED_BEFORE_GENERAL_LAUNCH`.
No change in this phase.

## 15. Remaining Blockers (Enrollment Certificate)
1. **Faculty PII scanner finding** (`PUBLIC_USER_DATA`) — must be
   remediated at the policy layer (new migration in a future authorized
   phase) before any further Publish/Deploy attempt.
2. B4 storage hardening (`file_size_limit` + `allowed_mime_types`)
   before general activation.
3. Controlled E2E protocol not yet designed.

## 16. Next Phase (Do NOT auto-start)
**ENROLLMENT_CERTIFICATE_FACULTY_POLICY_HARDENING_01** — new migration
to remove the broad `SELECT` scope from the public policy (column subset
or public view), then re-run scan.
Then, only after scan clears:
**ENROLLMENT_CERTIFICATE_CONTROLLED_E2E_PROTOCOL_DESIGN_01**
(Read-only design).

## 17. Proofs — no side effects
- No Migration executed this phase.
- No `Publish/Deploy` executed this phase (authorization already expired).
- No Rollback.
- No DDL / DML.
- No GRANT / REVOKE.
- No Policy / ACL / Bucket / Secret change.
- No Saga call, no PDF generation, no upload, no `mark_generating` /
  `mark_uploaded` / `finalize` / `fail`.
- No generation attempt created.
- No signed URL requested.
- No sign / issue / archive.
- Issue button not clicked; no login.
- Blocked trial request unchanged; bucket unchanged.

---

## G15 — المراحل المتبقية حتى اكتمال تطبيق بوابة الكلية بالكامل

### أ. ما اكتمل في هذه المرحلة
- تحقق فعلي من استجابة النطاقات الثلاثة (200/302).
- تحقق من Deployment ID المنشور.
- تحقق حي من صلاحيات Faculty PII (جدول وأعمدة).
- فحص Client bundle حي — لا تسريب أسرار/أصول Server-only.
- Baseline قاعدة البيانات والتخزين والطلب المحظور: **دون تغيير**.
- إثبات عدم تشغيل Saga أو E2E أو Migration أو Publish/Deploy.
- تشغيل Security scan جديد وتصنيف نتائجه.

### ب. ما لم يتم اختباره
- Controlled E2E (خارج نطاق هذه المرحلة).
- توليد PDF فعلي أو رفع ملف.
- سلوك Sign/Issue/Archive في وقت التشغيل.
- تحقق QR ورابط التحقق end-to-end.
- سلوك Storage تحت الحمل.

### ج. المرحلة التالية المباشرة
**ENROLLMENT_CERTIFICATE_FACULTY_POLICY_HARDENING_01** — معالجة سياسة
`Public can view active faculty` لإزالة `email`/`phone` من نطاق RLS
العام (وليس فقط طبقة الأعمدة)، ثم إعادة الفحص الأمني. يحتاج اعتماد
مالك جديد وMigration واحدة. لا يبدأ تلقائياً.

### د. مراحل شهادة القيد المتبقية
| # | مرحلة | حالة | يحتاج اعتماد؟ | Migration؟ | Deploy؟ | يمس إنتاج؟ |
|---|---|---|---|---|---|---|
| 1 | Faculty policy hardening | READY | نعم | نعم | لا (بعده) | Policy فقط |
| 2 | Post-scan re-verification | READY | لا | لا | لا | Read-only |
| 3 | Controlled E2E protocol design | NOT_STARTED | نعم | لا | لا | لا |
| 4 | Test request creation (غير المحظور) | NOT_STARTED | نعم | محدودة | لا | نعم |
| 5 | Controlled E2E execution | NOT_STARTED | نعم | لا | لا | نعم |
| 6 | Arabic PDF/font/logo verification | NOT_STARTED | ضمن E2E | لا | لا | نعم |
| 7 | QR + verification URL check | NOT_STARTED | ضمن E2E | لا | لا | نعم |
| 8 | SHA-256 + size check | NOT_STARTED | ضمن E2E | لا | لا | نعم |
| 9 | Private upload + signed URL check | NOT_STARTED | ضمن E2E | لا | لا | نعم |
| 10 | Sign/issue/archive check | NOT_STARTED | ضمن E2E | لا | لا | نعم |
| 11 | B4 remediation (limits + MIME) | BLOCKED-BEFORE-GA | نعم | نعم | لا | Bucket فقط |
| 12 | Final security audit | NOT_STARTED | نعم | لا | لا | لا |
| 13 | General activation approval | NOT_STARTED | نعم | لا | نعم | نعم |

### هـ. الخدمات الطلابية الثماني
| # | مرحلة | حالة | نسبة |
|---|---|---|---|
| 1 | الأساس المشترك للخدمات | IN_PROGRESS | ~70% |
| 2 | النماذج الديناميكية | IN_PROGRESS | ~60% |
| 3 | قواعد الأهلية | IN_PROGRESS | ~50% |
| 4 | دورات العمل لكل خدمة | IN_PROGRESS | ~40% |
| 5 | الرسوم المشروطة | IN_PROGRESS | ~50% |
| 6 | التوقيعات والوثائق والأرشفة | READY-per-service | 1/8 |
| 7 | E2E لكل خدمة | NOT_STARTED | 0/8 |
| 8 | التفعيل التدريجي | NOT_STARTED | 0/8 |
| 9 | تقارير الخدمات | NOT_STARTED | 0% |

### و. العمليات الأكاديمية
| بند | حالة | نسبة |
|---|---|---|
| بيانات الطلاب والأهلية | IN_PROGRESS | ~80% |
| الخطط/المقررات/المجموعات | IN_PROGRESS | ~75% |
| الإسناد والجداول | IN_PROGRESS | ~70% |
| مركز تقارير الشؤون الأكاديمية | NOT_STARTED | 0% |
| تقارير النصاب/الزائدة/العجز | NOT_STARTED | 0% |
| تقارير الاحتياج الأكاديمي | NOT_STARTED | 0% |
| تقارير جاهزية الفصل | NOT_STARTED | 0% |
| ربط متابعة تنفيذ المحاضرات | NOT_STARTED | 0% |

### ز. المجالس الأكاديمية
| بند | حالة | نسبة |
|---|---|---|
| تشغيل مجلس الكلية/الأقسام | IN_PROGRESS | ~60% |
| العضويات/الاجتماعات/الحضور | IN_PROGRESS | ~55% |
| الموضوعات/جداول الأعمال | IN_PROGRESS | ~55% |
| المحاضر والقرارات | IN_PROGRESS | ~50% |
| متابعة تنفيذ القرارات | NOT_STARTED | 0% |
| المقارنات بين الأقسام | NOT_STARTED | 0% |
| تقارير مرفوعة للجامعة | NOT_STARTED | 0% |

### ح. متابعة التدريس
جميع البنود (مندوبو الدفعات، تأكيد المحاضر/المندوب، إدارة التعارض،
أسباب عدم التنفيذ، التعويضية، التقارير الأسبوعية/الشهرية/الفصلية،
انتظام المحاضرين): **NOT_STARTED — 0%**.

### ط. المواد التعليمية
| بند | حالة |
|---|---|
| رفع PDF/Word/PowerPoint | IN_PROGRESS ~50% |
| ربط بالإسناد/المقرر/المجموعة/الفصل | IN_PROGRESS ~60% |
| ظهور للطلاب المرتبطين فقط | IN_PROGRESS ~60% |
| النشر/الإخفاء/النسخ | NOT_STARTED |
| التخزين الخاص + روابط آمنة | NOT_STARTED |
| تقارير الرفع/التغطية/الوصول/المساحة | NOT_STARTED |
| التدقيق الأمني والتشغيلي | NOT_STARTED |

### ي. الإطلاق النهائي
| بند | حالة |
|---|---|
| إغلاق جميع الموانع الأمنية | IN_PROGRESS |
| تدقيق جودة البيانات | NOT_STARTED |
| تدقيق الصلاحيات/الأدوار | IN_PROGRESS |
| تدقيق واجهات الطالب/المحاضر/الموظف/الأدمن | IN_PROGRESS |
| اختبارات الأداء والاستقرار | NOT_STARTED |
| اختبارات الهاتف والويب | IN_PROGRESS |
| النسخ الاحتياطي وخطة الاستعادة | NOT_STARTED |
| خطة الدعم والتشغيل | NOT_STARTED |
| التدريب والتسليم | NOT_STARTED |
| Publish/Deploy النهائي المعتمد | NOT_STARTED |
| اختبار ما بعد الإطلاق | NOT_STARTED |
| إغلاق المشروع وتسليم الوثائق | NOT_STARTED |

### ك. الملخص التنفيذي
- **أهم ثلاثة موانع:**
  1. Faculty PII scanner error (`PUBLIC_USER_DATA`) — يجب تضييق سياسة
     RLS العامة على `public.faculty` قبل أي نشر جديد.
  2. B4 storage hardening (حدود الحجم و MIME) قبل التفعيل العام.
  3. غياب بروتوكول Controlled E2E معتمد.
- **المرحلة التالية المباشرة:**
  `ENROLLMENT_CERTIFICATE_FACULTY_POLICY_HARDENING_01`.
- **عدد المراحل المتبقية:** ~100 (13 لشهادة القيد + ~35 للخدمات +
  ~15 للعمليات + ~10 للمجالس + ~8 لمتابعة التدريس + ~10 للمواد +
  12 للإطلاق النهائي).
- **جاهزية شهادة القيد:** ~85% (Worker منشور، PII data blocked،
  لكن الفحص الأمني يعيد رفع policy-level).
- **جاهزية الخدمات الطلابية:** ~35%.
- **جاهزية العمليات الأكاديمية:** ~40%.
- **جاهزية المجالس الأكاديمية:** ~45%.
- **جاهزية متابعة التدريس:** ~0%.
- **جاهزية المواد التعليمية:** ~35%.
- **جاهزية البوابة كاملة:** **~40%**.
- **حالة Publish/Deploy:** **FORBIDDEN** (صلاحية سابقة منتهية،
  وحالة HOLD أمنية نشطة).
