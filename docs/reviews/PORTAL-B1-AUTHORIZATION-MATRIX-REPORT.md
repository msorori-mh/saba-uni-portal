# PORTAL-B1 — مصفوفة التفويض على الإنتاج (2026-08-11)

المحرك: config-driven بعد Cutover (Legacy runtime = OFF للخدمات الخمس).
الدالة المرجعية: public.can_current_user_act_on_step (SECURITY DEFINER, STABLE) — قراءة فقط، بلا أي كتابة إنتاجية.

## الجولة 1 — الحزمة السلبية (حسابات TEST_ONLY)
- الحالات: 798 (19 خطوة نشطة × 14 فاعل × 5 إجراءات)
- ALLOW: 0 | DENY: 798 | أخطاء: 0
- النتيجة: PASS — لا تجاوز عبر دور خاطئ أو وحدة خاطئة أو إجراء غير مُهيّأ أو حساب طالب/غير مُعيّن.

## الجولة 2 — الحزمة الإيجابية + السلبية المتقاطعة (الموظفون المُسنَدون فعلياً)
الفاعلون: toaiman, mohammed, yasmin, hitham, naji, رئيس القسم المصدر, العميد (7 جلسات ناجحة).
- الحالات: 931 | أخطاء RPC: 0
- ALLOW متوقّع (المُسنَد + الإجراء المُهيّأ): 18 → تحقق 18 (**100%**)
- ALLOW غير متوقّع: 0 (**0**)
- أي إجراء غير الإجراء المُهيّأ للخطوة يُرفض حتى للمُسنَد نفسه (approve/reject/skip/confirm_payment/review/clear/apply_decision مُختبرة كلها).
- الاستثناء الوحيد: خطوة target_department_head_approval — تعذّر تسجيل دخول المُسنَد (osamah.saif@usr.edu.ye: Invalid login credentials)، فلم تُختبر إيجابياً؛ وسلبياً DENY لجميع الفاعلين الآخرين.

## القرار
PASS_B1_RPC_AUTHORIZATION_MATRIX_POSITIVE_AND_NEGATIVE
(معلّق جزئياً: خطوة واحدة من 19 بانتظار كلمة مرور صالحة لحساب رئيس القسم المستهدف)
