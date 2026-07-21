# CI — إدراج اختبارات bun وPG verifiers (Q-20)

التاريخ: 2026-07-21 · الفرع: `ci/add-tests-and-pg-verifiers` · الأساس: `main` @ `df90f1a8379da4b15c561a87ebc21e3a31e2550e`
البرنامج: `PORTAL-CI-HARDENING-PR194-CLOSURE-01`

## حالة التسليم (تطبيق Workflow الحقيقي)

- **PR #194** يطبّق الآن سير العمل الحقيقي في `.github/workflows/ci.yml` (لم يعد
  مقترحاً تحت `docs/ci/`).
- أُزيل الملف المسرَّح `docs/ci/CI-ADD-TESTS-AND-PG-VERIFIERS.proposed.yml` بعد النقل.
- الأساس بعد rebase: `origin/main` @ `df90f1a` (يشمل دمج #191 disposition + #190
  graduation-projects lifecycle).
- أُضيفت الرجل الثامنة `graduation-projects-lifecycle` بعد دمج PR #190 على main.
- العدد المعتمد: **8/8** سلاسل PG verifier.

## ما تغيّر

ملف `.github/workflows/ci.yml` (استبدال كامل لمحتوى quality السابق مع الإبقاء
على سلوك quality دون إضعاف) + هذا التقرير. مهمة `quality`
(Install · Lint · Typecheck · Build) بقيت كما هي حرفياً. أُضيفت مهمتان:

### 1. `bun-tests` — اختبارات bun لكل أجنحة `tests/` (fail-closed)

- الخطوات: checkout → setup-bun → `bun install --frozen-lockfile` → حارس اكتشاف
  ثم `bun test tests/`.
- **fail-closed بالتصميم**: أي اختبار فاشل في أي جناح يُسقط المهمة. لا يوجد
  `continue-on-error` ولا تصفية أجنحة.
- حارس الاكتشاف يفشل المهمة إن وُجد صفر ملفات `*.test.ts` تحت `tests/`، فلا
  تتحول المهمة صامتاً إلى no-op عند إعادة تسمية المسارات.
- لا يحتاج سكربت `test` في package.json؛ النداء مباشر `bun test tests/`.

### 2. `pg-verifiers` — سلاسل تحقق PostgreSQL 17 (matrix بثماني أرجل)

كل رجل تعمل على خدمة `postgres:17` **خاصة بها** (عنقود مستقل)، وتنفّذ:
مخطط الحقائق ← مسودة/مسودات الترحيل ← المحقِّق(ون)،
مع `psql -v ON_ERROR_STOP=1` على كل ملف (fail-closed). `strategy.fail-fast: false`
حتى تعطي كل السلاسل إشارتها دائماً.

## السلاسل المُدرجة — 8/8

| الرجل | الملفات بالترتيب | متغيرات `-v` |
|---|---|---|
| graduates-affairs-foundation | `pg-setup.sql` ← `GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql` ← `...-foundation-01.pg-verify.sql` | — |
| graduates-affairs-completion | `pg-setup.sql` ← `...-FOUNDATION-01.sql` ← `GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql` ← `...-completion-01.pg-verify.sql` | — |
| academic-clearance-foundation | `academic-clearance.pg-setup.sql` ← `DEPARTMENT-TRANSFER-ACADEMIC-CLEARANCE-FOUNDATION-01.sql` ← `academic-clearance.pg-verify.sql` | — |
| academic-clearance-completion | `academic-clearance.pg-setup.sql` ← `...-FOUNDATION-01.sql` ← `docs/drafts/ACADEMIC-CLEARANCE-COMPLETION-01.sql` ← `academic-clearance-completion.pg-verify.sql` | — |
| graduation-projects-foundation | `postgres-minimal-schema.sql` ← `GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql` ← `postgres-foundation-verifier.sql` | 5: department, student profile/user, faculty profile/user |
| **graduation-projects-lifecycle** | `postgres-minimal-schema.sql` ← `GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql` ← **`GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql`** ← `postgres-foundation-verifier.sql` ← `postgres-lifecycle-verifier.sql` | **نفس الـ5** (من `postgres-minimal-schema.sql` + نتيجة #190) |
| materials-secure-activation | `postgres-minimal-schema.sql` ← `20260721000000_materials_secure_activation.draft.sql` ← `postgres-secure-activation-verifier.sql` | — |
| lecture-execution-foundation | `postgres-minimal-schema.sql` ← `20260722120000_lecture_execution_mvp_01.draft.sql` ← `postgres-foundation-verifier.sql` | 7: department, level, faculty profile/user, student profile/user, class_schedule |

قيم `-v` لمشاريع التخرج (مستخرجة من `postgres-minimal-schema.sql` ونتيجة lifecycle المدموجة):

```
-v department_id=20000000-0000-0000-0000-000000000001
-v student_profile_id=30000000-0000-0000-0000-000000000001
-v student_user_id=10000000-0000-0000-0000-000000000001
-v faculty_profile_id=40000000-0000-0000-0000-000000000001
-v faculty_user_id=10000000-0000-0000-0000-000000000002
```

## التحقق المحلي (PORTAL-CI-HARDENING-PR194-CLOSURE-01)

- الأساس: `main` @ `df90f1a` بعد rebase نظيف لفرع `ci/add-tests-and-pg-verifiers`.
- Workflow الحقيقي في `.github/workflows/ci.yml` — لا ملف proposed متبقٍّ.
- بوابات ملزمة قبل الدمج: `quality` + `bun-tests` + `pg-verifiers` **8/8**.

## ما استُثني ولماذا

- **محارِكات staging الأمنية (t1..t5)**: تبقى يدوية عبر `security:test`؛ ليست
  اختبارات bun وتتطلب هدف staging وأسراراً لا تصلح لـ PR CI.
- **مهمة quality**: لم تُضعَف (الlint الاستشاري والtypecheck الشرطي كما هما).
- **PR #149 / #155**: خارج النطاق — لم تُمسا.

## مخاطر وتحفظات

- `bun-tests` fail-closed على كامل `tests/` — إخفاق قديم يسقط البوابة عمداً.
- المصفوفة تكلّف ~8 خدمات postgres متوازية (كل رجل على عنقود مستقل).
- فرع المسبار `ci/q20-probe` يُحذف بعد الدمج فقط إن لم يُستخدم في أي PR مفتوح.
