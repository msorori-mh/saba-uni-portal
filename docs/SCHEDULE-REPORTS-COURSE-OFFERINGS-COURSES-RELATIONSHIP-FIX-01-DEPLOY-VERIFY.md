# SCHEDULE-REPORTS-COURSE-OFFERINGS-COURSES-RELATIONSHIP-FIX-01 — Deploy Verify

**Date:** 2026-07-02
**Decision:** ✅ **PASS WITH NOTES**

## Summary
Lovable ↔ GitHub main مُتزامنة. تم تنفيذ Publish/Deploy فقط، بدون أي migration / import / DB / RLS / Storage / Trigger / cleanup.

## Pre-publish gate
Security scan: لا توجد findings حرجة (كل الـ scanners رجعت `findings: []`). بعض النتائج stale مقابل آخر commit لكنها لا تحجب النشر.

## Deployment propagation
| Signal | Before | After |
|---|---|---|
| `x-deployment-id` على `/admin/reports` | `4b1b6dd4907f647cce2c935c00035e9d1e88d2ae9b5de44301af73e9e4fc414c` | **`5c42138bbe1d86f9d07b1181181a8744b3f9603daac4b453e1312bccb735d3c0`** ✅ |
| `/admin/reports` HTTP | — | **200** ✅ |
| `/admin/reports?tab=schedules` HTTP | — | **200** ✅ |

Deployment id مستقر عبر 6 probes متتالية على مدى ~2 دقيقة — الرولاوت اكتمل.

## نطاق الإصلاح المنشور
التعديل الوحيد ضمن هذا الـ workstream كان داخل `src/lib/admin-reports.functions.ts` (`loadScheduleBase`) — دالة `createServerFn` تعمل server-side على Cloudflare Worker. الكود الجديد يستبدل PostgREST embed (الذي كان يفشل بسبب غياب FK بين `course_offerings.course_id` و `courses.id`) بجلب منفصل ثم ربط الجداول عبر `Map<id, row>`. الاستهلاك من كل تبويبات تقارير الجداول والإسناد (إسناد المقررات، غير المسند، المجموعات، الجداول، القاعات، عبء المحاضرين، التعارضات) يعتمد نفس الشكل السابق، فلا كسر.

بما أن الدالة تعمل server-side، الشحنة الجديدة تصل مع الـ deployment id الجديد وليس عبر client bundle hash قابل للفحص من curl.

## القواعد
| بند | الحالة |
|---|---|
| migration | **لا** |
| تعديل DB | **لا** |
| import | **لا** |
| delete/reset/cleanup | **لا** |
| تعديل RLS | **لا** |
| تعديل Storage | **لا** |
| تعديل Trigger | **لا** |

## التحقق التفاعلي (يتطلب جلسة admin مصادَق عليها)
الفحوصات التالية تحققت من صحتها بنائياً وعلى Preview (راجع `SCHEDULE-REPORTS-COURSE-OFFERINGS-COURSES-RELATIONSHIP-FIX-01-REPORT.md`)، ولا يمكن إعادة تنفيذها من هنا بدون جلسة admin حية على الإنتاج:

- فتح "تقارير الجداول والإسناد" → تبويب "إسناد المقررات"
- تطبيق الفلاتر: القسم = تكنولوجيا المعلومات، البرنامج = البكالوريوس في تكنولوجيا المعلومات، المستوى = الأول، العام = 2025-2026، الفصل = الثاني
- اختفاء رسالة `Could not find a relationship between 'course_offerings' and 'courses' in the schema cache`
- عرض البيانات أو حالة فارغة مفهومة
- CSV export والطباعة
- بقية تبويبات تقارير الجداول والإسناد

على مستوى النشر: `/admin/reports` و`/admin/reports?tab=schedules` كلاهما 200 بدون أخطاء SSR، والـ server function المُصلَحة هي المنشورة الآن.

## Notes
- التحقق النهائي التفاعلي (تطبيق الفلاتر وتصدير CSV من واجهة الإنتاج) يحتاج جلسة admin حية؛ خارج نطاق أدوات النشر.
- Security scans stale لكن بدون findings — يُستحسن تشغيل scan جديد قبل مشاركة واسعة.

**Final Decision: PASS WITH NOTES.**
