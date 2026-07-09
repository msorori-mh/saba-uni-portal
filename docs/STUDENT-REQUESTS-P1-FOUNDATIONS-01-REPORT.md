# STUDENT-REQUESTS-P1-FOUNDATIONS-01 Report

**التاريخ:** 2026-07-07  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**النوع:** P1 Foundations — migration additive + RPC stubs  
**القرار:** **PASS_WITH_NOTES**

---

## 1. Executive Summary

| البند | القرار |
|-------|--------|
| **القرار** | **PASS_WITH_NOTES** |
| **Additive فقط؟** | **نعم** — أعمدة + جداول + RPC stubs؛ لا UPDATE/seed/cutover |
| **قابل للمراجعة قبل apply؟** | **نعم** |
| **Build** | **PASS** (38s) |

### ما الذي أُضيف

- Migration واحد: `20260711020000_student_requests_p1_foundations.sql`
- 4 أعمدة افتتاحية على `student_profiles`
- 5 جداول foundation جديدة
- 3 دوال RPC (stub/read-only) للأهلية

### ملاحظات (PASS_WITH_NOTES)

1. RPC stubs **غير موصولة** بعد بـ `create_student_request` / `submit_student_request` — عمداً في P1.
2. FK `student_request_service_windows.request_type_code` → `request_types(code)` **NOT VALID** — يُVALIDATE بعد P2 code normalization.
3. `types.ts` لم يُحدَّث — يُولَّد لاحقاً عند apply + gen types.
4. `semesters.exams_start_date` مؤجل — لم يُضمَّ لأنه خارج قائمة P1 الصريحة (يمكن P1b).

---

## 2. Decisions Applied

| القرار | التطبيق في P1 |
|--------|---------------|
| **U-CERT-1** | `central_signatory_references` للجهات المركزية فقط؛ comment يؤكد أن `enrollment_certificate` **لا** يستخدمها. لا seed لجهات مركزية. |
| **U-SUSP-1** | أعمدة `consecutive_suspension_years_count` / `previous_suspension_semesters_count` + فحص في `check_student_request_basic_eligibility` عند `enrollment_suspension`: ≥2 سنوات أو ≥4 فصول → غير مؤهل. |
| **U-OCT-1** | `student_request_service_windows.max_allowed_courses` + metadata في JSON context؛ **لا** RPC حساب مواد راسبة/متبقية بعد (يحتاج grades/plan RPC لاحق). |

---

## 3. Migration Created

```
supabase/migrations/20260711020000_student_requests_p1_foundations.sql
```

**Timestamp:** `20260711020000` (بعد `20260711000000_staff_profiles_university_email.sql`)

---

## 4. Schema Additions

### 4.1 `student_profiles` (4 أعمدة)

| العمود | النوع | Default | CHECK |
|--------|-------|---------|-------|
| `student_study_status` | text nullable | — | `NULL OR IN ('new','repeat')` |
| `transferred_current_year` | boolean | `false` | — |
| `previous_suspension_semesters_count` | integer | `0` | `>= 0` |
| `consecutive_suspension_years_count` | integer | `0` | `>= 0` |

Comments بالعربية/الإنجليزية — حقول **افتتاحية/انتقالية** للاستيراد.

### 4.2 `student_request_service_windows`

نوافذ تفعيل admin لـ: وقف القيد، غياب بعذر، تظلم، دور أكتوبر.

| حقل | الغرض |
|-----|--------|
| `request_type_code` | FK NOT VALID → `request_types(code)` |
| `academic_year_id`, `semester_id`, `target_semester_id` | نطاق زمني/فصل |
| `starts_at`, `ends_at` | فترة التفعيل |
| `is_active` | تفعيل/تعطيل |
| `max_allowed_courses` | حد أكتوبر (U-OCT-1) |
| `notes`, `created_by` | إدارة |

### 4.3 `student_request_fee_assessments`

| حقل | ملاحظة |
|-----|--------|
| `request_id` | FK → `student_requests` CASCADE |
| `amount`, `currency` (default `YER`) | |
| `assessed_by`, `assessed_at` | FK → `auth.users` |
| `payment_status` | `pending`, `paid`, `waived`, `cancelled` |
| `payment_confirmed_by`, `payment_confirmed_at` | |
| `hafiza_reference` | placeholder — لا integration |

### 4.4 Parallel groups

**`student_request_parallel_groups`**

- `student_request_id`, optional `student_request_workflow_step_id`
- `group_key`, `mode` (`all_required`), `status` (`pending`/`completed`/`cancelled`)
- `created_at`, `completed_at`

**`student_request_parallel_group_members`**

- `group_id`, `unit_key` / `processing_unit_id`, `role_key` / `processing_role_id`
- `status`, `acted_by`, `acted_at`, `notes`

### 4.5 `central_signatory_references`

- `code` UNIQUE, `name_ar`, `title_ar`, `scope`, `is_active`, `display_order`
- **بدون seed** — لـ `grade_statement_non_graduate` لاحقاً فقط

---

## 5. RPC Stubs

| الدالة | الغرض | Writes |
|--------|-------|--------|
| `assert_can_read_student_eligibility_context(uuid)` | طالب ذاته أو admin/SA/registrar | لا |
| `get_student_request_eligibility_context(uuid)` | JSON: profile + academic status + decision refs | لا |
| `check_student_request_basic_eligibility(text, uuid)` | audience + U-SUSP-1 rules لـ `enrollment_suspension` | لا |

**Security:** `SECURITY DEFINER`, `SET search_path = public, pg_temp`.

- **Internal helper** `assert_can_read_student_eligibility_context` — `REVOKE ALL FROM PUBLIC, anon, authenticated`; **لا GRANT** لـ `authenticated` (استدعاء داخلي فقط عبر الدالتين القابلتين للقراءة).
- **Client-readable** `get_student_request_eligibility_context` و `check_student_request_basic_eligibility` — `REVOKE ALL FROM PUBLIC, anon` ثم `GRANT EXECUTE TO authenticated` فقط.
- **لماذا لا يكفي `REVOKE FROM PUBLIC` وحده؟** في Supabase/PostgreSQL، `default privileges` قد تمنح `anon` و`authenticated` صلاحية `EXECUTE` تلقائياً على الدوال الجديدة؛ لذلك يجب `REVOKE` صريح من `anon` (و`authenticated` للدالة الداخلية) وليس الاعتماد على سحب `PUBLIC` فقط.

**NULL `student_study_status`:** شرط `IS DISTINCT FROM 'new'` يعامل القيمة الناقصة كغير مؤهلة لـ `enrollment_suspension` — يجب استكمال الحقل بقيمة `new` قبل التشغيل العملي.

**أعمدة default الانتقالية:** `transferred_current_year`, `previous_suspension_semesters_count`, `consecutive_suspension_years_count` لها defaults (`false`/`0`) لكن **لا يجب** تشغيل فحص الأهلية عملياً قبل اكتمال بيانات الاستيراد — القيم الافتراضية ليست بديلاً عن بيانات الطالب الحقيقية.

**Sample return keys:** `is_eligible`, `reasons[]`, `context`, `foundation_phase: 'P1'`.

---

## 6. RLS/Security Notes

| البند | الحالة |
|-------|--------|
| RLS enabled على الجداول الخمسة الجديدة | ✅ |
| Policies | ❌ none — closed by default |
| anon access | ❌ no grants to anon — `REVOKE` صريح من الدوال الثلاث |
| internal helper ACL | ❌ `assert_can_read_student_eligibility_context` — لا GRANT لـ `authenticated` |
| authenticated RPC access | ✅ `get_*` و `check_*` فقط — EXECUTE |
| service role in browser | ❌ not required |
| data writes in RPC stubs | ❌ read-only |
| `student_profiles` new columns | existing RLS unchanged |

---

## 7. Explicit Non-Goals

لم يتم في هذه المرحلة:

- seed / data writes
- code rename (`absence_excuse`, `transfer`)
- workflow cutover أو seed workflows
- UI changes
- payment/hafiza integration
- document generation
- scheduled jobs (`check_due_reinstatements`)
- wiring stubs into create/submit RPCs
- Supabase apply
- commit / push / PR
- تعديل `src/routeTree.gen.ts`

---

## 8. Validation

### `npm run build`

```
✓ built in 38.13s
Exit code: 0
```

### `git diff --check`

```
warning: in the working copy of 'src/routeTree.gen.ts', LF will be replaced by CRLF...
Exit code: 0
```

### `git status --short`

```
 M src/routeTree.gen.ts
?? docs/STUDENT-REQUEST-ENROLLMENT-SUSPENSION-DESIGN-01.md
?? docs/STUDENT-REQUESTS-WORKFLOW-CANONICAL-SPEC-01.md
?? docs/STUDENT-REQUESTS-WORKFLOW-GAP-AUDIT-01-REPORT.md
?? docs/STUDENT-REQUESTS-P1-FOUNDATIONS-01-REPORT.md
?? supabase/migrations/20260711020000_student_requests_p1_foundations.sql
```

---

## 9. First Safe Next Step

**`STUDENT-REQUESTS-P1-FOUNDATIONS-REVIEW-01`**

مراجعة migration في PR مع:

1. Migration Review CI (no DROP POLICY patterns)
2. SQL review: FK NOT VALID strategy
3. قرار: apply على staging أم لا
4. بعد apply: `supabase gen types` + import template update phase

**ثم P2:** code normalization + missing request types seed (بدون workflow activation).

---

## 10. No-Write Assurance

- لا DB writes / لا migrations applied
- لا Supabase apply / لا Lovable publish
- لا commit / push / PR
- الكتابة: migration + هذا التقرير فقط

---

## Appendix — Blockers (none for P1 review)

| Blocker | يمنع P1 review؟ |
|---------|-----------------|
| Dual workflow runtime | لا — P1 additive |
| Missing request types | لا — FK NOT VALID |
| Library/labs app_role | لا — parallel tables unused until P5+ |

**Blockers لاحقة (post-P1):** P2 normalization قبل VALIDATE FK؛ P5 cutover قبل parallel runtime.
