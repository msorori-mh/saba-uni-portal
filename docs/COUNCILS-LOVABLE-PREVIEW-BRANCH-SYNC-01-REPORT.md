# COUNCILS-LOVABLE-PREVIEW-BRANCH-SYNC-01 — تقرير تشخيص التزامن

## القرار النهائي
**NO-GO / BLOCKED_BY_LOVABLE_BRANCH_SYNC**

## الفرع/commit الفعلي الذي تفحصه Lovable
- الفرع النشط في sandbox: `edit/edt-99de41e1-4fb1-4a4e-b6dc-4b826a748997` (فرع تحرير مؤقت مشتق من `main`).
- آخر commit: `9f4da2c أُعيد التحقق بعد نقل الفرع`.
- الفروع البعيدة المرئية من داخل بيئة Lovable:
  - `remotes/origin/main`
  - `remotes/origin/lovable-backup-main-*` (نسخ احتياطية آلية لـ `main` فقط)
  - `remotes/secondary/main`
  - `remotes/origin/HEAD -> origin/main`

لا يوجد أي مرجع بعيد لـ `preview/councils-membership-admin-ui-01` ولا لـ `councils/membership-admin-ui-01` (PR #76). فحص:
```
git ls-remote origin 'refs/heads/preview/*' 'refs/heads/councils/*'
git ls-remote secondary | grep -iE 'preview|council'
```
لم يُعِد أي نتائج على أيٍّ من الـ remotes المتاحة.

## هل تم تزامن الفرع المطلوب؟
**لا.** الفرع `preview/councils-membership-admin-ui-01` (commit `702b42f` المتوقع) غير موجود ضمن الـ remotes التي تراها بيئة Lovable.

## هل ظهرت مراجع PR #76؟
**لا** (متسق مع نتائج التحقق السابقتين):
- `src/lib/admin-councils-membership.functions.ts` — غير موجود.
- `linkAcademicToCouncil` — لا نتائج.
- `searchAcademicsForCouncilLink` — لا نتائج.
- `deactivateCouncilMembership` — لا نتائج.
- نص "إدارة عضويات المجلس" — غير موجود في `src/routes/admin/academic-councils.tsx` (الصفحة ما زالت وضع القراءة فقط مع `LockedAction`).

## سبب فشل التزامن
**Lovable مرتبط فقط بالفرع الافتراضي `main`** (نمط branch-per-project). ما يظهر في sandbox هو نتاج `main` + فرع تحرير مؤقت `edit/edt-…`. الأدلة:
1. `origin/HEAD -> origin/main` والفرع الافتراضي في المستودع هو `main`.
2. جميع النسخ الاحتياطية الآلية على شكل `lovable-backup-main-*` — أي أن Lovable يحتفظ فقط بـ `main`.
3. لا يوجد أي `remotes/origin/preview/*` أو `remotes/origin/councils/*` بالرغم من أن الفرع مرفوع على GitHub وفق ما أفاد به المستخدم — إشارة إلى أن Lovable لا يجلب/لا يعرض فروعاً غير الافتراضي.
4. Lovable لا يدعم رسمياً "PR preview" أو "branch preview" لأي فرع؛ ميزة تبديل الفروع (Labs → GitHub Branch Switching) تجريبية ومحدودة وتحتاج تفعيلاً من حساب المستخدم، ولا تفعّل من داخل sandbox.

باختصار: **الفرع المطلوب غير مرئي لبيئة Lovable لأن Lovable مرتبط بفرع `main` فقط، ولا يجلب فروع المعاينة تلقائياً.**

## تأكيدات الحدود
- ✅ لا تعديلات كود في هذه الجلسة.
- ✅ لا migrations / DB / RLS / Storage / Email / Cron.
- ✅ لا seed / import / DELETE.
- ✅ لا استخدام service role.
- ✅ لا merge إلى main ولا deploy.

## التوصية التالية
**BLOCKED_BY_LOVABLE_BRANCH_SYNC.** لرفع الحظر، اختر أحد المسارات التالية (تتم من خارج sandbox):

1. **الخيار الموصى به — تبديل فرع Lovable إلى الفرع المطلوب:**
   - Account Settings → Labs → تفعيل *GitHub Branch Switching*.
   - ثم من Project settings → GitHub → اختيار الفرع `preview/councils-membership-admin-ui-01` كفرع نشط لبيئة Lovable.
   - انتظار مزامنة Lovable إلى commit `702b42f`.
2. **البديل — Merge محكوم إلى `main` عبر PR منفصل خاص بالمعاينة فقط** (خارج نطاق هذه المرحلة، ويتطلب موافقة صريحة جديدة لأنه يمسّ `main`).
3. **بديل مؤقت — Squash الفرع في PR جديد يُدمج إلى `main` خلف feature flag** (يتطلب موافقة جديدة كذلك).

بعد إتمام الخيار (1) وظهور مراجع `linkAcademicToCouncil` / `searchAcademicsForCouncilLink` / `deactivateCouncilMembership` / "إدارة عضويات المجلس" في بيئة Lovable، تصبح المرحلة التالية:

**READY_FOR_MEMBERSHIP_UI_DEPLOY_VERIFY_RERUN.**
