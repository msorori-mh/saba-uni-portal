# PORTAL-FIRST-DELIVERY-PRODUCTION-APPLY-PACKAGE-FINAL-01

**الحالة:** SOURCE-ONLY — حزمة توثيقية موحدة. **لا تخويل تنفيذ مضمّن.** كل مرحلة تتطلب موافقة بشرية صريحة منفصلة، والموافقة الموحدة المطلوبة هنا هي على **الترتيب** فقط — التنفيذ يبقى مرحلة-بمرحلة.
**النطاق:** الخدمات الخمس (`enrollment_suspension`, `excused_absence`, `department_transfer`, `final_chance`, `file_withdrawal`). **المحمي:** `enrollment_certificate` والسجلات الخمسة (SR-20260713-2DE64041 / SR-20260715-FEDCB3E1 / SR-20260716-26BAD4C8 / USR-2026-000001 / USR-2026-000002).
**المرجعية:** حزمة المشغّل `docs/first-delivery-operator-pack/` وموجهات `docs/production-prompts/` (تصل عبر PR #261)، وPROMOTION-MAP (`docs/migration-drafts/b1-backend-verifiers/PROMOTION-MAP.json`).

## الترتيب الملزم (بلا لبس)

| # | المرحلة | القناة | شرط الانتقال |
|---|---|---|---|
| 1 | **Production Read-Only preflight** — تثبيت خط الأساس: التاريخ، الكائنات، السجلات المحمية، الخمس مخفية، لا bucket | SQL read-only (ROLLBACK) | PASS كامل؛ أي drift = STOP |
| 2 | **B0** — إنشاء bucket خاص `student-request-secure-attachments` (`public=false`, 5MiB, pdf/jpeg/png) | أداة Storage المُدارة | عقد الـbucket مؤكد |
| 3 | **B1** — migration واحدة `20260725110050` (SEQ07-B) | مشغّل migrations | verifier + التاريخ = `20260725110050` فقط |
| 4 | **SEQ08→SEQ24** — migration واحدة في كل مرحلة بالترتيب (الجدول أدناه) | مشغّل migrations | verifier بعد كل واحدة؛ FAIL/PARTIAL/AMBIGUOUS = إيقاف فوري |
| 5 | **مصفوفة التفويض direct-RPC** (موجبة+سالبة، صفر mutation) قبل أي E2E | SQL read-only | 24/528/528/0 |
| 6 | **Gate 25** — بوابة تفعيل مستقلة بموافقة منفصلة | تشغيلي | اعتماد صريح |
| 7 | **تفعيل خدمة واحدة فقط في كل مرة** بالترتيب: enrollment_suspension ← excused_absence ← file_withdrawal ← department_transfer ← final_chance | تشغيلي | لكل خدمة: تعيين صحيح يسمح، رفض غير المكلف، رفض admin بلا تعيين، رفض dean/registrar خارج خطوته، رفض الطالب وغير المسجل |
| 8 | **E2E كامل لكل خدمة** بهويات اختبار معتمدة | تشغيلي | PASS موثق |
| 9 | **`student_visible=true` للخدمة الناجحة فقط** ثم smoke | تشغيلي | لا انتقال للخدمة التالية عند أي فشل |
| 10 | **شروط الإيقاف** (طبّق عند أي مرحلة) | — | انظر أدناه |

## جدول migrations المرحلة 4 (واحدة في كل جلسة؛ batch ممنوع بنيوياً)

| الترتيب | الملف | LF SHA-256 |
|---|---|---|
| 7B | `20260725110050_b1_07b_secure_attachments_sql_only_01.sql` | `a49d615b11949f3c8594b282d2241e9dbd2d7be42d37bb5ac4b1d1952ddd4eec` |
| 8 | `20260725110100_b1_08_trusted_reference_validators_05a.sql` | `e04d7b0b2d3fa8cd9748796a2a9e59131894fdd726339ced594ba36d836df0a2` |
| 9 | `20260725110200_b1_09_excused_absence_vocabulary_05a.sql` | `9ecf6c57167a748399edd0798e9b100e3a6ec9bbad4d09975df448f73fa41ae0` |
| 10 | `20260725110300_b1_10_excused_absence_detail_05a.sql` | `7b9dc57ffef4e69ae79dffbeb42dcc5778dd28b5f3984d0a6d2af894eba0c113` |
| 11 | `20260725110400_b1_11_file_withdrawal_details_05a.sql` | `d655077c41cd9bc81ac935cfceb152433da3cd13746bd981f6f936c2577492ba` |
| 12 | `20260725110500_b1_12_transfer_secure_attachment_05a.sql` | `224186f4b9b06b9b57e9460492e7bc74383e8bd18a949bf66b4946aff9d84cd9` |
| 13 | `20260725110600_b1_13_final_chance_canonical_write_03.sql` | `21406c4ffce2ef22c9ef4115ffc2c8df6e9a54e53a9df5467a01a56ddfc64c70` |
| 14 | `20260725110700_b1_14_detail_rpc_write_boundaries_05a.sql` | `e2b15df0ff031deb2534957cdd67cbc954965edadefa74f0c2ae6291bed8b57a` |
| 15 | `20260725110800_b1_15_service_details_dispatcher_05a.sql` | `a1d1e143e89ca457b0776f06d11e0e50f1e8c471e8799debad3ef5dd79d0b8c2` |
| 16 | `20260725110900_b1_16_free_service_workflows_08.sql` | `b6034a7f61b8de71c5cd0eb8648c6ff16df4a685dcc43c140f19dfe51ca380ae` |
| 17 | `20260725111000_b1_17_external_university_payment_workflows_02.sql` | `841daba372958e2e7d53d3bc3364dd93cfd67e1b95057c0d58c2a0207c4a8f01` |
| 18 | `20260725111100_b1_18_detail_acl_cutover_06.sql` | `3eb6501f03ccab78ed739253e1ce64f2d5b48ac2b812121397d924f045359e3c` |
| 19 | `20260725120000_b1_confirm_payment_predecessor_guard_01.sql` | `e4a9f7f3a9a9fe060fdf325a5aa39e8d3437170b71795ce431ca629166622335` |
| 21 | `20260725130000_b1_21_secure_read_contracts_01.sql` | `cd71670022c534d15639c530acd4135b72a15cb053debf554d90c6e2405385ca` |
| 22 | `20260725140000_b1_22_secure_draft_mutations_01.sql` | `da6754dc3b9e6830f666321447558227612e616ec592f312d092fff0f009d242` |
| 23 | `20260725150000_b1_23_transfer_department_scope_position_assignment_01.sql` | `4bc35f9b1e17c9dc6155b6b7c26d4ba6b8cf203297e66bcf9c8771e358130c85` |
| 24 | `20260725160000_b1_24_file_withdrawal_impact_ack_null_guard_01.sql` | `67257aa9201538b1a4691ec4602e1ae4dcbd7a2f2b511dcac1da8a714ae9d70b` |

ملاحظات الجدول: الترتيب 19/20 جسر نطاقي بملف واحد (`20260725120000`) — يُطبق **مرة واحدة فقط**، وتكراره ممنوع. الترتيب 7 الأصلي `20260725110000` **متجاوَز نهائياً ويمنع تطبيقه** (استبدل بـB0+7B).

## شروط الإيقاف (fail-closed)

- أي فشل preflight أو verifier؛ أي PARTIAL/AMBIGUOUS بين التاريخ والكائنات.
- أي تغيير في السجلات المحمية أو الطلبات القديمة (`absence_excuse`/`transfer` legacy — لا runtime steps).
- أي ظهور غير متوقع لخدمة (`student_visible`/`is_active`/workflow نشط).
- bucket عام أو صلاحية anon أو bypass عام.
- محاولة تطبيق `20260725110000` بعد 7B، أو batch، أو migration تالية في نفس الجلسة، أو دمج Gate25/Deploy مع migrations.
- **عند الإيقاف:** توقف كامل للتسلسل؛ معالجة أمامية فقط (rollback-by-forward) بعد مراجعة؛ ممنوع repair/reset/delete/كتابة تاريخ يدوية.

## حماية enrollment_certificate (إلزامية في كل مرحلة)

- preflight وpost-verifier لكل مرحلة يثبتان عدم تغيّر سلوكها (المسار غير-B1 محفوظ منذ M3-02 وإغلاق R-1/R-2/R-3 في PR #215).
- أي انحراف في `can_current_user_act_on_step` عن نطاق B1 = إيقاف فوري.

## حدود هذه الحزمة

لا تشمل: Deploy/Publish، تفعيل فعلي، أي SQL إنتاجي، أي كتابة بيانات. تلك كلها موافقات بشرية منفصلة لاحقة.

**رمز القرار:** `READY_FOR_UNIFIED_SEQUENCE_APPROVAL` — عند الاعتماد يُنفذ الترتيب أعلاه مرحلة-بمرحلة بموافقة منفصلة لكل مرحلة تنفيذية.
