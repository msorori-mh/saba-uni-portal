# PORTAL-B1-FIVE-SERVICES-STUDENT-AND-STAFF-UI-01

## القرار

`PASS_B1_FIVE_SERVICES_UI_READY_FOR_BACKEND_INTEGRATION`

الحالة SOURCE-ONLY. لا يوجد Production أو Staging write، ولا Migration apply، ولا Deploy أو
Publish، ولا تغيير في `student_visible` أو تفعيل workflow.

## جرد عمل Kimi

### المكتمل مبدئيًا

- المكونات المشتركة الاثنا عشر:
  `B1ServiceHeader`، `B1DraftStatus`، `B1WorkflowTimeline`،
  `B1AttachmentUploader`، `B1RequestSummary`، `B1SubmissionConfirmation`،
  `B1RequestStatusCard`، `B1EmployeeActionPanel`، `B1ErrorState`،
  `B1LoadingState`، `B1EmptyState`، `B1SuccessState`.
- أنواع Contract Adapter والـmock والـlive fail-closed adapter.
- config الخدمات الخمس والتحقق المحلي.
- 72 اختبارًا أوليًا للمكونات والـadapter والتحقق.

### الجزئي

- لم تكن هناك صفحات نماذج طالب أو مسارات B1.
- لم تكن هناك قائمة خدمات B1 مرتبطة بحالة التشغيل.
- لم تكن هناك صفحة inbox/details للموظف أو بطاقة إيرادات مستقلة.
- لم يكن `routeTree.gen.ts` مولّدًا للمسارات الجديدة.
- لم يكن التقرير موجودًا.

### المكسور أو المكرر

- لم تُكتشف imports أو syntax مكسورة في checkpoint.
- لم توجد ملفات UI مكررة.
- كان تنسيق ملفات Kimi يحتاج Prettier؛ تم إصلاحه دون إعادة كتابة العمل.

## ما أكمله Codex

- نموذج مشترك responsive وRTL للخدمات الخمس:
  `enrollment_suspension`، `excused_absence`، `department_transfer`،
  `final_chance`، `file_withdrawal`.
- validation، حفظ المسودة، review قبل الإرسال، stale-version token، منع double submit،
  رفع/حذف المرفقات الآمنة، وحالات loading/error/empty/success.
- قائمة الخدمات لا تعرض إلا `studentVisible && runtimeAvailable`.
- المسار `/student/requests/b1/$service`.
- Assigned Requests Inbox ومسار `/staff/b1-requests`.
- تفاصيل الطالب والطلب والملخص والمرفقات وworkflow timeline والإجراء الحالي فقط.
- return/reject يبقيان بتعليق إلزامي عبر `B1EmployeeActionPanel`.
- permission denied لا ينفذ optimistic mutation.
- إعادة قراءة inbox والتفاصيل من adapter بعد نجاح الإجراء.
- بطاقة الإيرادات ترسل `stepId` وملاحظة اختيارية فقط.
- توليد `src/routeTree.gen.ts` بواسطة `bun run build` فقط.

## عقد Adapter

- React components لا تستورد Supabase ولا تقرأ الجداول مباشرة.
- جميع عمليات الطالب والموظف تمر عبر `B1UiAdapter`.
- live adapter يبقى fail-closed برسالة `BACKEND_CONTRACT_PENDING`.
- mock لا يعمل إلا في development عند `VITE_B1_UI_MOCK=1`.
- الواجهة تحترم `runtimeAvailable=false` ولا تفعل الخدمات.
- تأكيد الإيرادات لا يرسل actor أو timestamp أو payload مالي.

## عقد الإيرادات

تظهر البطاقة بيانات الطلب المحيطة، المرفقات المسموحة، ملاحظة اختيارية، وزر
«تأكيد استلام الرسوم» فقط. لا يوجد مبلغ أو عملة أو فاتورة أو بوابة دفع أو رقم عملية أو
محفظة أو رصيد أو مسار رفض بسبب عدم السداد.

## الملفات

- `src/components/student-requests/b1/*`
- `src/lib/student-requests/b1-ui/*`
- `src/routes/student.requests.index.tsx`
- `src/routes/student.requests.b1.$service.tsx`
- `src/routes/staff.b1-requests.tsx`
- `src/routeTree.gen.ts` (مولّد آليًا)
- `tests/student-requests/b1-ui/*`
- هذا التقرير

## التحقق

- `bun test tests/student-requests/b1-ui`: PASS، 81 اختبارًا.
- `bun test tests/student-requests`: PASS، 669 اختبارًا.
- `bunx tsc --noEmit`: PASS.
- ESLint المحدد لجميع ملفات UI/adapter/routes/tests في المهمة: PASS بلا أخطاء أو تحذيرات.
- `bun run build`: PASS؛ client وSSR build وTanStack Register validation نجحت.
- `git diff --check`: PASS.
- `bun run lint` الشامل: يفشل بسبب baseline CRLF/Prettier خارج نطاق المهمة
  (مثل `capacitor.config.ts` و`eslint.config.js` و`public/sw.js`). لم تُعدّل تلك الملفات،
  بينما lint النطاق المملوك ناجح.

## الافتراضات والمخاطر والعوائق

- Contract Freeze في `docs/B1-FIVE-SERVICES-BACKEND-CONTRACT-FREEZE-01.md` هو المرجع.
- الخدمات وworkflows ما زالت غير مفعّلة، ولذلك live UI يبقى مخفيًا/fail-closed.
- الربط الحي للـadapter مع RPCs مؤجل لمرحلة Backend integration ولا يتم تخمين signatures.
- HOLD الخاص بـ`confirm_payment` predecessor guard مشكلة Backend ولا يعالجها UI؛ إخفاء الزر
  ليس حماية أمنية.
- لم ينفذ E2E حقيقي بسبب HOLD الأمني.
- عائق lint الشامل خارج نطاق UI فقط؛ لا يمنع صحة build أو lint ملفات المهمة.

## أثر الإنتاج

لا يوجد أثر إنتاجي. لم تُطبّق migrations، ولم تُعدّل بيانات، ولم يحدث Deploy أو Publish أو
تفعيل خدمة.
