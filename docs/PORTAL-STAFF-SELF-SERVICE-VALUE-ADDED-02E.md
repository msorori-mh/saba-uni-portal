# PORTAL_STAFF_SELF_SERVICE_VALUE_ADDED_02E

المرحلة 02E مبنية على خط الأساس المعتمد 02A/02B/02D، وهي **مصدر فقط** ولم تُطبَّق على أي قاعدة إنتاجية.

## نطاق التسليم

| الوحدة | الجداول | RPCs الأساسية |
| --- | --- | --- |
| الإفادات وشهادات الخبرة + التحقق بـ QR | `staff_issued_documents` | `staff_service_request_employment_statement`, `staff_service_issue_document`, `staff_service_revoke_issued_document`, `staff_service_verify_issued_document` |
| تقييم الأداء السنوي | `staff_performance_cycles`, `staff_performance_evaluations` | `staff_service_upsert_evaluation_draft`, `staff_service_finalize_evaluation`, `staff_service_acknowledge_evaluation` |
| الحضور والانصراف | `staff_attendance_days` | `staff_service_get_attendance_summary`, `staff_service_list_attendance_month_report` |
| التكليفات والعمل الإضافي | `staff_overtime_claims`, `staff_overtime_financial_impact` | `staff_service_submit_overtime_claim`, `staff_service_decide_overtime_claim` |
| التدريب والتطوير | `staff_training_courses`, `staff_training_enrollments` | `staff_service_request_training_enrollment`, `staff_service_decide_training_enrollment`, `staff_service_complete_training_enrollment` |
| الترقيات والتسويات | `staff_promotion_cases`, `staff_promotion_financial_impact` | `staff_service_open_promotion_case`, `staff_service_update_promotion_case`, `staff_service_list_promotion_financial_projection` |
| إخلاء الطرف الإلكتروني | `staff_clearance_cases`, `staff_clearance_checkpoints` | `staff_service_open_clearance_case`, `staff_service_list_assigned_clearance_checkpoints`, `staff_service_decide_clearance_checkpoint`, `staff_service_complete_clearance_case` |
| سجل تدقيق الخدمات المضافة | `staff_value_added_audit_events` | يُكتب داخل كل RPC (append-only) |

الهجرة الوحيدة: `supabase/migrations/20260822040000_staff_self_service_value_added_02e.sql`.

## قرارات الأمان

1. **رمز التحقق**: عشوائي مبني على CSPRNG (256 بت)، يُخزَّن بصمة SHA-256 فقط، ويُعاد نصه مرة واحدة لموظف الموارد البشرية المُصدِر لإدراجه في QR. لا يُكتب في أي سجل تدقيق.
2. **السطح العام الوحيد**: `staff_service_verify_issued_document` هو الدالة الوحيدة الممنوحة لـ`anon`، وتعيد بيانات أصالة مختزلة فقط. المحاولات المجهولة الصحيحة شكلياً تُجمّع في عدّاد ساعي واحد، والتحقق الناجح يُنشئ بحد أقصى حدثاً واحداً لكل وثيقة/ساعة؛ لا تُحفظ المادة الخام أو بصمتها.
3. **الأثر المالي**: لا يرى Finance صفوف `staff_overtime_claims` أو `staff_promotion_cases`. الدالتان الضيقتان `staff_service_list_overtime_financial_projection` و`staff_service_list_promotion_financial_projection` تعيدان المبالغ وحالة التسوية فقط، دون هوية الملف أو الأسباب أو الملاحظات أو المرفقات.
4. **إخلاء الطرف**: قرار كل مرحلة مقصور على مالكها بتعيين فعلي نشط، دون استخدام `staff_service_has_role` (لأنها تُرجع true للمدير العام لأي دور). وجود عهدة غير مُرجَعة يمنع الإنهاء، والتجاوز حصري للمدير العام مع سبب إلزامي ومُدوَّن.
5. **تقييم الأداء**: يمنع الاعتماد الذاتي، ولا يرى الموظف إلا التقييم المعتمد، والإقرار غير قابل للتكرار.
6. **الحضور**: بيانات مستوردة وموثوقة، لا يكتبها العميل، والملخص الشهري محكوم بنطاق (الذات / المدير المباشر / الموارد البشرية / المدير العام).
7. **سجل التدقيق**: UPDATE و DELETE مرفوضان بمُشغِّلات 02A، والقراءة مقصورة على الفاعل نفسه أو الموارد البشرية/المدير العام.
8. **الصلاحيات**: بعد `revoke all` تُمنح لـ`authenticated` أعمدة القراءة الآمنة فقط. لذلك لا يكفي تجاوز المحول البرمجي لكشف `verification_token_digest` أو مسارات/بصمات الشهادات أو مفاتيح idempotency أو metadata التدقيق. كل الكتابات عبر RPC، و`service_role` لعمليات التكامل.
9. **التدريب**: مسار الشهادة وبصمة SHA-256 زوج ذري؛ يرفض الخادم الرابط العام، المسار المطلق، traversal، القيمة الجزئية أو البصمة غير الصحيحة. الحاوية ثابتة `staff-service-private`.
10. **هوية الاستدعاء**: مساعدا الملكية والنطاق يقبلان نتيجة صحيحة فقط عندما يساوي actor الممرر `auth.uid()`، لمنع تحويلهما إلى identity oracle.

## مصفوفة الأدوار النهائية

| المجال | Employee | Direct Manager | HR | Finance | Administrator |
| --- | --- | --- | --- | --- | --- |
| الوثائق الرسمية | طلب/قراءة الخاصة | — | اعتماد/إصدار/إلغاء | — | كامل |
| تقييم الأداء | قراءة المعتمد والإقرار | إنشاء/تحرير المسودة ضمن النطاق واعتمادها | إشراف واعتماد | — | كامل |
| الحضور | تفاصيل وملخص الذات | تقرير القسم | تقرير شامل | ممنوع | شامل |
| العمل الإضافي | إنشاء وقراءة الذات | قرار المرحلة الأولى | قرار المرحلة الثانية | إسقاط مالي ضيق فقط | كامل |
| التدريب | طلب وقراءة الذات | قراءة النطاق | اعتماد وإكمال بمرفق خاص | ممنوع | كامل |
| الترقيات | قراءة الحالة الخاصة | — | فتح وتحديث قانوني للحالة | إسقاط مالي ضيق فقط | كامل |
| إخلاء الطرف | متابعة الحالة الخاصة | نقطة المدير فقط | فتح الحالة ونقطة HR/الإكمال | نقطة Finance المعيّنة فقط | نقاط الإدارة والتجاوز الموثق |
| التدقيق | أحداث الفاعل نفسه | أحداث الفاعل نفسه | إشراف | أحداث الفاعل نفسه | شامل |

## الواجهات

- `src/components/staff-showcase/StaffValueAddedEmployeePanel.tsx` — واجهة الموظف (RTL، Cairo، fail-closed).
- `src/components/staff-showcase/StaffValueAddedAdminPanel.tsx` — الإشراف الإداري، تُبنى أقسامه من مسبار الصلاحيات المنطقي `staff_service_get_value_added_capabilities`.
- لوحة الإصدار تستخدم مكتبة `qrcode` لتوليد QR قياسي من رابط مطلق، ولا تعرض الرمز الخام كنص، وتزيله من الذاكرة عند الإغلاق.
- `src/routes/verify-document.tsx` — صفحة التحقق العامة (`/verify-document?token=…`)، `noindex`، بدون أي بيانات حساسة.
- `src/lib/staff-self-service-value-added.ts` — محول قراءة/كتابة بإسقاطات صريحة وتحقق Zod ورسائل عربية آمنة.

## التفعيل الفاشل-مغلق

العلم `portalFeatures.staffSelfServiceValueAdded = false`. لا تظهر أي واجهة 02E قبل تطبيق الهجرة واجتياز بوابة الإصدار.

## الاختبارات

`tests/staff-self-service/staff-self-service-value-added-02e.test.ts`:

- عقد مصدري (اعتماديات، RLS، البصمة بدل النص الصريح، منح anon، التدقيق، بوابة العلم).
- بوابة تشغيل PostgreSQL 17 ثنائية الخلفية (محلي أو Docker) تطبّق 02A + 02B + 02D + 02E ثم `tests/staff-self-service/pg17/30-verifier-02e.sql` وتتطلب `PASS_STAFF_SELF_SERVICE_PG17_VALUE_ADDED_02E`.
- المصفوفة الوظيفية تثبت: منع الهوية البديلة، منع Finance من الصفوف الأساسية، إسقاطاته الضيقة، تقييم draft→finalized، مرفق التدريب الخاص، انتقالات الترقية، إنشاء خمس نقاط إخلاء ذرياً، نطاق تقرير الحضور، وتحجيم probes.

لا يُسجّل هذا المستند نتيجة PASS قبل اكتمال Web CI على commit المرحلة. البيئة المصدرية لا تدّعي تطبيق الهجرة أو تفعيل العلم أو نجاح تكاملات HR/Finance الخارجية.
