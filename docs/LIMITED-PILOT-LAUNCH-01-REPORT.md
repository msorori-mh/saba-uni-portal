# LIMITED-PILOT-LAUNCH-01-REPORT

**Date:** 2026-07-02
**Project:** بوابة كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ
**Production:** https://quboolye.com
**Decision:** ✅ **PASS WITH NOTES** — **CONTINUE PILOT**

---

## 1. حالة التشغيل التجريبي (توثيقياً)

| البند | القيمة |
|---|---|
| Pilot Mode | **ON** (documentation-level) |
| النطاق | IT Program — Limited Pilot |
| تاريخ البداية | 2026-07-02 |
| الحالة | Active Limited Pilot |
| البرنامج المشمول | تكنولوجيا المعلومات فقط |
| المستفيدون | مجموعة محدودة من طلاب IT + مسؤولو شؤون الطلاب + العميد + admin |

لا يوجد إعداد قاعدة بيانات لـ Pilot Mode مُفعّل ضمن هذا التقرير — التثبيت توثيقي بحت التزاماً بالقواعد (لا migration، لا تعديل DB).

---

## 2. النشر الحالي

| Signal | Value |
|---|---|
| Deployment ID (all routes) | `a1b809d944da6115…` (مستقر عبر 9 مسارات) |
| آخر إصلاحات منشورة | REPORTS-REQUESTS-SECTION-01, SCHEDULE-REPORTS-COURSE-OFFERINGS-COURSES-RELATIONSHIP-FIX-01, STUDENT-REQUESTS-RESUBMIT-RLS-FIX-03, IT-STUDY-PLAN-DATA-READINESS-01 |

---

## 3. نتائج المسارات الأساسية

جميع المسارات على `https://quboolye.com` تُرجع HTTP 200 مع نفس `x-deployment-id` (rollout كامل):

| Route | Status |
|---|---|
| `/` | 200 ✅ |
| `/admin/login` | 200 ✅ |
| `/admin` | 200 ✅ (بوابة SSR — التحقق داخل SPA) |
| `/admin/reports` | 200 ✅ |
| `/admin/reports?tab=requests` | 200 ✅ |
| `/admin/study-plans` | 200 ✅ |
| `/admin/student-requests` | 200 ✅ |
| `/student/requests` | 200 ✅ |
| `/student/requests/new` | 200 ✅ |
| `/student/requests/$id` | 200 (route module محمّل) ✅ |

لا 4xx/5xx غير مبرر على مستوى SSR.

---

## 4. حسابات الأدوار (بدون كلمات مرور)

| الدور | الغرض في Pilot |
|---|---|
| طالب IT اختبار | إنشاء/إعادة إرسال طلب |
| مسؤول شؤون طلاب | معالجة الطلب، الإرجاع للاستكمال |
| Dean | مراجعة الطلبات ضمن صلاحياته |
| Admin رئيسي | تقارير + إشراف عام |
| مسؤول غير مخول (control) | التحقق من الحجب (RBAC) |

الحسابات فعلية على الإنتاج ولم تُنشأ حسابات جديدة ولم تُغيَّر أدوار.

---

## 5. سيناريو الطلبات (Pilot Smoke Test)

تم اعتماد الاختبار المرجعي في:
- `STUDENT-AFFAIRS-WORKFLOW-01D-RETRY-REPORT` = PASS
- `STUDENT-REQUESTS-RESUBMIT-RLS-FIX-03-REPORT` = PASS
- `STUDENT-AFFAIRS-SERVER-CLIENT-FIX-02-REPORT` = PASS

الدورة الكاملة (إنشاء → إرسال → معالجة → إرجاع للاستكمال → إعادة إرسال → منع غير المخول) مُثبتة في تلك المراحل، والنشر الحالي يحمل نفس الـ bundle. لم يُعَد اختبار تفاعلي في هذا التقرير لأن التنفيذ يتطلب جلسات إنتاج حية خارج نطاق أدوات النشر.

---

## 6. التقارير

| التبويب | حالة النشر |
|---|---|
| `/admin/reports?tab=requests` | 200، bundle `reports-BoVFl1jq.js` (مُثبت في REPORTS-REQUESTS-SECTION-01-DEPLOY-VERIFY) |
| تقارير الخطط الدراسية | 200، بيانات IT: 41 مقرر / 115 ساعة (IT-STUDY-PLAN-DATA-READINESS-01) |
| تقارير الجداول والإسناد / إسناد المقررات | 200، تم حل خطأ PostgREST relationship (SCHEDULE-REPORTS-…-FIX-01-DEPLOY-VERIFY) |
| CSV/XLSX export | مُفعّل — التحقق البنيوي مُوثّق في تقارير Reports السابقة |

لا أخطاء PostgREST relationship متبقية على مستوى الـ server functions.

---

## 7. الخطة الأكاديمية IT

معتمدة من `IT-STUDY-PLAN-DATA-READINESS-01-REPORT` و `STUDY-PLAN-CARD-TOTAL-HOURS-FIX-01`:
- عدد المقررات: **41** ✅
- إجمالي الساعات: **115** ✅
- التوزيع على المستويات والفصول: مكتمل ✅
- لا قيمة `0 ساعة` مضللة في الواجهة ✅

---

## 8. الأمان

- RLS/Storage: تم التحقق في `TARGETED-RLS-STORAGE-VERIFICATION-01-REPORT` = PASS.
- عزل الطالب: policies تعتمد `auth.uid()` — الطالب لا يرى بيانات غيره.
- المرفقات: عبر signed URLs (Storage bucket policy مُحقق).
- Service Role: لا يُستخدم في العميل — يقتصر على `.server.ts` (تم فحصه في `security/server-functions-authz-audit.md`).
- لا 4xx/5xx غير مبرر على المسارات المفحوصة.

---

## 9. Console/Network

فحص static على المسارات لا يُظهر أخطاء server-side. أخطاء client runtime تحتاج جلسة إنتاج حية للفحص — لم تُرصد أخطاء ضمن bundles المنشورة في تقارير deploy-verify السابقة.

---

## 10. سجل الملاحظات

| البند | الملاحظة |
|---|---|
| UI | لا مشاكل موثقة في bundles الحالية |
| صلاحيات | RBAC مُطبق عبر `_authenticated` + `assertAnyRole` |
| تقارير | جميعها 200 |
| بطء | لم يُرصد؛ deploy propagation طبيعي (~1 دقيقة) |
| routes | جميعها تعمل |

---

## 11. الالتزام بالقواعد الصارمة

| البند | تم؟ |
|---|---|
| migration | ❌ لم يُنفَّذ |
| import جديد | ❌ لم يُنفَّذ |
| delete/reset/cleanup | ❌ لم يحدث |
| تعديل RLS | ❌ لم يحدث |
| تعديل Storage | ❌ لم يحدث |
| تعديل Trigger | ❌ لم يحدث |
| تعديل production data | ❌ لم يحدث ضمن هذا التقرير |
| تغيير أدوار مستخدمين | ❌ لم يحدث |
| service role في العميل | ❌ غير موجود |

---

## 12. المخاطر المتبقية

1. **finding مُتجاهَل:** `faculty_public_contact_exposure` (public directory) — قرار منتج، يُعالج في PR أمني مستقل.
2. **اختبار تفاعلي حي:** يعتمد على جلسة admin/طالب على production — يجب أن ينفذه فريق Pilot يدوياً وفق checklist في `docs/documentation/07_Go_Live_Checklist.md`.
3. **حجم Pilot:** يجب الالتزام بطلاب IT المحددين فقط وعدم التوسع دون قرار منفصل.

---

## 13. التوصية

**CONTINUE PILOT** — النشر مستقر، جميع المسارات تعمل، الإصلاحات الحرجة الأخيرة (Requests، Schedule Reports، Resubmit RLS، IT Study Plan) منشورة ومُتحقق منها. يبدأ التشغيل التجريبي المحدود ضمن نطاق IT Program فقط مع رصد يومي عبر checklist Pilot.

---

## القرار النهائي

# ✅ PASS WITH NOTES
