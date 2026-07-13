# STUDENT-PORTAL-DASHBOARD-UX-SIMPLIFICATION-01

## القرار

`PASS_STUDENT_PORTAL_DASHBOARD_SIMPLIFIED_READY_FOR_REVIEW`

---

## 1. G0 — الملفات المراجعة

| المجال | المسار |
|--------|--------|
| صفحة الطالب | `src/routes/student.index.tsx` |
| Layout طالب | `src/routes/student.tsx` + `PortalShell` |
| ملخص الطلبات | `src/components/portal/StudentRequestsPortalSummary.tsx` |
| المالية طالب | `src/components/portal/StudentFinanceSection.tsx` |
| وثائق | `src/components/portal/StudentDocumentsSection.tsx` |
| سجل غير رسمي | `src/components/portal/UnofficialTranscript.tsx` |
| إعلانات | `src/components/communications/AnnouncementsWidget.tsx` |
| إدارة تنقل | `src/components/admin/AdminShell.tsx` |
| لوحة إدارة | `src/routes/admin/index.lazy.tsx` |
| مالية إدارة | `src/routes/admin/finance.lazy.tsx` |
| موبايل | `src/routes/mobile.student.index.tsx`, `mobile.student.finance.tsx` |
| RPCs | `get_my_student_requests`, `get_available_request_types_for_current_student` عبر `student-affairs.functions.ts` |

لا يوجد `portalFeatures` سابقًا — أُنشئ مركزيًا.

---

## 2. الملفات المعدّلة / الجديدة

| ملف | دور |
|-----|-----|
| `src/lib/portal-features.ts` | **جديد** — Feature Flags |
| `src/components/portal/FeatureFrozenNotice.tsx` | **جديد** — رسالة تجميد |
| `src/routes/student.index.tsx` | إعادة تنظيم + إخفاء الأقسام |
| `src/components/portal/StudentRequestsPortalSummary.tsx` | قسم الطلبات |
| `src/components/portal/StudentDocumentsSection.tsx` | Empty state |
| `src/components/admin/AdminShell.tsx` | إخفاء مجموعة المالية |
| `src/routes/admin/index.lazy.tsx` | إخفاء بطاقات مالية |
| `src/routes/admin/finance.lazy.tsx` | واجهة مجمّدة عند الدخول المباشر |
| `src/routes/mobile.student.index.tsx` | تعطيل بلاطة المالية/السجل |
| `src/routes/mobile.student.finance.tsx` | رسالة تجميد |
| `tests/student-portal/dashboard-ux-simplification-01.test.ts` | اختبارات |
| `docs/STUDENT-PORTAL-DASHBOARD-UX-SIMPLIFICATION-01-REPORT.md` | هذا التقرير |

---

## 3. الأقسام المخفية (عبر Flags)

- مقرراتي المسجلة (`studentRegisteredCourses: false`)
- السجل الأكاديمي غير الرسمي (`studentUnofficialTranscript: false`)
- الحساب المالي للطالب (`studentFinance: false`)
- الشؤون المالية للإدارة — تنقل + بطاقات + صفحة عند الدخول المباشر (`adminFinance: false`)

**لم تُحذف** المكوّنات / الدوال / الجداول / RLS / Routes.

---

## 4. Feature Flags

```ts
export const portalFeatures = {
  studentRegisteredCourses: false,
  studentUnofficialTranscript: false,
  studentFinance: false,
  adminFinance: false,
} as const;
```

تفعيل لاحق = قلب القيمة إلى `true`.

---

## 5. قسم الطلبات

- عنوان + وصف محدّدان في المتطلبات.
- أزرار فقط: **طلب جديد** → `/student/requests/new` ، **طلباتي** → `/student/requests`.
- آخر 3 طلبات من `getMyStudentServiceRequests` → RPC `get_my_student_requests`.
- Empty / Loading / Error عربي دون تعطيل باقي الصفحة.
- خدمات متاحة من `getStudentRequestTypesForStudent` مع فلترة الأهلية (لا قائمة ثابتة؛ الأنواع غير المؤهلة مثل شهادة القيد المخفية لا تظهر).

---

## 6. Routes المستخدمة

| إجراء | المسار |
|-------|--------|
| طلب جديد | `/student/requests/new` |
| طلباتي | `/student/requests` |
| تفاصيل | `/student/requests/$id` |
| جدول / خطة / تقدم | `/student/schedule` · `/student/study-plan` · `/student/progress` |
| مالية إدارة (مجمّدة) | `/admin/finance` |

---

## 7. نتائج التحقق

| فحص | نتيجة |
|-----|--------|
| اختبارات التبسيط | **7 pass / 0 fail** (`bun test tests/student-portal/dashboard-ux-simplification-01.test.ts`) |
| `tsc --noEmit` | **PASS** (exit 0) — لا يوجد سكربت `typecheck` في package.json |
| `lint` | **FAIL (pre-existing)** — آلاف تحذيرات `prettier/prettier` بسبب CRLF (`Delete ␍`) على مستوى المستودع؛ ليست ناتجة عن تغييرات هذه المرحلة |
| `build` | **PASS** (`bun run build`, exit 0) |
| `git diff --check` | **PASS** على الملفات المعدّلة |

---

## 8. التحقق المرئي (وصف)

لم تُفتح جلسات حسابات إنتاج (`wadeh@…` / ريما) من هذا الـ worktree لتجنب أي مخاطر على البيانات. التحقق البرمجي يغطي الـ flags والمسارات وEmpty states والفلترة.

يُنصح بمراجعة يدوية لاحقة على staging فقط.

---

## 9. تأكيدات نطاق

- ❌ لا Migration
- ❌ لا Production DB writes
- ❌ لا Deploy / Publish
- ❌ لا Auth / Roles changes
- ❌ لا تعديل بيانات طلاب
- ❌ لا مسّ الطلب `93807768-a281-42de-bfb4-0c0c03786b20`
