# تقرير: B1-SEQUENTIAL-APPLY-MANIFEST-AND-VERIFIER-CLOSURE-01

## الملخص

تم بناء مانيفست التطبيق التسلسلي لمجموعة B1 في `docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json`،
مع اختبارات بنيوية في `tests/b1-manifest/` (20 اختبارًا، كلها ناجحة عبر `bun test`).

- **الحالة الإجمالية:** كل المداخل الـ19 `NOT_APPLIED` (وفق أدلة الكائنات D-02 على main‏ @ `45148e09`).
- **ممنوع منعًا باتًا:** التطبيق الدفعي (batch apply)، التطبيق الآلي عبر CI، ادعاء `DEPLOYED` / `DEPLOYED_SHA` بدون دليل نشر موثّق.
- **إثبات الحالة:** يكون فقط عبر أدلة الكائنات في الكتالوج؛ **يُحظر** مطابقة الأسماء مع صفوف ترحيل Lovable UUID كدليل تطبيق.

## الأعداد

| البند | العدد |
|---|---|
| مداخل مجموعة التطبيق (18 مسودة خطة + 1 مُلحقة B1) | 19 |
| مسودات never-apply (مع الأسباب) | 4 |
| مسودات خارج النطاق (غير B1، للاكتمال) | 9 |
| أرجل مُتحقِّقات CI الحالية (pg-verifier) المُعَمَّمة | 8 |
| أرجل مُتحقِّقات CI التي تغطي B1 | **0** |
| أول ترحيل في التسلسل (صفر اعتماديات) | 1 فقط: `B1-LOG-AUDIT-CALL-DISAMBIGUATION-01` |

## ملخص الرسم البياني للاعتماديات

- التسلسل الكلي (sequence_order 1→19): LOG-AUDIT-01 ← HARDENING-02 ← PREDECESSOR-GUARD-01 ← EXPANSION-03 ← ATOMIC-04 ← STAMP-05 ← EXT-PAY-CONF-06 ← SECURE-ATTACH-07 ← VALIDATORS-08 ← EA-VOCAB-09 ← EA-DETAIL-10 ← FW-DETAILS-11 ← TRANSFER-SECURE-12 ← FINAL-CHANCE-13 ← WRITE-BOUNDARIES-14 ← DISPATCHER-15 ← FREE-WF-16 ← EXT-PAY-WF-17 ← ACL-CUTOVER-18.
- **موضع المُلحقة:** `B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-01` بعد HARDENING مباشرة (الموضع 3) وقبل ATOMIC-04، لأنها تستبدل `can_current_user_act_on_step` بالنسخة v3 (حراسة السوابق) التي يعتمد عليها المسار الذري.
- **إنفاذ التسلسل بنيويًا:** اعتماديات كل مدخل = الاعتماديات المحتوى + السَلَف التسلسلي الإلزامي، لذلك يستحيل تخطي ترتيب أو دمج دفعات دون كسر الرسم.
- **الفحوص:** لا دورات (فرز طوبولوجي كامل)، لا اعتمادية مفقودة، canonical_id وفريد filenames فريدة، مدخل أول واحد فقط بصفر اعتماديات، الاعتماديات الخارجية (الترحيلات المُطبَّقة سلفًا) موثقة منفصلة وليست حواف في الرسم.

## تعيين مُتحقِّقات CI الحالية (8/8) إلى الترحيلات

الأرجل الثمانية كلها **ليست** مُتحقِّقات B1: graduates-affairs (2)، academic-clearance (2)، graduation-projects (2)، materials-secure-activation (1)، lecture-execution-foundation (1).
- ربط معلوماتي فقط: academic-clearance يتشارك مفردات «department transfer» مع `B1-EXT-UNI-PAYMENT-WORKFLOWS-17` و`B1-PROCESSING-DOMAINS-EXPANSION-03` (مجال مختلف تمامًا).
- **فجوة مُتحقِّقات PG لـ B1 تبقى متابعة مفتوحة** — حاليًا الاعتماد على اختبارات عقد المصدر (bun) + أدلة الكائنات.

## قائمة never-apply مع الأسباب

1. `REQUEST-B1-SHARED-FOUNDATION-SOURCE-01.sql` — عقد مصدر توثيقي بلا DDL قابل للتنفيذ؛ حلّت محله المسودات المرتبة (04/05A).
2. `SUSPENSION-ABSENCE-SOURCE-01.sql` — عقد مصدر فقط؛ مؤجل بقرار مؤلفه لعدم تخويل التطبيق/التفعيل؛ حلّت محله المسودات المرتبة.
3. `FILE-WITHDRAWAL-SOURCE-01.sql` — مسودة جزئية (جدول + نثرية)؛ حلّ محلها `B1-FILE-WITHDRAWAL-DETAILS-11` و`B1-FREE-SERVICE-WORKFLOWS-16`.
4. `ENROLLMENT-CERTIFICATE-COMPLETION-NOTIFICATION-CORRECTION.sql` — خارج نطاق B1 و**محمية**: تمس سير عمل enrollment_certificate v2 الحي؛ ممنوع على B1 تعديلها.

## منع التطبيق الدفعي (على مستوى المانيفست)

`global_policies`: `batch_apply_forbidden=true`، `max_migrations_per_apply_session=1`، `parallel_apply_forbidden=true`، `ci_auto_apply_forbidden=true`، وبروتوكول إلزامي لكل مرحلة:
**PREFLIGHT ← APPLY ONE ONLY ← VERIFY ← PROTECTED RECORD CHECK ← RECORD EVIDENCE**،
مع إيقاف كامل للتسلسل عند أي فشل/حالة جزئية/غامضة، ومعالجة بالإمام فقط (rollback-by-forward).

## مسح grants_revokes مقابل نصوص المسودات الفعلية (معالجة مراجعة PR #203)

بعد أن ثبت خطأ حقل `grants_revokes` في مدخل `B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-01` (ومصدره ملف جرد الاستطلاع — ما يثبت قابلية الجرد للخطأ في هذا الحقل)، أُعيد اشتقاق الحقل لكل المداخل الـ19 **مباشرة من نصوص المسودات الفعلية** على main‏ @ ‏`45148e09` (نسخ محلية مُتحقق منها بايتيًا؛ بصمات blob عبر API مرجعية)، دون أي اعتماد على الجرد.
- **المنهج:** (1) grep موسوم `^[[:space:]]*(GRANT|REVOKE)` على كل مسودة؛ (2) مسح غير موسوم لالتقاط SQL الديناميكي (`format()`/`EXECUTE`)؛ (3) مسح شامل لأي ذكر (بما فيه التعليقات) في الملفات الصفرية؛ (4) التقاط البيانات متعددة الأسطر كاملة.
- **الحصيلة:** 4 مداخل كانت صحيحة أصلًا («none»)، ومدخلان كانا صحيحين دلاليًا فنُظّما إلى نص البيانات الحرفي، و13 مدخلًا صُحِّحت.

| المدخل | البيانات الفعلية في المسودة | النتيجة |
|---|---|---|
| LOG-AUDIT-01 | 2 (REVOKE ALL + GRANT EXECUTE على `cancel_official_document`) | كان صحيحًا دلاليًا؛ نُظّم حرفيًا |
| HARDENING-02 | 0 | **صُحِّح** (كان يدّعي GRANT غير موجود في المسودة) |
| PREDECESSOR-GUARD-01 | 6 (3 REVOKE + 3 GRANT EXECUTE على الدوال الثلاث) | **صُحِّح** (كان «none») |
| EXPANSION-03 | 0 | صحيح أصلًا |
| ATOMIC-04 | 10 (8 REVOKE + REVOKE/GRANT EXECUTE على RPCَي `submit_/act_on_...atomic`) | **صُحِّح** (كان «none») |
| STAMP-05 | 0 | صحيح أصلًا |
| EXT-PAY-CONF-06 | 2 (REVOKE + GRANT EXECUTE على `record_external_university_payment_confirmation`) | **صُحِّح** (كان «none») |
| SECURE-ATTACH-07 | 18 (REVOKE على جدول المرفوعات + 9 REVOKE دوالّ — منها `submit_student_request` — + 8 GRANT EXECUTE) | **صُحِّح** (كان يذكر REVOKE واحدًا فقط) |
| VALIDATORS-08 | 3 (REVOKE على دوال `assert_b1_*` الثلاث) | كان صحيحًا دلاليًا؛ نُظّم حرفيًا |
| EA-VOCAB-09 | 1 (REVOKE على `enforce_canonical_absence_reason_write`) | **صُحِّح** (كان «none») |
| EA-DETAIL-10 | 3 (REVOKE دالة + REVOKE ALL على الجدول + GRANT SELECT) | **صُحِّح** (كان «none») |
| FW-DETAILS-11 | 4 (2 REVOKE + 2 GRANT SELECT على `file_withdrawal_details`) | **صُحِّح** (كان «none») |
| TRANSFER-SECURE-12 | 5 (4 REVOKE + GRANT EXECUTE على `create_..._upload_intent`) | **صُحِّح** (كان ناقصًا) |
| FINAL-CHANCE-13 | 4 (2 REVOKE دوالّ + REVOKE ALL PRIVILEGES + GRANT SELECT على `extra_chance_details`) | **صُحِّح** (كان ناقصًا REVOKE الدالتين) |
| WRITE-BOUNDARIES-14 | 1 ثابت (REVOKE على الدالة نفسها) + REVOKE/GRANT **ديناميكي** داخل الدالة على 3 جداول | **صُحِّح** (كان معكوس التركيز وناقصًا) |
| DISPATCHER-15 | 1 (REVOKE على `persist_validated_b1_request_details`) | **صُحِّح** (كان «none») |
| FREE-WF-16 | 0 | صحيح أصلًا |
| EXT-PAY-WF-17 | 0 | صحيح أصلًا |
| ACL-CUTOVER-18 | 0 بيان ثابت؛ التغيير يتم **ديناميكيًا** عبر استدعاء `apply_b1_detail_rpc_write_boundaries()` | وُضّح صراحة + فجوة تحقق موثقة أدناه |

- مسودات never-apply الأربع لا تحمل الحقل أصلًا في المانيفست، وتحوي 0 بيانات GRANT/REVOKE (توثيقية/مصدرية) — متسق.
- **ملاحظة ACL-CUTOVER-18 (فجوة تحقق تنفيذية):** كتلة post-verify DO في مسودة القطع تفحص فقط مصفوفات `has_table_privilege` (anon بلا امتيازات؛ authenticated/service_role قراءة فقط)، ولا تتحقق من `relrowsecurity` ولا من جرد `pg_policies`؛ تفعيل RLS وإنشاء سياسة `owner_select` يتمان داخل دالة المدخل 14 (ولها حراساتها الداخلية `B1_DETAIL_*`). لذا يبقى بندا «RLS مفعّل + سياسة owner_select الوحيدة» ضمن `expected_object_proof` **فجوة تحقق تنفيذية** — متابعة مسجلة: إضافة رجل pg-verifier تؤكد `relrowsecurity` وجرد السياسات بعد القطع.

## التواقيع (مقتطف)

- `source_sha` (git blob SHA-1 على main): **18/19** مدخلًا من مجموعة التطبيق مُطابَق بين قائمة الدليل واستجابة API و`git hash-object` محليًا؛ والمدخل 19 (`TRANSFER-SECURE-12`) اعتُمدت فيه بصمة API ‏`805d3534…` مرجعيةً لأن النسخة النصية المحلية (`fabe936a…`، ‏8426 بايت) تفقد 12 بايتًا غير مُصيَّرة — أي **22/23** على مستوى كامل المسودات (23)، مع بقاء مسودة واحدة بمرجعية API.
- 17/18 مسودة الخطة: sha256 المحلي = تثبيت الخطة.
- **انحراف موثق:** `REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql` — قناة النص فقدت 12 بايت غير مُصيَّرة (8426 محلي مقابل 8438 بعيد؛ blob SHA مُتحقق `805d3534…`). اعتُمد تثبيت الخطة `d80f691c…` مع توثيق القيمة المحلية `06312229…`، ومتابعة إلزامية لإعادة الحساب عبر قناة بايت خام قبل التطبيق.

## التحقق المحلي

- `bun test tests/b1-manifest/` ‏→ **20/20 ناجح** (bun 1.3.14).
- JSON يُقرأ ويُحلَّل بنجاح؛ لا مسافات زائدة بنهايات الأسطر.
- المجموعة الكاملة للاختبارات/البناء: **مؤجلة إلى CI** (إفصاح).

## إخلاء ومتابعات

- B1 يبقى كاملًا `NOT_APPLIED`؛ هذا التسليم توثيقي/اختباري فقط — لا تطبيق ترحيلات، لا نشر، لا SQL إنتاجي.
- المتابعات: (1) فجوة مُتحقِّقات PG لـ B1؛ (2) إعادة حساب sha256 لمسودة STAMP-01 بعد إدخال SHA الإصدار الحقيقي (التثبيت الحالي يغطي بايتات placeholder)؛ (3) إعادة حساب TRANSFER-SECURE-12 عبر قناة بايت خام؛ (4) بوابة التفعيل 19 تبقى خطوة منفصلة بعد نجاح ACL-CUTOVER؛ (5) فجوة التحقق التنفيذية لـ ACL-CUTOVER-18 (تأكيد `relrowsecurity` + جرد `pg_policies` بعد القطع)؛ (6) معالجة بيانات التنفيذات غير المخولة تاريخيًا (مسار منفصل).

**يحتاج مراجعة مستقلة قبل الدمج — لا دمج تلقائي.**
