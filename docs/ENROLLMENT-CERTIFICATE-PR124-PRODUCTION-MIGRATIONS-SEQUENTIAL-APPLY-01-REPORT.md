# ENROLLMENT-CERTIFICATE-PR124-PRODUCTION-MIGRATIONS-SEQUENTIAL-APPLY-01 — Report

- **Lovable Project:** 4b291119-790f-4484-9285-c2b774e1ba6f
- **Supabase Project:** wpmicqriltrowwonknox
- **Repo:** msorori-mh/saba-uni-portal
- **main HEAD used:** cbaa28d6dbb088be8722dc6fea3495ecd2a0021d
- **Pilot request:** 93807768-a281-42de-bfb4-0c0c03786b20

## Final Decision

**HOLD_ENROLLMENT_CERTIFICATE_PR124_SEQUENTIAL_MIGRATIONS_G3_SQL_COMPILATION_ERROR**

G1 و G2 طُبقتا وتحقّقتا بنجاح. G3 فشلت أثناء التطبيق بسبب خطأ ترميز في ملف الميغريشن المصدري على `main`، وتم التوقف فوراً كما تنص الضوابط.

---

## G0 — Preflight (موحد)

- الملفات الثلاث موجودة على main ✅
- لا واحدة منها مسجلة في `supabase_migrations.schema_migrations` ✅
- الطلب التجريبي: `status=in_review`, `updated_at=2026-07-13 17:59:19.782271+00` ✅
- لا وثيقة أو attempt مرتبطة به (`enrollment_certificate_document_details` غير موجود، جدول `official_documents` بلا `student_request_id`) ✅
- لا Publish/Deploy ✅
- لا تغييرات Auth/Roles/Finance ✅

**Result:** PASS

---

## G1 — 20260713100000_enrollment_certificate_post_zero_fee_execution_contract_remediation_01.sql

- **وقت التطبيق:** 2026-07-14 23:44 UTC (تقريبي)
- **نتيجة التطبيق:** SUCCESS (migration tool)
- **كائنات التحقق:**
  - `public.is_valid_actor_request_action(text)` — COMMENT حديث يتضمّن "post–zero-fee enrollment certificate remediation 01" ✅
  - `public.act_on_student_request_step(uuid,text,text,jsonb)` — COMMENT حديث يذكر "Maps sign→signed with fail-closed transitions" ✅
  - عقد sign → signed مطبّق (فحص الترميز فقط، لم يُنفَّذ عملياً)
  - عقود issue_document/archive ترفع HOLD إذا نُفّذت (كما هو مصمم لهذه المرحلة)
- **الطلب التجريبي:** `updated_at` لم يتغيّر (`2026-07-13 17:59:19.782271+00`) ✅
- **لا تطبيق للميغريشن الثانية أو الثالثة** — تم فحصه قبل بدء G2

**Result:** `PASS_PR124_MIGRATION_G1_APPLIED_AND_VERIFIED`

---

## G2 — 20260713210000_enrollment_certificate_document_issuance_and_archive_contract_01.sql

- **وقت التطبيق:** 2026-07-14 23:47 UTC (تقريبي)
- **نتيجة التطبيق:** SUCCESS (migration tool)
- **كائنات التحقق (تم فحصها فعلياً عبر read_query):**
  - `public.issue_enrollment_certificate_from_workflow_step` — موجودة (1) ✅
  - `public.archive_enrollment_certificate_from_workflow_step` — موجودة (1) ✅
  - `public.assert_enrollment_certificate_pdf_generation_ready` — موجودة (1) ✅ (نسخة HOLD مطلق)
  - `public.verify_document` — موجودة (1) ✅ (بإرجاع اسم/رقم أكاديمي محدود)
  - `public.enrollment_certificate_document_details` — جدول موجود (1) ✅ مع RLS و 3 سياسات
  - `official_documents.student_request_id` — عمود مضاف (1) ✅ مع مؤشر فريد للطلب الفعال
  - قيد `official_documents_status_chk` يتضمن `archived`
  - قيود `decision` و`event_type` وُسّعت (signed/issued/archived)
- **الطلب التجريبي:** `status=in_review`, `updated_at` كما هو، لا وثائق مرتبطة به (0) ✅
- **لا تطبيق للميغريشن الثالثة** — تم فحصه قبل بدء G3

**Result:** `PASS_PR124_MIGRATION_G2_APPLIED_AND_VERIFIED`

---

## G3 — 20260714010000_enrollment_certificate_pdf_storage_saga_completion_01.sql

### الخطوة التمهيدية: إنشاء حاوية `official-documents`

الميغريشن الأصلية تحاول:

```sql
INSERT INTO storage.buckets (...) VALUES ('official-documents', ..., false, ...);
```

أداة الميغريشن رفضت الكتابة على `storage.buckets` وطلبت استخدام أداة إنشاء الحاويات المخصصة.

- تم استدعاء `supabase--storage_create_bucket({name:"official-documents", public:false})`
- النتيجة: **الحاوية أُنشئت بنجاح، خاصة (`public=false`)** ✅
- لا سياسة SELECT على `storage.objects` تسمح لأي عميل بقراءتها (لأن G3 التي تُضيف سياسة الحرمان الصريحة لم تُطبَّق بعد؛ الوصول الافتراضي من `authenticated/anon` مرفوض في غياب سياسة سماح على bucket خاص)
- لا رفع ملفات، لا signed URLs، لا انعكاس على أي طلب

### محاولة تطبيق باقي G3 عبر migration tool

- **نتيجة التطبيق:** **FAIL** ❌
- **الخطأ الحرفي:**

```
ERROR:  42704: unrecognized exception condition "undefined_schema"
CONTEXT: compilation of PL/pgSQL function "_ec_new_verification_token" near line 4
```

- **السبب الفني:** الملف المصدري في `supabase/migrations/20260714010000_...sql` يستخدم:

```plpgsql
EXCEPTION
  WHEN undefined_function OR undefined_schema THEN ...
```

في كل من `_ec_new_verification_token` و `_ec_sha256_hex`. لا يوجد شرط استثناء PL/pgSQL باسم `undefined_schema` في Postgres — الرمز الرمزي غير معرف، فترفض قاعدة البيانات كامل CREATE FUNCTION عند وقت التصريف. المعاملة تُتراجع كاملة قبل إنشاء أي كائن آخر.

### حالة الكائنات بعد الفشل (تم التحقق عبر read_query)

| كائن | موجود؟ |
|---|---|
| Bucket `official-documents` (public=false) | ✅ (أُنشئ بواسطة أداة التخزين) |
| Storage policy `official_documents_deny_client_select` | ❌ 0 |
| Table `public.enrollment_certificate_document_generation_attempts` | ❌ 0 |
| Function `prepare_enrollment_certificate_document_generation` | ❌ 0 |
| Function `finalize_enrollment_certificate_document_generation` | ❌ 0 |
| Functions `mark_..._generating`, `mark_..._uploaded`, `fail_...` | ❌ لم يتم إنشاؤها |
| `assert_enrollment_certificate_pdf_generation_ready` (نسخة bucket) | ❌ لا يزال نسخة HOLD المطلق من G2 |
| `verify_document` (النسخة الأدنى PII) | ❌ لا يزال نسخة G2 |

- **الطلب التجريبي:** `status=in_review`, `updated_at=2026-07-13 17:59:19.782271+00`, لا وثائق (0), لا attempt ✅

**Result:** `HOLD_PR124_MIGRATION_G3_SQL_COMPILATION_ERROR_UNDEFINED_SCHEMA`

**Stopped immediately after G3 failure per stop rules.**

---

## الطلب التجريبي — تأكيد نهائي

- `id = 93807768-a281-42de-bfb4-0c0c03786b20`
- `status = in_review`
- `updated_at = 2026-07-13 17:59:19.782271+00` (بلا تغيير منذ ما قبل G0)
- 0 صفوف في `official_documents WHERE student_request_id = ...`
- 0 صفوف في `enrollment_certificate_document_generation_attempts` (الجدول غير موجود)
- 0 تنفيذ Saga / Generate / Upload / Sign / Issue / Archive

## Publish/Deploy

- لا Publish ✅
- لا Deploy ✅
- لا تفعيل Feature Flags ✅
- لا تعديل Auth/Roles/Finance ✅
- لا تعديل PR #124 ✅
- لا حذف/Reset/Cleanup ✅

## المانع المتبقّي وطلب المالك

الملف المصدري في `supabase/migrations/20260714010000_enrollment_certificate_pdf_storage_saga_completion_01.sql` يحتاج تصحيحاً مصدرياً على `main` قبل إعادة محاولة G3:

- استبدال `undefined_schema` في كل من `_ec_new_verification_token` و `_ec_sha256_hex` بشرط استثناء PL/pgSQL صالح (مثل `invalid_schema_name`) أو حذفه (والاكتفاء بـ`undefined_function`)، ثم فتح مرحلة جديدة لإعادة تطبيق G3 فقط.

الحاوية الخاصة `official-documents` جاهزة ومنتظرة G3 المصحّحة. لا حاجة لإعادة إنشائها.

---

## Final Decision

**HOLD_ENROLLMENT_CERTIFICATE_PR124_SEQUENTIAL_MIGRATIONS_G3_SQL_COMPILATION_ERROR**
