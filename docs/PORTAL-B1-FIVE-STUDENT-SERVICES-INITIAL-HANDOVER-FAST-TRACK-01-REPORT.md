# PORTAL-B1-FIVE-STUDENT-SERVICES-INITIAL-HANDOVER-FAST-TRACK-01

## النطاق والقرار المصدري

النطاق محصور في `enrollment_suspension` و`excused_absence` و`file_withdrawal`
و`department_transfer` و`final_chance`. لا Deploy أو Publish أو Production SQL أو
Migration apply أو workflow activation أو `student_visible` أو بيانات إنتاجية.

**HOLD_B1_FIVE_SERVICES_SOURCE_BLOCKER** — التغيير نفسه اجتاز البوابات المحلية،
لكن Web CI أنهى الوظائف العشر بالفشل قبل تنفيذ أي خطوة (`steps=[]`) ودون logs؛
لا يسمح بالدمج حتى تصبح بوابة GitHub Actions خضراء.

## الإصلاح الحرج

- F1: أضيفت `review` و`clear` و`apply_decision` و`confirm_payment` فقط، مع الحفاظ
  على الأفعال الـ11 السابقة ومنها `archive`. لا تعديل على enrollment certificate.
- F2: تعريف v3 اللاحق لـ`can_current_user_act_on_step` حافظ على exact-assignee
  وpredecessor لكنه أسقط `current_user_has_exact_processing_binding`. التعريف
  forward-only النهائي يعيد فرض binding نشط بدأ فعلياً ولم ينتهِ لنفس الوحدة
  والدور، دون admin/dean bypass.
- المسودة الجديدة واحدة ومعاملتها fail-closed:
  `docs/migration-drafts/B1-FIVE-SERVICES-ACTOR-ACTION-ASSIGNMENT-HARDENING-01.sql`.

## التحقق

- PostgreSQL `17.10` معزول: المسودات الـ19 بالترتيب ثم الإصلاح؛
  `63 PASS + 12 STATIC + 0 FAIL`.
- مصفوفة العقد: `22 PASS / 0 FAIL`.
- اختبارات student requests: `561 PASS / 0 FAIL`.
- TypeScript: PASS.
- Build + routeTree validation: PASS.
- `git diff --check`: PASS.
- مراجعة نطاق الإصلاح: CRITICAL=0 / HIGH=0 / MEDIUM=0.
- `bun test tests/` الكامل يعيد exit 1 في Worker/PDF خارج هذا المسار؛ تبقى Web CI
  النهائية ملزمة ولا يسمح بالدمج على CI أحمر.

## حزمة الإنتاج المختصرة — تعليمات مستقبلية فقط

هذه الحزمة **غير مفوضة للتنفيذ الآن**:

1. ثبت `SOURCE_SHA` من commit مدموج أخضر.
2. نفذ Deploy/Publish بتفويض منفصل، ثم أثبت `DEPLOYED_SHA = SOURCE_SHA`.
3. تحقق من SHA-256 والـpreflight، ثم طبق Migration واحدة فقط.
4. بعد كل ملف شغّل verifier وفحص السجلات المحمية؛ عند `FAIL` أو `PARTIAL` أو
   `AMBIGUOUS` أوقف السلسلة فوراً. لا batch ولا auto-continue.
5. أضف مسودة الإصلاح بعد البنود الـ19 فقط، ثم verifier المصفوفة.
6. بتفويض مستقل فعّل workflow خدمة واحدة بدءاً بـ`enrollment_suspension`؛ نفذ
   direct-RPC authorization قبل visibility وauthenticated E2E قبل الإظهار.
7. الخدمات المجانية الثلاث لا تنشئ بيانات دفع. التحويل والفرصة النهائية يستخدمان
   تأكيد الدفع الجامعي الخارجي اليدوي فقط.

## أثر الإنتاج والقرار النهائي

أثر الإنتاج: **صفر**. الخدمات الخمس ما زالت غير مطبقة وغير مفعلة وغير ظاهرة.

**HOLD_INITIAL_HANDOVER_STUDENT_SERVICES_BLOCKED** — يلزم تفويض منفصل للـDeploy،
ثم لكل Migration، ثم workflow activation والاختبارات، ثم `student_visible=true`
لكل خدمة نجحت وحدها.
