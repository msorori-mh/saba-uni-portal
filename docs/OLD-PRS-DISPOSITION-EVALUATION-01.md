# OLD-PRS-DISPOSITION-EVALUATION-01 — تقييم الـ PRs القديمة المفتوحة

**Project:** بوابة كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ
**Repository:** `msorori-mh/saba-uni-portal`
**Base:** `main` @ `265df127` (post-merge wave: #181–#190)
**Scope:** قراءة محتوى كل PR قديم مفتوح ومقارنته بحالة `main` الحالية، وإصدار توصية موثّقة: **SUPERSEDED / STILL_VALID / OBSOLETE**.
**Mode:** تقييم للتوثيق فقط — لا دمج ولا إغلاق فعلي في هذا الـ PR؛ التوصيات تُنفَّذ بقرار المالك.

---

## 1. ملخص القرارات

| PR | الموضوع | التوصية | السبب المختصر |
|----|---------|---------|----------------|
| **#49** | HR officer people RLS | **SUPERSEDED** | نُفِّذ لاحقاً على main عبر migration مدمج |
| **#70** | Student Affairs Workflow 01B — Security+QA (BLOCKED) | **SUPERSEDED_BY_MERGED_REMEDIATION** | كل نتائجه الحرجة (R1/R2/R5/R6) مُعالَجة فعلياً في كود main الحالي؛ R3/R4 عبر migrations تحصين لاحقة |
| **#86** | Department councils seed planning | **SUPERSEDED** | الـ seed نُفِّذ لاحقاً عبر migration مدمج |
| **#98** | Staff functional roles rebuild | **SUPERSEDED** | كل ملفاته موجودة على main بمحتوى مطابق/أحدث (دُمج عبر مسار آخر) |
| **#118** | Public home hero desktop-fit | **OBSOLETE** | بنية Header على main أُعيد تصميمها (صفّا تنقّل) — الـ diff لم يعد قابلاً للتطبيق؛ يُعاد تقييم مشكلة الـ hero من جديد إن تكرّرت |

**لا يوجد أي PR من الخمسة بحالة STILL_VALID.**

---

## 2. PR #49 — HR officer people RLS

- **محتوى الـ PR:** تشديد RLS على جداول الأشخاص/الموظفين لدور `hr_officer`.
- **دليل main:** المجلد `supabase/migrations/` على main يحتوي:
  - `20260701120000_security_rbac_hr_officer_people_rls.sql`
- الموضوع نفسه نُفِّذ ودُمج لاحقاً ضمن موجة تحصين RBAC (2026-07-01).
- **التوصية: SUPERSEDED** — يُغلق مع إشارة إلى migration أعلاه.

---

## 3. PR #70 — STUDENT-AFFAIRS-WORKFLOW-01B Security+QA (قرار BLOCKED)

- **محتوى الـ PR:** تقرير QA للقراءة فقط (ملف `docs/STUDENT-AFFAIRS-WORKFLOW-01B-SECURITY-QA-REPORT.md`) بثماني نتائج R1–R8، وقرار `BLOCKED` دون إصلاحات (حسب تعليمات المهمة).
- **منهجية التحقق:** مقارنة كل نتيجة بالكود الحالي على main في `src/lib/student-affairs.functions.ts` (blob `8194d20a`) وقائمة migrations.

| النتيجة | الخطورة | الحالة على main الحالي | الدليل |
|---------|--------|--------------------------|--------|
| R1 — تفاصيل الطلب متاحة لكل `ADMIN_ROLES` | High | **مُعالَج** | `getStudentServiceRequestDetails` يمر الآن عبر `canAccessRequest` = مالك **أو** admin/system_admin **أو** `roleMatchesCurrentStep` (مطابقة `current_role_key`) — لم يعد الاعتماد على `ADMIN_ROLES` الشاملة |
| R2 — signed URLs لكل الأدوار الإدارية | High | **مُعالَج** | `getStudentRequestAttachmentSignedUrl` يطبّق نفس `canAccessRequest` قبل إنشاء الرابط (300s) |
| R3 — تحديث steps مباشرة عبر RLS | High | **مُعالَج (مسار لاحق)** | `performRequestAction` يكتب عبر **sessionClient** حتى يرى `trg_sr_protect` الـ `auth.uid()` الحقيقي؛ migrations تحصين لاحقة: `20260710150000_student_request_types_rls_submit_bypass_fix.sql`, `20260710180000_student_request_actor_rpc_rls.sql` + أعمال STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING (موثّقة في مصالحة #180) |
| R4 — إدراج events من المتصفح | Medium | **مُعالَج ضمنياً** | الإدراج يتم server-side فقط عبر `supabaseAdmin` داخل server functions؛ ضمن نطاق migrations التحصين نفسها |
| R5 — `complete` من أي خطوة | High | **مُعالَج** | شرط صريح: `complete` مسموح فقط عند `can_complete === true` أو الخطوة الأخيرة (`currentIndex === steps.length - 1`)، ورسالة «إكمال التنفيذ مسموح فقط في الخطوة النهائية» |
| R6 — UI يعرض كل الأزرار | Medium | **مُعالَج** | `getPendingStudentRequestsForRole` يعيد `allowed_actions` محسوبة server-side لكل صف، وتُفرض مجدداً في `performRequestAction` («الإجراء غير مسموح لهذه الخطوة») |
| R7 — لا يوجد رفع مرفقات في workflow الجديد | Medium | **مُعالَج (تصميم أحدث)** | مسار مرفقات B1 الآمن موجود (`extractB1SecureAttachmentIds`, مخطط `attachments` في submit، RPC ذرّي `submit_b1_student_request_atomic`) |
| R8 — مسار تحديث حالة قديم موازٍ | Medium | **موثّق كملاحظة متبقية** | `saveStudentServiceRequestDraft`/legacy paths ما زالت تمر عبر RLS القديم — يُتابع ضمن توحيد الحالات في خارطة الطريق، لا يبرر إبقاء PR التقرير مفتوحاً |

- **التوصية: SUPERSEDED_BY_MERGED_REMEDIATION** — يُغلق. قيمة التقرير أرشيفية فقط؛ إن رغب المالك بحفظه يمكن دمج الملف منفصلاً، لكن لا حاجة عملية له.

---

## 4. PR #86 — Department councils seed planning

- **محتوى الـ PR:** وثيقة تخطيط لبذرة المجالس القسمية (`docs/COUNCILS-DEPARTMENT-COUNCILS-SEED-PLANNING-01-REPORT.md`).
- **دليل main:**
  - الوثيقة نفسها غير موجودة على main.
  - لكن الموضوع نُفِّذ فعلياً: `supabase/migrations/20260709120000_department_councils_seed.sql` موجودة ومدمجة.
- **التوصية: SUPERSEDED** — التخطيط تحوّل إلى تنفيذ مدمج؛ يُغلق.

---

## 5. PR #98 — Staff functional roles rebuild

- **محتوى الـ PR:** إنشاء `src/lib/staff-functional-roles.ts` كمصدر موحّد (10 أدوار معتمدة)، تحويل `staff-role-types.ts` لطبقة توافق، وتحديث `admin-people.functions.ts`, `admin-users.functions.ts`, `staff-management.tsx`, `staff.index.tsx`, `imports/validators.ts`, `imports/templates.ts`.
- **دليل main (مطابقة ملفاً ملفاً):**
  - `src/lib/staff-functional-roles.ts` **موجود** على main بنفس المعمار (`STAFF_FUNCTIONAL_ROLES` 10 أدوار، `LEGACY_STAFF_ROLE_KEYS`, `staffFunctionalRoleToAppRole`, `resolveStaffRoleTypeInput`, خيارات create/edit/filter).
  - `src/lib/staff-role-types.ts` على main **هو بالضبط** طبقة التوافق من PR #98 (`@deprecated … re-export from staff-functional-roles`) مع إضافة لاحقة (`staffFunctionalRoleDisplayLabel` re-export) — أي نسخة **أحدث** من نسخة الـ PR.
- **التوصية: SUPERSEDED** — دُمج عبر مسار آخر ومحتوى main يتطابق أو يتقدّم عليه؛ يُغلق.

---

## 6. PR #118 — Public home hero desktop-fit

- **محتوى الـ PR:** تصغير الـ header (`py-1→py-0.5`، شعار `h-14/lg:h-16→h-12/lg:h-14`، nav `2xl:flex→xl:flex`، أزرار البوابات `lg:flex→2xl:flex`) وملاءمة الـ hero (`min-h-[calc(100vh-14rem)]→min-h-[clamp(34rem,calc(100svh-10rem),42rem)]`, شعار أصغر، clamp typography) — UI فقط.
- **دليل main:**
  - `src/routes/index.tsx` على main ما زال `min-h-[calc(100vh-14rem)]` وشعار `h-36 md:h-40` — تعديلات الـ hero **لم تُطبَّق**.
  - لكن `src/components/site/Header.tsx` على main **أُعيد تصميمه** منذ قاعدة الـ PR: يوجد الآن صف تنقّل ثانٍ (`hidden lg:block 2xl:hidden`) + hook المصادقة `useIsAuthenticated` الذي يخفي أزرار البوابات بعد الدخول — أي أن المشكلة التي عالجها الـ PR في الـ header حُلّت بنهج مختلف.
- **الحكم:** الـ diff لم يعد قابلاً للتطبيق على البنية الحالية (تعارض تصميمي، ليس مجرد rebase). مشكلة ارتفاع الـ hero على الشاشات المكتبية — إن كانت ما زالت قابلة للإعادة — تحتاج PR جديداً ضد main الحالي.
- **التوصية: OBSOLETE** — يُغلق، مع فتح issue جديد فقط إذا أُعيد إنتاج مشكلة الـ desktop-fit على النسخة الحالية.

---

## 7. الخلاصة التنفيذية

- **تُغلق كـ SUPERSEDED:** #49، #86، #98.
- **يُغلق كـ SUPERSEDED_BY_MERGED_REMEDIATION:** #70 (مع توثيق R8 كملاحظة متابعة في خارطة الطريق).
- **يُغلق كـ OBSOLETE:** #118 (مع شرط إعادة الإنتاج قبل أي عمل جديد على الـ hero).
- بعد الإغلاق الفعلي تصبح قائمة الـ PRs المفتوحة نظيفة وتقتصر على خط الإنتاج الحالي.
