# COUNCILS-AGENDA-UI-01 — تقرير

**التاريخ:** 2026-07-06  
**القرار:** **PASS**  
**التوصية التالية:** **READY_FOR_COUNCILS_AGENDA_UI_PR**

---

## ملخص

أُضيفت واجهات إدارة وعرض جدول أعمال اجتماعات المجالس في لوحة الإدارة وبوابة عضو هيئة التدريس، مع الاعتماد على دوال `COUNCILS-AGENDA-FUNCTIONS-01` دون تعديل server functions أو schema.

> **تنبيه:** smoke اختبار الاجتماعات السابق كان NO-GO لغياب حسابات دخول فقط. هذه المرحلة **لا تُعدّ تحققاً إنتاجياً نهائياً** — يلزم `COUNCILS-AGENDA-MANUAL-SMOKE-01` بحسابات فعلية لاحقاً.

---

## الملفات المعدّلة

| الملف | التغيير |
|-------|---------|
| `src/routes/admin/academic-councils.tsx` | `CouncilAgendaPanel` — محرر أجندة كامل للأدمن |
| `src/routes/faculty-portal.academic-councils.tsx` | `MeetingAgendaExpandable` + `ChairAgendaEditorSection` |

**لم يُمس:** migrations، DB/RLS، server functions، routes، Storage.

---

## 1. لوحة الإدارة — `/admin/academic-councils`

### العرض

- قسم **«جدول الأعمال»** يعتمد على المجلس المحدد.
- يحتفظ ببطاقات KPI لمراحل الموضوعات في الأعلى.
- **اختيار اجتماع** من قائمة اجتماعات المجلس (`getCouncilMeetingsForAdmin`).
- عند اختيار اجتماع:
  - بنود الأجندة عبر `getAgendaItemsForMeeting`.
  - موضوعات متاحة عبر `getAvailableTopicsForAgenda`.

### لكل بند يُعرض

- `order_index`، العنوان، الموضوع المرتبط (إن وُجد)، الملاحظات، `is_approved`، تاريخ الإنشاء/التحديث.

### الإجراءات

| الإجراء | الدالة | ملاحظة |
|---------|--------|--------|
| إضافة موضوع | `addTopicToAgenda` | زر «إضافة إلى جدول الأعمال» |
| بند يدوي | `addManualAgendaItem` | عنوان + ملاحظات + ترتيب اختياري |
| تعديل بند | `updateAgendaItem` | حوار: title, notes, order, is_approved |
| ترتيب | `reorderAgendaItems` | أزرار أعلى/أسفل |
| اعتماد | `finalizeMeetingAgenda` | زر «اعتماد جدول الأعمال» — للأدمن |

### منع الحذف

- لا أزرار حذف في الواجهة.
- لا استدعاء `removeAgendaItem`.

### مراجعة الموضوعات

- **لم تُضف** واجهة `reviewCouncilTopic` في الإدمن — لا توجد دالة قائمة موضوعات للمراجعة في admin functions؛ إضافتها كانت ستتطلب توسيع API. الموضوعات المتاحة للإضافة هي فقط `accepted_for_agenda` عبر `getAvailableTopicsForAgenda`.

---

## 2. بوابة عضو هيئة التدريس — `/faculty-portal/academic-councils`

### عرض للأعضاء (member / viewer / الجميع)

- **`MeetingAgendaExpandable`** داخل بطاقة كل اجتماع — قابل للطي.
- يستخدم `getAgendaItemsForMeeting` (faculty).
- قراءة فقط: عرض البنود مع الترتيب والاعتماد والموضوع المرتبط.

### رئيس المجلس (chair)

- قسم **`ChairAgendaEditorSection`** عند وجود عضوية `chair` أو `secretary`.
- للـ **chair**: محرر كامل + زر **«اعتماد جدول الأعمال»** (`finalizeMeetingAgenda`).
- الاجتماعات المؤهلة: قادمة فقط، ضمن `council_id` للمجالس التي يملك عليها صلاحية كتابة.

### أمين السر (secretary)

- نفس المحرر عند `role === 'secretary'`.
- يمكنه إضافة/ترتيب/تعديل البنود.
- **لا يظهر** زر اعتماد جدول الأعمال (`canFinalize` فقط لـ `chair`).

### member / viewer

- عرض جدول الأعمال في بطاقة الاجتماع فقط.
- لا محرر، لا إضافة، لا تعديل، لا اعتماد.

---

## 3. تمييز الصلاحيات في UI

| الدور | العرض | إعداد/ترتيب | اعتماد `agenda_ready` |
|-------|-------|-------------|------------------------|
| admin | ✅ عبر `CouncilAgendaPanel` | ✅ | ✅ |
| chair | ✅ + محرر | ✅ مجلسه | ✅ |
| secretary | ✅ + محرر | ✅ مجلسه | ❌ مخفي |
| member | ✅ قراءة | ❌ | ❌ |
| viewer | ✅ قراءة | ❌ | ❌ |

الحماية النهائية تبقى على RLS + server functions.

---

## 4. رسائل المستخدم

رسائل toast عربية عند النجاح/الفشل، مع `mapAgendaUiError` لإخفاء الأخطاء التقنية الخام، بما فيها:

- تمت إضافة الموضوع إلى جدول الأعمال.
- تمت إضافة البند / تم تحديث البند.
- تم حفظ ترتيب جدول الأعمال.
- تم اعتماد جدول الأعمال.
- لا تملك صلاحية إدارة جدول أعمال هذا المجلس.
- لا تملك صلاحية اعتماد جدول الأعمال.
- تعذر تحميل جدول الأعمال / الموضوعات المتاحة.

---

## 5. المحافظة على الموجود

- إدارة العضويات — ✅
- قسم الاجتماعات وجدولة chair — ✅
- عرض المجالس والأرشيف — ✅
- تقديم الموضوعات والمرفقات — ✅
- صلاحيات viewer — ✅
- دوال الاجتماعات — ✅

---

## 6. نتائج build / typecheck

| الأمر | النتيجة |
|-------|---------|
| `npm run build` | ✅ exit 0 |
| `npx tsc --noEmit` | ✅ exit 0 |

---

## 7. تأكيد النطاق

| العنصر | الحالة |
|--------|--------|
| migrations | ❌ |
| DB/RLS changes | ❌ |
| server function changes | ❌ |
| route جديد | ❌ |
| service role | ❌ |
| DELETE | ❌ |
| removeAgendaItem | ❌ |
| seed | ❌ |
| data writes أثناء التنفيذ | ❌ |

---

## 8. ملاحظات

- N-01: مراجعة الموضوعات (`reviewCouncilTopic`) **غير مدمجة** في UI — يحتاج مرحلة `COUNCILS-TOPICS-REVIEW-ADMIN-UI` أو دالة قائمة موضوعات للأدمن.
- N-02: `added_to_agenda` تُعرض في تسميات الموضوعات كحالة مشتقة من `agenda_order` الموجود مسبقاً — لم يُستخدم كـ enum في الكتابة.
- N-03: smoke الاجتماعات والأجندة يحتاج إعادة بحسابات admin + chair + secretary + member.
- N-04: اعتماد الأجندة يعطّل الزر عند `meeting.status === agenda_ready` في UI.

---

## المرحلة التالية

**READY_FOR_COUNCILS_AGENDA_UI_PR** → ثم **COUNCILS-AGENDA-MANUAL-SMOKE-01** بحسابات فعلية.

---

*نهاية التقرير — COUNCILS-AGENDA-UI-01*
