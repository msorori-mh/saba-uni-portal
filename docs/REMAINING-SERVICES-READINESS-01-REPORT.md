# REMAINING-STUDENT-SERVICES-READINESS-01 — ANALYSIS/DOC REPORT

**التاريخ:** 2026-07-21 · **المرجع:** `origin/main@8f229d09` (`8f229d09d581d8128dc684f47ad989200312d210`)

> **تحديث خط الأساس (2026-07-21):** `8f229d09` لم يعد tip الحالي. Fresh RC = `0e2d25c9a2d7923ce74cfae079b99691d61eb1b6` — `docs/PORTAL-FRESH-RELEASE-CANDIDATE-01.md`. هذا التقرير يبقى دراسة عند SHA التأليف.
**النطاق:** الخدمات الست المؤجلة بقرار إداري (D-11/D-12 في `docs/PORTAL-SWARM-DECISIONS-NEEDED.md`):
`grade_statement_non_graduate`, `october_exam_entry_form`, `replacement_student_card`, `academic_record`, `grade_statement`, `graduation_certificate`.

**قواعد العمل الملزمة في هذه المهمة:** تحليل وتوثيق فقط. لا Migration، لا SQL مُطبَّق، لا تعديل بيانات، لا تعديل `src/`، لا دمج PRs. المخرج الوحيد: هذا التقرير + قوالب قرارات إدارية جاهزة للتوقيع.

---

## 1. الملخص التنفيذي

| البند | القيمة |
|---|---|
| القرار | **PASS_REMAINING_SIX_READINESS_MAPPED_DECISION_TEMPLATES_READY** |
| الخدمات الجاهزة للبدء المصدري بعد قرار إداري بسيط | **3** → `replacement_student_card`, `october_exam_entry_form`, `grade_statement_non_graduate` |
| الخدمات التي تحتاج تصميماً عميقاً قبل البدء | **3** → `academic_record`, `grade_statement`, `graduation_certificate` |
| خدمات يُوصى باستبعادها رسمياً (توصية فنية) | **0** — الاستبعاد قرار إداري محض (D-11) وقالب متاح لكل خدمة |
| عقود تنفيذ موثقة مسبقاً | 6/6 (`docs/request-services/*.md` — Batch A) |
| صفوف `request_types` موجودة في الإنتاج | 6/6 (كلها `is_active=true`, `student_visible=false`, `ineligible_display_mode='hidden'` — تدقيق Go-Live) |
| Workflow فعلي (مراحل/انتقالات/تعيينات) لأي من الست | **0** (تدقيق Go-Live: 0 مراحل / 0 انتقالات / 0 تعيينات) |
| Validate RPC مخصص لأي من الست | **0** (فقط `validate_official_transcript_request` القابلة لإعادة الاستخدام موجودة) |
| قالب PDF رسمي لأي من الأربع الوثائقية | **0** (قرار §8 صف 5 — «لا تُختلق قوالب») |
| جداول تفاصيل مخصصة | `official_transcript_request_details` قابلة لإعادة الاستخدام لأربع خدمات؛ مفقودة كلياً لخدمتين (`october_exam_entry_form`, `replacement_student_card`) |

**قراءة تنفيذية:** الأساس المشترك (runtime workflows، محرر إداري، وحدات/أدوار معالجة، بنية رسوم، عقد وثائق آمن) موجود ومُتحقق منه. الفجوات لكل خدمة محصورة ومعروفة، والعوائق الحقيقية الوحيدة خارجة عن الكود: **جدول الرسوم المعتمد** (§8 صف 1)، **قوالب PDF الرسمية** (§8 صف 5)، **مصدر حالة التخرج** (§8 صف 3)، **حد أقصى لمقررات أكتوبر** (§8 صف 4)، و**وحدة/أدوار شؤون الخريجين** غير الموجودة في جرد الإنتاج. لا يوجد مانع فني يمنع بدء السقالات المصدرية (workflow drafts) لأي خدمة فور اعتماد قرارها الإداري.

---

## 2. النمط المرجعي — ماذا يعني «مكتملة على نمط B1»

استُخرجت قائمة الاكتمال من: `docs/ALL-STUDENT-REQUESTS-BATCH-B1-SHARED-FOUNDATION-CONSOLIDATED-DESIGN-01-REPORT.md`، تقارير B1-01/02/03، `docs/ALL-STUDENT-REQUESTS-BATCH-B1-SHARED-FOUNDATION-SOURCE-01-REPORT.md`، وبوابات G2/G3 في `docs/PORTAL-SWARM-PRODUCTION-GATES.md`. خدمة «مكتملة على نمط B1» = كل ما يلي:

| # | العنصر | المرجع للنمط |
|---|---|---|
| 1 | عقد تنفيذ موثق (حقول↔أعمدة، أهلية، مرفقات، رسوم، خطوات، انتقالات، شرط إكمال، إشعار، تدقيق/أرشفة) | `docs/request-services/<code>.md` |
| 2 | تعريف قانوني في `src/lib/student-requests/request-type-registry.ts` (audience/flags) | 9 تعريفات موجودة اليوم |
| 3 | تعريف نموذج في `request-form-registry.ts` بلا placeholders + `detailBinding` (جدول/أعمدة/validate RPC) | نمط B1 بعد رفع `unavailableUntilSchemaApplied` |
| 4 | جدول تفاصيل + RLS + trigger ثبات ما بعد الإرسال (`draft/returned` فقط) | drafts: `REQUEST-B1-*-DETAIL-05A` |
| 5 | `validate_<code>_request(p_request_id)` تُستدعى قبل `draft → submitted` | §4.3 في تقرير Batch A |
| 6 | Workflow draft (مراحل + انتقالات) عبر المحرر الإداري + تعيينات `request_processing_assignments` لكل خطوة | G2 صفوف 16–17 |
| 7 | سياسة رسوم محسومة (مبلغ + `fee_types.code` أو مجانية صريحة) — السداد الخارجي يتبع قالب EXTERNAL_UNIVERSITY_PAYMENT للمدفوعات الخارجية | قرارات محسومة سابقاً + §7 |
| 8 | للوثائق: `official_documents.document_type` مميز + إصدار idempotent (`ON CONFLICT DO NOTHING`) + `verification_code` + قالب PDF معتمد + saga تخزين على نمط `enrollment-certificate-pdf-storage-saga` | §6 في تقرير Batch A |
| 9 | اختبارات: مصفوفة تفويض (+/−) لكل خطوة + ثبات نموذج/تفاصيل + E2E موثق | §4.6/§4.7 في Batch A + G3 |
| 10 | حزمة runbook مرتبة (18 ملفاً + خطوة تفعيل 19 لكل خدمة: Migration → verifier → RLS → RPC matrix → activation → E2E → `student_visible=true` → smoke) — كل صف تفويض مستقل | G2/G3 |
| 11 | لا تجاوز دور عام (admin/registrar/dean bypass) — كل خطوة مقيدة بالتعيين | §5 في Batch A + `can_current_user_act_on_step` |

**ملاحظة حاكمة:** الخدمات الست لا تُفعَّل للطالب إلا بعد اجتياز البوابات أعلاه؛ البقاء `student_visible=false` هو الوضع الصحيح حالياً ولا ضرر إنتاجي منه (تدقيق Go-Live §5).

---

## 3. الأساس المشترك المتوفر فعلاً (متحقق من المصدر)

| الأصل | الحالة | الدليل |
|---|---|---|
| صفوف `request_types` للستة | ✅ موجودة (12 صفاً إجمالاً)، كلها مخفية عن الطالب | تدقيق Go-Live §1 |
| Runtime workflows (إنشاء/انتقال/تفويض) | ✅ `initialize_student_request_workflow`, `apply_student_request_workflow_transition`, `act_on_student_request_step`, `can_current_user_act_on_step`, `user_matches_workflow_runtime_step`, `get_my_request_actor_inbox`, `is_current_user_dean_for_student` | Batch A §2.7 + audit §1 |
| مخطط وحدات/أدوار/تعيينات المعالجة (admin-configurable) | ✅ جداول `request_processing_units/roles/assignments` (بلا seeds — تُدار إدارياً) | `supabase/migrations/20260710160000_*` |
| الوحدات/الأدوار المؤكدة في الإنتاج | `student_affairs`, `finance`, `registrar`, `dean`, `archive` + 6 أدوار (`student_affairs_manager/specialist`, `revenue_finance_officer`, `registrar_general`, `dean`, `archive_officer`) | Batch A §2.6 |
| بنية الرسوم والسداد | ✅ `fee_types` (بذور: `exam(30)`, `graduation(100)`, `registration(50)`, `services(20)`, `tuition(500)`) + `assess_student_request_fee`/`confirm_student_request_fee_payment` — **لا عمود عملة** (سياسة: لا توسيع قبل جدول معتمد) | Batch A §2.5/§7 |
| نوافذ الخدمة الزمنية | ✅ `student_request_service_windows` (P1 foundations) | `20260711020000_*` |
| المرفقات الآمنة | ✅ حزمة `STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01` (ضمن تسلسل G2) | `docs/migration-drafts/` |
| عقد الوثائق الآمن (إصدار idempotent، لا حذف عند الإلغاء، signed URL لـ issued/archived فقط) | ✅ موثق ومطبق لشهادة القيد | Batch A §6 + audit §1 |
| مولد/مخزن وثائق عام | ❌ الوحيد الموجود خاص بـ `enrollment_certificate` | audit §4 Batch E |
| بيانات السجل/التقديرات للعرض | ✅ `student_unofficial_transcript` + `student_transcript_summary` (عرض غير رسمي للطالب/الإدارة) | `src/lib/transcript.functions.ts` |
| بوابة قرار التخرج الرسمي (مصدرية) | ✅ `evaluateGraduateRecordReadiness` — غير مربوطة بطلبات الخدمات | `src/lib/graduates-affairs/foundation.ts` |
| مسار legacy كامل لـ `official_transcript` (سجل أكاديمي رسمي) | ✅ جدول تفاصيل + تحقق + readiness guard (درجات معتمدة) + إصدار وثيقة عند الاعتماد + نوع مُعاد تفعيله | `20260627120000_*`, `20260628120000_*`, `20260629120000_*` |

---

## 4. الخدمة 1 — `grade_statement_non_graduate` (شهادة تقديرات لغير الخريجين)

### 4.1 حالة المصدر الحالية

| الطبقة | الموجود فعلاً |
|---|---|
| `request_types` | ✅ صف موجود، مخفي (`student_visible=false`) — تدقيق Go-Live صف 4 |
| تعريف قانوني | ✅ في `request-type-registry.ts` (`audience=active_student`, `requiresFee=true`, `producesDocument=true`, `requiresArchive=true`) |
| نموذج | ✅ تعريف في `request-form-registry.ts` — **placeholder** (`unavailableUntilSchemaApplied=true`) بلا ربط فعلي |
| معاينة workflow | ✅ معاينة ثابتة قديمة في `request-workflow-preview-registry.ts` (8 خطوات تتضمن جهتين مركزيتين: `university_registrar_general` + `university_vp_student_affairs`) — **تتعارض مع عقد Batch A** (6 خطوات داخل الكلية بلا جهات مركزية) |
| جدول تفاصيل | ✅ إعادة استخدام `official_transcript_request_details` (`purpose, notes, official_document_id, document_issued_at`) — العقد يقضي بعدم إنشاء جدول جديد |
| Validate RPC | ⚠️ `validate_official_transcript_request` موجودة وقابلة لإعادة الاستخدام؛ لا RPC مخصصة |
| Adapter/DB workflow | ❌ ليست ضمن `B1_WORKFLOWS`؛ 0 مراحل/انتقالات/تعيينات في الإنتاج |
| رسوم | ❌ `fee_configuration_pending` (§7/§8 صف 1) |
| وثيقة | ❌ `document_type='grade_statement_non_grad'` غير مزروع؛ لا قالب PDF (§8 صف 5) |
| اختبارات | ❌ لا اختبارات خاصة |
| عقد | ✅ `docs/request-services/grade_statement_non_graduate.md` |

### 4.2 الفجوات للاكتمال على نمط B1

1. حسم مسار الـworkflow المرجعي: عقد Batch A (6 خطوات داخل الكلية) **أم** المعاينة القديمة (جهات مركزية) — قرار D-12-S1.1 أدناه.
2. `detailBinding` + إزالة placeholders من النموذج (حلّال `semesters` حتى الفصل الحالي).
3. validate RPC مخصصة (`validate_grade_statement_non_graduate_request`) أو قرار موثق بإعادة استخدام `validate_official_transcript_request` مع قواعد «نشط + غير متخرج + ≥1 درجة».
4. Workflow draft + انتقالات + تعيينات (student_affairs → finance ×2 → registrar sign → issuance → archive).
5. قرار الرسوم (مبلغ + `fee_types.code`) + seed تقييم.
6. قالب PDF معتمد + توسعة saga الإصدار لـ `document_type='grade_statement_non_grad'`.
7. اختبارات (تفويض + ثبات نموذج/تفاصيل + E2E) + runbook تفعيل على نمط G2/G3.

### 4.3 قالب قرار إداري — D-12-S1

| البند | القيمة المقترحة (متحفظة — قابلة للتعديل) | قرار المستخدم |
|---|---|---|
| **S1.1 المسار المرجعي** | عقد Batch A: 6 خطوات داخل الكلية، **بلا جهات مركزية** (مسجل الجامعة/نائب الرئيس) — يطابق نمط شهادة القيد المصحح | ☐ اعتماد ☐ المسار القديم بالجهات المركزية ☐ تعديل: ______ |
| الأهلية | `status='active'` وغير متخرج + وجود ≥1 صف درجات معتمد في `student_grades` | ☐ اعتماد ☐ تعديل: ______ |
| المرفقات | لا مرفقات (`requires_attachment=false`) | ☐ اعتماد ☐ تعديل: ______ |
| الرسوم | مدفوعة — المبلغ: **TBD من المالية**؛ اقتراح متحفظ: إعادة استخدام `services(20)` أو صف `fee_types` جديد `grade_statement` | ☐ مجانية ☐ مبلغ: ______ بالعملة المحلية (لا عمود عملة حالياً — §7) |
| خطوات workflow | 1) مراجعة أولية (student_affairs/student_affairs_specialist) 2) تقييم رسوم (finance/revenue_finance_officer) 3) تأكيد دفع (finance) — تُتخطى 2/3 إن مجانية 4) توقيع مسجل الكلية (registrar/registrar_general) 5) إصدار الوثيقة (student_affairs) 6) أرشفة (archive/archive_officer) | ☐ اعتماد ☐ تعديل: ______ |
| الأدوار/المكلفون | تعيين مكلف نشط لكل خطوة (أسماء): ______ | ☐ تُرسل الأسماء |
| الوثيقة الناتجة | PDF «شهادة تقديرات لغير الخريجين» — `document_type='grade_statement_non_grad'` + `verification_code`؛ **القالب الرسمي يُورَّد من مكتب العميد** (§8 صف 5) | ☐ سيوفر القالب ☐ تأجيل الإصدار مع شحن المسار حتى التوقيع |
| نطاق التقديرات | حتى فصل يختاره الطالب (`include_up_to_semester_id`) ولا يتجاوز الحالي | ☐ اعتماد ☐ تعديل: ______ |

### 4.4 التصنيف

**قابلة للبدء المصدري فوراً بعد قرار إداري بسيط** (S1.1 + الرسوم). السقالات (نموذج/ربط/validate/workflow draft) لا تنتظر القالب؛ التفعيل الطلابي يبقى مقيداً بالقالب + الرسوم (§8 صفوف 1/5).

---

## 5. الخدمة 2 — `october_exam_entry_form` (استمارة دخول دور أكتوبر)

### 5.1 حالة المصدر الحالية

| الطبقة | الموجود فعلاً |
|---|---|
| `request_types` | ✅ صف موجود، مخفي — تدقيق Go-Live صف 6 |
| تعريف قانوني | ✅ في `request-type-registry.ts` (`requiresServiceWindow=true`, `requiresFee=true`, `producesDocument=true`, `requiresArchive=true`) |
| نموذج | ✅ تعريف placeholder في `request-form-registry.ts` (يشير لتعريف U-OCT-1) |
| معاينة workflow | ✅ معاينة ثابتة قديمة (6 خطوات: طالب ← شؤون الطلاب ← مالية ← شؤون الطلاب مراجعة ← مسجل ← أرشيف) |
| جدول تفاصيل | ❌ **لا يوجد** — العقد ينشئ `october_exam_entry_details (request_id, academic_year_id, semester_id, selected_course_sections uuid[], limit_ack boolean, approved_list_generated_at)` |
| Validate RPC | ❌ `validate_october_exam_entry_request` غير موجودة |
| مصدر المقررات | ✅ قاعدة بياناتية متاحة: `student_grades` حيث `current_grade_status IN ('failed','incomplete')` |
| نافذة زمنية | ✅ البنية موجودة (`requiresServiceWindow`) — يلزم تعريف نافذة دورة أكتوبر إدارياً |
| رسوم | ❌ قرار معلق: إعادة استخدام `exam(30)` × عدد المقررات (§7 + §8 صف 4) |
| مخرج | كشف معتمد داخلي (Kashaf) — **لا PDF طلابي** ⇒ غير محجوبة بقرار القوالب (§8 صف 5) |
| عقد | ✅ `docs/request-services/october_exam_entry_form.md` |

### 5.2 الفجوات للاكتمال على نمط B1

1. جدول تفاصيل جديد (Migration draft صغير — ممنوع في هذه المهمة) + RLS + trigger ثبات.
2. `validate_october_exam_entry_request` (حالة نشطة + مقاطع مسجلة فعلاً وراسبة/غير مكتملة + سقف العدد).
3. حسم `max_courses` وتخزينه في `request_types.form_schema.rules.max_courses` (§8 صف 4).
4. قرار الرسوم (مجانية / `exam(30)`×العدد / مبلغ آخر).
5. Workflow draft من 4 خطوات + تعيينات + نافذة زمنية معرفة إدارياً.
6. آلية إنتاج الكشف المعتمد (`approved_list_generated_at`) + تقارير نهاية الفترة لرؤساء الأقسام (من المعاينة).
7. اختبارات + runbook تفعيل.

### 5.3 قالب قرار إداري — D-12-S2

| البند | القيمة المقترحة (متحفظة — قابلة للتعديل) | قرار المستخدم |
|---|---|---|
| الأهلية | `status='active'` + مقاطع مسجل فيها فعلاً وحالتها `failed/incomplete` للفصل المستهدف | ☐ اعتماد ☐ تعديل: ______ |
| **S2.1 الحد الأقصى للمقررات** | **3** مقررات لكل استمارة (متحفظ؛ يُخزن في `form_schema.rules.max_courses` قابلاً للتعديل إدارياً) | ☐ 3 ☐ 4 ☐ آخر: ______ |
| إقرار الطالب | Checkbox إلزامي بالحد الإداري (`limit_ack`) | ☐ اعتماد ☐ إلغاء |
| المرفقات | لا مرفقات | ☐ اعتماد ☐ تعديل: ______ |
| **S2.2 الرسوم** | إعادة استخدام `exam(30)` × عدد المقررات المختارة (تقييم آلي) | ☐ اعتماد ☐ مجانية ☐ مبلغ ثابت: ______ |
| خطوات workflow | 1) مراجعة شؤون الطلاب (student_affairs/student_affairs_specialist) 2) تقييم رسوم (finance) 3) تأكيد دفع (finance) — تُتخطى إن صفر 4) اعتماد الكشف النهائي (registrar/registrar_general — `apply_decision`) | ☐ اعتماد ☐ تعديل: ______ |
| الأدوار/المكلفون | مكلف نشط لكل خطوة: ______ | ☐ تُرسل الأسماء |
| الوثيقة الناتجة | **لا وثيقة طلابية** — كشف معتمد داخلي + إشعار «تم اعتماد استمارة دور أكتوبر — عدد المقررات …» | ☐ اعتماد ☐ طلب PDF إضافي |
| **S2.3 النافذة الزمنية** | نافذة تُعرَّف إدارياً قبل كل دورة أكتوبر (`student_request_service_windows`) | ☐ اعتماد ☐ تواريخ ثابتة: ______ |

### 5.4 التصنيف

**قابلة للبدء المصدري فوراً بعد قرار إداري بسيط** (S2.1 + S2.2 + S2.3). لا مانع قوالب؛ أكبر عمل مصدري = جدول تفاصيل صغير + validate RPC + سقف العدد.

---

## 6. الخدمة 3 — `replacement_student_card` (بدل فاقد بطاقة طالب)

### 6.1 حالة المصدر الحالية

| الطبقة | الموجود فعلاً |
|---|---|
| `request_types` | ✅ صف موجود، مخفي — تدقيق Go-Live صف 8 («لا نموذج») |
| تعريف قانوني | ❌ **غائبة** من `request-type-registry.ts` (ليست ضمن الـ9 القانونية) |
| نموذج | ❌ غائب من `request-form-registry.ts` |
| معاينة workflow | ❌ غائبة من `request-workflow-preview-registry.ts` |
| جدول تفاصيل | ❌ العقد ينشئ `replacement_card_details (request_id, loss_reason, loss_declaration_ack, previous_card_number, issued_card_number, card_issued_at)` |
| Validate RPC | ❌ `validate_replacement_student_card_request` غير موجودة |
| رسوم | ❌ `fee_configuration_pending` (§8 صف 1) |
| مخرج | بطاقة فعلية (artifact) — رقم بطاقة جديد + إشعار استلام؛ **لا PDF** |
| عقد | ✅ `docs/request-services/replacement_student_card.md` |

### 6.2 الفجوات للاكتمال على نمط B1

1. إضافة التعريف القانوني (registry) + النموذج + المعاينة (مصدر `src/` — لاحقاً، ليس في هذه المهمة).
2. جدول تفاصيل جديد + RLS + trigger ثبات.
3. `validate_replacement_student_card_request` (نشط + لا طلب بدل خلال 30 يوماً).
4. قرار الرسوم + سياسة المرفق (محضر ضياع اختياري).
5. Workflow من 4 خطوات + تعيينات.
6. اختبارات + runbook تفعيل.

### 6.3 قالب قرار إداري — D-12-S3

| البند | القيمة المقترحة (متحفظة — قابلة للتعديل) | قرار المستخدم |
|---|---|---|
| الأهلية | `status='active'` + لا طلب بدل فاقد معلق/مصدَّر خلال **30 يوماً** | ☐ اعتماد ☐ مدة أخرى: ______ |
| المرفقات | محضر ضياع/إبلاغ شرطة **اختياري** (لا يوقف الطلب) | ☐ اختياري ☐ إلزامي ☐ بلا مرفقات |
| إقرار الطالب | Checkbox «أقر بفقدان البطاقة» إلزامي (`loss_declaration_ack`) | ☐ اعتماد ☐ إلغاء |
| **S3.1 الرسوم** | مدفوعة — اقتراح متحفظ: إعادة استخدام `services(20)` أو مبلغ يحدده المالية | ☐ `services(20)` ☐ مجانية ☐ مبلغ: ______ |
| خطوات workflow | 1) مراجعة شؤون الطلاب (student_affairs/student_affairs_specialist) 2) تقييم رسوم (finance) 3) تأكيد دفع (finance) — تُتخطى إن صفر 4) إصدار البطاقة (student_affairs — `issue_artifact`) | ☐ اعتماد ☐ تعديل: ______ |
| الأدوار/المكلفون | مكلف نشط لكل خطوة: ______ | ☐ تُرسل الأسماء |
| الوثيقة الناتجة | بطاقة فعلية — تخزين `issued_card_number` + إشعار «بطاقتك الجديدة جاهزة… الاستلام من شؤون الطلاب» | ☐ اعتماد ☐ تعديل: ______ |

### 6.4 التصنيف

**قابلة للبدء المصدري فوراً بعد قرار إداري بسيط** (S3.1 فقط تقريباً). أصغر نطاق بين الست؛ مرشحة أولى للتنفيذ (توافق توصية Batch A §9 باعتبارها أولى خدمات المجموعة).

---

## 7. الخدمة 4 — `academic_record` (السجل الأكاديمي)

### 7.1 حالة المصدر الحالية

| الطبقة | الموجود فعلاً |
|---|---|
| `request_types` | ✅ صف موجود، مخفي — تدقيق Go-Live صف 10 («يحتاج PDF») |
| تعريف قانوني/نموذج/معاينة/Adapter | ❌ كلها غائبة عن `src/` |
| جدول تفاصيل | ✅ إعادة استخدام `official_transcript_request_details` |
| Validate RPC | ❌ العقد ينشئ `validate_academic_record_request` أو يعيد استخدام `validate_official_transcript_request` |
| بيانات السجل | ✅ `student_unofficial_transcript`/`student_transcript_summary` + دوال عرض `src/lib/transcript.functions.ts` |
| مسار legacy متراكب | ⚠️ `official_transcript` («سجل أكاديمي رسمي») له مسار DB كامل قديم (تفاصيل + تحقق + readiness guard بدرجات معتمدة + إصدار عند الاعتماد) وأُعيد تفعيل نوعه 2026-06-29، وهو **خارج النطاق القانوني** (`OUT_OF_SCOPE_LABELS`) — يلزم قرار علاقة (دمج/إحلال/تعايش) قبل التصميم |
| توجيه مزدوج | ⚠️ العقد يوجّه الاستلام/الإصدار إلى `student_affairs` للطالب النشط وإلى **`graduate_affairs`** للخريج — وحدة/أدوار `graduate_affairs` **غير موجودة** في جرد الإنتاج المؤكد (Batch A §2.6) ولا في seeds (تُدار إدارياً) |
| توقيع العميد | ✅ البنية جاهزة (`is_current_user_dean_for_student`) — خطوة `dean_signature` إلزامية في العقد |
| رسوم/وثيقة | ❌ `fee_configuration_pending` + لا قالب PDF (§8 صفوف 1/5)؛ `document_type='academic_record'` غير مزروع |
| عقد | ✅ `docs/request-services/academic_record.md` |

### 7.2 الفجوات للاكتمال على نمط B1

1. **قرار علاقة `academic_record` بمسار `official_transcript` legacy** (إحلال/تعايش/ترحيل) — شرط تصميمي سابق.
2. إنشاء وحدة/أدوار `graduate_affairs` (`graduate_affairs_specialist` + `graduate_affairs_manager`) + تعيينات فعلية.
3. تعريف قانوني بـ `audience='both'` + تصحيح `request_audience` للصف الحالي (`active_student` الآن) + نموذج (purpose/copies/recipient/language).
4. validate RPC (نشط/خريج + فصل مكتمل واحد على الأقل بدرجات).
5. Workflow من 7 خطوات بتوجيه مشروط حسب الحالة + توقيع عميد مقيد بكلية الطالب.
6. قالب PDF رسمي (ar/en/both) + توسعة saga + قرار الرسوم.
7. اختبارات (بما فيها مصفوفة تفويض عميد كلية أخرى −) + runbook.

### 7.3 قالب قرار إداري — D-12-S4

| البند | القيمة المقترحة (متحفظة — قابلة للتعديل) | قرار المستخدم |
|---|---|---|
| **S4.1 علاقة بـ `official_transcript`** | **إحلال**: `academic_record` هو الخدمة القانونية؛ يُجمَّد طلب `official_transcript` الجديد ويُحال للقانونية (القديم يبقى للأرشيف) | ☐ إحلال ☐ تعايش ☐ دمج: ______ |
| الأهلية | `status IN ('active','graduated')` + فصل مكتمل واحد بدرجات مسجلة على الأقل | ☐ اعتماد ☐ تعديل: ______ |
| الجمهور | طلاب وخريجون (`audience='both'`) — يتطلب تصحيح audience الحالي | ☐ اعتماد ☐ نشط فقط |
| المرفقات | لا مرفقات | ☐ اعتماد ☐ تعديل: ______ |
| اللغة | `ar` افتراضياً؛ `en`/`both` خيارات — يخضع لتوفر القالب الرسمي | ☐ اعتماد ☐ ar فقط أولاً |
| **S4.2 الرسوم** | مدفوعة — المبلغ TBD من المالية (اقتراح: صف `fee_types` جديد `academic_record`) | ☐ مجانية ☐ مبلغ: ______ |
| خطوات workflow | 1) مراجعة أولية (شؤون الطلاب للنشط / شؤون الخريجين للخريج) 2) تقييم رسوم 3) تأكيد دفع (finance) 4) توقيع مسجل الكلية 5) **توقيع العميد** 6) إصدار (نفس وحدة الخطوة 1) 7) أرشفة | ☐ اعتماد ☐ تعديل: ______ |
| الأدوار/المكلفون | إنشاء `graduate_affairs` + ترشيح: specialist ______ / manager ______ (العقد يذكر صالح علي / محمد شوقي كمرشحين) | ☐ اعتماد المرشحين ☐ أسماء أخرى |
| الوثيقة الناتجة | PDF سجل أكاديمي — `document_type='academic_record'` + `verification_code`؛ قالب رسمي من مكتب العميد | ☐ سيوفر القالب ☐ شحن المسار حتى التوقيع أولاً |

### 7.4 التصنيف

**تحتاج تصميماً عميقاً** قبل البدء المصدري: تداخل مع مسار `official_transcript` legacy (S4.1)، توجيه مزدوج يتطلب وحدة `graduate_affairs` غير الموجودة، توقيع عميد، وقالب PDF ثنائي اللغة. تُحسم S4.1/S4.2 أولاً ثم تُبنى السقالات.

---

## 8. الخدمة 5 — `grade_statement` (شهادة تقديرات — للخريجين)

### 8.1 حالة المصدر الحالية

| الطبقة | الموجود فعلاً |
|---|---|
| `request_types` | ✅ صف موجود، مخفي — تدقيق Go-Live صف 11 — **`request_audience='active_student'` حالياً وهو غير صحيح** لخدمة موجهة للخريجين |
| تعريف قانوني/نموذج/معاينة/Adapter | ❌ كلها غائبة عن `src/` |
| جدول تفاصيل | ✅ إعادة استخدام `official_transcript_request_details` |
| Validate RPC | ❌ `validate_grade_statement_request` (أو إعادة استخدام بقواعد خريجين) |
| وحدة شؤون الخريجين | ❌ غير موجودة في جرد الإنتاج (كما في §7.1) |
| استمرارية حساب الخريج | ⚠️ مرتبطة بـ **D-13** (سياسة دخول الخريج لحسابه) — شرط لتقديم الطلب ذاتياً |
| رسوم/وثيقة | ❌ `fee_configuration_pending` + لا قالب PDF (§8 صفوف 1/5)؛ `document_type='grade_statement'` غير مزروع |
| عقد | ✅ `docs/request-services/grade_statement.md` (نفس شكل `academic_record` السباعي مع توقيع عميد؛ استلام/إصدار لدى شؤون الخريجين) |

### 8.2 الفجوات للاكتمال على نمط B1

1. حسم D-13 (استمرارية حساب الخريج) — بدونه لا قناة تقديم ذاتية للخريج.
2. إنشاء وحدة/أدوار `graduate_affairs` + تعيينات.
3. تصحيح audience إلى `graduate` + تعريف قانوني + نموذج (purpose/copies/recipient/language/include_gpa).
4. validate RPC (`status='graduated'` + سجل كامل في `student_grades`).
5. Workflow سباعي (مراجعة شؤون الخريجين ← رسوم ×2 ← توقيع مسجل ← توقيع عميد ← إصدار ← أرشفة).
6. قالب PDF + توسعة saga + قرار رسوم.
7. اختبارات + runbook.

### 8.3 قالب قرار إداري — D-12-S5

| البند | القيمة المقترحة (متحفظة — قابلة للتعديل) | قرار المستخدم |
|---|---|---|
| الأهلية | `status='graduated'` + اكتمال سجل الدرجات (كل الفصول) | ☐ اعتماد ☐ تعديل: ______ |
| الجمهور | خريجون فقط (`audience='graduate'`) — تصحيح إلزامي للصف الحالي | ☐ اعتماد ☐ تعديل |
| **S5.1 قناة التقديم** | حساب الخريج الحالي يستمر بعد التخرج (يربط بـ D-13) | ☐ اعتماد ☐ تقديم يدوي لدى شؤون الخريجين |
| المرفقات | لا مرفقات | ☐ اعتماد ☐ تعديل: ______ |
| `include_gpa` | افتراضياً مفعّل (يظهر المعدل التراكمي) | ☐ اعتماد ☐ اختياري للطالب ☐ إخفاء |
| **S5.2 الرسوم** | مدفوعة — المبلغ TBD (اقتراح: صف `fee_types` جديد `grade_statement_grad`) | ☐ مجانية ☐ مبلغ: ______ |
| خطوات workflow | 1) مراجعة شؤون الخريجين (graduate_affairs/graduate_affairs_specialist) 2) تقييم رسوم 3) تأكيد دفع 4) توقيع مسجل الكلية 5) توقيع العميد 6) إصدار (شؤون الخريجين) 7) أرشفة | ☐ اعتماد ☐ تعديل: ______ |
| الأدوار/المكلفون | كما في S4 (شؤون الخريجين) + مكلفو الخطوات الأخرى: ______ | ☐ تُرسل الأسماء |
| الوثيقة الناتجة | PDF شهادة تقديرات — `document_type='grade_statement'` + `verification_code`؛ قالب رسمي | ☐ سيوفر القالب ☐ شحن المسار حتى التوقيع أولاً |

### 8.4 التصنيف

**تحتاج تصميماً عميقاً**: جمهور خريجون (audience + D-13)، وحدة شؤون خريجين غير موجودة، توقيع عميد، وقالب PDF. البدء المصدري ممكن جزئياً بعد حسم D-13 وإنشاء الوحدة.

---

## 9. الخدمة 6 — `graduation_certificate` (شهادة تخرج)

### 9.1 حالة المصدر الحالية

| الطبقة | الموجود فعلاً |
|---|---|
| `request_types` | ✅ صف موجود، مخفي — تدقيق Go-Live صف 12 — **audience غير صحيح** (`active_student`) |
| تعريف قانوني/نموذج/معاينة/Adapter | ❌ كلها غائبة عن `src/` |
| جدول تفاصيل | ✅ إعادة استخدام `official_transcript_request_details` |
| Validate RPC | ❌ `validate_graduation_certificate_request` غير موجودة |
| مصدر حالة التخرج | ⚠️ قرار معلق (§8 صف 3): (أ) `student_academic_status` آلياً أم (ب) تأكيد يدوي — توجد مصدرياً بوابة `evaluateGraduateRecordReadiness` (قرار تخرج رسمي معتمد) غير مربوطة بالطلبات |
| المخالصة المالية | ⚠️ العقد يشترط عدم وجود مستحقات (`student_fees`) — يلزم تأكيد مصدر/قاعدة الفحص |
| وحدة شؤون الخريجين | ❌ غير موجودة (كما في §7.1) |
| رسوم | ❌ تأكيد إعادة استخدام `graduation(100)` (§8 صف 1) |
| وثيقة | ❌ `document_type='graduation_certificate'`؛ **القالب أعلى أولوية** بين القوالب (§8 صفوف 3/5) |
| عقد | ✅ `docs/request-services/graduation_certificate.md` (8 خطوات تتضمن `graduation_verification` لدى المسجل + توقيع عميد) |

### 9.2 الفجوات للاكتمال على نمط B1

1. حسم مصدر حالة التخرج (§8 صف 3) وربطه ببوابة القرار الرسمي الموجودة مصدرياً.
2. قاعدة المخالصة المالية (مصدر الفحص + معنى «لا مستحقات»).
3. إنشاء وحدة/أدوار `graduate_affairs` + D-13 لقناة التقديم.
4. تصحيح audience + تعريف قانوني + نموذج (purpose/copies/language + `graduation_year` للقراءة فقط).
5. validate RPC مركبة (تخرج مؤكد + نجاح تراكمي + مخالصة مالية).
6. Workflow ثماني + تعيينات (بما فيها خطوة تحقق مسجل مستقلة عن توقيعه).
7. قالب PDF رسمي (أعلى أولوية) + saga + رسوم `graduation(100)` أو ما يُعتمد.
8. اختبارات + runbook + حراسة أرشفة مشددة (إلغاء لا يحذف التخزين أبداً — §6/العقد).

### 9.3 قالب قرار إداري — D-12-S6

| البند | القيمة المقترحة (متحفظة — قابلة للتعديل) | قرار المستخدم |
|---|---|---|
| **S6.1 مصدر حالة التخرج** | (أ) آلي من `student_academic_status` + سجل قرار تخرج رسمي معتمد، مع (ب) تحقق يدوي من المسجل كخطوة `graduation_verification` إلزامية (مزدوج) | ☐ آلي+يدوي مزدوج ☐ يدوي فقط ☐ آلي فقط |
| الأهلية | `status='graduated'` + نجاح تراكمي مؤكد + **لا مستحقات مالية غير مسددة** (`student_fees`) | ☐ اعتماد ☐ إعفاء من المخالصة ☐ تعديل: ______ |
| الجمهور | خريجون فقط (`audience='graduate'`) — تصحيح إلزامي | ☐ اعتماد ☐ تعديل |
| قناة التقديم | حساب الخريج المستمر (D-13) | ☐ اعتماد ☐ تقديم يدوي |
| المرفقات | لا مرفقات | ☐ اعتماد ☐ تعديل: ______ |
| **S6.2 الرسوم** | إعادة استخدام `graduation(100)` القائمة | ☐ `graduation(100)` ☐ مجانية ☐ مبلغ: ______ |
| خطوات workflow | 1) مراجعة شؤون الخريجين 2) **تحقق التخرج** (registrar/registrar_general) 3) تقييم رسوم 4) تأكيد دفع 5) توقيع مسجل الكلية 6) توقيع العميد 7) إصدار (شؤون الخريجين) 8) أرشفة | ☐ اعتماد ☐ تعديل: ______ |
| الأدوار/المكلفون | شؤون الخريجين + مسجل + عميد + مالية + أرشيف — أسماء: ______ | ☐ تُرسل الأسماء |
| الوثيقة الناتجة | PDF شهادة تخرج — `document_type='graduation_certificate'` + `verification_code`؛ **قالب رسمي أعلى أولوية**؛ إشعار بلا رابط؛ إلغاء = soft فقط ولا حذف للتخزين إطلاقاً | ☐ سيوفر القالب ☐ شحن المسار حتى التوقيع أولاً |

### 9.4 التصنيف

**تحتاج تصميماً عميقاً**: أعلى وثيقة حساسية؛ قراران حاكمان (S6.1 مصدر التخرج، S6.2 الرسوم) + مخالصة مالية + وحدة خريجين + قالب أعلى أولوية. لا يُنصح ببدء مصدري قبل حسم S6.1 على الأقل.

---

## 10. قالب القرار الموحد D-11 (تنفيذ كامل أم استبعاد رسمي)

| الخدمة | التوصية الفنية | قرار المستخدم |
|---|---|---|
| `replacement_student_card` | تنفيذ — أولى (أصغر نطاق) | ☐ تنفيذ كامل ☐ استبعاد رسمي ☐ تأجيل |
| `october_exam_entry_form` | تنفيذ — ثانية (بعد S2.1–S2.3) | ☐ تنفيذ كامل ☐ استبعاد رسمي ☐ تأجيل |
| `grade_statement_non_graduate` | تنفيذ — سقالات فوراً؛ تفعيل بعد القالب/الرسوم | ☐ تنفيذ كامل ☐ استبعاد رسمي ☐ تأجيل |
| `academic_record` | تنفيذ — بعد تصميم عميق (S4.1 أولاً) | ☐ تنفيذ كامل ☐ استبعاد رسمي ☐ تأجيل |
| `grade_statement` | تنفيذ — بعد D-13 + وحدة الخريجين | ☐ تنفيذ كامل ☐ استبعاد رسمي ☐ تأجيل |
| `graduation_certificate` | تنفيذ — بعد S6.1/S6.2 (أعلى قيمة، أعلى حساسية) | ☐ تنفيذ كامل ☐ استبعاد رسمي ☐ تأجيل |

> لا توصية فنية باستبعاد أي خدمة: لكل منها عقد موثق وأساس مشترك جاهز. الاستبعاد قرار إداري محض ويُوثَّق هنا عند اختياره (مع بقاء الصف مخفياً — الوضع الحالي آمن إنتاجياً).

---

## 11. قرارات مشتركة مكتشفة (تُحسم مرة واحدة وتُطبق على الجميع)

| # | القرار | الأثر | مرجع |
|---|---|---|---|
| C-1 | جدول الرسوم المعتمد (مبلغ + `fee_types.code` لكل خدمة مدفوعة) — السداد الخارجي يتبع قالب EXTERNAL_UNIVERSITY_PAYMENT عند اعتماده (لا مبلغ/عملة/فاتورة داخل البوابة) | الست كلها (S1–S6) | §7/§8 صف 1 + قرارات محسومة |
| C-2 | قوالب PDF الرسمية الأربع (`grade_statement_non_grad`, `academic_record`, `grade_statement`, `graduation_certificate`) | الخدمات الوثائقية الأربع | §8 صف 5 |
| C-3 | إنشاء وحدة `graduate_affairs` + دورا `graduate_affairs_specialist`/`graduate_affairs_manager` + تعيينات | `academic_record` (خريجون) + `grade_statement` + `graduation_certificate` | Batch A §2.6 |
| C-4 | D-13 استمرارية حساب الخريج | قناة تقديم الخدمات الثلاث الخريجية | DECISIONS-NEEDED |
| C-5 | تصحيح `request_audience` لصفوف `grade_statement`/`graduation_certificate` إلى `graduate` (ولـ `academic_record` إلى `both`) عبر الإدارة | الخدمات الثلاث | تدقيق Go-Live §1 |
| C-6 | حسم تعارض معاينة `grade_statement_non_graduate` القديمة (جهات مركزية) مع عقد Batch A | الخدمة 1 | S1.1 |
| C-7 | علاقة `academic_record` بمسار `official_transcript` legacy | الخدمة 4 | S4.1 |

---

## 12. التحقق والأدلة

| فحص | النتيجة |
|---|---|
| HEAD المدروس | `8f229d09d581d8128dc684f47ad989200312d210` (main) |
| ملفات مصدرية فُحصت | `request-type-registry.ts`, `request-form-registry.ts`, `request-service-adapter.ts`, `request-workflow-preview-registry.ts`, `transcript.functions.ts`, `graduates-affairs/foundation.ts`, `admin-processing-roles.core.ts` |
| Migrations فُحصت (قراءة فقط) | `20260627120000_official_transcript_request`, `20260628120000_official_transcript_readiness_guard`, `20260629120000_reactivate_official_transcript_request_type`, `20260710130000_student_request_types_schema`, `20260710140000_student_request_types_rpc_rls`, `20260710160000_student_request_processing_units_schema`, `20260711020000_student_requests_p1_foundations`, `20260624140000_student_requests_workflow_foundation` |
| وثائق مرجعية | MASTER-STATE, DECISIONS-NEEDED (D-11/D-12), PRODUCTION-GATES (G0–G4), BATCH-A-COMMON-FOUNDATION-01 (§2/§6/§7/§8/§9), GO-LIVE-READINESS-AUDIT-01, B1-CONSOLIDATED-DESIGN-01, B1-SOURCE-01, عقود `docs/request-services/` الستة |
| تعديل `src/` | ❌ لا شيء |
| Migration / SQL مُطبَّق / تعديل بيانات | ❌ لا شيء (مسودات `docs/migration-drafts/` لم تُمَس) |
| دمج PRs | ❌ لا شيء |
| ملاحظة بحث | `search_code` لا يفهرس هذا المستودع حالياً (0 نتائج حتى لرموز موجودة مؤكداً)؛ اعتُمد التصفح المباشر للشجرة عبر API بدلاً منه — كل استنتاج موثق بمسار ملف صريح أعلاه |

**مخاطر متبقية:** (1) تأكيدات وجود/غياب وحدات وأدوار المعالجة مبنية على جرد Batch A المؤرخ 2026-07-16 للإنتاج — أي تغيير إداري لاحق عبر UI لا يظهر في المستودع؛ (2) تضارب معاينة `grade_statement_non_graduate` القديمة مع عقد Batch A محسوم لصالح ما يقرره المستخدم في S1.1؛ (3) جاهزية قوالب PDF خارج نطاق الفريق التقني كلياً.

---

## 13. الحالة

- **المكتمل:** جرد دقيق لحالة المصدر لكل خدمة من الست، فجواتها على نمط B1، ستة قوالب قرارات إدارية (D-12-S1…S6) بقيم مقترحة متحفظة، قالب D-11 الموحد، وسبعة قرارات مشتركة (C-1…C-7).
- **التصنيفات:** 3 خدمات قابلة للبدء فوراً بعد قرارات بسيطة (`replacement_student_card`, `october_exam_entry_form`, `grade_statement_non_graduate`)؛ 3 تحتاج تصميماً عميقاً (`academic_record`, `grade_statement`, `graduation_certificate`)؛ 0 يُوصى فنياً باستبعادها.
- **التالي:** توقيع المستخدم لقوالب D-11/D-12 ثم انطلاق Batch B الخاص بكل خدمة معتمدة على بوابات G2/G3.

**القرار: PASS_REMAINING_SIX_READINESS_MAPPED_DECISION_TEMPLATES_READY**
