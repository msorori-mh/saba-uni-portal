# إغلاق فجوة تسجيل الثقة (Trust Enrollment) — مصدر فقط

الهدف: منع أي استدعاء مباشر من `authenticated` لدالتي تسجيل الجهاز وإصدار التحدي، مع بقاء المسار الرسمي عبر Server Functions التي تعيد المصادقة وتبني payload hash خادميًا. لا كتابة إنتاجية في هذه المرحلة.

## الوضع الحالي (تم التحقق منه)

- مسودة الترحيل `docs/migration-drafts/PORTAL-MOBILE-BIOMETRIC-STEP-UP-01.sql` ما زالت تمنح `authenticated` صلاحية تنفيذ:
  - `issue_step_up_challenge(text, text, uuid, text)`
  - `register_student_device(text, text, text, text)`
- كود العميل لم يعد يستدعي أيًا منهما مباشرة (المسار الوحيد هو `registerTrustedDeviceFn` و`beginStepUpChallengeFn` في `src/lib/security/device-trust.functions.ts`، وكلاهما يستخدم إعادة مصادقة بكلمة المرور وعميل الخادم المميز).
- إبطال أجهزة الطالب (`revoke_student_device`, `revoke_all_student_devices`) ما زال مستدعى من العميل ويجب أن يبقى ممنوحًا لـ`authenticated`.

## التغييرات

1. تعديل كتلة الصلاحيات في مسودة الترحيل:
   - `REVOKE ALL ... FROM PUBLIC, anon, authenticated` لكل من `register_student_device` و`issue_step_up_challenge`.
   - `GRANT EXECUTE ... TO service_role` لهما فقط.
   - إبقاء منح `revoke_student_device` و`revoke_all_student_devices` لـ`authenticated` كما هي.
2. توسيع مصفوفة التحقق في `scripts/step-up-direct-rpc-bypass/harness.ts`:
   - حالتان جديدتان تُنفَّذان بدور `authenticated`: استدعاء مباشر لـ`register_student_device` واستدعاء مباشر لـ`issue_step_up_challenge` — كلاهما يجب أن يفشل بـ`permission denied`.
   - إضافة `authenticated_register_device` و`authenticated_issue_challenge` إلى أهداف فحص الصلاحيات (متوقع `false`)، و`service_role` لهما (متوقع `true`).
   - توسيع لقطة `proacl` لتشمل اسمي الدالتين والتأكد من خلوهما من `authenticated=X` و`anon=X`.
3. تحديث `tests/mobile/step-up-direct-rpc-bypass.test.ts` بحالات:
   - `AUTHENTICATED_REGISTER_DEVICE_DIRECT = DENY`
   - `AUTHENTICATED_ISSUE_CHALLENGE_DIRECT = DENY`
   - تأكيد أن دوال الإبطال تبقى متاحة لـ`authenticated`.
4. اختبار سلوكي لطبقة الخادم يثبت:
   - `SERVER_REAUTH_DEVICE_REGISTRATION = PASS` (فشل إعادة المصادقة يمنع كتابة صف الجهاز).
   - `SERVER_AUTHORITATIVE_CHALLENGE = PASS` (payload hash والـnonce ومدة الصلاحية تُبنى خادميًا، ولا تُقبل من المدخلات).
5. تحديث وثيقة الأدلة `docs/reviews/PORTAL-MOBILE-STEP-UP-DIRECT-RPC-BYPASS-CLOSURE-01.md` بمقطع Trust Enrollment وproacl الجديد.

## التحقق

- `bunx tsc --noEmit`
- `bun test tests/mobile`
- `bun test tests/student-requests`
- `bun run build`
- `git diff --check`

## خارج النطاق

- لا تطبيق Migration إنتاجية، ولا Publish/Deploy، ولا تعديل بيانات إنتاجية.
- لا تغيير في منطق الإرسال أو عقد 5/7 args المغلق مسبقًا.

## القرار المتوقع

عند نجاح كل البنود: `PASS_MOBILE_STEP_UP_TRUST_ENROLLMENT_NO_DIRECT_RPC` مع تسليم proacl، ثم انتظار `APPROVED_PRODUCTION_APPLY_MOBILE_STEP_UP_01`.
