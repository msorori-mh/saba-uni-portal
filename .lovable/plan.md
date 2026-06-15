## المشكلة
عند الضغط على "حفظ التغييرات" في نافذة تعديل عضو هيئة التدريس لا يحدث شيء لأن:
1. الحقول الاختيارية (`program_id`, `full_name_en`, `phone`, `position_title`) تُرسل كسلسلة فارغة `""`، ومخطط Zod يرفضها — خصوصًا `program_id` الذي يتطلب UUID صالحًا، فيُرفض الطلب على الفور.
2. الخطأ يحدث داخل `inputValidator` على العميل قبل الوصول للسيرفر، ولا يصل دائمًا إلى حالة `err` بصورة واضحة للمستخدم.
3. حقل "المنصب" (`position_title`) لا يُحدَّث فعليًا في قاعدة البيانات لأنه غير مُمرَّر ضمن `update({...})` في الدالة `updateFacultyMember`.

## الإصلاح (أقل تغيير ممكن)

### 1) `src/routes/admin/faculty-management.tsx` — `EditFacultyModal.submit`
قبل إرسال البيانات، تحويل السلاسل الفارغة في الحقول الاختيارية إلى `null`:
- `program_id`, `full_name_en`, `phone`, `position_title`, `email` → `value || null`
- إبقاء الحقول المطلوبة كما هي (`full_name_ar`, `department_id`, `academic_rank`, `status`).
- إضافة استدعاء `onSaved()` فقط بعد نجاح فعلي، مع إغلاق النافذة (موجود مسبقًا).
- إظهار رسالة الخطأ في حال فشل Zod (بدلاً من رسالة عامة) بقراءة `e?.message`.

### 2) `src/lib/admin-people.functions.ts` — `updateFacultyMember`
إضافة `position_title` ضمن جملة التحديث:
```ts
.update({
  ...,
  position_title: data.position_title || null,
  ...
})
```
لا تغيير على RLS أو الصلاحيات أو منطق التحقق من الأدوار.

### 3) (اختياري ضمن نفس الملف) تشديد مخطط Zod
قبول السلسلة الفارغة لـ `program_id` بتحويلها إلى `null` عبر `z.preprocess` لضمان عدم تكرار المشكلة:
```ts
program_id: z.preprocess(v => (v === "" ? null : v),
  z.string().uuid().nullable().optional())
```
نفس الأسلوب يُطبّق على `full_name_en`, `phone`, `position_title` احتياطًا.

## التحقق بعد التنفيذ
- فتح `/admin/faculty-management`، تعديل عضو بدون اختيار برنامج → الضغط على "حفظ" يغلق النافذة ويحدّث القائمة.
- تعديل حقل "المنصب" وحفظه → يظهر التغيير بعد إعادة الفتح وفي الصفحة العامة `/faculty`.
- إن حدث خطأ سيرفر، تظهر رسالة واضحة داخل النافذة.

## ممنوع
- تعديل RLS أو صلاحيات `faculty` / `faculty_profiles`.
- تغيير شكل الواجهة أو حقولها.
