# PORTAL_MOBILE_BIOMETRIC_APP_LOCK_AND_STEP_UP_SECURITY_01

## الطبقات المنفذة (مصدر فقط — لا Production write)

1. **مفتاح الجهاز (Android Keystore)** — `BiometricKeystorePlugin.java`
   - مفتاح EC P-256 يُولَّد داخل Keystore، `setUserAuthenticationRequired(true)` و
     `setInvalidatedByBiometricEnrollment(true)`؛ المفتاح الخاص لا يغادر الجهاز.
   - التوقيع يتم داخل `CryptoObject` المرتبط بنجاح BiometricPrompt، فلا يوجد أي
     متغير `biometricPassed` قابل للتجاوز في JS.
   - `setSecureScreen` (FLAG_SECURE) يُفعَّل أثناء الخلفية/القفل لمنع ظهور
     البيانات في Recent Apps.

2. **قفل التطبيق** — `app-lock-contract.ts` + `MobileAppLockProvider`
   - خلفية ⇒ `covered` (حجب فوري) ⇒ عودة ⇒ `locked` (بصمة مطلوبة).
   - فشل/إلغاء البصمة ⇒ تبقى الحالة `locked` ولا تُعرض بيانات الطالب.
   - القفل غير مفعل ⇒ السلوك الحالي دون تغيير.
   - `KEY_INVALIDATED` (تغير أمان الجهاز) ⇒ إلغاء الثقة المحلية وإعادة التسجيل.

3. **الإعدادات ← الأمان** — `MobileSecuritySettings`
   - تفعيل القفل يتطلب إعادة مصادقة بكلمة المرور + إنشاء مفتاح Keystore.
   - «تسجيل الخروج من هذا الجهاز» و«من جميع الأجهزة».

4. **Step-up قبل العمليات الحساسة** — الخدمات الخمس فقط
    `file_withdrawal`, `enrollment_suspension`, `department_transfer`,
    `final_chance`, `excused_absence`.
    - عرض ملخص الإجراء وآثاره ⇒ قناة native تستخدم بصمة، قناة web تستخدم إعادة
      مصادقة كلمة المرور مباشرةً على الخادم (لا يتم إرسال أي شيء إيجابي للعميل
      قبل التحقق).
    - التحدي (challenge) يُنشأ على الخادم: `beginStepUpChallengeFn` تحسب
      `payload_hash` من المسودة المخزنة، لذا لا يمكن للعميل تمرير hash معدّل.
    - التوقيع (ECDSA P-256) يتم التحقق منه على الخادم في
      `step-up-verify.functions.ts`؛ Postgres لا يملك بدائية ECDSA.
    - إصدار Proof قصير العمر ووحيد الاستخدام عبر `mint_step_up_proof`
      (`service_role` فقط)، ويُستهلك ذريًا داخل نفس معاملة الإرسال.
    - إلغاء البصمة/كلمة المرور ⇒ صفر استدعاءات لـ submit RPC (مثبت باختبار).

## قاعدة البيانات

مسودة واحدة forward-only: `docs/migration-drafts/PORTAL-MOBILE-BIOMETRIC-STEP-UP-01.sql`
(`student_trusted_devices`, `step_up_challenges`, `step_up_proofs`, RPCs،
وoverload لـ `submit_b1_student_request_atomic`):
- الخدمات الحساسة الخمس ترفض أي إرسال بدون `step_up_proof` صالح.
- `consume_step_up_proof` تتحقق من تطابق (user, device, action, request, payload_hash)
  وتُلغي إثبات القناة الويبية (`device_id = 'web'`) دون فحص صف جهاز (لأنه
  مرتبط بإعادة مصادقة كلمة المرور على الخادم).
- `mint_step_up_proof` مقتصرة على `service_role` فقط.
لا تُطبَّق إلا بتصريح إنتاجي صريح.

## الخصوصية

لا تُخزَّن أو تُسجَّل أو تُرسَل أي بصمة أو صورة أو قالب أو درجة تطابق؛ فقط
المفتاح العام. مثبت باختبار مصدر في `tests/mobile/biometric-step-up-security.test.ts`.

## التحقق

- `bunx tsc --noEmit` — PASS
- `bun test tests/mobile` — 77/77 PASS
- `bun test tests/student-requests` — PASS
- `bun run build` — PASS

## البوابة المتبقية

- تطبيق Migration الإنتاجية (بانتظار تصريح `APPROVED_PRODUCTION_APPLY_MOBILE_STEP_UP_01`).
- الاختبار الفيزيائي على جهاز Android بعد بناء APK.
