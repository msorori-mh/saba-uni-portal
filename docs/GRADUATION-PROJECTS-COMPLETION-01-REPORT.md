# تقرير استكمال نظام مشاريع التخرج (Q-15) — GRADUATION-PROJECTS-COMPLETION-01

**التاريخ (UTC):** 2026-07-21 · **الفرع:** `feat/graduation-projects-completion-01` · **النطاق:** مصدري فقط (source-only) — لا ترحيلات مطبَّقة، لا دمج.

## 1) الملخص

استكملت دورة حياة مشاريع التخرج فوق أساس GRADUATION-PROJECTS-MVP-FOUNDATION-01 المدموج، من فكرة المقترح حتى الأرشفة، عبر:

1. **مسودة SQL جديدة (DRAFT ONLY)** تضيف 19 خدمة كتابة + 6 خدمات قراءة/تقارير، كلها `security definer` مغلقة المنح، بنفس ثوابت الأساس (قفل `for update`، إدماجية `correlation_id`، أحداث append-only، تحقق الحالة/النسخة، رسائل خطأ دقيقة).
2. **واجهات React** عرضية بالكامل لكل الأدوار (طالب/مشرف/منسق/رئيس قسم/عميد/عضو لجنة) بأنماط المشروع القائمة — لا مسارات كتابة مباشرة؛ كل الكتابة عبر وحدة RPC مغلفة.
3. **اختبارات:** وحدة/تكامل bun لمصفوفة الأفعال والرؤية والتقييم والمسودة، ومُتحقق PostgreSQL 17 تنفيذي كامل.
4. **تقارير قسم** عبر خدمات: الحالات، التعيينات، التقييمات، الأرشيف.

## 2) الملفات (18 ملفاً في هذا الPR)

| الملف | الوصف |
|---|---|
| `docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql` | مسودة دورة الحياة — **DRAFT ONLY — DO NOT APPLY** |
| `docs/GRADUATION-PROJECTS-COMPLETION-01-REPORT.md` | هذا التقرير |
| `src/lib/graduation-projects/lifecycle.ts` | نموذج عرض: مصفوفة الأفعال، التسميات العربية (33 حدثاً)، الرؤية، التقييم، التصحيحات، أنواع حمولات القراءة/التقارير |
| `src/lib/graduation-projects/rpc.ts` | عميل RPC مغلّف لكل الخدمات الـ25 + تعيين أخطاء عربي + معرفات إدماجية |
| `src/components/graduation-projects/` (10 مكونات) | StateBadge، ProjectsList، CreateProjectForm، ProposalWorkflowPanel، MilestonesPanel، DiscussionPanel، EvaluationPanel، ResultCorrectionsArchivePanel، GraduationProjectReports، GraduationProjectWorkspace |
| `tests/graduation-projects/graduation-projects-lifecycle.test.ts` | 15 اختبار وحدة |
| `tests/graduation-projects/graduation-projects-lifecycle-sql-draft.test.ts` | تحقق محتوى المسودة/المتحقق/العميل |
| `tests/graduation-projects/postgres-lifecycle-verifier.sql` | متحقق تنفيذي كامل على PG17 |
| `tests/graduation-projects/POSTGRES-17-LIFECYCLE-VERIFICATION-RESULT.md` | نتيجة التشغيل المحلي |

لم تُمَسّ: `src/routeTree.gen.ts`، `supabase/migrations/`، runbook-07، أو أي نظام آخر. ملاحظات مراجعة ‎#178 مُعالَجة سلفاً في الأساس المدموج (مفاتيح مركبة، خدمات مغلقة، أحداث append-only).

## 3) مصفوفة دورة الحياة المنفذة

`draft → submitted → under_review → approved → active → discussion_requested → discussion_scheduled → evaluating → corrections_required → evaluating → completed → archived` مع فروع `revision_required → submitted` و`rejected/cancelled`، وتأجيل/إلغاء/رفض طلب المناقشة. الإنشاء مفوَّض: يتطلب تعيين منسق/رئيس قسم نشطاً في القسم (تعيينات department_head/dean تبقى bootstrap مميزاً — G4)، ويُنشئ تعيين المنشئ على المشروع تلقائياً بتوثيق الحدثين.

## 4) امتثال القيود

- **لا كتابة مباشرة:** الواجهات لا تستورد supabase ولا `.from(`؛ كل كتابة عبر خدمات security definer فقط (تحقق اختبار المسودة).
- **الملفات:** لا bucket/سياسة/URL عام في المسودة؛ تسجيل بيانات وصفية فقط بمفاتيح ضمن `graduation-projects/<projectId>/%` وبصمة SHA-256؛ `object_key` لا يظهر إلا عند `scan_state='clean'`؛ واجهة التسجيل تعرض تنبيهاً بأن الرفع الثنائي معلَّق حتى اعتماد سياسة التخزين.
- **رؤية التقييمات:** الطالب لا يرى إلا المعتمد نهائياً (finalized)؛ عضو اللجنة يرى مسوداته + المعتمد؛ الكوادر ترى الكل — مُتحقق في SQL وbun.
- **المنح:** revoke من public/anon وgrant لـ authenticated فقط، مع إعادة تحقق auth.uid() والتعيينات داخل كل خدمة.

## 5) أدلة التحقق المحلية

- **PostgreSQL 17.10 (بيئة معزولة disposable):** السلسلة الكاملة (الحد الأدنى → مسودة الأساس → مسودة دورة الحياة → متحقق الأساس → متحقق دورة الحياة) = **PASS**؛ التطبيق المزدوج للمسودة مرفوض (`refuse ambiguous retry`). التفاصيل: `tests/graduation-projects/POSTGRES-17-LIFECYCLE-VERIFICATION-RESULT.md`.
- **bun:** **38 اختباراً ناجحاً / 0 فاشل / 431 expect** (تشمل اختبارات الأساس غير المعدَّلة).
- **TypeScript strict** (`noUnusedLocals/Parameters`): **PASS** على الوحدات والمكونات الجديدة.

## 6) ما لم يُنجز محلياً (CI هو الحكم) + متابَعات

1. ربط المسارات (routes) وتوليد `routeTree.gen.ts` — خارج النطاق المسموح؛ يحتاج مهمة لاحقة.
2. توفير هويات المنسقين/رؤساء الأقسام المعتمدة (البوابة المميزة G4) قبل تفعيل أي شيء.
3. أسماء أعضاء الفرق/اللجان في العرض (تتطلب مصدر أسماء معتمداً؛ تعرض الواجهات المعرفات حالياً).
4. الرفع الثنائي للمرفقات — معلَّق بانتظار اعتماد سياسة التخزين (المسار مصمم دون تفعيل bucket).
5. خدمة فحص الملفات الخارجية (تقليب `scan_state`) — خارج هذا النطاق.
6. الإشعارات/التنبيهات للأحداث — متابعة لاحقة.
7. لم يُشغَّل بناء التطبيق الكامل محلياً ولا متحقق routeTree؛ البيئة الحاكمة هي CI.

## 7) إقرار

كل ما سبق **مصدري فقط**: لا قاعدة بيانات مشتركة، لا ترحيل مطبَّق، لا دمج للفرع. أي تفعيل إنتاجي يتطلب مراجعة المسودة واستيفاء البوابات الموثقة (G4 وغيرها).
