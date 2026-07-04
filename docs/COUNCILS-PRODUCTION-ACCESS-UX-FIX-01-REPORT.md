# COUNCILS-PRODUCTION-ACCESS-UX-FIX-01 — تحسين وصول إنتاج المجالس

> **كود فقط.** لا migrations، لا DB/RLS/Storage، لا seed/import، لا كتابة بيانات.

---

## 1. القرار النهائي

### **PASS**

---

## 2. سبب المرحلة

بعد الفحص على الإنتاج:

1. **`/admin/academic-councils`** — قسم العضويات موجود لكن المستخدم لا يرى مساراً واضحاً لإضافة الأعضاء (رسالة عامة «اختر مجلساً…» دون CTA).
2. **`/faculty-portal/academic-councils`** — **Not Found** لأن المسار لم يُسجَّل في `routeTree.gen.ts` رغم وجود ملف الـ route.
3. **بطاقة «مجالسي الأكاديمية»** — الكود موجود في `faculty-portal.index.tsx` لكن المسار المكسور يمنع الاستفادة منها.

---

## 3. الملفات المعدَّلة

| الملف | التغيير |
|-------|---------|
| `src/routes/admin/academic-councils.tsx` | UX إدارة العضويات + auto-select + CTA |
| `src/routes/faculty-portal.index.tsx` | توحيد نص الوصف |
| `src/routeTree.gen.ts` | **تسجيل** `/faculty-portal/academic-councils` (سبب إصلاح Not Found) |

**لم تُعدَّل:** server functions، `faculty-councils.functions.ts`، RLS، migrations.

---

## 4. الجزء الأول — تحسين الأدمن

### auto-select لمجلس الكلية

| البند | التنفيذ |
|-------|---------|
| مجلس واحد فقط | `useEffect` يختار تلقائياً `allCouncils[0].id` عند التحميل |
| أكثر من مجلس | يبقى الاختيار اليدوي |

### CTA على بطاقة المجلس

- زر **`إدارة العضويات`** على كل بطاقة مجلس (بجانب شارة الحالة).
- النقر على البطاقة أو الزر يحدّد المجلس.

### قسم إضافة العضو (عند الاختيار)

| العنصر | النص |
|--------|------|
| العنوان | **إضافة عضو إلى المجلس** |
| حقل البحث | **ابحث باسم عضو هيئة التدريس أو البريد أو الرقم الأكاديمي** |
| الأدوار | رئيس / أمين سر / عضو / مطّلع |
| الزر | **حفظ العضوية** |

### عند عدم اختيار مجلس

رسالة إرشادية واضحة:

> «اضغط على بطاقة مجلس الكلية أو زر «إدارة العضويات» للبدء.»

مع توضيح أن البحث والدور و«حفظ العضوية» يظهران بعد الاختيار.

### ما بقي قراءة فقط

الاجتماعات، الموضوعات، القرارات، التنبيهات — `LockedAction` دون تغيير.

---

## 5. الجزء الثاني — إصلاح بوابة هيئة التدريس

### السبب الجذري لـ Not Found

ملف `src/routes/faculty-portal.academic-councils.tsx` كان موجوداً لكن **`src/routeTree.gen.ts` لم يتضمن المسار** — TanStack Router لا يوجّه الطلبات إليه.

### الإصلاح

تشغيل **`npm run build`** أعاد توليد `routeTree.gen.ts` وأضاف:

```text
/faculty-portal/academic-councils
  → FacultyPortalAcademicCouncilsRoute
  → parent: FacultyPortalRoute
```

### بطاقة `/faculty-portal`

| العنصر | القيمة |
|--------|--------|
| العنوان | مجالسي الأكاديمية |
| الوصف | الدخول إلى المجالس الأكاديمية المرتبط بها حسابك. |
| الزر | دخول مجالسي الأكاديمية |
| الرابط | `/faculty-portal/academic-councils` |

صفحة Faculty ما زالت **قراءة فقط** — `getMyAcademicCouncilMemberships` دون تغيير.

---

## 6. نتائج التحقق التقني

| الفحص | النتيجة |
|-------|---------|
| `npm run build` | **PASS** (exit 0) — يتضمن توليد `routeTree.gen.ts` |
| ESLint | تحذيرات `prettier/CRLF` على ملفات قديمة — **لا أخطاء منطقية** على `academic-councils.tsx` |
| IDE lints (`academic-councils.tsx`) | **PASS** |
| typecheck منفصل | **مضمّن في build** — نجح |
| migrations | **لا** |
| DB / RLS | **لا** |

---

## 7. تأكيدات عدم التوسع

| البند | الحالة |
|-------|--------|
| migrations | **لا** |
| DB changes | **لا** |
| RLS changes | **لا** |
| DELETE | **لا** |
| service role في المتصفح | **لا** |
| seed/import | **لا** |
| كتابة بيانات | **لا** |
| تعديل server functions العضويات | **لا** |

---

## 8. ملاحظات

1. يجب **commit** التغييرات (خصوصاً `routeTree.gen.ts`) ونشرها عبر Lovable ليختفي Not Found على الإنتاج.
2. مع **مجلس كلية واحد** في DB، يُختار المجلس تلقائياً ويظهر نموذج الإضافة فوراً.
3. `package-lock.json` وُلِد محلياً من `npm install` — خارج نطاق هذه المرحلة إن لم يُطلب commit له.

---

## 9. التوصية التالية

### **READY_FOR_COUNCILS_PRODUCTION_ACCESS_VERIFY**

بعد النشر:

1. تحقق `/faculty-portal` → بطاقة «مجالسي الأكاديمية».
2. تحقق `/faculty-portal/academic-councils` → لا Not Found.
3. تحقق `/admin/academic-councils` → auto-select + زر «إدارة العضويات» + «حفظ العضوية».

---

*Generated: COUNCILS-PRODUCTION-ACCESS-UX-FIX-01 — UX + routing fix, no DB changes.*
