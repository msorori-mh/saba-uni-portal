# PORTAL-B1 — مصفوفة التفويض على الإنتاج (تنفيذ 2026-08-11)

المحرك: config-driven بعد Cutover (Legacy runtime = OFF للخدمات الخمس).
الدالة المرجعية: public.can_current_user_act_on_step (SECURITY DEFINER, STABLE, read-only).

## نطاق التنفيذ
- الخطوات النشطة للخدمات الخمس: 19
- الفاعلون الذين تم تسجيل دخولهم فعلياً: 14 من 16 (faculty_negative و admin_negative تعذر تسجيل دخولهما)
- عدد الحالات المنفذة: 798 (خطوة × فاعل × إجراء)
- إجراءات مختبرة لكل خطوة: action_type المُهيّأ + approve + reject + skip + confirm_payment

## النتيجة السلبية (NEGATIVE) — PASS
- ALLOW: 0 — DENY: 798 — أخطاء RPC: 0
- لا يوجد أي تجاوز عبر دور خاطئ، وحدة خاطئة، إجراء غير مُهيّأ، أو حساب طالب/غير مُعيّن.
- الحسابات الاختبارية لا تملك أي ارتباط تشغيلي (request_processing_assignments = 0)، لذلك DENY هو السلوك الصحيح المتوقع في كل الحالات.

## النتيجة الإيجابية (POSITIVE) — غير منفذة حياً
كل خطوة نشطة مُسندة إلى هوية إنتاجية واحدة بالضبط (staff_profile أو position_assignment)، وليست إلى الحسابات الاختبارية.
لذلك لا يمكن إثبات ALLOW حياً دون جلسة الموظف المُسند.
ما تم إثباته بدلاً من ذلك على مستوى العقد لجميع الـ19 خطوة:
- وجود tuple (workflow, step, unit, role, action_type) في b1_workflow_runtime_contract_snapshot: 19/19
- عدد المُسندين لكل خطوة = 1 بالضبط: 19/19
- action_type المُهيّأ محسوم إلى انتقال واحد عبر resolve_b1_workflow_transition_safe.

## القرار
HOLD_B1_AUTHORIZATION_MATRIX_POSITIVE_HALF_REQUIRES_ASSIGNED_STAFF_SESSIONS
(النصف السلبي: PASS كامل)
