# ENROLLMENT-CERTIFICATE-POST-ZERO-FEE-EXECUTION-CONTRACT-REMEDIATION-01

## القرار

`HOLD_DOCUMENT_ISSUANCE_EXECUTION_CONTRACT_MISSING — SIGNATURE_FIX_READY_BUT_NOT_SAFE_TO_APPLY_ALONE`

---

## النطاق المنفَّذ

| البند | الحالة |
|-------|--------|
| Git / Code / Tests فقط | نعم |
| كتابة على قاعدة الإنتاج | لا |
| تطبيق Migration | لا |
| Deploy / Publish | لا |
| تعديل الطلب التجريبي `93807768-…` | لا |
| حذف / Cleanup / Reset | لا |
| وثيقة تجريبية وهمية | لا |

---

## تدقيق فجوة العقد (مثبت)

### RPCs الحالية (قبل remediation)

أحدث جسم لـ:

- `is_valid_actor_request_action`
- `can_current_user_act_on_step`
- `act_on_student_request_step`

موجود في:

`supabase/migrations/20260710180000_student_request_actor_rpc_rls.sql`

| الإجراء | مقبول؟ | `action_result` | مطلوب في workflow v2 |
|--------|--------|-----------------|----------------------|
| `sign` | **لا** | — | `signed` |
| `issue_document` | نعم | **`complete`** | **`issued`** |
| `archive` | نعم | **`complete`** | **`archived`** |

### انتقالات شهادة القيد (canonical / foundation)

| من | إلى | `action_result` |
|----|-----|-----------------|
| `registrar_signature` | `dean_signature` | `signed` |
| `dean_signature` | `document_issuance` | `signed` |
| `document_issuance` | `archive` | `issued` |
| `archive` | `NULL` | `archived` |

### فجوات مثبتة

1. الانتقال من `registrar_signature` يتطلب **`signed`** — الدالة لا تنتجها (`sign` مرفوض).
2. الانتقال من `dean_signature` يتطلب **`signed`** — نفس الفجوة.
3. الانتقال من `document_issuance` يتطلب **`issued`** — الدالة ترسل `complete`.
4. الانتقال من `archive` يتطلب **`archived`** — الدالة ترسل `complete`.
5. `act_on` يكمل الخطوة **قبل** البحث عن الانتقال → خطر runtime عالق بدون خطوة نشطة.
6. واجهة المستندات/الأرشيف للطلبات: **Dry-run فقط** (`canExecute: false`).

### إصدار الوثيقة / التخزين

- `issue_official_document(student_profile_id, document_type, metadata)` ينشئ `official_documents` بدون عمود **`student_request_id`**.
- مسار السجل الأكاديمي يستخدم `official_transcript_request_details.official_document_id` — **لا يوجد مكافئ لشهادة القيد**.
- PDF: العرض عبر `/document-view` HTML/طباعة؛ لا مسار تخزين طلب-مقيَّد لشهادة القيد من workflow.
- لا منطق تخميني لإدراج وثيقة من `act_on` في هذه المرحلة.

---

## ما تم إعداده في الكود (جاهز للمراجعة — غير مطبَّق)

### Migration

`supabase/migrations/20260713100000_enrollment_certificate_post_zero_fee_execution_contract_remediation_01.sql`

- إضافة `sign` للقائمة البيضاء.
- `sign → signed` / حدث `signed`.
- ترميز `issue_document → issued` و `archive → archived` (مع أحداث `document_issued` / `archived`).
- Fail-closed: التحقق من الخطوة `active`، توافق `action_type`، ووجود Transition **قبل** أي `UPDATE` على runtime.
- رفض `approve` على خطوة `action_type = sign`.
- **HOLD داخل الدالة:**
  - `issue_document` → `RAISE DOCUMENT_ISSUANCE_EXECUTION_CONTRACT_MISSING` قبل الكتابة.
  - `archive` → `RAISE ARCHIVE_REQUIRES_ISSUED_DOCUMENT_CONTRACT` قبل الكتابة.
- `auth.uid()` مطلوب؛ REVOKEs على `PUBLIC/anon`؛ لا توسيع صلاحيات.

### سياسة TypeScript

`src/lib/student-requests/post-zero-fee-execution-contract.ts`

تعكس نفس المطابقة والبوابات للاختبارات/الواجهة لاحقًا.

### الواجهة

- **لم يُفعَّل** زر التنفيذ (`canExecute` يبقى `false`).
- مسارات staff document/archive تبقى Dry-run.

### الاختبارات

`tests/student-requests/enrollment-certificate-post-zero-fee-execution-contract.test.ts`

تغطي المطابقات، رفض `approve` على sign، HOLD للإصدار/الأرشفة، fail-closed للانتقال، وخصائص الـ migration.

---

## الحالة الإنتاجية المرجعية (للقراءة فقط)

| الحقل | القيمة |
|-------|--------|
| request | `93807768-a281-42de-bfb4-0c0c03786b20` |
| status | `in_review` |
| active step | `registrar_signature` |
| submit window | `is_active=false`, `student_visible=false` |

لم يُمس هذا الطلب في هذه المرحلة.

---

## لماذا HOLD وليس PASS

إصلاح التوقيع وحده يفعّل الانتقال إلى `document_issuance` ثم يتوقف عند عقد إصدار ناقص. تطبيق الـ migration على الإنتاج **بدون** مسار إصدار/ربط وثيقة آمن يترك الطلبات في فجوة تشغيلية جديدة.

المطلوب قبل PASS:

1. ربط دائم `student_request` ↔ `official_documents` (عمود/جدول تفاصيل لشهادة القيد).
2. إنشاء وثيقة واحدة من نوع `enrollment_certificate` مع رقم ورمز تحقق وsnapshot.
3. تفعيل `issue_document` و`archive` مع فحوصات الأرشفة (توقيعان + إصدار + دور الأرشيف).
4. اختبارات تكاملية على DB staging ثم apply مراقب.

---

## نتائج التحقق الآلي

| الفحص | النتيجة |
|-------|---------|
| `bun test tests/student-requests/enrollment-certificate-post-zero-fee-execution-contract.test.ts` | **23 pass / 0 fail** |
| `bunx tsc --noEmit` | **pass** |
| `bun run build` | **pass** |
| `git diff --check` | **pass** |

---

## ضمانات

- ❌ لا تطبيق Migration على الإنتاج
- ❌ لا DB writes / seed / cleanup
- ❌ لا Publish / Deploy
- ❌ لا تعديل `types.ts` يدويًا
- ❌ لا تفعيل تنفيذ الواجهة في هذه المرحلة
