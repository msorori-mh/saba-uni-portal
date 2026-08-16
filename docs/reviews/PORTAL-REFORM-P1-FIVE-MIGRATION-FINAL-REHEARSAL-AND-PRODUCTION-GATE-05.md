# PORTAL_REFORM_P1_FIVE_MIGRATION_FINAL_REHEARSAL_AND_PRODUCTION_GATE_05

BASE_SHA=4f24e6a62f4ef6f5e665f3870daec1dfbb01819f
SOURCE_CHANGE=TEST_HARNESS + EXACT_PRECHECK_FIX only
MIGRATIONS_APPLIED=0 · PRODUCTION_WRITES=0 · DEPLOY=0 · PUBLISH=0

## 1. Exact source set (frozen, SHA256_LF_NORMALIZED_V1)

| FILE | SHA256_LF | BYTES | LINES |
|---|---|---|---|
| P1-01-DETAIL-MODELS.sql | 5bfa4b15f9548d281f80fef7f9b8bfb5b064305eca45308aeaf1b302eff76648 | 6874 | 149 |
| P1-02-BACKEND-VALIDATION.sql | 02dfcf494816327419169f678b6375232892cef95d087f09cd75dbfb3ffbe9be | 13731 | 358 |
| P1-03-WORKFLOW-SEEDS.sql | eb68552942c9e8823ae3fd6de1302ce2b65c4b9a161a1a85759eeba2abbbf978 | 6253 | 135 |
| P1-04-GRADE-APPEAL-TRIGGER-REPLACE.sql | d9b2bc25d96bbfd93540f1645d147622ce7a7deadc82fe0248422eb5ae5f6337 | 3968 | 103 |
| P1-05-PASS-THRESHOLD-48.sql | bb43939df053c81ba82b1bb8806ba252da89854c8be671e85757cd9a0f9d679f | 17972 | 440 |

P1_PACKAGE_FILES=5
P1_PACKAGE_SHA256=8407e8dea5188353b9594ea4f85c247d97d2594c586c5c8e38aca9dd17f38f44
(concatenated per-file SHA256_LF digests, in apply order)

### Exact precheck fixes applied to P1-05 (rehearsal-driven, forward-only)

1. **Failing results are no longer rounded up.** `official_result` for raw < 48
   is now `round(pct, 2)`, so 47.99 stays 47.99 instead of displaying 48.0.
   Mirrored in `src/lib/academic/grading-scale.ts` and its pinned test.
2. **Applied final-result appeals are reflected officially.** The transcript view
   now takes the latest `grade_appeal_details.approved_final_result` (only where
   `result_change_applied_at IS NOT NULL`) as the effective total. Coursework
   components are never mutated; the audit before/after stays intact.

## 2–3. PG17 rehearsal — all five drafts executed

Harness `scripts/p1-source-closure-02-pg17/run.sh` now applies
P1-01 → P1-02 → P1-03 → P1-04 → (legacy pre-state) → P1-05, each twice.

- P1_01_PG17=PASS · P1_02_PG17=PASS · P1_03_PG17=PASS · P1_04_PG17=PASS · P1_05_PG17=PASS
- SECOND_APPLY_IDEMPOTENCY=PASS (all five re-applied without error/drift)
- ALL_FIVE_MIGRATIONS_EXECUTED_ON_PG17=PASS

P1-05 was rehearsed against a production-shaped **legacy pre-state**
(`02-p1-05-prereqs.sql`): 60%-pass KPIs, an `avgGpa` progress KPI, and the
28-column 50%-pass transcript view. Verified after apply:

- `get_admin_dashboard_kpis` uses `percentage >= 48`; legacy 60 gone; executes.
- `get_admin_progress_kpis` returns `avgOfficialPercentage`; no `avgGpa`,
  no `gpa_points`, no 4-point mapping; executes.
- `student_unofficial_transcript` replaced legally: 28 legacy columns identical
  in name/order/type, `official_result` and `grade_label` appended (30 total).
- GPA_ACTIVE=0 (regex scan of all three object definitions).

## 4. Official grading boundaries (asserted through the VIEW)

| raw | status | official_result | grade |
|---|---|---|---|
| 47.99 | failed | 47.99 | ضعيف |
| 48.00 | passed | 50 | مقبول |
| 49.99 | passed | 50 | مقبول |
| 50 | passed | 50 | مقبول |
| 64.99 | passed | 65.0 (1-dp display) | مقبول |
| 65 | passed | 65 | جيد |
| 79.99 | passed | 80.0 (1-dp display) | جيد |
| 80 | passed | 80 | جيد جدًا |
| 89.99 | passed | 90.0 (1-dp display) | جيد جدًا |
| 90 | passed | 90 | ممتاز |
| 100 | passed | 100 | ممتاز |

Bands are decided on the RAW percentage, so 64.99/79.99/89.99 keep the lower
band label while the official figure is displayed at one decimal.
OFFICIAL_GRADING_SCALE=PASS · GPA_ACTIVE=0

## 5. October parity (re-tested after P1-05)

- Level 4 + 4 remaining = PASS · Level 4 + 5 remaining = DENY · Level 3 = DENY
- 47.99 still remaining · 48.00 removed · 49.99 removed
- Repeated attempts 47 then 52 → passed exactly once
OCTOBER_ELIGIBILITY=PASS · OCTOBER_PARITY=PASS

## 6. Formal final result appeal (P1-04 × P1-05)

raw before 47 (ضعيف/failed) → approved 48 → official 50 → مقبول → ناجح.
Coursework component unchanged (20/40 intact), `audit_logs` row with
before/after intact, second call idempotent.
FINAL_RESULT_APPEAL=PASS

## 7. Authorization matrix (after all five migrations)

Positive: assigned specialist on the current step; direct assignee wins.
Negative: wrong-unit finance actor, wrong department head binding, unassigned
revenue actor, unassigned registrar, admin, system_admin, anonymous, out-of-order
step, unknown step, same-role peer against a direct assignment — all DENY with
`EXACT_PROCESSING_BINDING_REQUIRED` / `DIRECT_ASSIGNMENT_REQUIRED` /
`STEP_NOT_CURRENT` / `UNKNOWN_STEP`.
AUTHZ_POSITIVE=PASS · AUTHZ_NEGATIVE=PASS · AUTHZ_MATRIX=PASS · DIRECT_RPC_BYPASS=ZERO

## 8. Revenue gates

October registrar finalize and replacement-card issuance both DENY while the
payment step is unconfirmed and PASS after the assigned revenue actor confirms.
Free services skip the gate and create no financial row. No portal fee amount.
REVENUE_GATE=PASS · REPLACEMENT_CARD=PASS · TRANSFER_LEVEL1_DENY=PASS

## 9. Production read-only preflight (new, this package)

Read-only `SELECT` only — no DDL, no DML, no side-effecting RPC.

- `p1_*` objects in production: 0 → no collisions.
- P1 detail tables (october/replacement/final-result appeal): absent → P1-01 creates cleanly.
- `grade_appeal_details` present with the expected base columns; 0 rows → P1-01 column adds are safe.
- `get_admin_dashboard_kpis()` / `get_admin_progress_kpis(integer)` exist with the
  exact signatures P1-05 replaces, and still carry the legacy `>= 60` logic.
- `student_unofficial_transcript` has exactly the 28 legacy columns in the order and
  types P1-05 preserves → `CREATE OR REPLACE VIEW` is legal.
- `trg_apply_grade_appeal_on_approval` present → P1-04 retirement target confirmed.
- Workflow units/roles present; `course_instructor` and `grade_appeal` request type
  absent but self-seeded by P1-03. No `%_v1` workflow exists yet.
- Supporting objects P1-05 reads (`student_course_grade_summary`, `student_fees`,
  `student_payments`, `student_equivalency_credits`) all exist.
- Protected records SR-20260713-2DE64041 / SR-20260715-FEDCB3E1 / SR-20260716-26BAD4C8 unchanged.
- `student_visible` unchanged: october_exam_entry_form=false, replacement_student_card=false;
  the five B1 services remain as they were.

PRODUCTION_PREFLIGHT=PASS
SAFE_TO_APPLY=YES (apply order strictly P1-01 → 02 → 03 → 04 → 05, one at a time)

## 10. Regressions

- STUDENT_REQUEST_TESTS=PASS (`bun test tests/student-requests` — 1093/1093)
- ACADEMIC_TESTS=PASS for P1 scope (`bunx vitest run tests/academic` — 29/29;
  `bun test tests/academic` — 194 pass / 21 fail, all pre-existing
  academic-councils Docker-PG17 harness tests, none P1-related)
- MOBILE_TESTS=PASS (`bun test tests/mobile` — 100/100)
- TYPECHECK=PASS (`bunx tsgo --noEmit`, clean)
- BUILD=PASS (`bun run build`)
- DIFF_CHECK=PASS (`git diff --check`)

## 11. Verdict

MIGRATIONS_APPLIED=0 · PRODUCTION_WRITES=0 · DEPLOY=0 · PUBLISH=0

**PASS_PORTAL_REFORM_P1_FIVE_MIGRATION_FINAL_REHEARSAL_AND_PRODUCTION_GATE_05**

---

## 12. Re-attestation — 2026-08-16 (لا كتابة إنتاجية)

### 12.1 مانع حقيقي اكتُشف في Preflight

قاعدة الإنتاج **لا تحتوي على `request_types.code = 'grade_appeal'`** (12 نوعًا فقط، ولا يوجد أي كود يحتوي `appeal`).
كان `P1-03` يزرع مسار «التظلم على النتيجة النهائية» على هذا النوع، وكان سيفشل بـ
`P1_SEED_UNKNOWN_REQUEST_TYPE: grade_appeal`. لم يظهر ذلك سابقًا لأن harness البروفة كان
يزرع النوع مسبقًا (سطر 158–160 من `00-harness.sql`) فأخفى الفجوة.

إصلاح forward-only (بلا تعديل أي migration مطبقة):

- `P1-03-WORKFLOW-SEEDS.sql`: إضافة `('grade_appeal','التظلم على النتيجة النهائية','academic', true, **false**, 'active_student')`
  إلى INSERT الأنواع مع `ON CONFLICT (code) DO UPDATE SET is_active = true` — `student_visible` يبقى false.
- `scripts/p1-source-closure-02-pg17/00-harness.sql`: حذف الزرع المسبق للنوع، فأصبح
  `request_types` يبدأ فارغًا مطابقًا للإنتاج، وباتت البروفة تثبت اكتفاء P1-03 ذاتيًا.

### 12.2 البصمات بعد إعادة التجميد

| الملف | SHA256 |
| --- | --- |
| P1-01-DETAIL-MODELS.sql | 5bfa4b15f9548d281f80fef7f9b8bfb5b064305eca45308aeaf1b302eff76648 |
| P1-02-BACKEND-VALIDATION.sql | 02dfcf494816327419169f678b6375232892cef95d087f09cd75dbfb3ffbe9be |
| P1-03-WORKFLOW-SEEDS.sql | 4d0d3ad825a43b26a01951cac9be3b351ebf7830086b4721dd123c116fed2b19 |
| P1-04-GRADE-APPEAL-TRIGGER-REPLACE.sql | d9b2bc25d96bbfd93540f1645d147622ce7a7deadc82fe0248422eb5ae5f6337 |
| P1-05-PASS-THRESHOLD-48.sql | bb43939df053c81ba82b1bb8806ba252da89854c8be671e85757cd9a0f9d679f |

P1_PACKAGE_SHA256 = `949094b2c312db8a23d653296a821a9844e980d9d51d7440dcae7f2110d94905`

### 12.3 نتائج إعادة الإثبات

- PG17: تطبيق P1-01 → P1-05 وإعادة تطبيق كل ملف = PASS، `ALL_P1_REHEARSAL_CASES_PASSED`،
  `ALL_P1_05_CASES_PASSED`، `P1_PG17_REHEARSAL_PASS (5/5 drafts)`.
- التقديرات: 47.99 راسب حرفيًا · 48.00 و49.99 → 50 «مقبول» · 65 «جيد» · 80 «جيد جدًا» ·
  90 «ممتاز» · لا أي قيمة على مقياس 4 نقاط · لا معرف GPA في الدوال ولا في السجل.
- دور أكتوبر: مستوى 4 + 4 مقررات = ALLOW · مستوى 4 + 5 = DENY · مستوى 3 = DENY.
- التظلم النهائي: 47 → قرار 48 → نتيجة رسمية 50 «مقبول/ناجح» بدون أي تعديل على مكونات
  أعمال الفصل، مع Audit قبل/بعد.
- الإيرادات والتفويض: البوابة تمنع قبل التأكيد وتفتح بعده، وتتخطى الخدمة المجانية،
  وغير المسند إليه يُرفض بـ `EXACT_PROCESSING_BINDING_REQUIRED` — DIRECT_RPC_BYPASS=ZERO.
- Preflight إنتاجي (قراءة فقط، بعد الإصلاح): لا كائنات `p1\_%` متعارضة · لا Workflows
  بالأكواد الثلاثة · `student_unofficial_transcript` = 28 عمودًا بلا `official_result`/`grade_label`
  (سيُلحقان كعمودين 29/30) · جداول التفاصيل غير موجودة (سينشئها P1-01) · وحدات المعالجة
  التسع موجودة · دور `course_instructor` غير موجود وسينشئه P1-03.
- الانحدار: `bun test tests/student-requests` 1093/1093 · `bun test tests/academic` 194 pass
  والفشل 21 كله harness المجالس على Docker (سابق وغير متعلق) · اختبارات التقديرات 23/23 ·
  `bunx tsgo --noEmit` نظيف · `git diff --check` نظيف.

MIGRATIONS_APPLIED=0 · PRODUCTION_WRITES=0 · DEPLOY=0 · PUBLISH=0 · student_visible غير مُعدَّل

**PASS_PORTAL_REFORM_P1_FIVE_MIGRATION_FINAL_REHEARSAL_AND_PRODUCTION_GATE_05**
**SAFE_TO_APPLY=YES**
