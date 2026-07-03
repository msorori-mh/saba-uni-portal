# COUNCILS-READ-ONLY-PILOT-01 — تقرير التجربة قراءة فقط

**التاريخ:** 2026-07-03
**النطاق:** تشغيل تجربة قراءة فقط على `/admin/academic-councils` بعد النشر.
**المرحلة السابقة:** `COUNCILS-MVP-UI-INTEGRATION-DEPLOY-VERIFY-01` = PASS / READY FOR READ-ONLY PILOT.

---

## 1. الأدوار المُختبَرة

| الدور | مسموح؟ | النتيجة |
|---|---|---|
| `system_admin` | ✅ | يصل إلى `/admin/academic-councils`، يقرأ الملخص، يرى empty states. |
| `admin` | ✅ | كذلك. |
| `dean` | ✅ | كذلك. |
| مستخدم authenticated بدون أحد الأدوار الثلاثة | ❌ | يُحجب على مستوى `AdminShell` قبل تنفيذ الاستعلام، ولو مرّ فإن `assertAnyRole` داخل `getCouncilsSummary` يرفض. |
| `student` | ❌ | لا يملك الدور، ولا يصل إلى `/admin/*` أصلاً. |
| Anon (غير مسجَّل) | ❌ | `_authenticated` gate يعيد التوجيه إلى `/auth`؛ لا bearer → `requireSupabaseAuth` يرفض. |

---

## 2. نتائج `/admin/academic-councils`

- تحميل الصفحة بنجاح ضمن `AdminShell` باتجاه RTL.
- شارة **«قراءة فقط»** ظاهرة في الترويسة.
- تنبيه أصفر: «تم تفعيل قراءة بيانات المجالس … جميع عمليات الإنشاء والتعديل والإصدار وإرسال التنبيهات لا تزال معطّلة».
- استعلام `getCouncilsSummary` يعود بحمولة `CouncilsSummary` صحيحة (status 200).

### 2.1 Empty States (تحقق حي من DB)
تم تشغيل `SELECT count(*)` على الجداول السبعة:

| الجدول | العدد |
|---|---|
| `academic_councils` | 0 |
| `academic_council_members` | 0 |
| `academic_council_meetings` | 0 |
| `academic_council_topics` | 0 |
| `academic_council_agenda_items` | 0 |
| `academic_council_minutes` | 0 |
| `academic_council_decisions` | 0 |

الواجهة تعكس هذا مباشرة:
- KPIs الأربعة = 0.
- مجلس الكلية: «لا يوجد مجلس كلية مفعّل حالياً.»
- مجالس الأقسام: «لا توجد مجالس أقسام مفعّلة حالياً.»
- الاجتماعات القادمة: «لا توجد اجتماعات مجدولة حالياً.»
- جدول الأعمال: 4 مراحل، كلها = 0.
- المحاضر والقرارات / المتابعة / الأرشيف / التقارير: empty states نصية واضحة بدون أخطاء.

---

## 3. الأزرار الحساسة — كلها `disabled`

| الإجراء | الحالة |
|---|---|
| إنشاء مجلس | ⛔ Locked (لا يوجد زر فعّال أصلاً في هذه المرحلة) |
| إضافة عضو | ⛔ Locked |
| إنشاء اجتماع | ⛔ `LockedAction` — `disabled` |
| رفع موضوع جديد | ⛔ `LockedAction` — `disabled` |
| اعتماد جدول أعمال | ⛔ `LockedAction` — `disabled` |
| إصدار قرار | ⛔ `LockedAction` — `disabled` |
| إرسال تنبيه | ⛔ `LockedAction` — `disabled` |

لا نموذج إدخال مفتوح، ولا `onSubmit` فعّال، ولا استدعاء `INSERT/UPDATE/DELETE` من الواجهة.

---

## 4. Console / Network

| الفحص | النتيجة |
|---|---|
| أخطاء Console حرجة على المسار | لا يوجد. |
| أخطاء RLS مرئية للمستخدم | لا يوجد (الاستعلامات تمر عبر server fn مفوَّض). |
| Network 4xx/5xx على `getCouncilsSummary` | لا يوجد — 200 OK. |
| طلبات مباشرة إلى PostgREST من المتصفح لجداول المجالس | لا يوجد. |

---

## 5. تحقق عدم التأثير

| المسار | الحالة |
|---|---|
| `/admin` | ✅ سليم. |
| `/admin/reports` | ✅ سليم. |
| `/admin/student-requests` | ✅ سليم. |
| `/admin/study-plans` | ✅ سليم. |
| `/student/requests` | ✅ سليم. |
| `/student/requests/new` | ✅ سليم. |

- لم تُضَف أي صفوف إلى جداول المجالس (كلها 0).
- لا Storage، لا Email، لا Cron، لا migration جديد، لا Trigger.
- لا service role في bundle المتصفح.
- لم يُفتَح أي دور جديد ولم يوسَّع Pilot.

---

## 6. المخاطر

- **Blocker:** 0
- **High:** 0
- **Medium:** 0
- **Low:** 0

ملاحظة معلوماتية فقط: لا يمكن اختبار سيناريوهات محتوى فعلي (اجتماعات/قرارات) قبل إدخال بيانات مؤسسية مُعتمَدة — وهو مؤجَّل لمرحلة تخطيط الإدخال.

---

## 7. الخلاصة

- الواجهة سليمة.
- الصلاحيات سليمة (`system_admin` / `admin` / `dean` فقط).
- RLS سليم؛ لا وصول للطلاب أو anon.
- Empty states واضحة ومطابقة لحالة DB.
- كل أزرار العمليات الحساسة معطّلة.
- المسارات الأخرى لم تتأثر.
- لا كتابة، لا بيانات جديدة، لا تغييرات بنيوية.

### التوصية
**READY FOR ADMIN-SEED-PLANNING**

### القرار النهائي
**PASS**
