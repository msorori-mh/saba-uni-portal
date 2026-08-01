# PORTAL-GRADUATION-PROJECTS-VISUAL-UX-ACCESSIBILITY-QA-01 — تقرير المراجعة البصرية والوصولية

- المستودع: `msorori-mh/saba-uni-portal`
- الفرع: `review/graduation-projects-ui-visual-qa-01` (من PR #226 / `origin/feat/graduation-projects-portal-integration-01`)
- التاريخ: 2026-07-25
- النطاق المملوك فقط: `src/components/graduation-projects/**`, مسارات مشاريع التخرج, `tests/graduation-projects/**`, هذا التقرير

## القرار

**PASS_GRADUATION_PROJECTS_VISUAL_UX_QA_READY**

## 1. المسارات المراجَعة

| المسار | الحالة |
|---|---|
| `/student/graduation-project` + `/` + `/$projectId` | رُوجعت (قائمة/تحويل تلقائي للمشروع الواحد/مساحة العمل) |
| `/faculty-portal/graduation-projects` + `/` + `/$projectId` | رُوجعت (قائمة المسند + مساحة العمل) |
| `/admin/graduation-projects` + `/` + `/$projectId` | رُوجعت (إنشاء/قوائم/تقارير + مساحة العمل) |

## 2. مصفوفة الأدوار

| المحور | الطالب | الأكاديمي | رئيس القسم/الإدارة |
|---|---|---|---|
| القائمة | مشاريعه فقط (roles تتضمن student) | المسندة بأدوار أكاديمية فقط | ضمن تعيينات DEPT_ROLES فقط |
| دوره في المشروع | شارة أدوار مترجمة (ROLE_LABELS) | كذلك | كذلك |
| الإجراء القانوني | `availableProjectActions(roles, state)` فقط | كذلك | كذلك — لا زر عام |
| التقييمات | محجوبة حتى حالة نتيجة (applyPortalPrivacy + حذف نهائي غير المعتمد) | تقييمه الخاص عبر resolveViewerEvaluation | تقارير تجميعية |
| التخزين | object_key محجوب (privacy) — والآن لا يُعرض إطلاقًا | لا يُعرض إطلاقًا | لا يُعرض إطلاقًا |
| بيانات حساسة | لا user_id/actor_id/payload (privacy) | لا user_id في التقارير بعد الإصلاح | لا departmentId ظاهر بعد الإصلاح |

## 3. حالات العرض (16/16)

loading (gp-loading, role=status)، empty (gp-empty)، runtime unavailable (gp-unavailable، fail-closed بلا mock)، permission denied (gp-permission-denied)، network error (gp-network-error)، project not found (تُعامل كإذن مرفوض برسالة آمنة)، stale (expectedVersion + رسالة الخادم)، active proposal، proposal review (أزرار مراجعة بالصلاحية فقط + سبب إلزامي)، milestones in progress (تسليم/مراجعة/ملاحظات)، discussion requested/scheduled/held (جاهزية + جدولة + نتيجة)، corrections required (شارات + إتمام/قبول)، completed (بلا إجراءات تحويلية للطالب)، archived (قراءة فقط).

## 4. العيوب المكتشفة والإصلاحات

| # | العيب | الإصلاح |
|---|---|---|
| 1 | تقرير التعيينات كان يعرض `supervisor.user_id` خامًا (UUID) | «مشرف {n}» — لا يوجد اسم عرض في العقد (فجوة موثقة) |
| 2 | `departmentId` يظهر نصيًا في وصف التقارير ونموذج الإنشاء | حُذف من النصوص المرئية |
| 3 | قائمة الملفات تعرض `object_key` (مسار تخزين) بعد «الفحص» | لا يُعرض المفتاح إطلاقًا؛ الاسم + حالة الفحص فقط |
| 4 | الأرشيف يعرض `final_file_object_key` | حُذف؛ الاسم + التاريخ العربي فقط |
| 5 | إدخال «معرّف التسليم» نصيًا (UUID يدوي) | قائمة منسدلة «تسليم v{n}» |
| 6 | إدخال «معرّف تعيين عضو اللجنة» نصيًا (UUID يدوي) | قائمة منسدلة «عضو لجنة محتمل {n}» |
| 7 | تواريخ ISO خام في سجل الأحداث وطلبات/مواعيد المناقشة والأرشيف | `formatGpDateTimeAr` (ar-EG) عبر `gp-datetime.ts` الجديد |
| 8 | حجم الملف بالبايت الخام في تقرير الأرشيف | `formatGpFileSizeAr` |
| 9 | حقول بلا labels (تقييم/ملفات/تصحيحات/جدولة) | aria-label على كل حقل + ربط htmlFor في الجدولة |
| 10 | نص التنبيه يوهم بظهور مفتاح الملف لاحقًا | حُدّث: «لا تُعرض مفاتيح التخزين في الواجهة إطلاقاً» |
| 11 | `ProjectReadinessCard` يعرض مفاتيح العوائق خامًا وبلا dir | READINESS_BLOCKER_LABELS + dir="rtl" |
| 12 | `GraduationProjectStateBadge` وجذر صفحة admin index بلا dir="rtl" | أُضيف |
| 13 | قائمة مشاكل التقييم بلا role="alert" | أُضيف مع testid |

## 5. RTL وResponsive

- الجذر `dir="rtl"` في كل مكون ومسار (حراسة اختبار). خصائص منطقية فقط (`ps-5`) — حارس يمنع `ml/mr/pl/pr/left/right` الرقمية.
- الجداول داخل حاوية `overflow-auto` (ui/table) — تمرير أفقي آمن على 360px بلا كسر التخطيط.
- `flex-wrap` في صفوف الأزرار والبطاقات؛ أهداف اللمس عبر أحجام ui/button + `min-h-11` للقوائم المنسدلة الأصلية المضافة.
- شارات الحالة نصية دائمًا (لا اعتماد على اللون وحده).

## 6. Accessibility

- تسلسل عناوين: h1 في التخطيطات فقط، ولا h1 داخل المكونات (حارس).
- role="status"/aria-live للتحميل، role="alert" للأخطاء وعدم التوفر ورفض الصلاحية ومشاكل التقييم.
- labels مربوطة أو aria-label لكل حقل إدخال.
- الأزرار المعطّلة مشروطة بسبب واضح (سبب إلزامي/بصمة غير صالحة/ملخص فارغ).

## 7. الخصوصية (حراس منع رجوع)

اختبارات تفشل عند ظهور: `object_key` أو `storage_bucket/storage_object_path` في أي مكون؛ `{user_id}` أو `{department_id}` معروضًا؛ email/phone؛ UUID في التقارير والنماذج المعروضة؛ استيراد Supabase مباشر؛ تواريخ ISO خام في الأحداث/المناقشات. تقييمات اللجنة للطالب قبل النتيجة محجوبة خادميًا (applyPortalPrivacy) وتُعرض «لا توجد تقييمات ظاهرة.» بلا أزرار.

## 8. Runtime fail-closed

- غياب RPC → `GraduationProjectsUnavailable` برسالة «الخدمة قيد التحديث» ونص «لا تُعرض أي بيانات تجريبية» — لا mock في الإنتاج.
- لا استيراد Supabase داخل المكونات (حارس) — كل القراءات عبر portal.functions.
- لا زر إجراء بلا capability (actions من availableProjectActions فقط).
- admin ليس صلاحية عامة: تصفية DEPT_ROLES + نص «لا يوجد تجاوز عام لدور إداري».

## 9. الاختبارات

- `tests/graduation-projects/graduation-projects-visual-ux-qa-01.test.ts` — 19 اختبارًا (حالات العرض، الخصوصية، إخفاء التقييمات، أزرار الأدوار، قراءة-فقط للحالات النهائية، RTL/البنية، تواريخ عربية).
- `bun test tests/graduation-projects` — **83/83**
- `bun test tests` — **1583/1583** (143 ملفًا)
- `bun install --frozen-lockfile` — نظيف · `bunx tsc --noEmit` — pass · `bunx eslint` على الملفات المعدلة — **0 أخطاء** · `bun run build` — pass · `git diff --check` — نظيف
- لا Playwright/متصفح في البيئة؛ لم يتوقف العمل — استُخدمت عروض static وعقود مصدر (موثق).

## 10. الفجوات Backend المتبقية (fail-closed)

1. **لا اسم عرض للمشرف/عضو اللجنة في عقد التقارير أو التعيينات** — تُعرض «مشرف {n}»/«عضو لجنة محتمل {n}» بدل user_id حتى يوفر العقد `display_name`.
2. **لا أسماء طلاب/أعضاء فريق في عقد التفاصيل** — لا تُعرض قوائم أسماء الفريق نصيًا حاليًا (العدد فقط في الجاهزية).
3. حالة «project not found» تُعرض برسالة إذن مرفوض عامة (عدم تسريب الوجود) — سلوك مقصود.

## 11. تأكيدات

- لم تُعدّل: `src/lib/graduation-projects/rpc.ts`، منطق lifecycle، SQL/migrations، `docs/migration-drafts`، capability probes، التفويض/الأدوار، `routeTree.gen.ts` يدويًا، خدمات B1، `enrollment_certificate`.
- لا Production/Staging، لا Migration apply، لا Deploy/Publish، لا دمج.
- GitHub Actions: لم تُشغَّل محليًا؛ أي فشل Billing عن بُعد يُوثق HOLD_REMOTE_CI_BILLING_NO_JOB_STEPS وليس عيب مصدر.
