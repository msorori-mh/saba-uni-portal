# STUDENT-PORTAL-DASHBOARD-REQUESTS-UX-CLOSURE-01

## 1. القرار

`PASS_STUDENT_PORTAL_DASHBOARD_REQUESTS_UX_FIX_READY_FOR_PR_REVIEW`

ملاحظة مسجَّلة (قراءة فقط، بلا Migration):

`HOLD — CURRENT_PROCESSING_UNIT_READ_CONTRACT_GAP`

المصدر المتاح اليوم لعمود «الجهة الحالية» هو `current_role_key` فقط؛ لا يُرجَع اسم وحدة المعالجة من خطوة Workflow. عُرضت تسمية عربية من الدور، وعند الغياب: `لم تُحدد بعد`.

---

## 2. سبب عدم ظهور الخدمات سابقاً على `/student/requests`

| فرضية | النتيجة |
|-------|---------|
| الصفحة لا تستدعي RPC الأنواع؟ | **نعم — السبب الجذري** |
| فقط «طلب جديد» / ملخص اللوحة تستدعيها؟ | **نعم** |
| فلترة خاطئة على صفحة الطلبات؟ | غير منطبق (لا جلب أصلاً) |
| كل الأنواع مخفية/غير نشطة؟ | لم يُثبت كسبب للصفحة |
| Loading/Error صامت؟ | لا — الصفحة كانت تعرض الطلبات فقط |

الإصلاح: استدعاء `getStudentRequestTypesForStudent` → `get_available_request_types_for_current_student` داخل فهرس الطلبات مع قسم «الخدمات المتاحة».

---

## 3. الملفات المعدّلة

| ملف | دور |
|-----|-----|
| `src/routes/student.index.tsx` | بطاقات مضغوطة + خدمات أفقية |
| `src/components/brand/StatCard.tsx` / `StandardCard.tsx` | كثافة `compact` أوضح |
| `src/routes/student.requests.tsx` | Layout + تنقل مشترك |
| `src/routes/student.requests.index.tsx` | خدمات متاحة + طلباتي + موبايل |
| `src/routes/student.requests.new.tsx` | `?type=` لاختيار الخدمة |
| `src/components/portal/StudentRequestsNav.tsx` | عودة إلى `/student` + رجوع |
| `src/lib/student-requests/available-request-types-ui.ts` | فلترة العرض |
| `src/lib/student-requests/student-request-unit-label.ts` | الجهة الحالية |
| `tests/student-portal/dashboard-requests-ux-closure-01.test.ts` | اختبارات المرحلة |
| `docs/STUDENT-PORTAL-DASHBOARD-REQUESTS-UX-CLOSURE-01-REPORT.md` | هذا التقرير |

---

## 4. تصميم البطاقات المضغوط

- `StandardCard` compact: `p-3`
- `StatCard` compact: أيقونة ونص في صف واحد؛ قيمة `text-base/lg`
- روابط الخدمات الأكاديمية: `flex-row` أيقونة + عنوان/وصف
- Grid ثابت: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` + `gap-2.5`

---

## 5. الخدمات المتاحة

- المصدر: RPC الحقيقي عبر `getStudentRequestTypesForStudent`
- إخفاء أوضاع `hide` / `hidden` (بما فيها `enrollment_certificate` المخفي)
- عرض المؤهل مع زر `تقديم طلب` → `/student/requests/new?type=…`
- عرض المعطَّل الرسمي بدون CTA نشط
- لا رسوم طالما `portalFeatures.studentFinance === false`
- Empty / Error منفصلان عن قسم الطلبات

---

## 6. التنقل

- `العودة إلى بوابة الطالب` → `/student` (رابط ثابت)
- `رجوع` مع سقوط آمن إلى `/student`
- Breadcrumb: بوابة الطالب / …
- زر `طلب جديد` يمرّر إلى `#available-services` (لا يفتح نموذجاً قبل اختيار النوع)

---

## 7. الجهة الحالية

| حالة | العرض |
|------|--------|
| `current_role_key` فارغ | `لم تُحدد بعد` |
| `student_affairs` / `registrar` / `dean` / `archive_officer` | شؤون الطلاب / مسجل الكلية / عمادة الكلية / الأرشيف |
| أدوار أخرى معروفة | من `STAFF_ROLE_LABELS_AR` |

`HOLD — CURRENT_PROCESSING_UNIT_READ_CONTRACT_GAP` — لا اسم وحدة من الخطوة دون توسيع عقد القراءة.

---

## 8. Mobile QA (من الكود + تخطيط responsive)

| عرض | سلوك |
|-----|------|
| Mobile | بطاقة لكل طلب؛ زر عرض بعرض كامل؛ `break-all` لرقم الطلب |
| md+ | جدول أعمدة كاملة |
| Header | زر طلب جديد ضمن الشريط وليس عائماً قاطعاً |

---

## 9–10. الاختبارات / Typecheck / Build

| فحص | نتيجة |
|-----|--------|
| `dashboard-requests-ux-closure-01.test.ts` | **14 pass** |
| `dashboard-ux-simplification-01.test.ts` | **7 pass** |
| `tsc --noEmit` | **PASS** |
| `bun run build` | **PASS** |

---

## 11. تأكيد المحظورات

| بند | |
|-----|--|
| Migration | لم يُنفَّذ |
| Production DB writes | لا |
| Deploy / Publish | لا |
| Auth / Roles | لا |
| تعديل Feature Flags المالية | لا (`false`) |
| حذف Routes/خدمات | لا |
| الطلب `93807768-…` | لم يُمس |
| فرع PR #124 | لم يُعدَّل |

---

## Git

فرع: `fix/student-portal-dashboard-requests-ux-closure-01`  
الأساس: `origin/main` (يشمل merge #125 `5f950a7`)  
PR: [#126](https://github.com/msorori-mh/saba-uni-portal/pull/126) — **لا دمج**.

---

## 12. مزامنة main (PR126-MAIN-SYNC-REVIEW-01)

| بند | قيمة |
|-----|------|
| SHA قبل المزامنة | `210ec6763f5a1c606597f590893df0e38418dcfe` |
| طريقة المزامنة | `git merge --no-ff origin/main` (لا Rebase / لا Force Push) |
| تعارضات | **لا يوجد** — دمج نظيف (`ort`) |
| ملفات من `main` أُضيفت | `docs/REQUEST-TYPES-PILOT-WORKFLOW-CONFIGURATION-DESIGN-01-REPORT.md`، `docs/STUDENT-AVAILABLE-REQUEST-TYPES-RUNTIME-AUDIT-01-REPORT.md` |
| مسار PR #124 | **لم يُمس** |
| `routeTree.gen.ts` | لم يتعارض؛ بقي ناتج مسارات الفرع |
| SHA بعد دمج main | `b7f899f` (merge commit) |
| SHA النهائي بعد التقرير/lint | `45887689ae668a0038feab40b4157c9dfa450845` |
| اختبارات بعد المزامنة | **14 pass** (`dashboard-requests-ux-closure-01`) |
| `tsc --noEmit` | **PASS** |
| `bun run build` | **PASS** |
| Lint (ملفات PR فقط) | أصلِح سطر `any` غير مستخدم في `student.index.tsx`؛ Scoped eslint نظيف بعدها |
| قرار المزامنة | `PASS_STUDENT_PORTAL_DASHBOARD_REQUESTS_UX_PR126_SYNCED_READY_FOR_MERGE_REVIEW` |
