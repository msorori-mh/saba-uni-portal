# BATCH B1 — Shared Foundation Source 01

## القرار

`PASS_BATCH_B1_SHARED_FOUNDATION_SOURCE_READY` ضمن نطاق SOURCE-ONLY. الأساس قابل للتسليم للوكلاء، لكنه لا يعني تفعيل runtime أو جاهزية إنتاجية للخدمات.

## الملفات والرموز

- `src/lib/student-requests/request-service-adapter.ts`: أضيفت `B1_SERVICE_ADAPTERS`, `B1_WORKFLOWS`, `B1_FEE_POLICIES`, عقود reference/detail/submit، `canActOnB1Step`, `resolveDirectDepartmentHead`، وعقد `chance_type`.
- `src/lib/student-requests/request-type-registry.ts`: أضيف alias `extra_chance -> final_chance` وcanonical definition، وصححت metadata المجانية/الوثائق لخدمات B1 دون لمس `enrollment_certificate`.
- `src/lib/student-requests/request-workflow-preview-registry.ts`: getters تعرض workflows الخمس من المصدر المشترك؛ تبقى مصفوفة الأنواع الرسمية الثمانية متوافقة رجعياً.
- `src/lib/admin-request-workflow-rpc.ts`: أضيف `clear` و`apply_decision` ونتائجهما إلى أنواع المصدر فقط.
- `src/lib/student-requests/request-form-registry.ts` و`DynamicStudentRequestForm.tsx`: extension points لبيانات مرجعية ديناميكية، تبعية الفصل للعام، loading/error fail-closed، بلا placeholder IDs لخدمات B1 المعدلة.
- `student-request-submit-contract.ts` و`student-request-rpc.ts`: خطة persistence اختيارية وقدرة RPC معلنة `available:false` بلا تغيير توقيع RPC الحالي.
- `docs/migration-drafts/REQUEST-B1-SHARED-FOUNDATION-SOURCE-01.sql`: Draft توثيقي فقط للإرسال الذري، vocabulary، وحسم رؤساء الأقسام.
- `tests/student-requests/request-b1-shared-foundation-source-01.test.ts`: 44 اختبار source-contract.

## canonical والـlegacy

الأكواد المعيارية: `enrollment_suspension`, `excused_absence`, `department_transfer`, `final_chance`, `file_withdrawal`. القراءة والترشيح يدعمان `transfer` و`extra_chance`. لا rename ولا data normalization. الكتابة المستقبلية تختار stored code خادمياً؛ runtime غير متاح في هذه المرحلة.

## Architecture والنماذج والمرجع

`RequestServiceAdapter` يفصل form/reference validation/detail binding/submit/detail loader/summary extension. كل detail binding يمنع client writes. resolver state لا يسمح بالإرسال إلا عند `ready`، والقيمة يجب أن تكون ضمن الخيارات الفعلية وغير placeholder. مرفق الغياب يجب أن يحمل file name وstorage path حقيقيين؛ لم تتغير storage policy.

## Workflows والسياسات

- الوقف: `initial_review -> manager_approval -> registrar_apply`، مجاني بلا مالية/وثيقة/أرشفة artifact.
- الغياب: `student_affairs_intake -> manager_review -> record_apply`، مجاني مع مرفق، بلا مالية/وثيقة.
- السحب: intake ثم library ثم labs ثم activities ثم finance clearance ثم registrar apply ثم archive، متسلسل بلا دفع/وثيقة/storage.
- التحويل والفرصة النهائية: `fee_assessment` قبل `payment_confirmation` الخارجي اليدوي؛ بلا مبلغ/عملة/gateway، والتفعيل محجوز حتى اعتماد `fee_type.code`.

## Action/outcome

المصدر يدعم mapping صريحاً: `review->reviewed`, `approve->approved`, `clear->cleared`, `apply_decision->applied`, `archive->archived`. Runtime المطبق لا يدعم الإضافتين بعد؛ الـDraft يوثق التغيير ولا يدعي تطبيقه.

## Submit والتعيين المباشر

خطة الإرسال تتطلب transaction وvalidator قبل workflow وrollback وsubmit/resubmit، وتبقى اختيارية للخدمات القديمة و`runtimeAvailable:false`. حسم رئيس القسم يتطلب رئيساً فعالاً وحيداً مطابقاً للقسم وfaculty profile؛ يفشل عند الغياب/التعدد/عدم التطابق ولا يعود إلى role pool.

## chance_type

طبقة التوافق تعرف `additional_exam`, `grade_recovery`, `final_chance`, `additional_chance` وتحافظ على القيمة round-trip بلا mapping. التفعيل محجوز تحت `NEEDS_USER_DECISION_FOR_ACADEMIC_MAPPING`.

## التفويض

لكل خطوة اختبر: المكلّف الصحيح ALLOW؛ غير المكلّف، wrong unit/role/action، unassigned، admin/registrar/dean bypass، وpredecessor غير المكتمل DENY. هذه source-contract tests وليست runtime E2E.

## التحقق

- Baseline قبل التعديل: `259 pass / 0 fail`، Typecheck PASS.
- بعد التعديل: `303 pass / 0 fail`، منها 44 اختباراً جديداً؛ Typecheck PASS.
- Build: PASS (exit 0). `git diff --check`: PASS. تولد فرق آلي غير لازم في `routeTree.gen.ts` وأزيل سطرياً لأنه لم تتغير routes.

## القرارات المفتوحة وما يبقى للوكلاء

- `fee_type.code` للتحويل والفرصة النهائية: غير مخترع، ويلزم قرار معتمد.
- mapping الأكاديمي لقيم `chance_type`: يلزم قرار مستخدم.
- يلزم migration لاحقة مراجعة لتفاصيل الخدمات، RPC الذري، `clear/apply_decision`، workflows والتفويض؛ ثم RPC matrix في بيئة آمنة.
- وكلاء الخدمات يضيفون contracts/validators/resolvers التفصيلية ويربطونها بالـadapter دون تعديل ملفات مشتركة بالتوازي.

## أثر الإنتاج والمحظورات

لا أثر إنتاجي. لم ينفذ Push أو PR أو Supabase أو Migration أو database write أو Deploy/Publish، ولم يعدل main أو Worktrees الوكلاء أو migration مطبقة أو `student_visible` أو `enrollment_certificate`، ولم يخترع fee code أو chance mapping.
