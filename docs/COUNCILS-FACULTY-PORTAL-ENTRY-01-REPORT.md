# COUNCILS-FACULTY-PORTAL-ENTRY-01 — مدخل مجالسي الأكاديمية في بوابة هيئة التدريس

> **كود فقط — قراءة فقط.** لا migrations، لا DB/RLS/Storage، لا seed/import، لا كتابة بيانات، لا service role في المتصفح.

---

## 1. القرار النهائي

### **PASS**

---

## 2. الملفات المعدَّلة / المُضافة

| الملف | التغيير |
|-------|---------|
| `src/lib/faculty-councils.functions.ts` | **جديد** — `getMyAcademicCouncilMemberships` (قراءة فقط) |
| `src/routes/faculty-portal.academic-councils.tsx` | **جديد** — صفحة «مجالسي الأكاديمية» |
| `src/routes/faculty-portal.index.tsx` | بطاقة/رابط دخول في لوحة عضو هيئة التدريس |
| `docs/COUNCILS-FACULTY-PORTAL-ENTRY-01-REPORT.md` | هذا التقرير |

**لم تُعدَّل:** `/admin/academic-councils`، دوال إدارة العضويات، RLS، migrations.

---

## 3. المسار المعتمد

| البند | القيمة |
|-------|--------|
| بوابة هيئة التدريس | `/faculty-portal` (النمط الفعلي في المشروع — وليس `/faculty`) |
| صفحة مجالسي الأكاديمية | **`/faculty-portal/academic-councils`** |
| تسجيل الدخول | `/portal-login` → توجيه تلقائي لـ `/faculty-portal` |

---

## 4. مدخل البوابة (البطاقة)

**الموقع:** `src/routes/faculty-portal.index.tsx` — أسفل بطاقة «جدول التدريس الأسبوعي».

| العنصر | النص |
|--------|------|
| العنوان | مجالسي الأكاديمية |
| الوصف | الدخول إلى المجالس الأكاديمية المرتبط بها حسابك، ومتابعة الاجتماعات والموضوعات والقرارات عند تفعيلها. |
| الزر | دخول مجالسي الأكاديمية |
| الرابط | `/faculty-portal/academic-councils` |

البطاقة **تظهر دائماً**؛ عدم وجود عضويات يُعالَج بـ empty state في الصفحة الفرعية (لا إخفاء للبطاقة).

---

## 5. Server function

**الاسم:** `getMyAcademicCouncilMemberships`
**الملف:** `src/lib/faculty-councils.functions.ts`

| المتطلب | التنفيذ |
|---------|---------|
| جلسة المستخدم | `requireSupabaseAuth` + `context.supabase` |
| لا service role | **نعم** — لا `supabaseAdmin` |
| لا تجاوز RLS | **نعم** — استعلامات عبر JWT المستخدم |
| سياق faculty | تحقق من `faculty_profiles` لـ `user_id = context.userId` و`status = active` |
| نطاق البيانات | `.eq("user_id", context.userId)` فقط |
| عضويات فعّالة فقط | `.eq("is_active", true).is("active_to", null)` |
| join المجلس | `academic_councils` للاسم والنوع — عبر RLS `is_council_member` |

**الحقول المُرجعة:** `membership_id`, `council_id`, `council_name`, `council_type`, `member_role`, `is_active`, `active_from` — بدون بيانات أعضاء آخرين أو بيانات حساسة.

---

## 6. ربط المستخدم بعضوياته فقط

1. **طبقة التطبيق:** الاستعلام مقيَّد بـ `context.userId` من JWT.
2. **طبقة RLS:** `council_members_select` يسمح بقراءة صفوف المجالس التي المستخدم عضو فيها؛ `councils_select` يسمح بقراءة تفاصيل تلك المجالس فقط.
3. **لا** استعلام لكل المجالس ولا فلترة client-side واسعة.

---

## 7. منع عرض بيانات الغير

- لا قائمة بكل المجالس.
- لا أسماء أعضاء آخرين.
- لا استخدام دوال الإدارة (`getCouncilMemberships` وغيرها).
- empty state عند صفر نتائج — ليس خطأ نظام.

---

## 8. Empty state

نص الصفحة عند عدم وجود عضويات:

> «لا توجد عضويات مجالس مرتبطة بحسابك حالياً.»

مع أيقونة ورسالة تذكير أن الصفحة للاطلاع فقط.

---

## 9. صفحة القراءة فقط

**لا توجد أزرار:**

- ربط / تعطيل عضو
- إنشاء اجتماع / رفع موضوع / إصدار قرار / تنبيه
- حذف

**لا** رابط لوحة الإدارة (لا نمط موجود في بوابة Faculty لهذا الغرض).

---

## 10. نتائج التحقق

| الفحص | النتيجة |
|-------|---------|
| ESLint / IDE lints | **PASS** — لا أخطاء على الملفات الثلاثة |
| typecheck / build | **لم يُشغَّل** — `node_modules` غير متوفرة محلياً |
| migrations جديدة | **لا** |
| DB / RLS changes | **لا** |
| service role في المتصفح | **لا** |
| كتابة بيانات | **لا** |
| تأثير `/admin/academic-councils` | **لا تعديل** |

---

## 11. تأكيدات عدم التوسع

| البند | الحالة |
|-------|--------|
| migrations | **لا** |
| DB schema | **لا** |
| RLS | **لا** |
| Storage | **لا** |
| Email | **لا** |
| Cron | **لا** |
| seed / import | **لا** |
| service role في المتصفح | **لا** |
| كتابة بيانات | **لا** |

---

## 12. ملاحظات

1. **المسار `/faculty-portal/...`** وليس `/faculty/academic-councils` — متوافق مع بنية المشروع (`portal-login` يوجّه إلى `/faculty-portal`).
2. **`routeTree.gen.ts`** يُحدَّث تلقائياً عند البناء (نمط TanStack Router).
3. العضويات **السابقة المعطّلة** غير معروضة في هذه المرحلة (فعّالة فقط).
4. الاجتماعات/الموضوعات/القرارات **غير مفعّلة** — نص توضيحي في أسفل الصفحة.

---

## 13. التوصية التالية

### **READY_FOR_FACULTY_COUNCILS_READONLY_VERIFY**

- نشر والتحقق من `/faculty-portal` → بطاقة «مجالسي الأكاديمية».
- اختبار حساب faculty بدون عضوية → empty state.
- اختبار حساب faculty بعضوية فعّالة (مُربوطة من `/admin/academic-councils`) → قائمة المجالس فقط.

---

*Generated: COUNCILS-FACULTY-PORTAL-ENTRY-01 — faculty portal read-only entry, no DB changes.*
