-- PRODUCTION-PILOT-01: bulk-import chain + official transcript E2E test scenarios.

INSERT INTO public.pilot_test_scenarios (category, code, name, description, order_index) VALUES
  (
    'imports',
    'IMP_SECTIONS',
    'استيراد مجموعات المقررات',
    'تنزيل القالب → تحقق → تجريبي → استيراد فعلي من /admin/imports (مجموعات المقررات).',
    50
  ),
  (
    'imports',
    'IMP_ENROLLMENTS',
    'استيراد تسجيلات الطلاب',
    'ربط طالب تجريبي بمجموعة عبر استيراد تسجيلات الطلاب (حالة enrolled).',
    51
  ),
  (
    'imports',
    'IMP_GRADES',
    'استيراد درجات معتمدة',
    'استيراد درجات بحالة approved — شرط إصدار السجل الرسمي.',
    52
  ),
  (
    'requests',
    'REQ_OTR_SUBMIT',
    'تقديم طلب سجل أكاديمي رسمي',
    'طالب تجريبي يقدّم official_transcript من بوابة الطالب (النوع مفعّل).',
    53
  ),
  (
    'requests',
    'REQ_OTR_APPROVE',
    'اعتماد طلب السجل وإصدار الوثيقة',
    'من /admin/student-requests → اعتماد → ظهور رقم الوثيقة ورابط العرض.',
    54
  ),
  (
    'documents',
    'DOC_OTR_E2E',
    'السجل الرسمي: PDF + QR + تحقق + بريد',
    'document-view + QR → verify-document + بريد اعتماد بروابط quboolye.com.',
    55
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.pilot_test_results (scenario_id, result)
SELECT s.id, 'not_tested'
FROM public.pilot_test_scenarios s
WHERE s.code IN (
  'IMP_SECTIONS',
  'IMP_ENROLLMENTS',
  'IMP_GRADES',
  'REQ_OTR_SUBMIT',
  'REQ_OTR_APPROVE',
  'DOC_OTR_E2E'
)
AND NOT EXISTS (
  SELECT 1 FROM public.pilot_test_results r WHERE r.scenario_id = s.id
);

INSERT INTO public.pilot_checklist_items (period, code, label, order_index) VALUES
  (
    'morning',
    'M_PILOT_IMPORT',
    'تأكيد جاهزية قوالب الاستيراد (مجموعات → تسجيلات → درجات)',
    5
  ),
  (
    'during_day',
    'D_OTR_E2E',
    'متابعة دورة السجل الأكاديمي الرسمي (طلب → اعتماد → وثيقة)',
    14
  )
ON CONFLICT (code) DO NOTHING;
