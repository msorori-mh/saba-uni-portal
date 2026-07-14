# ENROLLMENT-CERTIFICATE-PDF-STORAGE-SAGA-COMPLETION-01

## القرار النهائي

`PASS_ENROLLMENT_CERTIFICATE_PR124_SYNCED_PDF_STORAGE_SAGA_COMPLETE_READY_FOR_FINAL_MERGE_REVIEW`

---

## 1. Executive

حزمة تنفيذ واحدة على PR `#124` (`fix/enrollment-certificate-post-zero-fee-execution-contract-01`):

1. مزامنة الفرع مع أحدث `origin/main` عبر `merge --no-ff` (يشمل PR `#126` وما بعده).
2. إكمال **PDF Storage Saga** لشهادة القيد: Prepare → Generate → Upload → Finalize → Issue → Archive، مع Failure/Recovery وIdempotency.
3. استبدال بوابة `assert_enrollment_certificate_pdf_generation_ready` بعقد جاهزية حقيقي (وجود bucket خاص `official-documents`).
4. تقليل حقول التحقق العام؛ Signed Download آمن؛ اختبارات عقدية + توليد PDF عربي.

| قيد المرحلة                                                  | الالتزام                                 |
| ------------------------------------------------------------ | ---------------------------------------- |
| لا Migration apply                                           | ملتزَم                                   |
| لا Production DB writes                                      | ملتزَم                                   |
| لا Storage production writes                                 | ملتزَم                                   |
| لا Deploy / Publish                                          | ملتزَم                                   |
| لا دمج PR                                                    | ملتزَم                                   |
| لا Force Push / Rebase                                       | ملتزَم                                   |
| لا لمس الطلب التجريبي `93807768-a281-42de-bfb4-0c0c03786b20` | ملتزَم (محظور صراحة في الـ orchestrator) |
| لا تغيير Finance Flags / Auth / Roles للطالب التجريبي        | ملتزَم                                   |

---

## 2. المزامنة مع main

| بند                                         | قيمة                                       |
| ------------------------------------------- | ------------------------------------------ |
| HEAD قبل saga (المتوقع)                     | `63ee2dbfd89d1807ceae23f5531996513dbe4fe9` |
| Merge commit قبل تنفيذ saga                 | `a1edad19ee22f5ee45ffd4691e13459e1fda42bf` |
| أسلوب الدمج                                 | `git merge --no-ff origin/main`            |
| احتواء main على الأقل لـ `#126`             | نعم (`2c4e1df…` ولاحقاً `origin/main`)     |
| `merge-base --is-ancestor origin/main HEAD` | ناجح بعد الدمج                             |

التعارضات مع `main` حُلّت مع الحفاظ على:

- عقد `sign → signed`
- عقد `issue_document → issued`
- عقد `archive → archived`
- إصلاحات PDF Worker / Cairo / RTL / QR
- تغييرات PR `#126` (لوحة الطالب / الطلبات)

---

## 3. Storage Saga — التدفق

```text
Prepare → Generate → Upload → Finalize → Issue → Archive
Failed → Retry/Recover → Finalize exactly once
```

### 3.1 التخزين

| بند                     | قيمة                                                     |
| ----------------------- | -------------------------------------------------------- |
| Bucket                  | `official-documents`                                     |
| Public                  | **false** (خاص)                                          |
| رفع من Client           | ممنوع (لا سياسات INSERT للـ authenticated/anon)          |
| الرفع                   | من بيئة موثوقة فقط (`supabaseAdmin` / service role)      |
| المسار الحتمي           | `enrollment-certificates/{request_id}/{attempt_id}.pdf`  |
| Overwrite لوثيقة مكتملة | ممنوع (`upsert: false` + قيد وثيقة فعّالة واحدة لكل طلب) |

### 3.2 سجل المحاولات

جدول: `enrollment_certificate_document_generation_attempts`

حالات مقيدة: `prepared` | `generating` | `uploaded` | `finalized` | `failed`

حقول أساسية: `request_id`, `document_type`, `status`, `idempotency_key`, `storage_path`, `file_size_bytes`, `content_sha256`, أخطاء، طوابع زمنية، `created_by`, `verification_token_hash`, `verification_token_pending` (يُصفّر عند Finalize).

Unique: `(student_request_id, idempotency_key)`.

### 3.3 Prepare / Generate / Upload / Finalize

| مرحلة           | آلية                                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prepare         | RPC `prepare_enrollment_certificate_document_generation` — تحقق auth/صلاحية/`enrollment_certificate`/خطوة `document_issuance`/التوقيعات/الرسوم؛ Idempotent replay                        |
| Generate        | `buildEnrollmentCertificatePdfBytes` (Cairo محلي، RTL، شعار، QR بلا Canvas/CDN)                                                                                                          |
| Upload          | `supabaseAdmin.storage.from('official-documents').upload(..., upsert:false)` ثم `mark_…_uploaded` مع SHA-256 والحجم                                                                      |
| Finalize        | `finalize_enrollment_certificate_document_generation` — يتحقق من وجود الملف في storage.objects، ينشئ `official_documents` مرة واحدة، يكمل الخطوة بـ `issued`، ينقل Runtime إلى `archive` |
| Issue مسار بديل | `issue_enrollment_certificate_from_workflow_step` يفوّض إلى Finalize عند `payload.attempt_id` وإلا يرجع `ENROLLMENT_CERTIFICATE_USE_PDF_STORAGE_SAGA`                                    |
| Archive         | `archive_enrollment_certificate_from_workflow_step` → `archived` + إكمال الطلب؛ Idempotent؛ يتطلب وثيقة صادرة وملف موجود                                                                 |

### 3.4 Failure و Recovery

- الفشل لا يكمل Workflow ولا ينشئ `official_documents`.
- `fail_enrollment_certificate_document_generation` يسجّل السبب دون حذف Storage.
- إعادة المحاولة Idempotent عبر مفتاح التحضير.
- حالة «رُفع ولم يُنهَ Finalize» → Prepare يعيد الحالة `uploaded` + الرمز المعلّق → Finalize مرة واحدة.
- تكرار Finalize بعد النجاح → `idempotent: true`.

### 3.5 Signed Download

Server fn: `getEnrollmentCertificateDocumentSignedUrl`

- مالك الوثيقة / موظف مصرّح (`can_current_user_act_on_step`) / Admin|System Admin.
- غير المصرّح: رفض دون كشف المسار الداخلي.
- صلاحية الرابط: **180 ثانية**.
- لا يُرجع Service Role أو مسار الخام للمستخدم غير المصرّح.

### 3.6 التحقق العام

- RPC `verify_document` + صفحة `/verify-document` (بدون تسجيل دخول).
- حقول آمنة فقط: `valid`, `document_type`, `document_number`, `status`, `issued_at`, `reason`.
- **لا** رقم أكاديمي كامل ولا اسم طالب في الاستجابة/الواجهة.
- يدعم الملغى/غير الصالح عبر `status`/`reason`.
- Token طويل غير قابل للتخمين (`gen_random_bytes` / بديل UUID مدمج).

### 3.7 Fail-closed المتبقي بعد Saga

`assert_enrollment_certificate_pdf_generation_ready` ما عاد يرفع `HOLD_…_PDF_GENERATION_CONTRACT_MISSING`؛ يرفع الآن عند غياب bucket الخاص:

`HOLD_ENROLLMENT_CERTIFICATE_PDF_STORAGE_BUCKET_MISSING`

واجهة الموظفين تبقى مغلقة حتى تهيئة Bucket/Worker على البيئة (`getPdfStorageGeneratorCapability` افتراضياً fail-closed).

---

## 4. Migrations (مراجعة فقط — غير مطبّقة)

الترتيب:

1. `…/20260713100000_enrollment_certificate_post_zero_fee_execution_contract_remediation_01.sql`
2. `…/20260713210000_enrollment_certificate_document_issuance_and_archive_contract_01.sql`
3. **`…/20260714010000_enrollment_certificate_pdf_storage_saga_completion_01.sql`** ← هذه المرحلة

الجداول / الفهارس البارزة في 3:

- Bucket `official-documents`
- `enrollment_certificate_document_generation_attempts`
- تحديث `assert_…_ready` / Prepare / mark generating|uploaded / fail / finalize
- استبدال سلوك issue/archive/verify

**لم يُطبَّق أي Migration على الإنتاج في هذه المرحلة.**

---

## 5. RPCs و Worker / Server endpoints

| نوع          | اسم                                                                                     |
| ------------ | --------------------------------------------------------------------------------------- |
| RPC          | `prepare_enrollment_certificate_document_generation`                                    |
| RPC          | `mark_enrollment_certificate_document_generating`                                       |
| RPC          | `mark_enrollment_certificate_document_uploaded`                                         |
| RPC          | `fail_enrollment_certificate_document_generation`                                       |
| RPC          | `finalize_enrollment_certificate_document_generation`                                   |
| RPC          | `issue_enrollment_certificate_from_workflow_step` (يفوّض أو USE_SAGA)                   |
| RPC          | `archive_enrollment_certificate_from_workflow_step`                                     |
| RPC          | `verify_document` (حقول مُقلَّصة)                                                       |
| Server       | `executeEnrollmentCertificatePdfStorageSaga`                                            |
| Server       | `getEnrollmentCertificateDocumentSignedUrl`                                             |
| PDF          | `src/lib/documents/enrollment-certificate-pdf.ts` (+ spike engine)                      |
| Worker spike | `tools/arabic-pdf-worker-spike/` — الحجم الموثّق سابقاً ≈ **2924 KiB / gzip ≈ 949 KiB** |

---

## 6. Security model

- لا رفع من العميل إلى `official-documents`.
- RPCs SECURITY DEFINER + `auth.uid` + `can_current_user_act_on_step`.
- REVOKE من `PUBLIC`/`anon` على RPCs الحسّاسة؛ `verify_document` متاح لـ anon بالحقول الآمنة فقط.
- تنزيل عبر Signed URL قصير العمر بعد تحقق ملكية/صلاحية.
- الرمز الخام `verification_token_pending` يُصفّر بعد Finalize؛ التخزين يعتمد hash للمطابقة.

---

## 7. Idempotency model

- مفتاح Idempotency فريد لكل `(request_id, key)`.
- إعادة Prepare تعيد نفس المحاولة (+ token معلّق إن لم تُنهَ).
- Finalize مكرّر بعد النجاح يعيد الوثيقة الموجودة دون صف ثانٍ.
- Archive مكرّر لا يُنشئ events/انتقالات مكررة عند الاكتمال مسبقاً.
- Unique index سابق: وثيقة فعّالة واحدة لكل طلب.

---

## 8. الملفات المعدّلة / الجديدة (نطاق PR #124)

### جديدة

- `supabase/migrations/20260714010000_enrollment_certificate_pdf_storage_saga_completion_01.sql`
- `src/lib/documents/enrollment-certificate-pdf.ts`
- `src/lib/student-requests/enrollment-certificate-pdf-storage-saga.functions.ts`
- `tests/student-requests/enrollment-certificate-pdf-storage-saga-completion-01.test.ts`
- `docs/ENROLLMENT-CERTIFICATE-PDF-STORAGE-SAGA-COMPLETION-01-REPORT.md`

### معدّلة

- `src/lib/student-requests/enrollment-certificate-pdf-storage-generator-contract.ts`
- `src/lib/student-requests/enrollment-certificate-document-issuance-archive-contract.ts`
- `src/lib/student-requests/post-zero-fee-execution-contract.ts`
- `src/lib/student-requests/request-document-archive-contract.ts`
- `src/routes/verify-document.tsx`
- اختبارات العقود / الـ Spike ذات الصلة

`.tmp/` و `.wrangler/` **ignored** عبر `.gitignore` — غير ضمن الـ Commit.

---

## 9. نتائج الفحوصات

| فحص | النتيجة |
| --- | --- |
| `bun test` (عبر `npx bun@1.2.19` — بيئة Windows بلا `bun.exe` كامل؛ متوفر `bunx.exe`) | **318 pass / 0 fail** (27 ملفاً) |
| `bunx tsgo --noEmit` عبر `bunx -p @typescript/native-preview tsgo --noEmit` | **PASS** (exit 0) |
| `bun run build` | **PASS** (exit 0؛ Vite ~38s + Nitro) |
| Lint العام `bun run lint` | **لم يُكتمل خلال مهلة معقولة** — آلاف مخالفات `prettier/prettier` لـ CRLF خارج نطاق PR |
| Lint scoped على ملفات PR #124 المعدّلة | **PASS** (exit 0، 0 errors) بعد `prettier --write` |

قيود موثّقة: لا Production DB/Storage writes أثناء الفحوصات. لا Migration apply.

Worker spike volume (من تقرير Spike السابق): **≈ 2924 KiB upload / gzip ≈ 949 KiB**.

---

## 10. PR / CI

| بند | قيمة |
| --- | --- |
| PR | https://github.com/msorori-mh/saba-uni-portal/pull/124 |
| القرار في الوصف | `PASS_ENROLLMENT_CERTIFICATE_PR124_SYNCED_PDF_STORAGE_SAGA_COMPLETE_READY_FOR_FINAL_MERGE_REVIEW` |
| دمج | **لا** — للمراجعة النهائية فقط |
| HEAD بعد Push | يُحدَّث بعد الـ Commit |

---

## 11. الموانع المتبقية (دقيقة)

1. **Migration غير مطبّقة** على الإنتاج — RPCs/bucket لن تعمل حتى apply منفصل معتمد.
2. **تهيئة بيئة Worker/Storage** — أزرار الإصدار تبقى fail-closed حتى `officialDocumentsBucketPresent` + `workerConfigPresent`.
3. **لا تشغيل إصدار/توقيع** على الطلب التجريبي `93807768-…` في هذه المرحلة.
4. ربط واجهة Staff Inbox بزر تنفيذ saga (العقد جاهز؛ التفعيل التشغيلي بعد apply + env).
5. مخلفات Prettier/CRLF واسعة في المستودع خارج نطاق PR — Scoped lint لملفات هذه المرحلة نظيف.

لا يوجد مانع عقدي يمنع مراجعة الدمج النهائية للكود في PR `#124`.
