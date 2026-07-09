# PORTAL-PRODUCTION-MIGRATIONS-PREFLIGHT-01 — REPORT

**التاريخ:** 2026-07-09  
**Lovable Project:** `4b291119-790f-4484-9285-c2b774e1ba6f`  
**Supabase project ref (متصل):** `wpmicqriltrowwonknox` ✅  
**البيئة:** Production (Staging مجمد ولا يستخدم)  
**النطاق:** قراءة فقط — لم يُنفَّذ أي DDL/DML، ولا publish، ولا تعديل ملفات مشروع، ولا تسجيل migrations، ولا تعديل secrets.

---

## 1. Target Project Verification

| البند | القيمة |
|-------|--------|
| مطلوب | `wpmicqriltrowwonknox` |
| فعلي (من `supabase--project_info`) | `wpmicqriltrowwonknox` |
| المطابقة | ✅ صحيح — تعمل على مشروع الإنتاج المستهدف |

---

## 2. Current Migration History (Production)

- عدد السجلات الكلية: قراءة كاملة عبر `supabase_migrations.schema_migrations`.
- **آخر migration مسجلة:** `20260705232121` (بلا تغيير منذ فحوصات سابقة).
- **أي من migrations التسع مسجل؟** ❌ لا شيء (استعلام `version >= '20260710130000'` → 0 صفوف).

---

## 3. Migration-by-Migration Status

فحص وجود الكائنات الفعلية (جداول، أعمدة، دوال، سياسات) لكل migration:

| # | Migration | مسجلة؟ | كائنات موجودة؟ | التصنيف |
|---|-----------|--------|-----------------|---------|
| 1 | `20260710130000_student_request_types_schema` | ❌ | `request_types.request_audience`=NO، `.ineligible_display_mode`=NO، `sr_type_chk` قائم (سيسقطه المهجر)، FK `student_requests_type_request_types_code_fk`=NO | **NOT_APPLIED** |
| 2 | `20260710140000_student_request_types_rpc_rls` | ❌ | `get_available_request_types_for_current_student`=NO، `create_student_request`=NO، `submit_student_request`=NO، `get_my_student_requests`=NO؛ سياستا `sr_insert_self` و`sra_insert` موجودتان (سيسقطهما المهجر ثم يعيد إنشاءهما) | **NOT_APPLIED** (سيعيد كتابة سياستين موجودتين — سلوك مقصود) |
| 3 | `20260710150000_student_request_types_rls_submit_bypass_fix` | ❌ | `sr_update_self` موجودة (سيسقطها المهجر ثم يعيد إنشاءها بتعبير جديد)، `protect_student_request` موجودة (CREATE OR REPLACE) | **NOT_APPLIED** (سيعيد كتابة سياسة/دالة قائمة — سلوك مقصود) |
| 4 | `20260710160000_student_request_processing_units_schema` | ❌ | `request_processing_units`=NO، `request_processing_roles`=NO، `request_processing_assignments`=NO | **NOT_APPLIED** |
| 5 | `20260710170000_student_request_admin_workflow_schema` | ❌ | `request_type_workflows`=NO، `..._steps`=NO، `..._transitions`=NO، `student_request_workflow_steps`=NO، `student_request_workflow_events`=NO | **NOT_APPLIED** |
| 6 | `20260710180000_student_request_actor_rpc_rls` | ❌ | `act_on_student_request_step`=NO، `get_my_request_actor_inbox`=NO، بقية الدوال=NO | **NOT_APPLIED** |
| 7 | `20260710190000_student_request_workflow_runtime` | ❌ | `initialize_student_request_workflow`=NO؛ سيعيد كتابة `submit_student_request` (CREATE OR REPLACE) | **NOT_APPLIED** |
| 8 | `20260711000000_staff_profiles_university_email` | ❌ | `staff_profiles.email`=NO (تأكد إضافي: `count(email)` رجع `ERROR 42703: column "email" does not exist`) | **NOT_APPLIED** |
| 9 | `20260711020000_student_requests_p1_foundations` | ❌ | `student_profiles.student_study_status`=NO، `.transferred_current_year`=NO، جداول `student_request_service_windows` / `student_request_fee_assessments` / `student_request_parallel_groups` / `student_request_parallel_group_members` / `central_signatory_references`=NO | **NOT_APPLIED** |

**الخلاصة:** جميع الـ 9 migrations **NOT_APPLIED** — لا سجل ولا كائنات ناتجة عنها.

---

## 4. Existing Schema Objects Touched (Pre-existing)

| الكائن | الحالة الحالية | تأثير المهجر |
|--------|---------------|----------------|
| `student_requests.sr_type_chk` | موجود (CHECK قديم) | Migration #1 يسقطه ثم يضيف FK — آمن |
| Policy `sr_update_self` | موجودة (بصيغة قديمة) | Migration #3 يسقطها ويعيد إنشاءها — آمن |
| Policy `sr_insert_self` | موجودة | Migration #2 يسقطها ويعيد إنشاءها — آمن |
| Policy `sra_insert` (student_request_attachments) | موجودة | Migration #2 يسقطها ويعيد إنشاءها — آمن |
| Function `protect_student_request` | موجودة (نسخة أقدم) | Migration #3 يستخدم CREATE OR REPLACE — آمن |
| Function `submit_student_request` | غير موجودة | Migrations #2/#3/#7 تنشئها/تعيد كتابتها بالترتيب — النسخة الأخيرة (من #7) هي النافذة |

**لا** جداول أو دوال أو enums أو triggers متضاربة بأسماء متطابقة وتراكيب مختلفة خارج ما ذُكر أعلاه.  
**لا** توجد كائنات مطابقة للأسماء الجديدة المطلوبة (لم يُطبَّق شيء خارج ما هو مسجل).

---

## 5. Partial or Conflicting Objects

- لا حالة **PARTIALLY_APPLIED** — لا يوجد جدول/دالة/عمود من migrations التسع موجودة جزئياً.
- لا حالة **APPLIED_EQUIVALENT** — الكائنات الأصلية المذكورة (سياسات/CHECK) ستُستبدل عمداً وليست معادلة.
- لا حالة **BLOCKED_BY_CONFLICT** — لم تُرصد enums أو constraints أو triggers متعارضة.

---

## 6. Current-Data Compatibility

| الفحص | النتيجة | الأثر |
|-------|---------|-------|
| قيم `student_requests.request_type` غير مُغطاة في `request_types.code` | موجود: `absence_excuse` و`transfer` (مقابل `excused_absence` و`department_transfer`) | FK في migration #1 مضاف بـ `NOT VALID` — **ADD CONSTRAINT ينجح**، لكن أي `VALIDATE CONSTRAINT` لاحق سيفشل حتى تُطبَّع البيانات (مؤجَّل حسب SCHEMA-01 REPORT). RPC `create_student_request` سيرفض هذه الأكواد الجديدة إن لم تُضَف لجدول `request_types`. |
| أعمدة `NOT NULL` جديدة في `student_profiles` | كلها بـ `DEFAULT` (false/0) → لن تفشل | آمن |
| CHECK جديدة على `student_profiles` | تسمح بـ NULL أو تفرض `>= 0` مع default 0 | آمن |
| `UNIQUE` جديدة في `student_request_parallel_groups(student_request_id, group_key)` و`central_signatory_references(code)` | جداول جديدة فارغة | آمن |
| `staff_profiles.email` | عمود جديد بلا `UNIQUE` وبلا `NOT NULL` | آمن |
| CHECK `ends_at > starts_at` على service_windows | جدول جديد فارغ | آمن |

**لا** null-values أو duplicates أو FK violations تمنع تطبيق أي من migrations التسع كما هي مكتوبة.

---

## 7. RLS & Security Observations

- كل الجداول الجديدة (7 جداول) تُنشَأ ثم `ENABLE ROW LEVEL SECURITY` وتُضاف لها سياسات صريحة داخل نفس الـ migration — مطابق لسياسة المشروع.
- الدوال الجديدة تستخدم `SECURITY DEFINER` مع `SET search_path` (تم فحصها في ملفات migrations؛ متوافقة مع لينتر Supabase).
- `GRANT` على الجداول الجديدة لـ `authenticated` / `service_role` موجود ضمن كل migration المعنية.
- إعادة بناء `sr_update_self` يقيّد الطالب بحيث لا يستطيع الانتقال المباشر إلى `submitted` (bypass fix موثق في `STUDENT-REQUEST-TYPES-RLS-SUBMIT-BYPASS-FIX-01-REPORT.md`).
- لا سياسات `TO anon` واسعة تُضاف على بيانات المستخدمين.

---

## 8. Dependency Order (Correct Sequential Apply)

الترتيب المطلوب هو نفسه ترتيب timestamp، ولا يوجد حل عكسي ممكن:

```
1. 20260710130000  → أعمدة request_types + FK NOT VALID              (schema)
2. 20260710140000  → RPCs الطالب + إعادة إنشاء sr_insert_self/sra_insert (تعتمد على #1)
3. 20260710150000  → إحكام sr_update_self + protect_student_request + submit_student_request (تعتمد على #2)
4. 20260710160000  → جداول processing_units/roles/assignments        (مستقل، مطلوب لـ #5)
5. 20260710170000  → جداول workflow (تعتمد على #4 عبر FK)
6. 20260710180000  → RPCs actor + policies (تعتمد على #4 و#5)
7. 20260710190000  → runtime workflow + إعادة كتابة submit_student_request (تعتمد على #5 و#3)
8. 20260711000000  → staff_profiles.email                            (مستقل)
9. 20260711020000  → foundations للطلاب + جداول رسوم/parallel/central signatory (تعتمد على #5 و#7 لبعض المراجع)
```

كل migration لاحقة تفترض توفر ما قبلها. تطبيق غير مرتب سيفشل (FKs / references).

---

## 9. Destructive-Operation Audit

| النوع | نتيجة الفحص |
|-------|--------------|
| `DROP TABLE` | ❌ لا يوجد |
| `TRUNCATE` | ❌ لا يوجد |
| `DISABLE ROW LEVEL SECURITY` | ❌ لا يوجد |
| `DELETE FROM` | ❌ لا يوجد |
| `UPDATE auth.users` | ❌ لا يوجد |
| `DROP POLICY` | ✅ موجود ولكن مقيّد بـ 3 سياسات معروفة (`sr_update_self`، `sr_insert_self`، `sra_insert`) يُعاد إنشاؤها فوراً بنفس migration — سلوك تصميمي وليس تخريبياً |
| Data rewrites/backfills | ❌ لا UPDATE على بيانات موجودة |
| Locking risk | جداول `student_requests` تتلقى `ADD CONSTRAINT ... NOT VALID` (قفل خفيف ACCESS EXCLUSIVE لحظي) و`DROP CONSTRAINT sr_type_chk` — على جدول صغير جداً في الإنتاج، أثر مهمل. `student_profiles` يتلقى `ADD COLUMN ... DEFAULT` بقيم ثابتة (Postgres ≥ 11 = بلا rewrite). |

**التقييم:** لا عمليات مدمرة للبيانات؛ فقط استبدال سياسات RLS بطريقة موثقة ومقصودة.

---

## 10. Idempotency & Safety Review (per file)

| Migration | Idempotency | ملاحظات |
|-----------|-------------|---------|
| #1 | جيد — `ADD COLUMN IF NOT EXISTS`، `DROP CONSTRAINT IF EXISTS`، DO block للـ constraint | آمن للإعادة |
| #2 | جيد — `CREATE OR REPLACE FUNCTION`، `EXECUTE format('DROP POLICY ...')` قبل CREATE | آمن للإعادة |
| #3 | جيد — نفس النمط + `CREATE OR REPLACE` | آمن للإعادة |
| #4 | جيد — `CREATE TABLE IF NOT EXISTS`، `CREATE INDEX IF NOT EXISTS`، DO block للـ triggers | آمن للإعادة |
| #5 | جيد — نفس النمط | آمن للإعادة |
| #6 | جيد — `CREATE OR REPLACE FUNCTION` طوال الملف | آمن للإعادة |
| #7 | جيد — `CREATE OR REPLACE FUNCTION` | آمن للإعادة |
| #8 | جيد — `ADD COLUMN IF NOT EXISTS` بلا UNIQUE | آمن للإعادة |
| #9 | جيد — `ADD COLUMN IF NOT EXISTS`، `CREATE TABLE IF NOT EXISTS`، DO block لكل CHECK/UNIQUE | آمن للإعادة |

GRANT / REVOKE / SECURITY DEFINER / search_path: كلها متوافقة مع قواعد المشروع كما يظهر من grep.

---

## 11. Blocking Findings

**لا توجد** blocking findings تمنع التطبيق التسلسلي:

- لا كائنات موجودة تحت أسماء migrations الجديدة بتراكيب مختلفة.
- لا بيانات حالية تكسر أي `CHECK` / `NOT NULL` / `UNIQUE` مضاف.
- لا FK صارم (`VALIDATE`) يُطبَّق على بيانات غير مطبَّعة (كل FK جديد على `student_requests.request_type` هو `NOT VALID`).
- لا duplicate migration versions.

---

## 12. Required Remediation

**لا يوجد ما يجب إصلاحه قبل التطبيق التسلسلي**، مع الأخذ بعين الاعتبار الملاحظات التالية (غير حاجبة):

1. **بعد** التطبيق، سيبقى `VALIDATE CONSTRAINT student_requests_type_request_types_code_fk` مؤجَّلاً حتى تُنجَز DATA-NORMALIZATION لكودَي `absence_excuse` و`transfer` (موثق في SCHEMA-01).
2. RPC `create_student_request` لن تقبل الكودين القديمين المذكورين، لكن الطلبات القديمة (SELECT/UPDATE draft) ستبقى قابلة للقراءة والتعديل.
3. لا Staging DB متاحة (موثق في `STUDENT-REQUESTS-STAGING-ENV-GATE-01-REPORT.md`) — التطبيق سيكون مباشرة على الإنتاج، ويستوجب:
   - تأكيد snapshot / PITR قبل بدء التسلسل.
   - نافذة صيانة قصيرة.
   - موافقة صاحب المشروع.

---

## 13. Exact Safe Apply Order (بدون تنفيذ)

```
1  20260710130000_student_request_types_schema.sql
2  20260710140000_student_request_types_rpc_rls.sql
3  20260710150000_student_request_types_rls_submit_bypass_fix.sql
4  20260710160000_student_request_processing_units_schema.sql
5  20260710170000_student_request_admin_workflow_schema.sql
6  20260710180000_student_request_actor_rpc_rls.sql
7  20260710190000_student_request_workflow_runtime.sql
8  20260711000000_staff_profiles_university_email.sql
9  20260711020000_student_requests_p1_foundations.sql
```

كل خطوة يجب أن تُطبَّق منفردة، مع فحص Supabase linter بعد كل واحدة، والتوقف عند أول خطأ.

---

## 14. Write / Publish Assurance

| البند | القيمة |
|-------|--------|
| DDL نُفِّذ؟ | ❌ لا |
| DML نُفِّذ؟ | ❌ لا |
| migrations طُبِّقت؟ | ❌ لا |
| ملفات مشروع عُدِّلت؟ | ❌ لا (باستثناء إنشاء هذا التقرير) |
| commit / push؟ | ❌ لا |
| Publish / Deploy؟ | ❌ لا |
| Secrets / env؟ | ❌ لم تُلمَس |
| هوية بصرية؟ | ❌ لم تُلمَس |

---

## 15. Final Decision

# ✅ GO_READY_FOR_SEQUENTIAL_APPLY

جميع الشروط متحققة: المشروع الصحيح متصل، كل الـ 9 migrations `NOT_APPLIED` بلا تعارضات حاجبة، لا بيانات تمنع أي constraint جديد، الترتيب واضح، والعمليات غير مدمرة. التطبيق ممكن بأمان بالترتيب المذكور في §13 — **مع الاحتفاظ بشرط snapshot / PITR وموافقة صاحب المشروع قبل بدء أي apply على الإنتاج** (لأن Staging غير متاحة).

---

*نهاية التقرير — PORTAL-PRODUCTION-MIGRATIONS-PREFLIGHT-01*
