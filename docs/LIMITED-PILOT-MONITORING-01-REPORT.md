# LIMITED-PILOT-MONITORING-01-REPORT

**Date:** 2026-07-03
**Project:** بوابة كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ
**Production:** https://quboolye.com
**Mode:** Monitoring only — no code, no deploy, no DB/RLS/Storage/Trigger changes.
**Decision:** ✅ **PASS WITH NOTES**
**Recommendation:** **CONTINUE PILOT**

---

## 1. نطاق المراقبة

- برنامج IT فقط.
- طلبات شؤون الطلاب (إنشاء / إرسال / إرجاع للاستكمال / إعادة إرسال).
- تقارير الطلبات.
- تقارير الخطط والمقررات.
- تقارير الجداول والإسناد (قراءة فقط).
- الأدوار: الطالب، شؤون الطلاب، Dean، Admin، غير المخول (control).

---

## 2. حالة النشر

| Signal | Value |
|---|---|
| Deployment ID (كل المسارات) | `a1b809d944da6115…` مستقر ✅ |
| Rollout | كامل عبر 10 مسارات ✅ |
| نشر جديد خلال المراقبة | **لا** (المراقبة فقط) |

---

## 3. نتائج فحص المسارات (SSR probes)

| Route | Status | Deployment |
|---|---|---|
| `/` | 200 ✅ | a1b809d9… |
| `/admin/login` | 200 ✅ | a1b809d9… |
| `/admin` | 200 ✅ | a1b809d9… |
| `/admin/reports` | 200 ✅ | a1b809d9… |
| `/admin/reports?tab=requests` | 200 ✅ | a1b809d9… |
| `/admin/reports?tab=schedules` | 200 ✅ | a1b809d9… |
| `/admin/study-plans` | 200 ✅ | a1b809d9… |
| `/admin/student-requests` | 200 ✅ | a1b809d9… |
| `/student/requests` | 200 ✅ | a1b809d9… |
| `/student/requests/new` | 200 ✅ | a1b809d9… |

**لا 4xx/5xx غير مبرر على مستوى SSR.**

---

## 4. الملاحظات المصنّفة

### Blocker
لا يوجد.

### High
لا يوجد.

### Medium
1. **التحقق التفاعلي الحي غير مؤتمت** — دورة الطلبات الكاملة (إنشاء → إرسال → إرجاع → إعادة إرسال → منع غير المخول) وRBAC الفعلي (student/staff/dean/unauthorized) تتطلب جلسات production حية. أدوات المراقبة الحالية لا تنفذ ذلك تلقائياً. التغطية البنيوية مثبتة في تقارير سابقة (`STUDENT-AFFAIRS-WORKFLOW-01D-RETRY`, `STUDENT-REQUESTS-RESUBMIT-RLS-FIX-03`, `STUDENT-AFFAIRS-SERVER-CLIENT-FIX-02`) لكن يجب أن ينفذها فريق Pilot يدوياً وفق `docs/documentation/07_Go_Live_Checklist.md`.

### Low
1. **finding مُتجاهَل باقٍ** — `faculty_public_contact_exposure` (public directory). قرار منتج، خارج نطاق Pilot، يُعالج في PR أمني مستقل.
2. **قياس زمن الاستجابة الفعلي داخل التقارير** لا يتم إلا بجلسة admin؛ لم تُرصد بطء على SSR للـ 10 مسارات المفحوصة.

---

## 5. أخطاء مرصودة

| النوع | الحالة |
|---|---|
| Console errors | لم يُرصد شيء عبر SSR probes (Console يتطلب جلسة حية) |
| Network 4xx/5xx | لا شيء غير مبرر |
| PostgREST relationship | **لا** — إصلاح `SCHEDULE-REPORTS-COURSE-OFFERINGS-COURSES-RELATIONSHIP-FIX-01` مُنشر ومستقر |
| RLS unexpected errors | لا شيء مرصود |
| Signed URLs failures | لا شيء مرصود |
| Redirect loops | لا شيء (كل المسارات ترجع 200 مباشرة) |
| صفحات بيضاء | لا شيء على المسارات المفحوصة |
| بطء واضح في التقارير | لم يُرصد على مستوى SSR |

---

## 6. دورة طلبات شؤون الطلاب

الحالة البنيوية (من bundles المنشورة):
- إنشاء طلب: `/student/requests/new` = 200 ✅
- عرض قائمة الطلبات: `/student/requests` = 200 ✅
- تفاصيل الطلب: route module `/student/requests/$id` محمّل ✅
- لوحة معالجة شؤون الطلاب: `/admin/student-requests` = 200 ✅
- إعادة إرسال بعد الإرجاع: RLS مُصلح في `STUDENT-REQUESTS-RESUBMIT-RLS-FIX-03`

الفحص التفاعلي الحي: **مطلوب يدوياً من فريق Pilot** (Medium note أعلاه).

---

## 7. RBAC

- `_authenticated` layout + `assertAnyRole` مُطبقان — مثبت في `docs/security/admin-route-access-matrix.md` و`docs/security/server-functions-authz-audit.md`.
- التحقق الحي (student/staff/dean/unauthorized) خارج نطاق أدوات المراقبة الآلية.

---

## 8. الالتزام بقواعد المرحلة

| البند | تم؟ |
|---|---|
| كود | ❌ لم يُكتب |
| نشر جديد | ❌ لم يحدث |
| migration | ❌ لا |
| import | ❌ لا |
| تعديل DB | ❌ لا |
| تعديل RLS | ❌ لا |
| تعديل Storage | ❌ لا |
| تعديل Trigger | ❌ لا |
| delete/reset/cleanup | ❌ لا |
| توسيع نطاق Pilot | ❌ لا |
| تعديل production data | ❌ لا |

---

## 9. المخاطر المتبقية

1. اعتماد على تنفيذ يدوي من فريق Pilot للسيناريوهات التفاعلية (Medium).
2. `faculty_public_contact_exposure` باقٍ كقرار منتج (Low).
3. عدم وجود مراقبة runtime آلية (APM/error tracking) يجعل رصد أخطاء العميل معتمداً على تقارير المستخدمين خلال Pilot.

---

## 10. التوصية

**CONTINUE PILOT** — الإنتاج مستقر على `a1b809d944da6115…`، كل المسارات ترجع 200، لا أخطاء PostgREST/RLS/SSR مرصودة، ولا Blockers أو High findings. المتابعة تعتمد على checklist Pilot اليومي للتحقق التفاعلي.

---

## القرار النهائي

# ✅ PASS WITH NOTES
