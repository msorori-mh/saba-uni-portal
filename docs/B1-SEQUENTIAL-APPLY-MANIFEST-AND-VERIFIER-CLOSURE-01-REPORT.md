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

## التواقيع (مقتطف)

- 19/19 مدخلًا: `source_sha` (git blob SHA-1 على main) مُطابَق بين قائمة الدليل واستجابة API و`git hash-object` محليًا.
- 17/18 مسودة الخطة: sha256 المحلي = تثبيت الخطة.
- **انحراف موثق:** `REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql` — قناة النص فقدت 12 بايت غير مُصيَّرة (8426 محلي مقابل 8438 بعيد؛ blob SHA مُتحقق `805d3534…`). اعتُمد تثبيت الخطة `d80f691c…` مع توثيق القيمة المحلية `06312229…`، ومتابعة إلزامية لإعادة الحساب عبر قناة بايت خام قبل التطبيق.

## التحقق المحلي

- `bun test tests/b1-manifest/` ‏→ **20/20 ناجح** (bun 1.3.14).
- JSON يُقرأ ويُحلَّل بنجاح؛ لا مسافات زائدة بنهايات الأسطر.
- المجموعة الكاملة للاختبارات/البناء: **مؤجلة إلى CI** (إفصاح).

## إخلاء ومتابعات

- B1 يبقى كاملًا `NOT_APPLIED`؛ هذا التسليم توثيقي/اختباري فقط — لا تطبيق ترحيلات، لا نشر، لا SQL إنتاجي.
- المتابعات: (1) فجوة مُتحقِّقات PG لـ B1؛ (2) إعادة حساب sha256 لمسودة STAMP-01 بعد إدخال SHA الإصدار الحقيقي (التثبيت الحالي يغطي بايتات placeholder)؛ (3) إعادة حساب TRANSFER-SECURE-12 عبر قناة بايت خام؛ (4) بوابة التفعيل 19 تبقى خطوة منفصلة بعد نجاح ACL-CUTOVER؛ (5) معالجة بيانات التنفيذات غير المخولة تاريخيًا (مسار منفصل).

**يحتاج مراجعة مستقلة قبل الدمج — لا دمج تلقائي.**
