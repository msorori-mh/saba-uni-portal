# OLD-PRS-DISPOSITION-EVALUATION-01 — تقييم الـ PRs القديمة المفتوحة

**Project:** بوابة كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ
**Repository:** `msorori-mh/saba-uni-portal`
**Base (إعادة تحقق):** `main` @ `809c06c9ebc3be4776110fbf991a460508391b2c` (2026-07-21)
**Base (تقييم أصلي في #191):** `main` @ `265df127` — *مُستبدَل؛ لا يُعتمد عليه بعد إعادة التحقق*
**برنامج الإغلاق:** `PORTAL-OLD-PRS-DISPOSITION-CLOSURE-01`
**Scope:** قراءة محتوى كل PR قديم مفتوح ومقارنته بحالة `origin/main` الحالية، وإصدار توصية موثّقة: **SUPERSEDED / SUPERSEDED_BY_MERGED_REMEDIATION / STILL_VALID / OBSOLETE**.
**Mode:** توثيق + إغلاق فعلي عبر `PORTAL-OLD-PRS-DISPOSITION-CLOSURE-01` بعد ثبوت عدم وجود `STILL_VALID`.

---

## 1. ملخص القرارات (معاد التحقق مقابل `809c06c`)

| PR | الموضوع | التوصية | السبب المختصر |
|----|---------|---------|----------------|
| **#49** | HR officer people RLS | **SUPERSEDED** | نفس مسار migration موجود على main بنسخة Migration-Review أحدث من فرع الـPR |
| **#70** | Student Affairs Workflow 01B — Security+QA (BLOCKED) | **SUPERSEDED_BY_MERGED_REMEDIATION** | R1/R2/R5/R6 مُعالَجة في `student-affairs.functions.ts`؛ R3/R4 عبر migrations التحصين |
| **#86** | Department councils seed planning | **SUPERSEDED** | `20260709120000_department_councils_seed.sql` مدمج على main |
| **#98** | Staff functional roles rebuild | **SUPERSEDED** | `staff-functional-roles.ts` + طبقة توافق `staff-role-types.ts` على main (أحدث عبر #97/#99) |
| **#118** | Public home hero desktop-fit | **OBSOLETE** | Header أُعيد تصميمه (صف تنقّل ثانٍ + `useIsAuthenticated`)؛ diff غير قابل للتطبيق |

**لا يوجد أي PR من الخمسة بحالة STILL_VALID** — بعد إعادة التحقق مقابل `809c06c`.

---

## 2. PR #49 — HR officer people RLS

- **محتوى الـ PR:** تشديد RLS على جداول الأشخاص/الموظفين لدور `hr_officer` + تعديلات `admin-people`/`admin-users`/`types`.
- **دليل main @ `809c06c`:**
  - `supabase/migrations/20260701120000_security_rbac_hr_officer_people_rls.sql` **موجود**.
  - blob على main ≠ blob على فرع `security/rbac-hr-officer-people-rls` — نسخة main تستخدم نمط `ALTER POLICY` / `CREATE POLICY` المتوافق مع Migration Review، وهي النسخة المعتمدة.
  - حالة الـPR: **CONFLICTING** مع main — الدمج سيعيد إدخال نسخة أقدم/مختلفة من نفس الملف.
- **ما الذي تجاوزه main:** تنفيذ SECURITY-RBAC-05 عبر migration مدمج لاحقاً (مسار منفصل عن إبقاء #49 مفتوحاً).
- **التوصية: SUPERSEDED** — يُغلق مع إشارة إلى migration أعلاه. لا تُدمج نسخة الفرع.

---

## 3. PR #70 — STUDENT-AFFAIRS-WORKFLOW-01B Security+QA (قرار BLOCKED)

- **محتوى الـ PR:** تقرير QA للقراءة فقط (`docs/STUDENT-AFFAIRS-WORKFLOW-01B-SECURITY-QA-REPORT.md`) بثماني نتائج R1–R8، وقرار `BLOCKED` دون إصلاحات.
- **إعادة التحقق على main @ `809c06c` في `src/lib/student-affairs.functions.ts`:**

| النتيجة | الخطورة | الحالة على main الحالي | الدليل |
|---------|--------|--------------------------|--------|
| R1 — تفاصيل الطلب متاحة لكل `ADMIN_ROLES` | High | **مُعالَج** | `canAccessRequest` = مالك **أو** admin/system_admin **أو** `roleMatchesCurrentStep` (`current_role_key`) |
| R2 — signed URLs لكل الأدوار الإدارية | High | **مُعالَج** | `getStudentRequestAttachmentSignedUrl` يطبّق `canAccessRequest` قبل إنشاء الرابط |
| R3 — تحديث steps مباشرة عبر RLS | High | **مُعالَج (مسار لاحق)** | `20260710150000_student_request_types_rls_submit_bypass_fix.sql`, `20260710180000_student_request_actor_rpc_rls.sql` + مسودة `docs/migration-drafts/STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql` |
| R4 — إدراج events من المتصفح | Medium | **مُعالَج ضمنياً** | الإدراج server-side عبر server functions ضمن نطاق التحصين |
| R5 — `complete` من أي خطوة | High | **مُعالَج** | `complete` فقط عند `can_complete === true` أو الخطوة الأخيرة؛ رسالة «إكمال التنفيذ مسموح فقط في الخطوة النهائية» |
| R6 — UI يعرض كل الأزرار | Medium | **مُعالَج** | `allowed_actions` محسوبة server-side وتُفرض في `performRequestAction` |
| R7 — لا يوجد رفع مرفقات في workflow الجديد | Medium | **مُعالَج (تصميم أحدث)** | مسار مرفقات B1 الآمن / RPC ذرّي لاحق |
| R8 — مسار تحديث حالة قديم موازٍ | Medium | **موثّق كملاحظة متبقية** | لا يبرر إبقاء PR التقرير مفتوحاً |

- **التوصية: SUPERSEDED_BY_MERGED_REMEDIATION** — يُغلق. قيمة التقرير أرشيفية فقط.

---

## 4. PR #86 — Department councils seed planning

- **محتوى الـ PR:** وثيقة تخطيط (`docs/COUNCILS-DEPARTMENT-COUNCILS-SEED-PLANNING-01-REPORT.md`).
- **دليل main @ `809c06c`:**
  - وثيقة التخطيط غير موجودة على main.
  - التنفيذ الفعلي مدمج: `supabase/migrations/20260709120000_department_councils_seed.sql` (commit `a90831f` — COUNCILS-DEPARTMENT-COUNCILS-SEED-PREP-01).
- **التوصية: SUPERSEDED** — التخطيط تحوّل إلى تنفيذ مدمج؛ يُغلق.

---

## 5. PR #98 — Staff functional roles rebuild

- **محتوى الـ PR:** `staff-functional-roles.ts` كمصدر موحّد + طبقة توافق `staff-role-types.ts` + تحديثات إدارة الموظفين/الاستيراد.
- **دليل main @ `809c06c`:**
  - `src/lib/staff-functional-roles.ts` موجود (`STAFF_FUNCTIONAL_ROLES`، mappings، خيارات create/edit/filter).
  - `src/lib/staff-role-types.ts` طبقة توافق `@deprecated` مع re-exports (+ `staffFunctionalRoleDisplayLabel`) — أحدث من فرع الـPR عبر #97/#99.
  - حالة الـPR: **CONFLICTING**؛ الملفات الجوهرية موجودة أصلاً على main.
- **التوصية: SUPERSEDED** — يُغلق.

---

## 6. PR #118 — Public home hero desktop-fit

- **محتوى الـ PR:** تصغير header وملاءمة ارتفاع الـhero — UI فقط.
- **دليل main @ `809c06c`:**
  - `src/routes/index.tsx` ما زال `min-h-[calc(100vh-14rem)]` — تعديلات الـhero **لم تُطبَّق** كنص.
  - `src/components/site/Header.tsx` أُعيد تصميمه: صف تنقّل ثانٍ (`hidden lg:block 2xl:hidden`) + `useIsAuthenticated` لإخفاء أزرار البوابات بعد الدخول.
  - حالة الـPR: **CONFLICTING** — الـdiff غير قابل للتطبيق على البنية الحالية.
- **التوصية: OBSOLETE** — يُغلق. أي عودة لمشكلة desktop-fit تتطلب PR جديداً ضد main الحالي بعد إعادة الإنتاج.

---

## 7. الخلاصة التنفيذية

- **تُغلق كـ SUPERSEDED:** #49، #86، #98.
- **يُغلق كـ SUPERSEDED_BY_MERGED_REMEDIATION:** #70 (R8 ملاحظة متابعة فقط).
- **يُغلق كـ OBSOLETE:** #118.
- **لا STILL_VALID** → الإغلاق الفعلي مسموح ضمن `PORTAL-OLD-PRS-DISPOSITION-CLOSURE-01`.
- **لا تُحذف الفروع** في مرحلة الإغلاق هذه.
