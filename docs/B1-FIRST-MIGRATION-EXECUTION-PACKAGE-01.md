# B1-FIRST-MIGRATION-EXECUTION-PACKAGE-01 — حزمة تنفيذ الهجرة الأولى (توثيق فقط)

> **الحالة:** حزمة توثيقية فقط (docs-only) — **صفر تنفيذ إنتاجي، صفر apply**. لا يجوز تنفيذ أي خطوة تطبيق واردة في هذه الحزمة دون اعتماد بشري صريح لكل هجرة على حدة (`REQUIRES_USER_APPROVAL`) وفق دليل الإطلاق الإنتاجي الرئيسي (Track H، PR #204).
>
> **النطاق:** الهجرة الأولى فقط من الـmanifest التسلسلي — المدخل رقم 1 `B1-LOG-AUDIT-CALL-DISAMBIGUATION-01`. **لا توجد هجرة ثانية في هذه الحزمة، ولا يوجد auto-continue بعد نجاحها**؛ المدخل رقم 2 (`B1-ACTOR-AUTHORIZATION-HARDENING-02`) خارج نطاق هذه الحزمة ويستلزم حزمة تنفيذ واعتمادًا مستقلَّين.

- **المسار/البرنامج:** Track I — `B1-FIRST-MIGRATION-EXECUTION-PACKAGE-01` / `PORTAL-OVERNIGHT-AUTONOMOUS-SOURCE-ACCELERATION-01`
- **المستودع:** `msorori-mh/saba-uni-portal` (خاص)
- **القاعدة:** `main` @ `debf9d041f7c05794f6df33877f1dff91253625e` (commit دمج PR #203 — الـmanifest)

---

## 0) المصادر المرجعية (كلها مُتحقَّق منها)

| # | المادة | المرجع | blob SHA | الحالة |
|---|---|---|---|---|
| 1 | الـmanifest النهائي المدموج `docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json` | `main` @ `debf9d04` | `a689564aabaef2ae67f8ac60887d80ffb0b5b31a` | على main (مدمج عبر PR #203) |
| 2 | مسودة الهدف `docs/migration-drafts/REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql` | `main` @ `debf9d04` | `0659fe34e4ed7f47ff1f69c041adefe289c2d594` | على main — **هدف التطبيق للمدخل 1** |
| 3 | مسودة إغلاق Track A `docs/migration-drafts/LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01.sql` | فرع PR #202 `fix/log-audit-call-disambiguation-closure-01` @ `8d98d7cee9d9615ad0fdf72fbf780e0794604dd2` | `4085596f6cb5df4fc40b53e6ddf4be22804d42dd` | **ليست على main** |
| 4 | تقرير إغلاق Track A `docs/LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01-REPORT.md` | فرع PR #202 @ `8d98d7ce` | `6ac3dd349d4af2f4b1f8241338c733b61e11d766` | **ليست على main — شرط التخويل** |
| 5 | دليل الإطلاق الرئيسي `docs/PRODUCTION-ROLLOUT-MASTER-RUNBOOK-01.md` (Track H) | PR #204، فرع `docs/production-rollout-master-runbook-01` @ `efb3bf6a717959bd9ec01f81583eacee6b5f70e7` | — | **لم يُدمج بعد** (يحظر تخويل المدخل 1) |

ملاحظة أمانة: الـmanifest وُلِّد عند `base_ref.commit = 45148e0939d6e2d8f2baba792df4ca79907df8ac` ودُمج لاحقًا على main؛ ملفا المدخل 1 (الـmanifest والمسودة) لم يتغيّرا منذئذ — الـblob SHAs أعلاه مأخوذة من `main` الحالية ومطابقة لقيم الـmanifest.

---

## 1) المعرف القانوني (canonical ID)

- **`B1-LOG-AUDIT-CALL-DISAMBIGUATION-01`**
- `sequence_order = 1`، `plan_order = 1`، `sequence_predecessor = null` — المدخل الوحيد عديم التبعيات في الرسم البياني (`dependency_graph.first_migration`؛ إنفاذ الـmanifest: «exactly one zero-dependency entry (the first)»).
- `category = b1_apply_set`، `status = NOT_APPLIED` (إثبات الحالة: أدلة D-02 الشيئية على main؛ **ممنوع** اعتماد مطابقة الأسماء مع صفوف Lovable UUID في `supabase_migrations.schema_migrations` كإثبات).

## 2) اسم الملف الدقيق

- **الاسم:** `REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql`
- **المسار:** `docs/migration-drafts/REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql`
- ترويسة الملف نفسه: `-- DRAFT ONLY — NOT APPLIED — DO NOT EXECUTE WITHOUT EXPLICIT APPROVAL`.
- **الحجم:** 3253 بايت (مُتحقَّق منه محليًا بايت-مقابل-بايت).

## 3) source SHA

- **`0659fe34e4ed7f47ff1f69c041adefe289c2d594`** — git blob SHA-1 للمسودة على main.
- **المنشأ/التحقق (أُعيد إجراؤه في هذا المسار):** استجابة `get_file_contents` API == نتيجة `git hash-object` على البايتات المحفوظة محليًا == قيمة `source_sha` في الـmanifest — تطابق ثلاثي تام، ولا يوجد انحراف قناة-نصية لهذا المدخل (خلاف المدخل 13 الموثق في الـmanifest).

## 4) SHA256

- **`3b8e2cfd90ea4301ba65b86b628d9e39dfe24c355d84f94eca27b3415cd32dab`**
- **الطريقة:** SHA-256 على **البايتات الخام** (UTF-8) للمحتوى المجلوب بايت-مطابقًا للملف (3253 بايت)؛ حُوسبت مستقلًا في هذا المسار وطابقت دبوس الـmanifest (`sha256_provenance`: «locally computed SHA-256 of byte-exact fetched content; matches B1-plan pin»).

## 5) التبعيات (dependencies)

- **`dependencies = []`** — لا تبعيات داخلية على مستوى المحتوى، ولا سلف تسلسلي (هي الأولى).
- `dependency_semantics` (من الـmanifest): التبعيات = متطلبات داخلية على مستوى المحتوى **∪** السلف التسلسلي الإلزامي (مانع batch-apply البنيوي)؛ المتطلبات الخارجية المطبَّقة سلفًا تُدرج في `external_dependencies` و**ليست** حواف في الرسم البياني.
- **`external_dependencies`** (موجودة أصلًا على الإنتاج — خارج هذه الحزمة):
  1. `20260624140000_student_requests_workflow_foundation` — مصدر التحميلين `log_audit` (6-arg + 7-arg)؛
  2. `official_documents`؛
  3. `has_any_role`؛
  4. `audit_logs`.
- **حواف خارجة من المدخل 1** (مستهلكون لاحقون يعتمدون عقد الاستدعاء المُنمَّط 7-arg): `B1-ACTOR-AUTHORIZATION-HARDENING-02`، `B1-SECURE-ATTACHMENTS-SOURCE-07`، `B1-TRANSFER-SECURE-ATTACHMENT-12`.

## 6) الكائنات المتوقعة (expected objects)

- `objects_created = []` — لا تنشئ المسودة أي كائن جديد.
- `objects_modified = [function cancel_official_document(uuid,text)]` — إعادة إنشاء أمامية فقط (`CREATE OR REPLACE`).
- `functions = [cancel_official_document(uuid,text)]`؛ `rpcs = []`؛ `rls_impact = none`؛ `storage_impact = none`.
- `grants_revokes` (أُعيد اشتقاقها بـgrep مباشر من نص المسودة الفعلي بعد ثبوت ضعف جرد الاستطلاع في هذا الحقل — مراجعة PR #203):
  - `REVOKE ALL ON FUNCTION public.cancel_official_document(uuid, text) FROM PUBLIC, anon;`
  - `GRANT EXECUTE ON FUNCTION public.cancel_official_document(uuid, text) TO authenticated, service_role;`
- **إثبات الكائنات المتوقعة (`expected_object_proof`):**
  1. `obj_description('public.cancel_official_document(uuid,text)'::regprocedure,'pg_proc') = 'B1_LOG_AUDIT_EXPLICIT_SEVEN_ARG=1; forward remediation; no historical rewrite'`
  2. `prosrc` الخاص بـ`cancel_official_document` يحوي بالضبط استدعاء `log_audit` المُنمَّط ذا الـ7 وسائط؛
  3. `has_function_privilege('anon','public.cancel_official_document(uuid,text)','EXECUTE') = false`.

## 7) preflight (تحقق ما قبل التطبيق)

من الـmanifest (4 بنود) مع مقتطف الحراسات الفعلية من نص المسودة:

1. **تأكيد NOT_APPLIED عبر أدلة D-02 الشيئية:** علامة التعليق `B1_LOG_AUDIT_EXPLICIT_SEVEN_ARG=1` غائبة عن `cancel_official_document` (ممنوع مطابقة الأسماء ضد صفوف الهجرات كإثبات).
2. **وجود كلا تحميلَي `log_audit`:** `to_regprocedure` للتوقيعين 6-arg و7-arg غير معدومَين — وهما حارسا المسودة نفسها داخل معاملتها:
   ```sql
   IF to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text)') IS NULL THEN
     RAISE EXCEPTION 'B1_LOG_AUDIT_SIX_ARG_MISSING';
   END IF;
   IF to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)') IS NULL THEN
     RAISE EXCEPTION 'B1_LOG_AUDIT_SEVEN_ARG_MISSING';
   END IF;
   ```
3. **التقاط تعريف `cancel_official_document` الحالي** (`pg_get_functiondef`) كخط أساس للتراجع الأمامي (forward-rollback baseline).
4. **تأكيد عدم وجود معاملة مفتوحة ولا DDL متزامن** على `public.official_documents`.

## 8) قناة التطبيق (Lovable apply channel)

> تطبيق يدوي لهجرة واحدة بواسطة مشغّل مخوَّل (محرر SQL في Supabase أو `psql` مع إنفاذ معاملة واحدة) **بعد** اعتماد بشري صريح لكل هجرة على حدة؛ **أبدًا** عبر CI auto-apply، **أبدًا** مجمَّعة، **أبدًا** بالتوازي. — نص `apply_channel` من الـmanifest.

سياسات مكمّلة ملزمة من الـmanifest:
- `production_apply_requires`: اعتماد بشري صريح لكل هجرة (`REQUIRES_USER_APPROVAL`)؛ ممنوع ادعاء `DEPLOYED`/`DEPLOYED_SHA` دون دليل بوابة النشر المرفق.
- `proof_policy`: حالة التطبيق تُثبت **فقط** بأدلة كتالوج على مستوى الكائنات؛ مطابقة اسم الملف ضد صفوف Lovable UUID في `supabase_migrations.schema_migrations` **ممنوعة** كإثبات.
- `batch_apply_forbidden = true`، `max_migrations_per_apply_session = 1`، `parallel_apply_forbidden = true`، `ci_auto_apply_forbidden = true`.

## 9) خطوات التطبيق الدقيقة (عند التخويل فقط)

> **البوابة 0 (إلزامية قبل أي خطوة):** تحقق شرطَي التخويل — (أ) اعتماد بشري صريح لهذه الهجرة وحدها؛ (ب) رفع حظر Track H: تقرير إغلاق Track A على main (انظر §17). **الحالة الحالية: HOLD — لا تبدأ.**

1. **PREFLIGHT** — نفّذ بنود §7 كاملة والتقط المخرجات (بما فيها خط أساس `pg_get_functiondef`)؛ أي فشل = توقف (§13).
2. **APPLY ONE ONLY** — نفّذ ملف المسودة كما هو بالضبط (البايتات المثبَّتة في §3–§4) في معاملة واحدة؛ الملف ملفوف أصلًا بـ`BEGIN; … COMMIT;`؛ في `psql` استخدم `-1`/`--single-transaction`؛ هجرة واحدة فقط في الجلسة.
3. **VERIFY فوري** — شغّل مسبارات §6 الثلاثة + اختبار العقد المصدري (§10)؛ أي فشل = توقف.
4. **PROTECTED RECORD CHECK** — نفّذ فحوص §11؛ أي خرق = توقف.
5. **RECORD EVIDENCE** — املأ قالب الدليل §15 وأرفق الاعتماد ومخرجات المسبارات.
6. **STOP — لا auto-continue:** المدخل التالي رقم 2 لا يُبدأ إلا بحزمته الخاصة واعتماده المنفصل وجولة بواباته الكاملة (`sequential_protocol` في الـmanifest: «ONLY THEN proceed to the next sequence_order entry»).

## 10) المحقق الفوري (immediate verifier)

- **مسبارات الكائنات (داخل/بعد المعاملة):** الثلاثة في §6 — علامة `obj_description`، محتوى `prosrc` (استدعاء 7-arg مُنمَّط وحيد)، و`has_function_privilege('anon', …) = false`.
- **اختبار العقد المصدري (bun):** `tests/student-requests/request-b1-shared-foundation-source-01.test.ts` — يؤكد عقد مصدر B1 المشترك بما فيه اصطلاح استدعاء `log_audit` المُنمَّط 7-arg الإلزامي (لا يوجد اختبار bun مخصص لهذا المدخل؛ `test_note` من الـmanifest).
- **`pg_verifier = null`:** لا تغطية PG-verifier لهذا المدخل — لا أيٌّ من أرجل الـCI pg-verifier الثمانية القائمة يغطيه (`existing_ci_pg_verifiers_cover_this_migration = false`)؛ تغطية B1 PG-verifier متابعة مسجلة في الـmanifest (`follow_ups`).

## 11) فحوص السجلات المحمية (protected-record checks)

- **`protected_record_impact` (من الـmanifest):** «none — no historical audit_logs rewrite; only future cancel_official_document calls change» — المسودة تعدّل دالة فقط؛ لا تلمس `audit_logs` ولا أي بيانات تاريخية.
- **المجموعة المحمية القانونية** (Track H، PR #204 — تُفحص ولا تُمس):
  - `SR-20260713-2DE64041`
  - `SR-20260715-FEDCB3E1`
  - `SR-20260716-26BAD4C8`
  - `USR-2026-000001`
  - `USR-2026-000002`
- **حمايات صفّية ذات صلة** (من `global_policies.protected_records` في الـmanifest): تأريخ `audit_logs`، قيم أسباب الغياب التاريخية (family/emergency)، ألقاب chance_type التاريخية، كائنات المرفقات المرفوعة — ممنوع rewrite/backfill/delete.
- **الفحص عند التطبيق:** تأكيد ثبات أعداد/محتوى `audit_logs` التاريخية قبل/بعد، وثبات أي عدّادات تمس السجلات الخمسة أعلاه (متوقَّع: لا تغيير إطلاقًا؛ الدالة لا تقرأها ولا تكتبها).

## 12) كشف التطبيق الجزئي (partial detection)

> مسودة معاملاتية (`BEGIN`/`COMMIT`) — التطبيق الجزئي **مستحيل بالبناء**: أي استثناء يُجهض المعاملة كلها. مسبار الكشف: `obj_description(cancel_official_document) IS NULL` — من نص `partial_apply_detection` في الـmanifest.

- نتيجة المسبار `IS NULL` = لم تُطبَّق (متوافق مع حالة NOT_APPLIED)؛ وجود العلامة مع فشل أي مسبار آخر من §6 = حالة غير متسقة ⇒ STOP وتقييم فوري.

## 13) إجراء الإيقاف (stop procedure)

**شروط إيقاف المدخل** (`stop_conditions` من الـmanifest):
1. أي `RAISE` في preflight (`B1_LOG_AUDIT_SIX_ARG_MISSING` / `B1_LOG_AUDIT_SEVEN_ARG_MISSING`)؛
2. أي فرق غير متوقع مقابل خط أساس `cancel_official_document` الملتقط؛
3. أي `ERROR`/`WARNING` أثناء التطبيق؛
4. إثبات كائنات غامض أو مفقود بعد التطبيق.

**القواعد العامة** (`stop_on` / `on_stop` من `global_policies`):
- توقف عند: أي فشل preflight، أي خطأ apply، أي فشل تحقق، أي حالة `PARTIAL` أو `AMBIGUOUS`، أي خرق لثابتة سجل محمي.
- عند التوقف: **إيقاف التسلسل كله**؛ ممنوع محاولة هجرات لاحقة؛ التقييم وفق §12؛ لا معالجة إلا عبر §14 (أمامي فقط، مُراجَع).

## 14) rollback-by-forward (التراجع الأمامي فقط)

> `CREATE OR REPLACE` أمامي لـ`cancel_official_document` يعيد التعريف الأساسي الملتقط في preflight (مع إبقاء عقد استدعاء `log_audit` المُنمَّط 7-arg)؛ لا down-migration ولا `DELETE` لبيانات إنتاجية؛ المعالجة بهجرة أمامية **جديدة مُراجَعة** فقط؛ الصفوف التاريخية لا تُعاد كتابتها أبدًا. — من نص `rollback_by_forward` في الـmanifest.

- `rollback_policy` العام: rollback-by-forward فقط؛ لا down migrations؛ لا إعادة كتابة بيانات تاريخية.

## 15) قالب الدليل (evidence template)

يُرفق بسجل التطبيق عند التنفيذ (وليس الآن — هذه الحزمة توثيقية):

```yaml
apply_record:
  canonical_id: B1-LOG-AUDIT-CALL-DISAMBIGUATION-01
  filename: docs/migration-drafts/REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql
  source_sha_blob: 0659fe34e4ed7f47ff1f69c041adefe289c2d594
  sha256_raw_bytes: 3b8e2cfd90ea4301ba65b86b628d9e39dfe24c355d84f94eca27b3415cd32dab
  base_ref: main@<commit-at-apply-time>
  approval: { approver: "<name>", decision_ref: "<approval-record>", at: "<timestamp>" }
  track_a_gate: { closure_report_on_main: true, report_blob: "<blob-sha-on-main>", verified_at: "<timestamp>" }
  preflight:
    not_applied_object_evidence: "<probe output: obj_description IS NULL>"
    six_arg_overload: "<to_regprocedure output>"
    seven_arg_overload: "<to_regprocedure output>"
    baseline_pg_get_functiondef: "<captured definition hash/reference>"
    no_open_txn_no_concurrent_ddl: "<probe output>"
  apply: { channel: "supabase-sql-editor|psql -1", single_transaction: true, started_at: "<ts>", finished_at: "<ts>", errors: [] }
  verify:
    obj_description_marker: "<exact comment string>"
    prosrc_typed_7arg_call: "<probe output>"
    anon_execute_false: "<has_function_privilege output>"
    bun_source_contract_test: { file: "tests/student-requests/request-b1-shared-foundation-source-01.test.ts", result: "<pass/fail + run ref>" }
  protected_record_check:
    audit_logs_history_unchanged: "<counts before/after>"
    protected_ids_untouched: ["SR-20260713-2DE64041","SR-20260715-FEDCB3E1","SR-20260716-26BAD4C8","USR-2026-000001","USR-2026-000002"]
  decision_code: "<PASS | PASS_WITH_NOTES | PARTIAL | AMBIGUOUS | ROLLBACK_BY_FORWARD | NOT_RUN_FAIL_CLOSED>"
  next_entry: "NONE in this package — no auto-continue; entry #2 requires its own package + approval"
```

## 16) رمز القرار (decision code)

- **رمز قرار هذه الحزمة التوثيقية:** `DOCS_ONLY_NO_EXECUTION` — لا تنفيذ ولا تخويل متضمَّن.
- **رمز قرار المدخل 1 الآن:** `NOT_APPLIED` (أدلة D-02 على main) + **تخويل = `HOLD_TRACK_A_CLOSURE_REPORT_NOT_ON_MAIN`** (ضمن مفردات `HOLD_*` القانونية لدليل Track H؛ انظر §17).
- مفردات القرار المعتمدة عند التنفيذ (من Track H): `PASS` / `PASS_WITH_NOTES` / `HOLD_*` / `PARTIAL` / `AMBIGUOUS` / `ROLLBACK_BY_FORWARD` / `NOT_RUN_FAIL_CLOSED` / `NOT_APPLIED`.

---

## 17) سلسلة تبعية Track A (حسم إلزامي للتخويل)

1. **هدف التطبيق للمدخل 1 وفق الـmanifest** هو مسودة **REQUEST-B1** الموجودة على main: `docs/migration-drafts/REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql` (blob `0659fe34…`) — وليست مسودة الإغلاق.
2. **علاقة مسودة الإغلاق (Track A):** `LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01.sql` (blob `4085596f…`، على فرع PR #202 فقط) **SUPERSEDES/EXTENDS** مسودة REQUEST-B1: تُغلق فئة الغموض لكل البؤر الـ28 (+ عميلَي PostgREST) بإسقاط التحميل القديم 6-arg، بينما REQUEST-B1 تعالج بؤرة واحدة (`cancel_official_document`) بإعادة كتابة المستدعي إلى العقد المُنمَّط 7-arg — وإعادة الكتابة تبقى صالحة ومكمّلة بعد الإغلاق (من ترويسة مسودة الإغلاق نفسها).
3. **الترتيب الإلزامي — الإغلاق يُطبَّق بعد REQUEST-B1 وليس قبلها:** preflight مسودة REQUEST-B1 **يشترط وجود التحميل القديم 6-arg** (`B1_LOG_AUDIT_SIX_ARG_MISSING`)؛ تطبيق الإغلاق أولًا يجعل REQUEST-B1 ترفض العمل. مصدر الحسم: تقرير Track A §8 (blob `6ac3dd34…`): «يجب تطبيق مسودة الإغلاق هذه بعدها؛ وبعد الإغلاق يصبح ذاك الحارس باليًا ويُوصى بتخفيفه إن أُعيد تطبيق REQUEST-B1»، وترويسة مسودة الإغلاق: «this closure must be applied AFTER REQUEST-B1 (coordinated B1 apply order #2)».
4. **الحظر الصارم (hard-block) من Track H (PR #204):** «**لا تخويل للمدخل 1 قبل وصول التقرير إلى main**» — تقرير الإغلاق `docs/LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01-REPORT.md` **غير موجود على main** (تحقق مباشر: الجلب على `main` يعيد «file does not exist»)؛ يُستشهد به كـPENDING فقط.
5. **حالة PR #202 (أمانة):** مفتوح، محجوز بعطلة GitHub Actions (`mergeable_state = unstable`)؛ لم يُدمج. التشخيص المستقل والإصلاح موثقان في تقرير الإغلاق §§11–12 على فرع PR #202؛ لا يوجد مراجعة GitHub رسمية مسجلة؛ القرار التشغيلي الحاكم هو غياب التقرير عن main. الحظر يُرفع فقط عند وصول التقرير إلى main مع CI أخضر.
6. **متابعة موثقة:** بعد تطبيق الإغلاق مستقبلًا يُخفَّف حارس `B1_LOG_AUDIT_SIX_ARG_MISSING` في REQUEST-B1 إن أُعيد تطبيقها (ملكية مسار آخر — لا تُعدَّل في هذه الحزمة).

## 18) الوضعية التسلسلية العامة (من الـmanifest + دليل Track H)

```
PREFLIGHT  →  APPLY ONE ONLY  →  VERIFY  →  PROTECTED RECORD CHECK  →  RECORD EVIDENCE
(stop-on-anything؛ rollback-by-forward فقط؛ batch apply ممنوع بنيويًا — السلف التسلسلي داخل التبعيات)
```

- `activation_dependency` للمدخل 1: «none — inert remediation; no service activation» — لا علاقة له ببوابة التفعيل (B1 gate 19).
- بعد نجاح المدخل 1 وتسجيل دليله: **توقف تام**؛ لا انتقال آلي للمدخل 2.

## 19) حدود الحزمة وأمانة التوثيق

- هذه الحزمة **لا تطبّق شيئًا** ولا تخوّل شيئًا؛ كل خطوات §9 مشروطة بالبوابة 0.
- لم يُعدَّل أي ملف قائم؛ أُضيف هذا الملف فقط على فرع `docs/b1-first-migration-execution-package-01`.
- كل القيم (SHAs، الحقول، الحراسات، المسبارات) منقولة من مصادر مُتحقَّق منها على main @ `debf9d04` أو من فروع PRs المُشار إليها صراحةً بحالتها («ليست على main»)؛ الـSHA256 وblob SHA للمسودة أُعيد حسابهما مستقلًا في هذا المسار (بايتات خام، 3253 بايت).
- **ممنوع** في هذه الحزمة وما بعدها: batch apply، parallel apply، CI auto-apply، مطابقة الأسماء كإثبات تطبيق، ادعاء `DEPLOYED` دون دليل، auto-continue للمدخل 2.
