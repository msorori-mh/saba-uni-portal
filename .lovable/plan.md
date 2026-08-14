# تطبيق إنتاجي واحد: PORTAL-MOBILE-BIOMETRIC-STEP-UP-01

النطاق: ترقية مسودة الترحيل الوحيدة إلى الإنتاج، ثم فحص قراءة فقط. لا Deploy، لا Publish، لا كتابة بيانات، لا E2E.

## ما سيتم تنفيذه

1. ترقية المسودة `docs/migration-drafts/PORTAL-MOBILE-BIOMETRIC-STEP-UP-01.sql` كما هي دلاليًا إلى ترحيل إنتاجي واحد في `supabase/migrations/`.
2. تطبيق هذا الترحيل على الإنتاج (Migration واحدة فقط في هذه المرحلة).
3. Post-Apply قراءة فقط للتحقق.

## محتوى الترحيل (كما هو مثبت في المصدر)

- جداول: `student_trusted_devices`، `step_up_challenges`، `step_up_proofs` مع GRANTs وRLS.
- دوال الثقة: `register_student_device`، `issue_step_up_challenge`، `mint_step_up_proof`، `consume_step_up_proof` — ممنوحة لـ`service_role` فقط.
- دوال الإبطال: `revoke_student_device`، `revoke_all_student_devices` — تبقى لـ`authenticated`.
- إغلاق مسار التجاوز: `submit_b1_student_request_atomic_core` غير ممنوحة للعميل، وwrapper 5-args محمي، وتوقيع 7-args يتطلب إثباتًا صالحًا لمرة واحدة.

## Preflight قبل التطبيق

- التأكد أن SHA المصدر يطابق `e123bc91...`.
- التأكد أن آخر إدخال في سجل الترحيلات هو `20260813222046` وعدم وجود تطبيق جزئي سابق لهذه المسودة.
- التأكد من عدم وجود كائنات تحمل الأسماء نفسها بعقد مختلف.

## Post-Apply (قراءة فقط)

- سجل الترحيلات يحتوي الإصدار الجديد.
- وجود الجداول الثلاثة وتفعيل RLS وسياساتها.
- توقيعات الدوال كما هي محددة أعلاه.
- `proacl` وhas_function_privilege يثبتان:
  - `register_student_device`: PUBLIC/anon/authenticated = DENY، service_role = ALLOW
  - `issue_step_up_challenge`: PUBLIC/anon/authenticated = DENY، service_role = ALLOW
  - `revoke_student_device` و`revoke_all_student_devices`: authenticated = ALLOW
  - `submit_b1_student_request_atomic_core`: authenticated = DENY
- عدم تأثر `enrollment_certificate` والسجلات المحمية.

## خارج النطاق

- لا Deploy ولا Publish ولا بناء APK في هذه المرحلة.
- لا إنشاء طلبات اختبارية ولا أي كتابة بيانات.
- لا تعديل ترحيلات مطبقة سابقًا.

## القرار المتوقع

عند نجاح كل الفحوصات:

```text
PASS_PRODUCTION_APPLY_MOBILE_STEP_UP_01
READY_FOR_ANDROID_PHYSICAL_RETEST=YES
```

وعند أي فشل أو تطبيق جزئي: توقف فوري بـ `HOLD_PRODUCTION_APPLY_MOBILE_STEP_UP_01_<BLOCKER>` دون reset أو cleanup أو حذف.
