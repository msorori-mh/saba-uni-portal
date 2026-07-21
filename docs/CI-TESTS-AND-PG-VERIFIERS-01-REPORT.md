# CI — إدراج اختبارات bun وPG verifiers (Q-20)

التاريخ: 2026-07-21 · الفرع: `ci/add-tests-and-pg-verifiers` · الأساس: `main` @ `265df127`

## ما تغيّر

ملف `.github/workflows/ci.yml` فقط (بالإضافة إلى هذا التقرير). مهمة `quality`
(Install · Lint · Typecheck · Build) بقيت كما هي حرفياً. أُضيفت مهمتان:

### 1. `bun-tests` — اختبارات bun لكل أجنحة `tests/` (fail-closed)

- الخطوات: checkout → setup-bun → `bun install --frozen-lockfile` → حارس اكتشاف
  ثم `bun test tests/`.
- **fail-closed بالتصميم**: أي اختبار فاشل في أي جناح يُسقط المهمة. لا يوجد
  `continue-on-error` ولا تصفية أجنحة.
- حارس الاكتشاف يفشل المهمة إن وُجد صفر ملفات `*.test.ts` تحت `tests/`، فلا
  تتحول المهمة صامتاً إلى no-op عند إعادة تسمية المسارات.
- لا يحتاج سكربت `test` في package.json؛ النداء مباشر `bun test tests/`.
- محارِكات الأمان `tests/security/t1..t5-*.test.ts` وحدات مكتبية بلا اختبارات
  `bun:test` (تُستهلك عبر `security-test-runner` ضد هدف staging)؛ تُحمَّل بأمان
  تحت `bun test` (0 اختبارات، بلا آثار جانبية عند الاستيراد — تم فحص
  `assertions.ts`/`roles.ts`/`server-fn.ts`/`config.ts`). مسار staging اليدوي
  `bun run security:test` يبقى كما هو خارج CI.

### 2. `pg-verifiers` — سلاسل تحقق PostgreSQL 17 (matrix بسبع أرجل)

كل رجل تعمل على خدمة `postgres:17` **خاصة بها** (عنقود مستقل)، وتنفّذ:
مخطط الحقائق ← مسودة الترحيل (draft، artifact مراجعة source-only) ← المحقِّق،
مع `psql -v ON_ERROR_STOP=1` على كل ملف (fail-closed حتى في الملفات التي لا
تضبطه بنفسها). `strategy.fail-fast: false` حتى تعطي كل السلاسل إشارتها دائماً.

## السلاسل المُدرجة — 7/7 (كل الأجنحة الخمسة المطلوبة)

> ملاحظة: أثناء العمل دُمجت PR ‎#184 (academic-clearance completion 01) في main،
> فأُدرجت سلسلتها أيضاً بعد التحقق المحلي بنفس الطريقة.

| الرجل | الملفات بالترتيب | متغيرات `-v` |
|---|---|---|
| graduates-affairs-foundation | `pg-setup.sql` ← `GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql` ← `...-foundation-01.pg-verify.sql` | — |
| graduates-affairs-completion | `pg-setup.sql` ← `...-FOUNDATION-01.sql` ← `GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql` ← `...-completion-01.pg-verify.sql` | — |
| academic-clearance-foundation | `academic-clearance.pg-setup.sql` ← `DEPARTMENT-TRANSFER-ACADEMIC-CLEARANCE-FOUNDATION-01.sql` ← `academic-clearance.pg-verify.sql` | — |
| academic-clearance-completion | `academic-clearance.pg-setup.sql` ← `...-FOUNDATION-01.sql` ← `docs/drafts/ACADEMIC-CLEARANCE-COMPLETION-01.sql` ← `academic-clearance-completion.pg-verify.sql` | — |
| graduation-projects-foundation | `postgres-minimal-schema.sql` ← `GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql` ← `postgres-foundation-verifier.sql` | 5: department, student profile/user, faculty profile/user |
| materials-secure-activation | `postgres-minimal-schema.sql` ← `20260721000000_materials_secure_activation.draft.sql` ← `postgres-secure-activation-verifier.sql` | — |
| lecture-execution-foundation | `postgres-minimal-schema.sql` ← `20260722120000_lecture_execution_mvp_01.draft.sql` ← `postgres-foundation-verifier.sql` | 7: department, level, faculty profile/user, student profile/user, class_schedule |

قيم `-v` كلها حقائق اصطناعية من ملفات `postgres-minimal-schema.sql` نفسها.

## التحقق المحلي قبل الرفع

- الأساس النهائي للفرع: main @ `265df127` (بعد دمج ‎#184).
- بيئة: PostgreSQL **17.10** (عنقود disposable) + عميل **psql 16** — نفس
  طوبولوجيا ubuntu-latest (psql 16 من runner ← خدمة postgres:17).
- كل الملفات الـ19 في السلاسل جُلبت من main وتُحقِّق منها عبر
  git blob SHA (كاملة، MATCH).
- محاكاة verbatim: حُلّل ملف ci.yml نفسه ونُفّذت حلقة `Run chain` لكل رجل
  على عنقود نظيف ⇒ **7/7 PASS**.
- اكتشاف تصميمي مؤثر: تشغيل السلاسل في عنقود واحد مشترك يفشل لأن إعدادَي
  graduates-affairs وacademic-clearance ينفّذان `CREATE ROLE anon/authenticated`
  بلا شرط (الأدوار على مستوى العنقود لا قاعدة البيانات) — لهذا اختيرت مصفوفة
  بعناقيد مستقلة بدل خدمة واحدة مشتركة.

## ما استُثني ولماذا

- **سلسلة graduation-projects lifecycle** (PR ‎#190): غير مدمجة في main بعد؛
  عند دمجها تُضاف رجل ثامنة (minimal-schema ← foundation draft ← lifecycle
  draft ← lifecycle verifier). موثّق كتعليق داخل المصفوفة.
- **محارِكات staging الأمنية (t1..t5)**: تبقى يدوية عبر `security:test`؛ ليست
  اختبارات bun وتتطلب هدف staging وأسراراً لا تصلح لـ PR CI.
- **مهمة quality**: لم تُمسّ (الlint الاستشاري والtypecheck الشرطي كما هما).

## مخاطر وتحفظات

- أول تشغيل كامل لمهمة `bun-tests` على الشجرة كلها سيكون على PR هذا التغيير؛
  إن ظهرت إخفاقات قديمة في main فالسلوك fail-closed مقصود (هذا ما طُلب)،
  والمتابعة إما بإصلاح الاختبار أو بتحديد نطاق مؤقت موثّق.
- تظهر الأرجل السبع كـ checks باسم `PG 17 verifier · <chain>`؛ إن احتاجت حماية
  الفرع اسماً واحداً ثابتاً يمكن تجميعها لاحقاً في مهمة واحدة متسلسلة.
- المصفوفة تكلّف ~7 خدمات postgres متوازية (كل رجل < ~2 دقيقة غالباً).
