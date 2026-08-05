# PORTAL-GRADUATION-PROJECTS-ROUTES-AND-RUNTIME-INTEGRATION-01

## القرار

**PASS_GRADUATION_PROJECTS_PORTAL_INTEGRATION_SOURCE_READY**

تكامل مسارات البوابة وworkspaces الأدوار جاهز كمصدر فقط. لا Migration apply، لا Deploy/Publish، لا تفعيل إنتاجي، ولا كتابة على Production/Staging.

## CI remote (PR #226)

| البند | النتيجة |
|---|---|
| Web CI run | `30144837523` |
| إعادة `--failed` | نُفِّذت مرة واحدة |
| سبب الفشل (الأصل والإعادة) | GitHub Actions billing/spending limit — الوظائف لم تبدأ (`The job was not started because recent account payments have failed or your spending limit needs to be increased`) |
| `--log-failed` | `log not found` — لا خطوات تشغيل |
| فشل كود تطبيقي؟ | لا — عائق بنية تحتية عن بُعد |
| قرار CI | **HOLD_PR226_REMOTE_CI_INFRASTRUCTURE_NO_JOB_STEPS** |
| التحقق المحلي | `bun test tests/graduation-projects` + `bun test tests` + `tsc` + `build` — PASS قبل الدفع |
| دمج PR | لم يُنفَّذ |

## 1) حالة المصدر عند البداية

- الفرع: `feat/graduation-projects-portal-integration-01` (أُنشئ من `origin/main` @ `92d51fa`).
- الشجرة كانت نظيفة.
- الموجود مسبقاً: `domain` / `lifecycle` / `rpc` client / 11 مكوّن UI / مسودات SQL / اختبارات وحدة ومتحقق PG17.
- الفجوة: لا مسارات بوابة، لا تنقل، لا server wrappers، لا capability probe استباقي للصفحات.

## 2) خريطة المسارات

| الجمهور | المسار | الملف |
|---|---|---|
| طالب | `/student/graduation-project` | `src/routes/student.graduation-project*.tsx` |
| طالب | `/student/graduation-project/$projectId` | `student.graduation-project.$projectId.tsx` |
| أكاديمي | `/faculty-portal/graduation-projects` | `faculty-portal.graduation-projects*.tsx` |
| أكاديمي | `/faculty-portal/graduation-projects/$projectId` | `faculty-portal.graduation-projects.$projectId.tsx` |
| رئيس قسم / عميد معيَّن | `/admin/graduation-projects` | `admin/graduation-projects*.tsx` |
| رئيس قسم / عميد معيَّن | `/admin/graduation-projects/$projectId` | `admin/graduation-projects.$projectId.tsx` |

`src/routeTree.gen.ts` تُحدَّث آلياً عبر `bun run build` فقط (لا تحرير يدوي).

## 3) خريطة الأدوار والواجهات

| الدور (تعيين مباشر) | الواجهة | المصدر الحاكم |
|---|---|---|
| student | بوابة الطالب — مشروع الطالب فقط | `list_my_graduation_projects` + `get_graduation_project_detail` |
| supervisor / panel_member | بوابة الأكاديمي — المسند فقط | نفس RPCs + `availableProjectActions` كمرآة UX |
| coordinator / department_head / dean | إدارة القسم + تقارير | list/detail + report RPCs بشرط تعيين إداري نشط |
| admin / registrar بلا تعيين | لا bypass عبر RPC | NAV قد يظهر للـ super roles عالمياً؛ الصفحة تفشل مغلقاً عند غياب التعيين |

لا broad bypass لـ admin/dean/registrar/department_head/faculty بالاسم وحده.

## 4) الملفات المضافة والمعدلة

### مضافة
- `src/lib/graduation-projects/availability.ts`
- `src/lib/graduation-projects/portal-privacy.ts`
- `src/lib/graduation-projects/portal.functions.ts`
- `src/lib/graduation-projects/index.ts`
- `src/components/graduation-projects/PortalRuntimeStates.tsx`
- `src/components/graduation-projects/GraduationProjectPortalWorkspace.tsx`
- مسارات الطالب/الأكاديمي/الإدارة أعلاه
- `tests/graduation-projects/graduation-projects-portal-integration-01.test.ts`
- هذا التقرير

### معدلة
- `src/lib/graduation-projects/rpc.ts` — إضافة `submitProposal` / `requestDiscussion` / `archiveProject`
- `src/routes/student.index.tsx` — رابط مشروع التخرج
- `src/routes/faculty-portal.index.tsx` — بطاقة مشاريع التخرج
- `src/lib/admin-nav.ts` — `/admin/graduation-projects` لـ `department_head` + `dean`
- `src/components/admin/AdminShell.tsx` — إدخال تنقل
- `src/routeTree.gen.ts` — مولَّد بالبناء
- `tests/student-requests/tanstack-register-stable-augmentation-01.test.ts` — تحديث بصمة المسارات بعد التسجيل الشرعي

### غير ملموسة (محمية)
- `supabase/migrations/**`
- `docs/migration-drafts/**`
- منطق lifecycle الأساسي
- generated Supabase types
- `student_visible`
- خدمات B1 الجارية (عدا تحديث بصمة routeTree الشرعية)

## 5) RPCs المستخدمة

عبر `GraduationProjectsRpcClient` + `portal.functions.ts` فقط:

- قراءة: `list_my_graduation_projects`, `get_graduation_project_detail`, تقارير الحالات/التعيينات/التقييمات/الأرشيف
- كتابة: إنشاء، تقديم/إعادة/مراجعة مقترح، تسليمات، ملاحظات، تسجيل ملف، مناقشة، لجنة، تقييم، نتيجة، تصحيحات، أرشفة
- Probe: استدعاء `list_my_graduation_projects` واكتشاف `42883` / function missing / schema cache

لا قراءة مباشرة لجداول `graduation_project*` من React components. لا إرسال `actor user id` من العميل. مفتاح الملف يُبنى خادميًا عبر `buildPrivateObjectKey`.

## 6) المسارات التي بقيت fail-closed

عند غياب RPCs من المخطط المتصل:

1. Probe يعيد `available=false`.
2. الصفحات تعرض `GraduationProjectsUnavailable` برسالة عربية غير تقنية.
3. لا mock في Production.
4. Mock اختياري فقط عبر `GRADUATION_PROJECTS_PORTAL_MOCK=1` و`NODE_ENV !== production`.

إنشاء المشاريع في الإدارة يبقى معطلاً حتى يكتمل سياق القسم/البرنامج/الفصل الحالي + تعيين نشط.

## 7) حماية الخصوصية

- الطالب لا يرى تقييمات اللجنة قبل حالات النتيجة (`completed` / `corrections_required` / `archived`) عبر `applyPortalPrivacy`.
- للطالب: إخفاء `object_key` ومفاتيح الأرشيف و`actor_user_id` و`payload` من العرض.
- الأزرار تعتمد `availableProjectActions` (مرآة UX)؛ التفويض النهائي في RPC.

## 8) حماية المرفقات

- لا `getPublicUrl` / public storage URLs في طبقة التكامل.
- لا object path قادم من المستخدم؛ الخادم يبني المفتاح الخاص.
- تسجيل الملف عبر RPC الأمن الموجود فقط.
- أخطاء المستخدم عربية عبر `ERROR_LABELS` دون كشف bucket/SQL.

## 9) الاختبارات

- `bun test tests/graduation-projects` → **64 pass / 0 fail**
- `bun test tests` → **1564 pass / 0 fail**
- تغطية إلزامية في `graduation-projects-portal-integration-01.test.ts`: تسجيل المسارات، الرؤية، fail-closed، نطاق الطالب/المشرف/اللجنة، رفض admin bypass في allow-list، خصوصية التقييمات، منع table access، منع public URL، منع actor IDs، تجميد الحالات النهائية، عدم كسر بوابة الطالب/B1، توليد routeTree عبر build.

## 10) TypeScript / lint / build

- `bunx tsc --noEmit` → PASS
- eslint على الملفات المملوكة الجديدة → PASS بعد prettier
- `bun run build` → PASS (وتوليد `routeTree.gen.ts`)
- `git diff --check` → PASS

## 11) المخاطر المتبقية

1. مسودات SQL غير مطبقة على Production — الصفحات تفشل مغلقاً حتى التطبيق المنفصل المعتمد.
2. سياسة التخزين الخاص/المسح/التنزيل الموقَّع لمشاريع التخرج ما زالت تحتاج حزمة تفعيل منفصلة.
3. `canSeeNavItem` يمنح super roles رؤية عناصر الإدارة عالمياً؛ الحماية الفعلية تبقى في RPC (موثّق ومقصود عدم فتح bypass كتابي).
4. نموذج الإنشاء يعتمد سياق فصل حالي + ملف أكاديمي؛ غيابهما يعطّل الإنشاء دون اختراع بيانات.

## 12) متطلبات التطبيق والتفعيل اللاحقة (خارج هذه المهمة)

1. مراجعة وتطبيق مسودات Foundation + Lifecycle على بيئة معتمدة بأمر منفصل.
2. مصفوفة تفويض RPC إيجابية/سلبية كاملة لكل دور ومرحلة قبل أي E2E.
3. سياسات Storage الخاصة وbucket/prefix المعتمد لمشاريع التخرج.
4. قرار تفعيل واجهات (feature flag/تشغيل) منفصل عن هذا الـ PR.
5. لا Deploy/Publish من هذه المهمة.

## 13) تأكيد عدم وجود Production / Deploy / Migration

- لا اتصال كتابة بـ Supabase production.
- لا `supabase db` apply / migration.
- لا Publish / Deploy.
- لا إنشاء بيانات مشاريع تخرج حقيقية أو fixtures بهويات حقيقية.
- العمل SOURCE-ONLY داخل worktree معزول.

## 14) Git / PR

- Commit: `feat(graduation-projects): integrate portal routes and workspaces`
- Branch: `feat/graduation-projects-portal-integration-01`
- PR إلى `main` بدون دمج.
