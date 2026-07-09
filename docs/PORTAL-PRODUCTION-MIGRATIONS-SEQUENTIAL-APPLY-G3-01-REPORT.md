# PORTAL-PRODUCTION-MIGRATIONS-SEQUENTIAL-APPLY-G3-01 — REPORT

**التاريخ:** 2026-07-09
**Supabase Production Ref:** `wpmicqriltrowwonknox` ✅
**المستودع/الفرع:** `msorori-mh/saba-uni-portal @ main` (الملف مطبَّق كما هو في العمل الحالي)
**المرجع السابق:** G2 → `PASS_G2_APPLIED_READY_FOR_G3`

---

## 1. Target Verification
- `supabase--project_info.ref` = `wpmicqriltrowwonknox` ✅

## 2. Prerequisite Verification
- G1 (`20260710130000`) + G2 (`20260710140000`) نواتجهما موجودة (أعمدة `request_types`، دوال RPC الثمانية، سياسة `sr_update_self` القديمة، `protect_student_request` قديمة).
- الملف المستهدف `20260710150000_student_request_types_rls_submit_bypass_fix.sql` غير مطبَّق قبل هذه المرحلة.

## 3. Baseline (قبل التطبيق)
| البند | القيمة |
|-------|--------|
| `request_types` rows | 12 |
| `student_requests` rows | 15 |
| RLS على `student_requests` | مفعّل |
| `sr_update_self` — WITH CHECK القديم | يسمح بحالات `['draft, submitted, under_review, returned, returned_for_completion, cancelled]` (بلا حماية من الانتقال إلى submitted) |
| `protect_student_request` — قديم | SECURITY DEFINER, search_path=public (بدون فحص `via_rpc`) |
| `submit_student_request` — قديم | SECURITY DEFINER, search_path=public (بدون `set_config`) |
| trigger `trg_sr_protect` | موجود ومفعّل (O) |
| policies على `student_requests` | 9 قبل، 9 بعد ✅ (استبدال فقط) |

## 4. Apply Method
- استُدعي `supabase--migration` مرة واحدة بمحتوى ملف G3 حرفياً — بدون تعديل، بدون دمج مع migrations أخرى، بدون إصلاحات anon/default privileges خارج نطاق الملف.

## 5. Statement-by-statement Result
| القسم | النتيجة |
|-------|--------|
| `DO $$ … DROP POLICY sr_update_self` | ✅ |
| `CREATE POLICY sr_update_self` (WITH CHECK مقيدة بـ `draft/returned/returned_for_completion/cancelled`) | ✅ |
| `COMMENT ON POLICY` | ✅ |
| `CREATE OR REPLACE FUNCTION protect_student_request()` (مع `v_via_rpc` من `student_request.submit_via_rpc`) | ✅ |
| `CREATE OR REPLACE FUNCTION submit_student_request(uuid)` (مع `set_config('student_request.submit_via_rpc','1',true)`) | ✅ |
| `REVOKE ALL … FROM PUBLIC` + `GRANT EXECUTE … TO authenticated` | ✅ |

النتيجة الإجمالية: **The migration completed successfully.**

## 6. Migration History
- سُجِّلت `20260710150000_student_request_types_rls_submit_bypass_fix` مرة واحدة بعد التطبيق. ✅
- Migrations اللاحقة (`20260710160000` وما بعدها) لم تُسجَّل ولم تُطبَّق. ✅

## 7. RLS Policy Definition — قبل/بعد
| البند | قبل | بعد |
|-------|-----|-----|
| `sr_update_self` USING statuses | `draft, submitted, under_review, returned, returned_for_completion` | `draft, returned, returned_for_completion, submitted, under_review, in_review` ✅ (مطابق للملف حرفياً) |
| `sr_update_self` WITH CHECK statuses | `draft, submitted, under_review, returned, returned_for_completion, cancelled` | `draft, returned, returned_for_completion, cancelled` ✅ (**حذف `submitted` و`under_review`**) |
| roles | `{authenticated}` | `{authenticated}` |
| cmd | UPDATE | UPDATE |

باقي السياسات (`sr_delete_admin`, `sr_delete_self`, `sr_insert_priv`, `sr_select_*`, `sr_update_priv`) لم تُلمس. لا سياسة جديدة توسّع الكتابة العامة.

## 8. Submit-Bypass Closure Verification
- WITH CHECK الجديد يمنع الطالب من كتابة صف بحالة `submitted` عبر UPDATE مباشر → RLS يرفض الصف قبل الوصول للـtrigger.
- حتى إذا مرّ عبر RLS (سياسة أوسع في نطاق آخر)، الـtrigger `protect_student_request` يرفع `EXCEPTION: يجب إرسال الطلب عبر submit_student_request() وليس التحديث المباشر` ما لم يُضبط `student_request.submit_via_rpc = '1'` في نفس المعاملة (transaction-local `set_config(..., true)`).
- الـRPC `submit_student_request` وحده يضبط هذا العلم بعد `assert_student_can_use_request_type`، فينفتح مسار الإرسال الشرعي فقط.
- طبقتان دفاعيتان (RLS + trigger) تُغلقان الالتفاف.

## 9. Data Impact
| جدول | قبل | بعد |
|------|-----|-----|
| `request_types` | 12 | **12** ✅ |
| `student_requests` | 15 | **15** ✅ |
- لا INSERT/UPDATE/DELETE على أي بيانات.

## 10. Duplicate / Partial Apply Audit
- `protect_student_request` — 1 صف في `pg_proc` ✅
- `submit_student_request` — 1 صف في `pg_proc` ✅ (لا overload قديم)
- `sr_update_self` — 1 سياسة ✅
- إجمالي policies على `student_requests` = 9 (قبل/بعد) → لا سياسة مضافة/مفقودة.

## 11. Supabase Database Linter
- قبل G3: **188** warning (نهاية G2).
- بعد G3: **188** warning.
- **جديد:** لا شيء.
- **اختفى:** لا شيء.
- **غير مرتبط:** كل التحذيرات موروثة (Public Buckets، `0011_function_search_path_mutable`، `0028_anon_security_definer_function_executable` على دوال G2). G3 لا يضيف SECURITY DEFINER جديدة (يستبدل قائمتين فقط بنفس التوقيع).
- ملاحظات G2 المفتوحة (anon EXECUTE / search_path على IMMUTABLE) **لم تُعالج** — خارج نطاق هذه المرحلة عمداً.

## 12. Subsequent Migrations Not Applied
- `20260710160000_student_request_processing_units_schema.sql` — **غير مطبَّقة** ✅
- كل ما بعدها — **غير مطبَّقة** ✅

## 13. Publish / Deploy
- **لم يُنفَّذ** Publish ولا Deploy ولا تعديل كود Lovable ولا تغيير هوية بصرية. ✅

## 14. Errors / Partial Apply
- لا أخطاء، لا تطبيق جزئي، لا rollback.

---

## 15. القرار النهائي

# ✅ PASS_G3_APPLIED_READY_FOR_G4

**التزامات مؤكَّدة:**
- لم تُعدَّل migration.
- لم تُطبَّق migration أخرى.
- لا Reset/Cleanup/DELETE/UPDATE بيانات.
- لا تعديل default privileges ولا صلاحيات RPC خارج الملف.
- لا Publish/Deploy/تعديل كود/تعديل هوية بصرية.

**التوصية:** الانتظار لأمر صريح لبدء G4.

---
*نهاية التقرير — G3*
