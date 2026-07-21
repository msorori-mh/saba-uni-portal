# Graduation Projects Lifecycle Completion 01 — تقرير

## 1) النطاق

يكمّل دورة حياة مشروع التخرج فوق MVP-FOUNDATION-01: اعتماد الاقتراح وتثبيته، التسليمات والمراجعات، الفحص الأمني، طلب المناقشة وجدولتها وعقدها، اللجنة والتقييمات، حسم النتيجة، التصحيحات، والأرشفة. بلا جداول جديدة — يعيد استخدام مخطط الأساس، ويقيّد `discussion_outcome` و`reviewer_role` و`decision`، ويضيف 21 RPC إضافية (25 إجمالاً).

## 2) منطق التنفيذ (RPCs)

- كل حالة `active` من الأساس أصبحت قابلة للوصول والإنهاء عبر مسارات RPC محروسة بالحالة والدور.
- محادثات المناقشة تُختَم بإجماع تقييمات اللجنة قبل الحسم، والتصحيحات تُكتَمل وتُقبَل فقط في `corrections_required`.
- عميل RPC مطبع بمعرّفات ارتباط (correlation ids)؛ idempotent retries تعيد نفس `entity_id` المسجل لنفس `(project_id, correlation_id, event_type)`.
- 19 اختبار وحدة للدوال النقية (state machine + إنفاذ الإجماع + تقييد المشاهد) — `bun test` أخضر.

## 3) تدقيق آلة الحالة

مصفوفة الحالة × الإجراء كاملة (13 إجراءً، منها `archive` و`complete_correction` مقصودان كـ no-op عندما لا تنطبق الشروط). لكل حالة: الأعمدة التي يملأها الانتقال، الإجراء المسموح التالي، والأحداث الملحقة. لا يوجد غموض «حالة بلا مسار»: كل حالة غير نهائية لها انتقال واحد صالح على الأقل منها، والحالتان النهائيتان (`completed`, `archived`) مغلقتان صراحة. الحالتان `rejected`/`cancelled` متاحتان في النوع ولكن لا تُنتَجان في هذا النطاق. وتحديداً تبقى `cancelled` **محجوزة** (مراجعة 4982 LOW-4): لا ينتجها أي مسار RPC حالي، وتُركت عمداً لمسار إلغاء محروس مستقبلي بدل فتح مسار غير مدروس الآن.

## 4) التدقيق الأمني (الرؤية)

- الطالب يقرأ الملخص الخاص بمشروعه فقط (ملفات/ملاحظات/تقييمات تظهر فقط عندما تسمح الحالة)، بينما تقييمات اللجنة تبقى مخفية حتى حسم النتيجة.
- منع الرفع بعد `discussion_held` إلا داخل نافذة التصحيح؛ كل كائن مرفوع يجب أن يجتاز مسح `storage.objects` (scan_status = clean).
- كل إجراءات الكتابة تمر عبر `require_graduation_project_assignment` مع الأدوار المسموحة لكل RPC؛ لا مسار خدمة يتجاوز RLS.
- قرار خصوصية موثّق (مراجعة 4982 LOW-6): سطح قراءة الطالب يتضمن `user_id` للتعيينات و`actor_user_id` للأحداث — معرّفات فقط (بلا أسماء أو بيانات تواصل) لأغراض شفافية التدقيق داخل نطاق القسم؛ يُعاد النظر بالتهذيب إن صدرت سياسة خصوصية ملزمة.

## 5) التحقق

- PostgreSQL 17: schema ← migration ← verifier — نجاح كامل (23 حالة denial دقيقة، 24 زوج idempotent retry في الحلقة الختامية، 5 تأكيدات replay بمعرّفات حمولة غير متطابقة، 19 مجموعة تأكيدات، حدود الإجماع، دالة قراءة واحدة لكل الأدوار). أُعيد التشغيل في 2026-07-21 بعد إصلاحات المراجعة على عميل psql 16.2 حقيقي ← خادم PostgreSQL 17.10 مع `-v ON_ERROR_STOP=1` وانتهى بـ `rollback;` (صفر صفوف بعد التشغيل). التفاصيل: `tests/graduation-projects/POSTGRES-17-LIFECYCLE-VERIFICATION-RESULT.md`.
- `bun test`: 42 اختباراً أخضر (437 expects) على bun 1.3.14 — منها 19 اختبار وحدة للدوال النقية (بينها 4 لتقييد المشاهد MEDIUM-1)، و16 اختبار محتوى لمسودات SQL/المتحقق/العميل المطبع (الحراسات، exactly-once، عدم تخطي الأحداث، الأعمدة الفريدة، تشطيبات `$$`)، و7 لأساس المخطط.
- `tsc --noEmit` صارم محدود النطاق (المكوّن المعدَّل + الألواح الشقيقة + مكتبة lib) — أخضر؛ بناء Next.js الكامل يبقى حُكم CI.

## 6) المخاطر وخطة الرفع

1. ربط المسارات (routes) وتكامل الواجهة — خارج النطاق؛ كل منطق RPC مغطى بالفعل.
2. تنظيف مفاتيح كائنات الملفات اليتيمة (orphaned object keys) — خارج النطاق؛ آمن لأن `object_key` فريد لكل مشروع.
3. إشعارات تغيّر الحالة للطلاب — خارج النطاق؛ الأحداث (events) قابلة للاستهلاك لاحقاً.
4. بيانات الحقل اليدوية (manual field data) لمرحلة نشر المناقشات — خارج النطاق.

## 7) موجز SHA-1 (بصمات git blob للملفات المقصودة — محدَّثة بعد إصلاحات المراجعة)

- `docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql` — `ab6b2fa8ac8ec88276b19603f9ba423f643071ab`
- `docs/GRADUATION-PROJECTS-COMPLETION-01-REPORT.md` — يُبصَم عند الدفع (النسخة قبل الإصلاح `714d8960f0714892245ea3c7d2e92d1221f1383d`)
- `src/lib/graduation-projects/rpc.ts` — `1ed92b44bd415696b6b4414ed316e00e488fe0c7`
- `src/lib/graduation-projects/lifecycle.ts` — `294167a71a787ae91d58633bee74b825b8e68cbd`
- `src/components/graduation-projects/DiscussionPanel.tsx` — `95f071901fc54ab90ae80496ce76c5e4de491141`
- `src/components/graduation-projects/EvaluationPanel.tsx` — `ce49dfd3bfccb8443fae9b530fa0ea20939719dd`
- `src/components/graduation-projects/GraduationProjectStateBadge.tsx` — `c32aba24c887c75b5f9b3a2506af24cf4f3c5192`
- `src/components/graduation-projects/GraduationProjectWorkspace.tsx` — `41932037d3b13e99ad452992a5e506817ebebcf2`
- `src/components/graduation-projects/MilestonesPanel.tsx` — `3f061bc32794b8cef8e69d202acef805f789cf8a`
- `src/components/graduation-projects/ProposalWorkflowPanel.tsx` — `153d62282603418ee6d0b10f3e2e0d5569ec5181`
- `src/components/graduation-projects/ResultCorrectionsArchivePanel.tsx` — `939e0c64f16de065532ad818a0de816f83983da1`
- `tests/graduation-projects/graduation-projects-lifecycle-sql-draft.test.ts` — `2d5e6a3745c8ed60bd01c9e0dbfc885095cf873d`
- `tests/graduation-projects/graduation-projects-lifecycle.test.ts` — `7ebde273a36ea501c7f40eb1dd7c89d25ef72ef6`
- `tests/graduation-projects/postgres-lifecycle-verifier.sql` — `e59559bd3aa9fcf016d18c3aeb8ede37025c9059`

## 8) معالجة ملاحظات المراجعة 4982 (PASS_WITH_NOTES — MEDIUM واحدة كانت حاجبة)

- **MEDIUM-1 (حاجبة) — اكتمال تقييد المشاهد**: كان `GraduationProjectWorkspace` يشتق `ownEvaluation` من **كل** تعيينات `panel_member` النشطة، فيمكن أن يُلتقط تقييم عضو آخر (مثلاً finalized) كأنه تقييم المشاهد — فيُخفي النموذج خطأً أو يعرض درجات غيره. البنية التصحيحية كانت موجودة جزئياً على الفرع (prop ‏`viewerUserId`‏ + دالتا ‏`resolveViewerPanelMemberIds`/`resolveViewerEvaluation`‏ + اختبارات bun الأربعة بما فيها «مشاهد تقييمه draft وعضو آخر finalized ⇒ النموذج يظهر»)؛ أُكمل الإصلاح بتبديل الاشتقاق ليستخدم `resolveViewerEvaluation(detail, viewerUserId)` مع إبقاء القائمة الكاملة `panelCandidates` لمنتقي `DiscussionPanel` دون تغيير.
- **LOW-1 — 23505 الخام**: فحص مسبق + P0001 حارسة في `assign_graduation_project_faculty` (مطابقة للفهرس `graduation_project_active_assignment (project_id, role, user_id) where active`)، و`assign_graduation_project_panel_member` (`unique(discussion_id, assignment_id)`)، و`register_graduation_project_file` (`object_key unique`). الرسائل الثلاث الجديدة مربوطة بتسميات عربية في `ERROR_LABELS` بـ rpc.ts فسطح المستخدم عربي دائماً؛ والمُتحقِّق يؤكد الرسائل الدقيقة الثلاث.
- **LOW-2 — replay غير متسق**: RPCs الخمسة (`end_assignment`, `resolve_note`, `reject_discussion_request`, `complete_correction`, `accept_correction`) صارت تقرأ `entity_id` المسجل لنفس `(project_id, correlation_id, event_type)` وتعيده بدل المعرّف الممرَّر؛ والمُتحقِّق يؤكد لكلٍّ منها إعادة المسجَّد حتى مع معرّف حمولة غير متطابق.
- **LOW-3 — ترتيب idempotency**: في `assign_graduation_project_faculty` نُقل فحص الـ idempotency قبل فحوص الحالة (مطابقةً لأشقائه) فلا يُرفض replay صالح بسبب حالة لاحقة.
- **LOW-4 — `cancelled` محجوزة**: غير قابلة للوصول عبر أي RPC في هذا النطاق؛ وُثّقت في §3 كحالة محجوزة لمسار إلغاء محروس مستقبلي (لم يُضف مسار إلغاء حفاظاً على حدود النطاق).
- **LOW-5 — سقف الدرجة**: تحقق `save_graduation_project_evaluation` يرفض `maximum_score > 99999.99` (سعة `numeric(7,2)`) برسالة `evaluation scores invalid` قبل أي إدخال — لا overflow خام بعد الآن؛ مؤكَّد في المُتحقِّق.
- **LOW-6 — خصوصية سطح الطالب**: قرار مقصود موثّق في §4: تضمين `user_id` للتعيينات و`actor_user_id` للأحداث لأغراض شفافية التدقيق داخل نطاق القسم (معرّفات فقط بلا أسماء)، مع إعادة نظر مؤجلة عند أي سياسة ملزمة.
- **LOW-7 — 23/24**: المُتحقِّق ينفّذ 24 زوج `_retry` بينما كانت الحلقة الختامية تفحص 23؛ أُضيف `asg2_retry` إلى الحلقة الختامية فصارت 24/24، ودُقّقت الصياغة هنا وفي ملف النتيجة.

### إعادة التحقق بعد الإصلاح (2026-07-21)

- **PG 17**: السلسلة الخماسية (minimal-schema ← foundation draft ← lifecycle draft ← foundation verifier ← lifecycle verifier) على عميل psql 16.2 ← خادم PostgreSQL 17.10 مع `-v ON_ERROR_STOP=1` على كل ملف — نجاح كامل ينتهي بـ `rollback;` (أُثبت صفر صفوف بعد التشغيل).
- **bun**: `bun test tests/graduation-projects/` — 42/42 أخضر (437 expects) على bun 1.3.14.
- **tsc**: `tsc --noEmit` صارم محدود النطاق على المكوّن المعدَّل وكل الألواح الشقيقة ومكتبة lib — أخضر؛ حكم البناء الكامل يبقى لـ CI.
