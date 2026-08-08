# ACADEMIC-COUNCILS-C9-NOTIFICATIONS-REPORTS-OPERATIONAL-UX-LONGRUN-05

## ملخص التنفيذ

تم تنفيذ طبقة الإشعارات والتقارير ولوحات العمل التشغيلية للمجالس الأكاديمية (C9) كمصدر فقط، دون تطبيق على الإنتاج ودون دمج.

- **الفرع:** `feat/councils-c9-notifications-reports-ux-longrun-01`
- **القاعدة:** `integration/councils-c0-c8-final-longrun-01`
- **الـ PR:** [#303](https://github.com/msorori-mh/saba-uni-portal/pull/303)
- **الـ FINAL_SHA:** `f3543d6e9784006c70eab16cda14bf544ce98568`

## الملفات المعدلة والجديدة

### قاعدة البيانات
- `supabase/migrations/20260808180000_councils_c9_notifications_reporting_01.sql`
  - جدول `academic_council_notifications` مع RLS وtriggers حماية للحقول الثابتة.
  - دوال التوزيع `dispatch_council_notification` و`get_council_notification_recipients` من جانب الخادم.
  - RPCs للإشعارات: `get_my_council_notifications`، `acknowledge_council_notification`.
  - RPCs للتقارير: meetings-by-period، attendance-rate، quorum-history، topic-disposition، agenda-completion، vote-summary، decision-execution-status، overdue-decisions، meeting-duration، archive-status، council-activity.
  - Dashboards: chair، secretary، member-workspace، responsible-decisions.
  - Triggers للأحداث: meeting_scheduled، intake_opened/closed، agenda_ready، session_ready، meeting_archived، topic lifecycle، decision assigned/overdue.

### الخادم / التكامل
- `src/lib/councils-c9.functions.ts` — Server functions للـ RPCs الجديدة.
- `src/lib/reports/catalog/entries.ts` — إدخالات التقرير في كتالوج التقارير.

### واجهة المستخدم
- `src/components/councils/CouncilNotificationBell.tsx`
- `src/components/councils/CouncilChairDashboard.tsx`
- `src/components/councils/CouncilSecretaryDashboard.tsx`
- `src/components/councils/CouncilMemberWorkspace.tsx`
- `src/components/councils/CouncilResponsibleActorView.tsx`
- `src/components/councils/CouncilReportsView.tsx`
- `src/routes/faculty-portal.academic-councils.reports.tsx`
- `src/routes/faculty-portal.academic-councils.tsx` — إضافة جرس الإشعارات ورابط التقارير وقسم `CouncilWorkspacesSection`.

### الاختبارات
- `tests/academic-councils/councils-c9-notifications-reporting.test.ts`
- `tests/academic-councils/postgres-c9-notifications-reporting-verifier.sql`
- `tests/student-requests/tanstack-register-stable-augmentation-01.test.ts` — تحديث SHA بسبب إضافة route جديد.

## نتائج التحقق

| الفحص | النتيجة | التفاصيل |
|---|---|---|
| `bun test tests/academic-councils` | ✅ PASS | 31 اختبارًا، 0 فشل |
| `bun test tests/student-requests` | ✅ PASS | 1066 اختبارًا، 0 فشل |
| `bunx tsc --noEmit` | ✅ PASS | لا أخطاء |
| `bun run build` | ✅ PASS | build ناجح مع تحذيرات deprecated غير مرتبطة |
| `git diff --check` | ✅ PASS | لا أخطاء مسافات؛ تحذير line endings فقط |

## تغطية المتطلبات

- **NOTIFICATIONS:** ✅ إشعارات داخل التطبيق، توزيع من جانب الخادم، read/ack، تصميم outbox-friendly.
- **REPORTS:** ✅ 11 تقريرًا فعليًا من بيانات C0-C8 مع scoping من جانب الخادم.
- **CHAIR_DASHBOARD:** ✅ لوحة رئيس المجلس التشغيلية.
- **SECRETARY_DASHBOARD:** ✅ لوحة أمين السر.
- **MEMBER_UX:** ✅ مساحة العضو.
- **VIEWER_UX:** ✅ وضع القراءة فقط (readOnly + إخفاء responsible actor view).
- **RESPONSIBLE_ACTOR_UX:** ✅ عرض القرارات المكلف بتنفيذها مع تحديث التقدم والإكمال.
- **ARABIC_RTL:** ✅ كل النصوص عربية، `dir="rtl"`، تسميات الحالات العربية.
- **A11Y:** ✅ `aria-label`، `aria-expanded`، `aria-live`، `role="dialog"`، قوائم semantic.
- **AUTH_MATRIX:** ✅ اختبار PG17 يغطي chair/secretary/member/viewer/student/anon/cross-council.
- **ZERO_MUTATION:** ✅ كل denied write يثبت عدم التغيير.

## الافتراضات والملاحظات

- لم يتم تطبيق الـ migration على أي بيئة إنتاج.
- لم يتم إنشاء موظفين/طلاب/بيانات وهمية في الإنتاج.
- جرس الإشعارات يعرض فقط إشعارات المستخدم الحالي بفضل RLS.
- التقارير متاحة للعضو/أمين السر/الرئيس فقط؛ المطلع (viewer) مستبعد من صفحة التقارير.
- أزرار لوحات العمل التي لا تملك RPC خلفها تم تحويلها إلى شارات حالة لتجنب الأزرار المضللة.

## المخاطر

- التغيير في `routeTree.gen.ts` أثر على SHA المثبت في `tests/student-requests/tanstack-register-stable-augmentation-01.test.ts`؛ تم تحديثه.
- RLS على `academic_council_notifications` تعني أن عمليات العدّ العالمية في الاختبارات تحتاج إلى service_role؛ تم حلها في الـ verifier.

## العوائق

- لا توجد عوائق.

## أثر الإنتاج

- **PRODUCTION_WRITES:** 0
- **MIGRATION_APPLIED:** NO
- **MERGE:** NO
- **DEPLOY:** NO

## القرار

**PASS_ACADEMIC_COUNCILS_C9_NOTIFICATIONS_REPORTS_OPERATIONAL_UX_PR_READY**
