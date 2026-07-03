# EXPAND-PILOT-READINESS-01-REPORT

**Date:** 2026-07-03
**Project:** بوابة كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ
**Production:** https://quboolye.com
**Mode:** تقييم فقط — لا كود، لا نشر، لا migration، لا DB/RLS/Storage/Trigger، لا تغيير صلاحيات، لا إضافة مستخدمين، لا توسعة فعلية.
**Decision:** ✅ **PASS WITH NOTES**
**Recommendation:** **EXPAND TO MORE IT STUDENTS** (توسعة محدودة داخل نفس برنامج IT فقط)

---

## 1. ملخص حالة التشغيل التجريبي الحالية

- Pilot يعمل ضمن نطاق **برنامج IT فقط** — لم يُوسَّع في أي مرحلة سابقة.
- كل المراحل السابقة أُغلقت بقرار PASS أو PASS WITH NOTES مع CONTINUE PILOT.
- آخر إصلاحات متوسطة (F-06/F-07/F-13) مُنشرة ومُتحقَّق منها على production.
- لا Blockers، لا High findings، لا أخطاء إنتاج مرصودة.

## 2. مؤشرات النشر

| Signal | Value |
|---|---|
| آخر `x-deployment-id` مؤكَّد | `340f90ad24012f46275e3c0a0515e6c69b710fdb57dca4fe01362e3264b089e3` |
| آخر commit مرجعي | نفس النشر الذي روَّج bundles `reports-B5O8GkzK.js` + `styles-CGiMhc5V.css` + `student.requests._id-C4ngjRuU.js` (F-06/F-07/F-13) |
| رولاوت | كامل عبر 10 مسارات SSR |
| SSR status لكل المسارات المفحوصة سابقاً | 200 ✅ |
| bundle rotation بعد الإصلاح | مؤكَّد (`BoVFl1jq` → `B5O8GkzK`) |

> ملاحظة: SHA الـ commit ليست ضمن أدوات المراقبة المتاحة؛ المرجع المعتمد هو `x-deployment-id` أعلاه كما تم تثبيته في `PILOT-MEDIUM-FIX-01-PROMOTION-RECHECK`.

## 3. ملخص الإصلاحات المغلقة

| ID | الوصف | الحالة |
|---|---|---|
| F-06 | رسائل خطأ رفع المرفقات أوضح + `policyHint()` | ✅ Closed — code-split chunk جاهز على CDN |
| F-07 | بانر سبب "الإرجاع للاستكمال" في صفحة تفاصيل الطلب | ✅ Closed — marker مؤكَّد في bundle الطلب |
| F-13 | مؤشر تحميل تقارير + progress bar | ✅ Closed — marker + keyframe مؤكَّدان |

## 4. الملاحظات المتبقية (من تقارير Triage/Feedback)

- **Low ×4**: تحسينات نصية/تنسيقية صغيرة — لا تمنع التوسيع.
- **Enhancement ×5**: تحسينات مستقبلية (تصدير موسّع، فلاتر إضافية، تخصيصات UI) — لا تمنع التوسيع.
- **finding مُتجاهَل**: `faculty_public_contact_exposure` — قرار منتج، خارج نطاق Pilot.
- **Medium متبقٍ من MONITORING**: التحقق التفاعلي الحي (RBAC، دورة الطلبات الكاملة) يعتمد على تنفيذ يدوي من فريق Pilot — الأدوات الآلية لا تنفذه.

## 5. تقييم الجوانب

| الجانب | التقييم | ملاحظات |
|---|---|---|
| 1. الاستقرار التقني | ✅ مستقر | كل SSR probes 200، deployment id ثابت بعد الترقية، لا PostgREST/RLS errors |
| 2. تجربة الطالب | ✅ مقبول | F-06/F-07 مُصلحان؛ سلوك إعادة الإرسال بعد الإرجاع مُثبت (`STUDENT-REQUESTS-RESUBMIT-RLS-FIX-03`) |
| 3. تجربة شؤون الطلاب | ✅ مقبول | Workflow مغلق في `STUDENT-AFFAIRS-WORKFLOW-01D-RETRY` + `SERVER-CLIENT-FIX-02` |
| 4. تجربة العميد/الاعتماد | ✅ مقبول بنيوياً | RBAC مضبوط عبر `_authenticated` + `assertAnyRole`؛ يحتاج تحقق يدوي حي |
| 5. تقارير الطلبات | ✅ مقبول | `REPORTS-REQUESTS-SECTION-01` مغلق + DEPLOY-VERIFY |
| 6. تقارير الخطط والمقررات | ✅ مقبول | `REPORT-STUDY-PLANS-RELATIONSHIP-FIX-01` مغلق |
| 7. تقارير الجداول والإسناد (قراءة) | ✅ مقبول | `SCHEDULE-REPORTS-COURSE-OFFERINGS-COURSES-RELATIONSHIP-FIX-01` مغلق + F-13 progress bar |
| 8. RBAC والصلاحيات | ✅ مقبول | `docs/security/admin-route-access-matrix.md` + `server-functions-authz-audit.md` |
| 9. المرفقات و signed URLs | ✅ مقبول | `TARGETED-RLS-STORAGE-VERIFICATION-01` + `09_Storage_Hardening_Report` |
| 10. Console/Network | ✅ لا أخطاء مرصودة | ما رُصد عبر SSR فقط؛ runtime حي يحتاج جلسة |
| 11. Blockers/High متبقية | ❌ لا يوجد | صفر |
| 12. Low/Enhancement تمنع التوسيع | ❌ لا | لا تُعتبر مانعة |
| 13. مخاطر التوسيع | متوسطة–منخفضة | تفصيل أدناه |
| 14. يحتاج migration؟ | ❌ لا | التوسيع داخل نفس البرنامج/الدور — schema حالياً كافٍ |
| 15. يحتاج DB/RLS/Storage/Trigger؟ | ❌ لا | RLS بالفعل مبنية على `user_roles` + سياسات لكل جدول؛ إضافة طلاب IT جدد لا تتطلب أي تغيير |

## 6. تقييم المخاطر عند التوسيع

**منخفضة:**
- إضافة طلاب IT إضافيين لا تُغيِّر أي schema أو policy — RLS تعمل per-user.
- تخزين المرفقات مضبوط بسياسات per-owner (Storage Hardening Report).

**متوسطة (تحتاج مراقبة):**
- زيادة الحمل على `/admin/reports` و`/admin/student-requests` مع نمو الطلبات — لا يوجد APM آلي؛ الرصد يعتمد على تقارير المستخدمين.
- التحقق التفاعلي الحي (RBAC/دورة الطلبات) لا يزال يدوياً — يجب تنفيذ checklist Pilot اليومي.
- توسيع لبرنامج آخر (غير IT) سيتطلب:
  - جاهزية بيانات الخطة الدراسية للبرنامج المستهدف (لا يوجد الآن — `IT-STUDY-PLAN-DATA-READINESS-01` مغلق لـ IT فقط).
  - جاهزية جداول/إسناد للبرنامج.
  - قد يستدعي imports جديدة (يخرج عن قواعد هذه المرحلة).

**عالية:** لا شيء.

## 7. الخيار الموصى به

**2. EXPAND TO MORE IT STUDENTS**

الأسباب:
- كل الجوانب التقنية والوظيفية داخل IT مستقرة ومُثبتة.
- لا يتطلب أي migration/DB/RLS/Storage/Trigger.
- المخاطر منخفضة ومحصورة.
- Enhancement/Low لا تمنع.
- التوسيع لبرنامج آخر (الخيار 3) سابق لأوانه — يحتاج جاهزية بيانات لبرنامج ثانٍ لم تُنفَّذ بعد.
- الإيقاف (الخيار 4) غير مبرر — لا مانع تقني.
- الاستمرار المحدود دون توسيع (الخيار 1) مقبول أيضاً كخيار محافظ إذا رغب فريق Pilot بجولة مراقبة إضافية قبل توسيع الأعداد.

## 8. أسئلة القرار

| السؤال | الإجابة | السبب |
|---|---|---|
| هل التوسيع يتطلب migration؟ | **لا** | Schema الحالية تغطي المزيد من طلاب IT دون أي تغيير |
| هل التوسيع يتطلب DB/RLS/Storage/Trigger؟ | **لا** | RLS/Storage مبنية per-user؛ إضافة مستخدمين ضمن نفس الدور لا يمس السياسات |
| هل يوجد مانع للتوسيع؟ | **لا** | صفر Blockers، صفر High |

## 9. الالتزام بقواعد المرحلة

| البند | حالة |
|---|---|
| تقييم فقط | ✅ |
| توسّع فعلي | ❌ لم يحدث |
| كود | ❌ لم يُكتب |
| نشر | ❌ لا |
| migration | ❌ لا |
| import | ❌ لا |
| DB / RLS / Storage / Trigger | ❌ لا |
| delete/reset/cleanup | ❌ لا |
| تغيير صلاحيات | ❌ لا |
| إضافة مستخدمين | ❌ لا |
| تعميم على الكلية | ❌ لا |
| تنفيذ Low/Enhancement | ❌ لا |

---

## القرار النهائي

# ✅ PASS WITH NOTES

الجاهزية التقنية والوظيفية تسمح بـ **EXPAND TO MORE IT STUDENTS** ضمن نفس البرنامج، بشرط استمرار checklist Pilot اليدوي للتحقق التفاعلي الحي، وتأجيل التوسيع لبرنامج آخر حتى تُنفَّذ جاهزية بياناته في مرحلة منفصلة.
