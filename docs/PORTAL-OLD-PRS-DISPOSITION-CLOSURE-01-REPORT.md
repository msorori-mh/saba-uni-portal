# PORTAL-OLD-PRS-DISPOSITION-CLOSURE-01

| الحقل | القيمة |
|---|---|
| البرنامج | `PORTAL-OLD-PRS-DISPOSITION-CLOSURE-01` |
| المستودع | `msorori-mh/saba-uni-portal` |
| المسار المحلي | `C:\projects\saba-uni-portal` |
| التاريخ | 2026-07-21 |
| `origin/main` عند البدء | `809c06c9ebc3be4776110fbf991a460508391b2c` |
| `origin/main` بعد الدمج | `df90f1a8379da4b15c561a87ebc21e3a31e2550e` |
| PR التقييم | [#191](https://github.com/msorori-mh/saba-uni-portal/pull/191) → **MERGED** |
| CI على رأس #191 | Web CI **pass** (run `29847426300`) |

## 1) الهدف والنطاق المنفَّذ

تحديث وتدقيق ودمج PR #191، ثم إغلاق PRs القديمة التي ثبت تجاوزها، **بدون** حذف الفروع وبدون تعديل runtime / migrations apply / deploy.

## 2) إعادة التحقق مقابل main الحالي (وليس `265df127`)

أُعيد فحص التوصيات في `docs/OLD-PRS-DISPOSITION-EVALUATION-01.md` مقابل `809c06c` ثم دُمجت الوثيقة المحدَّثة عبر #191.

| PR | ما نفذه/تجاوزه main | الملف/المصدر البديل | القرار |
|---|---|---|---|
| **#49** | SECURITY-RBAC-05 مدمج؛ فرع الـPR CONFLICTING ونسخته من migration أقدم/مختلفة | `supabase/migrations/20260701120000_security_rbac_hr_officer_people_rls.sql` | **SUPERSEDED** |
| **#70** | إصلاحات workflow actor auth في الكود + migrations تحصين | `src/lib/student-affairs.functions.ts`؛ `20260710150000_…`؛ `20260710180000_…`؛ مسودة Actor Authorization Hardening | **SUPERSEDED_BY_MERGED_REMEDIATION** |
| **#86** | بذرة مجالس الأقسام نُفِّذت كـ migration | `supabase/migrations/20260709120000_department_councils_seed.sql` | **SUPERSEDED** |
| **#98** | أدوار الموظفين الوظيفية موجودة وأحدث عبر #97/#99 | `src/lib/staff-functional-roles.ts`؛ `src/lib/staff-role-types.ts` | **SUPERSEDED** |
| **#118** | Header أُعيد تصميمه (صف ثانٍ + `useIsAuthenticated`)؛ diff غير قابل للتطبيق | `src/components/site/Header.tsx` (نهج مختلف)؛ تعديلات hero في الـPR لم تُدمج كنص | **OBSOLETE** |

**STILL_VALID:** لا يوجد.

## 3) خطوات الإغلاق المنفَّذة

1. `git fetch origin --prune` — تحقّق `origin/main = 809c06c…` عند البدء.
2. تحديث `docs/OLD-PRS-DISPOSITION-EVALUATION-01.md` بالـSHA الحالي ونتائج إعادة التحقق.
3. دمج `origin/main` في فرع `docs/old-prs-disposition-01` + commit `07beecc` + push.
4. انتظار CI → **pass**؛ الحالة **MERGEABLE**.
5. دمج #191 (merge commit `df90f1a…`) — **بدون** حذف فرع التقييم.
6. تعليق توثيقي في كل من #49/#70/#86/#98/#118 يربط الإغلاق بـ#191.
7. إغلاق الخمسة فقط — الفروع الخمسة **ما زالت موجودة** على `origin`.

## 4) حالة PRs بعد الإغلاق

| PR | الحالة النهائية | ملاحظة |
|---|---|---|
| #191 | **MERGED** | وثيقة disposition على main |
| #49 | **CLOSED** (غير مدمج) | SUPERSEDED — الفرع محتفظ به |
| #70 | **CLOSED** (غير مدمج) | SUPERSEDED_BY_MERGED_REMEDIATION — الفرع محتفظ به |
| #86 | **CLOSED** (غير مدمج) | SUPERSEDED — الفرع محتفظ به |
| #98 | **CLOSED** (غير مدمج) | SUPERSEDED — الفرع محتفظ به |
| #118 | **CLOSED** (غير مدمج) | OBSOLETE — الفرع محتفظ به |
| #194 | **OPEN** (لم يُمس) | خارج النطاق — جاهز لمرحلة CI hardening لاحقاً |
| #149 / #155 | **OPEN** (لم يُمسا) | خارج قائمة الإغلاق |

## 5) ما لم يُنفَّذ (التزام)

- لا تعديل Runtime source (عدا وثائق disposition عبر #191).
- لا Migration apply / Deploy / Publish / Production SQL.
- لا إغلاق أي PR خارج القائمة الخمسة + دمج #191.
- لا تنفيذ #194 / D-01 / D-02.
- لا حذف فروع قديمة.

## 6) المهمة التالية المنطقية (خارج هذا التقرير)

`PORTAL` CI hardening عبر حسم **PR #194** (مقترح workflow فقط حالياً — يحتاج صلاحية/`workflow` scope من المالك).

---

## القرار النهائي

**`PASS_OLD_PRS_CLOSED_READY_FOR_CI_HARDENING`**
