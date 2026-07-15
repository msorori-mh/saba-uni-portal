# ENROLLMENT_CERTIFICATE_G3_STORAGE_POLICY_AND_HELPER_ACL_REMEDIATION_01

## القرار النهائي

**PASS_ENROLLMENT_CERTIFICATE_G3_STORAGE_POLICY_AND_HELPER_ACL_REMEDIATED_AND_VERIFIED_NO_WORKER_NO_E2E_NO_DEPLOY**

## البيئة

- Repository: `msorori-mh/saba-uni-portal`
- main HEAD المرجعي: `e039f2dcf90fdde78ff70067de85e63060b75cad`
- Lovable Project: `4b291119-790f-4484-9285-c2b774e1ba6f`
- Supabase Project: `wpmicqriltrowwonknox`
- Migration المطبَّقة: `enrollment_certificate_g3_storage_policy_and_helper_acl_remediation_01` (Migration واحدة، معاملة واحدة)
- وقت التطبيق: 2026-07-15 (UTC، ضمن هذه المرحلة)

## SQL المعالجة المطبّق (حرفياً)

```sql
DROP POLICY IF EXISTS official_documents_deny_client_select ON storage.objects;

CREATE POLICY official_documents_deny_client_select
ON storage.objects
AS RESTRICTIVE
FOR SELECT
TO anon, authenticated
USING (bucket_id <> 'official-documents');

REVOKE EXECUTE ON FUNCTION public._ec_new_verification_token() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._ec_sha256_hex(text) FROM PUBLIC, anon, authenticated;
```

لا DDL/DML إضافية. إعادة تطبيق G1/G2/G3: لم تحدث.

## G1 — Baseline قبل المعالجة (مطابق للتدقيق)

| البند | القيمة |
|---|---|
| policy permissive | PERMISSIVE |
| roles | {anon,authenticated} |
| qual | `bucket_id <> 'official-documents'` |
| anon EXECUTE `_ec_new_verification_token()` | true |
| authenticated EXECUTE `_ec_new_verification_token()` | true |
| anon EXECUTE `_ec_sha256_hex(text)` | true |
| authenticated EXECUTE `_ec_sha256_hex(text)` | true |
| bucket `official-documents` public | false |
| bucket files | 0 |
| pilot request status | in_review |
| pilot updated_at | 2026-07-13 17:59:19.782271+00 |

## G4 — سياسة Storage بعد المعالجة

| البند | القيمة |
|---|---|
| policyname | official_documents_deny_client_select |
| permissive | **RESTRICTIVE** |
| roles | {anon,authenticated} |
| cmd | SELECT |
| qual | `bucket_id <> 'official-documents'` |
| صفوف بهذا الاسم | 1 |

التغيير الوحيد على `storage.objects` policies: `PERMISSIVE → RESTRICTIVE` على السياسة نفسها. لم تُضف/تُحذف/تُعدل أي سياسة أخرى.

## G5 — الوصول إلى Buckets الأخرى

- السياسة أصبحت RESTRICTIVE، فلا تمنح وصولاً إلى أي Bucket. المجلدات الأخرى تعتمد على سياساتها الخاصة (bucket-scoped) دون أي تأثير من هذه السياسة.
- Bucket `official-documents` يبقى محمياً: RLS مفعّل + السياسة المقيّدة تُسقط أي قراءة على صفوفه من `anon`/`authenticated`.
- ملاحظة: `SET LOCAL ROLE` غير متاح في هذه الأداة → `ROLE_CONTEXT_RUNTIME_CHECK_NOT_AVAILABLE`. الاستنتاج معتمد على تحويل السياسة إلى RESTRICTIVE وعدم وجود سياسة PERMISSIVE واسعة بديلة.

## G6 — Helper ACL بعد المعالجة

`has_function_privilege`:

| الدالة | anon | authenticated |
|---|---|---|
| `public._ec_new_verification_token()` | **false** | **false** |
| `public._ec_sha256_hex(text)` | **false** | **false** |

ACL المتبقّي (aclexplode) للدالتين:

| proname | grantee | privilege |
|---|---|---|
| `_ec_new_verification_token` | postgres | EXECUTE |
| `_ec_new_verification_token` | service_role | EXECUTE |
| `_ec_sha256_hex` | postgres | EXECUTE |
| `_ec_sha256_hex` | service_role | EXECUTE |

لا يوجد PUBLIC EXECUTE. `sandbox_exec` هو دور خدمي داخلي غير معرَّض للعميل.

## G7 — سلامة دوال Saga

دوال Saga (prepare/mark_generating/mark_uploaded/finalize/fail) و `assert_enrollment_certificate_pdf_generation_ready()` لم تُمَس ضمن هذه الـMigration. تعريفاتها وSECURITY DEFINER وsearch_path وGRANT/REVOKE الخاصة بها بقيت كما هي. لم تُنفَّذ أي منها.

## G8 — Bucket والطلب التجريبي

- Bucket `official-documents`: public=false، ملفات=0. **لم يتغير**.
- الطلب `93807768-a281-42de-bfb4-0c0c03786b20`: status=in_review، updated_at=2026-07-13 17:59:19.782271+00. **لم يتغير**.
- لم يحدث Prepare/Generate/Upload/Finalize/Sign/Issue/Archive/Worker/Storage upload/delete/Publish/Deploy.

## نطاق ما لم يُنفَّذ

- لا Worker.
- لا E2E.
- لا Publish/Deploy.
- لا تعديل صلاحيات جدول `storage.objects` نفسه.
- لا تعديل سياسات Buckets الأخرى.
- لا تعديل بيانات طلبات أو Workflows أو Auth/Roles/Finance/Feature Flags.

## المرحلة التالية

`ENROLLMENT_CERTIFICATE_WORKER_STORAGE_READINESS_01` (لا تبدأ تلقائياً).

## المراحل المتبقية حتى الإطلاق

1. إغلاق معالجة Storage/Helper ACL (هذه المرحلة). ✅
2. فحص جاهزية Worker/Storage.
3. E2E شهادة القيد.
4. الأساس المشترك للخدمات الثماني.
5. النماذج والـWorkflows.
6. E2E لكل خدمة والتفعيل التدريجي.
7. نقل المواد التعليمية إلى GitHub ودمجها.
8. تدقيق الأمن والبيانات والواجهات.
9. Publish/Deploy نهائي واحد.
10. اختبار ما بعد الإطلاق والتسليم.

## نسب الجاهزية

| البند | النسبة |
|---|---|
| G3 code/runtime | 100% |
| Storage policy remediation | 100% |
| Helper ACL remediation | 100% |
| G3 post-apply security posture | 100% |
| Worker/Storage readiness | 0% (غير معتمد) |
| Enrollment certificate E2E | 0% (غير مكتمل) |
| Overall final launch readiness | ~35% |

## الموانع المتبقية

- Worker/Storage readiness لم يُفحص.
- E2E شهادة القيد لم يُنفَّذ.
- المواد التعليمية لم تُنقل إلى GitHub.
- `PUBLISH_DEPLOY_FORBIDDEN`.
