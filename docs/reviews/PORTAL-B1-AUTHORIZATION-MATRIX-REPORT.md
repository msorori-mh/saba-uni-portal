# PORTAL-B1 — مصفوفة التفويض على الإنتاج (تنفيذ 2026-08-11)

المحرك: config-driven بعد Cutover (Legacy runtime = OFF للخدمات الخمس).
الدالة المرجعية: public.can_current_user_act_on_step (SECURITY DEFINER, STABLE, قراءة فقط — لا كتابة إنتاجية).

## نطاق التنفيذ
- الخطوات النشطة للخدمات الخمس: 19
- الفاعلون: 14 جلسة فعلية من 16 (faculty_negative و admin_negative تعذر تسجيل دخولهما)
- الحالات المنفذة: 798 (خطوة × فاعل × إجراء)
- الإجراءات لكل خطوة: action_type المُهيّأ + approve + reject + skip + confirm_payment

## النصف السلبي — PASS
- ALLOW: 0 | DENY: 798 | أخطاء RPC: 0
- لا تجاوز عبر دور خاطئ أو وحدة خاطئة أو إجراء غير مُهيّأ أو حساب طالب/غير مُعيّن.

## النصف الإيجابي — غير منفذ حياً
كل خطوة نشطة مُسندة إلى هوية إنتاجية واحدة (staff_profile أو position_assignment)، لا إلى الحسابات الاختبارية،
ولا تملك الحسابات الاختبارية أي ارتباط تشغيلي (request_processing_assignments = 0).
المُثبت على مستوى العقد لكل الخطوات الـ19:
- وجود tuple (workflow, step, unit, role, action_type) في b1_workflow_runtime_contract_snapshot: 19/19
- عدد المُسندين لكل خطوة = 1 بالضبط: 19/19
- action_type محسوم إلى انتقال واحد عبر resolve_b1_workflow_transition_safe: 19/19

## القرار
HOLD_B1_AUTHORIZATION_MATRIX_POSITIVE_HALF_REQUIRES_ASSIGNED_STAFF_SESSIONS (النصف السلبي: PASS)
