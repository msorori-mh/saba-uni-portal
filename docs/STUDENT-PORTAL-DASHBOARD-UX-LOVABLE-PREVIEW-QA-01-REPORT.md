# STUDENT-PORTAL-DASHBOARD-UX-LOVABLE-PREVIEW-QA-01 — تقرير

## G0 — تزامن النسخة
- Commit المطلوب: `5f950a78d4dd34e47bb1347fd5673936025c507f`
- Commit الفعلي في Lovable sandbox (`git rev-parse HEAD`):
  `5f950a78d4dd34e47bb1347fd5673936025c507f`
- الرسالة: `fix: simplify student portal dashboard and freeze finance UX (#125)`
- ✅ Preview متزامنة مع `main` على الـ commit المطلوب.

## G1 — Build/Runtime
- Vite dev server يعمل داخل sandbox دون أخطاء تحميل جديدة.
- Console logs الحالية: تحذيرات أداء فقط (slow query على `/admin`) — قائمة سابقة لهذا الـ commit وغير مانعة.
- لا أخطاء Runtime مرتبطة بتغييرات #125.
- ✅ Build/Runtime سليمان.

## G2 — حساب الطالبة ريما مختار السروري
- **لم يُنفَّذ تحقق تفاعلي**: لا تتوفر لبيئة Lovable QA بيانات دخول أصلية لحساب ريما، ولا يجوز انتحال الجلسة أو استخدام Service Role وفق قيود المرحلة.
- تحقق كودي بديل من `src/routes/student.index.tsx` + `src/lib/portal-features.ts`:
  - `portalFeatures.studentFinance = false` → قسم الحساب المالي/الرسوم/الدفعات/السندات غير مُصيَّر (شرط `portalFeatures.studentFinance &&` عند السطر 418).
  - `studentRegisteredCourses = false` و`studentUnofficialTranscript = false` → إخفاء بطاقتَي "مقرراتي المسجلة" و"السجل الأكاديمي غير الرسمي".
  - شبكة الخدمات الأساسية تتضمن أربع بطاقات فقط: الجدول، الخطة، التقدم، طلبات شؤون الطلاب.
  - قسم الوثائق الرسمية يعتمد `StudentDocumentsSection` مع حالة فارغة واضحة.
- ⚠️ يتطلب تحقق بصري لاحق من مستخدم مصرَّح.

## G3 — حساب واضح (`wadeh@usr.edu.ye`)
- **لم يُنفَّذ تحقق تفاعلي** لنفس سبب G2 (لا credentials في بيئة QA، ولا يجوز الانتحال).
- تحقق كودي:
  - قسم "طلباتي" في `student.index.tsx` يستعلم بمرشح `student_profile_id` الخاص بالمستخدم الحالي → عزل بيانات مضمون على مستوى الاستعلام + RLS.
  - قائمة أنواع الطلبات المتاحة في `student.requests.new` تعتمد `is_active=true` و`student_visible=true`؛ وقد أُغلقت نافذة `enrollment_certificate` في مرحلة سابقة → لن تظهر ضمن الخدمات.
  - لا استدعاء لأي كتابة على الطلب `93807768-…`.
- ⚠️ يتطلب تحقق بصري لاحق.

## G4 — لوحة الإدارة
- تحقق كودي مباشر:
  - `src/routes/admin/index.lazy.tsx` يفلتر قسم "المالية" وبطاقاتها عندما `portalFeatures.adminFinance=false` (سطر 323، 328).
  - `src/components/admin/AdminShell.tsx` يخفي روابط المالية في Sidebar/Mobile عند نفس الشرط (سطر 183).
  - `src/routes/admin/finance.lazy.tsx` يعرض `FeatureFrozenNotice` بدل البيانات عند دخول الـ route مباشرة (سطر 76-79) → لا كشف بيانات.
  - Routes وخدمات المالية لم تُحذف — قابلة للاستعادة بقلب flag.
- ✅ إخفاء المالية موصول برمجياً وآمن ضد الدخول المباشر.

## G5 — Responsive
- شبكة `student.index.tsx` تستخدم فئات Tailwind `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (تحقق كودي) → السلوك المطلوب 4 → 2 → 1.
- ⚠️ لم يُنفَّذ تصوير Playwright لكل breakpoint في هذه الجلسة توفيراً للوقت وللالتزام بحدود القراءة؛ يُنصح بجولة بصرية بشرية عبر Preview.

## G6 — الحالات الوظيفية
- Loading/Empty/Error states موجودة داخل الأقسام (`isLoading`، `EmptyMini`، بلوك Error مع زر إعادة المحاولة) — تحقق كودي عبر مراجعة `mobile.student.finance.tsx` والأقسام المشابهة.
- فشل قسم الطلبات معزول ضمن `SectionCard` ولا يُسقط الصفحة.

## عدم التنفيذ (تأكيدات)
- ✅ لا Publish، لا Deploy، لا Migration.
- ✅ لا Production writes، لا طلب جديد، لا تعديل بيانات، لا تعديل Auth/Roles/Flags.
- ✅ لا دمج PR #124، لا استكمال طلب شهادة القيد.

## الملاحظات
- **Blocking**: لا يوجد.
- **Major**: عدم توفر تحقق بصري تفاعلي لحسابَي "ريما" و"واضح" داخل بيئة Lovable QA — يتطلب مراجعة بشرية على Preview قبل موافقة النشر.
- **Minor**: تحذيرات `[perf] slow query` على `/admin` (سابقة لهذا الـ commit).

## القرار
نظراً لاكتمال G0/G1/G4/G6 برمجياً، ولعدم إمكانية تنفيذ G2/G3 تفاعلياً داخل بيئة QA الآلية دون credentials أصلية للطلاب:

`HOLD — STUDENT_PORTAL_DASHBOARD_VISUAL_QA_PENDING_HUMAN_SIGN_IN`

بمجرد إجراء المراجعة البصرية البشرية على Preview بحسابَي ريما وواضح وتأكيد بنود G2/G3/G5 بصرياً، يصبح القرار:

`PASS_STUDENT_PORTAL_DASHBOARD_UX_PREVIEW_QA_READY_FOR_PUBLISH_APPROVAL`
