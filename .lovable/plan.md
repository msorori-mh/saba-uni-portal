# PORTAL_MOBILE_BIOMETRIC_APP_LOCK_AND_STEP_UP_SECURITY_01

قفل التطبيق بالتحقق الحيوي + Step-up إلزامي على مستوى الخادم للخدمات الحساسة الخمس.
النطاق: Android الآن فقط (الكود محايد للمنصة ليعمل على iOS لاحقًا).
الإنتاج: مسودات SQL واختبارات فقط — توقف عند بوابة `APPROVED_PRODUCTION_APPLY` منفصلة.

## 1. طبقة الجهاز (Keystore)

- إضافة اعتماديات Capacitor: مكوّن تحقق حيوي (BiometricAuth) + تخزين آمن مدعوم بـ Android Keystore.
- ملف واحد جديد `src/lib/native/biometrics.ts` هو المكان الوحيد المسموح فيه باستدعاء المكوّنات الأصلية:
  - `isBiometricAvailable()`، `getBiometryState()` (نوع، مسجّل، هل تغيّرت بصمات الجهاز).
  - `authenticate(reasonAr)` يرجع نجاح/إلغاء/فشل/غير متاح.
  - قراءة/كتابة/مسح سر الجهاز داخل التخزين الآمن المقيّد بالبصمة.
- لا تُخزّن أي بصمة أو قالب أو صورة في أي مكان — فقط سر جهاز عشوائي داخل Keystore.
- عند تغيّر تسجيل البصمات على الجهاز (`biometryChanged`) يُمسح السر محليًا ويُبطل الجهاز خادميًا.

## 2. قفل التطبيق (App Lock)

- مزود جديد `MobileAppLockProvider` يُركّب داخل `src/routes/mobile.student.tsx` فقط.
- الحالة محفوظة في تفضيل محلي «مفعّل/غير مفعّل» + تحقق فعلي عند كل فتح.
- يستمع لأحداث `App` من Capacitor (`appStateChange`, `pause`, `resume`) وأيضًا `visibilitychange` للويب داخل الشل:
  - عند الذهاب للخلفية: تفعيل حجب فوري (Overlay غير قابل للتجاوز) قبل الالتقاط.
  - عند العودة: شاشة قفل تطلب التحقق الحيوي؛ لا يُعرض أي محتوى طالب خلفها.
- الفشل/الإلغاء ⇒ يبقى الحجب مع خيارين فقط: إعادة المحاولة، أو تسجيل الخروج.
- إخفاء المحتوى في Recent Apps: تفعيل `FLAG_SECURE` في `MainActivity` عبر سكربت الهوية/التخصيص في `android/` (يمنع لقطات الشاشة وصور المبدّل).
- عندما تكون الميزة غير مفعّلة أو المنصة ليست Native ⇒ لا تغيير في السلوك الحالي إطلاقًا.

## 3. الإعدادات ← قسم «الأمان»

في `src/routes/mobile.student.settings.tsx` (بدون المساس بتغيير كلمة المرور):
- مفتاح «قفل التطبيق بالبصمة/التحقق الحيوي» — التفعيل يستدعي تحققًا حيويًا ناجحًا + تسجيل الجهاز خادميًا.
- حالة الجهاز (نوع التحقق، تاريخ التسجيل) — بدون أي بيانات حيوية.
- «تسجيل الخروج من هذا الجهاز» (`signOut({ scope: 'local' })` + إبطال الجهاز).
- «تسجيل الخروج من جميع الأجهزة» (`signOut({ scope: 'global' })` + إبطال كل أجهزة الطالب).

## 4. Step-up قبل الإرسال الحساس

الخدمات: `file_withdrawal`, `enrollment_suspension`, `department_transfer`, `final_chance`, `excused_absence`.
- عقد جديد `src/lib/security/step-up-contract.ts`: قائمة الخدمات، نصوص ملخص الأثر بالعربية، سياسة صلاحية الإثبات (≤ 120 ثانية، استعمال واحد).
- مكوّن `StepUpConfirmDialog`: يعرض ملخص الإجراء وآثاره ← زر «تأكيد بالبصمة».
- تسلسل الإرسال داخل `B1StudentRequestForm` (مسار الجوال):
  1. طلب تحدٍّ من الخادم (challenge).
  2. تحقق حيوي محلي يفتح سر الجهاز في Keystore.
  3. توقيع/HMAC للتحدي + هوية العملية (نوع الخدمة + معرّف الطلب).
  4. تبادل التوقيع مقابل `proof token` قصير العمر أحادي الاستخدام.
  5. استدعاء RPC الإرسال مرة واحدة فقط مع الإثبات.
- الإلغاء أو الفشل في أي خطوة ⇒ صفر استدعاءات لـ RPC الإرسال.
- لا يوجد أي متغير واجهة مثل `biometricPassed` يتحكم في القرار؛ القرار النهائي خادمي.

## 5. الخادم (مسودات SQL فقط — لا تطبيق)

مسودات تحت `docs/migration-drafts/`:
1. `MOBILE-DEVICE-TRUST-01.sql`
   - `public.student_trusted_devices` (student_user_id, device_id, platform, secret_hash/encrypted secret، biometry_kind، revoked_at, last_verified_at) + GRANT + RLS (الطالب يقرأ أجهزته فقط).
   - `public.step_up_challenges` (device, nonce, action_code, target_ref, expires_at, consumed_at) + GRANT + RLS مغلقة (الوصول عبر دوال SECURITY DEFINER فقط).
   - RPCs: `register_student_device`, `revoke_student_device`, `revoke_all_student_devices`, `issue_step_up_challenge`, `verify_step_up_assertion` (تُصدر إثباتًا أحادي الاستخدام).
2. `MOBILE-STEP-UP-ENFORCEMENT-01.sql`
   - تعديل مسار إرسال B1 ليقبل معامل إثبات اختياري، ويُلزمه بصرامة عندما يكون الطلب من جهاز مسجّل/native.
   - رفض الإثبات المنتهي أو المستهلك أو غير المطابق للعملية أو للجهاز أو للمستخدم.
   - عدم منح أي bypass جديد: كل فحوص التفويض الحالية تبقى كما هي وتُنفَّذ أولًا.
3. سياسة عدم التسجيل: لا أسرار ولا بيانات حيوية في `audit_logs`/`analytics` — يُسجّل فقط: نجح/فشل، معرّف الجهاز، نوع العملية، الوقت.

## 6. الاختبارات والتحقق

- `tests/mobile/mobile-app-lock.test.ts`: خلفية⇒قفل، فشل⇒لا بيانات، نجاح⇒فتح، ميزة معطّلة⇒سلوك حالي، تغيّر أمان الجهاز⇒إبطال الثقة.
- `tests/mobile/step-up-submit.test.ts`: إلغاء ⇒ 0 استدعاء RPC، نجاح ⇒ استدعاء واحد فقط، إثبات منتهٍ/معاد الاستخدام ⇒ رفض.
- `tests/security/`: عدم تسريب أي حقل حيوي، وثبات مصفوفة التفويض السلبية الحالية.
- تشغيل: `bunx tsc --noEmit`، `bun test tests/mobile`، `bun test tests/student-requests`، `bun run build`.
- تقرير في `docs/reviews/PORTAL-MOBILE-BIOMETRIC-STEP-UP-01.md` يشمل الملفات والاختبارات والمخاطر ومسودات SQL.

## 7. التوقف

بعد اكتمال المصدر والاختبارات: **HOLD** عند بوابة `APPROVED_PRODUCTION_APPLY_MOBILE_STEP_UP_01`.
الاختبار الفيزيائي على جهاز Android والقرار النهائي `PASS` يتمّان بعد تطبيق مسودتي SQL بتصريح منفصل.
