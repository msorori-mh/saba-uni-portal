# COUNCILS-MEMBERSHIP-UI-DEPLOY-VERIFY-01

## القرار النهائي
**NO-GO (BLOCKED — كود الـ PR غير موجود في بيئة التحقق)**

## نطاق التحقق
- الصفحة المستهدفة: `/admin/academic-councils`
- PR المرجعي: https://github.com/msorori-mh/saba-uni-portal/pull/76
- الفرع المرجعي: `councils/membership-admin-ui-01`
- المراحل المفترض دمجها:
  - COUNCILS-MEMBERSHIP-WRITE-FUNCTIONS-01
  - COUNCILS-MEMBERSHIP-ADMIN-UI-01

## نتيجة فحص الكود في بيئة التحقق

بيئة التحقق الحالية على الفرع:

```
edit/edt-87515eeb-8724-472b-903a-0de21f7ae702
```

آخر عمليات commit تحتوي فقط على مرحلة التصميم
(`COUNCILS-MEMBERSHIP-ADMIN-LINKING-DESIGN-01`)، ولا يوجد أي كود يخص
تنفيذ الدوال أو الواجهة. تم البحث الشامل:

| العنصر المتوقع | النتيجة |
| --- | --- |
| `src/lib/admin-councils-membership.functions.ts` | ❌ غير موجود |
| `linkAcademicToCouncil` (server fn) | ❌ لا يوجد أي مرجع في `src/` |
| `searchAcademicsForCouncilLink` (server fn) | ❌ لا يوجد أي مرجع في `src/` |
| `deactivateCouncilMembership` (server fn) | ❌ لا يوجد أي مرجع في `src/` |
| قسم "إدارة عضويات المجلس" داخل `academic-councils.tsx` | ❌ لا يوجد (`MembersTable/CouncilPicker/membership` = 0 مطابقة) |
| مكونات `AcademicUserSearch / AddMemberDialog / RoleChangeDialog / DeactivateConfirm` | ❌ غير موجودة |

الصفحة الحالية `/admin/academic-councils` لا تزال في وضع "قراءة فقط"
كما كانت بعد `COUNCILS-MVP-UI-INTEGRATION-01` — كل الأزرار الحساسة
(إضافة عضو، إنشاء اجتماع، رفع موضوع، اعتماد جدول أعمال، إصدار قرار،
إرسال تنبيه) لا تزال `disabled` عبر `<LockedAction>`.

## نتائج التحقق الوظيفي

جميع البنود التالية **غير قابلة للتحقق** لأن الكود غير موجود:

- قائمة اختيار المجلس + التمييز البصري — لا يوجد UI للاختيار.
- جدول العضويات (اسم/بريد/رقم أكاديمي/دور/حالة/تواريخ) — لا يوجد.
- Empty state للعضويات — لا يوجد.
- البحث عن الأكاديميين (شرط ≥ حرفين، استدعاء `searchAcademicsForCouncilLink`،
  إظهار الاسم/البريد/الرقم فقط) — لا يوجد.
- ربط عضو (اختيار دور من `chair/secretary/member/viewer`، استدعاء
  `linkAcademicToCouncil`، رسالة تكرار واضحة) — لا يوجد.
- تعطيل العضوية (زر يظهر للفعّالة فقط، تأكيد، استدعاء
  `deactivateCouncilMembership`، لا يوجد DELETE) — لا يوجد.
- سلوك RLS عند دور `dean` — لا يمكن اختباره بدون واجهة تنفّذ الكتابة.

## نتائج فحص القيود الصارمة

| البند | الحالة |
| --- | --- |
| لا migrations جديدة | ✅ لا يوجد ملف جديد داخل `supabase/migrations` أو `docs/drafts` لهذه المرحلة |
| لا تغييرات DB schema / RLS / Storage / Email / Cron | ✅ لم يتم تشغيل أي أداة تعديل |
| لا seed / import | ✅ |
| لا DELETE على عضويات المجالس | ✅ (لا يوجد كود من الأصل) |
| لا استخدام service role في المتصفح | ✅ (لم يُضف أي استيراد لـ `client.server` في مكونات) |
| لا تعديل كود في هذه المرحلة | ✅ (المرحلة تحقق فقط) |

## فحوصات lint / typecheck / build

لم يتم تشغيلها لعدم وجود كود جديد للفحص؛ الفرع الحالي لا يتضمن تنفيذ
`COUNCILS-MEMBERSHIP-WRITE-FUNCTIONS-01` أو `COUNCILS-MEMBERSHIP-ADMIN-UI-01`،
لذا نتائج الفحص لن تعكس محتوى PR #76 وقد تعطي انطباعاً مضللاً بأن
"كل شيء نظيف".

## الملاحظات / العوائق

- بيئة المعاينة (`edit/edt-...`) لا تحتوي على كود الفرع
  `councils/membership-admin-ui-01`. لا يمكن إجراء تحقق فعلي على واجهة
  عضوية غير موجودة.
- أي "PASS" في هذه الحالة سيكون غير صحيح لأنه سيصف واجهة لم تُشحن بعد
  إلى بيئة التحقق.

## التوصية التالية

**BLOCKED — يلزم قبل إعادة المحاولة:**

1. دمج PR #76 (`councils/membership-admin-ui-01`) في الفرع الذي تعمل
   عليه بيئة المعاينة، أو تبديل بيئة التحقق لتُشير إلى نفس الفرع.
2. بعد ظهور الملفات التالية فعلياً:
   - `src/lib/admin-councils-membership.functions.ts` يحتوي:
     `searchAcademicsForCouncilLink`, `linkAcademicToCouncil`,
     `deactivateCouncilMembership` (+ `listCouncilMembers` /
     `updateCouncilMemberRole` حسب التصميم).
   - قسم "إدارة عضويات المجلس" داخل `src/routes/admin/academic-councils.tsx`
     أو ملف مكوّن منفصل مستورد فيها.
3. إعادة تشغيل هذه المرحلة `COUNCILS-MEMBERSHIP-UI-DEPLOY-VERIFY-01`
   لتنفيذ الفحوصات الوظيفية و lint/typecheck/build فعلياً.

**عند نجاح التحقق لاحقاً**، التوصية المتوقعة هي:
`READY_FOR_MEMBERSHIP_PILOT`.
