# P1 — إعادة إثبات البروفة النهائية للخمس Migrations (المرحلة 1)

المرحلة 1 التي تطلبها (`PORTAL_REFORM_P1_FIVE_MIGRATION_FINAL_REHEARSAL_AND_PRODUCTION_GATE_05`) سبق تنفيذها وأعادت PASS، والملفات الخمسة ما زالت مجمّدة بنفس البصمات المثبتة في التقرير:

| الملف | SHA256 (مختصر) |
| --- | --- |
| P1-01-DETAIL-MODELS.sql | 5bfa4b15… |
| P1-02-BACKEND-VALIDATION.sql | 02dfcf49… |
| P1-03-WORKFLOW-SEEDS.sql | eb685529… |
| P1-04-GRADE-APPEAL-TRIGGER-REPLACE.sql | d9b2bc25… |
| P1-05-PASS-THRESHOLD-48.sql | bb43939d… |

لذلك لا حاجة لإعادة تأليف أي شيء. المطلوب الآن إعادة تشغيل البروفة والبوابة كما هي (Re-attestation) للتأكد أن النتيجة ما زالت PASS على نفس المصدر، ثم تسليمك التقرير لإصدار أمر المرحلة 2.

## ما سيُنفَّذ

1. تجميد وإعادة حساب بصمات الملفات الخمسة ومقارنتها بالبصمات أعلاه — أي اختلاف = STOP فوري.
2. تشغيل بروفة PG17 الكاملة (`scripts/p1-source-closure-02-pg17/run.sh`) على عنقود معزول:
   - تطبيق P1-01 → P1-05 بالترتيب.
   - إعادة تطبيق كل ملف مرة ثانية (Idempotency).
   - حالات: دور أكتوبر (مستوى 4 + ≤4 مقررات)، بدل فاقد (منع التكرار)، منع تحويل المستوى الأول، حدود الدرجات 47.99 / 48 / 49.99 / 50 / 65 / 80 / 90، التظلم النهائي (47 → 48 → نتيجة رسمية 50 «مقبول») دون المساس بمكونات أعمال الفصل، ومصفوفة التفويض الإيجابية/السلبية وخطوات الإيرادات.
   - تأكيد عدم وجود أي أثر GPA.
3. اختبارات الانحدار في المصدر: `bun test tests/student-requests`، اختبارات `tests/academic`، وtypecheck.
4. Preflight إنتاجي **قراءة فقط**: تعارض الأسماء، توافق أعمدة `student_unofficial_transcript`، وجود الأدوار والمتطلبات المسبقة للـSeeds، وحالة سجل الـmigrations — دون أي كتابة.
5. تحديث تقرير البوابة `docs/reviews/PORTAL-REFORM-P1-FIVE-MIGRATION-FINAL-REHEARSAL-AND-PRODUCTION-GATE-05.md` بنتيجة إعادة الإثبات وتاريخها.

## الضوابط

- PRODUCTION_WRITES = 0، MIGRATIONS_APPLIED = 0، DEPLOY = 0، PUBLISH = 0، ولا تغيير على `student_visible`.
- لا تعديل على أي ملف من الملفات الخمسة إلا إذا كشفت البروفة خللًا حقيقيًا؛ وعندها يتوقف التنفيذ ويُعرض الخلل قبل أي تعديل، ثم تُعاد البصمات والبروفة كاملة.
- لا فتح أي مسار جديد (لا P2 ولا غيره) في هذه المهمة.

## المخرجات

قرار واحد فقط:

- `PASS_PORTAL_REFORM_P1_FIVE_MIGRATION_FINAL_REHEARSAL_AND_PRODUCTION_GATE_05` مع `SAFE_TO_APPLY=YES` والبصمات النهائية، أو
- `HOLD_… <EXACT_TECHNICAL_BLOCKER>`.

بعد PASS أتوقف وأنتظر أمرك المستقل `PORTAL_REFORM_P1_CONTROLLED_PRODUCTION_APPLY_06` للتطبيق الإنتاجي ملفًا ملفًا مع post-verify بعد كل واحد.
