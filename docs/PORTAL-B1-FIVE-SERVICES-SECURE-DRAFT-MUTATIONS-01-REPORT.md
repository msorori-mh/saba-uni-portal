# PORTAL-B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01

التاريخ: 2026-07-25  
الفرع: `feat/b1-five-services-secure-draft-mutations-01`  
Base PR: `#227` (`feat/b1-five-services-secure-read-contracts-01`)  
السياسة: SOURCE-ONLY — لا Migration apply، لا Production/Staging، لا Deploy/Publish، لا activation، لا `student_visible`، لا merge.

## القرار

`PASS_B1_FIVE_SERVICES_SECURE_DRAFT_MUTATIONS_SOURCE_READY`

## التصميم (بعد تدقيق المصدر)

| قرار | الأساس |
| --- | --- |
| عقدان ذريّان منفصلان عن submit | Freeze يعرّف `submit_b1_student_request_atomic` فقط؛ لا create/save سابقًا |
| هوية من `auth.uid()` فقط | نفس نمط secure-read / create_student_request |
| stored types من الـfreeze | `enrollment_suspension` / `absence_excuse` / `transfer` / `extra_chance` / `file_withdrawal` |
| لا اشتراط `student_visible` عند الإنشاء | يسمح بالاختبار المصدري دون activation |
| لا تفاصيل عند create | التفاصيل تُزامَن عند save عند اكتمال الحقول NOT NULL |
| allowlist صارم = DENY | نفس مفاتيح `persist_validated_b1_request_details` |
| draft soft vs submit hard | المسودة قد تكون ناقصة؛ submit يبقى صاحب التحقق النهائي |
| idempotency | جدول `b1_draft_mutation_idempotency` + مفتاح اختياري (لا يوجد correlation في مسار B1) |
| تفرد المسودة المفتوحة | partial unique index + `pg_advisory_xact_lock` |
| concurrency | `p_expected_updated_at` اختياري → `B1_STALE_REQUEST_VERSION` |

## RPC signatures

```sql
create_b1_request_draft_for_student(
  p_canonical_code text,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb;

save_b1_request_draft_for_student(
  p_request_id uuid,
  p_form_data jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb;
```

DTO العائد = شكل `B1SecureDraft` / `get_b1_request_draft_for_student`  
(`requestId`, `serviceCode`, `formData`, `attachments`, `status:'draft'`, `updatedAt` من DB).

Submit يبقى: `submit_b1_student_request_atomic` (خارج هذا المسار).

## Field allowlists

| خدمة | مفاتيح مسموحة |
| --- | --- |
| enrollment_suspension | target_academic_year, target_semester, suspension_reason, suspension_duration_type, notes, terms_acknowledgment |
| excused_absence | course_section_id, absence_date, reason_type, absence_reason_detail, excuse_documents |
| department_transfer | target_department_id, target_program_id, transfer_reason, secondary_certificate_file |
| final_chance | target_academic_year, target_semester, reason, chance_type |
| file_withdrawal | withdrawal_reason, impact_acknowledgment |

مرفوض دائمًا: حقول إضافية، amount/currency/invoice، storage coordinates، status/timestamps/actor ids، current_department_id من العميل.

## Draft vs submit validation

| | Draft save | Submit (`persist_validated_*`) |
| --- | --- | --- |
| allowlist | إلزامي | إلزامي |
| حقول ناقصة | مسموح | مرفوض |
| terms / impact ack | اختياري في المسودة | إلزامي true عند الإرسال |
| أطوال الأسباب | غير مفروضة جزئيًا | مفروضة |
| trusted refs | عند اكتمال الزوج/المرجعية | إلزامي |
| attachments cardinality | خارج payload (مصفوفة UUIDs فقط إن وُجدت) | عبر مسار submit |

`excused_absence` يستخدم `absence_date` الواحد وفق الـfreeze (لا زوج start/end في العقد).

## Authorization matrix (ملخّص)

| حالة | create/save |
| --- | --- |
| طالب مالك | ALLOW |
| طالب آخر | DENY opaque (`B1_DRAFT_ACCESS_DENIED`) |
| موظف بلا ملف طالب / مسند | DENY |
| admin / registrar / dean بلا ملف طالب | DENY |
| anon | AUTHENTICATION_REQUIRED |
| status ≠ draft | DENY opaque |
| نوع خارج الخمس | B1_CANONICAL_CODE_REQUIRED |
| حقل إضافي / مالي | B1_UNEXPECTED_FORM_FIELD |
| idempotency نفس المفتاح + حمولة مختلفة | B1_IDEMPOTENCY_PAYLOAD_MISMATCH + zero mutation |
| stale `expected_updated_at` | B1_STALE_REQUEST_VERSION |

## Sequence / order

| السجل | القيمة | السبب |
| --- | --- | --- |
| PROMOTION-MAP | **order 21** | أول رقم بعد secure-read (20) |
| B1-SEQUENTIAL-APPLY-MANIFEST | **sequence_order 21** | أول رقم بعد payment predecessor guard (20) |
| Activation gate (وثائقي) | **gate 22** | تجنّب تصادم اسمي مع sequence_order 21 |

Migration: `supabase/migrations/20260725140000_b1_21_secure_draft_mutations_01.sql` — **NOT APPLIED**.

## Wrappers / DTOs

`src/lib/student-requests/b1-secure-draft/`:

- `createB1Draft` / `saveB1Draft` (server fns، بدون actor ids)
- لا تعديل `adapter.live`
- secure-read stubs السابقة تفوّض إلى هذه العقود

## PostgreSQL 17 results

Harness: `tests/b1-secure-draft/pg/run-harness.ps1`  
النتيجة: **`B1_SECURE_DRAFT_PG17_PASS`** (24/24) على PostgreSQL 17.10  
يشمل: create×5، save، partial، validation، idempotency mismatch+zero mutation، dedupe، isolation، role denials، submitted deny، trusted transfer/absence، secure-read capability regression، لا workflow runtime.  
الحاوية تُوقف دائمًا.

## الاختبارات

| أمر | نتيجة |
| --- | --- |
| PG17 draft harness | PASS (24/24) |
| `bun test tests/student-requests` | 628 pass |
| `bun test tests` | 1565 pass |
| `bunx tsc --noEmit` | PASS |
| eslint مملوك | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |

## المخاطر المتبقية

1. `adapter.live` ما زال بحاجة لربط لاحق — لم يُعدَّل هنا.
2. Secure-read helpers تُعاد تعريفها CREATE OR REPLACE داخل مسار الكتابة للتوافق مع harness المصفوفة؛ يجب تطبيق secure-read ثم draft mutations بالترتيب على البيئات الحقيقية.
3. لا apply على Production/Staging؛ التفعيل منفصل (gate 22).
4. CI عن بُعد قد يبقى محجوبًا بفوترة Actions → `HOLD_REMOTE_CI_BILLING_NO_JOB_STEPS` إن تكرر.

## تأكيدات الحظر

- لا Production / Staging apply  
- لا Deploy / Publish  
- لا workflow activation / لا `student_visible`  
- لا merge لـ PR #227 أو هذا الـPR  
