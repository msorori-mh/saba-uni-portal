خطة: مراجعة جاهزية تطبيق Step-Up Biometric للإنتاج

القرار الحالي: PASS_SOURCE_READY_HOLD_PRODUCTION_APPLY

الهدف: إغلاق مراجعة Migration + تقرير الاختبارات، والتأكد من جاهزية كل الشروط قبل إصدار تصريح الإنتاج التالي.

---

## الحالة الموثقة للمصدر

1. **Keystore + biometric binding**: مُنفّذ في `BiometricKeystorePlugin.java`.
   - EC P-256 key داخل Android Keystore.
   - `setUserAuthenticationRequired(true)` و `setInvalidatedByBiometricEnrollment(true)`.
   - لا يوجد `biometricPassed` boolean في JS.

2. **App Lock + FLAG_SECURE**: مُنفّذ في `MobileAppLockProvider` و `app-lock-contract.ts`.
   - خلفية ⇒ covered، عودة ⇒ locked.
   - `FLAG_SECURE` أثناء covered/locked.

3. **Step-up موقّع ومربوط بـ payload hash**: مُنفّذ في `step-up-client.ts` + `step-up-verify.functions.ts`.
   - رسالة التوقيع: `version|challenge|nonce|user|device|action|request|payload_hash|expiry`.
   - التحقق من ECDSA P-256 يتم على الخادم (WebCrypto) لأن Postgres لا يدعم ECDSA.

4. **الاستهلاك الذري داخل معاملة الإرسال**: مُنفّذ في overload `submit_b1_student_request_atomic`.
   - `consume_step_up_proof` يُستدعى داخل نفس الدالة قبل submit الأساسي.

5. **Migration**: مسودة واحدة فقط في `docs/migration-drafts/PORTAL-MOBILE-BIOMETRIC-STEP-UP-01.sql`.
   - Production write: 0 حتى الآن.

6. **Physical Android test**: معلّق حتى التطبيق الإنتاجي.

---

## مهمة المراجعة: Migration

- التأكد من صحة البنية: `student_trusted_devices`, `step_up_challenges`, `step_up_proofs`.
- التحقق من GRANTs و RLS policies.
- التحقق من أن `mint_step_up_proof` متاحة فقط لـ `service_role`.
- التحقق من أن `consume_step_up_proof` و overload `submit_b1_student_request_atomic` تُبعد `PUBLIC`, `anon`, `authenticated` عن minting.
- التأكد من عدم وجود أي تخزين لبيانات بيومترية (صورة/قالب/درجة تطابق) في الجداول أو الدوال.
- التأكد من forward-only nature: لا DROP، لا TRUNCATE، لا DELETE، لا UPDATE على auth.users.

---

## مهمة المراجعة: الاختبارات والتقرير

- `bunx tsgo --noEmit` → PASS.
- `bun test tests/mobile` → 77/77 PASS.
- `bun test tests/student-requests` → 1074/1075 PASS (الفشل الوحيد سابق لهذه المهمة وغير متعلق بها).
- `bun run build` → PASS.
- مراجعة `docs/reviews/PORTAL-MOBILE-BIOMETRIC-STEP-UP-01.md` للتأكد من تغطية كل البنود.

---

## البوابة التالية: تصريح الإنتاج

لا يُنفذ أي Production write قبل إصدار تصريح منفصل:

**APPROVED_PRODUCTION_APPLY_MOBILE_STEP_UP_01**

التصريح المطلوب يجب أن يتضمن صراحةً:
- اسم Migration الواحدة المُصرَّح بتطبيقها.
- التأكد من أن كل اختبارات المصدر PASS.
- الموافقة على تغييرات قاعدة البيانات الموضحة في Migration draft.

---

## ما بعد التطبيق الإنتاجي

بمجرد تطبيق Migration:

1. بناء APK/AAB للاختبار الفيزيائي.
2. اختبار الخدمات الخمس على جهاز Android حقيقي:
   - `file_withdrawal`
   - `enrollment_suspension`
   - `department_transfer`
   - `final_chance`
   - `excused_absence`
3. التحقق من السيناريوهات الأمنية:
   - إلغاء البصمة (cancel) → لا يحدث submit.
   - إعادة استخدام proof مستهلك (replay) → مرفوض.
   - proof منتهي الصلاحية (expired) → مرفوض.
   - تغيير payload بعد التوقيع → proof غير متطابق.
4. التحقق من قفل التطبيق بعد الخلفية والحجب في Recent Apps.
5. فحص عدم وجود بيانات بيومترية في logs/database.
6. بعد نجاح كل ما سبق: الانتقال إلى بوابة Go-Live النهائية.

---

## القرار المتوقع

إذا نجحت المراجعة: إصدار التصريح التالي.

إذا وجد عائق تقني: القرار يكون HOLD_SOURCE_REVIEW_MOBILE_STEP_UP_<BLOCKER> بدون Production write.
