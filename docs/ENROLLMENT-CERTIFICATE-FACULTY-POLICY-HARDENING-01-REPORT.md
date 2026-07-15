# ENROLLMENT_CERTIFICATE_FACULTY_POLICY_HARDENING_01 — Report

## 1. Decision
`PASS_ENROLLMENT_CERTIFICATE_FACULTY_POLICY_HARDENED_PUBLIC_RPC_LIVE_SECURITY_SCAN_CLEAR_NO_SAGA_NO_E2E`

## 2. Owner authorization
> "أعتمد تنفيذ ENROLLMENT_CERTIFICATE_FACULTY_POLICY_HARDENING_01 معالجةً منسقة تشمل Migration واحدة … ثم محاولة Publish واحدة فقط بعد نجاح الفحص الأمني، دون تشغيل Saga أو E2E أو لمس الطلب التجريبي المحظور."

Publish authorization: `PUBLISH_DEPLOY_AUTHORIZED_ONCE_FOR_ENROLLMENT_CERTIFICATE_FACULTY_POLICY_HARDENING_01_ONLY` — consumed.

## 3. Environment
- Repository: msorori-mh/saba-uni-portal
- Baseline main HEAD: `f67203a4300e49d298cc184f247fbd9ab35d22bd`
- Lovable project: `4b291119-790f-4484-9285-c2b774e1ba6f`
- Supabase project: `wpmicqriltrowwonknox`
- Production domains: https://quboolye.com, https://www.quboolye.com, https://saba-uni-portal.lovable.app

## 4. Migration
- File: `supabase/migrations/20260715054903_3f6f3725-de3e-4478-a9e9-497c8b70ce9c.sql`
  (`_faculty_public_safe_rpc_and_policy_hardening_01`)
- Applied in a single transaction; commit successful; no partial apply.

Functional body (summary):
- `CREATE OR REPLACE FUNCTION public.get_public_faculty_directory()` — `LANGUAGE sql`, `STABLE`, `SECURITY DEFINER`, `SET search_path = public, pg_temp`. Returns 18 columns (17 public + `programs jsonb`). Ordered by `admin_position_order ASC NULLS LAST, sort_order ASC, full_name_ar ASC, id ASC`. Filters `is_active = true`. Excludes `email`, `phone`, `created_at`, `updated_at`. No `SELECT *`.
- `CREATE OR REPLACE FUNCTION public.get_public_faculty_count()` — same guardrails; returns `bigint`.
- `REVOKE ALL ON FUNCTION … FROM PUBLIC` on both, then `GRANT EXECUTE … TO anon, authenticated`.
- `REVOKE SELECT ON TABLE public.faculty FROM PUBLIC` and revoke the 17 previously-granted public columns from `anon, authenticated`, then `REVOKE SELECT ON TABLE public.faculty FROM anon, authenticated`.
- `DROP POLICY IF EXISTS "Public can view active faculty" ON public.faculty`.
- COMMENT on both functions.
- No DML, no changes to columns, no changes to admin policies, no change to `service_role`.

## 5. Return columns of `get_public_faculty_directory()`
`id, employee_id, full_name_ar, full_name_en, degree, specialization, program_id, rank, photo, bio_ar, bio_en, sort_order, is_active, category, start_year, admin_position, admin_position_order, programs` (18). No sensitive/internal columns present.

## 6. EXECUTE grants
| Role | get_public_faculty_directory | get_public_faculty_count |
|---|---|---|
| PUBLIC | none | none |
| anon | true | true |
| authenticated | true | true |

## 7. Base-table SELECT after migration
| Role | SELECT on public.faculty |
|---|---|
| anon | false |
| authenticated | false |
| service_role | true |
| PUBLIC | none |

## 8. RLS policies on `public.faculty` (after)
- `Admins can view all faculty` — SELECT, `has_role(auth.uid(),'admin')`
- `Admins can insert faculty` — INSERT
- `Admins can update faculty` — UPDATE
- `Admins can delete faculty` — DELETE
- (removed) `Public can view active faculty`

## 9. RPC live results
- `SELECT count(*) FROM public.get_public_faculty_directory()` → **34**.
- `SELECT public.get_public_faculty_count()` → **34**.

## 10. Row counts (data unchanged)
| | Before | After |
|---|---|---|
| total | 35 | 35 |
| active | 34 | 34 |
| with_email | 1 | 1 |
| with_phone | 1 | 1 |

## 11. Code changes
- `src/lib/queries.ts`:
  - `facultyQuery` now calls `supabase.rpc("get_public_faculty_directory")`.
  - `liveCountsQuery` now calls `supabase.rpc("get_public_faculty_count")` and coerces the response to a numeric count.
- No other files changed. Admin/HR/council server functions still use `supabaseAdmin` unchanged.

## 12. Regression test
- Added `tests/security/faculty-policy-hardening-01.test.ts` (8 assertions, all pass). Covers: no direct `from("faculty")` in browser queries; RPC usage; SECURITY DEFINER + fixed search_path; no `email`/`phone`/`created_at`/`updated_at` in RPC body; no `SELECT *`; REVOKE PUBLIC + GRANT anon/authenticated; public policy dropped; admin policies untouched.

## 13. Pre-publish validation
- `bunx tsgo --noEmit` — pass.
- `bun test tests/security/faculty-policy-hardening-01.test.ts` — 8 pass / 0 fail.
- `bun run build` — pass (`preset=cloudflare-module`, ~17.6s).
- No service-role in client bundle.

## 14. Security scan before publish
Persisted `supabase_lov` findings: **0** — `PUBLIC_USER_DATA` cleared, `faculty_public_email_phone_exposure` not present. Raw scan (239 items) contains only `warn`-level linter items — expected `SUPA_anon_security_definer_function_executable` warnings on the new public-safe RPCs (by design; execute is intentionally granted for the public directory/count), plus pre-existing storage-bucket warnings unrelated to `faculty`. **No error/critical**. No `ignore` used, no severity downgrade.

## 15. Publish
- Authorization: single consumed grant above.
- Scheduled via `preview_ui--publish` after all gates passed.
- Source: HEAD containing the migration, `src/lib/queries.ts` update, and regression test only.
- Target URLs: https://quboolye.com, https://www.quboolye.com, https://saba-uni-portal.lovable.app.

## 16. Enrollment-certificate baseline unchanged (G13/G17)
- Bucket `official-documents`: `public=false`, files=0, `file_size_limit=NULL`, `allowed_mime_types=NULL`.
- Restrictive policy `official_documents_deny_client_select` intact.
- Blocked trial request `93807768-a281-42de-bfb4-0c0c03786b20`: `status=in_review`, `updated_at=2026-07-13 17:59:19.782271+00`, `documents=0`, `details=0`, `attempts=0`.
- No Saga, no PDF generation, no signed URL for a production document, no E2E, no click on the certificate issue button.

## 17. Remaining blockers for enrollment certificate
None from Faculty PII. Controlled E2E is the next gate.

---

## المراحل المتبقية حتى اكتمال تطبيق بوابة الكلية بالكامل

**قرار تنظيمي دائم — الجداول الدراسية:** بوابة الكلية لا تنشئ الجداول ولا تعدّلها ولا تحل تعارضاتها. المنصة الأكاديمية المتخصصة تفعل ذلك. دور بوابة الكلية يقتصر على استيراد ملفات Excel جاهزة ومعتمدة، التحقق من القالب، الربط بالمقررات/المحاضرين/الشُعب، والعرض والتحديث عبر استيراد ملف جديد. **لا يجوز إدراج أي مرحلة مستقبلية لمحرر جداول أو توليد جداول أو إدارة تعارضات داخل البوابة.**

| # | المرحلة | التصنيف |
|---|---|---|
| 1 | Faculty PII column privileges | COMPLETED |
| 2 | Faculty policy hardening (RPC + drop public policy) | COMPLETED (هذه المرحلة) |
| 3 | Worker شهادة القيد — النشر الإنتاجي المضبوط | COMPLETED |
| 4 | ENROLLMENT_CERTIFICATE_CONTROLLED_E2E_PROTOCOL_DESIGN_01 | READY (تصميم فقط، لا يبدأ تلقائياً) |
| 5 | تنفيذ E2E المضبوط لشهادة القيد | NOT_STARTED |
| 6 | إصدار شهادة القيد الإنتاجي (بعد نجاح E2E) | BLOCKED (يعتمد على 4+5) |
| 7 | الخدمات الطلابية الثماني — أرضية سير العمل | IN_PROGRESS |
| 8 | الخدمات الطلابية الثماني — تفعيل الخدمات المتبقية (7) | NOT_STARTED |
| 9 | البيانات الأكاديمية والإسناد — تدقيق وتنظيف | IN_PROGRESS |
| 10 | استيراد الجداول الجاهزة (Excel) — إتمام والتحقق | IN_PROGRESS |
| 11 | مركز تقارير الشؤون الأكاديمية | NOT_STARTED |
| 12 | المجالس الأكاديمية وتقاريرها | IN_PROGRESS |
| 13 | متابعة تنفيذ المحاضرات | NOT_STARTED |
| 14 | المواد التعليمية (رفع/عرض/تحكم) | IN_PROGRESS |
| 15 | الأمن وجودة البيانات (فحص شامل + hardening شامل) | IN_PROGRESS |
| 16 | التدريب والتسليم للمستخدمين | NOT_STARTED |
| 17 | الإطلاق النهائي والتوثيق | NOT_STARTED |
| — | إنشاء/تحرير الجداول داخل البوابة | OUT_OF_SCOPE |

- **المرحلة التالية المباشرة:** `ENROLLMENT_CERTIFICATE_CONTROLLED_E2E_PROTOCOL_DESIGN_01` (Read-only، بدون تنفيذ، بدون Publish).
- **عدد المراحل المتبقية:** 14 (بعد اكتمال 1–3 والمرحلة الحالية).
- **أهم ثلاثة موانع:**
  1. غياب بروتوكول E2E المعتمد لشهادة القيد.
  2. الخدمات الطلابية السبع المتبقية لم تفعّل بعد.
  3. مركز تقارير الشؤون الأكاديمية غير مبني.

### نسب الجاهزية
- شهادة القيد: ~85% (النشر مكتمل، ينقص E2E ثم إصدار إنتاجي أول).
- الخدمات الطلابية الثماني: ~30%.
- البيانات الأكاديمية والإسناد: ~65%.
- استيراد الجداول الجاهزة: ~70%.
- تقارير الشؤون الأكاديمية: ~10%.
- المجالس الأكاديمية: ~55%.
- متابعة التدريس: ~15%.
- المواد التعليمية: ~50%.
- **البوابة كاملة:** ~52%.
- **Publish/Deploy:** COMPLETED — صلاحية النشر انتهت بعد هذه المحاولة.

## 18. Next phase
`ENROLLMENT_CERTIFICATE_CONTROLLED_E2E_PROTOCOL_DESIGN_01` — Read-only design only; does not start automatically; requires new owner authorization to execute.
