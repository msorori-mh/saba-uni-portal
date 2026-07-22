# PRODUCTION-ROLLOUT-MASTER-RUNBOOK-01 — دليل الإطلاق الإنتاجي الرئيسي (من الحالة الراهنة إلى الإطلاق)

- **المعرّف**: PRODUCTION-ROLLOUT-MASTER-RUNBOOK-01 (Track H — برنامج PORTAL-OVERNIGHT-AUTONOMOUS-SOURCE-ACCELERATION-01)
- **المرجعية الأساسية**: `main @ debf9d041f7c05794f6df33877f1dff91253625e`
- **الحالة**: CANONICAL — وثيقة توثيق فقط. **صفر تنفيذ إنتاجي**. لا تُجيز هذه الوثيقة بذاتها أي تنفيذ؛ كل بوابة تتطلب موافقة بشرية صريحة منفصلة.
- **النطاق**: التسلسل الكامل من الوضع الراهن (كل مداخل B1 الـ19 بحالة `NOT_APPLIED`، و`DEPLOYED_SHA` غير مثبت) حتى الإطلاق واختبار launch smoke.
- **السيادة**: عند أي تعارض بين هذه الوثيقة وأي وثيقة أقدم، تسود هذه الوثيقة. قائمة التعارضات الـ12 المحسومة في الملحق (أ).

---

## 0. قواعد عامة ملزمة على كل البوابات

المصدر: `docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json` (`global_policies`)، `docs/PORTAL-SWARM-PRODUCTION-GATES.md`، `docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md`.

1. **عملية واحدة لكل موافقة**: لا توجد موافقة عامة تغطي أكثر من migration واحدة (`max_migrations_per_apply_session=1`).
2. **ممنوع الحزم والتوازي والأتمتة**: `batch_apply_forbidden=true`، `parallel_apply_forbidden=true`، `ci_auto_apply_forbidden=true`.
3. **البروتوكول الإلزامي لكل مدخل**: PREFLIGHT → APPLY ONE ONLY → VERIFY → PROTECTED RECORD CHECK → RECORD EVIDENCE → وبعدها فقط الانتقال إلى المدخل التالي.
4. **وقف عند أي شيء (stop-on-anything)**: أي فشل preflight، أو أي خطأ apply، أو أي فشل verify، أو أي حالة `PARTIAL` أو `AMBIGUOUS`، أو أي خرق لثوابت السجلات المحمية ⇒ **إيقاف التسلسل كاملاً**، وعدم محاولة أي مدخل لاحق، والتقييم وفق `partial_apply_detection`، والمعالجة حصرياً عبر `ROLLBACK_BY_FORWARD`.
5. **التراجع بالتقدم فقط (rollback-by-forward only)**: ممنوع down-migrations، ممنوع إعادة كتابة البيانات التاريخية، ممنوع DELETE لبيانات الإنتاج، ممنوع `migration repair`، ممنوع reset/cleanup، ممنوع الكتابة المباشرة في جداول التاريخ.
6. **لا ادعاء تطبيق بالاسم فقط**: حالة التطبيق تُثبت حصرياً بدليل catalog على مستوى الكائنات (object-level proof). مطابقة أسماء مسودات مع صفوف UUID العشوائية في `supabase_migrations.schema_migrations` **ممنوعة** كدليل.
7. **لا PII** في التقارير أو الاختبارات أو الأدلة (أعداد وأسماء أعمدة ورموز تصنيف فقط؛ معرّفات اصطناعية مثل `F9999xxx` في fixtures).
8. **مراجعة مستقلة قبل أي دمج** — لا auto-merge؛ معيار المراجعة `CRITICAL=0 / HIGH=0 / MEDIUM=0`.
9. **فضاء أسماء الترقيم**: ترقيم البوابات في هذا الدليل (GATE-01 … GATE-20) فضاء جديد مستقل، لا علاقة له بترقيم مداخل manifest الـ19 ولا بمصطلح "gate 19" التاريخي (انظر الملحق أ — C3).

### سجل الـSHA المرجعية (حسم التعارض C8)

| الـSHA | المعنى | الحالة |
|---|---|---|
| `debf9d041f7c05794f6df33877f1dff91253625e` | قاعدة توثيق هذا الدليل (main الحالية) | مرجعية توثيق |
| `45148e09…` | `base_ref` لـ manifest (مرجع تأليف) | مرجعية تأليف |
| `0e2d25c9a2d7923ce74cfae079b99691d61eb1b6` | `expected_release_sha` / `SOURCE_SHA` — مرشح الإصدار الحالي (PORTAL-FRESH-RELEASE-CANDIDATE-01) | **ملزم لبوابة النشر حتى صدور RC جديد** |
| `DEPLOYED_SHA` | بصمة الأداة المنشورة فعلياً | **UNKNOWN — يجب إثباتها بدليل، ويُمنع افتراضها أو تخمينها** |
| `427b7eb4…` / `8f229d09…` | قواعد ملغاة | أرشيفية فقط؛ كل وثيقة تشير إليها كقاعدة حالية تعتبر بالية |
| `e3dbd93…` | merge PR #194 (CI أخضر على main) | دليل CI تاريخي |

---

## 1. التعريفات القانونية (Outcome Vocabulary)

هذه المفردات ملزمة في كل أدلة البرنامج. لا يُستخدم أي لفظ خارجها لوصف نتيجة بوابة.

| اللفظ | التعريف القانوني |
|---|---|
| **PASS** | تحقّق معيار البوابة كاملاً مع دليل مرفق (مخرجات استعلام، سجل CI، hash، مسار تقرير). **يُمنع إطلاق PASS بلا دليل مرفق.** |
| **PASS WITH NOTES** | PASS مع متابعات غير مانعة موثقة صراحة (مثال: مراقبة التجربة المحدودة — ملاحظة Medium أن الفحوص التفاعلية يدوية). |
| **HOLD / HOLD_<reason>** | البوابة موقوفة: لا تقدّم، لا تنفيذ جزئي، لا إعادة محاولة دون إعادة تخويل. السبب يلحق كرمز (`HOLD_RELEASE_SHA_UNPROVEN`، `HOLD_D02_EXECUTION_CHANNEL_REQUIRED`، `HOLD_B1_PRODUCTION_ACTIVATION_PREFLIGHT`). |
| **PARTIAL** | وجود بعض (لا كل) الكائنات المتوقعة / تطبيق غير مكتمل في منتصف التسلسل. يُكتشف عبر مجسّات `partial_apply_detection` أو D-02 (كائن موجود دون صف مطابق في schema_migrations). **محفّز وقف كلي.** |
| **AMBIGUOUS** | **(تعريف قانوني جديد يسدّ فجوة مفردات)** فئة تعارض أدلة / تعذّر حسم: حين تتعارض الأدلة المتاحة أو تعجز عن حسم هوية أو حالة، دون أن يكون ذلك فشل تنفيذ ولا اكتمالاً جزئياً للتطبيق. AMBIGUOUS ليست قيمة في `status_semantics.allowed_values` الخاصة بالتطبيق (`NOT_APPLIED/APPLIED/FAILED/PARTIAL/BLOCKED`) بل فئة أدلة مستقلة. **سلوك الوقف مطابق لـ PARTIAL: إيقاف التسلسل كاملاً.** لها نطاقان موسومان بالبوابة: (أ) D-01: هوية غير قابلة للحسم (`faculty_profile_id` معدوم أو تعدد ملفات هوية)؛ (ب) D-02: تطابق اسم جزئي لمسودة دون صف نسخة مطابق تماماً (`ambiguous` صغيرة على مستوى الصف). |
| **ROLLBACK_BY_FORWARD** | وضعية التراجع الوحيدة في البرنامج كله: الاستعادة عبر CREATE OR REPLACE أمامي إلى baseline ملتقط، أو migration جديدة مراجَعة، أو إلغاء تفعيل (`is_active=false`). أبداً down-migration أو DELETE أو إعادة كتابة تاريخية أو `migration repair`. ملفات `*-ROLLBACK-BY-FORWARD.sql` تحمل القيم السابقة للتنفيذ. |
| **NOT_RUN / NOT_RUN_FAIL_CLOSED** | فحص لم يُنفَّذ لغياب قناته أو تخويله؛ يُعامل كمانع (fail-closed) ولا يُعامل أبداً كنجاح. |
| **NOT_APPLIED** | اسم ملف المسودة غائب عن `supabase_migrations.schema_migrations` (دليل اسم فقط) معزّزاً بفحوص كائنات. كل مداخل B1 الـ19 حالياً `NOT_APPLIED`. |
| **APPLIED / FAILED / BLOCKED** | حالات تطبيق وفق `status_semantics.allowed_values` في manifest. BLOCKED = مانع خارجي صلب مع سبب نصي إلزامي ومعيار رفع حظر. |
| **DEPLOYED_SHA_PROVEN** | ثبوت مصدر الأداة المنشورة (شرط تحويل بوابة النشر). النقيض: `HOLD_RELEASE_SHA_UNPROVEN`. |
| **D02_COMPLETE_CLEAN / D02_HOLD_<reason> / D02_NOT_EXECUTED** | أحكام بوابة D-02. |
| **GO / HOLD_<reason>** | قرار بوابة حسابات الطلاب (مع `BINDING_RULE_VIOLATION`). |
| **READY_FOR_AUTHORIZED_EXECUTION / READY_FOR_AUTHORIZATION** | حزمة جاهزة وما يزال التنفيذ بانتظار تخويل صريح. |

رموز CI/الدمج: `PASS_CI_HARDENING_PR194_MERGED_MAIN_GREEN` (نهائي؛ الرمز المؤقت `PASS_CI_HARDENING_PR194_WEB_GREEN_PENDING_LOCAL_VERIFICATION` ملغى — حسم C9).

---

## 2. جدول البوابات القانوني (20 بوابة، بالترتيب الإلزامي)

الترتيب أدناه **ملزم**؛ لا يجوز تقديم أي بوابة على سابقتها. عمود «موافقة منفصلة» يحدد التخويل البشري الصريح المطلوب قبل فتح البوابة. التفاصيل الكاملة لكل بوابة في القسم 3.

| # | البوابة | موافقة منفصلة مطلوبة | الدليل المطلوب | شرط الوقف الرئيسي |
|--:|---|---|---|---|
| 01 | GATE-01-SOURCE-MAIN-GREEN — خضار main المصدرية | لا (تحقق آلي) لكن أي إصلاح مصدري يمر بمراجعة مستقلة | CI أخضر على main: `quality` + `bun-tests` (fail-closed، حارس اكتشاف الاختبارات) + `pg-verifiers` (8 أرجل) | أي بوابة CI حمراء ⇒ لا دمج ولا RC |
| 02 | GATE-02-RUNTIME-RELEASE-CANDIDATE — تثبيت مرشح الإصدار | نعم: اعتماد RC | وثيقة RC مثبتة `SOURCE_SHA=0e2d25c9…` + شجرة نظيفة (routeTree/Register، B-4) | شجرة غير نظيفة أو انحراف عن الـSHA المثبت |
| 03 | GATE-03-DEPLOYED-SHA-PROOF — إثبات بصمة المنشور | نعم: **Deploy** ثم **Publish** (موافقتان منفصلتان) | بيان publish رسمي + قراءة مستقلة (read-back) تثبت `DEPLOYED_SHA` بدقة؛ `PASS_ENDPOINT_LIVE` ليس إثبات مصدر | بقاء المنشأ غير مثبت ⇒ كل بوابات DB الإنتاجية `NOT_RUN_FAIL_CLOSED` |
| 04 | GATE-04-D02-READONLY-SNAPSHOT — لقطة الواقع للقراءة فقط | نعم: تخويل قناة قراءة فقط | حزمة B1-D02 كاملة (Q1…Q4) بعد إصلاح مجس Q3d؛ الحكم `D02_COMPLETE_CLEAN` | `SCHEMA_MIGRATIONS_UNREADABLE`؛ توقيعات log_audit ≠ 2؛ أي `ambiguous`/`partial`؛ `D02_HOLD_PROTECTED_RECORD_DRIFT`؛ أي محاولة كتابة |
| 05 | GATE-05-CHAIR-SEMANTIC-AUDIT — التدقيق الدلالي لرؤساء الأقسام | نعم: تخويل تنفيذ التدقيق للقراءة فقط | `DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-READONLY-01.sql` (SERIALIZABLE READ ONLY، ينتهي ROLLBACK) + التصنيفات الثمانية | أي `NEEDS_ATTENTION` غير مفسَّر؛ أي خروج عن READ ONLY |
| 06 | GATE-06-D01-CHAIRS-DECISION — قرار D-01 (تصحيح الرؤساء) | نعم: **D-01** تخويل تنفيذ مستقل | حزمة PACKAGE-02 (PREFLIGHT بـ14 فحصاً → PACKAGE بمعاملة واحدة وadvisory lock → POST-VERIFIER fail-closed) + إعداد الجلسة `app.department_chairs_semantic_fix_evidence='DEPARTMENT-CHAIRS-IDENTITY-RESOLUTION-READONLY-01:CS=F2025006'` | أي رمز إيقاف من رموز D-01 (انحراف هوية/ازدواج/كاردينالية ≠ 1/خروج عن قائمة اللمس) |
| 07 | GATE-07-LOG-AUDIT-MIGRATION — migration فك الالتباس log_audit (المدخل 1) | نعم: **log_audit migration** تخويل مستقل | المدخل 1 من manifest + المسودة `REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql` + مسودة الإغلاق `docs/migration-drafts/LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01.sql` (قيد الإعداد في Track A — **PENDING**) | ⚠ تقرير الإغلاق `docs/LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01-REPORT.md` **غير موجود على main (PENDING — مسار CI في Track A ما يزال مفتوحاً)**: يجب أن يصل إلى main قبل تخويل المدخل 1 |
| 08 | GATE-08-B1-SEQUENTIAL-MIGRATIONS — مداخل B1 (2…19) واحدة واحدة | نعم: **كل migration على حدة** (18 تخويلاً مستقلاً بعد المدخل 1) | لكل مدخل: حزمة أدلة runbook-07 كاملة (انظر القسم 5) | أي فشل preflight/apply/verify؛ أي PARTIAL/AMBIGUOUS؛ أي خرق حماية ⇒ إيقاف التسلسل كله |
| 09 | GATE-09-PER-MIGRATION-VERIFIER — المحقق بعد كل migration | ضمن تخويل كل migration | `expected_object_proof` (مجسات catalog) + اختبارات bun التعاقدية المرتبطة | أي نقص في إثبات الكائنات أو المنح؛ **لا يوجد أي PG-verifier CI يغطي B1 (0/8)** — التحقق يدوي موثق |
| 10 | GATE-10-PROTECTED-RECORD-CHECKS — فحص السجلات المحمية بعد كل migration | ضمن تخويل كل migration | checksums ما قبل/ما بعد للسجلات الخمسة + هويات الرؤساء الثلاثة + الحمايات الصفية | أي تغيّر غير متوقع ⇒ إيقاف كلي |
| 11 | GATE-11-SERVICE-VISIBILITY-ACTIVATION — تفعيل ظهور الخدمات الخمس | نعم: **service activation** لكل خدمة على حدة (`student_visible=true` لخدمة واحدة فقط في كل مرة) | قراءة مستقلة: علم الخدمة المفعّلة true والأربع الباقية false؛ الترتيب الملزم: enrollment_suspension → excused_absence → file_withdrawal → department_transfer → final_chance | أي تفعيل قبل اكتمال بوابات 12–14 لتلك الخدمة؛ أي علم إضافي انقلب |
| 12 | GATE-12-WORKFLOW-ACTIVATION — تفعيل سير العمل لكل خدمة | نعم: **workflow activation** لكل خدمة على حدة | تفعيل نسخة workflow المراجَعة لتلك الخدمة فقط؛ إعادة قراءة الأربع الأخرى = صفر active | أي workflow أصبح active خارج الخدمة المعنية؛ أي مسودة من مدخلي 17/18 فُعّلت قبل هذه البوابة |
| 13 | GATE-13-RPC-AUTHORIZATION-MATRIX — مصفوفة صلاحيات RPC المباشرة | ضمن تخويل كل خدمة | ALLOW فقط للمكلَّف المباشر المطابق processing_unit/role؛ DENY لـ anonymous/student/unassigned/wrong-unit/wrong-role/admin/registrar-dean-bypass | أي DENY فشل أو سمح بكتابة؛ ممنوع إنشاء هويات/تكليفات إنتاجية أثناء المصفوفة |
| 14 | GATE-14-POSITIVE-NEGATIVE-TESTS — الاختبارات الإيجابية والسلبية | ضمن تخويل كل خدمة | كل DENY يثبت **صفر تغيّر** (zero mutation) بدليل قراءة بعد المحاولة | أي أثر كتابة من مسار DENY ⇒ إيقاف وإعادة الخدمة إلى HOLD |
| 15 | GATE-15-E2E — اختبار طرف-لطرف موثق | ضمن تخويل كل خدمة | E2E بهوية معتمدة **غير حقيقية** فقط؛ مقارنة baselines المحمية بعد الاختبار | يُمنع E2E إنتاجي على مستخدم حقيقي؛ أي انحراف عن baseline |
| 16 | GATE-16-REPORTS-ACTIVATION — تفعيل التقارير | نعم: لكل عائلة تقارير | لا يُعلن أي تقرير `LIVE` إلا بإثبات الركائز الخمس (مصدر بيانات + صلاحية + route + اختبار آلي + ربط UI) بمسارات ملفات | تقارير BLOCKED لا تُرفع إلا بعد بواباتها؛ الظهور fail-closed للأدوار المجهولة |
| 17 | GATE-17-STUDENT-ACCOUNTS-PREFLIGHT — فحص ما قبل استيراد الحسابات | نعم: جلسة preflight مخوّلة (قراءة فقط، offline) | قرار الحارس `student-accounts-preflight`؛ **القاعدة الملزمة**: count(READY_TO_CREATE) = `snapshot.unlinked_profiles` تماماً وإلا `HOLD` (`BINDING_RULE_VIOLATION`) | أي بند من قائمة HOLD الـ15 (تعارضات/تكرارات/غير موجود/بريد غير صالح/SNAPSHOT_MISMATCH/انتهاء snapshot/اختلاف project_ref/تغيّر hash الملف/غياب dry-run/دور غير مخوّل/SHA مستورد غير مثبت/إثبات publish غير مثبت/القاعدة الملزمة) |
| 18 | GATE-18-CONTROLLED-ACCOUNT-CREATION — إنشاء الحسابات المضبوط | نعم: **account creation** جلسة تخويل مستقلة | قرار GO من GATE-17 + dry-run موثق + hash ملف مطابق | ممنوع أي إنشاء Auth/ربط إنتاجي خارج جلسة مخوّلة منفصلة |
| 19 | GATE-19-POST-IMPORT-VERIFICATION — التحقق بعد الاستيراد | ضمن جلسة الاستيراد | أعداد مربوطة/غير مربوطة بعد الاستيراد تطابق التوقع؛ صفر تكرارات؛ إعادة فحص السجلات المحمية | أي فرق عددي أو تكرار ⇒ إيقاف ومعالجة بالتقدم فقط |
| 20 | GATE-20-LAUNCH-SMOKE — اختبار الإطلاق الدخاني | نعم: إعلان الإطلاق | قائمة فحص الإطلاق (go-live checklist التفاعلية اليدوية) + فحوص الخدمات الخمس + التقارير + الحسابات + السجلات المحمية سليمة | أي فشل فحص ⇒ الإبقاء على HOLD والإعلان عنه |

> ملاحظة ترتيب مرحلة التفعيل (البوابات 11–15): الترقيم يعرض البوابات كما وردت في التكليف القانوني؛ التنفيذ العملي **لكل خدمة** يتبع `activation_gate` في manifest: baseline الاكتمال → التحقق من المخطط/الموزّع وصفر طلبات سابقة → workflow (GATE-12) → مصفوفة RPC (GATE-13) + السلبية (GATE-14) → `student_visible=true` (GATE-11) → E2E (GATE-15). أي فشل يعيد الخدمة إلى HOLD دون SQL تراجعي ودون الانتقال لخدمة أخرى (انظر A-13).

### الموافقات المنفصلة التسع (لا يجوز دمج أي منها)

1. **Deploy** — نشر الأداة على بيئة الإنتاج.
2. **Publish** — بيان النشر الرسمي وإثبات `DEPLOYED_SHA`.
3. **D-01** — تنفيذ حزمة تصحيح رؤساء الأقسام PACKAGE-02.
4. **log_audit migration** — المدخل 1 من تسلسل B1.
5. **كل migration من مداخل B1 على حدة** — لا موافقة جماعية إطلاقاً.
6. **service activation** — تفعيل ظهور كل خدمة (`student_visible=true`) على حدة.
7. **workflow activation** — تفعيل workflow كل خدمة على حدة.
8. **account creation** — جلسة إنشاء الحسابات المخوّلة.
9. **live import** — جلسة الاستيراد الفعلي المخوّلة (ملف 566 صفاً).

---

## 3. تفاصيل البوابات

### GATE-01 — SOURCE-MAIN-GREEN (خضار main المصدرية)

- **المتطلبات**: بوابات الدمج الإلزامية خضراء على main: `quality` (Install·Lint·Typecheck·Build دون إضعاف) + `bun-tests` (fail-closed على كل `tests/`؛ حارس الاكتشاف يفشل عند صفر ملفات اختبار؛ ممنوع `continue-on-error`) + `pg-verifiers` (8 أرجل، كل رجل بعنقود postgres:17 خاص، `ON_ERROR_STOP=1`، `fail-fast:false`).
- **المرجع**: `docs/CI-TESTS-AND-PG-VERIFIERS-01-REPORT.md`، `docs/PORTAL-CI-HARDENING-PR194-CLOSURE-01-REPORT.md`، `docs/PORTAL-BUN-TEST-BASELINE-REMEDIATION-01-REPORT.md`. الرمز النهائي: `PASS_CI_HARDENING_PR194_MERGED_MAIN_GREEN` (PR #194 دُمج بخضار main على `e3dbd93…`؛ الرمز المؤقت ملغى — حسم C9).
- **الحقائق الملزمة**: الأرجل الثمانية تغطي graduates-affairs/academic-clearance/graduation-projects/materials/lecture-execution فقط؛ **0 من 8 تغطي أي migration من B1** (متابعة F1).
- **الوقف**: أي بوابة حمراء ⇒ لا دمج. التراجع: مصدري فقط، fix-forward.

### GATE-02 — RUNTIME-RELEASE-CANDIDATE (تثبيت مرشح الإصدار)

- **المتطلبات**: شجرة نظيفة (إصلاح routeTree/Register — المانع B-4، `docs/ROUTETREE-REGISTER-CLEAN-TREE-01-REPORT.md`) + CI أخضر + `SOURCE_SHA = expected_release_sha = 0e2d25c9a2d7923ce74cfae079b99691d61eb1b6`. القواعد الملغاة `427b7eb4…` و`8f229d09…` وأطراف RC الأقدم أرشيفية.
- **الدليل**: وثيقة RC (`docs/PORTAL-FRESH-RELEASE-CANDIDATE-01.md`) + `docs/B1-PREFLIGHT-FRESH-BASELINE-01.md` (خطوات الاستئناف المرتبة 1–4).
- **الموافقة**: اعتماد RC قرار مستقل موثق.
- **الوقف**: أي انحراف عن الـSHA المثبت أو شجرة غير نظيفة.

### GATE-03 — DEPLOYED-SHA-PROOF (إثبات بصمة المنشور)

- **الموافقتان المنفصلتان**: **Deploy** ثم **Publish**.
- **المتطلبات**: يُنشر الـRC المراجَع والخدمات الخمس كلها fail-closed (`runtimeAvailable:false` / غير نشطة) **قبل** أي مسودة تعتمد على الاستدعاء الذري المنشور.
- **الدليل**: بيان publish رسمي + قراءة مستقلة (read-back) تثبت `DEPLOYED_SHA` بدقة 40-hex. نقطة نهاية تستجيب + معرّف deployment **لا** تثبت المنشأ (`PASS_ENDPOINT_LIVE` ≠ provenance). الرموز: `PASS_SOURCE_CI`، `PASS_ENDPOINT_LIVE`، `PASS_SOURCE_HASHES`، `HOLD_RELEASE_SHA_UNPROVEN`، `NOT_RUN_FAIL_CLOSED`، `DEPLOYED_SHA_PROVEN`.
- **ختم الإصدار**: صف المسودة 5 يبقي `APPROVED_RELEASE_COMMIT_PLACEHOLDER` حتى إدخال SHA مثبت 40-hex صغير في مراجعة مخوّلة منفصلة ثم إعادة حساب sha256.
- **الوقف**: المنشأ غير المثبت ⇒ كل بوابات DB الإنتاجية `NOT_RUN` (fail-closed؛ دورة 2026-07-20 توقفت هنا بالضبط). **ممنوع منعاً باتاً تخمين أو افتراض `DEPLOYED_SHA`.**

### GATE-04 — D02-READONLY-SNAPSHOT (لقطة الواقع للقراءة فقط)

- **الحالة الراهنة**: الحزمة `READY_FOR_AUTHORIZED_EXECUTION`؛ محاولة 2026-07-21 انتهت بـ `HOLD_D02_EXECUTION_CHANNEL_REQUIRED` (لا قناة DB؛ لم يُنفَّذ أي SELECT؛ الحالة الإنتاجية غير مقروءة — وهذا ليس `AMBIGUOUS`).
- **القنوات المسموحة**: Supabase Dashboard SQL Editor (service) أو psql مؤقت للقراءة فقط. **ممنوع**: GRANT، أي SQL كتابة، DDL/DML، RPC إنتاجي، إنشاء حسابات، تعديل `student_visible`.
- **حارس الجلسة**: `begin read only; set local statement_timeout='30s'; set local lock_timeout='5s';` (+ `SET TRANSACTION READ ONLY` … `ROLLBACK`؛ فحص ساكن مانع لصيغ الكتابة).
- **الاستعلامات**: Q1 schema_migrations؛ Q2 مسح الالتباس/الجزئية ILIKE على أسماء المسودات؛ Q3a توقيعات `log_audit` (يجب أن تكون 2 بالضبط)؛ Q3b كائنات B1؛ Q3c توقيعات RPC؛ Q3d الرؤساء؛ Q3e `student_visible`؛ Q3f buckets التخزين؛ Q3g السجلات المحمية؛ Q3h كيانات التوسعة؛ Q3i مصدر student_accounts (`STUDENT_ACCOUNTS_SOURCE_PRESENT` ✔ مسجل)؛ Q4 المنشأ مقابل `0e2d25c9…`.
- **⚠ عيب معروف (متابعة F3)**: مجس Q3d يستخدم `r.code ilike '%chair%'` ولا يوجد role code يحوي 'chair' — **يجب إصلاح المجس ليتبنى التعريف الدلالي لـ D-01 قبل إعادة محاولة تنفيذ D-02** (حسم C7).
- **الأحكام**: `D02_COMPLETE_CLEAN` / `D02_HOLD_<reason>` / `D02_NOT_EXECUTED`.
- **الوقف**: `SCHEMA_MIGRATIONS_UNREADABLE`؛ توقيعات ≠ 2 ⇒ `D02_HOLD_LOG_AUDIT_SIGNATURE_MISMATCH`؛ أي `ambiguous`/`partial`؛ `D02_HOLD_PROTECTED_RECORD_DRIFT`؛ أي محاولة كتابة.

### GATE-05 — CHAIR-SEMANTIC-AUDIT (التدقيق الدلالي لرؤساء الأقسام)

- **التعريف الدلالي القانوني لـ«رئيس القسم»**: صف نشط في `request_processing_assignments` بوحدة `code='department'` ودور `code='department_head'` و`assignment_type='faculty_profile'` ونطاق قسم ونافذة `starts_at/ends_at/is_active` حالية؛ الهوية عبر `faculty_profiles.employee_number`. الأقسام **لا** تملك عمود `code`؛ ولا يوجد role code يحوي `chair`.
- **الواقع الحالي (دليل D-02/التدقيق)**: CS=0 / IT=2 (ازدواج: خالد الشرعي + صف أسامة الخاطئ) / IS=1 (مطابق).
- **الأداة**: `DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-READONLY-01.sql` — SERIALIZABLE READ ONLY تنتهي بـ ROLLBACK؛ ثمانية تصنيفات بأسبقية: AMBIGUOUS → DUPLICATE → WRONG_UNIT → WRONG_IDENTITY → MATCHED → INACTIVE → EXPIRED → MISSING؛ أي صف نشط غير MATCHED/INACTIVE ⇒ `NEEDS_ATTENTION`.
- **الوقف**: أي `NEEDS_ATTENTION` غير مفسَّر؛ أي خروج عن READ ONLY.

### GATE-06 — D01-CHAIRS-DECISION (قرار D-01)

- **الحزمة القانونية**: `DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02{,-PREFLIGHT,-POST-VERIFIER,-ROLLBACK-BY-FORWARD}.sql` — **PACKAGE-02 تحل محل PACKAGE-01 التاريخية المحفوظة دون مساس** (حسم C5). الحالة: `READY_FOR_AUTHORIZATION` والتنفيذ **HOLD بانتظار تخويل صريح مستقل**.
- **التسلسل**: PREFLIGHT (14 فحصاً) → PACKAGE (معاملة واحدة + advisory lock) → POST-VERIFIER (fail-closed).
- **بوابات الجلسة الإلزامية**: تذكرة عمل؛ UUID منفّذ بدور `system_admin` نشط؛ إعداد الدليل `app.department_chairs_semantic_fix_evidence='DEPARTMENT-CHAIRS-IDENTITY-RESOLUTION-READONLY-01:CS=F2025006'` — بدونه يُمنع أي نقل شخص بين الأقسام.
- **شروط الوقف (fail-closed)**: انحراف هوية (`OSAMA/KHALED/RAMZI_PROFILE_IDENTITY_DRIFT`، `AUTH_ACCOUNT_ANCHOR_DRIFT`، `…_ASSIGNMENT_DRIFT`)؛ ازدواج (`IT_DUPLICATE_UNKNOWN_MEMBER_STOP_%`، `CS_DUPLICATE_ACTIVE_STOP`، `OSAMA_CS_INACTIVE_DUPLICATES_STOP_%`، `IS_ACTIVE_HEAD_CARDINALITY_STOP`)؛ نطاق (`ACTIVE_HEAD_OUTSIDE_CS_IT_IS_STOP`)؛ كاردينالية ما بعد الكتابة ≠ 1 لكل قسم؛ خرق قائمة اللمس (المجموعة المتغيرة ⊆ {الصف الخاطئ، صف أسامة-CS})؛ `ASSIGNMENT_HISTORY_ROW_LOST`.
- **الحمايات**: لا إشارة إطلاقاً لجداول طلبات الطلاب/الحسابات (حماية هيكلية)؛ لا INSERT إلا صف تكليف واحد كحد أقصى (`gen_random_uuid()` — ممنوع اختراع UUID)؛ لا DELETE؛ الصف الخاطئ يبقى `is_active=false` كتاريخ دائم؛ إعادة التشغيل idempotent = no-op.
- **التراجع**: ملف ROLLBACK-BY-FORWARD مخصص (UPDATEs فقط) يعيد حالة ما قبل التنفيذ بما فيها العيب المعروف.
- **الهدف النهائي**: CS=1 (أسامة) / IT=1 (خالد) / IS=1 (رمزي).

### GATE-07 — LOG-AUDIT-MIGRATION (المدخل 1: فك التباس log_audit)

- **الجوهر**: يجب وجود الحملين الزائدين لـ `log_audit` (6-وسائط و7-وسائط) قبل وبعد؛ المعالجة = CREATE OR REPLACE أمامي لـ `cancel_official_document(uuid,text)` بنداء صريح مُنمَّط ذي 7 وسائط؛ REVOKE ALL من PUBLIC/anon، وGRANT EXECUTE لـ authenticated و service_role فقط؛ إثبات الكائن: `obj_description = 'B1_LOG_AUDIT_EXPLICIT_SEVEN_ARG=1; forward remediation; no historical rewrite'` + anon EXECUTE=false. المنح مستمدة من نص المسودة الفعلي (معالجة مراجعة PR #203).
- **الإثبات/عدم التكرار**: عدد توقيعات D-02 Q3a = 2 بالضبط وإلا `D02_HOLD_LOG_AUDIT_SIGNATURE_MISMATCH`. ممنوع إعادة كتابة `audit_logs` التاريخية (محمية).
- **⚠ تبعية Track A (PENDING — حسم C1)**: تقرير الإغلاق `docs/LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01-REPORT.md` **غير موجود على main @ debf9d04** ومسار CI في Track A ما يزال مفتوحاً. تستند دلالات المدخل 1 إلى: المدخل 1 من `docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json` + الصف 1 من runbook-07 + `docs/B1-PREFLIGHT-BLOCKERS-SOURCE-REMEDIATION-01-REPORT.md` + المسودة الموجودة `docs/migration-drafts/REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql` + مسودة الإغلاق `docs/migration-drafts/LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01.sql` (قيد الإعداد على فرع Track A — غير مدموجة). **لا يُخوَّل المدخل 1 قبل وصول تقرير الإغلاق إلى main.**
- **الحالة**: معالج مصدرياً (#167)؛ يُغلق فقط بالتطبيق الإنتاجي للمدخل 1.

### GATE-08 — B1-SEQUENTIAL-MIGRATIONS (المداخل 2…19 واحدة واحدة)

التسلسل القانوني **19 مدخلاً** من `docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json` (schema v1، `base_ref main@45148e09`) — حسم C2: عبارات «18» في runbook-07 وSWARM-GATES §G2 **بالية**؛ أُدرج `B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-01` في الموضع 3 فإزاحت EXPANSION→4 … ACL-CUTOVER-18→19. كل المداخل `NOT_APPLIED` (دليل كائنات D-02). الاعتماديات = متطلبات المحتوى ∪ السلف التسلسلي الإلزامي (منع التطبيق الجماعي)؛ المدخل 1 وحده بلا اعتماديات.

| # | canonical_id | المسودة | أبرز شروط الوقف | وضع التفعيل |
|--:|---|---|---|---|
| 1 | B1-LOG-AUDIT-CALL-DISAMBIGUATION-01 | REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql | RAISE عند غياب الحملين 6/7؛ فرق عن baseline `cancel_official_document` الملتقط؛ أي ERROR/WARNING؛ غياب إثبات الكائن | معالجة خاملة؛ لا تفعيل |
| 2 | B1-ACTOR-AUTHORIZATION-HARDENING-02 | STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql | أي ERROR؛ غياب علامات البوابة الصارمة في الدوال الأربع (0-أو-4)؛ رصد طلب B1 جارٍ | تشديد بوابات فقط |
| 3 | B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-01 | B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-01.sql | أي ERROR؛ غياب علامات حارس v3؛ عدم تطابق جرد grant/revoke | تشديد الحارس فقط |
| 4 | B1-PROCESSING-DOMAINS-EXPANSION-03 | REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql | UUID موظف/عضو هيئة مرجعي مفقود/غير نشط؛ عدد تحليل وحدة/دور ≠ 1؛ انحراف عدد عند إعادة التشغيل | بيانات مرجعية فقط؛ الخدمات تبقى غير متاحة |
| 5 | B1-ATOMIC-SUBMIT-ACTION-04 | REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql | RAISE عقد المشغّل؛ دالة جديدة مفقودة؛ EXECUTE لـ anon/PUBLIC؛ طلب B1 جارٍ | الموزّع يبقى fail-closed |
| 6 | B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-05 | REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql | بقاء placeholder؛ SHA ليس 40-hex صغير؛ غياب دليل النشر؛ عدم إعادة حساب sha256 بعد الإدخال | علامة دليل فقط |
| 7 | B1-EXT-UNI-PAYMENT-CONFIRMATION-06 | EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql | رفض استبدال CHECK من صفوف موجودة؛ ERROR في تطبيق غير معاملاتي (المسودة بلا BEGIN/COMMIT — يلفّها المشغّل في معاملة واحدة)؛ فشل فحوص الامتيازات | RPC خاملة حتى وجود خطوات الدفع + بوابة التفعيل |
| 8 | B1-SECURE-ATTACHMENTS-SOURCE-07 | STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql | تعارض bucket لم يحلّه ON CONFLICT؛ أي سياسة تخزين تتجاوز INSERT واحدة؛ بقاء `submit_student_request(uuid)` القديمة قابلة للتنفيذ؛ أي ERROR | المرفقات عبر التقديم الذري فقط؛ موافقة Storage منفصلة |
| 9 | B1-TRUSTED-REFERENCE-VALIDATORS-08 | REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql | جدول/عمود مرجعي مفقود؛ validator قابل للتنفيذ من authenticated/anon؛ أي ERROR | خاملة حتى يناديها الموزّع |
| 10 | B1-EXCUSED-ABSENCE-VOCABULARY-09 | REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql | RAISE انحراف القيد؛ فشل VALIDATE على صفوف تاريخية (يستلزم إعادة كتابة ممنوعة)؛ تغيّر أعداد family/emergency التاريخية ⇒ وقف (محمي) | الكتابات الجديدة فقط |
| 11 | B1-EXCUSED-ABSENCE-DETAIL-10 | REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql | RAISE عدم تطابق الأعمدة؛ جرد السياسات ≠ owner_select واحدة بالضبط؛ امتياز لغير المالك/غير service_role | تقوية جدول فقط |
| 12 | B1-FILE-WITHDRAWAL-DETAILS-11 | REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql | RAISE توقيع الكتالوج؛ جرد السياسات ≠ 1؛ عدم تطابق وضع RLS | إنشاء جدول فقط (يسمح بـ DROP مراجَع فقط ما دام عدد الصفوف = 0) |
| 13 | B1-TRANSFER-SECURE-ATTACHMENT-12 | REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql | RAISE قيد الحقل؛ عدم تطابق جرد القيود؛ بقاء الغلاف القديم قابلاً للتنفيذ | توسيع مفردات فقط — **متابعة F2: فقد 12 بايت عبر قناة نصية؛ يجب إعادة الحساب بقناة raw-byte (git blob sha256) قبل أي تطبيق** |
| 14 | B1-FINAL-CHANCE-CANONICAL-WRITE-13 | FINAL-CHANCE-CANONICAL-WRITE-03.sql | RAISE عقد الاسم المخزن؛ تعديل قيم chance_type التاريخية (محمي) | إنفاذ كتابة فقط |
| 15 | B1-DETAIL-RPC-WRITE-BOUNDARIES-14 | REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql | RAISE عدم تثبيت الموزّع؛ عدم تطابق B1_DETAIL_*؛ دالة الحدود قابلة للتنفيذ من غير المالك | بدائية خاملة؛ تُستخدم داخل المدخل 19 فقط |
| 16 | B1-SERVICE-DETAILS-DISPATCHER-15 | REQUEST-B1-SERVICE-DETAILS-05A.sql | غياب validator/تأكيد المرفقات؛ بقاء علامة fail-closed في الموزّع بعد التطبيق؛ قابلية تنفيذ من authenticated/anon/service_role | كتابات جداول العملاء تبقى مغلقة حتى المدخل 19؛ الظهور بوابة مستقلة |
| 17 | B1-FREE-SERVICE-WORKFLOWS-16 | B1-FREE-SERVICE-WORKFLOWS-08.sql | RAISE FREE_WORKFLOW_*؛ أي صف منشأ ليس (status=draft, is_active=false)؛ أي خطوة requires_payment/produces_document | مسودات INACTIVE فقط — لا تفعيل في الجلسة نفسها أبداً |
| 18 | B1-EXT-UNI-PAYMENT-WORKFLOWS-17 | EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql | *_MUST_RESOLVE_EXACTLY_ONCE / *_STRUCTURE_MISMATCH؛ FINANCIAL_LEDGER_STEP_FORBIDDEN؛ انحراف عقد خطوة الدفع | مسودات INACTIVE فقط (department_transfer + final_chance) |
| 19 | B1-DETAIL-ACL-CUTOVER-18 | REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql | RAISE المتطلبات (B1_ACL_CUTOVER_*)؛ تعليق دليل الإصدار مفقود/مشوّه؛ أي من جداول التفاصيل الخمسة يخفق في مصفوفة الامتيازات؛ أي workflow أصبح active | التحويل النهائي لقاعدة البيانات؛ التفعيل المرئي للمستخدم بوابة منفصلة بعد تحقق أخضر |

**متطلبات مشتركة لكل مدخل**: (1) **Preflight**: تأكيد `NOT_APPLIED` بدليل كائنات D-02؛ تأكيد تطبيق السوابق؛ التقاط baselines التراجع الأمامي (pg_get_functiondef / جرد ACL)؛ صفر طلبات B1 جارية حيث يلزم. (2) **قناة التطبيق**: تطبيق يدوي لـ migration واحدة بمشغّل مخوّل (SQL editor أو psql، معاملة واحدة) بعد موافقة بشرية لكل migration — أبداً CI auto-apply أو حزم أو توازي؛ ويثبّت runbook-07 مغلف الأمر الواحد: فحص SHA-256 git-blob قبل/بعد dry-run؛ ممنوع `db push` إن اقترح 0 أو ≥2 migration؛ ممنوع `--include-all`؛ ممنوع `migration repair`؛ ممنوع بديل `psql -f` الخام؛ `Get-FileHash` عبر قناة CRLF غير معتمد. (3) **Verify**: مجسات `expected_object_proof` + اختبارات bun التعاقدية؛ أرجل PG-verifier الخاصة بـ B1 **غير موجودة** (متابعة F1). (4) **فجوة موثقة (F4)**: تحقق المدخل 19 يفحص `has_table_privilege` فقط؛ يلزم PG-verifier يؤكد `relrowsecurity` + جرد `pg_policies` owner_select بعد التحويل.

**مسودات لا تُطبَّق أبداً (4)**: REQUEST-B1-SHARED-FOUNDATION-SOURCE-01 (عقد توثيقي بلا DDL)، SUSPENSION-ABSENCE-SOURCE-01 (مصدرية فقط؛ أجّلها المؤلف)، FILE-WITHDRAWAL-SOURCE-01 (مسودة جزئية ملغاة)، ENROLLMENT-CERTIFICATE-COMPLETION-NOTIFICATION-CORRECTION (خارج نطاق B1، محمية — تمس تدفق enrollment_certificate v2 الحي).

### GATE-09 — PER-MIGRATION-VERIFIER (المحقق بعد كل migration)

- لكل مدخل: تنفيذ مجسات `expected_object_proof` على الكتالوج (الكائنات، الملاك، ACL، RLS، أعلام الظهور) + تشغيل اختبارات bun التعاقدية المرتبطة بالمدخل.
- نتائج المحقق: PASS (إثبات كائن + منح مطابقة) / FAIL (`MISSING_FROM_DRAFT`، `REVOKE_NOT_PRESENT`، `GRANT_NOT_PRESENT`، منح غير متوقعة `UNACCEPTABLE`).
- **لا يجوز الانتقال إلى المدخل التالي قبل PASS موثق للمحقق.**
- حقيقة ملزمة: **0 من 8 أرجل PG-verifier في CI تغطي أي مدخل B1** — التحقق الإنتاجي يدوي موثق حتى إغلاق متابعة F1.

### GATE-10 — PROTECTED-RECORD-CHECKS (فحص السجلات المحمية)

- بعد كل migration وبعد كل خطوة تفعيل: إعادة قراءة checksums السجلات الخمسة وهويات الرؤساء الثلاثة والحمايات الصفية (القسم 4) ومقارنتها بـ baseline ما قبل التطبيق.
- أي تغيّر غير متوقع ⇒ **إيقاف كلي**؛ المعالجة بالتقدم فقط.
- الحالات المشروعة الوحيدة للتغيّر هي تلك المنصوصة صراحة في `protected_record_impact` لكل مدخل في manifest.

### GATE-11 — SERVICE-VISIBILITY-ACTIVATION (تفعيل ظهور الخدمات)

- **المتطلبات المسبقة لمرحلة التفعيل كلها**: المداخل الـ19 كلها مطبقة ومتحققة أخضر؛ runtime مراجَع منشور بـSHA مثبت؛ الخدمات الخمس كلها ما تزال مخفية/غير نشطة؛ checksums المحمية دون تغيير؛ مسودات workflow من المدخلين 17/18 تبقى `status=draft, is_active=false` حتى GATE-12.
- **الترتيب الملزم للخدمات**: `enrollment_suspension` → `excused_absence` → `file_withdrawal` → `department_transfer` → `final_chance`.
- **لكل خدمة (موافقة منفصلة)**: رفع `student_visible=true` لتلك الخدمة فقط بعد اكتمال GATE-12 وGATE-13 وGATE-14 لها؛ إعادة قراءة أعلام الأربع الأخرى = false.
- **department_transfer إضافياً**: اكتمال GATE-06 (الرؤساء CS=1/IT=1/IS=1) + موافقة وحدة/دور الشؤون الأكاديمية.
- **department_transfer وfinal_chance**: تأكيد الدفع الجامعي الخارجي يدوياً من موظف المالية؛ **لا بوابة دفع إلكترونية ولا مبالغ/عملات/فواتير داخل البوابة**.
- **الوقف**: أي فشل يعيد الخدمة إلى HOLD دون محاولة SQL تراجعي ودون تقديم خدمة أخرى.

### GATE-12 — WORKFLOW-ACTIVATION (تفعيل سير العمل)

- لكل خدمة (موافقة منفصلة): تفعيل نسخة الـworkflow المراجَعة لتلك الخدمة فقط.
- بعد كل تفعيل: إعادة قراءة الخدمات الأربع الأخرى = صفر active، وأعلام `student_visible` الخمسة كلها false (قبل خطوة GATE-11 للخدمة الجارية).
- **ممنوع تفعيل أي workflow في جلسة تطبيق المدخلين 17/18 نفسها** (هما ينشئان مسودات INACTIVE فقط).

### GATE-13 — RPC-AUTHORIZATION-MATRIX (مصفوفة صلاحيات RPC)

- لكل خدمة: مصفوفة مباشرة — ALLOW فقط للمكلَّف المباشر المطابق لـ processing_unit/role؛ DENY لكل من: anonymous، student، unassigned، wrong-unit، wrong-role، admin، registrar-dean-bypass.
- **ممنوع إنشاء هويات أو تكليفات إنتاجية أثناء المصفوفة.**
- المرجع: `docs/B1-SAFE-RPC-MATRIX-HARNESS-01-REPORT.md`، `docs/B1-EXTENDED-RUNTIME-AUTHORIZATION-MATRIX-01-REPORT.md`.

### GATE-14 — POSITIVE-NEGATIVE-TESTS (الاختبارات الإيجابية والسلبية)

- كل حالة DENY في المصفوفة يجب أن تثبت **صفر تغيّر** (zero mutation) بقراءة لاحقة موثقة.
- كل حالة ALLOW يجب أن تثبت التغيّر المتوقع فقط ضمن نطاق الخدمة.
- أي أثر كتابة من مسار DENY ⇒ إيقاف وإعادة الخدمة إلى HOLD.

### GATE-15 — E2E (اختبار طرف-لطرف)

- E2E موثق لكل خدمة بهوية معتمدة **غير حقيقية** فقط؛ **يُمنع E2E إنتاجي على مستخدم حقيقي**.
- بعد الاختبار: مقارنة baselines السجلات المحمية مرة أخرى.
- مفردات دورة الحياة: `SOURCE_READY → PRODUCTION_APPLIED → WORKFLOW_ACTIVE → STUDENT_VISIBLE → E2E_VERIFIED → OPERATIONALLY_READY` — كل خطوة موثقة ومخوّلة على حدة.

### GATE-16 — REPORTS-ACTIVATION (تفعيل التقارير)

- الحالات الست فقط: `LIVE` (1 من 56: `STU-SELF-SERVICE-VIEWS`)، `DATA_DEPENDENT` (7)، `SOURCE_READY` (8)، `UNDER_DEVELOPMENT` (6)، `NOT_ACTIVATED` (22)، `BLOCKED` (12).
- لا يُعلن أي تقرير `LIVE` دون إثبات الركائز الخمس كلها بمسارات ملفات: مصدر بيانات فعلي + صلاحية + route + اختبار آلي + ربط UI. أقسام `/admin/reports` الستة + dashboard هي `DATA_DEPENDENT` وليست `LIVE` (لا اختبارات آلية في `tests/admin/`). بناة PR #192 `UNDER_DEVELOPMENT`. عائلات مسودات SQL `BLOCKED` حتى بوابات migration/التخويل الخاصة بها.
- الظهور fail-closed: الأدوار المجهولة/الفارغة لا ترى شيئاً؛ رموز `pending:*`/`assignment:*` لا تطابق أي دور حقيقي.
- المرجع القانوني: `docs/PORTAL-REPORTS-CANONICAL-CATALOG-AND-TRACEABILITY-01-REPORT.md` + `docs/PORTAL-REPORTS-TRACEABILITY-MATRIX-01.md` (56 مدخلاً كل منها يظهر مرة واحدة). تقرير REPORTS-AND-DASHBOARDS-COMPLETION-01 أرشيفي (`SUPERSEDED`) — حسم C12.

### GATE-17 — STUDENT-ACCOUNTS-PREFLIGHT (فحص ما قبل الاستيراد)

- **الواقع**: `student_profiles` الإجمالي=846، المربوط=843، غير المربوط=3. ملف الاستيراد (خارج المستودع) = 566 صفاً ⇒ **566 مقابل 3 = HOLD بحكم البناء** ما لم تتطابق الأعداد تماماً.
- **الحارس** (مصدر مدمج، offline/قراءة فقط): `src/lib/imports/student-accounts-preflight.ts` (+`.server.ts` قراءات SELECT فقط)؛ 12 رمز تصنيف بعقد ثابت (صفية: ALREADY_LINKED، READY_TO_CREATE، CONFLICT، STUDENT_NOT_FOUND، INVALID_EMAIL، DUPLICATE_IN_FILE، DUPLICATE_ACADEMIC_NUMBER، DUPLICATE_EMAIL، SNAPSHOT_MISMATCH؛ دفعية: FILE_CHANGED_AFTER_PREVIEW، UNAUTHORIZED، STALE_SNAPSHOT).
- **القاعدة الملزمة**: count(READY_TO_CREATE) يجب أن يساوي `snapshot.unlinked_profiles` تماماً وإلا `decision=HOLD` (`BINDING_RULE_VIOLATION`).
- **عقد اللقطة (بلا PII)**: schema_version، total/linked/unlinked (مشتقة)، captured_at، expires_at (TTL افتراضي 15 دقيقة)، source_channel، project_ref، snapshot_hash (sha256 على JSON قانوني).
- **شروط HOLD (أي منها ⇒ HOLD)**: تعارضات>0، تكرارات>0، طلاب غير موجودين>0، بريد غير صالح>0، SNAPSHOT_MISMATCH (صف أو hash لقطة مكسور)، لقطة منتهية، اختلاف project_ref، تغيّر hash الملف بعد المعاينة، غياب dry-run، دور غير مخوّل (فقط `admin`/`system_admin`)، SHA مصدر المستورد غير مثبت، إثبات publish غير مثبت، القاعدة الملزمة. `GO` فقط حين تخلو القائمة.
- **محاذير**: لا استيراد حي/إنشاء مستخدم Auth/ربط إنتاجي دون جلسة مخوّلة منفصلة (GATE-18)؛ ملف الـ566 يجب ألا يدخل المستورد دون فحص؛ لا إنشاء حسابات أثناء D-02. سقف مسح Auth = 20×200=4000 (موثق؛ إنشاء التكرار يفشل مغلقاً لدى Supabase).
- الرموز: `STUDENT_ACCOUNTS_SOURCE_PRESENT`/`_MISSING`؛ قرار `GO`/`HOLD_<reason>`.
- حسم C11: حارس التوفيق (`docs/STUDENT-ACCOUNTS-PRODUCTION-REALITY-RECONCILIATION-01-REPORT.md`) هو القانوني؛ تقرير المستورد الأقدم ملغى؛ المستورد يبقى مصدرياً فقط حتى قرار GO.

### GATE-18 — CONTROLLED-ACCOUNT-CREATION (إنشاء الحسابات المضبوط)

- **المتطلبات**: قرار `GO` موثق من GATE-17 + جلسة تخويل مستقلة + dry-run موثق + hash ملف مطابق للمعاينة + لقطة غير منتهية.
- التنفيذ دفعات مضبوطة داخل الجلسة المخوّلة فقط؛ أي انحراف ⇒ إيقاف فوري.

### GATE-19 — POST-IMPORT-VERIFICATION (التحقق بعد الاستيراد)

- إعادة قراءة أعداد المربوط/غير المربوط؛ صفر تكرارات (البريد/الرقم الأكاديمي)؛ كل صف READY_TO_CREATE أصبح مربوطاً؛ صفر حسابات خارج ملف الاستيراد؛ إعادة فحص السجلات المحمية.
- أي فرق ⇒ إيقاف؛ المعالجة بالتقدم فقط (ممنوع DELETE لحسابات/روابط إنتاجية خارج مسار مراجَع جديد).

### GATE-20 — LAUNCH-SMOKE (اختبار الإطلاق الدخاني)

- قائمة go-live التفاعلية اليدوية (`docs/documentation/07_Go_Live_Checklist.md`) + فحص الخدمات الخمس (ظاهرة، workflow نشط، RPC يعمل) + صفحة التقارير + عينة حسابات طلاب + السجلات المحمية سليمة.
- التجربة المحدودة (pilot) مستمرة بنطاقها المجمد (برنامج IT؛ طلبات شؤون الطلاب + تقارير قراءة فقط)؛ التوسع يتطلب بوابة جاهزية مستقلة (EXPAND-PILOT-READINESS-01).
- إعلان الإطلاق قرار موثق مستقل بعد PASS كلي.

---

## 4. السجلات والهويات المحمية (المجموعة القانونية)

حسم C4: المجموعة القانونية = **5 سجلات صريحة** (بما فيها الصفان الموسومان «بيانات اختبار» — بيانات الاختبار محمية أيضاً) **+ 3 هويات رؤساء أقسام + الحمايات الصفية**. قائمة runbook-07 الرباعية ناقصة وملغاة.

### 4.1 السجلات الصريحة الخمسة

| السجل | التعريف | ملاحظة |
|---|---|---|
| `SR-20260713-2DE64041` | طلب طالب (uuid `93807768-…`) | محمي |
| `SR-20260715-FEDCB3E1` | طلب طالب (uuid `9cfd55a4-…`) | محمي |
| `SR-20260716-26BAD4C8` | طلب طالب (uuid `ec85cca4-…`) | محمي — موسوم «بيانات اختبار» ويبقى محمياً |
| `USR-2026-000001` | حساب | محمي |
| `USR-2026-000002` | حساب | محمي — موسوم «بيانات اختبار» ويبقى محمياً |

### 4.2 هويات رؤساء الأقسام الثلاثة

| الرقم الوظيفي | الاسم | الوضع القانوني |
|---|---|---|
| `F2025006` | د. أسامة عبدالجليل أحمد سيف | ينتمي CS؛ مكلَّف خطأً في IT (الصف الخاطئ يُعطَّل ولا يُحذف) |
| `F2025005` | د. خالد قاسم محمد البراحي | رئيس IT الشرعي |
| `F2025004` | د. رمزي حميد الجابري | رئيس IS الشرعي |

### 4.3 الحمايات الصفية (class-level، من manifest `protected_records`)

1. تدفق **enrollment_certificate v2** الحي.
2. مفردات **absence_reason** التاريخية (family/emergency).
3. أسماء **chance_type** التاريخية المستعارة.
4. جدول **audit_logs** (ممنوع إعادة الكتابة التاريخية).
5. **كائنات المرفقات** (attachment objects).

---

## 5. متطلبات الدليل لكل قرار (Evidence Requirements)

**مبدأ عام**: لا قرار بلا دليل مرفق، ولا PASS بلا دليل. كل دليل بلا PII (أعداد/رموز/مسارات فقط).

| القرار | الدليل الإلزامي |
|---|---|
| دمج مصدري (merge) | CI أخضر (quality + bun-tests + pg-verifiers 8/8) على رأس PR + مراجعة مستقلة PASS (CRITICAL/HIGH/MEDIUM=0) + لا auto-merge |
| اعتماد RC | وثيقة RC مثبتة الـSHA + شجرة نظيفة + CI main أخضر |
| Deploy / Publish | بيان publish رسمي + قراءة مستقلة تثبت `DEPLOYED_SHA` (40-hex) — endpoint حي لا يكفي |
| D-02 | مخرجات Q1…Q4 كاملة + حكم نهائي + سجل قناة القراءة فقط المخوّلة |
| التدقيق الدلالي للرؤساء | مخرجات التصنيفات الثمانية + إثبات ROLLBACK (READ ONLY) |
| D-01 | مخرجات PREFLIGHT (14/14) + إيصال معاملة واحدة + POST-VERIFIER PASS + جلسة بإعداد الدليل + كاردينالية 1/1/1 بعد التنفيذ |
| كل migration (log_audit + مداخل B1) | حزمة runbook-07: SHA الـorigin/main، مسار+SHA الـmigration المروَّجة، نسخة CLI، هوية المشروع، مراجعة مستقلة PASS، قراءة حالة ما قبل (تاريخ، تعريفات كائنات/ملاك/ACL/RLS، أعلام ظهور، أعداد workflow، تكليفات، buckets/سياسات، checksums الصفوف المحمية)، مخرجات dry-run تثبت migration واحدة بالضبط، تحقق لاحق + مقارنة ثوابت بلا أي فرق غير متوقع |
| المحقق بعد كل migration | مخرجات مجسات `expected_object_proof` + نتائج اختبارات bun التعاقدية |
| فحص المحمي | checksums قبل/بعد + بيان مطابقة |
| service activation | قراءة أعلام `student_visible` الخمسة (واحد true فقط) |
| workflow activation | قراءة workflows: النسخة المراجعة وحدها active للخدمة المعنية |
| مصفوفة RPC + اختبارات سلبية | سجل ALLOW/DENY كامل + إثبات zero mutation لكل DENY |
| E2E | سيناريو موثق بهوية غير حقيقية + مقارنة baselines لاحقة |
| تفعيل تقارير | إثبات الركائز الخمس بمسارات ملفات لكل تقرير ينتقل إلى LIVE |
| preflight الحسابات | مخرجات الحارس (12 رمز تصنيف) + لقطة موقعة الـhash + قرار GO/HOLD مسبب |
| إنشاء الحسابات | قرار GO + dry-run + hash ملف مطابق + سجل جلسة التخويل |
| ما بعد الاستيراد | أعداد نهائية + صفر تكرار + فحص محمي |
| الإطلاق | قائمة go-live مكتملة + نتائج smoke + إعلان موثق |

---

## 6. سياسة التراجع بالتقدم (ROLLBACK_BY_FORWARD)

1. الوضعية الوحيدة المسموحة برنامجياً: استعادة عبر CREATE OR REPLACE أمامي إلى baseline ملتقط، أو migration جديدة مراجَعة، أو إلغاء تفعيل (`is_active=false`) بدل DELETE.
2. ممنوع منعاً باتاً: down-migrations، DELETE لبيانات الإنتاج، إعادة كتابة تاريخية، `migration repair`، reset/cleanup، كتابة مباشرة في جداول التاريخ.
3. لصفوف المراجع المحلولة خطأً: إلغاء التفعيل بدل الحذف. المدخل 12 وحده يسمح بـ DROP مراجَع فقط ما دام عدد الصفوف = 0.
4. D-01 لها ملف ROLLBACK-BY-FORWARD مخصص (UPDATEs فقط) يعيد حالة ما قبل التنفيذ بما فيها العيب المعروف.
5. عند أي إيقاف: تجميد التسلسل كاملاً، تقييم الحالة (PARTIAL/AMBIGUOUS/FAILED)، ثم خطة تقدم مراجَعة جديدة — لا استئنافاً صامتاً ولا إعادة محاولة بلا إعادة تخويل.

---

## 7. المحاذير (Prohibitions) — القائمة القانونية الموحدة

المحاذير الخمسة الأولى هي محاذير المهمة الصريحة؛ يليها المحاذير المشتركة الخمسة عشر الموثقة عبر المسارات (دمجاً).

1. **ممنوع batch migrations**: لا تطبيق جماعي ولا موافقة واحدة لأكثر من migration (`batch_apply_forbidden=true`، `max_migrations_per_apply_session=1`).
2. **ممنوع التفعيل قبل الصلاحيات (no activation before auth)**: لا `student_visible=true` ولا workflow active قبل اجتياز مصفوفة RPC والاختبارات السلبية للخدمة المعنية.
3. **ممنوع استيراد الحسابات قبل preflight**: لا live import ولا إنشاء Auth قبل قرار `GO` من حارس preflight في جلسة مخوّلة.
4. **ممنوع تخمين DEPLOYED_SHA**: لا افتراض ولا استنتاج من endpoint حي؛ الإثبات فقط عبر بيان publish + قراءة مستقلة.
5. **ممنوع إثبات التطبيق بالاسم فقط (no migration-name-only proof)**: حالة التطبيق تُثبت بدليل catalog كائني؛ مطابقة الأسماء مع صفوف Lovable UUID ممنوعة كدليل.
6. ممنوع التوازي (`parallel_apply_forbidden=true`) وممنوع CI auto-apply؛ SQL الإنتاج فقط عبر قناة يدوية مخوّلة.
7. ممنوع أي SQL إنتاجي دون موافقة بشرية لكل migration؛ ممنوع ادعاء `DEPLOYED` دون دليل بوابة النشر.
8. ممنوع down-migrations / DELETE بيانات إنتاج / إعادة كتابة تاريخية / `migration repair` / reset / cleanup.
9. ممنوع PII في التقارير والاختبارات وCI وأدلة الدليل (أعداد/رموز فقط؛ معرّفات اصطناعية `F9999xxx`).
10. ممنوع auto-merge؛ مراجعة مستقلة PASS (CRITICAL=0/HIGH=0/MEDIUM=0) قبل أي دمج.
11. ممنوع إضعاف CI (لا `continue-on-error`، لا اكتشاف انتقائي، حارس الاكتشاف إلزامي).
12. ممنوع E2E إنتاجي على مستخدمين/هويات حقيقية؛ ممنوع إنشاء هويات/تكليفات إنتاجية أثناء مصفوفة RPC.
13. ممنوع تعديل `student_visible` خارج خطوة موافقتها المخصصة؛ الخدمات تبقى fail-closed حتى بوابة التفعيل.
14. ممنوع الكتابة المباشرة في تاريخ الطلبات؛ ممنوع اختراع UUIDs في إصلاحات البيانات (`gen_random_uuid()` فقط).
15. ممنوع تطبيق مسودة حُسب hashها عبر قناة نصية CRLF (`Get-FileHash`)؛ raw-byte (git blob sha256) فقط — وهذا يلزم إعادة حساب hash المدخل 13 قبل تطبيقه.
16. ممنوع تطبيق مسودات «لا تُطبَّق أبداً» الأربع (القسم 3، GATE-08).
17. ممنوع منح امتيازات واسعة/غير معرفة (`UNACCEPTABLE`)؛ EXECUTE لـ anon/PUBLIC على RPC شرط إيقاف.
18. ممنوع أي بوابة دفع/مبالغ/عملات/فواتير داخل البوابة (الدفع الجامعي الخارجي يدوي من موظف المالية).

---

## الملحق (أ) — حسم التعارضات الاثني عشر (كيف يسود هذا الدليل الوثائق البالية)

| # | التعارض | الحسم القانوني المعتمد هنا |
|--:|---|---|
| C1 | تقرير إغلاق log_audit غير موجود على main (تبعية Track A) | يُستشهد به كـ **PENDING**؛ دلالات المدخل 1 تُربط بـ manifest المدخل 1 + runbook-07 الصف 1 + تقرير المعالجة المصدرية + مسودة الإغلاق (قيد الإعداد في Track A)؛ **لا تخويل للمدخل 1 قبل وصول التقرير إلى main** |
| C2 | طول التسلسل: 18 (runbook-07/SWARM-GATES) مقابل 19 (manifest) | **manifest قانوني = 19 مدخلاً**؛ عبارات «18» بالية؛ إعادة الترقيم بعد إدراج PREDECESSOR-GUARD-REMEDIATION في الموضع 3 معلنة صراحة |
| C3 | تصادم تسمية «gate 19» | الترقيم القانوني: مداخل تطبيق 1–19 ثم **بوابة تفعيل (ما بعد المدخل 19)**؛ «gate 19» في الوثائق التاريخية تعني بوابة التفعيل؛ هذا الدليل يستخدم فضاء GATE-01…GATE-20 المستقل |
| C4 | قوائم السجلات المحمية متباينة | المجموعة القانونية = 5 سجلات صريحة + 3 هويات رؤساء + الحمايات الصفية؛ قائمة runbook-07 الرباعية ناقصة وملغاة |
| C5 | حزمة الرؤساء PACKAGE-01 مقابل PACKAGE-02 | **PACKAGE-02 للتنفيذ**؛ PACKAGE-01 تاريخية محفوظة دون مساس؛ مراجع G1/master-state بالية |
| C6 | AMBIGUOUS خارج مفردات حالة manifest | تُعرَّف AMBIGUOUS فئةَ تعارض أدلة/هوية مستقلة عن مفردات حالة التطبيق؛ سلوك الوقف مطابق لـ PARTIAL (إيقاف كلي)؛ نطاقا D-01 وD-02 موسومان (القسم 1) |
| C7 | مجس D-02 Q3d معطوب مقابل التعريف الدلالي | تعريف D-01 الدلالي قانوني لفحوص الرؤساء؛ **يجب إصلاح مجس Q3d قبل إعادة تنفيذ D-02** (متابعة F3) |
| C8 | قواعد/SHAs متنافسة | أربعة SHAs مميزة (القسم 0): قاعدة التوثيق debf9d0، base_ref للـmanifest‏ 45148e09، RC الملزم 0e2d25c9، DEPLOYED_SHA مجهول حتى يُثبت؛ كل مرجع لـ 427b7eb4 أرشيفي |
| C9 | نهائية CI: رمز إغلاق PR194 المؤقت مقابل بيان RC | PR194 مدموج وأخضر؛ الرمز النهائي `PASS_CI_HARDENING_PR194_MERGED_MAIN_GREEN` يسود الرمز المؤقت |
| C10 | سرد «أول تفعيل» مقابل الحالة fail-closed | preflight 2026-07-20 سجل **PASS على القائمة / HOLD على المنشأ**؛ التفعيل يتطلب إعادة تشغيل القائمة على RC الجديد وفق خطوات الاستئناف المرتبة 1–4 في B1-PREFLIGHT-FRESH-BASELINE-01 |
| C11 | انحراف نطاق استيراد حسابات الطلاب | حارس التوفيق قانوني؛ المستورد مصدري فقط حتى قرار GO وفق قائمة HOLD الـ15؛ أي وثيقة أقدم توحي بجاهزية استيراد مباشر ملغاة |
| C12 | عدد تقارير «LIVE» مقابل ادعاءات الأقسام | الكتالوج + مصفوفة التتبع قانونيان (1 من 56 LIVE)؛ تقرير الإكمال أرشيفي (`SUPERSEDED` في مكانه) |

**بند إضافي A-13 (توضيح ترتيب مرحلة التفعيل)**: عرض التكليف القانوني بوابةَ service visibility قبل workflow activation في ترقيم البوابات العشرين؛ التنفيذ الملزم داخل كل خدمة يتبع `activation_gate`: تفعيل workflow → مصفوفة RPC → اختبارات سلبية → `student_visible=true` → E2E. لا تعارض جوهرياً: GATE-11 تُفتح كمرحلة ولا تُختم لأي خدمة إلا بعد GATE-12/13/14 لها.

**بند إضافي A-14 (فضاء الترقيم)**: أرقام هذا الدليل (GATE-01…GATE-20) فضاء جديد؛ «GATE-19» هنا (التحقق بعد الاستيراد) لا علاقة له بمدخل manifest رقم 19 ولا بـ«gate 19» التاريخية (التفعيل).

## الملحق (ب) — المتابعات المفتوحة (Follow-ups)

- **F1**: 0 من 8 أرجل PG-verifier في CI تغطي أي migration من B1؛ التحقق الإنتاجي يدوي موثق حتى إنشاء أرجل B1.
- **F2**: hash المدخل 13 (B1-TRANSFER-SECURE-ATTACHMENT-12) فُسد عبر قناة نصية (فقد 12 بايت)؛ يجب إعادة الحساب عبر قناة raw-byte (git blob sha256) فقط قبل أي تطبيق.
- **F3**: مجس D-02 Q3d للرؤساء معطوب (`ilike '%chair%'` لا يطابق أي role code)؛ يجب إصلاحه ليتبنى التعريف الدلالي (unit=`department` + role=`department_head`) قبل إعادة تنفيذ D-02.
- **F4**: تحقق المدخل 19 اللاحق يفحص `has_table_privilege` فقط؛ يلزم PG-verifier يؤكد `relrowsecurity` + جرد `pg_policies` بعد التحويل.
- **F5**: تقرير إغلاق log_audit (`docs/LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01-REPORT.md`) ومسودة الإغلاق (`docs/migration-drafts/LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01.sql`) **PENDING** من Track A (مسار CI مفتوح) — مانع صلب لتخويل المدخل 1.
- **F6**: جدول `supabase_migrations.schema_migrations` غير قابل للقراءة حالياً (VERIFIER_EXECUTION_GAP)؛ يلزم قناة قراءة فقط مرتفعة مخوّلة لمرة واحدة (G0).

## الملحق (ج) — المصادر القانونية

القانوني للتسلسل: `docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json` + تقرير إغلاقه. باقي المصادر مذكورة سطراً بسطر داخل أقسام البوابات أعلاه (runbook-07، SWARM-GATES، FRESH-RELEASE-CANDIDATE-01، B1-PREFLIGHT-FRESH-BASELINE-01، preflight-02، حزمة D-02 وتقرير تنفيذها، D-01 refresh، تقرير التوفيق لحسابات الطلاب، كتالوج التقارير، CI-TESTS-AND-PG-VERIFIERS-01، PR194-CLOSURE، ROUTETREE-REGISTER-CLEAN-TREE-01، B1-PREFLIGHT-BLOCKERS-SOURCE-REMEDIATION-01، SAFE-RPC-MATRIX-HARNESS-01، EXTENDED-RUNTIME-AUTHORIZATION-MATRIX-01، LIMITED-PILOT-MONITORING-01، EXPAND-PILOT-READINESS-01).

---

*نهاية الدليل. هذه وثيقة توثيق فقط؛ أي تنفيذ إنتاجي يتطلب الموافقات المنفصلة الموثقة أعلاه.*
