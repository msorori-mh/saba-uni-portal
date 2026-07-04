# COUNCILS-ADMIN-MEMBERSHIP-CTA-FIX-01 — تقرير إصلاح واجهة

**التاريخ:** 2026-07-04  
**القرار:** **PASS**

---

## 1. الملفات المعدّلة

| الملف | التغيير |
|-------|---------|
| `src/lib/admin-nav.ts` | إضافة `resolveAdminNavHref()` لتطبيع روابط الشريط الجانبي إلى مسارات مطلقة |
| `src/components/admin/AdminShell.tsx` | تمرير كل روابط `Link` عبر `resolveAdminNavHref()` |
| `src/routes/admin/academic-councils.tsx` | إصلاح زر «إدارة العضويات» + تمرير تلقائي إلى قسم العضويات |

**لم يُمس:** migrations، DB، RLS، Storage، Email/Cron، seed/import، server functions، service role.

---

## 2. سبب المشكلة

### أ) رابط القائمة الجانبية `/admin/admin/academic-councils`

عند استخدام مسار **نسبي** داخل تخطيط `/admin` (مثل `admin/academic-councils` أو `./admin/academic-councils`)، يحلّه TanStack Router من المسار الحالي `/admin/...` فيُنتج `/admin/admin/academic-councils`.

تعريف القائمة كان يحمل المسار المطلق `/admin/academic-councils`، لكن لم يكن هناك ضمان مركزي يمنع تسرب مسارات نسبية مستقبلاً أو من نسخ قديمة.

### ب) زر «إدارة العضويات»

الزر كان يستدعي `onSelect` نفسه لاختيار المجلس، لكن:

1. قسم «إضافة عضو إلى المجلس» يقع **أسفل الصفحة** — المستخدم لا يرى تغيّراً واضحاً بعد الضغط.
2. لم يكن هناك `scrollIntoView` أو `ref` يوجّه التركيز إلى لوحة العضويات.
3. الزر لم يكن مميّزاً عن ضغط بطاقة المجلس (نفس المعالج دون تجربة CTA واضحة).

---

## 3. الرابط قبل وبعد

| الحالة | المسار |
|--------|--------|
| **المطلوب** | `/admin/academic-councils` |
| **الخلل المحتمل (نسبي)** | `/admin/admin/academic-councils` |
| **بعد الإصلاح** | `resolveAdminNavHref("admin/academic-councils")` → `/admin/academic-councils` |
| **بعد الإصلاح** | `resolveAdminNavHref("/admin/academic-councils")` → `/admin/academic-councils` (بدون تغيير) |

تطبيق الدالة على **جميع** روابط `AdminShell` يضمن عدم تكرار `/admin/admin/...` لأي عنصر قائمة.

---

## 4. إصلاح زر إدارة العضويات

في `CouncilPickerRow`:

- **ضغط البطاقة** → `onSelect()` → `selectCouncil(councilId)` (تحديد بصري فقط).
- **زر «إدارة العضويات»** → `onManageMembership()` → `selectCouncilAndFocusMembership(councilId)`:
  - يحدّد `selectedCouncilId` بنفس منطق الاختيار.
  - يفعّل `pendingMembershipFocus`.
  - بعد التحديث، يمرّر الصفحة بسلاسة إلى `#council-membership-panel` عبر `membershipPanelRef.scrollIntoView({ behavior: "smooth", block: "start" })`.
- `e.stopPropagation()` على الزر لمنع أي تداخل أحداث مع عناصر البطاقة.
- الزر **غير معطّل** (`disabled` غير مستخدم).

**عند مجلس واحد:** `useEffect` يختار المجلس تلقائياً عند التحميل (`allCouncils.length === 1`).

**بعد الضغط يظهر بوضوح:**

- عنوان «إضافة عضو إلى المجلس — {اسم المجلس}»
- حقل البحث
- اختيار الدور (عند اختيار مرشح)
- زر «حفظ العضوية»

`councilId` يُمرَّر عبر `selectedCouncil` إلى `CouncilMembershipPanel` → استعلامات `getCouncilMemberships` / `linkAcademicToCouncil` كما كان.

---

## 5. نتائج التحقق التقني

| الفحص | النتيجة | ملاحظة |
|-------|---------|--------|
| `npx tsc --noEmit` | **PASS** | لا أخطاء TypeScript |
| `npm run build` | **PASS** | exit code 0 |
| `npm run lint` (مشروع كامل) | **FAIL (معروف)** | تحذيرات `prettier/CRLF` على ملفات قديمة — خارج نطاق هذا الإصلاح |
| ESLint على الملفات المعدّلة | CRLF فقط | لا أخطاء منطقية؛ IDE lints نظيفة |
| DB / RLS / migrations | **لم يُمس** | ✅ |
| service role في المتصفح | **لم يُمس** | ✅ |
| كتابة بيانات أثناء التحقق | **لم تُنفَّذ** | ✅ |

---

## 6. قائمة التحقق اليدوي (بعد النشر)

- [ ] رابط القائمة «بوابة إدارة المجالس الأكاديمية» يفتح `/admin/academic-councils` وليس `/admin/admin/academic-councils`
- [ ] ضغط بطاقة مجلس الكلية يحدّد المجلس بصرياً
- [ ] ضغط «إدارة العضويات» يحدّد المجلس ويمرّر إلى قسم العضويات
- [ ] يظهر «إضافة عضو إلى المجلس» + البحث + الأدوار + «حفظ العضوية»
- [ ] لا يُنفَّذ ربط عضو أثناء التحقق
- [ ] أقسام الاجتماعات/الموضوعات/القرارات ما زالت قراءة فقط (`LockedAction`)

---

## 7. التوصية التالية

**READY_FOR_COUNCILS_MEMBERSHIP_MANUAL_PILOT**

بعد نشر هذا الإصلاح:

1. تحقق يدوي في الإنتاج من رابط القائمة وزر CTA.
2. نفّذ `COUNCILS-MEMBERSHIP-PILOT-01` — ربط عضوية واحدة عبر واجهة الإدارة (بدون seed تلقائي).
3. أعد `COUNCILS-FACULTY-COUNCILS-READONLY-VERIFY-01` بعد وجود عضوية فعّالة.
