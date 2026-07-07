# STUDENT-REQUESTS-P1-FOUNDATIONS-REVIEW-01 Report

**التاريخ:** 2026-07-07  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**النوع:** مراجعة read-only — migration P1 Foundations  
**المراجع:**  
- `supabase/migrations/20260711020000_student_requests_p1_foundations.sql`  
- `docs/STUDENT-REQUESTS-P1-FOUNDATIONS-01-REPORT.md`  
- `docs/STUDENT-REQUESTS-WORKFLOW-CANONICAL-SPEC-01.md`  
- `docs/STUDENT-REQUESTS-WORKFLOW-GAP-AUDIT-01-REPORT.md`

---

## 1. Executive Summary

| البند | النتيجة |
|-------|---------|
| **القرار** | **PASS_WITH_NOTES** |
| **Additive فقط؟** | **نعم** |
| **آمنة لتطبيق staging لاحقاً؟** | **نعم** — بعد التأكد من تطبيق migrations 130000–190000 مسبقاً |
| **Blockers** | **0** |

الـ migration additive بالكامل: لا حذف، لا تعديل بيانات، لا cutover، لا تغيير سلوك الطلبات الحالي. RPC stubs read-only وغير موصولة بـ create/submit. الجداول الجديدة مغلقة بـ RLS بدون policies.

---

## 2. Migration Reviewed

```
supabase/migrations/20260711020000_student_requests_p1_foundations.sql
```

**695 سطر** — timestamp `20260711020000` (بعد `20260711000000`).

---

## 3. Safety Review

| Pattern | موجود؟ | التقييم |
|---------|--------|---------|
| `DROP TABLE` | ❌ | — |
| `DROP COLUMN` | ❌ | — |
| `DELETE FROM` | ❌ | — |
| `TRUNCATE` | ❌ | — |
| `UPDATE` على بيانات | ❌ | — |
| `ALTER TYPE` | ❌ | — |
| `DISABLE ROW LEVEL SECURITY` | ❌ | — |
| `DROP POLICY` | ❌ | Migration Review CI ✅ |
| Destructive `ALTER` على أعمدة قائمة | ❌ | فقط `ADD COLUMN IF NOT EXISTS` |

### نتائج مطابقة في grep (ليست destructive)

| Match | السياق | آمن؟ |
|-------|--------|------|
| `ON DELETE SET NULL` / `CASCADE` | FK definitions | ✅ |
| `BEFORE UPDATE` | triggers `updated_at` | ✅ |
| `GRANT ... DELETE` | privileges على جداول جديدة | ✅ — RLS يمنع الوصول بدون policies |

**خلاصة:** لا data writes في migration.

---

## 4. Schema Review

### 4.1 `student_profiles` (4 حقول)

| الحقل | Default | NOT NULL | CHECK | يعدّل بيانات قائمة؟ |
|-------|---------|----------|-------|---------------------|
| `student_study_status` | — | nullable | `NULL OR IN ('new','repeat')` | ❌ — NULL للصفوف الحالية |
| `transferred_current_year` | `false` | ✅ | — | ❌ — default يطبّق على إدراج جديد فقط |
| `previous_suspension_semesters_count` | `0` | ✅ | `>= 0` | ❌ |
| `consecutive_suspension_years_count` | `0` | ✅ | `>= 0` | ❌ |

**كافية مبدئياً لوقف القيد (U-SUSP-1):** ✅ — مع stub RPC يفحص ≥2 سنوات / ≥4 فصول / `new` / `transferred_current_year`.

**ملاحظة:** `student_study_status = NULL` لا يُرفض في stub حتى يُملأ بالاستيراد — مقصود للانتقال الافتتاحي.

**غير مغطى بعد (P1b):** `semesters.exams_start_date` لقواعد E-S5/E-S6 — مؤجل.

### 4.2 `student_request_service_windows`

| متطلب Spec | مدعوم؟ | الحقل/الآلية |
|------------|--------|--------------|
| وقف القيد | ✅ | `request_type_code` |
| غياب بعذر | ✅ | نفس الجدول |
| تظلم | ✅ | + `target_semester_id` |
| دور أكتوبر | ✅ | + `max_allowed_courses` |
| تفعيل/تعطيل | ✅ | `is_active` |
| بداية/نهاية | ✅ | `starts_at`, `ends_at` + CHECK `ends_at > starts_at` |
| حد مواد أكتوبر | ✅ | `max_allowed_courses` |
| الفصل المستهدف للتظلم | ✅ | `target_semester_id` |
| نطاق سنة/فصل | ✅ | `academic_year_id`, `semester_id` |

FK → `request_types(code)` **NOT VALID** — آمن حتى P2 code normalization.

### 4.3 `student_request_fee_assessments`

| متطلب | مدعوم؟ |
|-------|--------|
| تحديد مبلغ | ✅ `amount`, `currency` (default `YER`) |
| حالة السداد | ✅ `pending`, `paid`, `waived`, `cancelled` |
| من حدد الرسوم | ✅ `assessed_by`, `assessed_at` |
| من أكد السداد | ✅ `payment_confirmed_by`, `payment_confirmed_at` |
| hafiza placeholder | ✅ `hafiza_reference` |
| integration دفع فعلي | ❌ — عمداً خارج P1 |

**ملاحظة:** لا UNIQUE على `request_id` — يسمح بتعديلات رسوم لاحقة (non-blocking).

### 4.4 Parallel groups (`file_withdrawal`)

| جهة | تمثيل |
|-----|--------|
| الإيرادات | `unit_key` / `processing_unit_id` |
| المكتبة | نفس |
| المعامل | نفس |
| الأنشطة الطلابية | `unit_key` (لا role في staff-functional-roles بعد) |
| `all_required` | ✅ `mode IN ('all_required')` |

جداول: `student_request_parallel_groups` + `student_request_parallel_group_members` — **غير موصولة** بـ runtime.

### 4.5 `central_signatory_references`

| متطلب | مدعوم؟ |
|-------|--------|
| المسجل العام للجامعة | ✅ `code`, `name_ar`, `title_ar`, `scope` |
| نائب رئيس الجامعة | ✅ نفس الجدول |
| ليس `staff_profiles` | ✅ comment + تصميم reference-only |
| U-CERT-1 (شهادة قيد لا تستخدمها) | ✅ comment صريح |
| seed | ❌ — عمداً |

---

## 5. RPC/RLS Review

### 5.1 RPC Stubs

| الدالة | Writes | SECURITY DEFINER | search_path | Grants |
|--------|--------|------------------|-------------|--------|
| `assert_can_read_student_eligibility_context` | ❌ | ✅ | `public, pg_temp` | REVOKE PUBLIC → GRANT authenticated |
| `get_student_request_eligibility_context` | ❌ | ✅ | ✅ | ✅ |
| `check_student_request_basic_eligibility` | ❌ | ✅ | ✅ | ✅ |

- **لا service role** في المتصفح.
- **لا تعديل** على `create_student_request` / `submit_student_request` / `get_available_request_types_for_current_student`.
- **أسماء جديدة** — لا تعارض RPCs موجودة.
- **Auth:** طالب ذاته أو `system_admin`/`admin`/`student_affairs`/`registrar`.

### 5.2 RLS

| الجدول | RLS | Policies | anon |
|--------|-----|----------|------|
| `student_request_service_windows` | ✅ enabled | ❌ none | ❌ no grant |
| `student_request_fee_assessments` | ✅ | ❌ | ❌ |
| `student_request_parallel_groups` | ✅ | ❌ | ❌ |
| `student_request_parallel_group_members` | ✅ | ❌ | ❌ |
| `central_signatory_references` | ✅ | ❌ | ❌ |

**نمط متسق** مع `20260710160000` (processing units): GRANT لـ `authenticated` + RLS بدون policies = **closed by default**؛ الوصول لاحقاً عبر RPCs.

---

## 6. Compatibility Review

### 6.1 Dependencies (يجب أن تكون مطبّقة قبل P1)

| Migration | مطلوب لـ |
|-----------|----------|
| `20260710130000` | `request_types`, audience helpers |
| `20260710140000` | `student_request_type_is_eligible`, `has_any_role` |
| `20260710160000` | `request_processing_units/roles` (parallel members FK) |
| `20260710170000` | `student_request_workflow_steps` (optional parallel FK) |
| `20260531230139` | `academic_years`, `semesters` |
| `update_updated_at_column` | triggers |

### 6.2 تعارض مع 160000–190000

| البند | تعارض؟ |
|-------|--------|
| أسماء جداول | ❌ — أسماء جديدة، لا تكرار |
| workflow runtime | ❌ — لا تعديل على steps/transitions |
| actor RPCs | ❌ — stubs منفصلة |
| legacy `student_service_request_*` | ❌ — لا لمس |

### 6.3 كسر الطلبات الحالية

| السلوك | متأثر؟ |
|--------|--------|
| تقديم طلب generic | ❌ |
| legacy workflow init | ❌ |
| RPC submit/create | ❌ |
| triggers approval (`apply_*_on_approval`) | ❌ |

---

## 7. Findings

### Blocking

*لا يوجد.*

### Non-blocking

| ID | Finding | توصية |
|----|---------|--------|
| NB-1 | `semesters.exams_start_date` غير مضاف | P1b أو P2 قبل تفعيل نافذة وقف القيد الكاملة |
| NB-2 | RPC stubs غير موصولة بـ create/submit | P2+ عند تفعيل eligibility |
| NB-3 | FK service windows NOT VALID | VALIDATE بعد P2 code normalization |
| NB-4 | `student_study_status` NULL لا يمنع في stub | import phase + wire RPC |
| NB-5 | GRANT واسع + RLS closed — نمط المشروع | policies في phase RPC لاحق |
| NB-6 | Gap audit ذكر `request_type_appeal_windows` منفصل — P1 دمج في service_windows + `target_semester_id` | مقبول — document only |

### Notes

- Migration Review CI patterns: **PASS** (no DROP POLICY, DELETE FROM, etc.).
- U-CERT-1 / U-SUSP-1 / U-OCT-1 reflected in schema comments + stub logic.
- `payment_status = paid` (not `confirmed`) — per P1 spec.

---

## 8. Validation

### `npm run build`

```
✓ built successfully
exit_code: 0
elapsed: ~125s
```

### `git diff --check`

```
exit_code: 0
warning: src/routeTree.gen.ts CRLF only (out of scope)
```

### `git status --short`

```
 M src/routeTree.gen.ts
?? docs/... (spec/audit/P1 reports)
?? supabase/migrations/20260711020000_student_requests_p1_foundations.sql
```

### SQL safety scan

```powershell
rg "DROP|DELETE|TRUNCATE|UPDATE|ALTER TYPE|DISABLE ROW LEVEL SECURITY" \
  supabase/migrations/20260711020000_student_requests_p1_foundations.sql
```

**Matches:** FK `ON DELETE`, trigger `BEFORE UPDATE`, `GRANT ... DELETE` — **none are destructive data operations**.

---

## 9. Recommendation

**READY_FOR_STAGING_APPLY_PREP**

شروط التطبيق على staging:

1. التأكد من تطبيق migrations **130000–190000** (وكل ما قبلها) على staging.
2. `supabase db push` أو apply يدوي **بدون seed**.
3. بعد apply: `supabase gen types` (phase منفصلة).
4. لا تفعيل service windows أو wire RPCs حتى P2.

**ليس NEEDS_FIX_BEFORE_APPLY** — الملاحظات NB-1..NB-6 ليست blockers للـ schema foundation.

---

## 10. No-Write Assurance

هذه المراجعة **لم تنفّذ:**

- DB writes / migrations apply / Supabase apply
- seed / Lovable publish
- commit / push / PR
- تعديل `src/routeTree.gen.ts`

**الكتابة الوحيدة:** هذا التقرير.

---

## Appendix — Checklist vs Review Scope

| # | Scope | Result |
|---|-------|--------|
| 1 | Additive safety | ✅ PASS |
| 2 | student_profiles fields | ✅ PASS (note: NULL study_status) |
| 3 | service windows | ✅ PASS |
| 4 | fee assessments | ✅ PASS |
| 5 | parallel groups | ✅ PASS |
| 6 | central signatories | ✅ PASS |
| 7 | RPC stubs | ✅ PASS |
| 8 | RLS | ✅ PASS |
| 9 | naming/compatibility | ✅ PASS |
