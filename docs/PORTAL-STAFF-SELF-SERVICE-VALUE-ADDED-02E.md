# PORTAL_STAFF_SELF_SERVICE_VALUE_ADDED_02E

المرحلة 02E مبنية على خط الأساس المعتمد 02A/02B/02D، وهي **مصدر فقط** ولم تُطبَّق على أي قاعدة إنتاجية.

## نطاق التسليم

| الوحدة | الجداول | RPCs الأساسية |
| --- | --- | --- |
| الإفادات وشهادات الخبرة + التحقق بـ QR | `staff_issued_documents` | `staff_service_request_employment_statement`, `staff_service_issue_document`, `staff_service_revoke_issued_document`, `staff_service_verify_issued_document` |
| تقييم الأداء السنوي | `staff_performance_cycles`, `staff_performance_evaluations` | `staff_service_finalize_evaluation`, `staff_service_acknowledge_evaluation` |
| الحضور والانصراف | `staff_attendance_days` | `staff_service_get_attendance_summary` |
| التكليفات والعمل الإضافي | `staff_overtime_claims`, `staff_overtime_financial_impact` | `staff_service_submit_overtime_claim`, `staff_service_decide_overtime_claim` |
| التدريب والتطوير | `staff_training_courses`, `staff_training_enrollments` | `staff_service_request_training_enrollment`, `staff_service_decide_training_enrollment`, `staff_service_complete_training_enrollment` |
| الترقيات والتسويات | `staff_promotion_cases`, `staff_promotion_financial_impact` | — (قراءة محكومة بـ RLS) |
| إخلاء الطرف الإلكتروني | `staff_clearance_cases`, `staff_clearance_checkpoints` | `staff_service_decide_clearance_checkpoint`, `staff_service_complete_clearance_case` |
| سجل تدقيق الخدمات المضافة | `staff_value_added_audit_events` | يُكتب داخل كل RPC (append-only) |

الهجرة الوحيدة: `supabase/migrations/20260822040000_staff_self_service_value_added_02e.sql`.

## قرارات الأمان

1. **رمز التحقق**: عشوائي مبني على CSPRNG (256 بت)، يُخزَّن بصمة SHA-256 فقط، ويُعاد نصه مرة واحدة لموظف الموارد البشرية المُصدِر لإدراجه في QR. لا يُكتب في أي سجل تدقيق.
2. **السطح العام الوحيد**: `staff_service_verify_issued_document` هو الدالة الوحيدة الممنوحة لـ`anon`، وتعيد بيانات أصالة مختزلة فقط (الجهة، نوع الوثيقة، الرقم المرجعي، اسم مُقنَّع، التواريخ) وتوثّق محاولة التحقق.
3. **الأثر المالي**: القيم المالية للتكليفات والترقيات في جداول منفصلة تُقرأ من الشؤون المالية/المدير العام فقط — الفصل حدّ جدولي وليس إخفاءً في الواجهة.
4. **إخلاء الطرف**: قرار كل مرحلة مقصور على مالكها بتعيين فعلي نشط، دون استخدام `staff_service_has_role` (لأنها تُرجع true للمدير العام لأي دور). وجود عهدة غير مُرجَعة يمنع الإنهاء، والتجاوز حصري للمدير العام مع سبب إلزامي ومُدوَّن.
5. **تقييم الأداء**: يمنع الاعتماد الذاتي، ولا يرى الموظف إلا التقييم المعتمد، والإقرار غير قابل للتكرار.
6. **الحضور**: بيانات مستوردة وموثوقة، لا يكتبها العميل، والملخص الشهري محكوم بنطاق (الذات / المدير المباشر / الموارد البشرية / المدير العام).
7. **سجل التدقيق**: UPDATE و DELETE مرفوضان بمُشغِّلات 02A، والقراءة مقصورة على الفاعل نفسه أو الموارد البشرية/المدير العام.
8. **الصلاحيات**: `revoke all` ثم `grant select` فقط لجداول `authenticated`، وكل الكتابات عبر RPC، و`service_role` لعمليات الخدمة.

## الواجهات

- `src/components/staff-showcase/StaffValueAddedEmployeePanel.tsx` — واجهة الموظف (RTL، Cairo، fail-closed).
- `src/components/staff-showcase/StaffValueAddedAdminPanel.tsx` — الإشراف الإداري، تُبنى أقسامه من مسبار الصلاحيات المنطقي `staff_service_get_value_added_capabilities`.
- `src/routes/verify-document.tsx` — صفحة التحقق العامة (`/verify-document?token=…`)، `noindex`، بدون أي بيانات حساسة.
- `src/lib/staff-self-service-value-added.ts` — محول قراءة/كتابة بإسقاطات صريحة وتحقق Zod ورسائل عربية آمنة.

## التفعيل الفاشل-مغلق

العلم `portalFeatures.staffSelfServiceValueAdded = false`. لا تظهر أي واجهة 02E قبل تطبيق الهجرة واجتياز بوابة الإصدار.

## الاختبارات

`tests/staff-self-service/staff-self-service-value-added-02e.test.ts`:

- عقد مصدري (اعتماديات، RLS، البصمة بدل النص الصريح، منح anon، التدقيق، بوابة العلم).
- بوابة تشغيل PostgreSQL 17 ثنائية الخلفية (محلي أو Docker) تطبّق 02A + 02B + 02D + 02E ثم `tests/staff-self-service/pg17/30-verifier-02e.sql` وتتطلب `PASS_STAFF_SELF_SERVICE_PG17_VALUE_ADDED_02E`.
