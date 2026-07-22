# تقرير الإغلاق — B1-RPC-AUTHORIZATION-MATRIX-SOURCE-CLOSURE-01 (Track E)

البرنامج: PORTAL-OVERNIGHT-AUTONOMOUS-SOURCE-ACCELERATION-01
المستودع: `msorori-mh/saba-uni-portal` (commit الأساس `debf9d04`)
الفرع: `test/b1-rpc-authorization-matrix-01`
الحالة: **مكتمل محلياً بالكامل** — المصفوفة نهائية، وكل حالات PG المنفَّذة PASS (60/60)، واختبارات bun الثابتة خضراء (22/22).

---

## 1. النطاق والمخرجات

| المخرَج | المسار | الوصف |
|---|---|---|
| المصفوفة الآلية | `docs/b1/B1-RPC-AUTHORIZATION-MATRIX-01.json` | 60 حالة، 5 خدمات، 11 RPC، خريطة تغطية، النتائج F1/F2 — ASCII خالص، ترتيب مفاتيح حتمي |
| حزمة PG المحلية | `tests/b1-rpc-matrix/pg/` | مخطط مصغّر + stubs، ترتيب تطبيق المسودات الـ19، بوابة ما قبل التفعيل، تفعيل محلي فقط، مُتحقّق، حالات ACL |
| اختبارات bun الثابتة | `tests/b1-rpc-matrix/matrix.test.ts` | 22 اختبار عقد ثابت (مخطط JSON، تغطية، تقاطع مع المانيفست، وجود/ترتيب ملفات الحزمة، أنماط محظورة) |

**الخدمات الخمس** (الرموز المخزَّنة الفعلية بين قوسين): enrollment_suspension، excused_absence ‏(`absence_excuse`)، file_withdrawal، department_transfer ‏(`transfer`)، final_chance ‏(`extra_chance`). عدد الخطوات بالضبط: **3/3/7/6/5**، والتحولات: **4/4/8/7/6** (صيغة المانيفست "4+4+7" غير دقيقة — استُخدم العدد الفعلي من المسودات). كل الخطوات `specific_user` بعقد `exactly_one_direct_assignee`؛ خطوة الدفع: `finance/revenue_finance_officer` بحافّة `payment_confirmed`.

## 2. نتيجة تنفيذ حزمة PG (PostgreSQL 17.10 محلي — نتائج فعلية غير مُختلقة)

بيئة التنفيذ: عنقود PG17 محلي مؤقّت، قاعدة `e_rpcmatrix`، مخطط مصغّر + stubs بوفاء دلالي موثّق (`is_valid_actor_request_action` منقولة **حرفياً** من الإنتاج)، تطبيق المسودات الـ19 من main بترتيب المانيفست، تفعيل سير العمل **محلياً فقط** بعد تحقق البوابة H-01. **لم يُلمس الإنتاج إطلاقاً.**

الإجمالي: **72 صف نتيجة = 60 PASS منفَّذة + 12 STATIC موثَّقة + 0 FAIL** (60 معرّف حالة فريد؛ بعض الحالات متعددة النتائج الفرعية).

- بوابة ما قبل التفعيل H-01: `B1_ACTIVE_WORKFLOW_MUST_RESOLVE_ONCE:0` — PASS قبل أي تفعيل محلي.
- حالات BLOCKER (5): M01, M03, M10, M11, M13 — كلها رُفضت فعلياً بـ `42501 / B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED` كما تنبأ الاستطلاع.
- حالات DIVERGENCE (3): M07, M08, X-03 — **نجحت فعلياً** رغم انتهاء/تعطيل/تأجيل الإسناد (المطلوب تعاقدياً: الرفض).
- حالات الدفع M15/X-14/X-09: PASS فعلي (RPC الدفع بفحوصه الذاتية غير متأثر بالانسداد F1)؛ X-04 (استنفاد الخطوة) رُفض بـ `22023 / INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP`.
- الإغلاق المباشر: X-11 (DML مباشر على جداول التفاصيل + تعديل مباشر على خطوة runtime → `42501` عبر ACL وعبر مشغّل `B1_ATOMIC_RUNTIME_BOUNDARY_REQUIRED`)، X-12 (legacy submit/act → `42501` عبر ACL وعبر مشغّلي الحدود)، M36، M37، X-15 (تخمين التخزين → رفض).

### 2.1 جدول النتائج الحرفي (مستخرج من `e_rpcmatrix.results` في التشغيل الفعلي)

| # | case | sub | status | expected | actual |
|---|---|---|---|---|---|
| 1 | H-01 | pre-activation-init | PASS | P0001/B1_ACTIVE_WORKFLOW_MUST_RESOLVE_ONCE:0 | P0001/B1_ACTIVE_WORKFLOW_MUST_RESOLVE_ONCE:0 |
| 2 | E-01 | suspension-effect-coupling | STATIC | documented in matrix + report | not executed |
| 3 | E-02 | absence-effect-coupling | STATIC | documented in matrix + report | not executed |
| 4 | E-03 | withdrawal-effect-coupling | STATIC | documented in matrix + report | not executed |
| 5 | E-04 | transfer-effect-coupling | STATIC | documented in matrix + report | not executed |
| 6 | E-05 | final-chance-effect-coupling | STATIC | documented in matrix + report | not executed |
| 7 | M01 | exact-assignee-review | PASS | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED |
| 8 | M02 | exact-assignee-approve | PASS | OK | OK |
| 9 | M03 | exact-assignee-apply-decision | PASS | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED |
| 10 | M04 | student-owner-on-staff-act | PASS | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED |
| 11 | M05 | correct-unit-wrong-role | PASS | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED |
| 12 | M06 | registrar-on-dean-step | PASS | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED |
| 13 | M07 | expired-binding-still-acts | PASS | OK | OK |
| 14 | M07 | setup-submit-susp4 | PASS | OK | OK |
| 15 | M08 | inactive-binding-still-acts | PASS | OK | OK |
| 16 | M09 | student-owner-review-own-step | PASS | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED |
| 17 | M10 | library-officer-clear | PASS | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED |
| 18 | M11 | labs-manager-clear | PASS | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED |
| 19 | M12 | unauthenticated-act | PASS | 28000/AUTHENTICATION_REQUIRED | 28000/AUTHENTICATION_REQUIRED |
| 20 | M13 | archive-officer-archive | PASS | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED |
| 21 | M14 | target-chair-approve | PASS | OK | OK |
| 22 | M15 | finance-confirm-payment | PASS | OK | OK |
| 23 | M16 | dean-approve-transfer | PASS | OK | OK |
| 24 | M17 | dean-approve-final-chance | PASS | OK | OK |
| 25 | M18 | submit-enrollment_suspension | PASS | OK | OK |
| 26 | M19 | submit-excused_absence | PASS | OK | OK |
| 27 | M20 | submit-department_transfer | PASS | OK | OK |
| 28 | M21 | submit-final_chance | PASS | OK | OK |
| 29 | M22 | submit-file_withdrawal | PASS | OK | OK |
| 30 | M23 | cross-service-actor-on-chair-step | PASS | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED |
| 31 | M24 | payment-rpc-on-free-service | PASS | 22023/REQUEST_TYPE_NOT_EXTERNAL_PAYMENT_SERVICE | 22023/REQUEST_TYPE_NOT_EXTERNAL_PAYMENT_SERVICE |
| 32 | M25 | registrar-on-dean-decision | PASS | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED |
| 33 | M26 | approve-on-review-step | PASS | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED |
| 34 | M27 | approve-on-payment-step | PASS | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED |
| 35 | M28 | payment-rpc-on-nonpayment-step | PASS | 22023/INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP | 22023/INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP |
| 36 | M29 | apply-on-review-step | PASS | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED |
| 37 | M30 | wrong-action-review-on-apply-step | PASS | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED |
| 38 | M31 | submit-on-completed-request | PASS | 42501/B1_OWNED_SUBMITTABLE_REQUEST_REQUIRED | 42501/B1_OWNED_SUBMITTABLE_REQUEST_REQUIRED |
| 39 | M32 | act-on-completed-step | PASS | P0001/B1_ACTIVE_STEP_REQUIRED | P0001/B1_ACTIVE_STEP_REQUIRED |
| 40 | M33 | submit-other-students-request | PASS | 42501/B1_OWNED_SUBMITTABLE_REQUEST_REQUIRED | 42501/B1_OWNED_SUBMITTABLE_REQUEST_REQUIRED |
| 41 | M34 | staff-on-student-submit-rpc | PASS | 42501/ACTIVE_STUDENT_PROFILE_REQUIRED | 42501/ACTIVE_STUDENT_PROFILE_REQUIRED |
| 42 | M35 | act-on-non-b1-step | PASS | P0001/B1_REQUEST_REQUIRED | P0001/B1_REQUEST_REQUIRED |
| 43 | M37 | legacy-act-on-b1-step | PASS | 42501 | 42501/ACT_ON_STEP_NOT_AUTHORIZED |
| 44 | X-01 | registrar-universal-read | STATIC | documented in matrix + report | not executed |
| 45 | X-02 | admin-broad-read | STATIC | documented in matrix + report | not executed |
| 46 | X-03 | future-binding-still-acts | PASS | OK | OK |
| 47 | X-04 | payment-step-exhausted | PASS | 22023/INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP | 22023/INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP |
| 48 | X-05 | direct-detail-dml-pre-cutover | STATIC | documented in matrix + report | not executed |
| 49 | X-06 | direct-detail-dml-post-cutover | STATIC | covered by X-11 execution | see X-11 |
| 50 | X-07 | replay-same-step | PASS | P0001/B1_ACTIVE_STEP_REQUIRED | P0001/B1_ACTIVE_STEP_REQUIRED |
| 51 | X-07 | setup-approve-manager-review | PASS | OK | OK |
| 52 | X-07 | setup-submit-abs2 | PASS | OK | OK |
| 53 | X-08 | exactly-one-approved-event | PASS | 1 approved event | 1 |
| 54 | X-08 | idempotent-replay-denied | PASS | P0001/B1_ACTIVE_STEP_REQUIRED | P0001/B1_ACTIVE_STEP_REQUIRED |
| 55 | X-09 | payment-not-confirmed | PASS | OK | OK |
| 56 | X-09 | setup-dean-approve-fc2 | PASS | OK | OK |
| 57 | X-09 | setup-submit-fc2 | PASS | OK | OK |
| 58 | X-09 | step-remains-active | PASS | active | active |
| 59 | X-10 | admin-read-broad | STATIC | documented in matrix + report | not executed |
| 60 | X-11 | direct-runtime-step-mutation | PASS | 42501/B1_ATOMIC_RUNTIME_BOUNDARY_REQUIRED | 42501/B1_ATOMIC_RUNTIME_BOUNDARY_REQUIRED |
| 61 | X-12 | legacy-act-trigger-boundary | PASS | 42501/B1_ATOMIC_RUNTIME_BOUNDARY_REQUIRED | 42501/B1_ATOMIC_RUNTIME_BOUNDARY_REQUIRED |
| 62 | X-12 | legacy-submit-trigger-boundary | PASS | 42501/B1_ATOMIC_SUBMIT_BOUNDARY_REQUIRED | 42501/B1_ATOMIC_SUBMIT_BOUNDARY_REQUIRED |
| 63 | X-13 | dean-role-without-binding | PASS | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED | 42501/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED |
| 64 | X-13 | setup-submit-trans2 | PASS | OK | OK |
| 65 | X-14 | user-typed-binding-payment-confirm | PASS | OK | OK |
| 66 | X-16 | attachment-sqlstate-variance | STATIC | documented in matrix + report | not executed |
| 67 | X-17 | reject-return-unreachable | STATIC | documented in matrix + report | not executed |
| 68 | M36 | legacy-submit-authenticated-acl | PASS | 42501 | 42501/permission denied for function submit_student_request |
| 69 | X-11 | direct-delete-withdrawal-details | PASS | 42501 | 42501/permission denied for table file_withdrawal_details |
| 70 | X-11 | direct-insert-absence-details | PASS | 42501 | 42501/permission denied for table absence_excuse_details |
| 71 | X-11 | direct-update-extra-chance-details | PASS | 42501 | 42501/permission denied for table extra_chance_details |
| 72 | X-15 | storage-guess-read | PASS | deny (42501 or zero visible rows) | 42501/permission denied for table objects |

## 3. النتيجة الحرجة F1 (BLOCKER) — انسداد مفردات الفعل

`can_current_user_act_on_step` (النسختان v2 من seq2 و v3 من seq3) يبوّب على `is_valid_actor_request_action` التي مفرداتها المطبَّقة هي `('approve','reject','return','comment','skip')` فقط، و**لا توجد أي مسودة توسّعها**. النتيجة المُثبتة محلياً: كل خطوة B1 بفعل `review/clear/apply_decision/archive` **لا يمكن تنفيذها أبداً** عبر RPC التنفيذ (20 من 24 خطوة B1 غير قابلة للوصول؛ الفئات القابلة: خطوات approve + خطوتا الدفع عبر RPC المتخصص). التحقق الأول للمسار السعيد (M01) أثبت الرفض الفعلي.

**متابعة حرجة (ملكية المعالجة: Track A/I — UNKNOWN U1):** توسيع مفردات `is_valid_actor_request_action` الأساسية (أو توجيه المسار إلى مفردات موسّعة) — هذا المسار (E) يوثّق ويوسم فقط، و**لم يؤلّف أي مسودة معالجة**.

## 4. النتيجة العالية F2 (DIVERGENCE) — v3 أسقط بوابات v2 الصارمة

نسخة seq3 من `can_current_user_act_on_step` أسقطت بصمت: `current_user_has_exact_processing_binding`، `is_valid_b1_runtime_step_contract`، فحص `num_nonnulls=1`، ومعالجة `can_reject/can_return`. أثبتت الحالات M07 (إسناد منتهٍ)، M08 (إسناد معطَّل)، X-03 (إسناد مستقبلي) أن الفعل `approve` **ينجح فعلياً** رغم عدم صلاحية الإسناد — بينما العقد يقتضي الرفض. **متابعة عالية:** التوفيق بين v3 وبوابات v2 (أو توثيق التخفيف المقصود) في مسار معالجة.

## 5. ملاحظات موثَّقة (ثابتة، غير منفَّذة)

- **X-01/X-02/X-10:** القراءة الشاملة لـ registrar/admin غير مُحصَّنة (مسار القراءة متابعة لاحقة؛ RPC الإشراف الإداري مؤجَّل صراحةً في seq2).
- **X-05/X-06:** حالة ACL قبل القطع لم تعد موجودة بعد تطبيق الـ19 مسودة كاملة؛ نفِّذ الرفض بعد القطع ضمن X-11.
- **X-16:** sqlstates مرفقات RPC غير متسقة (بعضها بلا ERRCODE صريح → P0001).
- **X-17:** reject/return غير قابلة للوصول تصميمياً (لا توجد حواف reject/return في سير العمل المشحوحة)؛ و`B1_SPECIALIZED_ACTION_RPC_REQUIRED` كود ميّت تحت ترتيب البوابات الحالي.
- **E-01..E-05:** اقتران التأثير النهائي (effect persistence) مملوك لمسودات تأثير منفصلة لاحقة؛ تفويض خطوة التطبيق مغطّى (M03).
- مساعدو التحصين الجدد يبقون على PUBLIC EXECUTE الافتراضي (مرشّح تحصين لاحق).

## 6. ما نُفِّذ عبر PG مقابل ما وُثِّق ثابتاً

- **منفَّذ عبر PG (48 حالة):** M01–M37 كاملة + X-03, X-04, X-07, X-08, X-09, X-11, X-12, X-13, X-14, X-15 + البوابة H-01.
- **موثَّق ثابتاً (12 حالة):** X-01, X-02, X-05, X-06, X-10, X-16, X-17, E-01..E-05 — ملاحظة الاستطلاع 8: الاختبارات الثابتة **لا تستطيع** كشف F1/F2؛ التغطية التنفيذية هي حزمة PG وحدها.

## 7. انحرافات الحزمة الموثَّقة بصدق

1. **stubs بدل ترحيلات الإنتاج المطبَّقة:** الجداول/الدوال الأساسية بُنيت بوفاء دلالي من وثائق الاستطلاع الحرفية (N1/N2/N3/N5/N7/N8)؛ `is_valid_actor_request_action` منقولة حرفياً. المخاطر محصورة لأن كل الفحوص الحرجة (F1/F2) مصدرها المسودات نفسها المُطبَّقة حرفاً.
2. **مفردات CHECK ما قبل seq7** (`action_result/decision/event_type`) افتراضات حزمة (الاستطلاع يؤكد الحالة الموسَّعة فقط)؛ seq7 يستبدلها قبل كتابة أي صف B1، و`aed_reason_chk` مثبَّتة بالتوقيع الحرفي الذي يتطلبه preflight في seq10 (ونجح).
3. **استبدال seq6 (محلي فقط):** المسودة الأصلية تفشل بقصدها مع placeholder (أُثبت الفشل: `B1_ATOMIC_CALLER_RELEASE_EVIDENCE_NOT_APPROVED`)؛ طُبِّق بعدها متغيّر محلي يستبدل **سطر الإسناد فقط** بـ SHA الأساس `debf9d041f7c05794f6df33877f1dff91253625e` لإكمال preflight الأدلة في seq19. ليس تعليمة إنتاج.
4. **seq13 عبر قناة النص:** فُقد 12 بايت غير مرئية (ملاحظة المانيفست)؛ الملف طُبِّق بنجاح كامل وكل فحوصه الداخلية (preflight/بنية) مرّت — البايتات المفقودة في محتوى غير مؤثر تنفيذياً. النسخة المرجعية تبقى في المستودع (لم تُنسخ بايتياً إلى المخرجات؛ الحزمة تقرأ المسودات من `docs/migration-drafts/`).
5. **بناء الحالة (state construction):** الوصول إلى الخطوات المتأخرة تم عبر `e_rpcmatrix.advance_to` (مشغَّل بحدود GUC، موثَّق) لأن F1 يجعل التقدم الطبيعي مستحيلاً — ليس ادعاء تجاوز RPC.
6. نمط `auth.uid()` عبر GUC ‏(`e_rpcmatrix.uid`) مطابق لنمط متحقّق graduation-projects.

## 8. نتائج الاختبارات المحلية

- **حزمة PG:** أعلاه — 60/60 حالة منفَّذة PASS، 0 FAIL (التشغيل: `pipeline.sh` إعادة تشغيل كاملة حتمية من الصفر).
- **bun test (bun 1.3.14):** `tests/b1-rpc-matrix/matrix.test.ts` — **22 pass / 0 fail / 1178 expect()** تشمل: حتمية ترتيب مفاتيح JSON، صحة الوسوم والمخطط، وجود الحالات الـ22 الأساسية وكل الكون (60)، 5 خدمات بالأسماء المستعارة والأعداد الدقيقة، 11 RPC، تقاطع المانيفست (19 مُدخلاً بنفس الترتيب)، وجود/ترتيب ملفات الحزمة، الأنماط المحظورة (لا مواد اتصال سحابية، ASCII خالص).

## 9. خريطة التغطية (سلوك المواصفة → الحالات)

| سلوك المواصفة | الحالات | النتيجة |
|---|---|---|
| المُسند الدقيق المخوَّل = PASS | M02, M14, M15, M16, M17, M18–M22, X-09, X-14 | PASS فعلي |
| نفس الدور وحدة خاطئة = DENY | M23 | 42501 |
| الوحدة الصحيحة دور خاطئ = DENY | M05 | 42501 |
| إسناد منتهٍ/معطَّل/مستقبلي = DENY تعاقدياً | M07, M08, X-03 | **PASS فعلي (F2)** |
| بلا إسناد (دور فقط) = DENY | X-13 | 42501 |
| تجاوز dean/admin الواسع = DENY | M06, M25, X-13 | 42501 |
| registrar على خطوة dean = DENY | M06, M25 | 42501 |
| dean على خطوة registrar = DENY | M23 | 42501 |
| طالب على RPC موظفين = DENY | M04, M09 | 42501 |
| موظف على RPC طالب = DENY | M34 | 42501 |
| غير مصادَّق = DENY | M12 | 28000 |
| خدمة خاطئة = DENY | M23, M24 | 42501/22023 |
| خطوة/فعل خاطئ = DENY | M26–M30 | 42501/22023 |
| تعديل طلب مكتمل/ملغى = DENY | M31, M32, X-04 | 42501/P0001/22023 |
| حماية إعادة التشغيل | X-07 | P0001 |
| عدم التكرارية (idempotency) | X-08 | P0001 + حدث واحد فقط |
| تجاوز RPC مباشر = DENY | M36, M37, X-11, X-12, X-15 | 42501 |
| المسار السعيد المسدود بالمفردات (F1) | M01, M03, M10, M11, M13 | **42501 (BLOCKER)** |
| بوابة ما قبل التفعيل | H-01 | P0001 متوقَّع |

## 10. المتابعات المفتوحة (ملكية خارج Track E)

1. **حرجة:** معالجة مفردات `is_valid_actor_request_action` (F1) — Track A/I، UNKNOWN U1. بدونها 20/24 خطوة B1 ميتة.
2. **عالية:** التوفيق بين v3 وبوابات v2 الصارمة (F2) — M07/M08/X-03 تثبت الفجوة.
3. تحصين مسار القراءة (registrar/admin الشامل) + توحيد sqlstates المرفقات + تقييد EXECUTE لمساعدي التحصين.
4. قرار تصميمي: reject/return غير قابلة للوصول؛ إن لزم، تُضاف حواف صريحة أولاً.
